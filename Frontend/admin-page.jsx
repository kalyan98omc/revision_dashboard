import { useState, useRef, useCallback, useEffect } from "react";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const SUBJECTS = [
    { id: "s1", name: "Anatomy", abbr: "ANAT", color: "#c0392b" },
    { id: "s2", name: "Physiology", abbr: "PHYS", color: "#2980b9" },
    { id: "s3", name: "Biochemistry", abbr: "BIOC", color: "#8e44ad" },
    { id: "s4", name: "Pharmacology", abbr: "PHAR", color: "#d35400" },
    { id: "s5", name: "Pathology", abbr: "PATH", color: "#16a085" },
    { id: "s6", name: "Medicine", abbr: "MED", color: "#27ae60" },
    { id: "s7", name: "Surgery", abbr: "SURG", color: "#f39c12" },
    { id: "s8", name: "Microbiology", abbr: "MICR", color: "#c0392b" },
    { id: "s9", name: "Obstetrics", abbr: "OBG", color: "#e91e63" },
    { id: "s10", name: "Pediatrics", abbr: "PEDS", color: "#00bcd4" },
    { id: "s11", name: "Psychiatry", abbr: "PSY", color: "#673ab7" },
    { id: "s12", name: "Dermatology", abbr: "DERM", color: "#ff5722" },
];

const CAPABILITY_TAGS = [
    { id: "diag", label: "Diagnostic SAQ", group: "questioning" },
    { id: "adap", label: "Adaptive Flow", group: "intelligence" },
    { id: "pyqm", label: "PYQ Mapping", group: "intelligence" },
    { id: "clin", label: "Clinical Reasoning", group: "questioning" },
    { id: "saq", label: "SAQ Generator", group: "questioning" },
    { id: "laq", label: "LAQ Generator", group: "questioning" },
    { id: "mcq", label: "MCQ Generator", group: "questioning" },
    { id: "err", label: "Error Analysis", group: "intelligence" },
    { id: "gap", label: "Gap Detection", group: "intelligence" },
    { id: "space", label: "Spaced Revision", group: "scheduling" },
    { id: "summ", label: "Topic Summary", group: "content" },
    { id: "case", label: "Case Studies", group: "content" },
    { id: "img", label: "Image Q", group: "content" },
    { id: "highyield", label: "High Yield Focus", group: "intelligence" },
    { id: "mastery", label: "Mastery Check", group: "scheduling" },
];

const LEVEL_COLORS = {
    Weak: { bg: "rgba(224,68,68,0.12)", text: "#e04444", border: "rgba(224,68,68,0.3)" },
    Average: { bg: "rgba(245,158,11,0.12)", text: "#d97706", border: "rgba(245,158,11,0.3)" },
    Good: { bg: "rgba(59,130,246,0.12)", text: "#3b82f6", border: "rgba(59,130,246,0.3)" },
    Strong: { bg: "rgba(34,197,94,0.12)", text: "#22c55e", border: "rgba(34,197,94,0.3)" },
};

const GOAL_COLORS = {
    "Top 100": { bg: "rgba(168,85,247,0.12)", text: "#a855f7", border: "rgba(168,85,247,0.3)" },
    "Top 1000": { bg: "rgba(59,130,246,0.12)", text: "#3b82f6", border: "rgba(59,130,246,0.3)" },
    "Secure Seat": { bg: "rgba(20,184,166,0.12)", text: "#14b8a6", border: "rgba(20,184,166,0.3)" },
};

const PYQ_CAT_CONFIG = {
    Core: { color: "#e04444", bg: "rgba(224,68,68,0.1)", symbol: "●●●" },
    Frequent: { color: "#f97316", bg: "rgba(249,115,22,0.1)", symbol: "●●○" },
    Occasional: { color: "#eab308", bg: "rgba(234,179,8,0.1)", symbol: "●○○" },
    Rare: { color: "#6b7280", bg: "rgba(107,114,128,0.1)", symbol: "○○○" },
};

const SYSTEM_PROMPT_TEMPLATES = {
    diagnostic: `You are an expert NEET-PG diagnostic assessor. Begin by asking 3-4 targeted SAQs to assess the student's conceptual clarity, PYQ performance, and clinical application in this topic. Classify the student as Weak/Average/Good/Strong based on responses. Identify specific knowledge gaps. Never move to training until assessment is complete.`,
    adaptive: `You are an adaptive NEET-PG tutor. Based on the student's level, adjust question complexity. For Weak students: use simpler SAQs with detailed explanations. For Average: mix SAQ and clinical MCQs. For Strong: prioritize differentiation questions and edge cases. Always explain why wrong answers are wrong.`,
    mastery: `You are a NEET-PG mastery trainer. Progress the student through: SAQ (conceptual) → LAQ (in-depth) → Clinical MCQ → High-yield MCQ. Only advance when the student shows consistent correct responses. On errors, re-explain and re-test. End each session with a rapid-fire MCQ sprint from PYQ bank.`,
    pyq: `You are a PYQ-focused NEET-PG coach. Map every concept to its PYQ frequency. Prioritize: Core (18+ PYQs) > Frequent (8-17) > Occasional (3-7) > Rare (<3). For Core topics, demand near-perfect recall. For Rare topics, provide memory hooks only. Always cite year and exam when referencing past questions.`,
};

// ─── BEHAVIOR TAG PRESETS ─────────────────────────────────────────────────────
const TAG_GROUP_META = {
    persona: { label: "Persona", color: "#8b5cf6", bg: "rgba(139,92,246,0.1)", border: "rgba(139,92,246,0.3)" },
    method: { label: "Teaching Method", color: "#0ea5e9", bg: "rgba(14,165,233,0.1)", border: "rgba(14,165,233,0.3)" },
    challenge: { label: "Challenge Mode", color: "#f97316", bg: "rgba(249,115,22,0.1)", border: "rgba(249,115,22,0.3)" },
    support: { label: "Support Style", color: "#22c55e", bg: "rgba(34,197,94,0.1)", border: "rgba(34,197,94,0.3)" },
    clinical: { label: "Clinical Mode", color: "#e11d48", bg: "rgba(225,29,72,0.1)", border: "rgba(225,29,72,0.3)" },
    exam: { label: "Exam Strategy", color: "#eab308", bg: "rgba(234,179,8,0.1)", border: "rgba(234,179,8,0.3)" },
    custom: { label: "Custom", color: "#6b7280", bg: "rgba(107,114,128,0.1)", border: "rgba(107,114,128,0.3)" },
};

