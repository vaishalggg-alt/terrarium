// Sleep tracker store for the Jungle biome.
// Each entry: { ts: number, hours: number, quality: 1|2|3 }

const KEY = 'terrarium-jungle-v1';
const listeners = new Set();

let _logs = [];
try { _logs = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch {}

function save() { try { localStorage.setItem(KEY, JSON.stringify(_logs)); } catch {} }
function emit() { listeners.forEach(fn => fn()); }

export const subscribeJungle = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const getSleepLogs = () => _logs;

export function addSleep(hours, quality) {
  _logs = [..._logs, { ts: Date.now(), hours, quality }];
  save(); emit();
}

export function resetJungle() { _logs = []; save(); emit(); }

function dayStart(daysAgo = 0) {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.getTime();
}

function dayEnd(daysAgo = 0) { return dayStart(daysAgo - 1); }

export function sleptToday() { return _logs.some(l => l.ts >= dayStart()); }

export function sleepHoursToday() {
  return _logs.filter(l => l.ts >= dayStart()).reduce((s, l) => s + l.hours, 0);
}

export function sleepStreak() {
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    if (_logs.some(l => l.ts >= dayStart(i) && l.ts < dayEnd(i))) streak++;
    else break;
  }
  return streak;
}

// bioluminescence level 0–1 based on recent sleep data (last 14 entries)
export function bioLevel() {
  const recent = _logs.slice(-14);
  if (!recent.length) return 0;
  const avgQ = recent.reduce((s, l) => s + l.quality, 0) / recent.length; // 1–3
  const avgH = recent.reduce((s, l) => s + l.hours, 0) / recent.length;   // target 8
  const qScore = (avgQ - 1) / 2;       // 0–1
  const hScore = Math.min(avgH / 8, 1); // 0–1
  return qScore * 0.55 + hScore * 0.45;
}

// Named thresholds used in app discovery banners
export const BIO_THRESHOLDS = {
  firefly:   0.25,
  frog:      0.50,
  butterfly: 0.75,
  jaguar:    0.92,
};
