import { createElement as h, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import htm from 'htm';
import { EMOTIONS, EMOTION_KEYS } from './emotions.js';
import {
  subscribe, getCheckins, addCheckin, resetWorld,
  dominantEmotion, mothAwakened, checkinStreak, checkedInToday,
} from './store.js';
import {
  subscribeOcean, getLetters, addLetter, resetOcean,
  letterStreak, bottledToday, whaleAwakened,
} from './ocean-store.js';
import {
  subscribeDesert, getLogs, addWater, resetDesert,
  oasisFill, cupsToday, goalMet, wateredToday, hydrationStreak, GOAL,
} from './desert-store.js';
import { BIOMES, subscribeBiome, getBiome, setBiome } from './biome-store.js';
import { subscribeClock, getClockMode, cycleClock, CLOCK_LABEL, CLOCK_NAME } from './clock.js';
import { createWorld } from './world.js';
import { createOcean } from './ocean.js';
import { createDesert } from './desert.js';

const html = htm.bind(h);

const useCheckins = () => useSyncExternalStore(subscribe, getCheckins);
const useLetters = () => useSyncExternalStore(subscribeOcean, getLetters);
const useWater = () => useSyncExternalStore(subscribeDesert, getLogs);
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

  useEffect(() => {
    world.current = createWorld(ref.current);
    return () => world.current?.destroy();
  }, []);

  useEffect(() => {
    world.current?.setData({
      checkins,
      weather: dominantEmotion() ? EMOTIONS[dominantEmotion()].weather : 'petals',
      moth: mothAwakened(),
    });
  }, [checkins]);

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
    world.current?.setData({ fill: oasisFill(), cups: cupsToday(), fox: goalMet() });
  }, [logs]);

  return html`<canvas ref=${ref} class="world"></canvas>`;
}

// ---- check-in panels -------------------------------------------------------

function ForestCheckIn({ onDone }) {
  const [emo, setEmo] = useState(null);
  const [intensity, setIntensity] = useState(2);
  const [note, setNote] = useState('');

  function submit() {
    if (!emo) return;
    addCheckin(emo, intensity, note);
    onDone();
  }

  return html`
    <div class="sheet">
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
          <button class="grow" onClick=${submit}>Grow my world →</button>
        </div>`}
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
  const cups = cupsToday();
  const pct = Math.min(100, Math.round((cups / GOAL) * 100));

  function add(n) {
    addWater(n);
    onDone();
  }

  return html`
    <div class="sheet">
      <h2>Water your oasis</h2>
      <p class="sub">${cups} of ${GOAL} glasses today — the pool rises with every one.</p>
      <div class="water-meter"><div class="water-fill" style=${{ width: pct + '%' }}></div></div>
      <div class="water-btns">
        <button class="wbtn" onClick=${() => add(1)}>💧 +1 glass</button>
        <button class="wbtn" onClick=${() => add(2)}>💧💧 +2</button>
      </div>
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
  count: (c) => `${c.length} branches`,
  empty: 'Plant your first branch',
  again: (today) => (today ? 'Check in again' : 'Daily check-in'),
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
  count: () => `${cupsToday()} of ${GOAL} glasses`,
  empty: 'Pour the first glass',
  again: (today) => (today ? 'Drink more water' : 'Start hydrating'),
  resetMsg: 'Clear the whole hydration log? It cannot be undone.',
};

const CONFIGS = { forest: FOREST, ocean: OCEAN, desert: DESERT };

// ---- app -------------------------------------------------------------------

function App() {
  const biome = useBiome();
  const checkins = useCheckins();
  const letters = useLetters();
  const logs = useWater();
  const [open, setOpen] = useState(false);

  const clock = useClock();
  const cfg = CONFIGS[biome];
  const items = biome === 'forest' ? checkins : biome === 'ocean' ? letters : logs;
  const streak = biome === 'forest' ? checkinStreak()
    : biome === 'ocean' ? letterStreak() : hydrationStreak();
  const today = biome === 'forest' ? checkedInToday()
    : biome === 'ocean' ? bottledToday() : wateredToday();

  const dom = biome === 'forest' ? dominantEmotion() : null;
  const moth = biome === 'forest' && mothAwakened();
  const whale = biome === 'ocean' && whaleAwakened();
  const fox = biome === 'desert' && goalMet();

  function reset() {
    if (!confirm(cfg.resetMsg)) return;
    if (biome === 'forest') resetWorld();
    else if (biome === 'ocean') resetOcean();
    else resetDesert();
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
      ${fox && html`<div class="discovery">🦊 A fennec fox padded out to drink — it only comes when the oasis is full. Goal met.</div>`}

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
