// Shared world clock. By default the world follows the real time of day, but
// you can force Day or Night. All biome engines read clockDate() every frame,
// so flipping this re-lights every world instantly.

const listeners = new Set();
const MODES = ['auto', 'day', 'night'];   // cycle order
let mode = 'auto';

export function subscribeClock(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getClockMode() {
  return mode;
}

export function cycleClock() {
  mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
  for (const fn of listeners) fn();
}

// the Date every engine should render against
export function clockDate() {
  if (mode === 'auto') return new Date();
  const d = new Date();
  d.setHours(mode === 'day' ? 13 : 1, 0, 0, 0);   // high noon / deep night
  return d;
}

export const CLOCK_LABEL = { auto: '🌗', day: '☀️', night: '🌙' };
export const CLOCK_NAME = { auto: 'Auto', day: 'Day', night: 'Night' };
