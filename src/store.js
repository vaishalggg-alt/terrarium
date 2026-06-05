// Tiny reactive store backed by localStorage. The forest never resets —
// every check-in is kept forever and the tree is rebuilt from the full log.

const KEY = 'terrarium.forest.v1';
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { checkins: [] };
    const data = JSON.parse(raw);
    if (!Array.isArray(data.checkins)) data.checkins = [];
    return data;
  } catch {
    return { checkins: [] };
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

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getCheckins() {
  return state.checkins;
}

export function addCheckin(emotion, intensity = 2, note = '') {
  const c = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ts: Date.now(),
    emotion,
    intensity, // 1..3
    note: note.trim(),
  };
  state = { ...state, checkins: [...state.checkins, c] };
  persist();
  emit();
  return c;
}

export function resetWorld() {
  state = { checkins: [] };
  persist();
  emit();
}

// ---- derived helpers -------------------------------------------------------

// Dominant emotion across the most recent `n` check-ins — drives the weather.
export function dominantEmotion(n = 6) {
  const recent = state.checkins.slice(-n);
  if (!recent.length) return null;
  const tally = {};
  for (const c of recent) tally[c.emotion] = (tally[c.emotion] || 0) + 1;
  return Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
}

const DAY = 86400000;

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// Hidden creature trigger: 'vulnerable' logged at night on 3 distinct
// consecutive days. Returns true while the streak holds.
export function mothAwakened() {
  const nights = new Set();
  for (const c of state.checkins) {
    if (c.emotion !== 'vulnerable') continue;
    const h = new Date(c.ts).getHours();
    if (h >= 20 || h < 5) nights.add(dayKey(c.ts));
  }
  if (nights.size < 3) return false;
  // check 3 consecutive calendar days exist somewhere in the set
  const days = [...nights]
    .map((k) => {
      const [y, m, d] = k.split('-').map(Number);
      return new Date(y, m, d).getTime();
    })
    .sort((a, b) => a - b);
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (Math.round((days[i] - days[i - 1]) / DAY) === 1) {
      if (++run >= 3) return true;
    } else run = 1;
  }
  return false;
}

// Simple streak: distinct days with any check-in, counting back from today.
export function checkinStreak() {
  if (!state.checkins.length) return 0;
  const days = new Set(state.checkins.map((c) => dayKey(c.ts)));
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

export function checkedInToday() {
  const today = dayKey(Date.now());
  return state.checkins.some((c) => dayKey(c.ts) === today);
}
