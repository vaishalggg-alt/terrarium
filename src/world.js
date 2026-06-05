// Canvas world engine for the Forest biome.
//
//   • The "Root & Branch" tree is rebuilt from the full check-in log. Each
//     check-in adds one branch; the logging emotion sets its angle, droop,
//     curl, colour and the bloom at its tip. The tree sways with the wind.
//   • The sky runs a continuous day/night cycle tied to the real clock, so a
//     night owl gets a moonlit, firefly-lit world.
//   • The dominant recent emotion grows the ambient weather: rain, drifting
//     petals, butterflies, embers, low fog, anxious spores or a soft glow.
//   • A hidden glowing moth appears once vulnerability is logged three nights
//     running.

import { EMOTIONS } from './emotions.js';
import { clockDate } from './clock.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// deterministic per-index pseudo random so the tree is stable across reloads
function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// ---- sky / time of day -----------------------------------------------------

// returns 0..1 daylight factor + palette for the current hour (fractional)
function skyState(date) {
  const h = date.getHours() + date.getMinutes() / 60;
  // daylight curve: 0 at night, 1 at midday, soft dawn/dusk ramps
  let day;
  if (h < 5 || h >= 21) day = 0;
  else if (h < 7) day = (h - 5) / 2;
  else if (h < 18) day = 1;
  else if (h < 21) day = 1 - (h - 18) / 3;
  else day = 0;

  const night = { top: [16, 21, 48], bot: [42, 49, 86] };
  const dusk = { top: [60, 47, 92], bot: [222, 120, 96] };
  const noon = { top: [120, 186, 235], bot: [200, 230, 230] };

  // dusk/dawn tint peaks around day≈0.3
  const duskMix = clamp(1 - Math.abs(day - 0.3) / 0.3, 0, 1) * (day < 0.7 ? 1 : 0);
  const base = day < 0.5
    ? mix(night, dusk, day / 0.5)
    : mix(dusk, noon, (day - 0.5) / 0.5);
  const top = blend(base.top, duskMix ? dusk.top : base.top, duskMix * 0.4);
  const bot = blend(base.bot, duskMix ? dusk.bot : base.bot, duskMix * 0.5);
  return { day, top, bot, isNight: day < 0.12 };
}

const mix = (a, b, t) => ({ top: blend(a.top, b.top, t), bot: blend(a.bot, b.bot, t) });
const blend = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

// ---- tree model ------------------------------------------------------------

// Build node list from check-ins. Node 0 is the trunk, which grows taller and
// thicker as the log grows. Each check-in adds one limb in a 3-way fork off an
// earlier limb (a complete ternary tree), so the canopy fills out the way a
// real tree does: a few primary boughs, each splitting into secondaries, and
// so on. Limbs attach part-way ALONG their parent (not only at the tip) and
// angle upward-and-out. The logging emotion sets the limb's spread, droop,
// curl and the foliage colour/shape at its tip.
function buildTree(checkins) {
  const n = checkins.length;
  const trunkLen = clamp(150 + n * 2.4, 150, 300);
  const trunkThick = clamp(14 + n * 0.16, 14, 26);
  const nodes = [{
    parent: -1, depth: 0, length: trunkLen, thick: trunkThick,
    emo: 'calm', curl: 0.015, droop: 0, spread: 0, side: 0,
    attach: 0, bloom: 'leaf', intensity: 2, seed: 0,
  }];
  checkins.forEach((c, k) => {
    const e = EMOTIONS[c.emotion] || EMOTIONS.calm;
    const b = e.branch;
    const idx = k + 1;                       // this node's index
    const parent = Math.floor((idx - 1) / 3); // ternary parent
    const slot = (idx - 1) % 3;              // which of the 3 forks
    const depth = nodes[parent].depth + 1;
    const r = rng(idx);
    const intensity = c.intensity || 2;
    // slot 0 leans left, slot 1 right, slot 2 shoots up the middle
    const side = slot === 0 ? -1 : slot === 1 ? 1 : (r() < 0.5 ? -1 : 1);
    const spread = b.spread * (slot === 2 ? 0.35 : 1) + r() * 8;
    // stagger attach points up the parent limb so forks don't all stack
    const attach = (depth === 1 ? 0.5 : 0.45) + slot * 0.18 + r() * 0.05;
    const length = nodes[parent].length * (0.7 - depth * 0.015)
      * (0.72 + 0.12 * intensity) * (0.86 + r() * 0.28);
    nodes.push({
      parent, depth, slot, side,
      attach: clamp(attach, 0.4, 0.96),
      length: clamp(length, 16, trunkLen),
      thick: Math.max(1.4, nodes[parent].thick * 0.62),
      curl: b.curl, droop: b.droop, spread,
      emo: c.emotion, bloom: b.bloom, intensity, seed: idx,
    });
  });
  const hasChild = new Set(nodes.map((nd) => nd.parent));
  nodes.forEach((nd, i) => { nd.tip = !hasChild.has(i); });
  return nodes;
}

