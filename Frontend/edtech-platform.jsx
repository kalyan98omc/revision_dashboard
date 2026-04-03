import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
import { StudentOnboarding, StudyPlanView, TopicAssessmentView, RevisionDashboard } from "./neetpg-pages.jsx";
import AdminPanel from "./admin-page.jsx";
import AiTutorPage from "./ai-tutor.jsx";
// ─── THEME CONTEXT ───────────────────────────────────────────────────────────
const ThemeContext = createContext(null);

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');
  const toggle = () => setTheme(t => {
    const next = t === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    return next;
  });
  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      <div data-theme={theme} style={{ height: '100%' }}>{children}</div>
    </ThemeContext.Provider>
  );
}

const useTheme = () => useContext(ThemeContext);

// ─── AUTH API CLIENT ────────────────────────────────────────────────────────
const API_BASE = 'http://localhost:5000/api/v1';

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('access_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const json = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) throw json;
  return json;
}

const authApi = {
  login: (identifier, password) =>
    apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) }),
  register: (data) =>
    apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  logout: () =>
    apiFetch('/auth/logout', { method: 'POST' }).catch(() => { }),
  me: () => apiFetch('/users/me'),
  updateProfile: (data) =>
    apiFetch('/users/me', { method: 'PATCH', body: JSON.stringify(data) }),
  requestPasswordReset: (email) =>
    apiFetch('/auth/request-password-reset', { method: 'POST', body: JSON.stringify({ email }) }),
};

// ─── AUTH CONTEXT ────────────────────────────────────────────────────────────
const AuthContext = createContext(null);

