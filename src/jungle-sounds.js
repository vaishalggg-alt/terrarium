// Procedural ambient soundscapes for the Jungle biome.

export const SOUND_OPTIONS = [
  { id: 'rain',    label: '🌧️ Rain' },
  { id: 'insects', label: '🦗 Insects' },
  { id: 'stream',  label: '💧 Stream' },
  { id: 'off',     label: '🔇 Off' },
];

const CRICKETS_URL = new URL('./assets/crickets.mp3', import.meta.url).href;

export function createSoundEngine() {
  let actx = null;
  let active = [];
  let current = 'off';
  let cricketsBuffer = null; // cached decoded audio buffer

  function ctx() {
    if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }

  function stopAll() {
    active.forEach(n => { try { if (n.stop) n.stop(); else n.disconnect(); } catch {} });
    active = [];
  }

  function noise(c) {
    const buf = c.createBuffer(1, c.sampleRate * 3, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
    return src;
  }

  function rain() {
    const c = ctx();
    const src = noise(c);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.6;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';  lp.frequency.value = 3500;
    const gain = c.createGain(); gain.gain.value = 0.09;
    src.connect(bp); bp.connect(lp); lp.connect(gain); gain.connect(c.destination);
    src.start();
    active.push(src, bp, lp, gain);
  }

  async function insects() {
    const c = ctx();
    if (!cricketsBuffer) {
      try {
        const res = await fetch(CRICKETS_URL);
        const ab = await res.arrayBuffer();
        cricketsBuffer = await c.decodeAudioData(ab);
      } catch {
        return; // file unavailable, stay silent
      }
    }
    // Guard: user may have switched away while we were fetching
    if (current !== 'insects') return;
    const src = c.createBufferSource();
    src.buffer = cricketsBuffer;
    src.loop = true;
    const gain = c.createGain(); gain.gain.value = 0.55;
    src.connect(gain); gain.connect(c.destination);
    src.start();
    active.push(src, gain);
  }

  function stream() {
    const c = ctx();
    const src = noise(c);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 60;
    // LFO to mimic gurgling water
    const lfo = c.createOscillator(); lfo.frequency.value = 1.4; lfo.type = 'sine';
    const lfoG = c.createGain(); lfoG.gain.value = 120;
    lfo.connect(lfoG); lfoG.connect(lp.frequency);
    const gain = c.createGain(); gain.gain.value = 0.24;
    src.connect(lp); lp.connect(hp); hp.connect(gain); gain.connect(c.destination);
    src.start(); lfo.start();
    active.push(src, lp, hp, lfo, lfoG, gain);
  }

  return {
    get current() { return current; },
    play(id) {
      stopAll(); current = id;
      if (id === 'rain')         rain();
      else if (id === 'insects') insects(); // async, self-guards on current
      else if (id === 'stream')  stream();
    },
    stop() { stopAll(); current = 'off'; },
  };
}
