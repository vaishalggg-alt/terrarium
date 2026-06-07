// Procedural ambient soundscapes for the Jungle biome.
// All audio is synthesised via Web Audio API — no external files needed.

export const SOUND_OPTIONS = [
  { id: 'rain',    label: '🌧️ Rain' },
  { id: 'insects', label: '🦗 Insects' },
  { id: 'stream',  label: '💧 Stream' },
  { id: 'off',     label: '🔇 Off' },
];

export function createSoundEngine() {
  let actx = null;
  let active = [];
  let current = 'off';

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
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.35;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass';  lp.frequency.value = 5000;
    const gain = c.createGain(); gain.gain.value = 0.20;
    src.connect(bp); bp.connect(lp); lp.connect(gain); gain.connect(c.destination);
    src.start();
    active.push(src, bp, lp, gain);
  }

  function insects() {
    const c = ctx();
    // Cricket chorus — layered sine oscillators with amplitude modulation
    [[3800, 7.1], [4250, 6.4], [5100, 8.2], [3500, 5.8], [4600, 7.7]].forEach(([freq, lfoHz], i) => {
      const osc = c.createOscillator(); osc.type = 'sine'; osc.frequency.value = freq;
      const lfo = c.createOscillator(); lfo.frequency.value = lfoHz; lfo.type = 'sine';
      const lfoG = c.createGain(); lfoG.gain.value = 0.5;
      const ampG = c.createGain(); ampG.gain.value = 0.025 + i * 0.003;
      lfo.connect(lfoG); lfoG.connect(osc.frequency);
      osc.connect(ampG); ampG.connect(c.destination);
      osc.start(); lfo.start();
      active.push(osc, lfo, lfoG, ampG);
    });
    // Low jungle-floor hum
    const hum = c.createOscillator(); hum.type = 'sine'; hum.frequency.value = 185;
    const humG = c.createGain(); humG.gain.value = 0.032;
    hum.connect(humG); humG.connect(c.destination); hum.start();
    active.push(hum, humG);
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
      if (id === 'rain')    rain();
      else if (id === 'insects') insects();
      else if (id === 'stream')  stream();
    },
    stop() { stopAll(); current = 'off'; },
  };
}