function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (!token) { setAuthLoading(false); return; }
    authApi.me()
      .then(u => setUser(u))
      .catch(() => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
      })
      .finally(() => setAuthLoading(false));
  }, []);

  const login = async (identifier, password) => {
    const result = await authApi.login(identifier, password);
    localStorage.setItem('access_token', result.access_token);
    localStorage.setItem('refresh_token', result.refresh_token);
    setUser(result.user);
    return result;
  };

  const logout = async () => {
    await authApi.logout();
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    setUser(null);
  };

  const updateUser = (u) => setUser(prev => ({ ...prev, ...u }));

  return (
    <AuthContext.Provider value={{ user, authLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

const useAuth = () => useContext(AuthContext);

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700;800&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&family=DM+Mono:wght@400;500&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --ink: #0A0C10;
    --ink-2: #12161E;
    --ink-3: #1C2230;
    --surface: #1E2538;
    --surface-2: #252D42;
    --surface-3: #2D3754;
    --border: rgba(255,255,255,0.07);
    --border-2: rgba(255,255,255,0.12);
    --text: #E8ECF4;
    --text-2: #8A95AA;
    --text-3: #5A6478;
    --amber: #F5A623;
    --amber-glow: rgba(245,166,35,0.15);
    --amber-soft: rgba(245,166,35,0.08);
    --cyan: #4ECDC4;
    --cyan-glow: rgba(78,205,196,0.15);
    --rose: #FF6B6B;
    --violet: #9B8FFF;
    --violet-glow: rgba(155,143,255,0.15);
    --green: #52D78A;
    --green-glow: rgba(82,215,138,0.12);
    --font-display: 'Syne', sans-serif;
    --font-body: 'DM Sans', sans-serif;
    --font-mono: 'DM Mono', monospace;
  }

  /* ── LIGHT MODE ─────────────────────────────────────────────────────────── */
  [data-theme="light"] {
    --ink: #EEF1F8;
    --ink-2: #FFFFFF;
    --ink-3: #E4E9F4;
    --surface: #F4F6FC;
    --surface-2: #EBEff8;
    --surface-3: #DDE3F0;
    --border: rgba(0,0,0,0.12);
    --border-2: rgba(0,0,0,0.22);
    --text: #111827;
    --text-2: #374151;
    --text-3: #6B7280;
    --amber: #B45309;
    --amber-glow: rgba(180,83,9,0.15);
    --amber-soft: rgba(180,83,9,0.10);
    --cyan: #0D7978;
    --cyan-glow: rgba(13,121,120,0.15);
    --rose: #C0392B;
    --violet: #5B4FBF;
    --violet-glow: rgba(91,79,191,0.15);
    --green: #166534;
    --green-glow: rgba(22,101,52,0.12);
  }
  [data-theme="light"] { background: var(--ink); color: var(--text); }
  [data-theme="light"] .card {
    border: 1px solid rgba(0,0,0,0.13);
    box-shadow: 0 2px 8px rgba(0,0,0,0.07);
  }
  [data-theme="light"] .stat-card {
    border: 1px solid rgba(0,0,0,0.13);
    box-shadow: 0 2px 8px rgba(0,0,0,0.07);
  }
  [data-theme="light"] .quiz-card { border: 1px solid rgba(0,0,0,0.13); }
  [data-theme="light"] .msg-bubble { background: #FFFFFF; border: 1px solid rgba(0,0,0,0.1); }
  [data-theme="light"] .msg.user .msg-bubble { background: rgba(180,83,9,0.10); }
  [data-theme="light"] .form-field input,
  [data-theme="light"] .form-field select { background: #FFFFFF; border-color: rgba(0,0,0,0.2); color: #111827; }
  [data-theme="light"] .form-field input:focus { border-color: var(--amber); }
  [data-theme="light"] .form-field input[disabled] { background: #F0F2F8; color: var(--text-3); }
  [data-theme="light"] .search-box { background: #FFFFFF; border-color: rgba(0,0,0,0.15); }
  [data-theme="light"] .search-box input { color: #111827; }
  [data-theme="light"] ::-webkit-scrollbar-thumb { background: var(--surface-3); }

  html, body, #root { height: 100%; background: var(--ink); color: var(--text); font-family: var(--font-body); }

  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--surface-3); border-radius: 4px; }

  .app { display: flex; height: 100vh; overflow: hidden; }

  /* Sidebar */
  .sidebar {
    width: 72px; background: var(--ink-2); border-right: 1px solid var(--border);
    display: flex; flex-direction: column; align-items: center; padding: 20px 0;
    gap: 4px; flex-shrink: 0; z-index: 10; position: relative;
  }
  .sidebar.expanded { width: 240px; align-items: flex-start; padding: 20px 0; }
  .logo-mark {
    width: 40px; height: 40px; background: linear-gradient(135deg, var(--amber), #E8900A);
    border-radius: 12px; display: flex; align-items: center; justify-content: center;
    font-family: var(--font-display); font-weight: 800; font-size: 18px; color: var(--ink);
    margin-bottom: 12px; flex-shrink: 0; box-shadow: 0 4px 20px var(--amber-glow);
  }
  .logo-wrap { display: flex; align-items: center; gap: 12px; width: 100%; padding: 0 16px; margin-bottom: 12px; }
  .logo-text { font-family: var(--font-display); font-weight: 700; font-size: 16px; color: var(--text); white-space: nowrap; }
  .logo-text span { color: var(--amber); }

  .nav-item {
    display: flex; align-items: center; gap: 12px; width: 40px; height: 40px;
    border-radius: 12px; cursor: pointer; transition: all 0.2s;
    color: var(--text-3); justify-content: center; flex-shrink: 0;
    border: none; background: none; position: relative;
  }
  .sidebar.expanded .nav-item { width: calc(100% - 24px); margin: 0 12px; padding: 0 12px; justify-content: flex-start; }
  .nav-item:hover { background: var(--surface); color: var(--text-2); }
  .nav-item.active { background: var(--amber-soft); color: var(--amber); }
  .nav-item .nav-label { font-size: 13px; font-weight: 500; white-space: nowrap; }
  .nav-item .badge {
    position: absolute; top: 6px; right: 6px; width: 16px; height: 16px;
    background: var(--rose); border-radius: 50%; font-size: 10px; font-weight: 700;
    display: flex; align-items: center; justify-content: center; color: white;
  }
  .sidebar.expanded .nav-item .badge { position: static; margin-left: auto; }
  .nav-divider { width: 32px; height: 1px; background: var(--border); margin: 8px 0; }
  .sidebar.expanded .nav-divider { width: calc(100% - 24px); margin: 8px 12px; }
  .sidebar-bottom { margin-top: auto; display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%; }
  .sidebar.expanded .sidebar-bottom { align-items: flex-start; padding: 0; }
  .avatar {
    width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, var(--violet), var(--cyan));
    display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px;
    color: white; flex-shrink: 0; cursor: pointer;
  }
  .avatar-row { display: flex; align-items: center; gap: 10px; padding: 0 16px; width: 100%; }
  .avatar-info { display: flex; flex-direction: column; }
  .avatar-name { font-size: 13px; font-weight: 600; color: var(--text); }
  .avatar-role { font-size: 11px; color: var(--text-3); }

  /* Main */
  .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .topbar {
    height: 60px; background: var(--ink-2); border-bottom: 1px solid var(--border);
    display: flex; align-items: center; padding: 0 24px; gap: 16px; flex-shrink: 0;
  }
  .topbar-title { font-family: var(--font-display); font-weight: 700; font-size: 18px; color: var(--text); }
  .topbar-sub { font-size: 13px; color: var(--text-3); margin-top: 1px; }
  .topbar-right { margin-left: auto; display: flex; align-items: center; gap: 12px; }
  .search-box {
    display: flex; align-items: center; gap: 8px; background: var(--ink-3);
    border: 1px solid var(--border); border-radius: 10px; padding: 7px 12px;
    font-size: 13px; color: var(--text-2); cursor: text; transition: border-color 0.2s;
  }
  .search-box:hover { border-color: var(--border-2); }
  .search-box input { background: none; border: none; outline: none; color: var(--text); font-size: 13px; font-family: var(--font-body); width: 180px; }
  .search-box input::placeholder { color: var(--text-3); }
  .icon-btn {
    width: 36px; height: 36px; border-radius: 10px; background: var(--ink-3);
    border: 1px solid var(--border); cursor: pointer; display: flex; align-items: center; justify-content: center;
    color: var(--text-2); transition: all 0.2s;
  }
  .icon-btn:hover { background: var(--surface); color: var(--text); border-color: var(--border-2); }

  /* Content */
  .content { flex: 1; overflow-y: auto; padding: 24px; }

  /* Cards */
  .card {
    background: var(--ink-2); border: 1px solid var(--border); border-radius: 16px; overflow: hidden;
    transition: border-color 0.2s;
  }
  .card:hover { border-color: var(--border-2); }
  .card-header { padding: 20px 24px 0; display: flex; align-items: center; justify-content: space-between; }
  .card-title { font-family: var(--font-display); font-weight: 700; font-size: 15px; color: var(--text); }
  .card-subtitle { font-size: 12px; color: var(--text-3); margin-top: 2px; }
  .card-body { padding: 20px 24px 24px; }

  /* Stat cards */
  .stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .stat-card {
    background: var(--ink-2); border: 1px solid var(--border); border-radius: 16px;
    padding: 20px; position: relative; overflow: hidden; cursor: default;
    transition: transform 0.2s, border-color 0.2s;
  }
  .stat-card:hover { transform: translateY(-2px); border-color: var(--border-2); }
  .stat-card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: var(--accent-color, var(--amber));
  }
  .stat-card .glow {
    position: absolute; top: -30px; right: -30px; width: 100px; height: 100px;
    border-radius: 50%; background: var(--accent-color, var(--amber)); opacity: 0.05; filter: blur(30px);
  }
  .stat-icon {
    width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
    background: var(--accent-bg, var(--amber-soft)); margin-bottom: 12px; font-size: 18px;
  }
  .stat-value { font-family: var(--font-display); font-weight: 800; font-size: 28px; color: var(--text); line-height: 1; }
  .stat-label { font-size: 12px; color: var(--text-3); margin-top: 4px; font-weight: 500; letter-spacing: 0.05em; text-transform: uppercase; }
  .stat-change { font-size: 12px; margin-top: 8px; display: flex; align-items: center; gap: 4px; }
  .stat-change.up { color: var(--green); }
  .stat-change.down { color: var(--rose); }

  /* Grid layouts */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .grid-3 { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }

  /* Progress bar */
  .progress-wrap { display: flex; align-items: center; gap: 10px; }
  .progress-bar { flex: 1; height: 6px; background: var(--ink-3); border-radius: 3px; overflow: hidden; }
  .progress-fill { height: 100%; border-radius: 3px; transition: width 1s cubic-bezier(0.4,0,0.2,1); }
  .progress-label { font-size: 12px; color: var(--text-3); min-width: 36px; text-align: right; font-family: var(--font-mono); }

  /* Subject row */
  .subject-row { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
  .subject-row:last-child { border-bottom: none; }
  .subject-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .subject-name { font-size: 14px; color: var(--text-2); flex: 1; font-weight: 500; }
  .subject-score { font-family: var(--font-mono); font-size: 13px; color: var(--text); }

  /* Activity feed */
  .activity-item { display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--border); }
  .activity-item:last-child { border-bottom: none; }
  .activity-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; flex-shrink: 0; }
  .activity-text { font-size: 13px; color: var(--text-2); line-height: 1.5; }
  .activity-text strong { color: var(--text); font-weight: 600; }
  .activity-time { font-size: 11px; color: var(--text-3); margin-top: 2px; }

  /* Leaderboard */
  .lb-row { display: flex; align-items: center; gap: 12px; padding: 10px 0; }
  .lb-rank { font-family: var(--font-mono); font-size: 12px; color: var(--text-3); width: 20px; text-align: center; }
  .lb-rank.top { color: var(--amber); font-weight: 700; }
  .lb-avatar { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: white; }
  .lb-name { flex: 1; font-size: 13px; color: var(--text-2); font-weight: 500; }
  .lb-score { font-family: var(--font-mono); font-size: 13px; color: var(--text); }
  .lb-badge { font-size: 16px; }

  /* CHAT */
  .chat-layout { display: flex; height: 100%; gap: 0; }
  .chat-sidebar { width: 280px; border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; }
  .chat-list { flex: 1; overflow-y: auto; }
  .chat-list-item {
    padding: 12px 16px; cursor: pointer; border-bottom: 1px solid var(--border);
    transition: background 0.15s; display: flex; gap: 10px; align-items: flex-start;
  }
  .chat-list-item:hover { background: var(--surface); }
  .chat-list-item.active { background: var(--amber-soft); border-left: 2px solid var(--amber); }
  .chat-list-item .chat-ai-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 18px; flex-shrink: 0; }
  .chat-topic { font-size: 13px; font-weight: 600; color: var(--text); }
  .chat-preview { font-size: 12px; color: var(--text-3); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 170px; }
  .chat-time { font-size: 11px; color: var(--text-3); margin-left: auto; white-space: nowrap; }

  .chat-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .chat-topbar { padding: 16px 24px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px; }
  .chat-ai-status { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--green); }
  .chat-ai-status::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--green); display: block; animation: pulse-dot 2s ease infinite; }
  @keyframes pulse-dot { 0%,100% { opacity:1; } 50% { opacity:0.4; } }

  .messages { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 20px; }
  .msg { display: flex; gap: 12px; max-width: 780px; }
  .msg.user { flex-direction: row-reverse; align-self: flex-end; }
  .msg-avatar { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 16px; }
  .msg-bubble {
    background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 14px 18px;
    font-size: 14px; line-height: 1.65; color: var(--text-2); max-width: 600px;
    border-top-left-radius: 4px;
  }
  .msg.user .msg-bubble { background: var(--amber-soft); border-color: rgba(245,166,35,0.2); color: var(--text); border-top-right-radius: 4px; border-top-left-radius: 16px; }
  .msg-bubble code { font-family: var(--font-mono); font-size: 12px; background: var(--ink-3); padding: 2px 6px; border-radius: 4px; color: var(--cyan); }
  .msg-bubble pre { background: var(--ink); border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-top: 10px; overflow-x: auto; }
  .msg-bubble pre code { background: none; padding: 0; font-size: 13px; line-height: 1.7; }
  .typing-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--text-3); margin-right: 3px; animation: typing 1.2s ease infinite; }
  .typing-dot:nth-child(2) { animation-delay: 0.2s; }
  .typing-dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes typing { 0%,80%,100% { transform: scale(1); opacity:0.5; } 40% { transform: scale(1.3); opacity:1; } }

  .chat-input-area { padding: 16px 24px; border-top: 1px solid var(--border); }
  .chat-input-box {
    display: flex; align-items: flex-end; gap: 10px; background: var(--ink-3);
    border: 1px solid var(--border); border-radius: 14px; padding: 10px 14px; transition: border-color 0.2s;
  }
  .chat-input-box:focus-within { border-color: var(--amber); }
  .chat-input-box textarea {
    flex: 1; background: none; border: none; outline: none; color: var(--text); font-size: 14px;
    font-family: var(--font-body); resize: none; min-height: 24px; max-height: 120px; line-height: 1.5;
  }
  .chat-input-box textarea::placeholder { color: var(--text-3); }
  .send-btn {
    width: 36px; height: 36px; border-radius: 10px; background: var(--amber); border: none;
    cursor: pointer; display: flex; align-items: center; justify-content: center;
    color: var(--ink); transition: all 0.2s; flex-shrink: 0;
  }
  .send-btn:hover { background: #E89B1A; transform: scale(1.05); }
  .send-btn:disabled { background: var(--surface-3); color: var(--text-3); cursor: not-allowed; transform: none; }
  .mic-btn {
    width: 36px; height: 36px; border-radius: 10px; background: var(--ink-2); border: 1px solid var(--border);
    cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--text-2);
    transition: all 0.2s; flex-shrink: 0;
  }
  .mic-btn:hover { border-color: var(--border-2); color: var(--text); }
  .mic-btn.recording { background: var(--rose); border-color: var(--rose); color: white; animation: pulse-rec 1s ease infinite; }
  @keyframes pulse-rec { 0%,100% { box-shadow: 0 0 0 0 rgba(255,107,107,0.4); } 50% { box-shadow: 0 0 0 8px rgba(255,107,107,0); } }

  /* QUIZ */
  .quiz-layout { display: flex; gap: 24px; }
  .quiz-list-panel { width: 300px; flex-shrink: 0; }
  .quiz-main-panel { flex: 1; }
  .quiz-card {
    background: var(--ink-2); border: 1px solid var(--border); border-radius: 14px; padding: 16px;
    cursor: pointer; transition: all 0.2s; margin-bottom: 10px;
  }
  .quiz-card:hover { border-color: var(--border-2); background: var(--surface); transform: translateY(-1px); }
  .quiz-card.active { border-color: var(--amber); background: var(--amber-soft); }
  .quiz-card-top { display: flex; align-items: flex-start; gap: 10px; }
  .quiz-tag { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 20px; letter-spacing: 0.05em; text-transform: uppercase; }
  .quiz-card-title { font-weight: 600; font-size: 14px; color: var(--text); margin-top: 8px; line-height: 1.4; }
  .quiz-meta { display: flex; gap: 12px; margin-top: 8px; }
  .quiz-meta-item { font-size: 12px; color: var(--text-3); display: flex; align-items: center; gap: 4px; }

  .question-panel { display: flex; flex-direction: column; gap: 0; }
  .q-progress-bar { height: 4px; background: var(--ink-3); border-radius: 2px; margin-bottom: 24px; overflow: hidden; }
  .q-progress-fill { height: 100%; background: var(--amber); border-radius: 2px; transition: width 0.5s ease; }
  .q-number { font-size: 12px; color: var(--text-3); font-family: var(--font-mono); margin-bottom: 8px; letter-spacing: 0.05em; }
  .q-text { font-size: 18px; font-weight: 600; color: var(--text); line-height: 1.5; margin-bottom: 28px; font-family: var(--font-display); }
  .q-options { display: flex; flex-direction: column; gap: 10px; }
  .q-option {
    padding: 16px 20px; border: 1px solid var(--border); border-radius: 12px; cursor: pointer;
    font-size: 14px; color: var(--text-2); transition: all 0.2s; display: flex; align-items: center; gap: 12px;
    background: var(--ink-2);
  }
  .q-option:hover { border-color: var(--border-2); background: var(--surface); color: var(--text); }
  .q-option.selected { border-color: var(--amber); background: var(--amber-soft); color: var(--text); }
  .q-option.correct { border-color: var(--green); background: var(--green-glow); color: var(--green); }
  .q-option.wrong { border-color: var(--rose); background: rgba(255,107,107,0.1); color: var(--rose); }
  .q-option-letter {
    width: 28px; height: 28px; border-radius: 8px; background: var(--ink-3);
    display: flex; align-items: center; justify-content: center; font-size: 12px;
    font-weight: 700; font-family: var(--font-mono); flex-shrink: 0;
    border: 1px solid var(--border);
  }
  .q-option.selected .q-option-letter { background: var(--amber); color: var(--ink); border-color: var(--amber); }
  .q-option.correct .q-option-letter { background: var(--green); color: white; border-color: var(--green); }
  .q-option.wrong .q-option-letter { background: var(--rose); color: white; border-color: var(--rose); }
  .q-explanation { margin-top: 16px; padding: 16px; background: var(--ink-3); border-radius: 12px; font-size: 13px; line-height: 1.6; color: var(--text-2); border-left: 3px solid var(--cyan); }
  .q-actions { display: flex; align-items: center; justify-content: space-between; margin-top: 28px; }

  /* Buttons */
  .btn {
    display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; border-radius: 10px;
    font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; border: none;
    font-family: var(--font-body);
  }
  .btn-primary { background: var(--amber); color: var(--ink); }
  .btn-primary:hover { background: #E89B1A; transform: translateY(-1px); box-shadow: 0 4px 20px var(--amber-glow); }
  .btn-secondary { background: var(--surface-2); color: var(--text-2); }
  .btn-secondary:hover { background: var(--surface-3); color: var(--text); }
  .btn-ghost { background: transparent; color: var(--text-2); border: 1px solid var(--border); }
  .btn-ghost:hover { border-color: var(--border-2); color: var(--text); background: var(--surface); }
  .btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none !important; box-shadow: none !important; }

  /* Result screen */
  .result-screen { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 24px; text-align: center; }
  .result-score {
    font-family: var(--font-display); font-weight: 800; font-size: 80px; line-height: 1;
    background: linear-gradient(135deg, var(--amber), var(--cyan));
    -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; margin-bottom: 8px;
  }
  .result-label { font-size: 18px; color: var(--text-2); margin-bottom: 32px; }
  .result-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; width: 100%; max-width: 480px; margin-bottom: 32px; }
  .result-stat { background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
  .result-stat-val { font-family: var(--font-mono); font-size: 22px; font-weight: 700; color: var(--text); }
  .result-stat-lbl { font-size: 11px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 4px; }

  /* USERS table */
  .table { width: 100%; border-collapse: collapse; }
  .table th { font-size: 11px; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.07em; font-weight: 600; padding: 10px 16px; border-bottom: 1px solid var(--border); text-align: left; }
  .table td { padding: 14px 16px; border-bottom: 1px solid var(--border); font-size: 14px; color: var(--text-2); }
  .table tr:last-child td { border-bottom: none; }
  .table tr:hover td { background: var(--surface); color: var(--text); }
  .status-pill { display: inline-flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 600; padding: 3px 10px; border-radius: 20px; letter-spacing: 0.04em; }
  .status-active { background: var(--green-glow); color: var(--green); }
  .status-inactive { background: rgba(90,100,120,0.2); color: var(--text-3); }

  /* Section header */
  .section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
  .section-title { font-family: var(--font-display); font-weight: 700; font-size: 16px; color: var(--text); }
  .see-all { font-size: 13px; color: var(--amber); cursor: pointer; font-weight: 500; }
  .see-all:hover { text-decoration: underline; }

  /* Notification dot */
  .notif-dot { position: relative; }
  .notif-dot::after { content: ''; position: absolute; top: 6px; right: 6px; width: 8px; height: 8px; border-radius: 50%; background: var(--rose); border: 2px solid var(--ink-2); }

  /* Tag */
  .tag { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 6px; display: inline-flex; align-items: center; }

  /* Empty state */
  .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px; color: var(--text-3); gap: 8px; }
  .empty-icon { font-size: 40px; margin-bottom: 8px; }
  .empty-text { font-size: 14px; font-weight: 500; color: var(--text-2); }
  .empty-sub { font-size: 13px; }

  /* Dashboard charts */
  .chart-bar { display: flex; align-items: flex-end; gap: 6px; height: 80px; }
  .chart-bar-item { flex: 1; border-radius: 4px 4px 0 0; transition: opacity 0.2s; cursor: pointer; min-width: 0; }
  .chart-bar-item:hover { opacity: 0.8; }
  .chart-labels { display: flex; gap: 6px; padding-top: 6px; }
  .chart-label { flex: 1; text-align: center; font-size: 10px; color: var(--text-3); font-family: var(--font-mono); }

  /* Tooltip-like hover card */
  .streak-row { display: flex; gap: 3px; flex-wrap: wrap; }
  .streak-cell { width: 12px; height: 12px; border-radius: 2px; background: var(--ink-3); transition: background 0.2s; }
  .streak-cell.level-1 { background: rgba(245,166,35,0.3); }
  .streak-cell.level-2 { background: rgba(245,166,35,0.55); }
  .streak-cell.level-3 { background: rgba(245,166,35,0.8); }
  .streak-cell.level-4 { background: var(--amber); }

  /* Pill tabs */
  .pill-tabs { display: flex; gap: 4px; background: var(--ink-3); border-radius: 10px; padding: 4px; }
  .pill-tab { padding: 7px 16px; border-radius: 7px; font-size: 13px; font-weight: 500; cursor: pointer; color: var(--text-3); transition: all 0.2s; border: none; background: none; font-family: var(--font-body); }
  .pill-tab.active { background: var(--surface-2); color: var(--text); }
  .pill-tab:hover:not(.active) { color: var(--text-2); }

  /* Smooth page transitions */
  .page-enter { animation: pageIn 0.3s ease; }
  @keyframes pageIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

  /* Loading spinner */
  .spinner { width: 20px; height: 20px; border: 2px solid var(--border); border-top-color: var(--amber); border-radius: 50%; animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Tooltip */
  .tooltip-wrap { position: relative; }
  .tooltip { position: absolute; bottom: calc(100% + 8px); left: 50%; transform: translateX(-50%); background: var(--surface-3); border: 1px solid var(--border-2); border-radius: 8px; padding: 6px 10px; font-size: 12px; color: var(--text); white-space: nowrap; pointer-events: none; opacity: 0; transition: opacity 0.15s; z-index: 100; }
  .tooltip-wrap:hover .tooltip { opacity: 1; }

  /* Radial ring */
  .radial-ring { position: relative; display: flex; align-items: center; justify-content: center; }
  .ring-label { position: absolute; text-align: center; }
  .ring-val { font-family: var(--font-display); font-weight: 800; font-size: 20px; color: var(--text); }
  .ring-sub { font-size: 11px; color: var(--text-3); }

  /* Responsive helpers */
  @media (max-width: 1100px) { .stats-grid { grid-template-columns: repeat(2,1fr); } }
  @media (max-width: 768px) { 
    .stats-grid { grid-template-columns: 1fr; } 
    .grid-2, .grid-3 { grid-template-columns: 1fr; } 
    .app { flex-direction: column-reverse; } /* Sidebar goes to bottom on mobile! */
    .sidebar { width: 100%; height: 60px; padding: 0 10px; border-right: none; border-top: 1px solid var(--border); flex-direction: row; justify-content: space-around; z-index: 50; }
    .sidebar.expanded { width: 100%; align-items: center; padding: 0 10px; }
    .logo-wrap, .nav-divider, .sidebar-bottom, .badge { display: none !important; }
    .nav-item { width: auto; flex: 1; flex-direction: column; gap: 4px; border-radius: 8px; margin: 0; padding: 4px; }
    .nav-item .nav-label { font-size: 10px; }
    .topbar { padding: 0 16px; }
    .topbar-title { font-size: 16px; }
    .search-box { display: none; }
    .content { padding: 16px; }
    .stat-value { font-size: 24px; }
    .quiz-layout { flex-direction: column; }
    .quiz-list-panel { width: 100%; }
    .result-score { font-size: 60px; }
    .result-grid { grid-template-columns: 1fr; }
    .chat-layout { flex-direction: column; }
    .chat-sidebar { width: 100%; max-height: 35vh; border-right: none; border-bottom: 1px solid var(--border); }
    .chat-topbar { padding: 12px 16px; }
    .messages { padding: 16px; gap: 16px; }
    .msg-bubble { padding: 10px 14px; font-size: 13px; max-width: 90%; }
    .chat-input-area { padding: 12px 16px; }
    /* FAB adjustments */
    #live-voice-fab { bottom: 80px !important; right: 20px !important; padding: 10px 16px !important; font-size: 12px !important; }
    #live-voice-fab span:first-child { font-size: 16px !important; }
    /* Table responsiveness */
    .table { display: block; overflow-x: auto; white-space: nowrap; }
  }

  /* ── AUTH PAGES ─────────────────────────────────────────────────────────── */
  .auth-page { height: 100vh; display: flex; align-items: center; justify-content: center; background: radial-gradient(ellipse at 20% 50%, rgba(245,166,35,0.06) 0%, var(--ink) 60%); padding: 24px; }
  .auth-card { background: var(--ink-2); border: 1px solid var(--border); border-radius: 24px; padding: 44px 40px; width: 100%; max-width: 460px; box-shadow: 0 32px 80px rgba(0,0,0,0.5); }
  .auth-logo { text-align: center; margin-bottom: 32px; }
  .auth-title { font-family: var(--font-display); font-size: 26px; font-weight: 800; color: var(--text); margin-bottom: 6px; margin-top: 12px; }
  .auth-sub { font-size: 14px; color: var(--text-3); }
  .auth-form { display: flex; flex-direction: column; gap: 16px; }
  .form-field { display: flex; flex-direction: column; gap: 6px; }
  .form-field label { font-size: 13px; font-weight: 600; color: var(--text-2); }
  .form-field input, .form-field select { background: var(--ink-3); border: 1px solid var(--border); border-radius: 10px; padding: 11px 14px; font-size: 14px; color: var(--text); outline: none; transition: border-color 0.2s; font-family: var(--font-body); width: 100%; }
  .form-field input:focus { border-color: var(--amber); box-shadow: 0 0 0 3px var(--amber-soft); }
  .form-field input:disabled { opacity: 0.45; cursor: not-allowed; }
  .form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .auth-submit { width: 100%; justify-content: center; padding: 12px 20px; font-size: 15px; margin-top: 4px; gap: 8px; }
  .auth-error { background: rgba(255,107,107,0.08); border: 1px solid rgba(255,107,107,0.25); border-radius: 10px; padding: 10px 14px; font-size: 13px; color: var(--rose); }
  .auth-success { background: var(--green-glow); border: 1px solid rgba(82,215,138,0.25); border-radius: 10px; padding: 10px 14px; font-size: 13px; color: var(--green); }
  .auth-footer { text-align: center; margin-top: 24px; font-size: 13px; color: var(--text-3); }
  .auth-divider { display: flex; align-items: center; gap: 12px; color: var(--text-3); font-size: 12px; }
  .auth-divider::before, .auth-divider::after { content: ''; flex: 1; height: 1px; background: var(--border); }
  /* SETTINGS */
  .settings-layout {
    display: flex; flex-direction: column; gap: 24px;
    max-width: 780px; margin: 0 auto; width: 100%;
  }
  .settings-section { display: flex; flex-direction: column; gap: 12px; }
  .settings-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 18px 0; border-bottom: 1px solid var(--border);
  }
  .settings-row:last-child { border-bottom: none; }
  .settings-row-label { font-weight: 600; color: var(--text); margin-bottom: 3px; }
  .settings-row-sub { font-size: 13px; color: var(--text-3); }
  /* Theme toggle button */
  .theme-toggle {
    width: 36px; height: 36px; border-radius: 10px; background: var(--ink-3);
    border: 1px solid var(--border); cursor: pointer; display: flex; align-items: center;
    justify-content: center; color: var(--text-2); transition: all 0.2s; font-size: 16px;
  }
  .theme-toggle:hover { background: var(--surface); color: var(--text); border-color: var(--border-2); }
  /* Auth loading */
  .auth-loading { height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--ink); }
  @media (max-width: 600px) { .form-row-2 { grid-template-columns: 1fr; } .auth-card { padding: 28px 20px; } }
