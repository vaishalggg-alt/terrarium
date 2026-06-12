// Which biome the world is currently showing. Persisted so you return to the
// same place. New biomes register here as they are built.

const KEY = 'terrarium.biome.v1';
const listeners = new Set();

export const BIOMES = [
  { id: 'forest', label: 'Forest', emoji: '🌲' },
  { id: 'ocean', label: 'Ocean', emoji: '🌊' },
  { id: 'desert', label: 'Desert', emoji: '🏜️' },
  { id: 'jungle',  label: 'Jungle',  emoji: '🌴' },
  { id: 'volcano', label: 'Volcano', emoji: '🌋' },
  { id: 'tundra',  label: 'Tundra',  emoji: '🌨️' },
  { id: 'blossom', label: 'Garden',  emoji: '🌸' },
];

function load() {
  try {
    const v = localStorage.getItem(KEY);
    return BIOMES.some((b) => b.id === v) ? v : 'forest';
  } catch {
    return 'forest';
  }
}

let active = load();

export function subscribeBiome(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getBiome() {
  return active;
}

export function setBiome(id) {
  if (!BIOMES.some((b) => b.id === id) || id === active) return;
  active = id;
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
  for (const fn of listeners) fn();
}