// ---- particles -------------------------------------------------------------

function makeParticle(kind, W, H) {
  const r = Math.random;
  switch (kind) {
    case 'rain':
      return { x: r() * W, y: r() * -H, vy: 9 + r() * 6, vx: -1.2, len: 10 + r() * 14 };
    case 'petals':
      return { x: r() * W, y: r() * -H, vy: 0.6 + r() * 0.8, vx: -0.4 + r() * 0.8, rot: r() * TAU, vr: -0.04 + r() * 0.08, s: 4 + r() * 4 };
    case 'butterflies':
      return { x: r() * W, y: H * (0.2 + r() * 0.6), phase: r() * TAU, sp: 0.6 + r() * 0.8, amp: 18 + r() * 24, dir: r() < 0.5 ? 1 : -1, s: 5 + r() * 3, flap: r() * TAU };
    case 'embers':
      return { x: r() * W, y: H + r() * 40, vy: -(1.4 + r() * 1.8), vx: -0.6 + r() * 1.2, life: 0, max: 120 + r() * 80, s: 1.5 + r() * 2 };
    case 'spores':
      return { x: r() * W, y: r() * H, phase: r() * TAU, sp: 0.3 + r() * 0.5, drift: 0.3 + r() * 0.6, s: 1.5 + r() * 2 };
    case 'glow':
      return { x: r() * W, y: r() * H, phase: r() * TAU, sp: 0.2 + r() * 0.3, s: 2 + r() * 3 };
    case 'firefly':
      return { x: r() * W, y: H * (0.3 + r() * 0.6), phase: r() * TAU, sp: 0.4 + r() * 0.6, amp: 30 + r() * 40, baseY: 0, s: 1.6 + r() * 1.6 };
    default:
      return { x: r() * W, y: r() * H };
  }
}

// ---- engine ----------------------------------------------------------------

