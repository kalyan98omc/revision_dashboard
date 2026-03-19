import { useState, useEffect, useCallback } from "react";

const API_BASE = 'http://localhost:5000/api/v1';

function apiFetch(path, options = {}) {
    const token = localStorage.getItem('access_token');
    const headers = { ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (options.body && !(options.body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.body);
    }
    return fetch(`${API_BASE}${path}`, { ...options, headers }).then(async r => {
        const data = await r.json();
        if (!r.ok) throw data;
        return data;
    });
}

// ─── NEET-PG SUBJECTS ────────────────────────────────────────────────────────
const NEET_SUBJECTS = [
    { name: "Anatomy", emoji: "🦴", color: "#F5A623" },
    { name: "Physiology", emoji: "💓", color: "#4ECDC4" },
    { name: "Biochemistry", emoji: "🧬", color: "#9B8FFF" },
    { name: "Pathology", emoji: "🔬", color: "#FF6B6B" },
    { name: "Pharmacology", emoji: "💊", color: "#52D78A" },
    { name: "Microbiology", emoji: "🦠", color: "#60A5FA" },
    { name: "Forensic Medicine", emoji: "⚖️", color: "#A78BFA" },
    { name: "Community Medicine", emoji: "🏥", color: "#34D399" },
    { name: "Medicine", emoji: "🩺", color: "#F97316" },
    { name: "Surgery", emoji: "🔪", color: "#EF4444" },
    { name: "OBG", emoji: "🤰", color: "#EC4899" },
    { name: "Pediatrics", emoji: "👶", color: "#8B5CF6" },
    { name: "Ophthalmology", emoji: "👁️", color: "#06B6D4" },
    { name: "ENT", emoji: "👂", color: "#14B8A6" },
    { name: "Dermatology", emoji: "🧴", color: "#F59E0B" },
    { name: "Psychiatry", emoji: "🧠", color: "#6366F1" },
    { name: "Orthopedics", emoji: "🦿", color: "#78716C" },
    { name: "Anesthesia", emoji: "😴", color: "#0EA5E9" },
    { name: "Radiology", emoji: "📡", color: "#84CC16" },
];


// ─── ADMIN PANEL ─────────────────────────────────────────────────────────────
export function AdminPanel() {
    const [tab, setTab] = useState("overview");
    const [msg, setMsg] = useState(null);

    // Data states
    const [stats, setStats] = useState(null);
    const [subjects, setSubjects] = useState([]);
    const [users, setUsers] = useState([]);
    const [features, setFeatures] = useState([]);
    const [models, setModels] = useState([]);
    const [documents, setDocuments] = useState([]);

    // PYQ State
    const [selectedSubject, setSelectedSubject] = useState("");
    const [pyqText, setPyqText] = useState("");

    // Model Draft State
    const [newModel, setNewModel] = useState({ name: "", base_model: "gpt-4o", system_prompt: "" });

    useEffect(() => {
        const load = async () => {
            try {
                if (tab === "overview" && !stats) setStats(await apiFetch('/admin/dashboard'));
                if (tab === "subjects" && !subjects.length) setSubjects((await apiFetch('/admin/subjects')).subjects);
                if (tab === "users" && !users.length) setUsers((await apiFetch('/admin/users')).users);
                if (tab === "features" && !features.length) setFeatures((await apiFetch('/admin/features')).features);
                if (tab === "models" && !models.length) setModels((await apiFetch('/admin/models')).variants);
                if (tab === "documents" && !documents.length) setDocuments((await apiFetch('/admin/documents')).documents);
                if (tab === "pyqs" && !subjects.length) setSubjects((await apiFetch('/admin/subjects')).subjects);
            } catch (e) { showMsg(e.error || "Loading failed", true); }
        };
        load();
    }, [tab]);

    const showMsg = (text, isErr = false) => {
        setMsg({ text, isErr });
        setTimeout(() => setMsg(null), 3000);
    };

    // Form handlers
    const uploadDoc = async (file, subject_id) => {
        if (!file) return;
        const fd = new FormData();
        fd.append("file", file);
        if (subject_id) fd.append("subject_id", subject_id);
        try {
            const doc = await apiFetch('/admin/documents/upload', { method: 'POST', body: fd });
            setDocuments(prev => [doc, ...prev]);
            showMsg(`Uploaded: ${doc.filename}`);
        } catch (e) { showMsg(e.error || 'Upload failed', true); }
    };

    const importPyqs = async () => {
        try {
            const questions = JSON.parse(pyqText);
            const res = await apiFetch('/admin/pyqs/import', {
                method: 'POST', body: { subject_id: selectedSubject, questions: Array.isArray(questions) ? questions : [questions] }
            });
            showMsg(`Imported ${res.imported_count} PYQs`);
            setPyqText("");
        } catch (e) { showMsg(e.error || 'Invalid JSON format', true); }
    };

    const toggleFeature = async (id, enabled) => {
        try {
            const updated = await apiFetch(`/admin/features/${id}`, { method: 'PUT', body: { enabled } });
            setFeatures(features.map(f => f.id === id ? updated : f));
        } catch (e) { showMsg(e.error, true); }
    };

    const createModel = async () => {
        if (!newModel.name) return;
        try {
            const model = await apiFetch('/admin/models', { method: 'POST', body: newModel });
            setModels([model, ...models]);
            setNewModel({ name: "", base_model: "gpt-4o", system_prompt: "" });
            showMsg("Model variant created");
        } catch (e) { showMsg(e.error, true); }
    };

    const deployModel = async (id) => {
        try {
            setModels(models.map(m => m.id === id ? { ...m, status: 'training' } : m));
            const deployed = await apiFetch(`/admin/models/${id}/deploy`, { method: 'POST' });
            setModels(models.map(m => m.id === id ? deployed : m));
            showMsg("Model deployed successfully!");
        } catch (e) {
            showMsg(e.error || "Deploy failed", true);
            setModels(models.map(m => m.id === id ? { ...m, status: 'draft' } : m));
        }
    };

    const uploadModelFile = async (variantId, file) => {
        if (!file) return;
        const fd = new FormData();
        fd.append("file", file);
        try {
            await apiFetch(`/admin/models/${variantId}/files`, { method: 'POST', body: fd });
            showMsg(`File attached to model`);
            // Refresh model list to get updated file count
            setModels((await apiFetch('/admin/models')).variants);
        } catch (e) { showMsg(e.error || 'Upload failed', true); }
    };

    const StatCard = ({ title, value, color }) => (
        <div className="card" style={{ flex: 1, minWidth: 200 }}>
            <div className="card-body" style={{ padding: "20px" }}>
                <div style={{ fontSize: 13, color: "var(--text-3)", fontWeight: 600, marginBottom: 8, textTransform: "uppercase" }}>{title}</div>
                <div style={{ fontSize: 32, fontWeight: 700, color: `var(--${color})`, fontFamily: "var(--font-display)" }}>{value}</div>
            </div>
        </div>
    );

    return (
        <div className="page-enter">
            <div className="section-header">
                <div>
                    <div className="section-title">Admin Dashboard</div>
                    <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>Manage the entire NEET-PG application ecosystem</div>
                </div>
            </div>

            <div className="pill-tabs" style={{ marginBottom: 20, flexWrap: "wrap" }}>
                {[
                    ["overview", "📊 Overview"], ["subjects", "📚 Subjects"], ["users", "👥 Users"],
                    ["features", "⚙️ Features"], ["models", "🤖 RAG Training"],
                    ["documents", "📄 Documents"], ["pyqs", "📝 PYQs"]
                ].map(([id, label]) => (
                    <button key={id} className={`pill-tab ${tab === id ? "active" : ""}`} onClick={() => setTab(id)}>{label}</button>
                ))}
            </div>

            {msg && (
                <div style={{ padding: "10px 16px", borderRadius: 10, marginBottom: 16, fontSize: 13, background: msg.isErr ? "rgba(255,107,107,0.1)" : "rgba(82,215,138,0.1)", color: msg.isErr ? "var(--rose)" : "var(--green)", border: `1px solid ${msg.isErr ? "rgba(255,107,107,0.2)" : "rgba(82,215,138,0.2)"}`, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>{msg.isErr ? "✗" : "✓"}</span>
                    <span>{msg.text}</span>
                </div>
            )}

            {tab === "overview" && stats && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
                    <StatCard title="Total Users" value={stats.total_users} color="text" />
                    <StatCard title="Active (24h)" value={stats.active_users} color="green" />
                    <StatCard title="Topics Mastered" value={stats.topics_mastered} color="amber" />
                    <StatCard title="Total Quizzes" value={stats.total_quizzes} color="sky" />
                    <StatCard title="Avg Score" value={`${stats.avg_score}%`} color="indigo" />
                    <StatCard title="RAG Models" value={stats.model_variants} color="rose" />
                </div>
            )}

            {tab === "subjects" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
                    {subjects.map(s => (
                        <div key={s.id} className="card" style={{ overflow: "hidden" }}>
                            <div style={{ height: 4, background: s.color_hex || s.color }} />
                            <div className="card-body" style={{ padding: 16, textAlign: "center" }}>
                                <div style={{ fontSize: 32, marginBottom: 8 }}>{s.icon_emoji || s.emoji}</div>
                                <div style={{ fontWeight: 700, fontSize: 15, color: "var(--text)", marginBottom: 8 }}>{s.name}</div>
                                <div style={{ display: "flex", justifyContent: "center", gap: 12, fontSize: 12, color: "var(--text-3)" }}>
                                    <span>📝 {s.topic_count || 0} topics</span>
                                    <span>📋 {s.pyq_count || 0} PYQs</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {tab === "users" && (
                <div className="card">
                    <div className="card-body" style={{ padding: 0 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--ink-2)" }}>
                                    <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, color: "var(--text-3)" }}>User</th>
                                    <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, color: "var(--text-3)" }}>Role</th>
                                    <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, color: "var(--text-3)" }}>Status</th>
                                    <th style={{ padding: "12px 16px", textAlign: "left", fontSize: 13, color: "var(--text-3)" }}>Joined</th>
                                </tr>
                            </thead>
                            <tbody>
                                {users.map(u => (
                                    <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                                        <td style={{ padding: "12px 16px" }}>
                                            <div style={{ fontWeight: 600, fontSize: 14 }}>{u.display_name}</div>
                                            <div style={{ fontSize: 12, color: "var(--text-3)" }}>{u.email}</div>
                                        </td>
                                        <td style={{ padding: "12px 16px" }}>
                                            <span style={{ padding: "4px 8px", background: "var(--surface-3)", borderRadius: 6, fontSize: 11, textTransform: "capitalize" }}>{u.role}</span>
                                        </td>
                                        <td style={{ padding: "12px 16px" }}>
                                            <span style={{ padding: "4px 8px", background: u.status === "active" ? "rgba(82,215,138,0.1)" : "rgba(255,107,107,0.1)", color: u.status === "active" ? "var(--green)" : "var(--rose)", borderRadius: 6, fontSize: 11, fontWeight: 600 }}>{u.status}</span>
                                        </td>
                                        <td style={{ padding: "12px 16px", fontSize: 13, color: "var(--text-3)" }}>{new Date(u.created_at).toLocaleDateString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {tab === "features" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
                    {features.map(f => (
                        <div key={f.id} className="card">
                            <div className="card-body" style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <div>
                                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{f.label}</div>
                                    <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>Page: {f.page_name}</div>
                                </div>
                                <label style={{ display: "flex", alignItems: "center", cursor: "pointer" }}>
                                    <input type="checkbox" checked={f.enabled} onChange={e => toggleFeature(f.id, e.target.checked)} style={{ display: "none" }} />
                                    <div style={{ width: 44, height: 24, background: f.enabled ? "var(--green)" : "var(--surface-3)", borderRadius: 12, position: "relative", transition: "0.2s" }}>
                                        <div style={{ width: 20, height: 20, background: "#fff", borderRadius: 10, position: "absolute", top: 2, left: f.enabled ? 22 : 2, transition: "0.2s" }} />
                                    </div>
                                </label>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {tab === "models" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div className="card">
                        <div className="card-header"><div className="card-title">Create Model Variant</div></div>
                        <div className="card-body" style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)", marginBottom: 4, display: "block" }}>Variant Name</label>
                                <input className="input" value={newModel.name} onChange={e => setNewModel({ ...newModel, name: e.target.value })} placeholder="e.g. Intensive Revision V1" style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--ink-2)", color: "var(--text)" }} />
                            </div>
                            <div style={{ width: 150 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-3)", marginBottom: 4, display: "block" }}>Base Model</label>
                                <select className="input" value={newModel.base_model} onChange={e => setNewModel({ ...newModel, base_model: e.target.value })} style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--ink-2)", color: "var(--text)" }}>
                                    <option value="gpt-4o">GPT-4o</option>
                                    <option value="gpt-4-turbo-preview">GPT-4 Turbo</option>
                                    <option value="gpt-3.5-turbo">GPT-3.5</option>
                                </select>
                            </div>
                            <button className="btn btn-primary" onClick={createModel} disabled={!newModel.name}>Create Draft</button>
                        </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
                        {models.map(m => (
                            <div key={m.id} className="card" style={{ borderLeft: `4px solid ${m.status === 'ready' ? 'var(--green)' : m.status === 'training' ? 'var(--amber)' : 'var(--text-3)'}` }}>
                                <div className="card-body" style={{ padding: 20 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                                        <div>
                                            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 8 }}>
                                                {m.name}
                                                <span style={{ padding: "2px 8px", background: "var(--surface-3)", borderRadius: 4, fontSize: 11, fontFamily: "var(--font-mono)" }}>{m.base_model}</span>
                                            </div>
                                            <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 4 }}>ID: {m.id.substring(0, 8)}... · Status: <b>{m.status.toUpperCase()}</b></div>
                                        </div>
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <button className="btn" disabled={m.status === 'training'} onClick={() => document.getElementById(`file-upload-${m.id}`).click()} style={{ fontSize: 13, padding: "6px 12px", border: "1px dashed var(--border)", background: "var(--surface)", cursor: "pointer" }}>
                                                📎 Attach File
                                            </button>
                                            <input id={`file-upload-${m.id}`} type="file" style={{ display: "none" }} onChange={e => uploadModelFile(m.id, e.target.files[0])} />

                                            <button className="btn btn-primary" onClick={() => deployModel(m.id)} disabled={m.status === 'training' || m.status === 'ready'} style={{ fontSize: 13, padding: "6px 12px" }}>
                                                {m.status === 'training' ? "Deploying..." : "Deploy"}
                                            </button>
                                        </div>
                                    </div>

                                    <div style={{ display: "flex", gap: 32, fontSize: 13, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
                                        <div>
                                            <div style={{ color: "var(--text-3)", marginBottom: 4 }}>Attached Files</div>
                                            <div style={{ fontWeight: 600 }}>{m.file_count || 0} files</div>
                                        </div>
                                        <div>
                                            <div style={{ color: "var(--text-3)", marginBottom: 4 }}>Vector Store ID</div>
                                            <div style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>{m.vector_store_id || "None"}</div>
                                        </div>
                                        <div>
                                            <div style={{ color: "var(--text-3)", marginBottom: 4 }}>Assistant ID</div>
                                            <div style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>{m.assistant_id || "None"}</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {tab === "documents" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div className="card">
                        <div className="card-header"><div className="card-title">Upload Global Document</div></div>
                        <div className="card-body">
                            <div style={{ marginBottom: 16 }}>
                                <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--ink-2)", color: "var(--text)", fontSize: 14 }}>
                                    <option value="">All Subjects</option>
                                    {subjects.map(s => <option key={s.id} value={s.id}>{s.icon_emoji} {s.name}</option>)}
                                </select>
                            </div>
                            <div onDrop={e => { e.preventDefault(); uploadDoc(e.dataTransfer.files[0], selectedSubject); }} onDragOver={e => e.preventDefault()}
                                style={{ border: `2px dashed var(--border)`, borderRadius: 16, padding: 40, textAlign: "center", cursor: "pointer" }}
                                onClick={() => document.getElementById("admin-file-input").click()}>
                                <div style={{ fontSize: 40, marginBottom: 8 }}>📄</div>
                                <div style={{ fontSize: 15, fontWeight: 600 }}>Drop files here or click to upload</div>
                                <input id="admin-file-input" type="file" style={{ display: "none" }} onChange={e => uploadDoc(e.target.files[0], selectedSubject)} />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {tab === "pyqs" && (
                <div className="card">
                    <div className="card-header"><div className="card-title">Import Previous Year Questions</div></div>
                    <div className="card-body">
                        <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--ink-2)", color: "var(--text)", fontSize: 14, marginBottom: 16 }}>
                            <option value="">Select Subject *</option>
                            {subjects.map(s => <option key={s.id} value={s.id}>{s.icon_emoji} {s.name}</option>)}
                        </select>
                        <textarea value={pyqText} onChange={e => setPyqText(e.target.value)} rows={10} placeholder={`[{"question":"What is...","options":["A","B","C","D"],"correct_idx":0,"explanation":"...","year":2023}]`} style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--ink-2)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font-mono)", marginBottom: 16 }} />
                        <button className="btn btn-primary" onClick={importPyqs} disabled={!selectedSubject || !pyqText.trim()}>Import PYQs</button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── STUDENT ONBOARDING ──────────────────────────────────────────────────────
export function StudentOnboarding({ onComplete }) {
    const [step, setStep] = useState(1);
    const [form, setForm] = useState({
        goal: "secure_seat", self_level: "average", hours_per_day: 6, prep_months: 6, overall_strength: 5, subject_strengths: {}
    });
    const [saving, setSaving] = useState(false);

    const saveProfile = async () => {
        setSaving(true);
        try {
            await apiFetch('/revision/profile', { method: 'POST', body: form });
            onComplete?.();
        } catch (e) { console.error(e); }
        setSaving(false);
    };

    return (
        <div className="page-enter" style={{ maxWidth: 640, margin: "0 auto" }}>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🎯</div>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: 24, color: "var(--text)", marginBottom: 8 }}>NEET-PG Preparation Setup</h2>
                <p style={{ color: "var(--text-3)", fontSize: 14 }}>Step {step} of 3 — Let's personalize your study plan</p>
                <div style={{ display: "flex", gap: 4, justifyContent: "center", marginTop: 12 }}>
                    {[1, 2, 3].map(s => <div key={s} style={{ width: 40, height: 4, borderRadius: 2, background: s <= step ? "var(--amber)" : "var(--surface-3)" }} />)}
                </div>
            </div>

            <div className="card">
                <div className="card-body" style={{ padding: 28 }}>
                    {step === 1 && (<>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 20 }}>🎯 Your Goal</h3>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {[["top_100", "🏆 Top 100 Rank", "Aim for the best — requires intense preparation"],
                            ["top_1000", "⭐ Top 1000 Rank", "Strong competitive position"],
                            ["secure_seat", "✅ Secure a Seat", "Focus on passing with a good score"]
                            ].map(([val, label, desc]) => (
                                <button key={val} onClick={() => setForm(f => ({ ...f, goal: val }))}
                                    style={{ textAlign: "left", padding: "16px 20px", borderRadius: 12, border: `2px solid ${form.goal === val ? "var(--amber)" : "var(--border)"}`, background: form.goal === val ? "var(--amber-soft)" : "var(--ink-2)", cursor: "pointer", transition: "all 0.2s" }}>
                                    <div style={{ fontWeight: 600, fontSize: 15, color: "var(--text)" }}>{label}</div>
                                    <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>{desc}</div>
                                </button>
                            ))}
                        </div>

                        <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginTop: 28, marginBottom: 20 }}>🧠 Self Assessment</h3>
                        <div style={{ display: "flex", gap: 10 }}>
                            {[["bright", "💡 Bright"], ["average", "📊 Average"], ["weak", "📈 Needs Work"]].map(([val, label]) => (
                                <button key={val} onClick={() => setForm(f => ({ ...f, self_level: val }))}
                                    style={{ flex: 1, padding: "14px", borderRadius: 12, border: `2px solid ${form.self_level === val ? "var(--amber)" : "var(--border)"}`, background: form.self_level === val ? "var(--amber-soft)" : "var(--ink-2)", cursor: "pointer", textAlign: "center", fontWeight: 600, fontSize: 14, color: "var(--text)" }}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </>)}

                    {step === 2 && (<>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 20 }}>⏰ Study Schedule</h3>
                        <div className="form-field" style={{ marginBottom: 20 }}>
                            <label style={{ fontSize: 13, fontWeight: 600 }}>Hours per day: <span style={{ color: "var(--amber)" }}>{form.hours_per_day}h</span></label>
                            <input type="range" min="1" max="16" step="0.5" value={form.hours_per_day}
                                onChange={e => setForm(f => ({ ...f, hours_per_day: parseFloat(e.target.value) }))}
                                style={{ width: "100%", accentColor: "var(--amber)" }} />
                        </div>
                        <div className="form-field" style={{ marginBottom: 20 }}>
                            <label style={{ fontSize: 13, fontWeight: 600 }}>Months until exam: <span style={{ color: "var(--amber)" }}>{form.prep_months}</span></label>
                            <input type="range" min="1" max="24" value={form.prep_months}
                                onChange={e => setForm(f => ({ ...f, prep_months: parseInt(e.target.value) }))}
                                style={{ width: "100%", accentColor: "var(--amber)" }} />
                        </div>
                        <div className="form-field">
                            <label style={{ fontSize: 13, fontWeight: 600 }}>Overall strength: <span style={{ color: "var(--amber)" }}>{form.overall_strength}/10</span></label>
                            <input type="range" min="1" max="10" value={form.overall_strength}
                                onChange={e => setForm(f => ({ ...f, overall_strength: parseInt(e.target.value) }))}
                                style={{ width: "100%", accentColor: "var(--amber)" }} />
                        </div>
                    </>)}

                    {step === 3 && (<>
                        <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 20 }}>📊 Subject-wise Strength (1-10)</h3>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxHeight: 400, overflow: "auto" }}>
                            {NEET_SUBJECTS.map(s => (
                                <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--surface)", borderRadius: 8, border: "1px solid var(--border)" }}>
                                    <span>{s.emoji}</span>
                                    <span style={{ fontSize: 12, flex: 1, color: "var(--text)" }}>{s.name}</span>
                                    <input type="number" min="1" max="10" value={form.subject_strengths[s.name] || 5}
                                        onChange={e => setForm(f => ({ ...f, subject_strengths: { ...f.subject_strengths, [s.name]: parseInt(e.target.value) || 5 } }))}
                                        style={{ width: 44, padding: "4px 6px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--ink-2)", color: "var(--text)", textAlign: "center", fontSize: 13 }} />
                                </div>
                            ))}
                        </div>
                    </>)}

                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 28 }}>
                        {step > 1 ? <button className="btn btn-ghost" onClick={() => setStep(s => s - 1)}>← Back</button> : <div />}
                        {step < 3 ? (
                            <button className="btn btn-primary" onClick={() => setStep(s => s + 1)}>Next →</button>
                        ) : (
                            <button className="btn btn-primary" onClick={saveProfile} disabled={saving}>
                                {saving ? "Saving..." : "Generate My Study Plan 🚀"}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── STUDY PLAN VIEW ─────────────────────────────────────────────────────────
export function StudyPlanView() {
    const [plan, setPlan] = useState(null);
    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState(null);

    useEffect(() => {
        apiFetch('/revision/profile').then(p => { setProfile(p); if (p.study_plan?.subjects) setPlan(p.study_plan); });
        apiFetch('/revision/study-plan').then(p => setPlan(p)).catch(() => { }).finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="page-enter" style={{ textAlign: "center", padding: 60 }}><div className="spinner" style={{ width: 32, height: 32, margin: "0 auto" }} /></div>;

    if (!plan || !plan.subjects) return (
        <div className="page-enter" style={{ textAlign: "center", padding: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>No Study Plan Yet</div>
            <div style={{ color: "var(--text-3)", marginBottom: 20 }}>Complete onboarding to generate your personalized plan</div>
        </div>
    );

    const maxHours = Math.max(...plan.subjects.map(s => s.hours_per_week), 1);

    return (
        <div className="page-enter">
            <div className="section-header">
                <div>
                    <div className="section-title">📋 My Study Plan</div>
                    <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>AI-personalized based on your goals and PYQ patterns</div>
                </div>
            </div>

            {plan.revision_strategy && (
                <div style={{ background: "var(--amber-soft)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: 12, padding: 16, marginBottom: 20, fontSize: 13, color: "var(--text)" }}>
                    <strong>💡 Strategy:</strong> {plan.revision_strategy}
                </div>
            )}

            <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header"><div className="card-title">Subject-wise Time Allocation</div></div>
                <div className="card-body">
                    {plan.subjects.map((s, i) => {
                        const neet = NEET_SUBJECTS.find(n => n.name === s.subject_name) || {};
                        return (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < plan.subjects.length - 1 ? "1px solid var(--border)" : "none" }}>
                                <span style={{ fontSize: 20, width: 28 }}>{neet.emoji || "📚"}</span>
                                <div style={{ width: 140, fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{s.subject_name}</div>
                                <div style={{ flex: 1, background: "var(--surface)", borderRadius: 6, height: 24, overflow: "hidden" }}>
                                    <div style={{ width: `${(s.hours_per_week / maxHours) * 100}%`, height: "100%", background: `linear-gradient(90deg, ${neet.color || "var(--amber)"}, ${neet.color || "var(--amber)"}88)`, borderRadius: 6, display: "flex", alignItems: "center", paddingLeft: 8, fontSize: 11, fontWeight: 600, color: "#fff", minWidth: 40 }}>
                                        {s.hours_per_week}h/wk
                                    </div>
                                </div>
                                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: "var(--amber-soft)", color: "var(--amber)", fontWeight: 600 }}>P{s.priority}</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {plan.daily_schedule && (
                <div className="card">
                    <div className="card-header"><div className="card-title">📅 Recommended Daily Schedule</div></div>
                    <div className="card-body">
                        {plan.daily_schedule.map((slot, i) => (
                            <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: i < plan.daily_schedule.length - 1 ? "1px solid var(--border)" : "none" }}>
                                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--amber)", width: 120, fontWeight: 600 }}>{slot.time_slot}</span>
                                <span style={{ fontSize: 13, color: "var(--text)" }}>{slot.activity}</span>
                                {slot.subject && <span style={{ fontSize: 11, color: "var(--text-3)", marginLeft: "auto" }}>{slot.subject}</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── TOPIC ASSESSMENT ────────────────────────────────────────────────────────
export function TopicAssessmentView() {
    const [progress, setProgress] = useState(null);
    const [activeTopic, setActiveTopic] = useState(null);
    const [diagnosticQs, setDiagnosticQs] = useState([]);
    const [answers, setAnswers] = useState({});
    const [evaluation, setEvaluation] = useState(null);
    const [trainingQ, setTrainingQ] = useState(null);
    const [trainAnswer, setTrainAnswer] = useState("");
    const [trainResult, setTrainResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [view, setView] = useState("subjects");

    useEffect(() => {
        apiFetch('/revision/progress').then(setProgress).catch(() => { });
    }, []);

    const startDiagnostic = async (topicId) => {
        setLoading(true); setView("diagnostic"); setEvaluation(null);
        try {
            const result = await apiFetch(`/revision/assess/${topicId}`, { method: 'POST' });
            setActiveTopic(result.topic);
            setDiagnosticQs(result.questions || []);
            setAnswers({});
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const submitDiagnostic = async () => {
        if (!activeTopic) return;
        setLoading(true);
        const answerList = diagnosticQs.map((q, i) => ({
            question_id: q.id || i + 1, question: q.question, answer: answers[i] || ""
        }));
        try {
            const result = await apiFetch(`/revision/assess/${activeTopic.id}/submit`, { method: 'POST', body: { answers: answerList } });
            setEvaluation(result);
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const startTraining = async () => {
        if (!activeTopic) return;
        setView("training"); setTrainResult(null); setTrainAnswer("");
        setLoading(true);
        try {
            const q = await apiFetch(`/revision/train/${activeTopic.id}`);
            setTrainingQ(q);
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const submitTrainAnswer = async () => {
        if (!activeTopic || !trainingQ) return;
        setLoading(true);
        try {
            const result = await apiFetch(`/revision/train/${activeTopic.id}/submit`, {
                method: 'POST', body: { question: trainingQ.question, answer: trainAnswer, question_type: trainingQ.question_type }
            });
            setTrainResult(result);
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const nextTrainQ = async () => {
        setTrainResult(null); setTrainAnswer("");
        setLoading(true);
        try { setTrainingQ(await apiFetch(`/revision/train/${activeTopic.id}`)); } catch (e) { console.error(e); }
        setLoading(false);
    };

    if (view === "training") {
        return (
            <div className="page-enter" style={{ maxWidth: 680, margin: "0 auto" }}>
                <button className="btn btn-ghost" onClick={() => setView("subjects")} style={{ marginBottom: 16 }}>← Back to Topics</button>
                <div className="card">
                    <div className="card-header">
                        <div className="card-title">Training: {activeTopic?.name}</div>
                        <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 20, background: "var(--amber-soft)", color: "var(--amber)", fontWeight: 600, textTransform: "uppercase" }}>
                            {trainingQ?.question_type || "SAQ"}
                        </span>
                    </div>
                    <div className="card-body">
                        {loading ? <div className="spinner" style={{ width: 24, height: 24, margin: "20px auto" }} /> : trainingQ?.mastered ? (
                            <div style={{ textAlign: "center", padding: 32 }}>
                                <div style={{ fontSize: 48 }}>🎉</div>
                                <h3 style={{ color: "var(--text)", marginTop: 12 }}>Topic Mastered!</h3>
                                <p style={{ color: "var(--text-3)", marginTop: 8 }}>{trainingQ.message}</p>
                                <button className="btn btn-primary" onClick={() => setView("subjects")} style={{ marginTop: 20 }}>Back to Topics</button>
                            </div>
                        ) : (
                            <>
                                <div style={{ fontSize: 15, color: "var(--text)", lineHeight: 1.7, marginBottom: 20, padding: 16, background: "var(--surface)", borderRadius: 12 }}>{trainingQ?.question}</div>
                                {trainingQ?.question_type === "mcq" && trainingQ?.options ? (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                                        {trainingQ.options.map((opt, i) => (
                                            <button key={i} onClick={() => setTrainAnswer(String(i))}
                                                className={`q-option ${trainAnswer === String(i) ? "selected" : ""}`}>
                                                <div className="q-option-letter">{String.fromCharCode(65 + i)}</div>{opt}
                                            </button>
                                        ))}
                                    </div>
                                ) : (
                                    <textarea value={trainAnswer} onChange={e => setTrainAnswer(e.target.value)} rows={trainingQ?.question_type === "laq" ? 8 : 4}
                                        placeholder={trainingQ?.question_type === "laq" ? "Write a detailed answer..." : "Write your answer..."}
                                        style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid var(--border)", background: "var(--ink-2)", color: "var(--text)", fontSize: 14, resize: "vertical", marginBottom: 20 }} />
                                )}
                                {trainResult ? (
                                    <div>
                                        <div style={{ padding: 16, borderRadius: 12, background: trainResult.is_correct ? "rgba(82,215,138,0.08)" : "rgba(255,107,107,0.08)", border: `1px solid ${trainResult.is_correct ? "rgba(82,215,138,0.2)" : "rgba(255,107,107,0.2)"}`, marginBottom: 16 }}>
                                            <div style={{ fontWeight: 700, color: trainResult.is_correct ? "var(--green)" : "var(--rose)", marginBottom: 8 }}>
                                                {trainResult.is_correct ? "✓ Correct!" : "✗ Needs Improvement"} — Score: {trainResult.score}/100
                                            </div>
                                            <div style={{ fontSize: 13, color: "var(--text-2)", lineHeight: 1.6 }}>{trainResult.feedback}</div>
                                        </div>
                                        {trainResult.advancement?.advanced && (
                                            <div style={{ padding: 12, borderRadius: 10, background: "var(--amber-soft)", border: "1px solid rgba(245,166,35,0.2)", marginBottom: 16, fontSize: 13, color: "var(--amber)", fontWeight: 600 }}>{trainResult.advancement.message}</div>
                                        )}
                                        <button className="btn btn-primary" onClick={nextTrainQ}>Next Question →</button>
                                    </div>
                                ) : (
                                    <button className="btn btn-primary" onClick={submitTrainAnswer} disabled={!trainAnswer.trim() || loading}>Submit Answer</button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (view === "diagnostic") {
        return (
            <div className="page-enter" style={{ maxWidth: 680, margin: "0 auto" }}>
                <button className="btn btn-ghost" onClick={() => setView("subjects")} style={{ marginBottom: 16 }}>← Back to Topics</button>
                <div className="card">
                    <div className="card-header"><div className="card-title">Diagnostic: {activeTopic?.name}</div></div>
                    <div className="card-body">
                        {loading ? <div className="spinner" style={{ width: 24, height: 24, margin: "20px auto" }} /> : evaluation ? (
                            <div>
                                <div style={{ textAlign: "center", marginBottom: 24 }}>
                                    <div style={{ fontSize: 40, fontWeight: 800, color: evaluation.overall_score >= 75 ? "var(--green)" : evaluation.overall_score >= 50 ? "var(--amber)" : "var(--rose)" }}>{evaluation.overall_score}/100</div>
                                    <div style={{ fontSize: 14, color: "var(--text-3)", marginTop: 4 }}>Readiness: <strong style={{ color: "var(--text)", textTransform: "capitalize" }}>{evaluation.readiness_level}</strong></div>
                                </div>
                                {evaluation.knowledge_gaps?.length > 0 && (
                                    <div style={{ marginBottom: 16 }}>
                                        <div style={{ fontWeight: 600, fontSize: 13, color: "var(--rose)", marginBottom: 8 }}>⚠ Knowledge Gaps</div>
                                        {evaluation.knowledge_gaps.map((g, i) => <div key={i} style={{ fontSize: 13, color: "var(--text-2)", padding: "4px 0" }}>• {g}</div>)}
                                    </div>
                                )}
                                {evaluation.encouragement && <div style={{ padding: 12, background: "rgba(82,215,138,0.08)", borderRadius: 10, fontSize: 13, color: "var(--green)", marginBottom: 16 }}>💪 {evaluation.encouragement}</div>}
                                <button className="btn btn-primary" onClick={startTraining}>Start Training →</button>
                            </div>
                        ) : (
                            <div>
                                <p style={{ fontSize: 13, color: "var(--text-3)", marginBottom: 20 }}>Answer these diagnostic questions to assess your readiness. Don't worry about getting them all right!</p>
                                {diagnosticQs.map((q, i) => (
                                    <div key={i} style={{ marginBottom: 24 }}>
                                        <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)", marginBottom: 8 }}>Q{i + 1}. {q.question}</div>
                                        <textarea value={answers[i] || ""} onChange={e => setAnswers(a => ({ ...a, [i]: e.target.value }))} rows={3}
                                            placeholder="Your answer..."
                                            style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid var(--border)", background: "var(--ink-2)", color: "var(--text)", fontSize: 13, resize: "vertical" }} />
                                    </div>
                                ))}
                                <button className="btn btn-primary" onClick={submitDiagnostic} disabled={loading || Object.keys(answers).length === 0}>
                                    Submit Diagnostic
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // Subject list view
    return (
        <div className="page-enter">
            <div className="section-header">
                <div>
                    <div className="section-title">📖 Topic Assessment</div>
                    <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>Diagnose → Train (SAQ → LAQ → MCQ) → Master</div>
                </div>
            </div>

            {progress && (
                <div className="stats-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginBottom: 24 }}>
                    {[
                        { icon: "📊", label: "Total Topics", value: progress.total_topics, color: "#4ECDC4" },
                        { icon: "✅", label: "Mastered", value: progress.mastered_topics, color: "#52D78A" },
                        { icon: "🔄", label: "In Progress", value: progress.in_progress_topics, color: "#F5A623" },
                        { icon: "📈", label: "Mastery %", value: `${progress.mastery_percentage}%`, color: "#9B8FFF" },
                    ].map((s, i) => (
                        <div className="stat-card" key={i} style={{ "--accent-color": s.color, "--accent-bg": `${s.color}14` }}>
                            <div className="stat-icon">{s.icon}</div>
                            <div className="stat-value">{s.value}</div>
                            <div className="stat-label">{s.label}</div>
                        </div>
                    ))}
                </div>
            )}

            {progress?.subjects?.map(subj => (
                <div key={subj.subject_id} className="card" style={{ marginBottom: 16 }}>
                    <div className="card-header" style={{ cursor: "pointer" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span style={{ fontSize: 20 }}>{subj.icon_emoji}</span>
                            <div>
                                <div className="card-title">{subj.subject_name}</div>
                                <div className="card-subtitle">{subj.mastered_count}/{subj.total_topics} mastered</div>
                            </div>
                        </div>
                    </div>
                    <div className="card-body" style={{ padding: "0 24px 16px" }}>
                        {subj.topics?.length > 0 ? subj.topics.map(t => {
                            const statusColors = { mastered: "var(--green)", in_progress: "var(--amber)", diagnosed: "var(--cyan)", not_started: "var(--text-3)" };
                            const statusLabels = { mastered: "✓ Mastered", in_progress: "🔄 Training", diagnosed: "📝 Diagnosed", not_started: "○ Not started" };
                            return (
                                <div key={t.topic_id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{t.topic_name}</div>
                                        {t.questions_answered > 0 && <div style={{ fontSize: 11, color: "var(--text-3)" }}>{t.correct_answers}/{t.questions_answered} correct · {t.current_question_type?.toUpperCase()}</div>}
                                    </div>
                                    <span style={{ fontSize: 11, color: statusColors[t.status], fontWeight: 600 }}>{statusLabels[t.status]}</span>
                                    <button className="btn btn-primary" style={{ padding: "6px 14px", fontSize: 12 }}
                                        onClick={() => t.status === "not_started" || t.status === "diagnosed" ? startDiagnostic(t.topic_id) : (setActiveTopic({ id: t.topic_id, name: t.topic_name }), startTraining())}>
                                        {t.status === "not_started" ? "Start" : t.status === "mastered" ? "Review" : "Continue"}
                                    </button>
                                </div>
                            );
                        }) : <div style={{ textAlign: "center", padding: 16, color: "var(--text-3)", fontSize: 13 }}>No topics seeded yet for this subject</div>}
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── REVISION DASHBOARD ──────────────────────────────────────────────────────
export function RevisionDashboard() {
    const [schedule, setSchedule] = useState([]);
    const [progress, setProgress] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        Promise.all([
            apiFetch('/revision/schedule').then(d => setSchedule(d.schedules || [])).catch(() => { }),
            apiFetch('/revision/progress').then(setProgress).catch(() => { }),
        ]).finally(() => setLoading(false));
    }, []);

    if (loading) return <div className="page-enter" style={{ textAlign: "center", padding: 60 }}><div className="spinner" style={{ width: 32, height: 32, margin: "0 auto" }} /></div>;

    return (
        <div className="page-enter">
            <div className="section-header">
                <div>
                    <div className="section-title">📅 Revision Schedule</div>
                    <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>Spaced repetition to lock in your knowledge</div>
                </div>
            </div>

            {progress && (
                <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
                    <div className="card" style={{ flex: 1, textAlign: "center" }}>
                        <div className="card-body">
                            <div style={{ fontSize: 36, fontWeight: 800, color: "var(--amber)" }}>{progress.mastery_percentage}%</div>
                            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>Overall Mastery</div>
                        </div>
                    </div>
                    <div className="card" style={{ flex: 1, textAlign: "center" }}>
                        <div className="card-body">
                            <div style={{ fontSize: 36, fontWeight: 800, color: "var(--green)" }}>{progress.mastered_topics}</div>
                            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>Topics Mastered</div>
                        </div>
                    </div>
                    <div className="card" style={{ flex: 1, textAlign: "center" }}>
                        <div className="card-body">
                            <div style={{ fontSize: 36, fontWeight: 800, color: "var(--cyan)" }}>{schedule.length}</div>
                            <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 4 }}>Pending Revisions</div>
                        </div>
                    </div>
                </div>
            )}

            <div className="card">
                <div className="card-header"><div className="card-title">Upcoming Revisions</div></div>
                <div className="card-body">
                    {schedule.length === 0 ? (
                        <div style={{ textAlign: "center", padding: 32, color: "var(--text-3)" }}>
                            <div style={{ fontSize: 32, marginBottom: 8 }}>📚</div>
                            No revisions scheduled yet. Master topics to trigger spaced revision!
                        </div>
                    ) : schedule.map((s, i) => (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < schedule.length - 1 ? "1px solid var(--border)" : "none" }}>
                            <span style={{ fontSize: 20 }}>{s.is_overdue ? "🔴" : "🟢"}</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)" }}>{s.topic_name}</div>
                                <div style={{ fontSize: 12, color: "var(--text-3)" }}>Revision #{s.revision_number} · {new Date(s.scheduled_date).toLocaleDateString()}</div>
                            </div>
                            {s.is_overdue && <span style={{ fontSize: 11, color: "var(--rose)", fontWeight: 600 }}>OVERDUE</span>}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