`;

// ─── ICONS (SVG inline) ────────────────────────────────────────────────────────
const Icon = ({ n, s = 18 }) => {
  const icons = {
    dashboard: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /></svg>,
    chat: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>,
    quiz: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>,
    users: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>,
    search: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>,
    bell: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>,
    settings: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.07 4.93A10 10 0 1 0 21 12" /><path d="M12 2v2m0 18v-2m9-7h-2M5 12H3m15.07 6.07-1.41-1.41M7.34 7.34 5.93 5.93m12.14 0-1.41 1.41M7.34 16.66l-1.41 1.41" /></svg>,
    send: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>,
    mic: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>,
    arrow_right: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>,
    arrow_left: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>,
    check: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>,
    star: <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
    lightning: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>,
    trophy: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="8 21 12 17 16 21" /><line x1="12" y1="17" x2="12" y2="11" /><path d="M5 3H19v5a7 7 0 0 1-14 0V3z" /><path d="M5 7a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2" /><path d="M19 7a2 2 0 0 1 2 2v1a2 2 0 0 1-2 2" /></svg>,
    flame: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" /></svg>,
    book: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>,
    plus: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>,
    menu: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="18" x2="21" y2="18" /></svg>,
    x: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>,
    chart: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /><line x1="2" y1="20" x2="22" y2="20" /></svg>,
    sun: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" /></svg>,
    moon: <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>,
  };
  return icons[n] || <span>{n}</span>;
};

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
const SUBJECTS = [
  { name: "Mathematics", score: 87, color: "#F5A623", sessions: 24 },
  { name: "Physics", score: 74, color: "#4ECDC4", sessions: 18 },
  { name: "Chemistry", score: 91, color: "#9B8FFF", sessions: 31 },
  { name: "Biology", score: 62, color: "#52D78A", sessions: 12 },
  { name: "History", score: 78, color: "#FF6B6B", sessions: 9 },
];

const LEADERBOARD = [
  { name: "Priya Sharma", score: 9840, avatar: "#9B8FFF", initials: "PS", badge: "🏆" },
  { name: "Arjun Mehta", score: 9210, avatar: "#4ECDC4", initials: "AM", badge: "🥈" },
  { name: "Zara Khan", score: 8875, avatar: "#F5A623", initials: "ZK", badge: "🥉" },
  { name: "You", score: 8430, avatar: "#52D78A", initials: "ME", badge: "4️⃣", isMe: true },
  { name: "Ravi Gupta", score: 7980, avatar: "#FF6B6B", initials: "RG", badge: "" },
];

const ACTIVITY = [
  { icon: "📚", bg: "rgba(245,166,35,0.1)", text: <><strong>Completed</strong> Calculus Chapter 7 quiz — scored 94%</>, time: "2 min ago" },
  { icon: "🤖", bg: "rgba(78,205,196,0.1)", text: <><strong>AI Tutor</strong> explained Thermodynamics Laws</>, time: "18 min ago" },
  { icon: "🏆", bg: "rgba(155,143,255,0.1)", text: <>Earned <strong>Chemistry Master</strong> badge</>, time: "1h ago" },
  { icon: "⚡", bg: "rgba(82,215,138,0.1)", text: <><strong>7-day streak</strong> maintained! Keep going</>, time: "2h ago" },
];

const QUIZZES = [
  // Will be populated from API
];

const QUIZ_QUESTIONS = [
  {
    q: "What is the derivative of f(x) = x³ + 2x² − 5x + 7?",
    options: ["3x² + 4x − 5", "3x² + 2x − 5", "x² + 4x − 5", "3x³ + 4x − 5"],
    answer: 0,
    explanation: "Using the power rule: d/dx[xⁿ] = n·xⁿ⁻¹. So d/dx[x³] = 3x², d/dx[2x²] = 4x, d/dx[−5x] = −5. Constants vanish."
  },
  {
    q: "Which rule would you use to differentiate f(x) = sin(x²)?",
    options: ["Product Rule", "Quotient Rule", "Chain Rule", "Power Rule"],
    answer: 2,
    explanation: "The Chain Rule applies when differentiating a composite function. Here, outer = sin(u), inner = x². Result: 2x·cos(x²)."
  },
  {
    q: "∫(2x + 3) dx = ?",
    options: ["x² + 3x + C", "2x² + 3 + C", "x + 3 + C", "2 + C"],
    answer: 0,
    explanation: "Using the power rule of integration: ∫xⁿ dx = xⁿ⁺¹/(n+1) + C. So ∫2x dx = x² and ∫3 dx = 3x. Add C for indefinite integral."
  },
  {
    q: "What does the Fundamental Theorem of Calculus connect?",
    options: ["Limits and derivatives", "Differentiation and integration", "Series and sequences", "Trigonometry and algebra"],
    answer: 1,
    explanation: "The FTC establishes that differentiation and integration are inverse processes, bridging the two main branches of calculus."
  },
  {
    q: "If f(x) = e^(3x), what is f'(x)?",
    options: ["e^(3x)", "3e^(3x)", "3xe^(3x)", "e^x"],
    answer: 1,
    explanation: "For f(x) = eᵏˣ, f'(x) = k·eᵏˣ. Here k=3, so f'(x) = 3e^(3x). This follows directly from the chain rule."
  }
];

const CHAT_SESSIONS = [
  { id: 1, topic: "Calculus Help", preview: "Can you explain integration by parts?", time: "2m", emoji: "∫", active: true },
  { id: 2, topic: "Quantum Physics", preview: "What is wave-particle duality?", time: "1h", emoji: "⚛" },
  { id: 3, topic: "Organic Chem", preview: "Explain SN1 vs SN2 reactions", time: "3h", emoji: "🧪" },
  { id: 4, topic: "Genetics", preview: "Meiosis vs mitosis differences?", time: "1d", emoji: "🔬" },
];

const USERS = [
  { name: "Priya Sharma", email: "priya@school.edu", subject: "Mathematics", score: 9840, status: "active", avatar: "#9B8FFF", initials: "PS", joined: "Jan 2024" },
  { name: "Arjun Mehta", email: "arjun@school.edu", subject: "Physics", score: 9210, status: "active", avatar: "#4ECDC4", initials: "AM", joined: "Feb 2024" },
  { name: "Zara Khan", email: "zara@school.edu", subject: "Chemistry", score: 8875, status: "active", avatar: "#F5A623", initials: "ZK", joined: "Jan 2024" },
  { name: "Dev Patel", email: "dev@school.edu", subject: "Biology", score: 7200, status: "inactive", avatar: "#FF6B6B", initials: "DP", joined: "Mar 2024" },
  { name: "Sanya Roy", email: "sanya@school.edu", subject: "History", score: 6450, status: "active", avatar: "#52D78A", initials: "SR", joined: "Feb 2024" },
];

const AI_RESPONSES = {
  default: [
    "Great question! Let me break this down clearly for you.",
    "That's an excellent area to explore. Here's a comprehensive explanation:",
    "I'll help you understand this concept thoroughly.",
  ],
  calculus: `Integration by parts is a powerful technique for integrating products of functions. It's based on the product rule of differentiation.

