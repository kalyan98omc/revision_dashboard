import { useState, useEffect, useRef, useCallback } from "react";
import AdminPanel from "./admin-page.jsx";

const NEET_SUBJECTS = [
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
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw data;
        return data;
    });
}

const TOPIC_CONFIG = {
    "Calculus": { emoji: "∫", color: "#FF6B9D", bg: "rgba(255,107,157,0.1)" },
    "Algebra": { emoji: "𝑥", color: "#4ECDC4", bg: "rgba(78,205,196,0.1)" },
    "Geometry": { emoji: "△", color: "#95E1D3", bg: "rgba(149,225,211,0.1)" },
    "Physics": { emoji: "⚛", color: "#FFB347", bg: "rgba(255,179,71,0.1)" },
    "Chemistry": { emoji: "🧪", color: "#FF6B9D", bg: "rgba(255,107,157,0.1)" },
    "Biology": { emoji: "🔬", color: "#6BCB77", bg: "rgba(107,203,119,0.1)" },
    "Genetics": { emoji: "🧬", color: "#9B8FFF", bg: "rgba(155,143,255,0.1)" },
    "Medicine": { emoji: "🩺", color: "#FF6B9D", bg: "rgba(255,107,157,0.1)" },
    "History": { emoji: "📜", color: "#A89968", bg: "rgba(168,153,104,0.1)" },
    "Anatomy": { emoji: "🦴", color: "#c0392b", bg: "rgba(192,57,43,0.1)" },
    "Physiology": { emoji: "❤️", color: "#2980b9", bg: "rgba(41,128,185,0.1)" },
    "Biochemistry": { emoji: "⚗️", color: "#8e44ad", bg: "rgba(142,68,173,0.1)" },
    "Pharmacology": { emoji: "💊", color: "#d35400", bg: "rgba(211,84,0,0.1)" },
    "Pathology": { emoji: "🔬", color: "#16a085", bg: "rgba(22,160,133,0.1)" },
    "Surgery": { emoji: "🔪", color: "#f39c12", bg: "rgba(243,156,18,0.1)" },
    "Microbiology": { emoji: "🦠", color: "#c0392b", bg: "rgba(192,57,43,0.1)" },
    "Obstetrics": { emoji: "👶", color: "#e91e63", bg: "rgba(233,30,99,0.1)" },
    "Pediatrics": { emoji: "🧒", color: "#00bcd4", bg: "rgba(0,188,212,0.1)" },
    "Psychiatry": { emoji: "🧠", color: "#673ab7", bg: "rgba(103,58,183,0.1)" },
    "Dermatology": { emoji: "🩹", color: "#ff5722", bg: "rgba(255,87,34,0.1)" },
};

function getTopicConfig(topic) {
    return TOPIC_CONFIG[topic] || { emoji: "📚", color: "#999", bg: "rgba(153,153,153,0.1)" };
}

