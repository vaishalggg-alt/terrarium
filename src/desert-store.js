// Reactive localStorage store for the Desert biome — a hydration tracker
// themed as an oasis. Every glass of water you log raises the pool and brings
// more life to the sand around it. The pool level reflects *today's* intake
// (it dries back overnight, like real thirst), while the full log feeds the
// streak.

const KEY = 'terrarium.desert.v1';
export const GOAL = 8;                 // glasses/day to fill the oasis
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

export function subscribeDesert(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getLogs() {
  return state.logs;
}

export function addWater(cups = 1) {
  const l = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now(), cups };
  state = { ...state, logs: [...state.logs, l] };
  persist();
  emit();
  return l;
}

export function resetDesert() {
  state = { logs: [] };
  persist();
  emit();
}

// ---- derived helpers -------------------------------------------------------

const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export function cupsToday() {
  const today = dayKey(Date.now());
  return state.logs.reduce((s, l) => (dayKey(l.ts) === today ? s + l.cups : s), 0);
}

// 0..1 oasis fill from today's intake
export function oasisFill() {
  return Math.min(1, cupsToday() / GOAL);
}

export function goalMet() {
  return cupsToday() >= GOAL;
}

export function wateredToday() {
  return cupsToday() > 0;
}

// streak of consecutive days where the goal was met, counting back from today
export function hydrationStreak() {
  const byDay = {};
  for (const l of state.logs) byDay[dayKey(l.ts)] = (byDay[dayKey(l.ts)] || 0) + l.cups;
  let streak = 0;
  const cursor = new Date();
  for (;;) {
    const k = dayKey(cursor.getTime());
    if ((byDay[k] || 0) >= GOAL) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else break;
  }
  return streak;
}
