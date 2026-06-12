// Reactive localStorage store for the Tundra biome. You freeze thoughts
// you're not ready to face — each becomes a block of ice that waits for you.
// When you're ready, you can thaw it. Nothing burns. Nothing forces resolution.

const KEY = 'terrarium.tundra.v1';
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { freezes: [] };
    const data = JSON.parse(raw);
    if (!Array.isArray(data.freezes)) data.freezes = [];
    return data;
  } catch {
    return { freezes: [] };
  }
}

let state = load();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full / private mode — keep in memory */
  }
}

function emit() {
  for (const fn of listeners) fn();
}

export function subscribeTundra(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getFreezes() {
  return state.freezes;
}

export function addFreeze(text) {
  const f = {
    id: Date.now(),
    ts: Date.now(),
    text: text.trim(),
  };
  state = { ...state, freezes: [...state.freezes, f] };
  persist();
  emit();
  return f;
}

export function thawFreeze(id) {
  state = { ...state, freezes: state.freezes.filter((f) => f.id !== id) };
  persist();
  emit();
}

export function resetTundra() {
  state = { freezes: [] };
  persist();
  emit();
}

// ---- derived helpers -------------------------------------------------------

const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export function frozenToday() {
  const today = dayKey(Date.now());
  return state.freezes.some((f) => dayKey(f.ts) === today);
}

export function freezeStreak() {
  if (!state.freezes.length) return 0;
  const days = new Set(state.freezes.map((f) => dayKey(f.ts)));
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