function formatTimeAgo(date) {
    const now = new Date();
    const diff = now - new Date(date);
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(diff / 86400000)}d ago`;
}

// ─── REALTIME VOICE PANEL ─────────────────────────────────────────────────────
// Uses OpenAI Realtime API via WebRTC with an ephemeral session token
function RealtimeVoicePanel({ activeSession, topicConfig, onClose }) {
    const [rtStatus, setRtStatus] = useState("idle"); // idle | connecting | connected | speaking | listening | error
    const [transcript, setTranscript] = useState([]);
    const [errorMsg, setErrorMsg] = useState("");
    const [isMuted, setIsMuted] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0);

    const pcRef = useRef(null);         // RTCPeerConnection
    const dcRef = useRef(null);         // RTCDataChannel
    const localStreamRef = useRef(null);
    const audioElRef = useRef(null);
    const analyserRef = useRef(null);
    const animFrameRef = useRef(null);
    const transcriptEndRef = useRef(null);

    useEffect(() => {
        transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [transcript]);

    // ── Audio level visualizer ──────────────────────────────────────────────
    const startVisualizer = (stream) => {
        const ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        analyserRef.current = analyser;
        const buf = new Uint8Array(analyser.frequencyBinCount);
        const tick = () => {
            analyser.getByteFrequencyData(buf);
            const avg = buf.reduce((s, v) => s + v, 0) / buf.length;
            setAudioLevel(Math.min(100, avg * 2));
            animFrameRef.current = requestAnimationFrame(tick);
        };
        tick();
    };

    // ── Connect to OpenAI Realtime API via WebRTC ────────────────────────────
    const connect = async () => {
        try {
            setRtStatus("connecting");
            setErrorMsg("");

            // 1. Get ephemeral token from our backend
            const tokenData = await apiFetch("/chat/realtime/token", {
                method: "POST",
                body: { subject_id: activeSession?.subject_id },
            });
            const ephemeralKey = tokenData?.client_secret?.value;
            if (!ephemeralKey) throw new Error("Failed to get realtime session token");

            // 2. Get microphone
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            localStreamRef.current = stream;
            startVisualizer(stream);

            // 3. Create RTCPeerConnection
            const pc = new RTCPeerConnection();
            pcRef.current = pc;

            // 4. Play AI audio via <audio> element
            pc.ontrack = (e) => {
                if (audioElRef.current) {
                    audioElRef.current.srcObject = e.streams[0];
                    audioElRef.current.play().catch(() => {});
                }
                setRtStatus("listening");
            };

            // 5. Add local mic track
            stream.getTracks().forEach(t => pc.addTrack(t, stream));

            // 6. Open data channel for events (transcripts, etc.)
            const dc = pc.createDataChannel("oai-events");
            dcRef.current = dc;

            dc.onmessage = (e) => {
                try {
                    const event = JSON.parse(e.data);
                    handleRealtimeEvent(event);
                } catch { /* ignore malformed */ }
            };
            dc.onopen = () => setRtStatus("listening");
            dc.onerror = (err) => {
                console.error("DataChannel error:", err);
            };

            // 7. Create SDP offer
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // 8. Send offer to OpenAI Realtime API
            const model = tokenData?.model || "gpt-4o-realtime-preview-2024-12-17";
            const sdpResp = await fetch(`https://api.openai.com/v1/realtime?model=${model}`, {
                method: "POST",
                body: offer.sdp,
                headers: {
                    Authorization: `Bearer ${ephemeralKey}`,
                    "Content-Type": "application/sdp",
                },
            });
            if (!sdpResp.ok) throw new Error(`OpenAI SDP exchange failed (${sdpResp.status})`);

            const answerSdp = await sdpResp.text();
            await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
            setRtStatus("connected");

        } catch (err) {
            console.error("Realtime connect error:", err);
            setErrorMsg(err.message || "Connection failed");
            setRtStatus("error");
            cleanup();
        }
    };

    const handleRealtimeEvent = (event) => {
        switch (event.type) {
            case "response.audio_transcript.delta":
                setRtStatus("speaking");
                setTranscript(t => {
                    const last = t[t.length - 1];
                    if (last && last.role === "assistant") {
                        return [...t.slice(0, -1), { ...last, content: last.content + event.delta }];
                    }
                    return [...t, { role: "assistant", content: event.delta, id: Date.now() }];
                });
                break;
            case "response.audio_transcript.done":
                setRtStatus("listening");
                break;
            case "conversation.item.input_audio_transcription.completed":
                setTranscript(t => [...t, {
                    role: "user", content: event.transcript, id: Date.now()
                }]);
                break;
            case "input_audio_buffer.speech_started":
                setRtStatus("speaking_user");
                break;
            case "input_audio_buffer.speech_stopped":
                setRtStatus("listening");
                break;
            case "error":
                setErrorMsg(event.error?.message || "Realtime error");
                setRtStatus("error");
                break;
            default:
                break;
        }
    };

    const cleanup = () => {
        cancelAnimationFrame(animFrameRef.current);
        localStreamRef.current?.getTracks().forEach(t => t.stop());
        pcRef.current?.close();
        pcRef.current = null;
        dcRef.current = null;
        localStreamRef.current = null;
        setAudioLevel(0);
    };

    const disconnect = () => {
        cleanup();
        setRtStatus("idle");
        setErrorMsg("");
    };

    const toggleMute = () => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
            setIsMuted(m => !m);
        }
    };

    useEffect(() => () => cleanup(), []);

    const statusLabel = {
        idle: "Click the button below to start",
        connecting: "Connecting to AI Tutor...",
        connected: "Connected — speak freely",
        listening: "Listening...",
        speaking: "AI is responding...",
        speaking_user: "Hearing you...",
        error: errorMsg || "Connection error",
    }[rtStatus] || rtStatus;

    const isActive = ["connected", "listening", "speaking", "speaking_user"].includes(rtStatus);
    const waveColor = { speaking: "#52D78A", speaking_user: "#FCD34D", listening: "#60A5FA", connected: "#60A5FA" }[rtStatus] || "#6B7280";

    return (
        <div style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)",
            display: "flex", alignItems: "center", justifyContent: "center",
        }}>
            <div style={{
                width: "min(560px, 95vw)", maxHeight: "90vh",
                background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
                borderRadius: 24, overflow: "hidden", display: "flex", flexDirection: "column",
                boxShadow: "0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.08)",
            }}>
                {/* Header */}
                <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ fontSize: 24 }}>{topicConfig.emoji}</div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Live Voice Session</div>
                        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                            {activeSession?.title || "AI Tutor"} • OpenAI Realtime API
                        </div>
                    </div>
                    <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", border: "none", background: "rgba(255,255,255,0.1)", color: "#fff", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
                </div>

                {/* Visualizer area */}
                <div style={{ padding: "28px 24px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
                    {/* Animated orb */}
                    <div style={{ position: "relative", width: 140, height: 140, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {/* Pulse rings */}
                        {isActive && [1, 2, 3].map(i => (
                            <div key={i} style={{
                                position: "absolute",
                                width: 140 + audioLevel * 0.6 * i,
                                height: 140 + audioLevel * 0.6 * i,
                                borderRadius: "50%",
                                border: `2px solid ${waveColor}`,
                                opacity: 0.15 / i,
                                transition: "all 0.1s ease",
                            }} />
                        ))}
                        {/* Core orb */}
                        <div style={{
                            width: isActive ? 100 + audioLevel * 0.3 : 100,
                            height: isActive ? 100 + audioLevel * 0.3 : 100,
                            borderRadius: "50%",
                            background: isActive
                                ? `radial-gradient(circle, ${waveColor}40 0%, ${waveColor}20 60%, transparent 100%)`
                                : "radial-gradient(circle, rgba(107,114,128,0.2) 0%, transparent 100%)",
                            border: `3px solid ${isActive ? waveColor : "rgba(255,255,255,0.15)"}`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            transition: "all 0.15s ease",
                            boxShadow: isActive ? `0 0 40px ${waveColor}40` : "none",
                        }}>
                            <div style={{ fontSize: 36 }}>
                                {rtStatus === "speaking" ? "🤖" : rtStatus === "speaking_user" ? "🎙️" : rtStatus === "listening" ? "👂" : rtStatus === "connecting" ? "⏳" : rtStatus === "error" ? "❌" : "🎙️"}
                            </div>
                        </div>
                    </div>

                    {/* Status text */}
                    <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.9)", fontWeight: 600, marginBottom: 4 }}>{statusLabel}</div>
                        {isActive && (
                            <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
                                {[...Array(5)].map((_, i) => (
                                    <div key={i} style={{
                                        width: 4, borderRadius: 2, transition: "height 0.1s ease",
                                        height: Math.max(4, (audioLevel / 100) * 28 * (0.5 + Math.random() * 0.5)),
                                        background: waveColor,
                                        animation: isActive ? `waveBar 0.8s ease-in-out infinite ${i * 0.12}s alternate` : "none",
                                    }} />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Controls */}
                    <div style={{ display: "flex", gap: 12 }}>
                        {rtStatus === "idle" || rtStatus === "error" ? (
                            <button onClick={connect} style={{
                                padding: "12px 28px", borderRadius: 50, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14,
                                background: "linear-gradient(135deg, #52D78A, #00B894)",
                                color: "#000", boxShadow: "0 4px 20px rgba(82,215,138,0.4)",
                                display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s",
                            }}>
                                🎙️ {rtStatus === "error" ? "Retry" : "Start Voice"}
                            </button>
                        ) : rtStatus === "connecting" ? (
                            <button disabled style={{ padding: "12px 28px", borderRadius: 50, border: "none", background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)", fontWeight: 700, fontSize: 14, cursor: "not-allowed" }}>
                                Connecting...
                            </button>
                        ) : (
                            <>
                                <button onClick={toggleMute} style={{
                                    width: 50, height: 50, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.2)", cursor: "pointer",
                                    background: isMuted ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.1)",
                                    color: "#fff", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center",
                                    transition: "all 0.2s",
                                }} title={isMuted ? "Unmute" : "Mute"}>
                                    {isMuted ? "🔇" : "🎙️"}
                                </button>
                                <button onClick={disconnect} style={{
                                    padding: "12px 28px", borderRadius: 50, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 14,
                                    background: "rgba(239,68,68,0.85)", color: "#fff",
                                    boxShadow: "0 4px 20px rgba(239,68,68,0.4)",
                                    display: "flex", alignItems: "center", gap: 8, transition: "all 0.2s",
                                }}>
                                    ⏹ End Call
                                </button>
                            </>
                        )}
                    </div>

                    {errorMsg && rtStatus === "error" && (
                        <div style={{ fontSize: 12, color: "#f87171", textAlign: "center", maxWidth: 360, padding: "8px 12px", background: "rgba(239,68,68,0.1)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.2)" }}>
                            {errorMsg}
                        </div>
                    )}
                </div>

                {/* Live Transcript */}
                <div style={{ flex: 1, overflowY: "auto", margin: "0 24px 20px", background: "rgba(0,0,0,0.25)", borderRadius: 12, minHeight: 120, maxHeight: 200 }}>
                    {transcript.length === 0 ? (
                        <div style={{ padding: "20px 16px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
                            Live transcript will appear here…
                        </div>
                    ) : (
                        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                            {transcript.map((t) => (
                                <div key={t.id} style={{ display: "flex", justifyContent: t.role === "user" ? "flex-end" : "flex-start" }}>
                                    <div style={{
                                        maxWidth: "80%", padding: "8px 12px", borderRadius: 10, fontSize: 13, lineHeight: 1.5,
                                        background: t.role === "user" ? "rgba(250,204,21,0.15)" : "rgba(96,165,250,0.15)",
                                        color: t.role === "user" ? "#FCD34D" : "#93C5FD",
                                        border: `1px solid ${t.role === "user" ? "rgba(250,204,21,0.2)" : "rgba(96,165,250,0.2)"}`,
                                    }}>
                                        {t.content}
                                    </div>
                                </div>
                            ))}
                            <div ref={transcriptEndRef} />
                        </div>
                    )}
                </div>

                <audio ref={audioElRef} style={{ display: "none" }} autoPlay />
            </div>

            <style>{`
                @keyframes waveBar {
                    from { transform: scaleY(0.4); }
                    to   { transform: scaleY(1.0); }
                }
            `}</style>
        </div>
    );
}


// ─── BEHAVIOR TAG GROUP COLORS ───────────────────────────────────────────────
const TAG_GROUP_COLORS = {
    persona:   { color: "#8b5cf6", bg: "rgba(139,92,246,0.15)", border: "rgba(139,92,246,0.35)" },
    method:    { color: "#0ea5e9", bg: "rgba(14,165,233,0.15)",  border: "rgba(14,165,233,0.35)" },
    challenge: { color: "#f97316", bg: "rgba(249,115,22,0.15)",  border: "rgba(249,115,22,0.35)" },
    support:   { color: "#22c55e", bg: "rgba(34,197,94,0.15)",   border: "rgba(34,197,94,0.35)" },
    clinical:  { color: "#e11d48", bg: "rgba(225,29,72,0.15)",   border: "rgba(225,29,72,0.35)" },
    exam:      { color: "#eab308", bg: "rgba(234,179,8,0.15)",   border: "rgba(234,179,8,0.35)" },
    custom:    { color: "#6b7280", bg: "rgba(107,114,128,0.15)", border: "rgba(107,114,128,0.35)" },
};

const PRESET_TAGS_BRIEF = {
    bt_companion: { label: "Study Companion", group: "persona" },
    bt_teacher:   { label: "Act as Teacher",  group: "persona" },
    bt_crossq:    { label: "Cross Question",  group: "challenge" },
    bt_socratic:  { label: "Socratic Method", group: "method" },
    bt_devil:     { label: "Devil's Advocate",group: "challenge" },
    bt_examiner:  { label: "Viva Examiner",   group: "exam" },
    bt_mentor:    { label: "Senior Mentor",   group: "persona" },
    bt_simplify:  { label: "Simplifier",      group: "support" },
    bt_mnemo:     { label: "Mnemonic Trainer",group: "support" },
    bt_case:      { label: "Clinical Case",   group: "clinical" },
    bt_compare:   { label: "Comparison",      group: "method" },
    bt_pyqhunt:   { label: "PYQ Hunter",      group: "exam" },
    bt_speed:     { label: "Speed Drill",     group: "exam" },
    bt_empathy:   { label: "Empathetic Coach",group: "support" },
};

// ─── MODEL SELECTOR DROPDOWN ──────────────────────────────────────────────────
function ModelSelector({ models, selectedId, onSelect, compact = false }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const selected = models.find(m => m.id === selectedId);

    useEffect(() => {
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    if (!models.length) return null;

    return (
        <div ref={ref} style={{ position: "relative", display: "inline-block" }}>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: compact ? "4px 10px" : "6px 12px",
                    borderRadius: 20, border: "1px solid var(--border-2)",
                    background: selected ? "rgba(99,102,241,0.15)" : "var(--surface-2)",
                    color: selected ? "#a5b4fc" : "var(--text-2)",
                    cursor: "pointer", fontSize: compact ? 11 : 12,
                    fontWeight: 600, transition: "all 0.2s", whiteSpace: "nowrap",
                }}
            >
                <span style={{ fontSize: compact ? 12 : 14 }}>🧠</span>
                {selected ? selected.name : "Default Model"}
                <span style={{ fontSize: 9, opacity: 0.7 }}>{open ? "▲" : "▼"}</span>
            </button>

            {open && (
                <div style={{
                    position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 500,
                    background: "var(--ink-2)", border: "1px solid var(--border-2)",
                    borderRadius: 12, minWidth: 220, boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                    overflow: "hidden",
                }}>
                    {/* Default option */}
                    <div
                        onClick={() => { onSelect(null); setOpen(false); }}
                        style={{
                            padding: "10px 14px", cursor: "pointer", fontSize: 13,
                            background: !selectedId ? "rgba(245,166,35,0.1)" : "transparent",
                            color: !selectedId ? "var(--amber)" : "var(--text-2)",
                            borderBottom: "1px solid var(--border)",
                            display: "flex", alignItems: "center", gap: 8, fontWeight: !selectedId ? 600 : 400,
                        }}
                        onMouseEnter={e => !(!selectedId) && (e.currentTarget.style.background = "var(--surface)")}
                        onMouseLeave={e => !(!selectedId) && (e.currentTarget.style.background = "transparent")}
                    >
                        <span>🤖</span> Default Tutor
                        {!selectedId && <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--amber)" }}>●</span>}
                    </div>
                    {models.map(m => (
                        <div
                            key={m.id}
                            onClick={() => { onSelect(m.id); setOpen(false); }}
                            style={{
                                padding: "10px 14px", cursor: "pointer",
                                background: selectedId === m.id ? "rgba(99,102,241,0.12)" : "transparent",
                                borderBottom: "1px solid var(--border)",
                                transition: "background 0.15s",
                            }}
                            onMouseEnter={e => selectedId !== m.id && (e.currentTarget.style.background = "var(--surface)")}
                            onMouseLeave={e => selectedId !== m.id && (e.currentTarget.style.background = "transparent")}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 13 }}>🧠</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: selectedId === m.id ? "#a5b4fc" : "var(--text)" }}>{m.name}</div>
                                    <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>{m.base_model} · {m.capabilities?.length || 0} caps</div>
                                </div>
                                {selectedId === m.id && <span style={{ fontSize: 10, color: "#a5b4fc" }}>●</span>}
                            </div>
                            {m.target_levels?.length > 0 && (
                                <div style={{ display: "flex", gap: 4, marginTop: 6, marginLeft: 21 }}>
                                    {m.target_levels.map(l => (
                                        <span key={l} style={{
                                            fontSize: 9, padding: "1px 5px", borderRadius: 3, fontWeight: 700,
                                            background: l === "Strong" ? "rgba(34,197,94,0.15)" : l === "Weak" ? "rgba(224,68,68,0.15)" : l === "Average" ? "rgba(245,158,11,0.15)" : "rgba(59,130,246,0.15)",
                                            color: l === "Strong" ? "#22c55e" : l === "Weak" ? "#e04444" : l === "Average" ? "#d97706" : "#3b82f6",
                                        }}>{l.toUpperCase()}</span>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── BEHAVIOR TAG CHIPS ───────────────────────────────────────────────────────
function BehaviorTagChips({ tagIds, customTags = [] }) {
    if (!tagIds?.length) return null;
    const allTagMap = { ...PRESET_TAGS_BRIEF, ...Object.fromEntries(customTags.map(t => [t.id, { label: t.label, group: t.group || "custom" }])) };
    const tags = tagIds.map(id => ({ id, ...allTagMap[id] })).filter(t => t.label);
    if (!tags.length) return null;

    return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "6px 20px 8px", borderBottom: "1px solid var(--border)", background: "var(--surface-2)" }}>
            {tags.slice(0, 6).map(tag => {
                const meta = TAG_GROUP_COLORS[tag.group] || TAG_GROUP_COLORS.custom;
                return (
                    <span key={tag.id} style={{
                        fontSize: 10, padding: "2px 8px", borderRadius: 20, fontWeight: 600,
                        background: meta.bg, color: meta.color, border: `1px solid ${meta.border}`,
                    }}>{tag.label}</span>
                );
            })}
            {tags.length > 6 && <span style={{ fontSize: 10, color: "var(--text-3)", paddingTop: 2 }}>+{tags.length - 6} more</span>}
        </div>
    );
}

// ─── MAIN AI TUTOR COMPONENT ───────────────────────────────────────────────────
export default function AiTutorPage() {
    const [mode, setMode] = useState("sessions");
    const [sessions, setSessions] = useState([]);
    const [availableTopics, setAvailableTopics] = useState([]);
    const [activeSession, setActiveSession] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [sessionLoading, setSessionLoading] = useState(true);
    const [currentInput, setCurrentInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [showVoice, setShowVoice] = useState(false);
    const [availableModels, setAvailableModels] = useState([]);
    const [selectedModelId, setSelectedModelId] = useState(null);
    const [customTags, setCustomTags] = useState([]);
    const messagesEndRef = useRef(null);

    // Load models and custom tags from admin localStorage
    useEffect(() => {
        loadSessions();
        loadTopics();
        try {
            const storedModels = JSON.parse(localStorage.getItem("admin_models") || "[]");
            setAvailableModels(storedModels.filter(m => m.status === "ready"));
            const storedTags = JSON.parse(localStorage.getItem("admin_tags") || "[]");
            setCustomTags(storedTags);
            // Restore last selected model
            const lastModel = localStorage.getItem("ai_tutor_model_id");
            if (lastModel && storedModels.some(m => m.id === lastModel && m.status === "ready")) {
                setSelectedModelId(lastModel);
            }
        } catch (e) {
            console.warn("Failed to load admin models:", e);
        }
    }, []);

    const selectedModel = availableModels.find(m => m.id === selectedModelId) || null;

    const handleModelSelect = (modelId) => {
        setSelectedModelId(modelId);
        localStorage.setItem("ai_tutor_model_id", modelId || "");
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const loadSessions = async () => {
        try {
            setSessionLoading(true);
            const data = await apiFetch('/chat/sessions?page=1&per_page=20');
            setSessions(data.items || data || []);
        } catch (e) {
            console.error("Failed to load sessions:", e);
            setSessions([]);
        } finally {
            setSessionLoading(false);
        }
    };

    const loadTopics = async () => {
        try {
            const data = await apiFetch('/subjects/');
            setAvailableTopics(data.items || data || []);
        } catch (e) {
            setAvailableTopics(NEET_SUBJECTS);
        }
    };

    const startNewSession = async (topicId, topicName) => {
        try {
            setLoading(true);
            const data = await apiFetch('/chat/sessions', {
                method: 'POST',
                body: { subject_id: topicId, title: `${topicName} Help` }
            });
            setActiveSession(data);
            setMessages([]);
            setMode("chat");
        } catch (e) {
            console.error("Failed to create session:", e);
        } finally {
            setLoading(false);
        }
    };

    const openSession = async (sessionId) => {
        try {
            setLoading(true);
            const data = await apiFetch(`/chat/sessions/${sessionId}`);
            if (data) {
                setActiveSession(data);
                setMessages(data.messages || []);
                setMode("chat");
            }
        } catch (e) {
            console.error("Failed to load session:", e);
            alert("Failed to load session. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const sendMessage = async (e) => {
        e?.preventDefault();
        if (!currentInput.trim() || !activeSession || isSending) return;

        const userMessage = currentInput;
        setCurrentInput("");
        setIsSending(true);

        setMessages(prev => [...prev, {
            id: Date.now(), role: "user", content: userMessage, created_at: new Date().toISOString(),
        }]);

        try {
            // Build body — include selected model's system_prompt if one is chosen
            const body = { message: userMessage };
            if (selectedModel?.system_prompt) {
                body.custom_system_prompt = selectedModel.system_prompt;
                body.model_name = selectedModel.name;
                body.base_model = selectedModel.base_model;
            }

            const response = await fetch(
                `${API_BASE}/chat/sessions/${activeSession.id}/message`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
                    },
                    body: JSON.stringify(body),
                }
            );

            if (!response.ok) throw new Error("Failed to get response");

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let fullResponse = "";
            const messageId = Date.now() + 1;

            setMessages(prev => [...prev, { id: messageId, role: "assistant", content: "", created_at: new Date().toISOString() }]);

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    fullResponse += decoder.decode(value);
                    setMessages(prev => prev.map(m => m.id === messageId ? { ...m, content: fullResponse } : m));
                }
            }
        } catch (e) {
            setMessages(prev => [...prev, {
                id: Date.now() + 2, role: "assistant",
                content: `Sorry, I encountered an error: ${e.message || 'Please try again.'}`,
                created_at: new Date().toISOString(),
            }]);
        } finally {
            setIsSending(false);
        }
    };

    // ─── RENDER: Sessions List ────────────────────────────────────────────────
    if (mode === "sessions") {
        return (
            <div className="page-enter" style={{ maxHeight: "100vh", display: "flex", flexDirection: "column" }}>
                <div className="section-header" style={{ paddingBottom: 16 }}>
                    <div>
                        <div className="section-title">🤖 AI Tutor Sessions</div>
                        <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>Chat or talk live with an AI expert. Powered by your uploaded study materials.</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <ModelSelector models={availableModels} selectedId={selectedModelId} onSelect={handleModelSelect} />
                        <button onClick={() => setMode("new")} className="btn btn-primary" style={{ whiteSpace: "nowrap" }}>
                            + New Conversation
                        </button>
                    </div>
                </div>
                {selectedModel && (
                    <div style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 0 12px",
                        borderBottom: "1px solid var(--border)", marginBottom: 16,
                    }}>
                        <span style={{ fontSize: 11, color: "var(--text-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Active Model:</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#a5b4fc", display: "flex", alignItems: "center", gap: 5 }}>
                            🧠 {selectedModel.name}
                        </span>
                        {selectedModel.behavior_tags?.length > 0 && (
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                {selectedModel.behavior_tags.slice(0, 5).map(id => {
                                    const tag = { ...PRESET_TAGS_BRIEF[id], ...customTags.find(t => t.id === id) };
                                    if (!tag?.label) return null;
                                    const meta = TAG_GROUP_COLORS[tag.group] || TAG_GROUP_COLORS.custom;
                                    return (
                                        <span key={id} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, fontWeight: 600, background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
                                            {tag.label}
                                        </span>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
                {sessionLoading ? (
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", flex: 1 }}>
                        <div className="spinner" style={{ width: 32, height: 32 }} />
                    </div>
                ) : sessions.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "60px 20px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                        <div style={{ fontSize: 48, marginBottom: 16 }}>💬</div>
                        <h3 style={{ fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>No conversations yet</h3>
                        <p style={{ color: "var(--text-3)", marginBottom: 24 }}>Start a new conversation with the AI tutor</p>
                        <button onClick={() => setMode("new")} className="btn btn-primary" style={{ width: "fit-content", margin: "0 auto" }}>
                            Start Your First Conversation
                        </button>
                    </div>
                ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16, overflowY: "auto", flex: 1, paddingRight: 8 }}>
                        {sessions.map(session => {
                            const topicConfig = getTopicConfig(session.title);
                            return (
                                <div key={session.id} onClick={() => openSession(session.id)} className="card"
                                    style={{ cursor: "pointer", transition: "all 0.2s", borderLeft: `4px solid ${topicConfig.color}` }}
                                    onMouseEnter={e => e.currentTarget.style.transform = "translateY(-4px)"}
                                    onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}>
                                    <div className="card-body" style={{ padding: 16 }}>
                                        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
                                            <span style={{ fontSize: 28 }}>{topicConfig.emoji}</span>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", lineHeight: 1.3 }}>{session.title}</div>
                                                <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 4 }}>{formatTimeAgo(session.updated_at)}</div>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: 12, color: "var(--text-2)", lineHeight: 1.5, maxHeight: 60, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                                            {session.last_message_preview || "Chat about this topic..."}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    // ─── RENDER: Select Topic ─────────────────────────────────────────────────
    if (mode === "new") {
        return (
            <div className="page-enter" style={{ maxWidth: 720, margin: "0 auto" }}>
                <button onClick={() => setMode("sessions")} className="btn btn-ghost" style={{ marginBottom: 20 }}>
                    ← Back to Sessions
                </button>
                <div className="section-header" style={{ paddingBottom: 16 }}>
                    <div>
                        <div className="section-title">Start a New Conversation</div>
                        <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>Select a topic to discuss with the AI tutor</div>
                    </div>
                    <ModelSelector models={availableModels} selectedId={selectedModelId} onSelect={handleModelSelect} />
                </div>
                {selectedModel && (
                    <div style={{
                        marginBottom: 16, padding: "10px 16px", borderRadius: 10,
                        background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.25)",
                        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                    }}>
                        <span style={{ fontSize: 12, color: "#a5b4fc", fontWeight: 700 }}>🧠 {selectedModel.name}</span>
                        <span style={{ fontSize: 11, color: "var(--text-3)" }}>·</span>
                        <span style={{ fontSize: 11, color: "var(--text-3)" }}>{selectedModel.base_model}</span>
                        {selectedModel.behavior_tags?.length > 0 && (
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                {selectedModel.behavior_tags.slice(0, 4).map(id => {
                                    const tag = { ...PRESET_TAGS_BRIEF[id], ...customTags.find(t => t.id === id) };
                                    if (!tag?.label) return null;
                                    const meta = TAG_GROUP_COLORS[tag.group] || TAG_GROUP_COLORS.custom;
                                    return (
                                        <span key={id} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 20, fontWeight: 600, background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>{tag.label}</span>
                                    );
                                })}
                            </div>
                        )}
                        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-3)" }}>This model will guide your AI tutor behavior</span>
                    </div>
                )}
                {loading ? (
                    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 300 }}>
                        <div className="spinner" style={{ width: 32, height: 32 }} />
                    </div>
                ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
                        {availableTopics.map(topic => {
                            const config = getTopicConfig(topic.name || topic.icon_emoji);
                            return (
                                <button key={topic.id} onClick={() => startNewSession(topic.id, topic.name)}
                                    className="card" disabled={loading}
                                    style={{ cursor: "pointer", border: "2px solid var(--border)", background: config.bg, padding: 20, textAlign: "center", transition: "all 0.2s" }}
                                    onMouseEnter={e => { e.currentTarget.style.borderColor = config.color; e.currentTarget.style.transform = "translateY(-4px)"; }}
                                    onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.transform = "translateY(0)"; }}>
                                    <div style={{ fontSize: 32, marginBottom: 8 }}>{config.emoji}</div>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>{topic.name || topic.icon_emoji}</div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    // ─── RENDER: Chat Interface ───────────────────────────────────────────────
    if (mode === "chat" && activeSession) {
        const topicConfig = getTopicConfig(activeSession.title);
        return (
            <div className="page-enter" style={{ maxHeight: "100vh", display: "flex", flexDirection: "column", padding: 0, borderRadius: 0 }}>
                {/* Realtime Voice Overlay */}
                {showVoice && (
                    <RealtimeVoicePanel
                        activeSession={activeSession}
                        topicConfig={topicConfig}
                        onClose={() => setShowVoice(false)}
                    />
                )}

                {/* Header */}
                <div style={{ borderBottom: selectedModel ? "none" : "1px solid var(--border)", padding: "12px 20px", display: "flex", alignItems: "center", gap: 10, background: "var(--surface-2)", flexWrap: "wrap" }}>
                    <button onClick={() => setMode("sessions")} className="btn btn-ghost" style={{ padding: "6px 12px", flexShrink: 0 }}>
                        ← Sessions
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", display: "flex", alignItems: "center", gap: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            <span>{topicConfig.emoji}</span>
                            {activeSession.title}
                        </div>
                    </div>

                    {/* Model selector in chat header */}
                    <ModelSelector
                        models={availableModels}
                        selectedId={selectedModelId}
                        onSelect={handleModelSelect}
                        compact={true}
                    />

                    <button onClick={() => window.location.reload()} className="btn btn-ghost" style={{ padding: "6px 12px", flexShrink: 0 }} title="Refresh">
                        🔄
                    </button>
                </div>

                {/* Behavior Tags sub-bar */}
                {selectedModel && (
                    <BehaviorTagChips tagIds={selectedModel.behavior_tags || []} customTags={customTags} />
                )}

                {/* Messages */}
                <div style={{ flex: 1, overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 12 }}>
                    {messages.length === 0 ? (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100%", textAlign: "center" }}>
                            <div>
                                <div style={{ fontSize: 40, marginBottom: 12 }}>{topicConfig.emoji}</div>
                                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>Start Your Conversation</div>
                                <div style={{ color: "var(--text-3)", marginBottom: 16 }}>Ask me anything about {activeSession.title}</div>
                                {selectedModel ? (
                                    <div style={{ fontSize: 12, color: "#a5b4fc", background: "rgba(99,102,241,0.1)", padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(99,102,241,0.2)", marginBottom: 12, display: "inline-block" }}>
                                        🧠 {selectedModel.name} behavior active
                                    </div>
                                ) : null}
                                <div style={{ fontSize: 13, color: "var(--text-3)" }}>
                                    💡 Tip: Click <strong>🎙️ Live Voice</strong> in the header to talk in real-time!
                                </div>
                            </div>
                        </div>
                    ) : (
                        <>
                            {messages.map(message => (
                                <div key={message.id} style={{ display: "flex", justifyContent: message.role === "user" ? "flex-end" : "flex-start", marginBottom: 8 }}>
                                    <div style={{
                                        maxWidth: "75%", padding: "12px 16px", borderRadius: "12px",
                                        background: message.role === "user" ? "var(--amber)" : "var(--surface-3)",
                                        color: message.role === "user" ? "#000" : "var(--text)",
                                        fontSize: 13, lineHeight: 1.5, wordWrap: "break-word",
                                    }}>
                                        {message.content}
                                    </div>
                                </div>
                            ))}
                            {isSending && (
                                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                                    <div style={{ padding: "12px 16px", borderRadius: "12px", background: "var(--surface-3)" }}>
                                        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                            {[0, 0.2, 0.4].map((d, i) => (
                                                <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--text-3)", animation: `pulse 1.5s infinite ${d}s` }} />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </>
                    )}
                </div>

                {/* Input */}
                <div style={{ borderTop: "1px solid var(--border)", padding: "16px 20px", paddingRight: 220, background: "var(--surface-2)" }}>
                    <form onSubmit={sendMessage} style={{ display: "flex", gap: 12 }}>
                        <input
                            type="text"
                            value={currentInput}
                            onChange={e => setCurrentInput(e.target.value)}
                            placeholder={`Ask about ${activeSession.title}...`}
                            disabled={isSending}
                            style={{ flex: 1, padding: "12px 16px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--ink-2)", color: "var(--text)", fontSize: 13, outline: "none" }}
                        />
                        <button type="submit" disabled={isSending || !currentInput.trim()} className="btn btn-primary" style={{ padding: "12px 24px" }}>
                            {isSending ? "..." : "Send"}
                        </button>
                    </form>
                </div>

                {/* Floating Live Voice Button */}
                <button
                    id="live-voice-fab"
                    onClick={() => setShowVoice(true)}
                    style={{
                        position: "fixed", bottom: 32, right: 32, zIndex: 900,
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "14px 22px", borderRadius: 50, border: "none",
                        cursor: "pointer", fontWeight: 700, fontSize: 14,
                        background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                        color: "#fff",
                        boxShadow: "0 8px 28px rgba(99,102,241,0.55), 0 2px 8px rgba(0,0,0,0.3)",
                        transition: "transform 0.2s ease, box-shadow 0.2s ease",
                        animation: "fabPulse 2.8s ease-in-out infinite",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px) scale(1.05)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0) scale(1)"; }}
                    title="Talk live with the AI Tutor using voice"
                >
                    <span style={{ fontSize: 20 }}>🎙️</span>
                    Live Voice
                    <span style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: "#4ade80", boxShadow: "0 0 8px #4ade80",
                        animation: "dotBlink 1.2s ease-in-out infinite",
                    }} />
                </button>

                <style>{`
                    @keyframes pulse {
                        0%, 60%, 100% { opacity: 0.3; }
                        30% { opacity: 1; }
                    }
                    @keyframes fabPulse {
                        0%, 100% { box-shadow: 0 8px 28px rgba(99,102,241,0.55), 0 2px 8px rgba(0,0,0,0.3); }
                        50% { box-shadow: 0 8px 36px rgba(139,92,246,0.75), 0 2px 8px rgba(0,0,0,0.3); }
                    }
                    @keyframes dotBlink {
                        0%, 100% { opacity: 1; }
                        50% { opacity: 0.3; }
                    }
                `}</style>
            </div>
        );
    }

    return null;
}
