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
// Hours drive 80% of score — 9h gives hScore=1.0 regardless of quality.
// Rough mapping: 3h→0.27, 5h→0.44, 6h→0.53, 7h→0.62, 8h→0.71, 9h→0.80+
export function bioLevel() {
  const recent = _logs.slice(-14);
  if (!recent.length) return 0;
  const avgQ = recent.reduce((s, l) => s + l.quality, 0) / recent.length;
  const avgH = recent.reduce((s, l) => s + l.hours, 0) / recent.length;
  const qScore = (avgQ - 1) / 2;        // 0–1
  const hScore = Math.min(avgH / 9, 1); // 0–1, full at 9h
  return qScore * 0.20 + hScore * 0.80;
}

// Thresholds calibrated so 9h sleep reliably unlocks each creature:
//   ~3h → mushrooms, ~4h → fireflies, ~5h → orchids,
//   ~6h → frog, ~7h → butterfly, ~9h → jaguar,
//   9h + good quality → snake, 9h + great quality → spirit deer
export const BIO_THRESHOLDS = {
  mushroom:   0.25,
  firefly:    0.35,
  orchid:     0.44,
  frog:       0.53,
  butterfly:  0.62,
  jaguar:     0.78,
  snake:      0.86,
  spiritDeer: 0.93,
};