export function createWorld(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  let nodes = [];
  let weather = 'petals';
  let moth = false;
  let parts = [];
  let fireflies = [];
  let raf = 0;
  let t0 = performance.now();
  let mothState = { x: 0, y: 0, phase: 0 };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rebuildParticles();
  }

  function rebuildParticles() {
    const counts = { rain: 160, petals: 46, butterflies: 9, embers: 70, spores: 60, glow: 40, fog: 0 };
    const n = counts[weather] ?? 40;
    parts = Array.from({ length: n }, () => makeParticle(weather, W, H));
    fireflies = Array.from({ length: 18 }, () => {
      const f = makeParticle('firefly', W, H); f.baseY = f.y; return f;
    });
  }

  function setData({ checkins, weather: w, moth: m }) {
    nodes = buildTree(checkins);
    if (w && w !== weather) { weather = w; rebuildParticles(); }
    else if (w) weather = w;
    moth = !!m;
  }

  // recursive limb draw: tapered bark limbs, children attach along the parent,
  // emotion-coloured foliage clustered at the tips. Sways with the wind.
  function drawTree(time, daylight) {
    const groundY = H * 0.82;
    const ox = W * 0.5;
    const wind = Math.sin(time * 0.0005) * 0.05 + Math.sin(time * 0.0013) * 0.025;
    const foliage = [];

    function walk(i, sx, sy, inAngle) {
      const n = nodes[i];
      const segs = 9;
      const sway = wind * (n.depth + 1) * 0.16;       // higher limbs sway more
      const droopPer = (n.droop * DEG) / segs;
      const curlPer = (n.curl || 0) * n.side * 0.45;
      // sample the limb centreline
      const pts = [{ x: sx, y: sy }];
      let px = sx, py = sy, a = inAngle;
      for (let s = 1; s <= segs; s++) {
        a += curlPer + droopPer + sway / segs
          + Math.sin(n.seed * 1.3 + s * 0.9) * 0.012;  // organic waver
        const l = n.length / segs;
        px += Math.cos(a) * l;
        py += Math.sin(a) * l;
        pts.push({ x: px, y: py });
      }

      // draw as tapered segments (bark), thick at base -> thin at tip
      const bark = barkShade(daylight, n.depth);
      ctx.strokeStyle = bark;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let s = 0; s < segs; s++) {
        ctx.beginPath();
        ctx.moveTo(pts[s].x, pts[s].y);
        ctx.lineTo(pts[s + 1].x, pts[s + 1].y);
        ctx.lineWidth = lerp(n.thick, n.thick * 0.45, s / segs);
        ctx.stroke();
      }

      // children attach part-way along this limb, angled off the local tangent
      for (let k = 0; k < nodes.length; k++) {
        const c = nodes[k];
        if (c.parent !== i) continue;
        const idx = clamp(Math.round(c.attach * segs), 1, segs);
        const base = pts[idx], prev = pts[idx - 1];
        const tangent = Math.atan2(base.y - prev.y, base.x - prev.x);
        // off the tangent, biased outward (spread) and a touch upward
        const childAngle = tangent + (c.spread * c.side - 7) * DEG;
        walk(k, base.x, base.y, childAngle);
      }

      // foliage at this limb's tip (denser on true tips)
      if (n.parent >= 0) foliage.push({ x: px, y: py, n, ang: a });
    }

    walk(0, ox, groundY, -90 * DEG);

    // foliage drawn after limbs so it sits on top
    for (const f of foliage) drawFoliage(f.x, f.y, f.n, daylight, time);
  }

  // a cluster of small emotion-coloured leaves/blooms at a limb tip
  function drawFoliage(x, y, n, daylight, time) {
    const e = EMOTIONS[n.emo] || EMOTIONS.calm;
    const col = shade(e.leaf, daylight, 0);
    const count = n.tip ? 4 + n.intensity : 2;
    const r = rng(n.seed * 7 + 3);
    const base = (n.tip ? 6 : 4.5) + n.intensity * 0.8;

    // vulnerable growth casts a soft glow halo behind the cluster
    if (n.emo === 'vulnerable') {
      ctx.save();
      ctx.globalAlpha = 0.3 + 0.18 * Math.sin(time * 0.003 + n.seed);
      const g = ctx.createRadialGradient(x, y, 0, x, y, base * 3);
      g.addColorStop(0, e.leaf); g.addColorStop(1, 'rgba(212,194,239,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, base * 3, 0, TAU); ctx.fill();
      ctx.restore();
    }

    for (let p = 0; p < count; p++) {
      const dx = (r() - 0.5) * base * 2.4;
      const dy = (r() - 0.5) * base * 2.4 - 1;
      const sz = base * (0.7 + r() * 0.6);
      drawLeaf(x + dx, y + dy, sz, n.bloom, col, r);
    }
  }

  function drawLeaf(x, y, size, kind, col, r) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(r() * TAU);
    switch (kind) {
      case 'sunflower': {
        ctx.fillStyle = col;
        for (let p = 0; p < 9; p++) {
          ctx.beginPath();
          const a = (p / 9) * TAU;
          ctx.ellipse(Math.cos(a) * size * 0.7, Math.sin(a) * size * 0.7, size * 0.42, size * 0.2, a, 0, TAU);
          ctx.fill();
        }
        ctx.fillStyle = '#6b4f1d';
        ctx.beginPath(); ctx.arc(0, 0, size * 0.45, 0, TAU); ctx.fill();
        break;
      }
      case 'blossom': {
        ctx.fillStyle = col;
        for (let p = 0; p < 5; p++) {
          ctx.beginPath();
          const a = (p / 5) * TAU;
          ctx.ellipse(Math.cos(a) * size * 0.55, Math.sin(a) * size * 0.55, size * 0.4, size * 0.28, a, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'thorn': {
        ctx.strokeStyle = col; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -size * 1.6); ctx.stroke();
        break;
      }
      case 'berry': {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(0, 0, size * 0.5, 0, TAU); ctx.fill();
        break;
      }
      case 'leaf':
      default: {
        // a simple pointed leaf
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(0, -size);
        ctx.quadraticCurveTo(size * 0.7, 0, 0, size);
        ctx.quadraticCurveTo(-size * 0.7, 0, 0, -size);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawSky(sky) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, rgb(sky.top));
    g.addColorStop(1, rgb(sky.bot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // stars + moon at night, sun glow by day
    if (sky.isNight || sky.day < 0.35) {
      const a = clamp((0.35 - sky.day) / 0.35, 0, 1);
      ctx.fillStyle = `rgba(255,255,255,${0.7 * a})`;
      for (let i = 0; i < 60; i++) {
        const sx = (i * 137.5) % W;
        const sy = (i * 91.3) % (H * 0.6);
        ctx.fillRect(sx, sy, 1.4, 1.4);
      }
      ctx.fillStyle = `rgba(240,240,220,${a})`;
      ctx.beginPath(); ctx.arc(W * 0.78, H * 0.2, 26, 0, TAU); ctx.fill();
      ctx.fillStyle = rgb(sky.top);
      ctx.beginPath(); ctx.arc(W * 0.84, H * 0.17, 24, 0, TAU); ctx.fill();
    } else {
      const a = clamp(sky.day, 0, 1);
      const sun = ctx.createRadialGradient(W * 0.8, H * 0.2, 8, W * 0.8, H * 0.2, 120);
      sun.addColorStop(0, `rgba(255,250,220,${0.9 * a})`);
      sun.addColorStop(1, 'rgba(255,250,220,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawGround(daylight) {
    const groundY = H * 0.82;
    const g = ctx.createLinearGradient(0, groundY - 30, 0, H);
    const dark = 0.4 + daylight * 0.6;
    g.addColorStop(0, `rgb(${60 * dark},${110 * dark},${64 * dark})`);
    g.addColorStop(1, `rgb(${38 * dark},${72 * dark},${44 * dark})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.quadraticCurveTo(W * 0.3, groundY - 18, W * 0.55, groundY - 4);
    ctx.quadraticCurveTo(W * 0.8, groundY + 12, W, groundY - 8);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fill();
  }

  function drawWeather(time, daylight) {
    ctx.save();
    switch (weather) {
      case 'rain': {
        ctx.strokeStyle = 'rgba(174,194,224,0.5)';
        ctx.lineWidth = 1.1;
        for (const p of parts) {
          ctx.beginPath(); ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.vx, p.y + p.len); ctx.stroke();
          p.x += p.vx; p.y += p.vy;
          if (p.y > H) { p.y = -10; p.x = Math.random() * W; }
        }
        // fog band
        ctx.fillStyle = 'rgba(180,195,220,0.10)';
        ctx.fillRect(0, H * 0.6, W, H * 0.4);
        break;
      }
      case 'fog': {
        for (let i = 0; i < 4; i++) {
          const y = H * (0.55 + i * 0.1);
          const off = Math.sin(time * 0.0003 + i) * 40;
          ctx.fillStyle = `rgba(200,206,214,${0.12 - i * 0.02})`;
          ctx.beginPath();
          ctx.ellipse(W * 0.5 + off, y, W * 0.7, 40, 0, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'petals': {
        for (const p of parts) {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = 'rgba(245,170,205,0.85)';
          ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.55, 0, 0, TAU); ctx.fill();
          ctx.restore();
          p.x += p.vx + Math.sin(time * 0.001 + p.y * 0.01) * 0.4;
          p.y += p.vy; p.rot += p.vr;
          if (p.y > H) { p.y = -10; p.x = Math.random() * W; }
        }
        break;
      }
      case 'butterflies': {
        for (const p of parts) {
          p.phase += 0.02 * p.sp; p.flap += 0.3;
          const x = p.x + Math.cos(p.phase) * p.amp * p.dir;
          const y = p.y + Math.sin(p.phase * 1.7) * p.amp * 0.5;
          const f = Math.abs(Math.sin(p.flap));
          ctx.fillStyle = 'rgba(255,170,90,0.92)';
          ctx.save(); ctx.translate(x, y);
          ctx.beginPath(); ctx.ellipse(-p.s * f, 0, p.s, p.s * 0.7, 0.5, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.ellipse(p.s * f, 0, p.s, p.s * 0.7, -0.5, 0, TAU); ctx.fill();
          ctx.restore();
          p.x += 0.2 * p.dir;
          if (p.x > W + 40) p.x = -40; if (p.x < -40) p.x = W + 40;
        }
        break;
      }
      case 'embers': {
        for (const p of parts) {
          p.life++; p.x += p.vx + Math.sin(p.life * 0.05) * 0.4; p.y += p.vy;
          const a = 1 - p.life / p.max;
          ctx.fillStyle = `rgba(255,${120 + a * 80},40,${a})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, TAU); ctx.fill();
          if (p.life > p.max || p.y < 0) Object.assign(p, makeParticle('embers', W, H));
        }
        break;
      }
      case 'spores': {
        for (const p of parts) {
          p.phase += 0.01 * p.sp;
          p.x += Math.cos(p.phase) * p.drift; p.y += Math.sin(p.phase * 0.7) * p.drift * 0.6;
          ctx.fillStyle = 'rgba(201,139,185,0.6)';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, TAU); ctx.fill();
          wrap(p);
        }
        break;
      }
      case 'glow': {
        for (const p of parts) {
          p.phase += 0.02 * p.sp;
          const a = 0.3 + 0.3 * Math.sin(p.phase);
          ctx.fillStyle = `rgba(212,194,239,${a})`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, TAU); ctx.fill();
        }
        break;
      }
    }
    ctx.restore();
  }

  function wrap(p) {
    if (p.x < -10) p.x = W + 10; if (p.x > W + 10) p.x = -10;
    if (p.y < -10) p.y = H + 10; if (p.y > H + 10) p.y = -10;
  }

  function drawFireflies(time) {
    for (const f of fireflies) {
      f.phase += 0.01 * f.sp;
      const x = f.x + Math.cos(f.phase) * f.amp;
      const y = f.baseY + Math.sin(f.phase * 1.3) * f.amp * 0.5;
      const a = 0.4 + 0.4 * Math.sin(time * 0.004 + f.phase * 3);
      const g = ctx.createRadialGradient(x, y, 0, x, y, f.s * 4);
      g.addColorStop(0, `rgba(200,255,150,${a})`);
      g.addColorStop(1, 'rgba(200,255,150,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, f.s * 4, 0, TAU); ctx.fill();
    }
  }

  function drawMoth(time) {
    mothState.phase += 0.008;
    const x = W * 0.5 + Math.cos(mothState.phase) * W * 0.32;
    const y = H * 0.4 + Math.sin(mothState.phase * 1.6) * H * 0.18;
    const flap = Math.abs(Math.sin(time * 0.012)) * 6 + 4;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 30);
    glow.addColorStop(0, 'rgba(180,210,255,0.5)');
    glow.addColorStop(1, 'rgba(180,210,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(x, y, 30, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(225,235,255,0.95)';
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath(); ctx.ellipse(-flap, 0, 7, 5, 0.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(flap, 0, 7, 5, -0.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a3a4a';
    ctx.beginPath(); ctx.ellipse(0, 0, 1.6, 5, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function frame(now) {
    const time = now - t0;
    const sky = skyState(clockDate());
    drawSky(sky);
    drawGround(sky.day);
    drawTree(time, sky.day);
    drawWeather(time, sky.day);
    if (sky.day < 0.3) drawFireflies(time);
    if (moth && sky.day < 0.5) drawMoth(time);
    raf = requestAnimationFrame(frame);
  }

  const onResize = () => resize();
  resize();
  window.addEventListener('resize', onResize);
  raf = requestAnimationFrame(frame);

  return {
    setData,
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
    },
  };
}

// bark colour — brown, lightening slightly toward the young outer twigs,
// dimmed toward night.
function barkShade(daylight, depth) {
  const d = 0.4 + daylight * 0.6;
  const t = clamp(depth * 0.12, 0, 0.5);           // outer twigs a touch greener
  const r = lerp(86, 104, t), g = lerp(64, 96, t), b = lerp(46, 58, t);
  return `rgb(${(r * d) | 0},${(g * d) | 0},${(b * d) | 0})`;
}

// dim/tint a hex colour toward night
function shade(hex, daylight, depth) {
  const c = hexToRgb(hex);
  const d = 0.45 + daylight * 0.55;
  const trunkTint = depth === undefined ? 1 : clamp(1 - depth * 0.04, 0.6, 1);
  return `rgb(${(c[0] * d * trunkTint) | 0},${(c[1] * d * trunkTint) | 0},${(c[2] * d * trunkTint) | 0})`;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