**The Formula:**
\`∫u dv = uv − ∫v du\`

**How to choose u and dv:**
Use the **ILATE rule** (priority order):
- **I** — Inverse trig functions
- **L** — Logarithmic functions  
- **A** — Algebraic functions
- **T** — Trigonometric functions
- **E** — Exponential functions

**Example:** ∫x·eˣ dx
- Let u = x → du = dx
- Let dv = eˣ dx → v = eˣ

So: ∫x·eˣ dx = x·eˣ − ∫eˣ dx = **x·eˣ − eˣ + C = eˣ(x−1) + C**

Would you like me to walk through another example or explain any part in more detail?`,
  quantum: `Wave-particle duality is one of the most profound concepts in quantum mechanics! 🌊⚛

It states that every quantum entity — electrons, photons, even atoms — can exhibit **both wave-like and particle-like properties** depending on how you observe it.

**Key Experiments:**
1. **Double-slit experiment** — Electrons fired one-at-a-time still create an interference pattern (wave behavior), but when you measure *which slit* they go through, the pattern disappears (particle behavior).

2. **Photoelectric effect** — Einstein showed light behaves as discrete packets (photons) when interacting with matter — particle behavior.

**The de Broglie Relation:**
\`λ = h/p\`
Where λ is wavelength, h is Planck's constant, and p is momentum.

The act of measurement itself collapses the wave function — this is the heart of the **Copenhagen interpretation**. 🤯`,
};

// ─── STREAMING HOOK ───────────────────────────────────────────────────────────
const useStreamingText = () => {
  const [text, setText] = useState("");
  const [streaming, setStreaming] = useState(false);
  const timerRef = useRef(null);

  const stream = useCallback((fullText, onDone) => {
    setText("");
    setStreaming(true);
    let i = 0;
    const step = () => {
      if (i < fullText.length) {
        const chunk = fullText.slice(i, i + Math.floor(Math.random() * 4) + 1);
        setText(prev => prev + chunk);
        i += chunk.length;
        timerRef.current = setTimeout(step, 18 + Math.random() * 20);
      } else {
        setStreaming(false);
        onDone?.();
      }
    };
    timerRef.current = setTimeout(step, 300);
  }, []);

  useEffect(() => () => clearTimeout(timerRef.current), []);
  return { text, streaming, stream };
};

