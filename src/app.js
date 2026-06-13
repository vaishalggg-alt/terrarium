import { createElement as h, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import htm from 'htm';
import { EMOTIONS, EMOTION_KEYS } from './emotions.js';
import {
  subscribe, getCheckins, addCheckin, resetWorld,
  dominantEmotion, mothAwakened, checkinStreak, checkedInToday,
  addSteps, getSteps, totalSteps, stepsToday,
} from './store.js';
import {
  subscribeOcean, getLetters, addLetter, removeLetter, resetOcean,
  letterStreak, bottledToday, whaleAwakened,
} from './ocean-store.js';
import {
  subscribeDesert, getLogs, addWater, resetDesert,
  oasisFill, litresToday, goalMet, wateredToday, hydrationStreak, animalsPresent, GOAL,
} from './desert-store.js';
import {
  subscribeJungle, getSleepLogs, addSleep, resetJungle,
  sleptToday, sleepHoursToday, sleepStreak, bioLevel, BIO_THRESHOLDS,
} from './jungle-store.js';
import { SOUND_OPTIONS, createSoundEngine } from './jungle-sounds.js';
import { BIOMES, subscribeBiome, getBiome, setBiome } from './biome-store.js';
import { subscribeClock, getClockMode, cycleClock, CLOCK_LABEL, CLOCK_NAME } from './clock.js';
import { createWorld } from './world.js';
import { createOcean } from './ocean.js';
import { createDesert } from './desert.js';
import { createJungle } from './jungle.js';
import { createVolcano } from './volcano.js';
import {
  subscribeVolcano, getVolcanoLogs, addVolcanoLog, resetVolcano,
  volcanoState, volcanoLoggedToday, volcanoStreak,
} from './volcano-store.js';
import { createBlossom } from './blossom.js';
import {
  subscribeBlossom, getSessions, addSession, resetBlossom,
  meditatedToday, meditationStreak, totalMinutes,
} from './blossom-store.js';

const html = htm.bind(h);

const useCheckins = () => useSyncExternalStore(subscribe, getCheckins);
const useSteps = () => useSyncExternalStore(subscribe, getSteps);
const useLetters = () => useSyncExternalStore(subscribeOcean, getLetters);
const useWater = () => useSyncExternalStore(subscribeDesert, getLogs);
const useSleep = () => useSyncExternalStore(subscribeJungle, getSleepLogs);
const useVolcanoLogs = () => useSyncExternalStore(subscribeVolcano, getVolcanoLogs);
const useSessions = () => useSyncExternalStore(subscribeBlossom, getSessions);
const useBiome = () => useSyncExternalStore(subscribeBiome, getBiome);
const useClock = () => useSyncExternalStore(subscribeClock, getClockMode);

const TIME_LABEL = () => {
  const h = new Date().getHours();
  if (h < 5) return 'Deep night';
  if (h < 8) return 'Dawn';
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  if (h < 20) return 'Dusk';
  return 'Night';
};

// ---- canvas hosts ----------------------------------------------------------

function ForestWorld() {
  const ref = useRef(null);
  const world = useRef(null);
  const checkins = useCheckins();
  const steps = useSteps();

  useEffect(() => {
    world.current = createWorld(ref.current);
    return () => world.current?.destroy();
  }, []);

  useEffect(() => {
    world.current?.setData({
      checkins,
      weather: dominantEmotion() ? EMOTIONS[dominantEmotion()].weather : 'petals',
      moth: mothAwakened(),
      steps: totalSteps(),
    });
  }, [checkins, steps]);

  return html`<canvas ref=${ref} class="world"></canvas>`;
}

function OceanWorld() {
  const ref = useRef(null);
  const world = useRef(null);
  const letters = useLetters();
  const [viewing, setViewing] = useState(null); // { letter }

  useEffect(() => {
    world.current = createOcean(ref.current, {
      onBottleClick: (_idx, letter) => letter && setViewing({ letter }),
    });
    return () => world.current?.destroy();
  }, []);

  useEffect(() => {
    world.current?.setData({ letters, whale: whaleAwakened() });
  }, [letters]);

  const takeBack = () => {
    removeLetter(viewing.letter.id);
    setViewing(null);
  };

  const fmt = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  return html`
    <canvas ref=${ref} class="world"></canvas>
    ${viewing && html`
      <div class="overlay bottle-overlay" onClick=${() => setViewing(null)}>
        <div class="sheet" onClick=${(e) => e.stopPropagation()}>
          <div class="bottle-meta">
            ${viewing.letter.to && html`<span class="bottle-to">To: ${viewing.letter.to}</span>`}
            <span class="bottle-date">${fmt(viewing.letter.ts)}</span>
          </div>
          <p class="bottle-body">${viewing.letter.text}</p>
          <div class="bottle-actions">
            <button class="grow ocean" onClick=${() => setViewing(null)}>Leave it in the sea</button>
            <button class="grow bottle-take" onClick=${takeBack}>Take it back</button>
          </div>
        </div>
      </div>
    `}
  `;
}

function DesertWorld() {
  const ref = useRef(null);
  const world = useRef(null);
  const logs = useWater();

  useEffect(() => {
    world.current = createDesert(ref.current);
    return () => world.current?.destroy();
  }, []);

  useEffect(() => {
    world.current?.setData({ fill: oasisFill(), litres: litresToday(), animals: animalsPresent() });
  }, [logs]);

  return html`<canvas ref=${ref} class="world"></canvas>`;
}

// Singleton sound engine — lives outside React so it survives re-renders.
const soundEngine = createSoundEngine();

function JungleWorld() {
  const ref = useRef(null);
  const world = useRef(null);
  const logs = useSleep();

  useEffect(() => {
    world.current = createJungle(ref.current);
    return () => { world.current?.destroy(); soundEngine.stop(); };
  }, []);

  useEffect(() => {
    world.current?.setData({ bio: bioLevel(), hours: sleepHoursToday() });
  }, [logs]);

  return html`<canvas ref=${ref} class="world"></canvas>`;
}

// ---- check-in panels -------------------------------------------------------

function ForestCheckIn({ onDone, initialTab = 'mood' }) {
  const [tab, setTab] = useState(initialTab);
  const [emo, setEmo] = useState(null);
  const [intensity, setIntensity] = useState(2);
  const [note, setNote] = useState('');
  const [stepInput, setStepInput] = useState('');

  function submitMood() {
    if (!emo) return;
    addCheckin(emo, intensity, note);
    onDone();
  }

  function submitSteps() {
    const n = parseInt(stepInput, 10);
    if (!n || n <= 0) return;
    addSteps(n);
    onDone();
  }

  const todaySteps = stepsToday();
  const allSteps = totalSteps();

  return html`
    <div class="sheet">
      <div class="forest-tabs">
        <button class=${'ftab' + (tab === 'mood' ? ' on' : '')} onClick=${() => setTab('mood')}>🌿 Mood</button>
        <button class=${'ftab' + (tab === 'steps' ? ' on' : '')} onClick=${() => setTab('steps')}>🚶 Steps</button>
      </div>

      ${tab === 'mood' && html`
        <h2>How are you, really?</h2>
        <p class="sub">Pick what's closest. Your tree grows a new branch.</p>
        <div class="emos">
          ${EMOTION_KEYS.map((k) => {
            const e = EMOTIONS[k];
            return html`
              <button
                key=${k}
                class=${'emo' + (emo === k ? ' on' : '')}
                style=${{ '--c': e.color }}
                onClick=${() => setEmo(k)}>
                <span class="ico">${e.emoji}</span>
                <span class="lbl">${e.label}</span>
              </button>`;
          })}
        </div>
        ${emo && html`
          <div class="detail">
            <p class="blurb">${EMOTIONS[emo].blurb}</p>
            <div class="intensity">
              <span>a little</span>
              <input type="range" min="1" max="3" step="1"
                value=${intensity}
                onInput=${(ev) => setIntensity(+ev.target.value)} />
              <span>a lot</span>
            </div>
            <input class="note" placeholder="one line, if you want…"
              value=${note} maxLength=${80}
              onInput=${(ev) => setNote(ev.target.value)} />
            <button class="grow" onClick=${submitMood}>Grow my world →</button>
          </div>`}
      `}

      ${tab === 'steps' && html`
        <h2>How far did you walk?</h2>
        <p class="sub">Every step plants life in your forest — trees, ferns, and butterflies appear as you explore.</p>
        <div class="step-stats">
          <span><b>${todaySteps.toLocaleString()}</b> steps today</span>
          <span><b>${allSteps.toLocaleString()}</b> total</span>
        </div>
        <input class="note" type="number" placeholder="steps walked…" min="1" max="99999"
          value=${stepInput}
          onInput=${(ev) => setStepInput(ev.target.value)} />
        <button class=${'grow' + (stepInput && parseInt(stepInput) > 0 ? '' : ' off')} onClick=${submitSteps}>
          Plant the walk →
        </button>
      `}
    </div>`;
}

function OceanCheckIn({ onDone }) {
  const [to, setTo] = useState('');
  const [text, setText] = useState('');

  function submit() {
    if (!text.trim()) return;
    addLetter(text, to);
    onDone();
  }

  return html`
    <div class="sheet">
      <h2>Write an unsent letter</h2>
      <p class="sub">Say the thing you can't send. It seals into a bottle and drifts out to sea — never to be read again.</p>
      <input class="note" placeholder="to… (optional)"
        value=${to} maxLength=${40}
        onInput=${(ev) => setTo(ev.target.value)} />
      <textarea class="letter" placeholder="whatever you need to let go of…"
        value=${text} rows=${6}
        onInput=${(ev) => setText(ev.target.value)}></textarea>
      <button class=${'grow ocean' + (text.trim() ? '' : ' off')} onClick=${submit}>
        Seal & cast into the sea →
      </button>
    </div>`;
}

function DesertCheckIn({ onDone }) {
  const litres = litresToday();
  const pct = Math.min(100, Math.round((litres / GOAL) * 100));

  function add(n) {
    addWater(n);
    onDone();
  }

  return html`
    <div class="sheet">
      <h2>Water your oasis</h2>
      <p class="sub">${litres.toFixed(2)}L of ${GOAL}L today — animals appear as the pool rises.</p>
      <div class="water-meter"><div class="water-fill" style=${{ width: pct + '%' }}></div></div>
      <div class="water-btns">
        <button class="wbtn" onClick=${() => add(0.25)}>💧 +250ml</button>
        <button class="wbtn" onClick=${() => add(0.5)}>💧 +500ml</button>
        <button class="wbtn" onClick=${() => add(1)}>💧💧 +1L</button>
      </div>
    </div>`;
}

function JungleCheckIn({ onDone }) {
  const [hours, setHours] = useState(7);
  const [quality, setQuality] = useState(null);

  function submit() {
    if (!quality) return;
    addSleep(hours, quality);
    onDone();
  }

  const qualities = [
    { v: 1, emoji: '😴', label: 'Poor' },
    { v: 2, emoji: '😑', label: 'Okay' },
    { v: 3, emoji: '😊', label: 'Great' },
  ];

  return html`
    <div class="sheet">
      <h2>How did you sleep?</h2>
      <p class="sub">Your jungle glows brighter with rest. Rare creatures emerge with consistent good sleep.</p>
      <div class="sleep-hours">
        <span class="sleep-hours-val">${hours}h</span>
        <input type="range" min="0" max="12" step="0.5"
          value=${hours} onInput=${e => setHours(+e.target.value)} />
        <span class="sleep-hours-label">hours slept</span>
      </div>
      <div class="sleep-quality">
        ${qualities.map(q => html`
          <button key=${q.v}
            class=${'sqbtn' + (quality === q.v ? ' on' : '')}
            onClick=${() => setQuality(q.v)}>
            <span class="sqico">${q.emoji}</span>
            <span class="sqlbl">${q.label}</span>
          </button>`)}
      </div>
      <button class=${'grow jungle' + (quality ? '' : ' off')} onClick=${submit}>
        Enter the jungle →
      </button>
    </div>`;
}

function VolcanoWorld() {
  const ref = useRef(null);
  const world = useRef(null);
  const logs = useVolcanoLogs();

  useEffect(() => {
    world.current = createVolcano(ref.current);
    return () => world.current?.destroy();
  }, []);

  useEffect(() => {
    const { pressure, release } = volcanoState();
    world.current?.setData({ pressure, release });
  }, [logs]);

  return html`<canvas ref=${ref} class="world"></canvas>`;
}

function VolcanoCheckIn({ onDone }) {
  const [stress, setStress] = useState(null);
  const [exercise, setExercise] = useState(null);
  const [note, setNote] = useState('');

  const stressLabels = ['Very calm', 'Calm', 'Moderate', 'Stressed', 'Very stressed'];
  const exLabels     = ['None', 'Light', 'Moderate', 'Active', 'Very active'];

  const submit = () => {
    if (!stress || !exercise) return;
    addVolcanoLog(stress, exercise, note);
    onDone();
  };

  return html`<div class="sheet">
    <h2>Pressure & Release</h2>
    <p class="sub">Log your stress and movement. The volcano finds its own balance.</p>

    <label class="volt-label">Stress level today</label>
    <div class="volt-scale">
      ${[1,2,3,4,5].map((v) => html`
        <button key=${v}
          class=${'volt-btn' + (stress === v ? ' on' : '')}
          style=${{ '--c': '#d94030' }}
          onClick=${() => setStress(v)}>
          <span class="volt-num">${v}</span>
          <span class="volt-lbl">${stressLabels[v-1]}</span>
        </button>`)}
    </div>

    <label class="volt-label">Exercise today</label>
    <div class="volt-scale">
      ${[1,2,3,4,5].map((v) => html`
        <button key=${v}
          class=${'volt-btn' + (exercise === v ? ' on' : '')}
          style=${{ '--c': '#3a9060' }}
          onClick=${() => setExercise(v)}>
          <span class="volt-num">${v}</span>
          <span class="volt-lbl">${exLabels[v-1]}</span>
        </button>`)}
    </div>

    <textarea class="note" placeholder="anything to add? (optional)"
      value=${note} onInput=${(e) => setNote(e.target.value)} rows="2"></textarea>

    <button class=${'grow volcano' + (!stress || !exercise ? ' off' : '')} onClick=${submit}>
      Feed the volcano →
    </button>
  </div>`;
}

// Tiny event bus so BlossomCheckIn can signal BlossomWorld to start a session
const blossomBus = { fns: new Set(), emit() { for (const f of this.fns) f(); } };

function BlossomWorld() {
  const ref = useRef(null);
  const world = useRef(null);
  const sessions = useSessions();
  const [active, setActive] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [lastResult, setLastResult] = useState(null); // seconds of last completed session
  const startRef = useRef(null);
  const intervalRef = useRef(null);

  function startSession() {
    world.current?.unfreezePeace();
    startRef.current = Date.now();
    setElapsed(0);
    setLastResult(null);
    setActive(true);
    intervalRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
  }

  function stopSession() {
    if (!startRef.current) return;
    clearInterval(intervalRef.current);
    const secs = Math.floor((Date.now() - startRef.current) / 1000);
    startRef.current = null;
    setActive(false);
    world.current?.freezePeace();
    if (secs >= 10) {
      addSession(secs);
      setLastResult(secs);
      setTimeout(() => setLastResult(null), 5000);
    }
  }

  // Listen for "start" signal from check-in sheet
  useEffect(() => {
    const unsub = (() => {
      const fn = () => startSession();
      blossomBus.fns.add(fn);
      return () => blossomBus.fns.delete(fn);
    })();
    return unsub;
  }, []);

  useEffect(() => {
    world.current = createBlossom(ref.current, {
      onCanvasActivity: () => { if (startRef.current) stopSession(); },
    });
    return () => { world.current?.destroy(); clearInterval(intervalRef.current); };
  }, []);

  useEffect(() => {
    world.current?.setData({ sessions });
  }, [sessions]);

  const fmt = (s) => s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;

  return html`
    <canvas ref=${ref} class="world"></canvas>
    ${active && html`
      <div class="blossom-timer">
        <span class="blossom-timer-time">${fmt(elapsed)}</span>
        <span class="blossom-timer-hint">stay still…</span>
        <button class="blossom-timer-stop" onClick=${stopSession}>stop</button>
      </div>
    `}
    ${lastResult && html`
      <div class="blossom-result">
        🌸 ${fmt(lastResult)} of stillness
      </div>
    `}
  `;
}

function BlossomCheckIn({ onDone }) {
  const [tab, setTab] = useState('auto');
  const [minutes, setMinutes] = useState(10);
  const total = totalMinutes();

  function begin() {
    blossomBus.emit();
    onDone();
  }

  function submitManual() {
    addSession(minutes * 60);
    onDone();
  }

  return html`
    <div class="sheet">
      <h2>Stillness</h2>
      <div class="forest-tabs">
        <button class=${'ftab' + (tab === 'auto' ? ' on' : '')} onClick=${() => setTab('auto')}>⏱ Stopwatch</button>
        <button class=${'ftab' + (tab === 'manual' ? ' on' : '')} onClick=${() => setTab('manual')}>✏️ Manual</button>
      </div>

      ${tab === 'auto' && html`
        <p class="sub">Tap start, set your phone down, and go still. Any movement stops the timer.</p>
        ${total > 0 && html`<p class="sub" style=${{ marginBottom: '16px' }}>${total} minutes of stillness so far 🌸</p>`}
        <button class="grow blossom" onClick=${begin}>Start →</button>
      `}

      ${tab === 'manual' && html`
        <p class="sub">Already meditated? Log how long you sat.</p>
        <div class="sleep-hours">
          <span class="sleep-hours-val">${minutes}m</span>
          <input type="range" min="1" max="120" step="1"
            value=${minutes} onInput=${(e) => setMinutes(+e.target.value)} />
          <span class="sleep-hours-label">minutes</span>
        </div>
        ${total > 0 && html`<p class="sub" style=${{ marginBottom: '16px' }}>${total} minutes total 🌸</p>`}
        <button class="grow blossom" onClick=${submitManual}>Log session →</button>
      `}
    </div>`;
}

// ---- biome switcher --------------------------------------------------------

function Switcher({ active }) {
  return html`
    <div class="switcher">
      ${BIOMES.map((b) => html`
        <button key=${b.id}
          class=${'biome-tab' + (b.id === active ? ' on' : '')}
          onClick=${() => setBiome(b.id)}
          title=${b.label}>
          <span class="b-emoji">${b.emoji}</span>
          <span class="b-label">${b.label}</span>
        </button>`)}
    </div>`;
}

// ---- biome configs ---------------------------------------------------------

const FOREST = {
  World: ForestWorld,
  CheckIn: ForestCheckIn,
  logo: '🌲',
  title: 'Your Forest',
  count: (c) => `${c.length} branches · ${totalSteps().toLocaleString()} steps`,
  empty: 'Plant your first branch',
  again: (today) => (today ? 'Check in / log walk' : 'Daily check-in'),
  resetMsg: 'Fossilize and clear this forest? It cannot be undone.',
};

const OCEAN = {
  World: OceanWorld,
  CheckIn: OceanCheckIn,
  logo: '🌊',
  title: 'Your Sea',
  count: (l) => `${l.length} bottles adrift`,
  empty: 'Write your first letter',
  again: (today) => (today ? 'Write another' : 'Write a letter'),
  resetMsg: 'Empty the sea? Every bottled letter is lost for good.',
};

const DESERT = {
  World: DesertWorld,
  CheckIn: DesertCheckIn,
  logo: '🏜️',
  title: 'Your Oasis',
  count: () => `${litresToday().toFixed(2)}L of ${GOAL}L`,
  empty: 'Pour the first glass',
  again: (today) => (today ? 'Drink more water' : 'Start hydrating'),
  resetMsg: 'Clear the whole hydration log? It cannot be undone.',
};

const JUNGLE = {
  World: JungleWorld,
  CheckIn: JungleCheckIn,
  logo: '🌴',
  title: 'Your Jungle',
  count: (l) => `${l.length} nights · ${sleepHoursToday().toFixed(1)}h tonight`,
  empty: 'Log your first night',
  again: (today) => (today ? 'Log another' : 'Log tonight\'s sleep'),
  resetMsg: 'Clear all sleep logs? The jungle goes dark.',
};

const VOLCANO = {
  World: VolcanoWorld,
  CheckIn: VolcanoCheckIn,
  logo: '🌋',
  title: 'Your Volcano',
  count: (l) => {
    if (!l.length) return 'dormant — no data yet';
    const { pressure, release } = volcanoState();
    const bal = release / (pressure + 0.01);
    const label = pressure < 0.15 ? 'dormant'
      : pressure < 0.35 ? 'simmering'
      : bal >= 0.65 ? 'in balance'
      : pressure >= 0.62 ? 'erupting'
      : 'building pressure';
    return `${l.length} logs · ${label}`;
  },
  empty: 'Log your first pressure check',
  again: (today) => (today ? 'Log again' : 'Log today\'s pressure'),
  resetMsg: 'Clear all volcano logs? The volcano goes dormant.',
};


const BLOSSOM = {
  World: BlossomWorld,
  CheckIn: BlossomCheckIn,
  logo: '🌸',
  title: 'Your Garden',
  count: (s) => {
    if (!s.length) return 'still and waiting';
    const mins = totalMinutes();
    return mins < 1 ? `${s.length} sessions` : `${s.length} sessions · ${mins}m total`;
  },
  empty: 'Begin your first meditation',
  again: (today) => today ? 'Sit again' : 'Log a session',
  resetMsg: 'Clear all meditation logs? The garden returns to stillness.',
};

const CONFIGS = { forest: FOREST, ocean: OCEAN, desert: DESERT, jungle: JUNGLE, volcano: VOLCANO, blossom: BLOSSOM };

// ---- map -------------------------------------------------------------------

const MAP_REGIONS = [
  { id: 'forest',  label: 'Forest',  emoji: '🌲', x: 0.44, y: 0.28, color: '#2d6a1f', glow: '#6dbf5a' },
  { id: 'blossom', label: 'Garden',  emoji: '🌸', x: 0.62, y: 0.24, color: '#7b3f6e', glow: '#f48fb1' },
  { id: 'ocean',   label: 'Ocean',   emoji: '🌊', x: 0.70, y: 0.50, color: '#1a5c7a', glow: '#4fc3f7' },
  { id: 'desert',  label: 'Desert',  emoji: '🏜️', x: 0.30, y: 0.44, color: '#9a7010', glow: '#fdd835' },
  { id: 'volcano', label: 'Volcano', emoji: '🌋', x: 0.36, y: 0.66, color: '#7a1a1a', glow: '#ff7043' },
  { id: 'jungle',  label: 'Jungle',  emoji: '🌴', x: 0.56, y: 0.68, color: '#1a5c28', glow: '#aed581' },
];

function MapView({ onSelect }) {
  const ref = useRef(null);
  const hover = useRef(-1);
  const animRef = useRef(null);
  const t = useRef(0);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');

    function resize() {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    function rng(seed) {
      let s = seed;
      return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
    }

    // Stable random data (seeded, computed once)
    const waveRng = rng(77);
    const waves = Array.from({length: 18}, () => ({
      wx: waveRng(), wy: waveRng(), ww: 40 + waveRng() * 120, phase: waveRng() * Math.PI * 2,
    }));

    function drawMap(ts) {
      t.current = ts * 0.001;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // Ocean background
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#0d3d5c');
      bg.addColorStop(0.5, '#1a6080');
      bg.addColorStop(1, '#0a2e45');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Animated ocean wave ripples
      ctx.save();
      ctx.globalAlpha = 0.07;
      ctx.strokeStyle = '#7dd4f8';
      ctx.lineWidth = 1;
      for (const w of waves) {
        ctx.beginPath();
        ctx.ellipse(w.wx * W + Math.sin(t.current * 0.4 + w.phase) * 6, w.wy * H, w.ww, w.ww * 0.18, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // Title
      ctx.save();
      ctx.fillStyle = '#a8d8f0';
      ctx.font = `bold ${Math.round(H * 0.05)}px Georgia, serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 8;
      ctx.fillText('TERRARIUM', W / 2, 20);
      ctx.font = `italic ${Math.round(H * 0.022)}px Georgia, serif`;
      ctx.fillStyle = '#7ec8e8';
      ctx.shadowBlur = 4;
      ctx.fillText('Choose your world', W / 2, 20 + Math.round(H * 0.055));
      ctx.restore();

      // Draw landmass base (combined sandy shore behind all blobs)
      const landCX = W * 0.50, landCY = H * 0.48;
      const landR = Math.min(W, H) * 0.36;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 30;
      const landBase = rng(999);
      ctx.beginPath();
      const lpts = 14;
      for (let p = 0; p < lpts; p++) {
        const angle = (p / lpts) * Math.PI * 2;
        const jitter = 0.72 + landBase() * 0.36;
        const bx = landCX + Math.cos(angle) * landR * jitter;
        const by = landCY + Math.sin(angle) * landR * jitter;
        p === 0 ? ctx.moveTo(bx, by) : ctx.lineTo(bx, by);
      }
      ctx.closePath();
      const shoreGrad = ctx.createRadialGradient(landCX, landCY, 0, landCX, landCY, landR);
      shoreGrad.addColorStop(0, '#c8a96e');
      shoreGrad.addColorStop(0.7, '#b89858');
      shoreGrad.addColorStop(1, '#d4b882');
      ctx.fillStyle = shoreGrad;
      ctx.fill();
      ctx.restore();

      // Beach ring (lighter sandy edge)
      ctx.save();
      const beachBase = rng(888);
      ctx.beginPath();
      const bpts = 14;
      for (let p = 0; p < bpts; p++) {
        const angle = (p / bpts) * Math.PI * 2;
        const jitter = 0.70 + beachBase() * 0.35;
        const bx = landCX + Math.cos(angle) * (landR * jitter + 14);
        const by = landCY + Math.sin(angle) * (landR * jitter + 14);
        p === 0 ? ctx.moveTo(bx, by) : ctx.lineTo(bx, by);
      }
      ctx.closePath();
      ctx.strokeStyle = '#e8d4a0';
      ctx.lineWidth = 10;
      ctx.globalAlpha = 0.45;
      ctx.stroke();
      ctx.restore();

      // Draw terrain blobs for each region
      const rad = Math.min(W, H) * 0.155;
      MAP_REGIONS.forEach((reg, i) => {
        const cx = reg.x * W, cy = reg.y * H;
        const hovered = hover.current === i;
        const pulse = hovered ? 1 + Math.sin(t.current * 4) * 0.05 : 1;
        const r2 = rng(i * 137 + 13);

        ctx.save();
        if (hovered) {
          ctx.shadowColor = reg.glow;
          ctx.shadowBlur = 28;
        }
        ctx.beginPath();
        const pts = 12;
        for (let p = 0; p < pts; p++) {
          const angle = (p / pts) * Math.PI * 2;
          const jitter = 0.76 + r2() * 0.36;
          const bx = cx + Math.cos(angle) * rad * jitter * pulse;
          const by = cy + Math.sin(angle) * rad * jitter * pulse;
          p === 0 ? ctx.moveTo(bx, by) : ctx.lineTo(bx, by);
        }
        ctx.closePath();
        const grad = ctx.createRadialGradient(cx - rad*0.25, cy - rad*0.25, 0, cx, cy, rad * 1.1);
        grad.addColorStop(0, reg.glow + 'dd');
        grad.addColorStop(0.55, reg.color + 'cc');
        grad.addColorStop(1, reg.color + '77');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = hovered ? reg.glow : reg.glow + '55';
        ctx.lineWidth = hovered ? 3 : 1.5;
        ctx.stroke();
        ctx.restore();

        // Emoji
        const emojiSize = Math.round(Math.min(W,H) * (hovered ? 0.08 : 0.072));
        ctx.font = `${emojiSize}px serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(reg.emoji, cx, cy - emojiSize * 0.15);

        // Label
        ctx.save();
        ctx.fillStyle = hovered ? '#ffffff' : '#e8f4ff';
        ctx.font = `${hovered ? 'bold ' : ''}${Math.round(Math.min(W,H) * 0.028)}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = hovered ? 6 : 4;
        ctx.fillText(reg.label, cx, cy + emojiSize * 0.62);
        ctx.restore();
      });

      // Compass rose (bottom-right)
      const crx = W - 56, cry = H - 56, crr = 26;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 6;
      ['N','E','S','W'].forEach((d, i) => {
        const a = i * Math.PI / 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(crx + Math.cos(a) * crr, cry + Math.sin(a) * crr);
        ctx.lineTo(crx + Math.cos(a + Math.PI/4) * crr * 0.38, cry + Math.sin(a + Math.PI/4) * crr * 0.38);
        ctx.lineTo(crx, cry);
        ctx.closePath();
        ctx.fillStyle = i === 0 ? '#e84040' : '#d4b882';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
        ctx.font = `bold 10px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#e8f4ff';
        ctx.shadowBlur = 3;
        ctx.fillText(d, crx + Math.cos(a) * (crr + 12), cry + Math.sin(a) * (crr + 12));
      });
      ctx.restore();

      animRef.current = requestAnimationFrame(drawMap);
    }

    animRef.current = requestAnimationFrame(drawMap);
    return () => { cancelAnimationFrame(animRef.current); ro.disconnect(); };
  }, []);

  function getRegionAt(e) {
    const canvas = ref.current;
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
    const my = (e.clientY - rect.top) * (canvas.height / rect.height);
    const W = canvas.width, H = canvas.height;
    let best = -1, bestD = Infinity;
    MAP_REGIONS.forEach((reg, i) => {
      const dx = mx - reg.x * W, dy = my - reg.y * H;
      const d = Math.sqrt(dx*dx + dy*dy);
      const rad = Math.min(W, H) * 0.11;
      if (d < rad * 1.1 && d < bestD) { bestD = d; best = i; }
    });
    return best;
  }

  function onMouseMove(e) {
    hover.current = getRegionAt(e);
    ref.current.style.cursor = hover.current >= 0 ? 'pointer' : 'default';
  }
  function onMouseLeave() { hover.current = -1; }
  function onClick(e) {
    const i = getRegionAt(e);
    if (i >= 0) onSelect(MAP_REGIONS[i].id);
  }

  return html`<canvas ref=${ref} class="map-canvas"
    onMouseMove=${onMouseMove} onMouseLeave=${onMouseLeave} onClick=${onClick} />`;
}

