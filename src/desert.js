// Canvas world engine for the Desert biome — an oasis hydration tracker.
//
//   • The pool in the middle of the dunes rises with today's water intake.
//     An empty day is cracked, dry sand; a full day is a brimming blue oasis.
//   • As the pool fills, life returns to the sand around it: grass tufts,
//     then reeds, then palm trees, then circling birds.
//   • The sky runs the same real-clock day/night cycle as the other biomes —
//     a blazing sun by day, a cool starlit desert by night.
//   • Hidden creature: a fennec fox pads out to drink once you hit your goal.

import { clockDate } from './clock.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const blend = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

function skyState(date) {
  const h = date.getHours() + date.getMinutes() / 60;
  let day;
  if (h < 5 || h >= 21) day = 0;
  else if (h < 7) day = (h - 5) / 2;
  else if (h < 18) day = 1;
  else if (h < 21) day = 1 - (h - 18) / 3;
  else day = 0;

  const night = { top: [20, 22, 52], bot: [58, 50, 78] };
  const dusk = { top: [80, 56, 104], bot: [244, 150, 96] };
  const noon = { top: [108, 170, 224], bot: [240, 224, 184] };
  const base = day < 0.5
    ? { top: blend(night.top, dusk.top, day / 0.5), bot: blend(night.bot, dusk.bot, day / 0.5) }
    : { top: blend(dusk.top, noon.top, (day - 0.5) / 0.5), bot: blend(dusk.bot, noon.bot, (day - 0.5) / 0.5) };
  return { day, top: base.top, bot: base.bot, isNight: day < 0.12 };
}

