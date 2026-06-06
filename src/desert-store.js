// Reactive localStorage store for the Desert biome.
// Hydration is tracked in litres. The oasis fills as you drink more,
// and different animals appear at each litre milestone.

const KEY = 'terrarium.desert.v1';
export const GOAL = 6;  // litres/day to fill the oasis completely
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

// amount is in litres (e.g. 0.25, 0.5, 1.0)
export function addWater(amount = 0.25) {
  const l = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ts: Date.now(), litres: +amount };
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

export function litresToday() {
  const today = dayKey(Date.now());
  return state.logs.reduce((s, l) => {
    if (dayKey(l.ts) !== today) return s;
    // backward-compat: old entries stored `cups` (treat 1 cup = 0.25L)
    return s + (l.litres != null ? l.litres : (l.cups || 1) * 0.25);
  }, 0);
}

// keep alias so app.js import still works
export const cupsToday = litresToday;

// 0..1 oasis fill from today's intake
export function oasisFill() {
  return Math.min(1, litresToday() / GOAL);
}

export function goalMet() {
  return litresToday() >= GOAL;
}

export function wateredToday() {
  return litresToday() > 0;
}

// Which animals have been unlocked by today's intake
export function animalsPresent() {
  const l = litresToday();
  return {
    fox:    l >= 2,
    snake:  l >= 3,
    coyote: l >= 4,
    owl:    l >= 5,
    camel:  l >= 6,
  };
}

// streak of consecutive days where the goal was met, counting back from today
export function hydrationStreak() {
  const byDay = {};
  for (const log of state.logs) {
    const k = dayKey(log.ts);
    const amt = log.litres != null ? log.litres : (log.cups || 1) * 0.25;
    byDay[k] = (byDay[k] || 0) + amt;
  }
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