// ---- app -------------------------------------------------------------------

function SoundBar() {
  const [active, setActive] = useState('off');
  function pick(id) {
    setActive(id);
    soundEngine.play(id);
  }
  return html`
    <div class="sound-bar">
      ${SOUND_OPTIONS.map(s => html`
        <button key=${s.id}
          class=${'sbtn' + (active === s.id ? ' on' : '')}
          onClick=${() => pick(s.id)}>
          ${s.label}
        </button>`)}
    </div>`;
}

function App() {
  const biome = useBiome();
  const checkins = useCheckins();
  const letters = useLetters();
  const logs = useWater();
  const sleepLogs = useSleep();
  const vLogs = useVolcanoLogs();
  const sessions = useSessions();
  const [open, setOpen] = useState(false);
  const [showMap, setShowMap] = useState(true);

  const clock = useClock();
  const cfg = CONFIGS[biome];
  const items = biome === 'forest' ? checkins
    : biome === 'ocean' ? letters
    : biome === 'desert' ? logs
    : biome === 'jungle' ? sleepLogs
    : biome === 'blossom' ? sessions
    : vLogs;
  const streak = biome === 'forest' ? checkinStreak()
    : biome === 'ocean' ? letterStreak()
    : biome === 'desert' ? hydrationStreak()
    : biome === 'jungle' ? sleepStreak()
    : biome === 'blossom' ? meditationStreak()
    : volcanoStreak();
  const today = biome === 'forest' ? checkedInToday()
    : biome === 'ocean' ? bottledToday()
    : biome === 'desert' ? wateredToday()
    : biome === 'jungle' ? sleptToday()
    : biome === 'blossom' ? meditatedToday()
    : volcanoLoggedToday();

  const dom = biome === 'forest' ? dominantEmotion() : null;
  const moth = biome === 'forest' && mothAwakened();
  const whale = biome === 'ocean' && whaleAwakened();
  const animals = biome === 'desert' ? animalsPresent() : null;
  const bio = biome === 'jungle' ? bioLevel() : 0;

  function reset() {
    if (!confirm(cfg.resetMsg)) return;
    if (biome === 'forest') resetWorld();
    else if (biome === 'ocean') resetOcean();
    else if (biome === 'desert') resetDesert();
    else if (biome === 'jungle') resetJungle();
    else if (biome === 'blossom') resetBlossom();
    else resetVolcano();
  }

  if (showMap) return html`
    <div class="app map-screen">
      <${MapView} onSelect=${(id) => { setBiome(id); setShowMap(false); }} />
    </div>`;

  return html`
    <div class=${'app ' + biome}>
      <${cfg.World} key=${biome} />

      <header class="top">
        <div class="brand">
          <span class="logo">${cfg.logo}</span>
          <div>
            <h1>${cfg.title}</h1>
            <span class="time">${TIME_LABEL()} · ${cfg.count(items)}</span>
          </div>
        </div>
        <div class="stats">
          <button class="stat map-btn" onClick=${() => setShowMap(true)} title="World Map">
            <b>🗺</b><span>map</span>
          </button>
          <a class="stat landing-link" href="./landing.html" title="About Terrarium">
            <b>ℹ</b><span>about</span>
          </a>
          <div class="stat"><b>${streak}</b><span>day streak</span></div>
          ${dom && html`<div class="stat"><b>${EMOTIONS[dom].emoji}</b><span>${EMOTIONS[dom].label} season</span></div>`}
          <button class="stat clock-toggle" title="Toggle day / night"
            onClick=${cycleClock}>
            <b>${CLOCK_LABEL[clock]}</b><span>${CLOCK_NAME[clock]}</span>
          </button>
        </div>
      </header>

      ${moth && html`<div class="discovery">🦋 A glowing moth has appeared — it only comes when you've shown vulnerability three nights running.</div>`}
      ${whale && html`<div class="discovery">🐋 A luminous whale now glides through your sea — drawn up from the deep once you let five letters go.</div>`}
      ${animals?.camel && html`<div class="discovery">🐪 A camel has arrived — the oasis is full at ${GOAL}L. Incredible dedication.</div>`}
      ${animals && !animals.camel && animals.owl && html`<div class="discovery">🦉 A burrowing owl is watching from the rocks — you've drunk 5L today.</div>`}
      ${animals && !animals.owl && animals.coyote && html`<div class="discovery">🐺 A coyote crept in at dusk — 4L reached. Halfway to a full oasis.</div>`}
      ${animals && !animals.coyote && animals.snake && html`<div class="discovery">🐍 A rattlesnake coiled up near the pool — 3L down today.</div>`}
      ${animals && !animals.snake && animals.fox && html`<div class="discovery">🦊 A fennec fox padded out to drink — keep going to attract more life.</div>`}
      ${biome === 'jungle' && bio >= BIO_THRESHOLDS.jaguar && html`<div class="discovery">🐆 A phantom cat steps from the dark — its luminous markings pulse with your perfect sleep rhythm.</div>`}
      ${biome === 'jungle' && bio >= BIO_THRESHOLDS.butterfly && bio < BIO_THRESHOLDS.jaguar && html`<div class="discovery">🦋 A glowing morpho butterfly drifts through — consistent good sleep lit the way.</div>`}
      ${biome === 'jungle' && bio >= BIO_THRESHOLDS.frog && bio < BIO_THRESHOLDS.butterfly && html`<div class="discovery">🐸 A bioluminescent frog emerges from the undergrowth — your sleep is improving.</div>`}
      ${biome === 'jungle' && bio >= BIO_THRESHOLDS.firefly && bio < BIO_THRESHOLDS.frog && html`<div class="discovery">✨ Fireflies drift through the dark — rest more to awaken deeper life.</div>`}

      ${biome === 'volcano' && (() => {
        const { pressure, release } = volcanoState();
        const bal = release / (pressure + 0.01);
        if (pressure >= 0.62 && bal >= 0.52) return html`<div class="discovery">🌋 Your effort matched your pressure — the volcano erupts beautifully. A controlled release.</div>`;
        if (pressure >= 0.62) return html`<div class="discovery">⚠️ High pressure with little release. Move your body to help the volcano find balance.</div>`;
        if (pressure >= 0.35 && bal >= 0.68) return html`<div class="discovery">✨ Stress and movement in balance — the volcano glows steadily without danger.</div>`;
        return null;
      })()}
      ${biome === 'jungle' && html`<${SoundBar} />`}
      <${Switcher} active=${biome} />

      <footer class="bottom">
        ${items.length === 0
          ? html`<button class="cta" onClick=${() => setOpen(true)}>${cfg.empty}</button>`
          : html`<button class=${'cta' + (today ? ' soft' : '')} onClick=${() => setOpen(true)}>
              ${cfg.again(today)}
            </button>`}
        ${items.length > 0 && html`
          <button class="reset" title="start over" onClick=${reset}>⟲</button>`}
      </footer>

      ${open && html`
        <div class="overlay" onClick=${(e) => { if (e.target.classList.contains('overlay')) setOpen(false); }}>
          <${cfg.CheckIn} onDone=${() => setOpen(false)} />
        </div>`}
    </div>`;
}

createRoot(document.getElementById('root')).render(html`<${App} />`);