const PRESET_BEHAVIOR_TAGS = [
    {
        id: "bt_companion", label: "Study Companion", group: "persona", isPreset: true,
        description: "Warm, encouraging friend who studies alongside the student",
        prompt_snippet: "Act as a warm study companion — not a teacher, but a fellow MBBS graduate studying together. Use 'we', share mnemonics, and make revision feel collaborative rather than instructional.",
    },
    {
        id: "bt_teacher", label: "Act as Teacher", group: "persona", isPreset: true,
        description: "Formal educator who explains, then tests understanding",
        prompt_snippet: "Act as an experienced NEET-PG faculty member. Explain each concept clearly with structure (definition → mechanism → clinical relevance → high-yield point). After each explanation, immediately ask a probing question to check understanding.",
    },
    {
        id: "bt_crossq", label: "Cross Question", group: "challenge", isPreset: true,
        description: "Challenges every answer with a follow-up that digs deeper",
        prompt_snippet: "After every answer the student gives — correct or incorrect — immediately cross-question them. Ask 'why?', 'what if the patient also had X?', or 'how does this differ from Y?'. Never let any answer be the final word.",
    },
    {
        id: "bt_socratic", label: "Socratic Method", group: "method", isPreset: true,
        description: "Guides discovery through questions, never direct answers",
        prompt_snippet: "Use strict Socratic method. Never directly state a fact — always lead the student to discover it through a series of progressively narrowing questions. Only confirm once the student has articulated the correct answer themselves.",
    },
    {
        id: "bt_devil", label: "Devil's Advocate", group: "challenge", isPreset: true,
        description: "Challenges the student's answers to test confidence",
        prompt_snippet: "Play devil's advocate. When the student gives a correct answer, challenge it anyway: 'Are you sure? There's a condition where that wouldn't hold true...' Force the student to defend their knowledge and identify boundary conditions.",
    },
    {
        id: "bt_examiner", label: "Viva Examiner", group: "exam", isPreset: true,
        description: "Strict viva-style rapid-fire questioning",
        prompt_snippet: "Simulate a strict NEET-PG viva examination. Ask rapid-fire short questions. Accept only precise answers — if vague, mark as incorrect and move on. Keep a running score. After 10 questions, give a final verdict with weak areas listed.",
    },
    {
        id: "bt_mentor", label: "Senior Mentor", group: "persona", isPreset: true,
        description: "Experienced senior who gives honest, direct feedback",
        prompt_snippet: "Be a senior resident mentor — direct, honest, and time-efficient. Praise correct answers briefly, correct errors firmly without softening. Prioritize high-yield facts. Tell the student exactly what matters most for NEET-PG and what to skip.",
    },
    {
        id: "bt_simplify", label: "Simplifier", group: "support", isPreset: true,
        description: "Breaks every concept into the simplest possible terms",
        prompt_snippet: "Your only job is radical simplification. Take any medical concept and explain it as if the student has never seen it before. Use analogies from everyday life, body-as-machine metaphors, and zero jargon. Then build up complexity once the core is clear.",
    },
    {
        id: "bt_mnemo", label: "Mnemonic Trainer", group: "support", isPreset: true,
        description: "Teaches through high-quality mnemonics and memory hooks",
        prompt_snippet: "For every fact list, classification, or sequence — create or recall a memorable mnemonic. Prioritize existing NEET-PG community mnemonics. If none exists, invent a vivid, slightly ridiculous one. Always repeat the mnemonic at the end of the session.",
    },
    {
        id: "bt_case", label: "Clinical Case Mode", group: "clinical", isPreset: true,
        description: "Presents real clinical scenarios to test application",
        prompt_snippet: "Present every topic as a clinical case. Start with: 'A 45-year-old presents with...'. Let the student take a history, order investigations, and reach a diagnosis before revealing the answer. Never break the clinical scenario framing.",
    },
    {
        id: "bt_compare", label: "Comparison Engine", group: "method", isPreset: true,
        description: "Forces differentiation between similar conditions",
        prompt_snippet: "Always teach in pairs or triplets of similar concepts. Whenever a topic comes up, immediately compare it with the most commonly confused condition. Create side-by-side contrast tables. The student must be able to distinguish — not just recall.",
    },
    {
        id: "bt_pyqhunt", label: "PYQ Hunter", group: "exam", isPreset: true,
        description: "Connects every concept back to past paper questions",
        prompt_snippet: "After explaining any concept, say: 'This was asked as...' and reference the closest PYQ pattern. Frame all explanations from the examiner's perspective — what exactly do they want the student to write? Teach to the exam, not to the textbook.",
    },
    {
        id: "bt_speed", label: "Speed Drill", group: "exam", isPreset: true,
        description: "Time-pressured rapid recall practice",
        prompt_snippet: "Run speed drills. Give the student one fact per question with a 10-second mental countdown. No explanations during the drill. At the end, review only the missed ones in detail. The goal is automaticity — instant recall without thinking.",
    },
    {
        id: "bt_empathy", label: "Empathetic Coach", group: "support", isPreset: true,
        description: "Sensitive to student stress and burnout, adjusts accordingly",
        prompt_snippet: "Monitor the student's emotional state. If they seem frustrated, fatigued, or discouraged, pause the content and offer perspective — remind them of their progress, suggest a short break, or switch to an easier topic to rebuild confidence before returning to difficult material.",
    },
];

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
const INITIAL_MODELS = [
    {
        id: "m1", name: "NEET PG Core Engine", base_model: "gpt-4o", status: "ready",
        capabilities: ["diag", "adap", "pyqm", "saq", "mcq", "gap", "highyield"],
        target_levels: ["Weak", "Average", "Good", "Strong"],
        target_goals: ["Top 100", "Top 1000", "Secure Seat"],
        subject_ids: [],
        behavior_tags: ["bt_teacher", "bt_crossq", "bt_pyqhunt"],
        system_prompt: SYSTEM_PROMPT_TEMPLATES.adaptive,
        file_count: 12, vector_store_id: "vs_abc123", assistant_id: "asst_xyz789",
    },
    {
        id: "m2", name: "High Achiever Sprint", base_model: "gpt-4o", status: "ready",
        capabilities: ["adap", "mcq", "case", "img", "highyield", "err", "mastery"],
        target_levels: ["Strong", "Good"],
        target_goals: ["Top 100"],
        subject_ids: [],
        behavior_tags: ["bt_examiner", "bt_devil", "bt_speed", "bt_compare"],
        system_prompt: SYSTEM_PROMPT_TEMPLATES.mastery,
        file_count: 8, vector_store_id: "vs_def456", assistant_id: "asst_uvw012",
    },
    {
        id: "m3", name: "Foundation Builder", base_model: "gpt-4-turbo", status: "draft",
        capabilities: ["diag", "saq", "laq", "summ", "gap"],
        target_levels: ["Weak", "Average"],
        target_goals: ["Secure Seat", "Top 1000"],
        subject_ids: ["s1", "s2", "s3"],
        behavior_tags: ["bt_companion", "bt_simplify", "bt_mnemo", "bt_empathy"],
        system_prompt: SYSTEM_PROMPT_TEMPLATES.diagnostic,
        file_count: 0, vector_store_id: null, assistant_id: null,
    },
];

const INITIAL_PYQS = [
    { id: "q1", question: "Commonest site of peptic ulcer?", year: 2023, subject: "s6", topic: "GI", category: "Core", frequency: 22 },
    { id: "q2", question: "Mechanism of action of metformin?", year: 2022, subject: "s4", topic: "Diabetes", category: "Core", frequency: 18 },
    { id: "q3", question: "RTA Type 1 - urine pH characteristic?", year: 2021, subject: "s2", topic: "Renal Tubular Acidosis", category: "Core", frequency: 15 },
    { id: "q4", question: "Carbonic anhydrase inhibitor used in glaucoma?", year: 2020, subject: "s4", topic: "Ophthalmic drugs", category: "Frequent", frequency: 9 },
    { id: "q5", question: "Most common cause of Addison's disease in India?", year: 2019, subject: "s6", topic: "Adrenal", category: "Frequent", frequency: 7 },
    { id: "q6", question: "Gene mutation in Lowe syndrome?", year: 2018, subject: "s3", topic: "Metabolic disorders", category: "Rare", frequency: 1 },
    { id: "q7", question: "Bartter syndrome - which segment affected?", year: 2022, subject: "s2", topic: "Renal Tubular Acidosis", category: "Occasional", frequency: 4 },
];

const INITIAL_DOCS = [
    { id: "d1", filename: "Harrison_Internal_Medicine_Ch14.pdf", subject_id: "s6", status: "indexed", pages: 48, size: "4.2 MB", uploaded: "2024-01-15" },
    { id: "d2", filename: "NEET_PG_Pharmacology_2024.pdf", subject_id: "s4", status: "indexed", pages: 120, size: "11.8 MB", uploaded: "2024-01-12" },
    { id: "d3", filename: "Physiology_Renal_Comprehensive.pdf", subject_id: "s2", status: "processing", pages: 62, size: "5.1 MB", uploaded: "2024-01-20" },
    { id: "d4", filename: "PYQ_Anatomy_2010_2024.pdf", subject_id: "s1", status: "indexed", pages: 340, size: "28.4 MB", uploaded: "2024-01-08" },
];

const TIER_CONFIGS_INIT = {
    "Weak-Secure Seat": { saq_pct: 60, laq_pct: 30, mcq_pct: 10, mastery_threshold: 65, diagnostic_qs: 3, model_id: "m3" },
    "Weak-Top 1000": { saq_pct: 50, laq_pct: 30, mcq_pct: 20, mastery_threshold: 70, diagnostic_qs: 4, model_id: "m1" },
    "Weak-Top 100": { saq_pct: 40, laq_pct: 35, mcq_pct: 25, mastery_threshold: 80, diagnostic_qs: 4, model_id: "m1" },
    "Average-Secure Seat": { saq_pct: 40, laq_pct: 30, mcq_pct: 30, mastery_threshold: 70, diagnostic_qs: 3, model_id: "m1" },
    "Average-Top 1000": { saq_pct: 30, laq_pct: 30, mcq_pct: 40, mastery_threshold: 75, diagnostic_qs: 4, model_id: "m1" },
    "Average-Top 100": { saq_pct: 25, laq_pct: 25, mcq_pct: 50, mastery_threshold: 85, diagnostic_qs: 4, model_id: "m2" },
    "Strong-Secure Seat": { saq_pct: 20, laq_pct: 20, mcq_pct: 60, mastery_threshold: 75, diagnostic_qs: 3, model_id: "m1" },
    "Strong-Top 1000": { saq_pct: 15, laq_pct: 20, mcq_pct: 65, mastery_threshold: 85, diagnostic_qs: 4, model_id: "m2" },
    "Strong-Top 100": { saq_pct: 10, laq_pct: 15, mcq_pct: 75, mastery_threshold: 90, diagnostic_qs: 4, model_id: "m2" },
};

// ─── REUSABLE COMPONENTS ──────────────────────────────────────────────────────
const Chip = ({ label, active, onClick, color }) => (
    <button onClick={onClick} style={{
        padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
        cursor: "pointer", border: `1px solid ${active ? (color || "var(--color-border-info)") : "var(--color-border-tertiary)"}`,
        background: active ? (color ? color + "20" : "var(--color-background-info)") : "transparent",
        color: active ? (color || "var(--color-text-info)") : "var(--color-text-secondary)",
        transition: "all 0.15s", whiteSpace: "nowrap",
    }}>{label}</button>
);

const StatusPill = ({ status }) => {
    const cfg = {
        ready: { bg: "var(--color-background-success)", color: "var(--color-text-success)", label: "READY" },
        training: { bg: "var(--color-background-warning)", color: "var(--color-text-warning)", label: "DEPLOYING" },
        draft: { bg: "var(--color-background-secondary)", color: "var(--color-text-secondary)", label: "DRAFT" },
        indexed: { bg: "var(--color-background-success)", color: "var(--color-text-success)", label: "INDEXED" },
        processing: { bg: "var(--color-background-warning)", color: "var(--color-text-warning)", label: "PROCESSING" },
        error: { bg: "var(--color-background-danger)", color: "var(--color-text-danger)", label: "ERROR" },
        failed: { bg: "var(--color-background-danger)", color: "var(--color-text-danger)", label: "FAILED" },
    }[status] || { bg: "var(--color-background-secondary)", color: "var(--color-text-secondary)", label: status?.toUpperCase() || "UNKNOWN" };
    return (
        <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, letterSpacing: "0.05em", background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
    );
};

