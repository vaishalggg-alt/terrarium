// Emotion catalogue. Each emotion shapes the tree differently and drives
// the ambient weather/creatures of the world.
//
// branch params:
//   spread  – how wide the branch forks open (deg)
//   droop   – downward bias added to the branch angle (deg, + = sag down)
//   curl    – per-segment curvature, gives jagged vs flowing limbs
//   bloom   – tip decoration: 'sunflower' | 'blossom' | 'leaf' | 'thorn' | 'berry' | 'bare'
//   thick   – relative branch thickness
//
// weather: the ambient particle system this emotion grows in the world.

export const EMOTIONS = {
  joy: {
    label: 'Joy',
    emoji: '🌞',
    color: '#ffd23f',
    leaf: '#ffe98a',
    branch: { spread: 42, droop: -12, curl: 0.05, bloom: 'sunflower', thick: 1.05 },
    weather: 'butterflies',
    blurb: 'sunflowers turn toward the light',
  },
  calm: {
    label: 'Calm',
    emoji: '🌿',
    color: '#7fc8a9',
    leaf: '#a8e0c4',
    branch: { spread: 30, droop: 4, curl: 0.08, bloom: 'leaf', thick: 1.0 },
    weather: 'petals',
    blurb: 'soft leaves, slow drifting petals',
  },
  grateful: {
    label: 'Grateful',
    emoji: '🌸',
    color: '#f5a3c7',
    leaf: '#ffc8de',
    branch: { spread: 36, droop: -4, curl: 0.07, bloom: 'blossom', thick: 1.0 },
    weather: 'petals',
    blurb: 'the tree blossoms pink',
  },
  sad: {
    label: 'Sad',
    emoji: '🌧️',
    color: '#6f86c9',
    leaf: '#9fb2e0',
    branch: { spread: 22, droop: 34, curl: 0.06, bloom: 'leaf', thick: 0.95 },
    weather: 'rain',
    blurb: 'willow limbs droop in beautiful rain',
  },
  anxious: {
    label: 'Anxious',
    emoji: '🌵',
    color: '#c98bb9',
    leaf: '#e0a6d4',
    branch: { spread: 54, droop: -2, curl: 0.22, bloom: 'thorn', thick: 0.85 },
    weather: 'spores',
    blurb: 'thorny, restless, strangely beautiful',
  },
  angry: {
    label: 'Angry',
    emoji: '🔥',
    color: '#e8714d',
    leaf: '#f59b6a',
    branch: { spread: 48, droop: -18, curl: 0.18, bloom: 'berry', thick: 1.1 },
    weather: 'embers',
    blurb: 'sharp limbs throw up embers',
  },
  tired: {
    label: 'Tired',
    emoji: '🌫️',
    color: '#9aa7b5',
    leaf: '#c3cdd8',
    branch: { spread: 26, droop: 18, curl: 0.05, bloom: 'leaf', thick: 0.9 },
    weather: 'fog',
    blurb: 'quiet grey mist settles low',
  },
  vulnerable: {
    label: 'Vulnerable',
    emoji: '🌙',
    color: '#b89cd9',
    leaf: '#d4c2ef',
    branch: { spread: 34, droop: 8, curl: 0.09, bloom: 'blossom', thick: 0.9 },
    weather: 'glow',
    blurb: 'tender new growth, faintly glowing',
  },
};

export const EMOTION_KEYS = Object.keys(EMOTIONS);
