// Reactive store for the Cherry Blossom biome — meditation session logger.
// The canvas tracks real-time stillness; this store logs completed sessions.

const KEY = 'terrarium.blossom.v1';
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { sessions: [] };
    const data = JSON.parse(raw);
    if (!Array.isArray(data.sessions)) data.sessions = [];
    return data;
  } catch {
    return { sessions: [] };
  }
}

let state = load();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}
function emit() { for (const fn of listeners) fn(); }

export function subscribeBlossom(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSessions() { return state.sessions; }

export function addSession(seconds) {
  const s = { id: Date.now(), ts: Date.now(), seconds: Math.max(1, Math.round(seconds)) };
  state = { ...state, sessions: [...state.sessions, s] };
  persist(); emit();
  return s;
}

export function resetBlossom() {
  state = { sessions: [] };
  persist(); emit();
}

const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export function meditatedToday() {
  const today = dayKey(Date.now());
  return state.sessions.some((s) => dayKey(s.ts) === today);
}

export function meditationStreak() {
  if (!state.sessions.length) return 0;
  const days = new Set(state.sessions.map((s) => dayKey(s.ts)));
  let streak = 0;
  const cursor = new Date();
  for (;;) {
    if (days.has(dayKey(cursor.getTime()))) { streak++; cursor.setDate(cursor.getDate() - 1); }
    else break;
  }
  return streak;
}

export function totalSeconds() {
  return state.sessions.reduce((sum, s) => sum + (s.seconds || s.minutes * 60 || 0), 0);
}

export function totalMinutes() {
  return Math.floor(totalSeconds() / 60);
}