export function createDesert(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  let fill = 0, cups = 0, fox = false;
  let birds = [];
  let raf = 0;
  let t0 = performance.now();
  let foxState = { phase: 0 };

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rebuildBirds();
  }

  function rebuildBirds() {
    const n = fill >= 0.6 ? 5 : fill >= 0.3 ? 2 : 0;
    birds = Array.from({ length: n }, () => {
      const r = Math.random;
      return { phase: r() * TAU, sp: 0.3 + r() * 0.4, cx: W * (0.3 + r() * 0.4), cy: H * (0.18 + r() * 0.14), rx: 60 + r() * 80, ry: 18 + r() * 16, flap: r() * TAU };
    });
  }

  function setData({ fill: f, cups: c, fox: fx }) {
    const rebuild = (f >= 0.6) !== (fill >= 0.6) || (f >= 0.3) !== (fill >= 0.3);
    fill = f; cups = c; fox = !!fx;
    if (rebuild) rebuildBirds();
  }

  function drawSky(sky) {
    const g = ctx.createLinearGradient(0, 0, 0, H * 0.7);
    g.addColorStop(0, rgb(sky.top));
    g.addColorStop(1, rgb(sky.bot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    if (sky.isNight || sky.day < 0.35) {
      const a = clamp((0.35 - sky.day) / 0.35, 0, 1);
      ctx.fillStyle = `rgba(255,255,255,${0.7 * a})`;
      for (let i = 0; i < 60; i++) {
        const sx = (i * 137.5) % W;
        const sy = (i * 81.3) % (H * 0.55);
        ctx.fillRect(sx, sy, 1.4, 1.4);
      }
      ctx.fillStyle = `rgba(240,240,220,${a})`;
      ctx.beginPath(); ctx.arc(W * 0.74, H * 0.2, 24, 0, TAU); ctx.fill();
      ctx.fillStyle = rgb(sky.top);
      ctx.beginPath(); ctx.arc(W * 0.79, H * 0.17, 22, 0, TAU); ctx.fill();
    } else {
      // blazing sun
      const a = clamp(sky.day, 0, 1);
      const sun = ctx.createRadialGradient(W * 0.74, H * 0.22, 10, W * 0.74, H * 0.22, 150);
      sun.addColorStop(0, `rgba(255,244,210,${a})`);
      sun.addColorStop(1, 'rgba(255,244,210,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(255,250,225,${0.9 * a})`;
      ctx.beginPath(); ctx.arc(W * 0.74, H * 0.22, 28, 0, TAU); ctx.fill();
    }
  }

  // layered dunes; returns the y of the foreground sand at the pool centre
  function drawDunes(sky, time) {
    const d = 0.4 + sky.day * 0.6;
    const layers = [
      { y: H * 0.5, amp: 26, col: [214, 180, 132] },
      { y: H * 0.62, amp: 34, col: [202, 166, 116] },
      { y: H * 0.74, amp: 30, col: [188, 150, 100] },
    ];
    layers.forEach((L, i) => {
      ctx.fillStyle = rgb(L.col.map((c) => c * d));
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(0, L.y);
      for (let x = 0; x <= W; x += 12) {
        const y = L.y + Math.sin(x * 0.006 + i * 1.7) * L.amp + Math.sin(x * 0.02 + i) * 6;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    });
    return H * 0.78;
  }

  function drawOasis(groundY, sky, time) {
    const cx = W * 0.5, cy = groundY + 8;
    const maxR = Math.min(W * 0.26, 200);
    const r = maxR * (0.18 + fill * 0.82);          // pool radius from fill
    const ry = r * 0.34;
    const d = 0.4 + sky.day * 0.6;

    // damp sand ring / dry cracked basin when empty
    ctx.fillStyle = rgb([150, 120, 80].map((c) => c * d));
    ctx.beginPath(); ctx.ellipse(cx, cy, r + 16, ry + 7, 0, 0, TAU); ctx.fill();

    if (fill <= 0.02) {
      // cracked dry bed
      ctx.strokeStyle = `rgba(120,92,60,${0.6 * d})`;
      ctx.lineWidth = 1.2;
      const rr = rng(7);
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.moveTo(cx + (rr() - 0.5) * r, cy + (rr() - 0.5) * ry);
        ctx.lineTo(cx + (rr() - 0.5) * r, cy + (rr() - 0.5) * ry);
        ctx.stroke();
      }
      return { cx, cy, r };
    }

    // water
    const wg = ctx.createLinearGradient(0, cy - ry, 0, cy + ry);
    wg.addColorStop(0, `rgb(${96 * d},${198 * d},${214 * d})`);
    wg.addColorStop(1, `rgb(${30 * d},${110 * d},${158 * d})`);
    ctx.fillStyle = wg;
    ctx.beginPath(); ctx.ellipse(cx, cy, r, ry, 0, 0, TAU); ctx.fill();

    // ripples + sky glint
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, cy, r, ry, 0, 0, TAU); ctx.clip();
    ctx.strokeStyle = `rgba(255,255,255,${0.18 * d})`;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      const yy = cy - ry + (i + 0.5) * (ry * 2 / 4);
      ctx.beginPath();
      for (let x = cx - r; x <= cx + r; x += 8) {
        const off = Math.sin(x * 0.06 + time * 0.003 + i) * 2;
        x === cx - r ? ctx.moveTo(x, yy + off) : ctx.lineTo(x, yy + off);
      }
      ctx.stroke();
    }
    ctx.restore();
    return { cx, cy, r };
  }

  function drawPalm(x, baseY, hgt, sky, sway) {
    const d = 0.4 + sky.day * 0.6;
    ctx.strokeStyle = rgb([110, 78, 46].map((c) => c * d));
    ctx.lineWidth = Math.max(3, hgt * 0.05);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    const tx = x + sway * hgt * 0.12, ty = baseY - hgt;
    ctx.quadraticCurveTo(x + sway * hgt * 0.04, baseY - hgt * 0.5, tx, ty);
    ctx.stroke();
    // fronds
    ctx.strokeStyle = rgb([70, 140, 70].map((c) => c * d));
    ctx.lineWidth = Math.max(2, hgt * 0.03);
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.5 + sway * 0.1;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(
        tx + Math.cos(a) * hgt * 0.3, ty + Math.sin(a) * hgt * 0.3 - 6,
        tx + Math.cos(a) * hgt * 0.5, ty + Math.sin(a) * hgt * 0.5 + 6);
      ctx.stroke();
    }
  }

  function drawLife(pool, groundY, sky, time) {
    const d = 0.4 + sky.day * 0.6;
    const sway = Math.sin(time * 0.0009) * 0.6;
    const { cx, r } = pool;

    // grass tufts appear first (cups), then reeds, then palms
    const tufts = clamp(Math.round(cups * 1.5), 0, 16);
    ctx.strokeStyle = rgb([90, 150, 78].map((c) => c * d));
    ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    const gr = rng(21);
    for (let i = 0; i < tufts; i++) {
      const side = i % 2 ? 1 : -1;
      const bx = cx + side * (r + 10 + gr() * 40);
      const by = groundY + 6 + gr() * 8;
      for (let b = 0; b < 3; b++) {
        const a = -Math.PI / 2 + (b - 1) * 0.35 + sway * 0.2;
        ctx.beginPath(); ctx.moveTo(bx + b, by);
        ctx.lineTo(bx + Math.cos(a) * 9, by + Math.sin(a) * 9); ctx.stroke();
      }
    }

    // palms scale with fill
    const palms = Math.floor(fill * 4);
    const pr = rng(5);
    for (let i = 0; i < palms; i++) {
      const side = i % 2 ? 1 : -1;
      const px = cx + side * (r + 30 + pr() * 50);
      drawPalm(px, groundY + 6, 70 + pr() * 50, sky, sway * side);
    }
  }

  function drawBirds(sky, time) {
    const d = 0.5 + sky.day * 0.5;
    ctx.strokeStyle = `rgba(${40 * d},${40 * d},${50 * d},0.7)`;
    ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (const b of birds) {
      b.phase += 0.005 * b.sp; b.flap += 0.2;
      const x = b.cx + Math.cos(b.phase) * b.rx;
      const y = b.cy + Math.sin(b.phase) * b.ry;
      const w = 5 + Math.abs(Math.sin(b.flap)) * 4;
      ctx.beginPath();
      ctx.moveTo(x - w, y + 3);
      ctx.quadraticCurveTo(x, y - 3, x, y);
      ctx.quadraticCurveTo(x, y - 3, x + w, y + 3);
      ctx.stroke();
    }
  }

  function drawFox(pool, groundY, sky, time) {
    foxState.phase += 0.004;
    const d = 0.4 + sky.day * 0.6;
    const { cx, r } = pool;
    // pads to the pool edge and pauses to drink
    const t = (Math.sin(foxState.phase) + 1) / 2;
    const x = cx + r + 80 - t * 68;
    const y = groundY + 6;
    const drink = t > 0.85;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1.8, 1.8); // bigger fox

    // vivid reddish-orange fennec, distinct from sand
    const furCol = rgb([210, 100, 40].map((c) => c * d));
    const bellyCol = `rgba(255,235,210,${d})`;
    const darkCol = rgb([80, 40, 20].map((c) => c * d));

    // body
    ctx.fillStyle = furCol;
    ctx.beginPath(); ctx.ellipse(0, -7, 13, 7, 0, 0, TAU); ctx.fill();
    // belly highlight
    ctx.fillStyle = bellyCol;
    ctx.beginPath(); ctx.ellipse(-1, -5, 8, 4, 0, 0, TAU); ctx.fill();

    // head
    const hx = -12, hy = drink ? -4 : -13;
    ctx.fillStyle = furCol;
    ctx.beginPath(); ctx.arc(hx, hy, 6.5, 0, TAU); ctx.fill();
    // face/muzzle lighter patch
    ctx.fillStyle = bellyCol;
    ctx.beginPath(); ctx.ellipse(hx - 2, hy + 1, 4, 3, -0.3, 0, TAU); ctx.fill();

    // big fennec ears — large & outlined for contrast
    ctx.fillStyle = furCol;
    ctx.beginPath(); ctx.moveTo(hx - 4, hy - 5); ctx.lineTo(hx - 9, hy - 18); ctx.lineTo(hx + 1, hy - 7); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hx + 2, hy - 5); ctx.lineTo(hx + 4, hy - 18); ctx.lineTo(hx + 7, hy - 6); ctx.closePath(); ctx.fill();
    // inner ear pink
    ctx.fillStyle = `rgba(220,140,140,${d})`;
    ctx.beginPath(); ctx.moveTo(hx - 4, hy - 7); ctx.lineTo(hx - 7, hy - 15); ctx.lineTo(hx, hy - 8); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hx + 2, hy - 7); ctx.lineTo(hx + 3, hy - 15); ctx.lineTo(hx + 6, hy - 7); ctx.closePath(); ctx.fill();

    // nose
    ctx.fillStyle = darkCol;
    ctx.beginPath(); ctx.arc(hx - 5, hy + 2, 1.2, 0, TAU); ctx.fill();
    // eye
    ctx.fillStyle = darkCol;
    ctx.beginPath(); ctx.arc(hx - 1, hy - 1, 1.2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath(); ctx.arc(hx - 0.4, hy - 1.5, 0.5, 0, TAU); ctx.fill();

    // legs
    ctx.strokeStyle = furCol; ctx.lineWidth = 2.8; ctx.lineCap = 'round';
    for (const lx of [-7, -2, 4, 9]) { ctx.beginPath(); ctx.moveTo(lx, -2); ctx.lineTo(lx + 1, 6); ctx.stroke(); }

    // bushy tail — white-tipped
    ctx.fillStyle = furCol;
    ctx.beginPath(); ctx.ellipse(13, -9, 9, 5, -0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(19, -12, 3.5, 0, TAU); ctx.fill();

    ctx.restore();
  }

  function frame(now) {
    const time = now - t0;
    const sky = skyState(clockDate());
    drawSky(sky);
    drawBirds(sky, time);
    const groundY = drawDunes(sky, time);
    const pool = drawOasis(groundY, sky, time);
    drawLife(pool, groundY, sky, time);
    if (fox) drawFox(pool, groundY, sky, time);
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