// ─── RING CHART ───────────────────────────────────────────────────────────────
const RingChart = ({ value, max = 100, size = 100, stroke = 9, color = "#F5A623", label, sub }) => {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const fill = (value / max) * circ;
  return (
    <div className="radial-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ink-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${fill} ${circ}`} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: "stroke-dasharray 1s ease" }} />
      </svg>
      <div className="ring-label">
        <div className="ring-val">{label}</div>
        {sub && <div className="ring-sub">{sub}</div>}
      </div>
    </div>
  );
};

// ─── STREAK GRID ──────────────────────────────────────────────────────────────
const StreakGrid = () => {
  const cells = Array.from({ length: 63 }, (_, i) => {
    const r = Math.random();
    if (i > 55) return "level-0";
    if (r < 0.25) return "level-0";
    if (r < 0.5) return "level-1";
    if (r < 0.75) return "level-2";
    if (r < 0.9) return "level-3";
    return "level-4";
  });
  return (
    <div className="streak-row">
      {cells.map((l, i) => <div key={i} className={`streak-cell ${l}`} />)}
    </div>
  );
};

// ─── DASHBOARD PAGE ───────────────────────────────────────────────────────────
const DashboardPage = () => {
  const [animated, setAnimated] = useState(false);
  useEffect(() => { setTimeout(() => setAnimated(true), 100); }, []);

  const barData = [
    { label: "M", val: 45 }, { label: "T", val: 72 }, { label: "W", val: 58 },
    { label: "T", val: 85 }, { label: "F", val: 63 }, { label: "S", val: 91 },
    { label: "S", val: 48 },
  ];
  const maxBar = Math.max(...barData.map(d => d.val));

  return (
    <div className="page-enter">
      <div className="stats-grid">
        {[
          { icon: "🔥", label: "Study Streak", value: "7 days", change: "+3 from last week", up: true, color: "#F5A623", bg: "rgba(245,166,35,0.08)" },
          { icon: "⭐", label: "Total XP", value: "8,430", change: "+420 this week", up: true, color: "#9B8FFF", bg: "rgba(155,143,255,0.08)" },
          { icon: "✅", label: "Quizzes Done", value: "47", change: "+5 this week", up: true, color: "#4ECDC4", bg: "rgba(78,205,196,0.08)" },
          { icon: "📈", label: "Avg Score", value: "82%", change: "-2% from last week", up: false, color: "#52D78A", bg: "rgba(82,215,138,0.08)" },
        ].map((s, i) => (
          <div className="stat-card" key={i} style={{ "--accent-color": s.color, "--accent-bg": s.bg }}>
            <div className="glow" />
            <div className="stat-icon">{s.icon}</div>
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
            <div className={`stat-change ${s.up ? "up" : "down"}`}>
              {s.up ? "↑" : "↓"} {s.change}
            </div>
          </div>
        ))}
      </div>

      <div className="grid-3" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Weekly Study Activity</div>
              <div className="card-subtitle">Minutes studied per day</div>
            </div>
            <span style={{ fontSize: 12, color: "var(--amber)", fontWeight: 600, background: "var(--amber-soft)", padding: "4px 10px", borderRadius: 20 }}>This Week</span>
          </div>
          <div className="card-body">
            <div className="chart-bar">
              {barData.map((d, i) => (
                <div key={i} className="chart-bar-item"
                  style={{ height: animated ? `${(d.val / maxBar) * 100}%` : "4px", background: d.val === maxBar ? "var(--amber)" : "var(--surface-3)", transition: `height 0.8s cubic-bezier(0.4,0,0.2,1) ${i * 80}ms` }} />
              ))}
            </div>
            <div className="chart-labels">
              {barData.map((d, i) => <div key={i} className="chart-label">{d.label}</div>)}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Overall Progress</div>
              <div className="card-subtitle">Across all subjects</div>
            </div>
          </div>
          <div className="card-body" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20 }}>
            <RingChart value={animated ? 78 : 0} color="var(--amber)" size={100} label="78%" sub="Overall" />
            <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
              {[{ label: "Accuracy", val: 82, color: "var(--cyan)" }, { label: "Consistency", val: 71, color: "var(--violet)" }].map(m => (
                <div key={m.label}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: "var(--text-3)" }}>{m.label}</span>
                    <span style={{ fontSize: 12, color: "var(--text)", fontFamily: "var(--font-mono)" }}>{m.val}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: animated ? `${m.val}%` : "0%", background: m.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Subject Performance</div>
          </div>
          <div className="card-body">
            {SUBJECTS.map((s, i) => (
              <div className="subject-row" key={i}>
                <div className="subject-dot" style={{ background: s.color }} />
                <div className="subject-name">{s.name}</div>
                <div style={{ flex: 2 }}>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: animated ? `${s.score}%` : "0%", background: s.color, transitionDelay: `${i * 100}ms` }} />
                  </div>
                </div>
                <div className="subject-score">{s.score}%</div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Leaderboard</div>
            <span className="see-all">View all</span>
          </div>
          <div className="card-body">
            {LEADERBOARD.map((p, i) => (
              <div className="lb-row" key={i} style={p.isMe ? { background: "var(--amber-soft)", borderRadius: 8, padding: "6px 8px", margin: "0 -8px" } : {}}>
                <div className={`lb-rank ${i < 3 ? "top" : ""}`}>{i + 1}</div>
                <div className="lb-avatar" style={{ background: p.avatar }}>{p.initials}</div>
                <div className="lb-name" style={p.isMe ? { color: "var(--amber)", fontWeight: 600 } : {}}>{p.name}{p.isMe ? " (You)" : ""}</div>
                <div className="lb-score">{p.score.toLocaleString()}</div>
                <div className="lb-badge">{p.badge}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Study Streak</div>
            <span style={{ fontSize: 12, color: "var(--text-3)" }}>Last 9 weeks</span>
          </div>
          <div className="card-body">
            <StreakGrid />
            <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>Less</span>
              {["level-0", "level-1", "level-2", "level-3", "level-4"].map(l => <div key={l} className={`streak-cell ${l}`} />)}
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>More</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Recent Activity</div>
          </div>
          <div className="card-body" style={{ padding: "12px 24px" }}>
            {ACTIVITY.map((a, i) => (
              <div className="activity-item" key={i}>
                <div className="activity-icon" style={{ background: a.bg }}>{a.icon}</div>
                <div>
                  <div className="activity-text">{a.text}</div>
                  <div className="activity-time">{a.time}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── CHAT PAGE ────────────────────────────────────────────────────────────────
const ChatPage = () => {
  const [activeSession, setActiveSession] = useState(1);
  const [messages, setMessages] = useState([
    { id: 1, role: "assistant", text: "Hi! I'm your AI tutor powered by GPT-4. I can help you with any subject — mathematics, sciences, history, and more. What would you like to explore today? 🎓" },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [recording, setRecording] = useState(false);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(scrollToBottom, [messages, isTyping]);

  const autoResize = () => {
    const t = textareaRef.current;
    if (t) { t.style.height = "24px"; t.style.height = t.scrollHeight + "px"; }
  };

  const getAIResponse = (msg) => {
    const lower = msg.toLowerCase();
    if (lower.includes("integrat") || lower.includes("calculus") || lower.includes("derivative")) return AI_RESPONSES.calculus;
    if (lower.includes("quantum") || lower.includes("wave") || lower.includes("particle")) return AI_RESPONSES.quantum;
    return `That's a great question about **"${msg.slice(0, 40)}${msg.length > 40 ? "..." : ""}"**.\n\nLet me provide a comprehensive explanation:\n\nThis topic involves several key concepts that build upon each other. The foundational principles suggest that understanding the core mechanisms first will help you grasp more advanced applications.\n\n**Key Points:**\n1. Start with the basic definitions and terminology\n2. Apply the concepts to simple examples before tackling complex problems\n3. Practice regularly to reinforce your understanding\n\nWould you like me to dive deeper into any specific aspect, or shall I provide some practice problems?`;
  };

  const sendMessage = () => {
    if (!input.trim() || isTyping) return;
    const userMsg = { id: Date.now(), role: "user", text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    if (textareaRef.current) { textareaRef.current.style.height = "24px"; }
    setIsTyping(true);

    setTimeout(() => {
      const responseText = getAIResponse(input);
      setIsTyping(false);
      let streamed = "";
      const fullId = Date.now() + 1;
      setMessages(prev => [...prev, { id: fullId, role: "assistant", text: "" }]);

      let i = 0;
      const step = () => {
        if (i < responseText.length) {
          const chunk = responseText.slice(i, i + Math.floor(Math.random() * 5) + 1);
          streamed += chunk;
          i += chunk.length;
          setMessages(prev => prev.map(m => m.id === fullId ? { ...m, text: streamed } : m));
          setTimeout(step, 15 + Math.random() * 15);
        }
      };
      step();
    }, 800 + Math.random() * 400);
  };

  const formatText = (text) => {
    const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    return parts.map((p, i) => {
      if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} style={{ color: "var(--text)", fontWeight: 600 }}>{p.slice(2, -2)}</strong>;
      if (p.startsWith("`") && p.endsWith("`")) return <code key={i}>{p.slice(1, -1)}</code>;
      return p.split("\n").map((line, j) => <span key={j}>{line}{j < p.split("\n").length - 1 && <br />}</span>);
    });
  };

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }} className="page-enter">
      <div className="chat-layout" style={{ flex: 1, overflow: "hidden" }}>
        <div className="chat-sidebar">
          <div style={{ padding: "16px", borderBottom: "1px solid var(--border)", display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", flex: 1 }}>AI Tutor Sessions</span>
            <button className="btn btn-primary" style={{ padding: "6px 12px", fontSize: 12 }}><Icon n="plus" s={13} /> New</button>
          </div>
          <div className="chat-list">
            {CHAT_SESSIONS.map(s => (
              <div key={s.id} className={`chat-list-item ${activeSession === s.id ? "active" : ""}`} onClick={() => setActiveSession(s.id)}>
                <div className="chat-ai-icon" style={{ background: s.id === 1 ? "var(--amber-soft)" : "var(--surface)" }}>{s.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div className="chat-topic">{s.topic}</div>
                    <div className="chat-time">{s.time}</div>
                  </div>
                  <div className="chat-preview">{s.preview}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: 16, borderTop: "1px solid var(--border)" }}>
            <div style={{ background: "var(--amber-soft)", border: "1px solid rgba(245,166,35,0.2)", borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--amber)", marginBottom: 4 }}>💡 Pro Tip</div>
              <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>Try asking me to create practice problems or explain concepts with analogies!</div>
            </div>
          </div>
        </div>

        <div className="chat-main">
          <div className="chat-topbar">
            <div style={{ fontSize: 20 }}>∫</div>
            <div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 15, color: "var(--text)" }}>Calculus Help</div>
              <div className="chat-ai-status">GPT-4 Turbo — Online</div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button className="icon-btn"><Icon n="search" s={15} /></button>
              <button className="icon-btn"><Icon n="settings" s={15} /></button>
            </div>
          </div>

          <div className="messages">
            {messages.map(m => (
              <div key={m.id} className={`msg ${m.role === "user" ? "user" : ""}`}>
                {m.role === "assistant" && (
                  <div className="msg-avatar" style={{ background: "linear-gradient(135deg, #F5A623, #E8900A)" }}>🤖</div>
                )}
                <div className="msg-bubble">{formatText(m.text)}</div>
                {m.role === "user" && (
                  <div className="msg-avatar" style={{ background: "linear-gradient(135deg, var(--violet), var(--cyan))" }}>ME</div>
                )}
              </div>
            ))}
            {isTyping && (
              <div className="msg">
                <div className="msg-avatar" style={{ background: "linear-gradient(135deg, #F5A623, #E8900A)" }}>🤖</div>
                <div className="msg-bubble">
                  <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="chat-input-area">
            <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
              {["Explain with an example", "Give me practice problems", "Simplify this concept"].map(s => (
                <button key={s} onClick={() => setInput(s)} style={{ fontSize: 12, padding: "5px 12px", background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20, color: "var(--text-2)", cursor: "pointer", whiteSpace: "nowrap" }}>{s}</button>
              ))}
            </div>
            <div className="chat-input-box">
              <textarea ref={textareaRef} placeholder="Ask me anything — maths, science, history..." rows={1}
                value={input} onChange={e => { setInput(e.target.value); autoResize(); }}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }} />
              <button className={`mic-btn ${recording ? "recording" : ""}`} onClick={() => setRecording(r => !r)} title="Voice input (Whisper API)">
                <Icon n="mic" s={15} />
              </button>
              <button className="send-btn" onClick={sendMessage} disabled={!input.trim() || isTyping}>
                <Icon n="send" s={15} />
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-3)", textAlign: "center" }}>
              Powered by GPT-4 Turbo · Voice via Whisper API · TTS responses available
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── QUIZ PAGE ────────────────────────────────────────────────────────────────
const QuizPage = () => {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [started, setStarted] = useState(false);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [answers, setAnswers] = useState([]);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchQuizzes();
  }, []);

  const fetchQuizzes = async () => {
    try {
      const data = await apiFetch('/quizzes/');
      // Transform API data to match UI format
      const transformed = data.items.map(q => ({
        id: q.id,
        title: q.title,
        subject: q.subject?.name || 'General',
        questions: q.question_count,
        time: `${Math.floor(q.time_limit_seconds / 60)} min`,
        difficulty: q.difficulty,
        emoji: getSubjectEmoji(q.subject?.name),
        bg: getSubjectBg(q.subject?.name),
        color: getSubjectColor(q.subject?.name),
        description: q.description,
      }));
      setQuizzes(transformed);
    } catch (error) {
      console.error('Failed to fetch quizzes:', error);
    } finally {
      setLoading(false);
    }
  };

  const getSubjectEmoji = (subject) => {
    const emojis = { Mathematics: '∫', Physics: '⚛', Chemistry: '🧪', Biology: '🔬' };
    return emojis[subject] || '📚';
  };

  const getSubjectBg = (subject) => {
    const bgs = {
      Mathematics: 'rgba(245,166,35,0.1)',
      Physics: 'rgba(78,205,196,0.1)',
      Chemistry: 'rgba(155,143,255,0.1)',
      Biology: 'rgba(82,215,138,0.1)'
    };
    return bgs[subject] || 'rgba(155,143,255,0.1)';
  };

  const getSubjectColor = (subject) => {
    const colors = { Mathematics: '#F5A623', Physics: '#4ECDC4', Chemistry: '#9B8FFF', Biology: '#52D78A' };
    return colors[subject] || '#9B8FFF';
  };

  const reset = () => { setStarted(false); setQIndex(0); setSelected(null); setRevealed(false); setAnswers([]); setDone(false); };
  const startQuiz = async (q) => {
    setSelectedQuiz(q);
    reset();
    setStarted(true);
    // Fetch full quiz data with questions
    try {
      const quizData = await apiFetch(`/quizzes/${q.id}`);
      setSelectedQuiz({ ...q, questions: quizData.questions });
    } catch (error) {
      console.error('Failed to fetch quiz questions:', error);
    }
  };

  const handleSelect = (i) => { if (revealed) return; setSelected(i); };
  const handleCheck = () => {
    if (selected === null) return;
    setRevealed(true);
    setAnswers(prev => [...prev, selected === selectedQuiz.questions[qIndex].correct_idx]);
  };

  const handleNext = () => {
    if (qIndex === selectedQuiz.questions.length - 1) { setDone(true); return; }
    setQIndex(i => i + 1); setSelected(null); setRevealed(false);
  };

  const submitQuiz = async () => {
    setSubmitting(true);
    try {
      const answersObj = {};
      selectedQuiz.questions.forEach((q, i) => {
        answersObj[q.id] = answers[i] !== undefined ? answers[i] : null;
      });

      const result = await apiFetch(`/quizzes/${selectedQuiz.id}/attempt`, {
        method: 'POST',
        body: JSON.stringify({ answers: answersObj })
      });

      // Update done state with results
      setDone({ ...result, answers });
    } catch (error) {
      console.error('Failed to submit quiz:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const correctCount = answers.filter(Boolean).length;
  const pct = selectedQuiz?.questions ? Math.round((correctCount / selectedQuiz.questions.length) * 100) : 0;

  if (loading) {
    return (
      <div className="page-enter">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <div>Loading quizzes...</div>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="page-enter">
        <div className="section-header">
          <div>
            <div className="section-title">Quiz Engine</div>
            <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>Adaptive quizzes powered by spaced repetition</div>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button className="btn btn-secondary" onClick={() => fetchQuizzes()}>
              <Icon n="refresh" s={15} /> Refresh
            </button>
            <button className="btn btn-primary" onClick={async () => {
              try {
                const result = await apiFetch('/quiz-engine/adaptive');
                const transformed = {
                  id: result.id,
                  title: result.title,
                  subject: result.subject?.name || 'Adaptive',
                  difficulty: result.difficulty,
                  emoji: '🎯',
                  bg: 'rgba(245,166,35,0.1)',
                  color: '#F5A623',
                  questions: result.questions,
                };
                startQuiz(transformed);
              } catch (error) {
                console.error('Failed to get adaptive quiz:', error);
              }
            }}>
              <Icon n="target" s={15} /> Adaptive Quiz
            </button>
          </div>
        </div>
        <div className="quiz-layout">
          <div className="quiz-list-panel">
            <div style={{ marginBottom: 12 }}>
              <div className="pill-tabs">
                {["All", "In Progress", "Completed"].map(t => (
                  <button key={t} className={`pill-tab ${t === "All" ? "active" : ""}`}>{t}</button>
                ))}
              </div>
            </div>
            {quizzes.map(q => (
              <div key={q.id} className={`quiz-card ${selectedQuiz?.id === q.id ? "active" : ""}`} onClick={() => setSelectedQuiz(q)}>
                <div className="quiz-card-top">
                  <div style={{ width: 40, height: 40, background: q.bg, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flex: "0 0 auto" }}>{q.emoji}</div>
                  <div style={{ flex: 1 }}>
                    <span className="quiz-tag" style={{ background: q.bg, color: q.color }}>{q.subject}</span>
                  </div>
                  <span className="quiz-tag" style={{ background: q.difficulty === "hard" ? "rgba(255,107,107,0.1)" : q.difficulty === "medium" ? "rgba(245,166,35,0.1)" : "rgba(82,215,138,0.1)", color: q.difficulty === "hard" ? "var(--rose)" : q.difficulty === "medium" ? "var(--amber)" : "var(--green)" }}>{q.difficulty}</span>
                </div>
                <div className="quiz-card-title">{q.title}</div>
                <div className="quiz-meta">
                  <span className="quiz-meta-item">📝 {q.questions} Qs</span>
                  <span className="quiz-meta-item">⏱ {q.time}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="quiz-main-panel">
            {selectedQuiz ? (
              <div className="card" style={{ height: "100%" }}>
                <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 20, height: "100%", justifyContent: "center", alignItems: "center", textAlign: "center", padding: 48 }}>
                  <div style={{ width: 80, height: 80, background: selectedQuiz.bg, borderRadius: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>{selectedQuiz.emoji}</div>
                  <div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, color: "var(--text)", marginBottom: 8 }}>{selectedQuiz.title}</div>
                    <div style={{ fontSize: 14, color: "var(--text-3)", lineHeight: 1.7, maxWidth: 440 }}>{selectedQuiz.description || `Test your knowledge with ${selectedQuiz.questions} carefully crafted questions. Track your progress and review detailed explanations for each answer.`}</div>
                  </div>
                  <div style={{ display: "flex", gap: 24 }}>
                    {[["📝", `${selectedQuiz.questions} Questions`], ["⏱", selectedQuiz.time], ["📊", selectedQuiz.difficulty]].map(([e, l]) => (
                      <div key={l} style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 24, marginBottom: 4 }}>{e}</div>
                        <div style={{ fontSize: 12, color: "var(--text-3)", fontWeight: 500 }}>{l}</div>
                      </div>
                    ))}
                  </div>
                  <button className="btn btn-primary" style={{ padding: "14px 36px", fontSize: 15 }} onClick={() => startQuiz(selectedQuiz)}>
                    Start Quiz <Icon n="arrow_right" s={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="card" style={{ height: "100%" }}>
                <div className="empty-state">
                  <div className="empty-icon">📋</div>
                  <div className="empty-text">Select a quiz to begin</div>
                  <div className="empty-sub">Choose from {quizzes.length} available quizzes</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (done) {
    const grade = pct >= 90 ? "Excellent!" : pct >= 75 ? "Good Job!" : pct >= 60 ? "Keep Practicing" : "Needs Improvement";
    return (
      <div className="page-enter">
        <div className="card" style={{ maxWidth: 600, margin: "0 auto" }}>
          <div className="result-screen">
            <div style={{ fontSize: 48, marginBottom: 8 }}>{pct >= 90 ? "🏆" : pct >= 75 ? "⭐" : pct >= 60 ? "📈" : "📚"}</div>
            <div className="result-score">{pct}%</div>
            <div className="result-label">{grade}</div>
            <div className="result-grid">
              {done.attempt ? [
                ["Correct", `${done.correct_count}/${done.total_questions}`],
                ["Time", done.attempt.time_taken_seconds ? `${Math.floor(done.attempt.time_taken_seconds / 60)}:${(done.attempt.time_taken_seconds % 60).toString().padStart(2, '0')}` : "N/A"],
                ["XP Earned", `+${done.attempt.xp_earned}`]
              ].map(([l, v]) => (
                <div key={l} className="result-stat">
                  <div className="result-stat-val">{v}</div>
                  <div className="result-stat-lbl">{l}</div>
                </div>
              )) : (
                [["Correct", `${correctCount}/${selectedQuiz.questions.length}`], ["Time", "N/A"], ["XP Earned", "N/A"]].map(([l, v]) => (
                  <div key={l} className="result-stat">
                    <div className="result-stat-val">{v}</div>
                    <div className="result-stat-lbl">{l}</div>
                  </div>
                ))
              )}
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <button className="btn btn-secondary" onClick={reset}>Review Answers</button>
              <button className="btn btn-primary" onClick={() => { reset(); setSelectedQuiz(null); }}>
                Back to Quizzes <Icon n="arrow_right" s={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedQuiz.questions || selectedQuiz.questions.length === 0) {
    return (
      <div className="page-enter">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <div>Loading quiz questions...</div>
        </div>
      </div>
    );
  }

  if (qIndex < 0 || qIndex >= selectedQuiz.questions.length) {
    return (
      <div className="page-enter">
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 18, color: "var(--rose)" }}>Error: Invalid question index</div>
        </div>
      </div>
    );
  }

  const q = selectedQuiz.questions[qIndex];
  
  if (!q || !q.text || !q.options || q.correct_idx === undefined) {
    return (
      <div className="page-enter">
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 18, color: "var(--rose)" }}>Error: Question data is incomplete</div>
          <button className="btn btn-primary" onClick={reset} style={{ marginTop: 20 }}>Exit Quiz</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page-enter">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <button className="btn btn-ghost" onClick={reset}><Icon n="arrow_left" s={15} /> Exit Quiz</button>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-3)" }}>
          {qIndex + 1} / {selectedQuiz.questions.length}
        </span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--amber)", background: "var(--amber-soft)", padding: "4px 12px", borderRadius: 20 }}>⏱ 4:32</span>
      </div>

      <div style={{ maxWidth: 680, margin: "0 auto" }}>
        <div className="q-progress-bar">
          <div className="q-progress-fill" style={{ width: `${((qIndex + (revealed ? 1 : 0)) / selectedQuiz.questions.length) * 100}%` }} />
        </div>

        <div className="question-panel">
          <div className="q-number">QUESTION {qIndex + 1} OF {selectedQuiz.questions.length}</div>
          <div className="q-text">{q.text}</div>
          <div className="q-options">
            {q.options.map((opt, i) => {
              let cls = "";
              if (revealed) { if (i === q.correct_idx) cls = "correct"; else if (i === selected) cls = "wrong"; }
              else if (i === selected) cls = "selected";
              return (
                <div key={i} className={`q-option ${cls}`} onClick={() => handleSelect(i)}>
                  <div className="q-option-letter">{String.fromCharCode(65 + i)}</div>
                  {opt}
                  {revealed && i === q.correct_idx && <span style={{ marginLeft: "auto" }}>✓</span>}
                </div>
              );
            })}
          </div>

          {revealed && <div className="q-explanation">💡 <strong>Explanation:</strong> {q.explanation}</div>}

          <div className="q-actions">
            {!revealed ? (
              <button className="btn btn-primary" style={{ marginLeft: "auto" }} disabled={selected === null} onClick={handleCheck}>
                Check Answer
              </button>
            ) : qIndex === selectedQuiz.questions.length - 1 ? (
              <button className="btn btn-primary" style={{ marginLeft: "auto" }} disabled={submitting} onClick={submitQuiz}>
                {submitting ? "Submitting..." : "Submit Quiz"} <Icon n="send" s={15} />
              </button>
            ) : (
              <button className="btn btn-primary" style={{ marginLeft: "auto" }} onClick={handleNext}>
                Next Question <Icon n="arrow_right" s={15} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── USERS PAGE ───────────────────────────────────────────────────────────────
const UsersPage = () => (
  <div className="page-enter">
    <div className="section-header">
      <div>
        <div className="section-title">Concurrent Users</div>
        <div style={{ fontSize: 13, color: "var(--text-3)", marginTop: 2 }}>Manage learners — {USERS.length} registered</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-ghost">Export</button>
        <button className="btn btn-primary"><Icon n="plus" s={15} /> Invite</button>
      </div>
    </div>

    <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3,1fr)", marginBottom: 24 }}>
      {[
        { icon: "👥", label: "Total Users", value: "1,248", up: true, color: "#4ECDC4", bg: "rgba(78,205,196,0.08)" },
        { icon: "🟢", label: "Active Now", value: "342", up: true, color: "#52D78A", bg: "rgba(82,215,138,0.08)" },
        { icon: "📊", label: "Avg Session", value: "42 min", up: false, color: "#9B8FFF", bg: "rgba(155,143,255,0.08)" },
      ].map((s, i) => (
        <div className="stat-card" key={i} style={{ "--accent-color": s.color, "--accent-bg": s.bg }}>
          <div className="glow" />
          <div className="stat-icon">{s.icon}</div>
          <div className="stat-value">{s.value}</div>
          <div className="stat-label">{s.label}</div>
        </div>
      ))}
    </div>

    <div className="card">
      <table className="table">
        <thead>
          <tr>
            <th>User</th>
            <th>Email</th>
            <th>Top Subject</th>
            <th>XP Score</th>
            <th>Status</th>
            <th>Joined</th>
          </tr>
        </thead>
        <tbody>
          {USERS.map((u, i) => (
            <tr key={i}>
              <td>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div className="lb-avatar" style={{ background: u.avatar, width: 32, height: 32, fontSize: 11, borderRadius: 10 }}>{u.initials}</div>
                  <span style={{ fontWeight: 500, color: "var(--text)" }}>{u.name}</span>
                </div>
              </td>
              <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)" }}>{u.email}</td>
              <td>{u.subject}</td>
              <td><span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{u.score.toLocaleString()}</span></td>
              <td><span className={`status-pill ${u.status === "active" ? "status-active" : "status-inactive"}`}>{u.status === "active" ? "● Active" : "○ Inactive"}</span></td>
              <td style={{ fontSize: 12, color: "var(--text-3)" }}>{u.joined}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ─── LOGIN PAGE ──────────────────────────────────────────────────────────────
function LoginPage({ onGoSignup }) {
  const { login } = useAuth();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(form.identifier, form.password);
    } catch (err) {
      setError(err.error || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-mark" style={{ width: 52, height: 52, fontSize: 22, margin: '0 auto' }}>A</div>
          <h1 className="auth-title">Welcome back</h1>
          <p className="auth-sub">Sign in to your ApexLearn account</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">⚠ {error}</div>}
          <div className="form-field">
            <label>Email or Username</label>
            <input id="login-identifier" type="text" placeholder="you@email.com or username"
              value={form.identifier} onChange={e => setForm(f => ({ ...f, identifier: e.target.value }))} required />
          </div>
          <div className="form-field">
            <label>Password</label>
            <input id="login-password" type="password" placeholder="••••••••"
              value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
          </div>
          <button id="login-submit" type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Signing in…</> : 'Sign in →'}
          </button>
        </form>
        <div className="auth-footer">
          Don't have an account?{' '}<span className="see-all" onClick={onGoSignup}>Create one</span>
        </div>
      </div>
    </div>
  );
}

// ─── SIGNUP PAGE ─────────────────────────────────────────────────────────────
function SignupPage({ onGoLogin }) {
  const [form, setForm] = useState({ email: '', username: '', display_name: '', password: '', role: 'student' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.register(form);
      setSuccess(true);
    } catch (err) {
      const detail = err.details ? Object.values(err.details).flat().join('. ') : '';
      setError((err.error || 'Registration failed.') + (detail ? ` ${detail}` : ''));
    } finally {
      setLoading(false);
    }
  };

  if (success) return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
        <h2 style={{ color: 'var(--text)', fontFamily: 'var(--font-display)', marginBottom: 8, fontSize: 22 }}>Account Created!</h2>
        <p style={{ color: 'var(--text-2)', marginBottom: 28 }}>Check your email to verify your account, then sign in.</p>
        <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={onGoLogin}>Go to Sign In</button>
      </div>
    </div>
  );

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-mark" style={{ width: 52, height: 52, fontSize: 22, margin: '0 auto' }}>A</div>
          <h1 className="auth-title">Create account</h1>
          <p className="auth-sub">Join ApexLearn and start your journey</p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          {error && <div className="auth-error">⚠ {error}</div>}
          <div className="form-row-2">
            <div className="form-field">
              <label>Display Name</label>
              <input type="text" placeholder="Alex Kumar" value={form.display_name}
                onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} required />
            </div>
            <div className="form-field">
              <label>Username</label>
              <input type="text" placeholder="alex_k" value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))} required />
            </div>
          </div>
          <div className="form-field">
            <label>Email</label>
            <input type="email" placeholder="you@email.com" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
          </div>
          <div className="form-field">
            <label>Password <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(min 8 chars, 1 uppercase, 1 digit)</span></label>
            <input type="password" placeholder="••••••••" value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
          </div>
          <div className="form-field">
            <label>I am a</label>
            <div className="pill-tabs">
              {['student', 'teacher'].map(r => (
                <button key={r} type="button" className={`pill-tab ${form.role === r ? 'active' : ''}`}
                  onClick={() => setForm(f => ({ ...f, role: r }))}>
                  {r === 'student' ? '🎓 Student' : '👨‍🏫 Teacher'}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
            {loading ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Creating account…</> : 'Create Account →'}
          </button>
        </form>
        <div className="auth-footer">
          Already have an account?{' '}<span className="see-all" onClick={onGoLogin}>Sign in</span>
        </div>
      </div>
    </div>
  );
}

// ─── SETTINGS PAGE ───────────────────────────────────────────────────────────
function SettingsPage() {
  const { user, logout, updateUser } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const [form, setForm] = useState({ display_name: user?.display_name || '', avatar_url: user?.avatar_url || '' });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [resetMsg, setResetMsg] = useState('');

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true); setError(''); setSaved(false);
    try {
      const updated = await authApi.updateProfile(form);
      updateUser(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.error || 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const requestReset = async () => {
    try {
      await authApi.requestPasswordReset(user.email);
      setResetMsg('✓ Reset email sent to ' + user.email);
    } catch {
      setResetMsg('Failed to send reset email.');
    }
  };

  const initials = (user?.display_name || user?.username || 'U')
    .split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className="page-enter settings-layout">
      {/* ── Profile */}
      <div className="settings-section">
        <div className="section-header">
          <div className="section-title">Profile</div>
        </div>
        <div className="card">
          <div className="card-body" style={{ display: 'flex', gap: 28, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, paddingTop: 4 }}>
              <div className="avatar" style={{ width: 72, height: 72, fontSize: 22, borderRadius: 18, position: 'relative', overflow: 'hidden' }}>
                {form.avatar_url
                  ? <img src={form.avatar_url} alt="avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => e.currentTarget.style.display = 'none'} />
                  : initials}
              </div>
              <span style={{ background: 'var(--amber-soft)', color: 'var(--amber)', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
                {user?.role?.charAt(0).toUpperCase() + user?.role?.slice(1)}
              </span>
              <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>@{user?.username}</div>
            </div>
            <form className="auth-form" style={{ flex: 1, minWidth: 240 }} onSubmit={saveProfile}>
              {error && <div className="auth-error">⚠ {error}</div>}
              {saved && <div className="auth-success">✓ Profile saved successfully!</div>}
              <div className="form-row-2">
                <div className="form-field">
                  <label>Display Name</label>
                  <input type="text" value={form.display_name}
                    onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} />
                </div>
                <div className="form-field">
                  <label>Username</label>
                  <input type="text" value={user?.username || ''} disabled />
                </div>
              </div>
              <div className="form-field">
                <label>Email</label>
                <input type="email" value={user?.email || ''} disabled />
              </div>
              <div className="form-field">
                <label>Avatar URL <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(optional)</span></label>
                <input type="url" placeholder="https://example.com/avatar.jpg" value={form.avatar_url}
                  onChange={e => setForm(f => ({ ...f, avatar_url: e.target.value }))} />
              </div>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ justifyContent: 'center' }}>
                {saving ? <><span className="spinner" style={{ width: 16, height: 16 }} /> Saving…</> : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* ── Appearance */}
      <div className="settings-section">
        <div className="section-header">
          <div className="section-title">Appearance</div>
        </div>
        <div className="card">
          <div className="card-body">
            <div className="settings-row">
              <div>
                <div className="settings-row-label">Theme</div>
                <div className="settings-row-sub">{theme === 'dark' ? 'Dark mode is on' : 'Light mode is on'}</div>
              </div>
              <button
                className="theme-toggle"
                onClick={toggleTheme}
                title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                style={{ width: 'auto', padding: '8px 16px', gap: 8, display: 'flex', alignItems: 'center', fontSize: 13, fontWeight: 600, color: 'var(--text)', fontFamily: 'var(--font-body)', borderRadius: 10 }}
              >
                {theme === 'dark' ? <><Icon n="sun" s={15} /> Light Mode</> : <><Icon n="moon" s={15} /> Dark Mode</>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Security */}
      <div className="settings-section">
        <div className="section-header">
          <div className="section-title">Security</div>
        </div>
        <div className="card">
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div className="settings-row">
              <div>
                <div className="settings-row-label">Password Reset</div>
                <div className="settings-row-sub">We'll send a reset link to <strong style={{ color: 'var(--text-2)' }}>{user?.email}</strong></div>
                {resetMsg && <div style={{ fontSize: 12, color: 'var(--green)', marginTop: 6 }}>{resetMsg}</div>}
              </div>
              <button className="btn btn-ghost" style={{ flexShrink: 0 }} onClick={requestReset}>Send Reset Email</button>
            </div>
            <div className="settings-row" style={{ borderBottom: 'none' }}>
              <div>
                <div className="settings-row-label" style={{ color: 'var(--rose)' }}>Sign Out</div>
                <div className="settings-row-sub">Sign out of your account on this device</div>
              </div>
              <button className="btn" style={{ background: 'rgba(255,107,107,0.1)', color: 'var(--rose)', border: '1px solid rgba(255,107,107,0.2)', flexShrink: 0 }}
                onClick={logout}>
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Account Info */}
      <div className="settings-section">
        <div className="section-header">
          <div className="section-title">Account Info</div>
        </div>
        <div className="card">
          <div className="card-body">
            {[
              { label: 'User ID', value: user?.id },
              { label: 'Member Since', value: user?.created_at ? new Date(user.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : '—' },
              { label: 'Email Verified', value: user?.email_verified ? '✓ Verified' : '✗ Not verified' },
            ].map(row => (
              <div key={row.label} className="settings-row">
                <span style={{ fontSize: 13, color: 'var(--text-3)' }}>{row.label}</span>
                <span style={{ fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── APP SHELL ───────────────────────────────────────────────────────────────
function AppShell() {
  const { user, authLoading, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const [page, setPage] = useState('dashboard');
  const [authPage, setAuthPage] = useState('login');
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [searchVal, setSearchVal] = useState('');

  const initials = user
    ? (user.display_name || user.username || 'U').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : 'ME';
  const roleLabel = user ? (user.role?.charAt(0).toUpperCase() + user.role?.slice(1)) + ' · Pro' : '';

  const pageMap = {
    dashboard: { title: 'Dashboard', sub: `Welcome back, ${user?.display_name?.split(' ')[0] || 'there'} 👋`, component: <DashboardPage /> },
    chat: { title: 'AI Tutor', sub: 'Real-time learning assistant with RAG', component: <AiTutorPage /> },
    quiz: { title: 'Quiz Engine', sub: 'Test your knowledge', component: <QuizPage /> },
    users: { title: 'Users', sub: 'Manage learners', component: <UsersPage /> },
    settings: { title: 'Settings', sub: 'Manage your profile & account', component: <SettingsPage /> },
    admin: { title: 'Admin Panel', sub: 'Manage documents, PYQs & subjects', component: <AdminPanel /> },
    onboarding: { title: 'Setup', sub: 'Configure your NEET-PG preparation', component: <StudentOnboarding onComplete={() => setPage('studyplan')} /> },
    studyplan: { title: 'Study Plan', sub: 'AI-personalized preparation schedule', component: <StudyPlanView /> },
    assessment: { title: 'Topic Assessment', sub: 'Diagnose, train & master topics', component: <TopicAssessmentView /> },
    revision: { title: 'Revision Schedule', sub: 'Spaced repetition for retention', component: <RevisionDashboard /> },
  };

  const nav = [
    { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
    { id: 'studyplan', icon: 'chart', label: 'Study Plan' },
    { id: 'assessment', icon: 'quiz', label: 'Assessment' },
    { id: 'revision', icon: 'calendar', label: 'Revision' },
    { id: 'chat', icon: 'chat', label: 'AI Tutor' },
    { id: 'quiz', icon: 'quiz', label: 'Quizzes' },
    ...(user?.role === 'admin' ? [{ id: 'admin', icon: 'settings', label: 'Admin' }] : []),
  ];

  const current = pageMap[page] || pageMap.dashboard;

  if (authLoading) return (
    <>
      <style>{styles}</style>
      <div className="auth-loading"><div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} /></div>
    </>
  );

  if (!user) return (
    <>
      <style>{styles}</style>
      {authPage === 'login'
        ? <LoginPage onGoSignup={() => setAuthPage('signup')} />
        : <SignupPage onGoLogin={() => setAuthPage('login')} />}
    </>
  );

  return (
    <>
      <style>{styles}</style>
      <div className="app">
        <nav className={`sidebar ${sidebarExpanded ? 'expanded' : ''}`}>
          {sidebarExpanded ? (
            <div className="logo-wrap">
              <div className="logo-mark">A</div>
              <div className="logo-text">Apex<span>Learn</span></div>
              <button className="icon-btn" style={{ marginLeft: 'auto', width: 28, height: 28 }} onClick={() => setSidebarExpanded(false)}><Icon n="x" s={14} /></button>
            </div>
          ) : (
            <>
              <div className="logo-mark" style={{ marginBottom: 0 }}>A</div>
              <button className="nav-item" onClick={() => setSidebarExpanded(true)} style={{ marginTop: 4 }}><Icon n="menu" /></button>
            </>
          )}

          <div className="nav-divider" />

          {nav.map(n => (
            <button key={n.id} className={`nav-item ${page === n.id ? 'active' : ''}`} onClick={() => setPage(n.id)}>
              <Icon n={n.icon} />
              {sidebarExpanded && <span className="nav-label">{n.label}</span>}
              {n.badge && <span className="badge">{n.badge}</span>}
            </button>
          ))}

          <div className="nav-divider" />
          <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}>
            <Icon n="settings" />
            {sidebarExpanded && <span className="nav-label">Settings</span>}
          </button>

          <div className="sidebar-bottom">
            <div className="nav-divider" />
            {sidebarExpanded ? (
              <div className="avatar-row">
                <div className="avatar">{initials}</div>
                <div className="avatar-info">
                  <div className="avatar-name">{user.display_name || user.username}</div>
                  <div className="avatar-role">{roleLabel}</div>
                </div>
              </div>
            ) : (
              <div className="avatar" title={user.display_name || user.username}>{initials}</div>
            )}
          </div>
        </nav>

        <div className="main">
          <div className="topbar">
            <div>
              <div className="topbar-title">{current.title}</div>
              <div className="topbar-sub">{current.sub}</div>
            </div>
            <div className="topbar-right">
              <div className="search-box">
                <Icon n="search" s={14} />
                <input placeholder="Search topics, quizzes..." value={searchVal} onChange={e => setSearchVal(e.target.value)} />
              </div>
              <div className="notif-dot">
                <button className="icon-btn"><Icon n="bell" s={16} /></button>
              </div>
              <button className="icon-btn theme-toggle" title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'} onClick={toggleTheme}>
                <Icon n={theme === 'dark' ? 'sun' : 'moon'} s={16} />
              </button>
              <button className="icon-btn" title={user.display_name} onClick={() => setPage('settings')}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12 }}>{initials}</span>
              </button>
            </div>
          </div>

          <div className="content" key={page}>
            {current.component}
          </div>
        </div>
      </div>
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ThemeProvider>
  );
}
