// Canvas world engine for the Ocean biome.
//
//   • Each unsent letter you bottle becomes a glass bottle bobbing on the
//     waves. Bottles are placed deterministically so the sea is stable across
//     reloads — letting go is permanent, the sea keeps every one.
//   • The sky above the waterline runs the same continuous day/night cycle as
//     the forest, tied to the real clock.
//   • The more letters you release, the more alive the water gets: a school of
//     fish thickens, and at night the deep fills with bioluminescent plankton
//     and pulsing jellyfish.
//   • A hidden luminous whale surfaces once five letters have been released.

import { clockDate } from './clock.js';

const TAU = Math.PI * 2;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const blend = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

// deterministic per-index pseudo random so bottle layout is stable
function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// 0..1 daylight + sky palette for the current hour (mirrors the forest sky)
function skyState(date) {
  const h = date.getHours() + date.getMinutes() / 60;
  let day;
  if (h < 5 || h >= 21) day = 0;
  else if (h < 7) day = (h - 5) / 2;
  else if (h < 18) day = 1;
  else if (h < 21) day = 1 - (h - 18) / 3;
  else day = 0;

  const night = { top: [12, 18, 44], bot: [30, 44, 82] };
  const dusk = { top: [58, 50, 96], bot: [232, 138, 110] };
  const noon = { top: [120, 190, 236], bot: [196, 232, 236] };
  const base = day < 0.5
    ? { top: blend(night.top, dusk.top, day / 0.5), bot: blend(night.bot, dusk.bot, day / 0.5) }
    : { top: blend(dusk.top, noon.top, (day - 0.5) / 0.5), bot: blend(dusk.bot, noon.bot, (day - 0.5) / 0.5) };
  return { day, top: base.top, bot: base.bot, isNight: day < 0.12 };
}

