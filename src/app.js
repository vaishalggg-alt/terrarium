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
  subscribeOcean, getLetters, addLetter, resetOcean,
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

const html = htm.bind(h);

const useCheckins = () => useSyncExternalStore(subscribe, getCheckins);
const useSteps = () => useSyncExternalStore(subscribe, getSteps);
const useLetters = () => useSyncExternalStore(subscribeOcean, getLetters);
const useWater = () => useSyncExternalStore(subscribeDesert, getLogs);
const useSleep = () => useSyncExternalStore(subscribeJungle, getSleepLogs);
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

  useEffect(() => {
    world.current = createOcean(ref.current);
    return () => world.current?.destroy();
  }, []);

  useEffect(() => {
    world.current?.setData({ letters, whale: whaleAwakened() });
  }, [letters]);

  return html`<canvas ref=${ref} class="world"></canvas>`;
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

const CONFIGS = { forest: FOREST, ocean: OCEAN, desert: DESERT, jungle: JUNGLE };

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
  const [open, setOpen] = useState(false);

  const clock = useClock();
  const cfg = CONFIGS[biome];
  const items = biome === 'forest' ? checkins
    : biome === 'ocean' ? letters
    : biome === 'desert' ? logs
    : sleepLogs;
  const streak = biome === 'forest' ? checkinStreak()
    : biome === 'ocean' ? letterStreak()
    : biome === 'desert' ? hydrationStreak()
    : sleepStreak();
  const today = biome === 'forest' ? checkedInToday()
    : biome === 'ocean' ? bottledToday()
    : biome === 'desert' ? wateredToday()
    : sleptToday();

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
    else resetJungle();
  }

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
