// Reactive localStorage store for the Ocean biome. You write unsent letters
// and bottle them into the sea — every letter is kept forever and becomes a
// drifting bottle. The sea grows more alive the more you let go into it.

const KEY = 'terrarium.ocean.v1';
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { letters: [] };
    const data = JSON.parse(raw);
    if (!Array.isArray(data.letters)) data.letters = [];
    return data;
  } catch {
    return { letters: [] };
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

export function subscribeOcean(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getLetters() {
  return state.letters;
}

// Add a sealed letter. `to` is an optional recipient ("mom", "my younger
// self"…); the body is never required to be read again.
export function addLetter(text, to = '') {
  const l = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts: Date.now(),
    text: text.trim(),
    to: to.trim(),
  };
  state = { ...state, letters: [...state.letters, l] };
  persist();
  emit();
  return l;
}

export function removeLetter(id) {
  state = { ...state, letters: state.letters.filter((l) => l.id !== id) };
  persist();
  emit();
}

export function resetOcean() {
  state = { letters: [] };
  persist();
  emit();
}

// ---- derived helpers -------------------------------------------------------

const DAY = 86400000;
const dayKey = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

export function letterStreak() {
  if (!state.letters.length) return 0;
  const days = new Set(state.letters.map((l) => dayKey(l.ts)));
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

export function bottledToday() {
  const today = dayKey(Date.now());
  return state.letters.some((l) => dayKey(l.ts) === today);
}

// Hidden creature: a luminous whale surfaces once 5+ letters have been
// released — a reward for letting enough go.
export function whaleAwakened() {
  return state.letters.length >= 5;
}
