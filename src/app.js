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

// Single landmass polygon — outer hull, 15 angular vertices
const MAP_HULL = [
  [0.22, 0.11], // 0  upper-left        (desert | forest border)
  [0.40, 0.07], // 1
  [0.59, 0.08], // 2  upper             (forest | garden border)
  [0.74, 0.12], // 3
  [0.88, 0.26], // 4  upper-right       (garden | ocean border)
  [0.92, 0.44], // 5
  [0.89, 0.61], // 6
  [0.79, 0.77], // 7  right             (ocean   | jungle border)
  [0.63, 0.89], // 8
  [0.46, 0.91], // 9  lower             (jungle  | volcano border)
  [0.28, 0.85], // 10
  [0.13, 0.73], // 11
  [0.09, 0.56], // 12 lower-left        (volcano | desert border)
  [0.11, 0.38], // 13
  [0.16, 0.21], // 14
];
const MAP_CTR = [0.50, 0.50]; // center point all regions fan out from

// Each region is a polygon: [CENTER, hull[hi[0]], hull[hi[1]], ...]
const MAP_REGIONS = [
  { id: 'forest',  label: 'Forest',  emoji: '🌲', hi: [0,1,2],      lx:0.40, ly:0.25, light:'#7ec87a', dark:'#1e4d16' },
  { id: 'blossom', label: 'Garden',  emoji: '🌸', hi: [2,3,4],      lx:0.72, ly:0.27, light:'#f0a0c8', dark:'#6a2d5e' },
  { id: 'ocean',   label: 'Ocean',   emoji: '🌊', hi: [4,5,6,7],    lx:0.79, ly:0.53, light:'#5dc8f0', dark:'#14506e' },
  { id: 'jungle',  label: 'Jungle',  emoji: '🌴', hi: [7,8,9],      lx:0.60, ly:0.76, light:'#a8d870', dark:'#1a5020' },
  { id: 'volcano', label: 'Volcano', emoji: '🌋', hi: [9,10,11,12], lx:0.24, ly:0.72, light:'#ff7043', dark:'#6a1010' },
  { id: 'desert',  label: 'Desert',  emoji: '🏜️', hi: [12,13,14,0], lx:0.22, ly:0.37, light:'#fdd835', dark:'#8a6008' },
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

    // Build polygon points for a region in canvas pixels
    function regionPoly(reg, W, H) {
      const pts = [[MAP_CTR[0]*W, MAP_CTR[1]*H]];
      for (const i of reg.hi) pts.push([MAP_HULL[i][0]*W, MAP_HULL[i][1]*H]);
      return pts;
    }

    function tracePoly(pts) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
    }

    // Precompute wave shimmer data
    let ws = 77;
    const wr = () => { ws = (ws * 16807) % 2147483647; return (ws-1)/2147483646; };
    const waves = Array.from({length: 20}, () => ({wx:wr(),wy:wr(),rx:50+wr()*130,phase:wr()*Math.PI*2}));

    function drawMap(ts) {
      t.current = ts * 0.001;
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);

      // Ocean background
      const bg = ctx.createRadialGradient(W*.45, H*.38, 0, W*.5, H*.5, Math.max(W,H)*.85);
      bg.addColorStop(0, '#1e7298');
      bg.addColorStop(0.55, '#0e4d6a');
      bg.addColorStop(1, '#082030');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Ocean shimmer
      ctx.save();
      ctx.strokeStyle = '#4db8e8';
      ctx.lineWidth = 0.7;
      for (const w of waves) {
        ctx.globalAlpha = 0.035 + 0.025 * Math.sin(t.current*.5 + w.phase);
        ctx.beginPath();
        ctx.ellipse(w.wx*W, w.wy*H, w.rx, w.rx*.14, 0, 0, Math.PI*2);
        ctx.stroke();
      }
      ctx.restore();

      // Title
      ctx.save();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#c8e8f8';
      ctx.font = `bold ${Math.round(H*.052)}px Georgia, serif`;
      ctx.fillText('TERRARIUM', W/2, 16);
      ctx.fillStyle = '#7ecce8'; ctx.shadowBlur = 4;
      ctx.font = `italic ${Math.round(H*.022)}px Georgia, serif`;
      ctx.fillText('Choose your world', W/2, 16 + Math.round(H*.058));
      ctx.restore();

      // Landmass drop shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.55)';
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 6;
      ctx.beginPath();
      ctx.moveTo(MAP_HULL[0][0]*W, MAP_HULL[0][1]*H);
      for (let i = 1; i < MAP_HULL.length; i++) ctx.lineTo(MAP_HULL[i][0]*W, MAP_HULL[i][1]*H);
      ctx.closePath();
      ctx.fillStyle = '#000';
      ctx.fill();
      ctx.restore();

      // Draw each biome region
      MAP_REGIONS.forEach((reg, i) => {
        const hovered = hover.current === i;
        const pts = regionPoly(reg, W, H);
        tracePoly(pts);

        const cx = reg.lx * W, cy = reg.ly * H;
        const grad = ctx.createRadialGradient(cx, cy - H*.04, 0, cx, cy + H*.08, Math.min(W,H)*.35);
        grad.addColorStop(0, hovered ? reg.light : reg.light + 'cc');
        grad.addColorStop(0.5, reg.dark + 'ee');
        grad.addColorStop(1, reg.dark);
        ctx.fillStyle = grad;
        ctx.fill();
      });

      // Internal borders — lines from center to each divider hull point
      const dividers = [0, 2, 4, 7, 9, 12];
      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,.55)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([]);
      for (const di of dividers) {
        ctx.beginPath();
        ctx.moveTo(MAP_CTR[0]*W, MAP_CTR[1]*H);
        ctx.lineTo(MAP_HULL[di][0]*W, MAP_HULL[di][1]*H);
        ctx.stroke();
      }
      ctx.restore();

      // Outer landmass border
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(MAP_HULL[0][0]*W, MAP_HULL[0][1]*H);
      for (let i = 1; i < MAP_HULL.length; i++) ctx.lineTo(MAP_HULL[i][0]*W, MAP_HULL[i][1]*H);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(0,0,0,.7)';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();

      // Hover glow overlay
      if (hover.current >= 0) {
        const reg = MAP_REGIONS[hover.current];
        const pts = regionPoly(reg, W, H);
        tracePoly(pts);
        ctx.save();
        ctx.strokeStyle = reg.light;
        ctx.lineWidth = 3;
        ctx.shadowColor = reg.light;
        ctx.shadowBlur = 20;
        ctx.stroke();
        ctx.restore();
      }

      // Emojis and labels
      MAP_REGIONS.forEach((reg, i) => {
        const hovered = hover.current === i;
        const cx = reg.lx * W, cy = reg.ly * H;
        const eSize = Math.round(Math.min(W,H) * (hovered ? .076 : .068));
        ctx.font = `${eSize}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(reg.emoji, cx, cy - eSize*.2);

        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.font = `${hovered ? 'bold ' : ''}${Math.round(Math.min(W,H)*.028)}px Georgia, serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.shadowColor = 'rgba(0,0,0,.9)'; ctx.shadowBlur = hovered ? 8 : 5;
        ctx.fillText(reg.label, cx, cy + eSize*.52);
        ctx.restore();
      });

      // Compass rose
      const crx = W-50, cry = H-50, crr = 22;
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 5;
      ['N','E','S','W'].forEach((d, i) => {
        const a = i*Math.PI/2 - Math.PI/2;
        ctx.beginPath();
        ctx.moveTo(crx+Math.cos(a)*crr, cry+Math.sin(a)*crr);
        ctx.lineTo(crx+Math.cos(a+Math.PI/4)*crr*.35, cry+Math.sin(a+Math.PI/4)*crr*.35);
        ctx.lineTo(crx, cry);
        ctx.closePath();
        ctx.fillStyle = i===0 ? '#e84040' : '#c8dff0';
        ctx.fill();
      });
      ctx.font = 'bold 9px Georgia,serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#e8f4ff'; ctx.shadowBlur = 3;
      ['N','E','S','W'].forEach((d, i) => {
        const a = i*Math.PI/2 - Math.PI/2;
        ctx.fillText(d, crx+Math.cos(a)*(crr+11), cry+Math.sin(a)*(crr+11));
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
    const ctx2 = canvas.getContext('2d');
    for (let i = MAP_REGIONS.length - 1; i >= 0; i--) {
      const reg = MAP_REGIONS[i];
      ctx2.beginPath();
      const c = [MAP_CTR[0]*W, MAP_CTR[1]*H];
      ctx2.moveTo(c[0], c[1]);
      for (const hi of reg.hi) ctx2.lineTo(MAP_HULL[hi][0]*W, MAP_HULL[hi][1]*H);
      ctx2.closePath();
      if (ctx2.isPointInPath(mx, my)) return i;
    }
    return -1;
  }

  function onMouseMove(e) {
    const i = getRegionAt(e);
    hover.current = i;
    ref.current.style.cursor = i >= 0 ? 'pointer' : 'default';
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