const Toast = ({ msg }) => msg ? (
    <div style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 9999,
        padding: "12px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
        background: msg.isErr ? "var(--color-background-danger)" : "var(--color-background-success)",
        color: msg.isErr ? "var(--color-text-danger)" : "var(--color-text-success)",
        border: `1px solid ${msg.isErr ? "var(--color-border-danger)" : "var(--color-border-success)"}`,
        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
    }}>{msg.isErr ? "✗ " : "✓ "}{msg.text}</div>
) : null;

const SectionCard = ({ title, subtitle, children, action }) => (
    <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden", marginBottom: 16 }}>
        <div style={{ padding: "14px 20px", borderBottom: "0.5px solid var(--color-border-tertiary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)" }}>{title}</div>
                {subtitle && <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>{subtitle}</div>}
            </div>
            {action}
        </div>
        <div style={{ padding: "16px 20px" }}>{children}</div>
    </div>
);

// ─── TAB: MODEL STUDIO ────────────────────────────────────────────────────────
function ModelStudio({ models, setModels, customTags, showMsg }) {
    const [selected, setSelected] = useState(models[0]?.id || null);
    const [isCreating, setIsCreating] = useState(false);
    const [draft, setDraft] = useState({ name: "", base_model: "gpt-4o", capabilities: [], target_levels: [], target_goals: [], subject_ids: [], behavior_tags: [], system_prompt: "" });
    const fileRef = useRef();

    const current = isCreating ? draft : models.find(m => m.id === selected);

    const toggleCap = (id) => {
        const update = (caps) => caps.includes(id) ? caps.filter(c => c !== id) : [...caps, id];
        if (isCreating) setDraft(d => ({ ...d, capabilities: update(d.capabilities) }));
        else setModels(ms => ms.map(m => m.id === selected ? { ...m, capabilities: update(m.capabilities) } : m));
    };

    const toggleLevel = (lvl) => {
        const update = (ls) => ls.includes(lvl) ? ls.filter(l => l !== lvl) : [...ls, lvl];
        if (isCreating) setDraft(d => ({ ...d, target_levels: update(d.target_levels) }));
        else setModels(ms => ms.map(m => m.id === selected ? { ...m, target_levels: update(m.target_levels) } : m));
    };

    const toggleGoal = (g) => {
        const update = (gs) => gs.includes(g) ? gs.filter(x => x !== g) : [...gs, g];
        if (isCreating) setDraft(d => ({ ...d, target_goals: update(d.target_goals) }));
        else setModels(ms => ms.map(m => m.id === selected ? { ...m, target_goals: update(m.target_goals) } : m));
    };

    const toggleSubject = (sid) => {
        const update = (ss) => ss.includes(sid) ? ss.filter(s => s !== sid) : [...ss, sid];
        if (isCreating) setDraft(d => ({ ...d, subject_ids: update(d.subject_ids) }));
        else setModels(ms => ms.map(m => m.id === selected ? { ...m, subject_ids: update(m.subject_ids) } : m));
    };

    const toggleBehaviorTag = (tagId) => {
        const update = (tags) => tags.includes(tagId) ? tags.filter(t => t !== tagId) : [...tags, tagId];
        if (isCreating) setDraft(d => ({ ...d, behavior_tags: update(d.behavior_tags) }));
        else setModels(ms => ms.map(m => m.id === selected ? { ...m, behavior_tags: update(m.behavior_tags) } : m));
    };

    const injectTagsIntoPrompt = () => {
        const currentData = isCreating ? draft : models.find(m => m.id === selected);
        const allTags = [...PRESET_BEHAVIOR_TAGS, ...customTags];
        const activeTags = allTags.filter(t => currentData?.behavior_tags?.includes(t.id));
        if (!activeTags.length) return showMsg("No behavior tags selected to inject", true);
        const injected = activeTags.map(t => `[${t.label.toUpperCase()}]: ${t.prompt_snippet}`).join("\n\n");
        const base = currentData?.system_prompt ? currentData.system_prompt.trim() + "\n\n" : "";
        updateField("system_prompt", base + "--- BEHAVIOR DIRECTIVES ---\n\n" + injected);
        showMsg(`Injected ${activeTags.length} behavior tag(s) into prompt`);
    };

    const updateField = (field, value) => {
        if (isCreating) setDraft(d => ({ ...d, [field]: value }));
        else setModels(ms => ms.map(m => m.id === selected ? { ...m, [field]: value } : m));
    };

    const saveNew = () => {
        if (!draft.name.trim()) return showMsg("Model name required", true);
        const m = { ...draft, id: "m" + Date.now(), status: "draft", file_count: 0, vector_store_id: null, assistant_id: null };
        setModels(ms => [m, ...ms]);
        setSelected(m.id);
        setIsCreating(false);
        setDraft({ name: "", base_model: "gpt-4o", capabilities: [], target_levels: [], target_goals: [], subject_ids: [], behavior_tags: [], system_prompt: "" });
        showMsg("Model variant created");
    };

    const deploy = (id) => {
        setModels(ms => ms.map(m => m.id === id ? { ...m, status: "training" } : m));
        setTimeout(() => {
            setModels(ms => ms.map(m => m.id === id ? { ...m, status: "ready", vector_store_id: "vs_" + Math.random().toString(36).slice(2, 8), assistant_id: "asst_" + Math.random().toString(36).slice(2, 8) } : m));
            showMsg("Model deployed successfully");
        }, 2000);
    };

    const capGroups = ["questioning", "intelligence", "scheduling", "content"];
    const groupLabels = { questioning: "Questioning", intelligence: "Intelligence", scheduling: "Scheduling", content: "Content" };

    const data = current || draft;

    return (
        <div style={{ display: "flex", gap: 16 }}>
            {/* Left: model list */}
            <div style={{ width: 240, flexShrink: 0 }}>
                <button onClick={() => { setIsCreating(true); setSelected(null); }} style={{
                    width: "100%", padding: "10px 14px", borderRadius: "var(--border-radius-md)", fontSize: 13, fontWeight: 500,
                    background: "var(--color-background-info)", color: "var(--color-text-info)",
                    border: "1px solid var(--color-border-info)", cursor: "pointer", marginBottom: 12, textAlign: "left",
                }}>+ New Model Variant</button>

                {models.map(m => (
                    <div key={m.id} onClick={() => { setSelected(m.id); setIsCreating(false); }}
                        style={{
                            padding: "12px 14px", borderRadius: "var(--border-radius-md)", cursor: "pointer", marginBottom: 8,
                            background: selected === m.id && !isCreating ? "var(--color-background-secondary)" : "var(--color-background-primary)",
                            border: `0.5px solid ${selected === m.id && !isCreating ? "var(--color-border-secondary)" : "var(--color-border-tertiary)"}`,
                            borderLeft: `3px solid ${m.status === "ready" ? "#22c55e" : m.status === "training" ? "#eab308" : "var(--color-border-tertiary)"}`,
                        }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 4 }}>{m.name}</div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 11, color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)" }}>{m.base_model}</span>
                            <StatusPill status={m.status} />
                        </div>
                        <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {m.target_levels.slice(0, 3).map(l => (
                                <span key={l} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: LEVEL_COLORS[l]?.bg, color: LEVEL_COLORS[l]?.text, fontWeight: 700 }}>{l.toUpperCase()}</span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Right: editor */}
            <div style={{ flex: 1 }}>
                {isCreating && (
                    <div style={{ background: "var(--color-background-warning)", border: "1px solid var(--color-border-warning)", borderRadius: "var(--border-radius-md)", padding: "10px 16px", marginBottom: 16, fontSize: 13, color: "var(--color-text-warning)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>New model variant — unsaved draft</span>
                        <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => setIsCreating(false)} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid var(--color-border-warning)", background: "transparent", color: "var(--color-text-warning)", cursor: "pointer", fontSize: 12 }}>Cancel</button>
                            <button onClick={saveNew} style={{ padding: "4px 12px", borderRadius: 6, border: "none", background: "var(--color-text-warning)", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Save Variant</button>
                        </div>
                    </div>
                )}

                {data && (
                    <>
                        <SectionCard title="Identity" subtitle="Name and base OpenAI model">
                            <div style={{ display: "flex", gap: 12 }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>VARIANT NAME</label>
                                    <input value={data.name} onChange={e => updateField("name", e.target.value)}
                                        placeholder="e.g. Intensive Revision — Pharmacology"
                                        style={{ width: "100%", padding: "8px 12px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: 13, boxSizing: "border-box" }} />
                                </div>
                                <div style={{ width: 180 }}>
                                    <label style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 4 }}>BASE MODEL</label>
                                    <select value={data.base_model} onChange={e => updateField("base_model", e.target.value)}
                                        style={{ width: "100%", padding: "8px 12px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: 13 }}>
                                        {["gpt-4o", "gpt-4-turbo", "gpt-4", "gpt-3.5-turbo"].map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                            </div>
                        </SectionCard>

                        <SectionCard title="Capabilities" subtitle="AI behaviours enabled for this variant">
                            {capGroups.map(grp => (
                                <div key={grp} style={{ marginBottom: 12 }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-secondary)", letterSpacing: "0.08em", marginBottom: 6, textTransform: "uppercase" }}>{groupLabels[grp]}</div>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                        {CAPABILITY_TAGS.filter(c => c.group === grp).map(cap => (
                                            <Chip key={cap.id} label={cap.label} active={data.capabilities.includes(cap.id)} onClick={() => toggleCap(cap.id)} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </SectionCard>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                            <SectionCard title="Target Student Level" subtitle="Which student tiers see this model">
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    {["Weak", "Average", "Good", "Strong"].map(lvl => (
                                        <button key={lvl} onClick={() => toggleLevel(lvl)} style={{
                                            padding: "8px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                                            background: data.target_levels.includes(lvl) ? LEVEL_COLORS[lvl]?.bg : "transparent",
                                            color: data.target_levels.includes(lvl) ? LEVEL_COLORS[lvl]?.text : "var(--color-text-secondary)",
                                            border: `1px solid ${data.target_levels.includes(lvl) ? LEVEL_COLORS[lvl]?.border : "var(--color-border-tertiary)"}`,
                                        }}>{lvl}</button>
                                    ))}
                                </div>
                            </SectionCard>

                            <SectionCard title="Target Student Goal" subtitle="Rank objectives this model supports">
                                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    {["Top 100", "Top 1000", "Secure Seat"].map(g => (
                                        <button key={g} onClick={() => toggleGoal(g)} style={{
                                            padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
                                            background: data.target_goals.includes(g) ? GOAL_COLORS[g]?.bg : "transparent",
                                            color: data.target_goals.includes(g) ? GOAL_COLORS[g]?.text : "var(--color-text-secondary)",
                                            border: `1px solid ${data.target_goals.includes(g) ? GOAL_COLORS[g]?.border : "var(--color-border-tertiary)"}`,
                                        }}>{g}</button>
                                    ))}
                                </div>
                            </SectionCard>
                        </div>

                        <SectionCard title="Subject Scope" subtitle="Leave blank for all subjects, or restrict to specific ones">
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                <button onClick={() => isCreating ? setDraft(d => ({ ...d, subject_ids: [] })) : setModels(ms => ms.map(m => m.id === selected ? { ...m, subject_ids: [] } : m))}
                                    style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", background: data.subject_ids.length === 0 ? "var(--color-background-info)" : "transparent", color: data.subject_ids.length === 0 ? "var(--color-text-info)" : "var(--color-text-secondary)", border: "1px solid var(--color-border-tertiary)" }}>
                                    All Subjects
                                </button>
                                {SUBJECTS.map(s => (
                                    <button key={s.id} onClick={() => toggleSubject(s.id)} style={{
                                        padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer",
                                        background: data.subject_ids.includes(s.id) ? s.color + "20" : "transparent",
                                        color: data.subject_ids.includes(s.id) ? s.color : "var(--color-text-secondary)",
                                        border: `1px solid ${data.subject_ids.includes(s.id) ? s.color + "60" : "var(--color-border-tertiary)"}`,
                                    }}>{s.abbr}</button>
                                ))}
                            </div>
                        </SectionCard>

                        <SectionCard
                            title="Behavior Tags"
                            subtitle="Personality, method and interaction style directives for this model"
                            action={
                                <button onClick={injectTagsIntoPrompt} style={{ padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", background: "var(--color-background-info)", color: "var(--color-text-info)", border: "1px solid var(--color-border-info)" }}>
                                    Inject into Prompt ↓
                                </button>
                            }>
                            {Object.entries(TAG_GROUP_META).map(([grp, meta]) => {
                                const tagsInGroup = [...PRESET_BEHAVIOR_TAGS, ...customTags].filter(t => t.group === grp);
                                if (!tagsInGroup.length) return null;
                                return (
                                    <div key={grp} style={{ marginBottom: 14 }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: meta.color, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 7, display: "flex", alignItems: "center", gap: 6 }}>
                                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color, display: "inline-block" }} />
                                            {meta.label}
                                            {grp === "custom" && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>Your Tags</span>}
                                        </div>
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                            {tagsInGroup.map(tag => {
                                                const active = data.behavior_tags?.includes(tag.id);
                                                return (
                                                    <div key={tag.id} title={tag.description} onClick={() => toggleBehaviorTag(tag.id)} style={{
                                                        padding: "5px 11px", borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: "pointer",
                                                        background: active ? meta.bg : "transparent",
                                                        color: active ? meta.color : "var(--color-text-secondary)",
                                                        border: `1px solid ${active ? meta.border : "var(--color-border-tertiary)"}`,
                                                        transition: "all 0.15s",
                                                        display: "flex", alignItems: "center", gap: 5,
                                                    }}>
                                                        {active && <span style={{ width: 5, height: 5, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />}
                                                        {tag.label}
                                                        {!tag.isPreset && <span style={{ fontSize: 9, opacity: 0.7 }}>✎</span>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                            {data.behavior_tags?.length > 0 && (
                                <div style={{ marginTop: 4, padding: "8px 12px", borderRadius: 8, background: "var(--color-background-secondary)", fontSize: 12 }}>
                                    <span style={{ color: "var(--color-text-secondary)" }}>{data.behavior_tags.length} tag(s) active — </span>
                                    <span style={{ color: "var(--color-text-primary)", fontWeight: 500 }}>click "Inject into Prompt" to embed their directives into the system prompt below</span>
                                </div>
                            )}
                        </SectionCard>

                        <SectionCard title="System Prompt"
                            subtitle="Core instructions sent to OpenAI with every conversation"
                            action={
                                <div style={{ display: "flex", gap: 6 }}>
                                    {Object.entries({ diag: "Diagnostic", adap: "Adaptive", master: "Mastery", pyq: "PYQ Focus" }).map(([key, label]) => (
                                        <button key={key} onClick={() => updateField("system_prompt", SYSTEM_PROMPT_TEMPLATES[key === "master" ? "mastery" : key === "diag" ? "diagnostic" : key === "adap" ? "adaptive" : "pyq"])}
                                            style={{ padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border-tertiary)" }}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            }>
                            <textarea value={data.system_prompt} onChange={e => updateField("system_prompt", e.target.value)} rows={6}
                                placeholder="Write system prompt or use a template above..."
                                style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: 13, fontFamily: "var(--font-mono)", resize: "vertical", boxSizing: "border-box", lineHeight: 1.6 }} />
                        </SectionCard>

                        {!isCreating && (
                            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                <div style={{ display: "flex", gap: 32, fontSize: 13 }}>
                                    <div><div style={{ color: "var(--color-text-secondary)", fontSize: 11, marginBottom: 2 }}>FILES</div><div style={{ fontWeight: 600, fontFamily: "var(--font-mono)" }}>{current?.file_count || 0}</div></div>
                                    <div><div style={{ color: "var(--color-text-secondary)", fontSize: 11, marginBottom: 2 }}>VECTOR STORE</div><div style={{ fontWeight: 600, fontFamily: "var(--font-mono)", fontSize: 12 }}>{current?.vector_store_id || "—"}</div></div>
                                    <div><div style={{ color: "var(--color-text-secondary)", fontSize: 11, marginBottom: 2 }}>ASSISTANT ID</div><div style={{ fontWeight: 600, fontFamily: "var(--font-mono)", fontSize: 12 }}>{current?.assistant_id || "—"}</div></div>
                                </div>
                                <div style={{ display: "flex", gap: 8 }}>
                                    <button onClick={() => fileRef.current.click()}
                                        style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: "pointer", border: "1px dashed var(--color-border-secondary)", background: "transparent", color: "var(--color-text-secondary)" }}>
                                        Attach Training File
                                    </button>
                                    <input ref={fileRef} type="file" style={{ display: "none" }} onChange={() => showMsg("File queued for training")} />
                                    <button onClick={() => deploy(current.id)} disabled={current?.status !== "draft"}
                                        style={{ padding: "8px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: current?.status !== "draft" ? "default" : "pointer", border: "none", background: current?.status !== "draft" ? "var(--color-background-secondary)" : "var(--color-text-success)", color: current?.status !== "draft" ? "var(--color-text-secondary)" : "#fff" }}>
                                        {current?.status === "training" ? "Deploying..." : current?.status === "ready" ? "Deployed" : "Deploy Model"}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

// ─── TAB: RAG PIPELINE ────────────────────────────────────────────────────────
const API_BASE = "http://localhost:5000/api/v1";
const getToken = () => localStorage.getItem("access_token");

function RagPipeline({ showMsg }) {
    const [docs, setDocs] = useState([]);
    const [activeSubject, setActiveSubject] = useState("all");
    const [dragOver, setDragOver] = useState(false);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);

    // ── Fetch existing documents from backend ──────────────────────────────
    const fetchDocs = async () => {
        try {
            const token = getToken();
            const url = activeSubject === "all"
                ? `${API_BASE}/admin/documents`
                : `${API_BASE}/admin/documents?subject_id=${activeSubject}`;
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setDocs(data.documents || []);
        } catch (err) {
            showMsg(`Failed to load documents: ${err.message}`, true);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchDocs(); }, [activeSubject]);

    // ── Upload files to backend ────────────────────────────────────────────
    const uploadFiles = async (files) => {
        if (!files || files.length === 0) return;
        setUploading(true);
        const token = getToken();
        let successCount = 0;

        for (const file of Array.from(files)) {
            const formData = new FormData();
            formData.append("file", file);
            if (activeSubject !== "all") formData.append("subject_id", activeSubject);

            try {
                const res = await fetch(`${API_BASE}/admin/documents/upload`, {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData,
                });
                if (!res.ok) {
                    const err = await res.json();
                    showMsg(`Upload failed for ${file.name}: ${err.error}`, true);
                } else {
                    successCount++;
                }
            } catch (err) {
                showMsg(`Upload failed for ${file.name}: ${err.message}`, true);
            }
        }
        setUploading(false);
        if (successCount > 0) {
            showMsg(`${successCount} file(s) uploaded and indexed to vector store`);
            fetchDocs(); // refresh list
        }
    };

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setDragOver(false);
        uploadFiles(e.dataTransfer?.files || e.target?.files);
    }, [activeSubject]);

    // ── Delete document ────────────────────────────────────────────────────
    const deleteDoc = async (docId) => {
        if (!confirm("Delete this document from the vector store?")) return;
        try {
            const token = getToken();
            const res = await fetch(`${API_BASE}/admin/documents/${docId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            showMsg("Document deleted");
            setDocs(d => d.filter(doc => doc.id !== docId));
        } catch (err) {
            showMsg(`Delete failed: ${err.message}`, true);
        }
    };

    const filtered = activeSubject === "all" ? docs : docs.filter(d => d.subject_id === activeSubject);
    const stats = {
        total: docs.length,
        indexed: docs.filter(d => d.status === "indexed").length,
        processing: docs.filter(d => d.status === "processing").length,
    };

    return (
        <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
                {[
                    { label: "Total Files", val: stats.total, color: "var(--text)", bg: "linear-gradient(135deg, var(--surface) 0%, var(--surface-2) 100%)", icon: "📄" },
                    { label: "Indexed", val: stats.indexed, color: "var(--green)", bg: "linear-gradient(135deg, var(--surface) 0%, rgba(82,215,138,0.06) 100%)", icon: "✓" },
                    { label: "Processing", val: stats.processing, color: "var(--amber)", bg: "linear-gradient(135deg, var(--surface) 0%, rgba(245,166,35,0.06) 100%)", icon: "⏳" },
                    { label: "Subjects Covered", val: [...new Set(docs.map(d => d.subject_id).filter(Boolean))].length, color: "var(--cyan)", bg: "linear-gradient(135deg, var(--surface) 0%, rgba(78,205,196,0.06) 100%)", icon: "📚" },
                ].map(s => (
                    <div key={s.label} style={{ background: s.bg, border: "1px solid var(--border)", borderRadius: "16px", padding: "20px", position: "relative", overflow: "hidden", transition: "all 0.3s ease", cursor: "default" }}
                        onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.borderColor = s.color + "80"; e.currentTarget.style.boxShadow = `0 8px 24px -8px ${s.color}60`; }}
                        onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}>
                        <div style={{ position: "absolute", right: -15, top: -15, fontSize: 80, opacity: 0.03, transform: "rotate(15deg)" }}>{s.icon}</div>
                        <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 6, background: "var(--surface-3)", fontSize: 12 }}>{s.icon}</span>
                            {s.label}
                        </div>
                        <div style={{ fontSize: 36, fontFamily: "var(--font-display)", fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.val}</div>
                    </div>
                ))}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24, padding: "8px", background: "var(--surface)", borderRadius: "20px", border: "1px solid var(--border)" }}>
                <button onClick={() => setActiveSubject("all")} style={{ padding: "8px 20px", borderRadius: "16px", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)", border: "none", background: activeSubject === "all" ? "linear-gradient(135deg, var(--amber), #FF8A00)" : "transparent", color: activeSubject === "all" ? "var(--ink)" : "var(--text-3)", boxShadow: activeSubject === "all" ? "0 4px 12px var(--amber-glow)" : "none" }}>All</button>
                {SUBJECTS.map(s => (
                    <button key={s.id} onClick={() => setActiveSubject(s.id)} style={{ padding: "8px 20px", borderRadius: "16px", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)", border: "none", background: activeSubject === s.id ? s.color : "transparent", color: activeSubject === s.id ? "#fff" : "var(--text-3)", boxShadow: activeSubject === s.id ? `0 4px 12px ${s.color}60` : "none" }}>{s.abbr}</button>
                ))}
            </div>

            <div onDrop={handleDrop} onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
                onClick={() => document.getElementById("rag-file-input").click()}
                style={{ border: `2px dashed ${dragOver ? "var(--color-border-info)" : uploading ? "var(--color-border-warning)" : "var(--color-border-tertiary)"}`, borderRadius: "var(--border-radius-lg)", padding: "32px 20px", textAlign: "center", cursor: uploading ? "wait" : "pointer", marginBottom: 16, transition: "all 0.15s", background: dragOver ? "var(--color-background-info)" : uploading ? "var(--color-background-warning)" : "transparent" }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{uploading ? "⏳" : "📄"}</div>
                <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 4 }}>
                    {uploading ? "Uploading to OpenAI Vector Store..." : "Drop PDFs / text files here or click to upload"}
                </div>
                <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                    {uploading ? "Please wait, this may take a moment" : "Files are automatically chunked and vectorized via OpenAI File Search"}
                </div>
                {activeSubject !== "all" && <div style={{ marginTop: 8, fontSize: 12, color: "var(--color-text-info)" }}>Will be tagged to: {SUBJECTS.find(s => s.id === activeSubject)?.name}</div>}
                <input id="rag-file-input" type="file" multiple accept=".pdf,.txt,.doc,.docx,.csv,.json" style={{ display: "none" }} onChange={e => uploadFiles(e.target.files)} />
            </div>

            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden" }}>
                {loading ? (
                    <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13 }}>Loading documents from backend...</div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: 40, textAlign: "center", color: "var(--color-text-secondary)", fontSize: 13 }}>No documents uploaded yet. Drop a PDF above to get started.</div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                        <thead>
                            <tr style={{ borderBottom: "0.5px solid var(--color-border-tertiary)", background: "var(--color-background-secondary)" }}>
                                {[["Filename", "35%"], ["Subject", "12%"], ["Size", "10%"], ["Uploaded", "12%"], ["Status", "13%"], ["", "8%"]].map(([h, w]) => (
                                    <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", letterSpacing: "0.05em", textTransform: "uppercase", width: w }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(doc => {
                                const subj = SUBJECTS.find(s => s.id === doc.subject_id);
                                const sizeMB = doc.file_size_bytes ? (doc.file_size_bytes / 1048576).toFixed(1) + " MB" : doc.size || "—";
                                const uploaded = doc.created_at ? doc.created_at.slice(0, 10) : doc.uploaded || "—";
                                return (
                                    <tr key={doc.id} style={{ borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                                        <td style={{ padding: "11px 14px", fontSize: 13, color: "var(--color-text-primary)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={doc.original_name || doc.filename}>{doc.original_name || doc.filename}</td>
                                        <td style={{ padding: "11px 14px" }}>
                                            {subj ? <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, background: subj.color + "20", color: subj.color, fontWeight: 600 }}>{subj.abbr}</span> : <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>Global</span>}
                                        </td>
                                        <td style={{ padding: "11px 14px", fontSize: 13, color: "var(--color-text-secondary)" }}>{sizeMB}</td>
                                        <td style={{ padding: "11px 14px", fontSize: 12, color: "var(--color-text-secondary)" }}>{uploaded}</td>
                                        <td style={{ padding: "11px 14px" }}><StatusPill status={doc.status} /></td>
                                        <td style={{ padding: "11px 14px" }}>
                                            <button onClick={() => deleteDoc(doc.id)} style={{ padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", background: "var(--color-background-danger)", color: "var(--color-text-danger)", border: "1px solid var(--color-border-danger)" }}>Delete</button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}

// ─── TAB: PYQ INTELLIGENCE ENGINE ─────────────────────────────────────────────
function PyqEngine({ pyqs, setPyqs, showMsg }) {
    const [filterSubject, setFilterSubject] = useState("all");
    const [importText, setImportText] = useState("");
    const [showImport, setShowImport] = useState(false);

    const filtered = filterSubject === "all" ? pyqs : pyqs.filter(q => q.subject_id === filterSubject);

    const catCounts = Object.fromEntries(
        ["Core", "Frequent", "Occasional", "Rare"].map(c => [c, pyqs.filter(q => q.category === c).length])
    );

    const changeCategory = (id, cat) => setPyqs(qs => qs.map(q => q.id === id ? { ...q, category: cat } : q));

    const importPyqs = () => {
        try {
            const parsed = JSON.parse(importText);
            const arr = Array.isArray(parsed) ? parsed : [parsed];
            const newQs = arr.map(q => ({
                id: "q" + Date.now() + Math.random(), question: q.question, year: q.year || 2024,
                subject_id: q.subject_id || filterSubject || "s1", topic: q.topic || "General",
                category: q.category || (q.frequency >= 15 ? "Core" : q.frequency >= 8 ? "Frequent" : q.frequency >= 3 ? "Occasional" : "Rare"),
                frequency: q.frequency || 1,
            }));
            setPyqs(qs => [...newQs, ...qs]);
            setImportText("");
            setShowImport(false);
            showMsg(`Imported ${newQs.length} PYQs`);
        } catch {
            showMsg("Invalid JSON format", true);
        }
    };

    const autoClassify = () => {
        setPyqs(qs => qs.map(q => ({
            ...q, category: q.frequency >= 15 ? "Core" : q.frequency >= 8 ? "Frequent" : q.frequency >= 3 ? "Occasional" : "Rare"
        })));
        showMsg("Auto-classification complete");
    };

    return (
        <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
                {["Core", "Frequent", "Occasional", "Rare"].map(cat => {
                    const cfg = PYQ_CAT_CONFIG[cat];
                    return (
                        <div key={cat} style={{ background: cfg.bg, border: `1px solid ${cfg.color}30`, borderRadius: "var(--border-radius-md)", padding: "14px 16px" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: cfg.color, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>{cat}</div>
                            <div style={{ fontSize: 28, fontWeight: 500, color: cfg.color }}>{catCounts[cat]}</div>
                            <div style={{ fontSize: 11, color: cfg.color, opacity: 0.7, marginTop: 2 }}>{cfg.symbol}</div>
                        </div>
                    );
                })}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", background: "var(--surface)", padding: "6px", borderRadius: "20px", border: "1px solid var(--border)" }}>
                    <button onClick={() => setFilterSubject("all")} style={{ padding: "6px 18px", borderRadius: "14px", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.2s", border: "none", background: filterSubject === "all" ? "linear-gradient(135deg, var(--amber), #FF8A00)" : "transparent", color: filterSubject === "all" ? "var(--ink)" : "var(--text-3)", boxShadow: filterSubject === "all" ? "0 4px 12px var(--amber-glow)" : "none" }} onMouseEnter={e => { if (filterSubject !== "all") { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.background = "var(--surface-2)"; } }} onMouseLeave={e => { if (filterSubject !== "all") { e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.background = "transparent"; } }}>All</button>
                    {SUBJECTS.map(s => (
                        <button key={s.id} onClick={() => setFilterSubject(s.id)} style={{ padding: "6px 18px", borderRadius: "14px", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.2s", border: "none", background: filterSubject === s.id ? s.color : "transparent", color: filterSubject === s.id ? "#fff" : "var(--text-3)", boxShadow: filterSubject === s.id ? `0 4px 12px ${s.color}60` : "none" }} onMouseEnter={e => { if (filterSubject !== s.id) { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.background = "var(--surface-2)"; } }} onMouseLeave={e => { if (filterSubject !== s.id) { e.currentTarget.style.color = "var(--text-3)"; e.currentTarget.style.background = "transparent"; } }}>{s.abbr}</button>
                    ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={autoClassify} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", background: "var(--color-background-info)", color: "var(--color-text-info)", border: "1px solid var(--color-border-info)" }}>Auto-classify by Frequency</button>
                    <button onClick={() => setShowImport(!showImport)} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", background: "var(--color-background-secondary)", color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border-tertiary)" }}>Import JSON</button>
                </div>
            </div>

            {showImport && (
                <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: 16, marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 8 }}>
                        Format: <code style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>[{'{'}question, year, subject_id, topic, frequency, category{'}'}]</code>
                    </div>
                    <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={6}
                        placeholder={`[{"question":"What is...", "year":2023, "subject_id":"s1", "topic":"Joints", "frequency":14}]`}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: 12, fontFamily: "var(--font-mono)", resize: "vertical", boxSizing: "border-box", marginBottom: 10 }} />
                    <button onClick={importPyqs} disabled={!importText.trim()} style={{ padding: "7px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", background: "var(--color-text-success)", color: "#fff", border: "none" }}>Import</button>
                </div>
            )}

            <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden" }}>
                {filtered.map((q, i) => {
                    const cfg = PYQ_CAT_CONFIG[q.category];
                    const subj = SUBJECTS.find(s => s.id === q.subject_id);
                    return (
                        <div key={q.id} style={{ padding: "14px 18px", borderBottom: i < filtered.length - 1 ? "0.5px solid var(--color-border-tertiary)" : "none", display: "flex", alignItems: "flex-start", gap: 14 }}>
                            <div style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: cfg.color, flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 13, color: "var(--color-text-primary)", marginBottom: 6, lineHeight: 1.5 }}>{q.question}</div>
                                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                    {subj && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: subj.color + "20", color: subj.color, fontWeight: 700 }}>{subj.abbr}</span>}
                                    <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{q.topic}</span>
                                    <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>· {q.year}</span>
                                    <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--color-text-secondary)" }}>freq: {q.frequency}</span>
                                </div>
                            </div>
                            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                {["Core", "Frequent", "Occasional", "Rare"].map(cat => (
                                    <button key={cat} onClick={() => changeCategory(q.id, cat)} style={{
                                        padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: "pointer",
                                        background: q.category === cat ? PYQ_CAT_CONFIG[cat].bg : "transparent",
                                        color: q.category === cat ? PYQ_CAT_CONFIG[cat].color : "var(--color-text-secondary)",
                                        border: `1px solid ${q.category === cat ? PYQ_CAT_CONFIG[cat].color + "60" : "var(--color-border-tertiary)"}`,
                                    }}>{cat.slice(0, 4)}</button>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── TAB: STUDENT TIERS ───────────────────────────────────────────────────────
function StudentTiers({ models, tierConfigs, setTierConfigs, showMsg }) {
    const [selectedTier, setSelectedTier] = useState("Average-Top 1000");

    const levels = ["Weak", "Average", "Strong"];
    const goals = ["Secure Seat", "Top 1000", "Top 100"];

    const cfg = tierConfigs[selectedTier] || {};
    const update = (field, val) => setTierConfigs(tc => ({ ...tc, [selectedTier]: { ...tc[selectedTier], [field]: val } }));

    const [lvl, goal] = selectedTier.split("-").reduce((acc, p, i, arr) => {
        if (i === 0) return [[p], []];
        return [[...acc[0]], [acc[0], p].flat().slice(1)];
    }, [[], []]);

    return (
        <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2, marginBottom: 20, background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", padding: 4 }}>
                {levels.flatMap(l => goals.map(g => {
                    const key = `${l}-${g}`;
                    const lc = LEVEL_COLORS[l];
                    return (
                        <button key={key} onClick={() => setSelectedTier(key)} style={{
                            padding: "10px 8px", borderRadius: "var(--border-radius-md)", cursor: "pointer", textAlign: "center",
                            background: selectedTier === key ? "var(--color-background-primary)" : "transparent",
                            border: selectedTier === key ? `1px solid ${lc?.border}` : "1px solid transparent",
                        }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: lc?.text, letterSpacing: "0.05em", textTransform: "uppercase" }}>{l}</div>
                            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>{g}</div>
                        </button>
                    );
                }))}
            </div>

            {cfg && (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <SectionCard title="Question Mix" subtitle="Percentage breakdown for each session">
                        {[["saq_pct", "Short Answer (SAQ)", "#3b82f6"], ["laq_pct", "Long Answer (LAQ)", "#a855f7"], ["mcq_pct", "MCQ (Multiple Choice)", "#22c55e"]].map(([field, label, color]) => (
                            <div key={field} style={{ marginBottom: 16 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                                    <label style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)" }}>{label}</label>
                                    <span style={{ fontSize: 13, fontWeight: 600, color, fontFamily: "var(--font-mono)" }}>{cfg[field]}%</span>
                                </div>
                                <input type="range" min={0} max={100} step={5} value={cfg[field]}
                                    onChange={e => {
                                        const val = parseInt(e.target.value);
                                        const other = field === "saq_pct" ? ["laq_pct", "mcq_pct"] : field === "laq_pct" ? ["saq_pct", "mcq_pct"] : ["saq_pct", "laq_pct"];
                                        const remaining = 100 - val;
                                        const curr0 = cfg[other[0]], curr1 = cfg[other[1]];
                                        const total = curr0 + curr1 || 1;
                                        update(field, val);
                                        update(other[0], Math.round(remaining * curr0 / total));
                                        update(other[1], Math.round(remaining * curr1 / total));
                                    }}
                                    style={{ width: "100%", accentColor: color }} />
                                <div style={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", marginTop: 6, gap: 1 }}>
                                    <div style={{ width: `${cfg.saq_pct}%`, background: "#3b82f6", transition: "width 0.2s" }} />
                                    <div style={{ width: `${cfg.laq_pct}%`, background: "#a855f7", transition: "width 0.2s" }} />
                                    <div style={{ width: `${cfg.mcq_pct}%`, background: "#22c55e", transition: "width 0.2s" }} />
                                </div>
                            </div>
                        ))}
                    </SectionCard>

                    <SectionCard title="Assessment Config" subtitle="Mastery and diagnostic settings">
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                                <label style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)" }}>Mastery Threshold</label>
                                <span style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--font-mono)", color: cfg.mastery_threshold >= 85 ? "#22c55e" : cfg.mastery_threshold >= 75 ? "#eab308" : "#e04444" }}>{cfg.mastery_threshold}%</span>
                            </div>
                            <input type="range" min={50} max={100} step={5} value={cfg.mastery_threshold} onChange={e => update("mastery_threshold", parseInt(e.target.value))} style={{ width: "100%", accentColor: "#3b82f6" }} />
                            <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 4 }}>Student must score ≥{cfg.mastery_threshold}% to mark a topic complete</div>
                        </div>

                        <div style={{ marginBottom: 20 }}>
                            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)", display: "block", marginBottom: 8 }}>Diagnostic SAQs per topic entry</label>
                            <div style={{ display: "flex", gap: 8 }}>
                                {[2, 3, 4, 5].map(n => (
                                    <button key={n} onClick={() => update("diagnostic_qs", n)} style={{
                                        flex: 1, padding: "8px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer",
                                        background: cfg.diagnostic_qs === n ? "var(--color-background-info)" : "var(--color-background-secondary)",
                                        color: cfg.diagnostic_qs === n ? "var(--color-text-info)" : "var(--color-text-secondary)",
                                        border: `1px solid ${cfg.diagnostic_qs === n ? "var(--color-border-info)" : "var(--color-border-tertiary)"}`,
                                    }}>{n}</button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)", display: "block", marginBottom: 8 }}>Assigned AI Model</label>
                            <select value={cfg.model_id} onChange={e => update("model_id", e.target.value)}
                                style={{ width: "100%", padding: "8px 12px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: 13 }}>
                                {models.map(m => <option key={m.id} value={m.id}>{m.name} ({m.base_model})</option>)}
                            </select>
                            {cfg.model_id && (
                                <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 8, background: "var(--color-background-secondary)", fontSize: 12 }}>
                                    <span style={{ color: "var(--color-text-secondary)" }}>Active model: </span>
                                    <span style={{ fontWeight: 600, color: "var(--color-text-primary)" }}>{models.find(m => m.id === cfg.model_id)?.name}</span>
                                    <StatusPill status={models.find(m => m.id === cfg.model_id)?.status || "draft"} />
                                </div>
                            )}
                        </div>
                    </SectionCard>
                </div>
            )}

            <div style={{ marginTop: 16, background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", padding: "14px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                    Configuration for: <strong style={{ color: "var(--color-text-primary)" }}>{selectedTier}</strong>
                </div>
                <button onClick={() => showMsg(`Tier config saved: ${selectedTier}`)} style={{ padding: "7px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", background: "var(--color-text-success)", color: "#fff", border: "none" }}>
                    Save Configuration
                </button>
            </div>
        </div>
    );
}

// ─── TAB: BEHAVIOR TAG LIBRARY ────────────────────────────────────────────────
function BehaviorTagLibrary({ customTags, setCustomTags, models, setModels, showMsg }) {
    const [activeGroup, setActiveGroup] = useState("all");
    const [previewTag, setPreviewTag] = useState(null);
    const [editingTag, setEditingTag] = useState(null); // null | "new" | tagId

    const emptyForm = { label: "", group: "custom", description: "", prompt_snippet: "" };
    const [form, setForm] = useState(emptyForm);

    const allTags = [...PRESET_BEHAVIOR_TAGS, ...customTags];
    const filtered = activeGroup === "all" ? allTags : allTags.filter(t => t.group === activeGroup);

    const startNew = () => { setForm(emptyForm); setEditingTag("new"); setPreviewTag(null); };
    const startEdit = (tag) => { if (tag.isPreset) return; setForm({ label: tag.label, group: tag.group, description: tag.description, prompt_snippet: tag.prompt_snippet }); setEditingTag(tag.id); setPreviewTag(null); };

    const saveTag = () => {
        if (!form.label.trim() || !form.prompt_snippet.trim()) return showMsg("Label and prompt snippet are required", true);
        if (editingTag === "new") {
            const t = { id: "ct_" + Date.now(), ...form, isPreset: false };
            setCustomTags(ts => [...ts, t]);
            showMsg(`Tag "${t.label}" created`);
        } else {
            setCustomTags(ts => ts.map(t => t.id === editingTag ? { ...t, ...form } : t));
            showMsg(`Tag updated`);
        }
        setEditingTag(null);
        setForm(emptyForm);
    };

    const deleteTag = (id) => {
        setCustomTags(ts => ts.filter(t => t.id !== id));
        setModels(ms => ms.map(m => ({ ...m, behavior_tags: (m.behavior_tags || []).filter(bt => bt !== id) })));
        if (editingTag === id) setEditingTag(null);
        if (previewTag?.id === id) setPreviewTag(null);
        showMsg("Tag deleted");
    };

    const tagUsage = (tagId) => models.filter(m => (m.behavior_tags || []).includes(tagId)).map(m => m.name);

    return (
        <div style={{ display: "flex", gap: 16 }}>
            {/* Left column: tag list */}
            <div style={{ width: 260, flexShrink: 0 }}>
                <button onClick={startNew} style={{
                    width: "100%", padding: "10px 14px", borderRadius: "var(--border-radius-md)", fontSize: 13, fontWeight: 500,
                    background: "var(--color-background-info)", color: "var(--color-text-info)",
                    border: "1px solid var(--color-border-info)", cursor: "pointer", marginBottom: 12, textAlign: "left",
                }}>+ Create Custom Tag</button>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                    <button onClick={() => setActiveGroup("all")} style={{ padding: "3px 9px", borderRadius: 12, fontSize: 11, fontWeight: 600, cursor: "pointer", background: activeGroup === "all" ? "var(--color-background-secondary)" : "transparent", color: activeGroup === "all" ? "var(--color-text-primary)" : "var(--color-text-secondary)", border: "0.5px solid var(--color-border-tertiary)" }}>All</button>
                    {Object.entries(TAG_GROUP_META).map(([grp, meta]) => (
                        <button key={grp} onClick={() => setActiveGroup(grp)} style={{ padding: "3px 9px", borderRadius: 12, fontSize: 11, fontWeight: 600, cursor: "pointer", background: activeGroup === grp ? meta.bg : "transparent", color: activeGroup === grp ? meta.color : "var(--color-text-secondary)", border: `0.5px solid ${activeGroup === grp ? meta.border : "var(--color-border-tertiary)"}` }}>
                            {meta.label}
                        </button>
                    ))}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {filtered.map(tag => {
                        const meta = TAG_GROUP_META[tag.group];
                        const usage = tagUsage(tag.id);
                        const isActive = previewTag?.id === tag.id || editingTag === tag.id;
                        return (
                            <div key={tag.id} onClick={() => { setPreviewTag(tag); if (editingTag) setEditingTag(null); }}
                                style={{
                                    padding: "10px 12px", borderRadius: "var(--border-radius-md)", cursor: "pointer",
                                    background: isActive ? "var(--color-background-secondary)" : "var(--color-background-primary)",
                                    border: `0.5px solid ${isActive ? "var(--color-border-secondary)" : "var(--color-border-tertiary)"}`,
                                    borderLeft: `3px solid ${meta.color}`,
                                }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", lineHeight: 1.3 }}>{tag.label}</div>
                                    {!tag.isPreset && (
                                        <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: meta.bg, color: meta.color, fontWeight: 700, flexShrink: 0, marginLeft: 4 }}>CUSTOM</span>
                                    )}
                                </div>
                                <div style={{ fontSize: 11, color: meta.color, marginTop: 3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{meta.label}</div>
                                {usage.length > 0 && (
                                    <div style={{ marginTop: 5, fontSize: 10, color: "var(--color-text-secondary)" }}>Used in {usage.length} model(s)</div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Right: detail / edit panel */}
            <div style={{ flex: 1 }}>
                {editingTag !== null ? (
                    <SectionCard title={editingTag === "new" ? "Create Custom Tag" : "Edit Tag"} subtitle="Tags inject behavior directives directly into the AI system prompt">
                        <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Tag Label</label>
                                <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Rapid Fire Recall"
                                    style={{ width: "100%", padding: "8px 12px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: 13, boxSizing: "border-box" }} />
                            </div>
                            <div style={{ width: 180 }}>
                                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Group</label>
                                <select value={form.group} onChange={e => setForm(f => ({ ...f, group: e.target.value }))}
                                    style={{ width: "100%", padding: "8px 12px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: 13 }}>
                                    {Object.entries(TAG_GROUP_META).map(([grp, meta]) => (
                                        <option key={grp} value={grp}>{meta.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div style={{ marginBottom: 14 }}>
                            <label style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.05em" }}>Short Description</label>
                            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="One line — shown as tooltip on tag chips"
                                style={{ width: "100%", padding: "8px 12px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: 13, boxSizing: "border-box" }} />
                        </div>

                        <div style={{ marginBottom: 18 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                                <label style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Prompt Snippet</label>
                                <span style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>This text is injected verbatim into the AI system prompt</span>
                            </div>
                            <textarea value={form.prompt_snippet} onChange={e => setForm(f => ({ ...f, prompt_snippet: e.target.value }))} rows={7}
                                placeholder="Write a detailed behavioral instruction. This will be appended to the model's system prompt when this tag is active.&#10;&#10;Example: 'After every student response, ask one follow-up question that tests a related concept. Never accept an answer without probing deeper.'"
                                style={{ width: "100%", padding: "10px 12px", borderRadius: "var(--border-radius-md)", border: "0.5px solid var(--color-border-secondary)", background: "var(--color-background-secondary)", color: "var(--color-text-primary)", fontSize: 13, fontFamily: "var(--font-mono)", lineHeight: 1.6, resize: "vertical", boxSizing: "border-box" }} />
                        </div>

                        {/* Live preview */}
                        {form.prompt_snippet && (
                            <div style={{ padding: "12px 14px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)", marginBottom: 16 }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Preview — as injected into prompt</div>
                                <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--color-text-primary)", lineHeight: 1.6 }}>
                                    <span style={{ color: "var(--color-text-secondary)" }}>[{form.label?.toUpperCase() || "TAG NAME"}]: </span>
                                    {form.prompt_snippet}
                                </div>
                            </div>
                        )}

                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <button onClick={() => { setEditingTag(null); setForm(emptyForm); }} style={{ padding: "8px 18px", borderRadius: 8, fontSize: 13, cursor: "pointer", background: "transparent", color: "var(--color-text-secondary)", border: "0.5px solid var(--color-border-tertiary)" }}>Cancel</button>
                            <button onClick={saveTag} disabled={!form.label.trim() || !form.prompt_snippet.trim()} style={{ padding: "8px 24px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", background: "var(--color-text-success)", color: "#fff" }}>
                                {editingTag === "new" ? "Create Tag" : "Save Changes"}
                            </button>
                        </div>
                    </SectionCard>
                ) : previewTag ? (
                    <>
                        <div style={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-tertiary)", borderRadius: "var(--border-radius-lg)", overflow: "hidden", marginBottom: 16 }}>
                            <div style={{ height: 4, background: TAG_GROUP_META[previewTag.group]?.color }} />
                            <div style={{ padding: "20px 24px" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                                    <div>
                                        <div style={{ fontSize: 18, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 4 }}>{previewTag.label}</div>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: TAG_GROUP_META[previewTag.group]?.color, textTransform: "uppercase", letterSpacing: "0.06em" }}>{TAG_GROUP_META[previewTag.group]?.label}</div>
                                    </div>
                                    <div style={{ display: "flex", gap: 8 }}>
                                        {!previewTag.isPreset && (
                                            <>
                                                <button onClick={() => startEdit(previewTag)} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", background: "var(--color-background-info)", color: "var(--color-text-info)", border: "1px solid var(--color-border-info)" }}>Edit</button>
                                                <button onClick={() => deleteTag(previewTag.id)} style={{ padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", background: "var(--color-background-danger)", color: "var(--color-text-danger)", border: "1px solid var(--color-border-danger)" }}>Delete</button>
                                            </>
                                        )}
                                        {previewTag.isPreset && <span style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, background: "var(--color-background-secondary)", color: "var(--color-text-secondary)" }}>Built-in preset</span>}
                                    </div>
                                </div>

                                <div style={{ fontSize: 13, color: "var(--color-text-secondary)", marginBottom: 16, lineHeight: 1.5 }}>{previewTag.description}</div>

                                <div style={{ padding: "14px 16px", borderRadius: "var(--border-radius-md)", background: "var(--color-background-secondary)", border: "0.5px solid var(--color-border-tertiary)" }}>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Prompt Snippet</div>
                                    <div style={{ fontSize: 13, fontFamily: "var(--font-mono)", color: "var(--color-text-primary)", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{previewTag.prompt_snippet}</div>
                                </div>
                            </div>
                        </div>

                        <SectionCard title="Model Usage" subtitle="Which model variants currently have this tag active">
                            {tagUsage(previewTag.id).length > 0 ? (
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                                    {tagUsage(previewTag.id).map(name => (
                                        <span key={name} style={{ fontSize: 12, padding: "4px 12px", borderRadius: 8, background: "var(--color-background-secondary)", color: "var(--color-text-primary)", border: "0.5px solid var(--color-border-tertiary)" }}>{name}</span>
                                    ))}
                                </div>
                            ) : (
                                <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Not assigned to any model yet. Go to Model Studio → Behavior Tags to assign.</div>
                            )}
                        </SectionCard>
                    </>
                ) : (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-lg)", flexDirection: "column", gap: 12 }}>
                        <div style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Select a tag to preview its prompt snippet</div>
                        <div style={{ fontSize: 12, color: "var(--color-text-secondary)", opacity: 0.7 }}>or create a new custom tag</div>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── TAB: OVERVIEW / DASHBOARD ────────────────────────────────────────────────
function Overview({ models, docs, pyqs }) {
    const readyModels = models.filter(m => m.status === "ready").length;
    const indexedDocs = docs.filter(d => d.status === "indexed").length;
    const corePyqs = pyqs.filter(q => q.category === "Core").length;

    const subjectCoverage = SUBJECTS.map(s => ({
        ...s,
        docs: docs.filter(d => d.subject_id === s.id).length,
        pyqs: pyqs.filter(q => q.subject_id === s.id).length,
    }));

    return (
        <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
                {[
                    { label: "AI Models", val: models.length, sub: `${readyModels} deployed`, color: "var(--color-text-info)" },
                    { label: "RAG Documents", val: docs.length, sub: `${indexedDocs} indexed`, color: "var(--color-text-success)" },
                    { label: "PYQ Bank", val: pyqs.length, sub: `${corePyqs} core questions`, color: "var(--color-text-danger)" },
                    { label: "Subjects", val: SUBJECTS.length, sub: "19 total curriculum", color: "var(--color-text-warning)" },
                ].map(s => (
                    <div key={s.label} style={{ background: "var(--color-background-secondary)", borderRadius: "var(--border-radius-md)", padding: "16px 18px" }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{s.label}</div>
                        <div style={{ fontSize: 28, fontWeight: 500, color: s.color, marginBottom: 2 }}>{s.val}</div>
                        <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{s.sub}</div>
                    </div>
                ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <SectionCard title="Model Registry" subtitle="All deployed variants">
                    {models.map(m => (
                        <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>{m.name}</div>
                                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 2 }}>{m.capabilities.length} capabilities · {m.target_levels.length} levels</div>
                            </div>
                            <StatusPill status={m.status} />
                        </div>
                    ))}
                </SectionCard>

                <SectionCard title="Subject Coverage" subtitle="Documents and PYQs per subject">
                    {subjectCoverage.filter(s => s.docs + s.pyqs > 0).map(s => (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "0.5px solid var(--color-border-tertiary)" }}>
                            <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: s.color + "20", color: s.color, fontWeight: 700, width: 36, textAlign: "center" }}>{s.abbr}</span>
                            <div style={{ flex: 1 }}>
                                <div style={{ height: 4, background: "var(--color-background-secondary)", borderRadius: 2, overflow: "hidden" }}>
                                    <div style={{ height: "100%", width: `${Math.min(100, (s.docs + s.pyqs) * 8)}%`, background: s.color, borderRadius: 2 }} />
                                </div>
                            </div>
                            <span style={{ fontSize: 11, color: "var(--color-text-secondary)", fontFamily: "var(--font-mono)", width: 70, textAlign: "right" }}>{s.docs}d / {s.pyqs}q</span>
                        </div>
                    ))}
                </SectionCard>
            </div>
        </div>
    );
}

// ─── MAIN PANEL ───────────────────────────────────────────────────────────────
export default function AdvancedAdminPanel() {
    const [tab, setTab] = useState("overview");
    const [models, setModels] = useState(() => JSON.parse(localStorage.getItem("admin_models")) || INITIAL_MODELS);
    const [pyqs, setPyqs] = useState(() => JSON.parse(localStorage.getItem("admin_pyqs")) || INITIAL_PYQS);
    const [tierConfigs, setTierConfigs] = useState(() => JSON.parse(localStorage.getItem("admin_tiers")) || TIER_CONFIGS_INIT);
    const [customTags, setCustomTags] = useState(() => JSON.parse(localStorage.getItem("admin_tags")) || []);
    const [toast, setToast] = useState(null);

    useEffect(() => { localStorage.setItem("admin_models", JSON.stringify(models)); }, [models]);
    useEffect(() => { localStorage.setItem("admin_pyqs", JSON.stringify(pyqs)); }, [pyqs]);
    useEffect(() => { localStorage.setItem("admin_tiers", JSON.stringify(tierConfigs)); }, [tierConfigs]);
    useEffect(() => { localStorage.setItem("admin_tags", JSON.stringify(customTags)); }, [customTags]);

    const showMsg = (text, isErr = false) => {
        setToast({ text, isErr });
        setTimeout(() => setToast(null), 3000);
    };

    const TABS = [
        { id: "overview", label: "Overview" },
        { id: "models", label: "Model Studio" },
        { id: "behaviors", label: "Behavior Tags" },
        { id: "rag", label: "RAG Pipeline" },
        { id: "pyq", label: "PYQ Engine" },
        { id: "tiers", label: "Student Tiers" },
    ];

    return (
        <div style={{ fontFamily: "var(--font-sans)", maxWidth: 1200, margin: "0 auto", padding: "0 0 40px" }}>
            <div style={{ marginBottom: 24 }}>
                <h1 style={{ fontSize: 22, fontWeight: 500, color: "var(--color-text-primary)", margin: "0 0 4px" }}>NEET-PG Admin Console</h1>
                <p style={{ fontSize: 14, color: "var(--color-text-secondary)", margin: 0 }}>Configure AI models, RAG documents, PYQ intelligence, and adaptive student tiers</p>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 32, background: "var(--surface)", borderRadius: "20px", padding: "8px", border: "1px solid var(--border)", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.05)" }}>
                {TABS.map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} style={{
                        flex: 1, padding: "12px 16px", borderRadius: "14px", fontSize: 14, fontWeight: tab === t.id ? 700 : 500, fontFamily: "var(--font-display)",
                        cursor: "pointer", border: "none", transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                        background: tab === t.id ? "linear-gradient(135deg, var(--amber) 0%, #E89B1A 100%)" : "transparent",
                        color: tab === t.id ? "var(--ink)" : "var(--text-2)",
                        transform: tab === t.id ? "scale(1.02)" : "scale(1)",
                        boxShadow: tab === t.id ? "0 8px 20px var(--amber-glow), inset 0 1px 0 rgba(255,255,255,0.2)" : "none",
                    }}
                        onMouseEnter={e => { if (tab !== t.id) { e.currentTarget.style.color = "var(--text)"; e.currentTarget.style.background = "var(--surface-2)"; } }}
                        onMouseLeave={e => { if (tab !== t.id) { e.currentTarget.style.color = "var(--text-2)"; e.currentTarget.style.background = "transparent"; } }}
                    >{t.label}</button>
                ))}
            </div>

            {tab === "overview" && <Overview models={models} docs={[]} pyqs={pyqs} />}
            {tab === "models" && <ModelStudio models={models} setModels={setModels} customTags={customTags} showMsg={showMsg} />}
            {tab === "behaviors" && <BehaviorTagLibrary customTags={customTags} setCustomTags={setCustomTags} models={models} setModels={setModels} showMsg={showMsg} />}
            {tab === "rag" && <RagPipeline showMsg={showMsg} />}
            {tab === "pyq" && <PyqEngine pyqs={pyqs} setPyqs={setPyqs} showMsg={showMsg} />}
            {tab === "tiers" && <StudentTiers models={models} tierConfigs={tierConfigs} setTierConfigs={setTierConfigs} showMsg={showMsg} />}

            <Toast msg={toast} />
        </div>
    );
}
