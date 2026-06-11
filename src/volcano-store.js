// Reactive localStorage store for the Volcano biome.
// You log stress levels (1–5) and exercise (1–5) each day.
// The volcano reacts to the balance: high stress + high exercise = beautiful
// controlled eruption; high stress + low exercise = dangerous eruption.

const KEY = 'terrarium.volcano.v1';
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { logs: [] };
    const data = JSON.parse(raw);
    if (!Array.isArray(data.logs)) data.logs = [];
    return data;
  } catch {
    return { logs: [] };
  }
}

let state = load();

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
}
function emit() { for (const fn of listeners) fn(); }

export function subscribeVolcano(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getVolcanoLogs() { return state.logs; }

export function addVolcanoLog(stress, exercise, note = '') {
  const l = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts: Date.now(),
    stress: Math.min(5, Math.max(1, stress)),
    exercise: Math.min(5, Math.max(1, exercise)),
    note: note.trim(),
  };
  state = { ...state, logs: [...state.logs, l] };
  persist(); emit();
  return l;
}

export function resetVolcano() {
  state = { logs: [] };
  persist(); emit();
}

const DAY = 86400000;
const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export function volcanoLoggedToday() {
  const today = dayKey(Date.now());
  return state.logs.some((l) => dayKey(l.ts) === today);
}

export function volcanoStreak() {
  if (!state.logs.length) return 0;
  const days = new Set(state.logs.map((l) => dayKey(l.ts)));
  let streak = 0;
  const cursor = new Date();
  for (;;) {
    if (days.has(dayKey(cursor.getTime()))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else break;
  }
  return streak;
}

// Returns { pressure: 0–1, release: 0–1 } as a weighted average of the last 7 days.
// Recent days count more (weight 1.0 today → 0.1 seven days ago).
export function volcanoState() {
  const now = Date.now();
  const WEEK = 7 * DAY;
  const recent = state.logs.filter((l) => now - l.ts < WEEK);
  if (!recent.length) return { pressure: 0, release: 0 };

  let totalW = 0, wStress = 0, wExercise = 0;
  for (const l of recent) {
    const age = (now - l.ts) / WEEK;
    const w = Math.max(0.1, 1 - age * 0.9);
    totalW += w;
    wStress += l.stress * w;
    wExercise += l.exercise * w;
  }

  return {
    pressure: Math.min(1, wStress / totalW / 5),
    release:  Math.min(1, wExercise / totalW / 5),
  };
}