export function createOcean(canvas) {
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, dpr = Math.min(window.devicePixelRatio || 1, 2);
  let letters = [];
  let bottles = [];
  let whale = false;
  let fish = [];
  let plankton = [];
  let jellies = [];
  let raf = 0;
  let t0 = performance.now();
  let whaleState = { phase: 0.1 };
  // bottles currently sailing away: { startTime, fx, tint, scale, bob, drift }
  let launchingBottles = [];

  function surfaceY(x, time) {
    const base = H * 0.42;
    return base
      + Math.sin(x * 0.012 + time * 0.0012) * 9
      + Math.sin(x * 0.026 - time * 0.0019) * 5;
  }
  function surfaceSlope(x, time) {
    return Math.cos(x * 0.012 + time * 0.0012) * 9 * 0.012
      + Math.cos(x * 0.026 - time * 0.0019) * 5 * 0.026;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    W = rect.width; H = rect.height;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rebuildLife();
  }

  function rebuildBottles() {
    bottles = letters.map((l, k) => {
      const r = rng(k + 1);
      return {
        fx: 0.08 + r() * 0.84,        // fraction across the width
        drift: (-0.5 + r()) * 0.06,   // slow horizontal drift px/frame
        bob: r() * TAU,               // bob phase offset
        scale: 0.85 + r() * 0.4,
        tint: r(),                    // glass hue variation
      };
    });
  }

  function rebuildLife() {
    const n = clamp(letters.length * 2, 0, 34);
    fish = Array.from({ length: n }, () => {
      const r = Math.random;
      return {
        x: r() * W, y: surfaceY(0) + 40 + r() * (H - surfaceY(0) - 70),
        sp: (0.3 + r() * 0.7) * (r() < 0.5 ? 1 : -1),
        phase: r() * TAU, amp: 4 + r() * 8, s: 4 + r() * 5,
      };
    });
    plankton = Array.from({ length: 70 }, () => {
      const r = Math.random;
      return { x: r() * W, y: H * 0.45 + r() * H * 0.55, phase: r() * TAU, sp: 0.2 + r() * 0.4, s: 1 + r() * 1.8 };
    });
    jellies = Array.from({ length: 5 }, () => {
      const r = Math.random;
      return { x: r() * W, y: H * 0.55 + r() * H * 0.35, phase: r() * TAU, sp: 0.15 + r() * 0.2, s: 10 + r() * 12, rise: 0.1 + r() * 0.15 };
    });
  }

  function setData({ letters: ls, whale: wh }, now = performance.now()) {
    const isNew = ls.length > letters.length;
    letters = ls;
    whale = !!wh;
    rebuildBottles();
    rebuildLife();
    if (isNew) {
      // kick off a sail-away animation for the newest bottle
      const k = ls.length - 1;
      const r = rng(k + 1);
      launchingBottles.push({
        startTime: now - t0,
        tint: r(),
        scale: 0.85 + r() * 0.4,
        bob: r() * TAU,
        // direction: left or right, 50/50
        dir: Math.random() < 0.5 ? 1 : -1,
      });
    }
  }

  function drawSky(sky) {
    const wl = H * 0.42;
    const g = ctx.createLinearGradient(0, 0, 0, wl);
    g.addColorStop(0, rgb(sky.top));
    g.addColorStop(1, rgb(sky.bot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, wl + 20);

    if (sky.isNight || sky.day < 0.35) {
      const a = clamp((0.35 - sky.day) / 0.35, 0, 1);
      ctx.fillStyle = `rgba(255,255,255,${0.7 * a})`;
      for (let i = 0; i < 50; i++) {
        const sx = (i * 137.5) % W;
        const sy = (i * 71.3) % (wl * 0.8);
        ctx.fillRect(sx, sy, 1.4, 1.4);
      }
      ctx.fillStyle = `rgba(240,240,220,${a})`;
      ctx.beginPath(); ctx.arc(W * 0.76, wl * 0.42, 24, 0, TAU); ctx.fill();
      ctx.fillStyle = rgb(sky.top);
      ctx.beginPath(); ctx.arc(W * 0.81, wl * 0.36, 22, 0, TAU); ctx.fill();
    } else {
      const a = clamp(sky.day, 0, 1);
      const sun = ctx.createRadialGradient(W * 0.78, wl * 0.4, 8, W * 0.78, wl * 0.4, 130);
      sun.addColorStop(0, `rgba(255,250,220,${0.9 * a})`);
      sun.addColorStop(1, 'rgba(255,250,220,0)');
      ctx.fillStyle = sun;
      ctx.fillRect(0, 0, W, wl + 20);
    }
  }

  function drawWater(sky, time) {
    const wl = H * 0.42;
    const d = 0.35 + sky.day * 0.65;
    const g = ctx.createLinearGradient(0, wl, 0, H);
    g.addColorStop(0, `rgb(${56 * d},${150 * d},${168 * d})`);
    g.addColorStop(0.5, `rgb(${28 * d},${96 * d},${140 * d})`);
    g.addColorStop(1, `rgb(${10 * d},${40 * d},${78 * d})`);

    // wavy top edge
    ctx.beginPath();
    ctx.moveTo(0, surfaceY(0, time));
    for (let x = 0; x <= W; x += 8) ctx.lineTo(x, surfaceY(x, time));
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();

    // sun/moon glitter band on the surface
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glint = sky.day > 0.2 ? 'rgba(255,250,210,0.10)' : 'rgba(200,215,255,0.07)';
    ctx.fillStyle = glint;
    for (let x = 0; x <= W; x += 14) {
      const y = surfaceY(x, time);
      const w = 5 + Math.sin(x * 0.05 + time * 0.004) * 4;
      ctx.fillRect(x - w / 2, y, w, 2);
    }
    ctx.restore();

    // daytime god-rays under the surface
    if (sky.day > 0.3) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const rx = W * (0.2 + i * 0.16) + Math.sin(time * 0.0004 + i) * 30;
        const ray = ctx.createLinearGradient(rx, wl, rx + 60, H);
        ray.addColorStop(0, `rgba(255,250,220,${0.06 * sky.day})`);
        ray.addColorStop(1, 'rgba(255,250,220,0)');
        ctx.fillStyle = ray;
        ctx.beginPath();
        ctx.moveTo(rx - 14, wl); ctx.lineTo(rx + 14, wl);
        ctx.lineTo(rx + 80, H); ctx.lineTo(rx + 40, H); ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawFish(sky, time) {
    const night = sky.day < 0.3;
    for (const f of fish) {
      f.x += f.sp;
      f.phase += 0.05;
      const y = f.y + Math.sin(f.phase) * f.amp;
      if (f.x > W + 20) f.x = -20;
      if (f.x < -20) f.x = W + 20;
      const dir = f.sp >= 0 ? 1 : -1;
      ctx.save();
      ctx.translate(f.x, y);
      ctx.scale(dir, 1);
      if (night) {
        const a = 0.5 + 0.4 * Math.sin(time * 0.005 + f.phase);
        ctx.fillStyle = `rgba(120,220,255,${a})`;
      } else {
        ctx.fillStyle = 'rgba(20,60,90,0.55)';
      }
      ctx.beginPath();
      ctx.ellipse(0, 0, f.s, f.s * 0.5, 0, 0, TAU);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-f.s, 0);
      ctx.lineTo(-f.s - f.s * 0.7, -f.s * 0.5);
      ctx.lineTo(-f.s - f.s * 0.7, f.s * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawDeepLife(sky, time) {
    if (sky.day > 0.4) return;              // bioluminescence only in the dark
    const a = clamp((0.4 - sky.day) / 0.4, 0, 1);

    for (const p of plankton) {
      p.phase += 0.02 * p.sp;
      const glow = (0.3 + 0.4 * Math.sin(p.phase)) * a;
      ctx.fillStyle = `rgba(150,240,210,${glow})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, TAU); ctx.fill();
    }

    for (const j of jellies) {
      j.phase += j.sp * 0.03;
      j.y -= j.rise;
      if (j.y < H * 0.45) j.y = H * 1.02;
      const pulse = 0.5 + 0.5 * Math.sin(j.phase);
      const x = j.x + Math.sin(j.phase * 0.6) * 12;
      const r = j.s * (0.8 + pulse * 0.3);
      const glow = ctx.createRadialGradient(x, j.y, 0, x, j.y, r * 2.4);
      glow.addColorStop(0, `rgba(190,150,255,${0.45 * a})`);
      glow.addColorStop(1, 'rgba(190,150,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, j.y, r * 2.4, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(220,200,255,${0.7 * a})`;
      ctx.beginPath(); ctx.ellipse(x, j.y, r, r * 0.8, 0, Math.PI, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(200,180,255,${0.5 * a})`;
      ctx.lineWidth = 1.2;
      for (let t = -2; t <= 2; t++) {
        ctx.beginPath();
        ctx.moveTo(x + t * r * 0.35, j.y);
        ctx.quadraticCurveTo(x + t * r * 0.35 + Math.sin(time * 0.004 + t) * 4, j.y + r * 1.6, x + t * r * 0.35, j.y + r * 2.4);
        ctx.stroke();
      }
    }
  }

  function drawWhale(sky, time) {
    whaleState.phase += 0.0014;
    const a = sky.day < 0.4 ? clamp((0.4 - sky.day) / 0.4, 0, 1) : 0.25;
    const x = W * 0.5 + Math.cos(whaleState.phase) * W * 0.42;
    const y = H * 0.78 + Math.sin(whaleState.phase * 1.3) * H * 0.08;
    const dir = Math.sin(whaleState.phase) >= 0 ? 1 : -1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(dir, 1);
    const L = W * 0.16;
    // soft luminous halo
    const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, L);
    glow.addColorStop(0, `rgba(140,200,255,${0.22 * a})`);
    glow.addColorStop(1, 'rgba(140,200,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, L, 0, TAU); ctx.fill();
    // body
    ctx.fillStyle = `rgba(40,70,110,${0.55 + 0.3 * a})`;
    ctx.beginPath();
    ctx.moveTo(-L * 0.5, 0);
    ctx.quadraticCurveTo(0, -L * 0.32, L * 0.5, 0);
    ctx.quadraticCurveTo(L * 0.62, L * 0.05, L * 0.5, L * 0.16);
    ctx.quadraticCurveTo(0, L * 0.26, -L * 0.5, L * 0.12);
    // tail flukes
    ctx.quadraticCurveTo(-L * 0.62, L * 0.04, -L * 0.7, -L * 0.12);
    ctx.quadraticCurveTo(-L * 0.55, 0, -L * 0.5, 0);
    ctx.closePath();
    ctx.fill();
    // bioluminescent dorsal line
    ctx.strokeStyle = `rgba(150,220,255,${0.6 * a})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-L * 0.45, -L * 0.02);
    ctx.quadraticCurveTo(0, -L * 0.22, L * 0.42, -L * 0.02);
    ctx.stroke();
    // eye
    ctx.fillStyle = `rgba(200,230,255,${a})`;
    ctx.beginPath(); ctx.arc(L * 0.34, L * 0.02, 2.2, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawBottle(b, time) {
    const x = (W * b.fx + b.drift * (time * 0.02)) % (W + 60);
    const px = x < -30 ? x + W + 60 : x;
    const y = surfaceY(px, time) - 6 * b.scale;
    const slope = surfaceSlope(px, time);
    ctx.save();
    ctx.translate(px, y + Math.sin(time * 0.002 + b.bob) * 2);
    ctx.rotate(Math.atan(slope) + Math.PI / 2.1);   // lie along the wave, tilted
    ctx.scale(b.scale, b.scale);

    // glass body
    ctx.fillStyle = `rgba(${120 + b.tint * 40},${190 - b.tint * 30},${175 + b.tint * 30},0.55)`;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-5, -10);
    ctx.lineTo(5, -10);
    ctx.lineTo(5, 8);
    ctx.quadraticCurveTo(5, 12, 0, 12);
    ctx.quadraticCurveTo(-5, 12, -5, 8);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // neck
    ctx.fillStyle = 'rgba(150,200,185,0.5)';
    ctx.fillRect(-2.5, -16, 5, 6);
    // cork
    ctx.fillStyle = '#b9883f';
    ctx.fillRect(-2.5, -19, 5, 4);
    // rolled paper inside
    ctx.fillStyle = 'rgba(245,238,215,0.9)';
    ctx.fillRect(-2.5, -4, 5, 12);
    // highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.moveTo(-3, -7); ctx.lineTo(-3, 6); ctx.stroke();
    ctx.restore();
  }

  function drawLaunchingBottle(lb, time, sky) {
    const elapsed = time - lb.startTime;
    // 6-second animation: first 1s near-centre, then sails to edge and shrinks
    const DURATION = 6000;
    const progress = clamp(elapsed / DURATION, 0, 1);
    if (progress >= 1) return true; // signal done

    // starts just left/right of centre, moves outward
    const startFx = 0.5 + lb.dir * 0.05;
    const px = W * (startFx + lb.dir * progress * 0.55);
    const distanceFactor = progress; // 0 = full size/opacity, 1 = gone

    // scale down and fade as it recedes into the horizon
    const sc = lb.scale * (1 - distanceFactor * 0.82);
    const alpha = 1 - distanceFactor * distanceFactor; // ease out opacity

    const y = surfaceY(px, time) - 6 * sc;
    const slope = surfaceSlope(px, time);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(px, y + Math.sin(time * 0.002 + lb.bob) * 2 * (1 - distanceFactor));
    ctx.rotate(Math.atan(slope) + Math.PI / 2.1);
    ctx.scale(sc, sc);

    ctx.fillStyle = `rgba(${120 + lb.tint * 40},${190 - lb.tint * 30},${175 + lb.tint * 30},0.55)`;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-5, -10); ctx.lineTo(5, -10); ctx.lineTo(5, 8);
    ctx.quadraticCurveTo(5, 12, 0, 12);
    ctx.quadraticCurveTo(-5, 12, -5, 8);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(150,200,185,0.5)';
    ctx.fillRect(-2.5, -16, 5, 6);
    ctx.fillStyle = '#b9883f';
    ctx.fillRect(-2.5, -19, 5, 4);
    ctx.fillStyle = 'rgba(245,238,215,0.9)';
    ctx.fillRect(-2.5, -4, 5, 12);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.moveTo(-3, -7); ctx.lineTo(-3, 6); ctx.stroke();
    ctx.restore();

    return false;
  }

  function frame(now) {
    const time = now - t0;
    const sky = skyState(clockDate());
    drawSky(sky);
    drawWater(sky, time);
    drawDeepLife(sky, time);
    if (whale) drawWhale(sky, time);
    drawFish(sky, time);
    for (const b of bottles) drawBottle(b, time);
    launchingBottles = launchingBottles.filter((lb) => !drawLaunchingBottle(lb, time, sky));
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
