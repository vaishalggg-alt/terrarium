// Procedural ambient soundscapes for the Jungle biome.

export const SOUND_OPTIONS = [
  { id: 'rain',    label: '🌧️ Rain' },
  { id: 'insects', label: '🦗 Insects' },
  { id: 'stream',  label: '💧 Stream' },
  { id: 'off',     label: '🔇 Off' },
];

const CRICKETS_URL = new URL('./assets/crickets.mp3', import.meta.url).href;
const STREAM_URL   = new URL('./assets/stream.mp3',   import.meta.url).href;

export function createSoundEngine() {
  let actx = null;
  let active = [];
  let current = 'off';
  let cricketsBuffer = null;
  let streamBuffer   = null;

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

  async function stream() {
    const c = ctx();
    if (!streamBuffer) {
      try {
        const res = await fetch(STREAM_URL);
        const ab = await res.arrayBuffer();
        streamBuffer = await c.decodeAudioData(ab);
      } catch {
        return;
      }
    }
    if (current !== 'stream') return;
    const src = c.createBufferSource();
    src.buffer = streamBuffer;
    src.loop = true;
    const gain = c.createGain(); gain.gain.value = 0.6;
    src.connect(gain); gain.connect(c.destination);
    src.start();
    active.push(src, gain);
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
