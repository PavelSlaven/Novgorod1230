import { OUT, mix, f, rng, kit } from './warrior.mjs';

const W = 1200;
const H = 675;
const HOR = 332;

const MAT = {
  spruce: { base: '#2f5c3c', light: '#4f8450', shadow: '#1b3a2c' },
  trunk: { base: '#5a3e2a', light: '#7a5638', shadow: '#3a2618' },
  bark: { base: '#e6e2d8', light: '#fbf9f2', shadow: '#a8a49c' },
  leaves: { base: '#8aab3c', light: '#b6cf58', shadow: '#5a7a2c' },
  twigs: { base: '#5a4646', light: '#7a6262', shadow: '#3a2c2c' },
  grass: { base: '#6e9a3e', light: '#97bf52', shadow: '#4a6e2c' },
  road: { base: '#9a7448', light: '#bf9562', shadow: '#6c4e30' },
  stone: { base: '#8b8a84', light: '#b3b2aa', shadow: '#5f5e5a' },
  snow: { base: '#e6edf6', light: '#ffffff', shadow: '#a6b6d0', snowy: true },
  cloud: { base: '#e9edf3', light: '#ffffff', shadow: '#a2adc0' }
};

const TIMES = {
  dawn: { top: '#34406e', bottom: '#f2a06a', sun: '#ffcf8a', sunPos: [170, 316], dir: 1, tint: '#ff9a5a', tintAmt: 0.22, dark: 0.25, shade: '#3a2c5a', haze: '#d99a80', lum: 0.6, shadowLen: 1.1 },
  morning: { top: '#5d97cf', bottom: '#f1e6c6', sun: '#fff3c8', sunPos: [300, 150], dir: 1, tint: '#ffe2a8', tintAmt: 0.12, dark: 0.05, shade: '#2c3a5a', haze: '#c9d8de', lum: 0.9, shadowLen: 0.55 },
  day: { top: '#3f88d0', bottom: '#c4e2f2', sun: '#ffffff', sunPos: [860, 80], dir: -1, tint: '#ffffff', tintAmt: 0, dark: 0, shade: '#24365a', haze: '#b8cfdc', lum: 1, shadowLen: 0.22 },
  evening: { top: '#5874ad', bottom: '#f3c08a', sun: '#ffd59a', sunPos: [960, 190], dir: -1, tint: '#ffb070', tintAmt: 0.16, dark: 0.1, shade: '#3a2f5a', haze: '#d8b796', lum: 0.8, shadowLen: 0.6 },
  dusk: { top: '#262a55', bottom: '#e0674a', sun: '#ff9a5c', sunPos: [1040, 320], dir: -1, tint: '#e0704a', tintAmt: 0.3, dark: 0.38, shade: '#2a2048', haze: '#a8607a', lum: 0.45, shadowLen: 1.2 },
  night: { top: '#070d22', bottom: '#1c2a4e', sun: '#dfe8ff', sunPos: [300, 110], dir: 1, tint: '#2a3f78', tintAmt: 0.45, dark: 0.5, shade: '#060a1c', haze: '#22325a', lum: 0.18, shadowLen: 0.35, moon: true }
};

const WEATHER = {
  clear: { cover: 0, contrast: 1 },
  cloudy: { cover: 0.1, contrast: 0.85, cumulus: 6 },
  overcast: { cover: 0.7, contrast: 0.45, stratus: true },
  fog: { cover: 0.8, contrast: 0.35, fog: true },
  rain: { cover: 0.75, contrast: 0.4, stratus: true, rain: true, darken: 0.15 },
  snow: { cover: 0.6, contrast: 0.5, stratus: true, snow: true }
};

function lighting(time, weather) {
  const T = TIMES[time];
  const X = WEATHER[weather];
  const grey = mix('#000000', '#8f949b', 0.22 + 0.78 * T.lum);
  const skyTop = mix(T.top, grey, X.cover);
  const skyBottom = mix(T.bottom, mix(grey, '#ffffff', 0.12), X.cover);
  const haze = X.fog ? mix(skyBottom, '#ffffff', 0.1) : mix(T.haze, grey, X.cover * 0.6);
  const sunVisible = X.cover < 0.5;
  const dark = Math.min(0.85, T.dark + (X.darken || 0));
  const tone = (c, k = 1) => mix(mix(mix(c, T.tint, T.tintAmt), grey, X.cover * 0.3), '#000000', dark * k);
  const hazeOf = (depth) => Math.min(0.96, Math.pow(1 - Math.min(depth, 1), X.fog ? 0.75 : 1.9) * (X.fog ? 0.97 : 0.62));
  const mat = (M, depth = 1) => {
    // Snow keeps reflecting whatever light there is, so it darkens less than everything else.
    const k = M.snowy ? 0.6 : 1;
    const base = tone(M.base, k);
    const light = mix(base, mix(tone(M.light, k), T.sun, sunVisible ? 0.18 : 0), X.contrast);
    const shadow = mix(base, mix(tone(M.shadow, k), T.shade, 0.3), X.contrast);
    const hz = hazeOf(depth);
    return { base: mix(base, haze, hz), light: mix(light, haze, hz), shadow: mix(shadow, haze, hz) };
  };
  const ink = (depth) => mix(mix(OUT, '#000000', 0), haze, hazeOf(depth) * 0.85);
  return { ...T, ...X, skyTop, skyBottom, haze, sunVisible, mat, ink };
}

const FOC = 900;
const CAM = 2.4;
const Z0 = (CAM * FOC) / (H - HOR);
const ROAD = 1.6;
const yOf = (d) => HOR + d * (H - HOR);
const proj = ([X, Z]) => [W / 2 + (FOC * X) / Z, HOR + (CAM * FOC) / Z];
const toWorld = (x, d) => [((x - W / 2) * Z0) / d / FOC, Z0 / d];
const wobble = (g, amp) => {
  const k = [0.7, 1.9, 4.3].map((q) => [q * (0.7 + g() * 0.6), g() * 7, amp / Math.sqrt(q * 3)]);
  return (s) => k.reduce((v, [q, ph, a]) => v + a * Math.sin(s * q + ph), 0);
};

function roadLine(seed) {
  const g = rng(seed);
  const ph = g() * 6;
  const bendAt = 24 + g() * 6;
  const pts = [];
  let X = 0.3;
  let Z = Z0 * 0.8;
  let bend = 0;
  for (let s = 0; s < 200; s += 0.25) {
    pts.push([X, Z, s]);
    if (proj([X, Z])[0] > W + 120) break;
    if (Z > bendAt) bend = Math.min(1.5, bend + 0.025);
    const a = 0.16 * Math.sin(s * 0.11 + ph) + bend;
    X += Math.sin(a) * 0.25;
    Z += Math.cos(a) * 0.25;
  }
  const nrm = pts.map((_, i) => {
    const [x0, z0] = pts[Math.max(0, i - 1)];
    const [x1, z1] = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(x1 - x0, z1 - z0);
    return [(z1 - z0) / l, -(x1 - x0) / l];
  });
  const at = (Zq) => {
    const i = pts.findIndex((p) => p[1] >= Zq);
    if (i <= 0) return pts[Math.max(0, i)][0];
    const [xa, za] = pts[i - 1];
    const [xb, zb] = pts[i];
    return xa + ((xb - xa) * (Zq - za)) / (zb - za);
  };
  const dist = (Xq, Zq) => Math.min(...pts.map(([x, z]) => Math.hypot(x - Xq, z - Zq)));
  return { pts, nrm, at, dist };
}
const pts = (a) => a.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
const poly = (a, fill, extra = '') => `<polygon points="${pts(a)}" fill="${fill}"${extra}/>`;
const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

function layout(seed) {
  const g = rng(seed);
  const road = roadLine(seed + 5);
  const items = [];
  const add = (kind, d, x) => items.push({ kind, d, x, base: yOf(d), h: 600 * d * (0.75 + 0.5 * g()), lean: (g() - 0.5) * 0.12, seed: Math.floor(g() * 1e9) });
  const scatter = (kind, n, d0, d1, x0, x1, margin) => {
    for (let i = 0; i < n; i++) {
      for (let tries = 0; tries < 40; tries++) {
        const d = d0 + g() * (d1 - d0);
        const x = x0 + g() * (x1 - x0);
        if (road.dist(...toWorld(x, d)) > ROAD + margin) {
          add(kind, d, x);
          break;
        }
      }
    }
  };
  const verge = (d, side, gap) => proj([road.at(Z0 / d) + side * (ROAD + gap), Z0 / d])[0];
  scatter('spruce', 170, 0.015, 0.125, -40, W + 40, 1);
  scatter('spruce', 84, 0.13, 0.45, -40, W + 40, 1.4);
  const roadside = (n, d0, d1, gap0, gap1) => {
    for (let i = 0; i < n; i++) {
      const d = d0 + g() * (d1 - d0);
      const X = road.at(Z0 / d) + (g() < 0.5 ? -1 : 1) * (ROAD + gap0 + g() * (gap1 - gap0));
      if (road.dist(X, Z0 / d) > ROAD + 1) add('spruce', d, proj([X, Z0 / d])[0]);
    }
  };
  roadside(36, 0.13, 0.4, 1.5, 7);
  roadside(4, 0.4, 0.55, 3, 8);
  road.pts.forEach(([X, Z], i) => {
    const [nx, nz] = road.nrm[i];
    if (i % 6 || nz > -0.6) return;
    const off = ROAD + 1.2 + g() * 2.5;
    const [Xt, Zt] = [X + nx * off, Z + nz * off];
    if (road.dist(Xt, Zt) > ROAD + 1) add('spruce', Z0 / Zt, proj([Xt, Zt])[0]);
  });
  scatter('spruce', 2, 0.6, 1.05, -60, 260, 2.5);
  scatter('spruce', 2, 0.6, 1.05, W - 260, W + 60, 2.5);
  scatter('birch', 3, 0.3, 0.7, 0, W / 2, 1.6);
  scatter('birch', 1, 0.35, 0.55, W / 2, W, 1.6);
  for (const [side, d] of [[-1, 0.8 + g() * 0.1], [-1, 0.55 + g() * 0.1], [1, 0.68 + g() * 0.15]]) add('stone', d, verge(d, side, 0.5 + g() * 0.5));
  const tufts = [];
  for (let i = 0; i < 26; i++) {
    const d = 0.25 + g() * 0.8;
    tufts.push({ d, x: verge(d, g() < 0.5 ? -1 : 1, (g() - 0.3) * 0.5), y: yOf(d), s: d * (0.7 + g() * 0.6), seed: Math.floor(g() * 1e9) });
  }
  for (let i = 0; i < 10; i++) {
    const Zq = Z0 * (1.0 + g() * 1.6);
    const d = Z0 / Zq;
    tufts.push({ d, x: proj([road.at(Zq) + (g() - 0.5) * 0.4, Zq])[0], y: yOf(d), s: d * (0.55 + g() * 0.35), seed: Math.floor(g() * 1e9), ridge: true });
  }
  for (let i = 0; i < 10; i++) tufts.push({ d: 1.05, x: g() < 0.5 ? g() * 260 : W - g() * 300, y: H + 6, s: 1.4 + g() * 0.8, seed: Math.floor(g() * 1e9) });
  const lines = [0, 1].map((k) => {
    let x = -20;
    const out = [];
    while (x < W + 20) {
      const w = 7 + g() * 10;
      out.push([x, w, 0.5 + g() * 0.6, g()]);
      x += w;
    }
    return out;
  });
  return { items: items.sort((a, b) => a.d - b.d), tufts: tufts.sort((a, b) => a.d - b.d), lines, road };
}

function spruce(t, L) {
  const { x, base, h, d } = t;
  const M = L.mat(MAT.spruce, d);
  const S = L.mat(MAT.snow, d);
  const tr = L.mat(MAT.trunk, d);
  const sw = d < 0.07 ? 0 : Math.min(3, 0.5 + h / 170);
  const stroke = sw ? ` stroke="${L.ink(d)}" stroke-width="${f(sw)}" stroke-linejoin="round"` : '';
  const w = h * 0.44;
  const small = h < 45;
  const tiers = small ? 3 : 6;
  const teeth = small ? 2 : 6;
  const half = teeth / 2;
  let s = '';
  if (!small) s += `<rect x="${f(x - h * 0.025)}" y="${f(base - h * 0.14)}" width="${f(h * 0.05)}" height="${f(h * 0.14)}" fill="${tr.shadow}"${stroke}/>`;
  for (let i = 0; i < tiers; i++) {
    const k = i / tiers;
    const yb = base - h * 0.08 - k * h * 0.8;
    const th = ((h * 0.8) / tiers) * 1.9;
    const hw = (w / 2) * (1 - k * 0.82);
    const apex = [x, yb - th];
    const bottom = [];
    for (let j = 0; j <= teeth; j++) {
      const edge = Math.abs(j - half) / half;
      bottom.push([x - hw + (2 * hw * j) / teeth, yb + (j % 2 ? -0.35 : 1) * th * 0.1 + edge * th * 0.12]);
    }
    const lit = L.dir > 0 ? [apex, ...bottom.slice(0, half + 1)] : [apex, ...bottom.slice(half)];
    s += poly([apex, ...bottom], M.shadow) + poly(lit, M.base);
    const tip = L.dir > 0 ? bottom[0] : bottom[teeth];
    if (!small) s += `<path d="M${f(apex[0])},${f(apex[1])} L${f(tip[0])},${f(tip[1])}" stroke="${M.light}" stroke-width="${f(Math.max(0.6, hw * 0.07))}"/>`;
    if (L.snow) {
      const l = lerp(apex, bottom[0], 0.55);
      const rr = lerp(apex, bottom[teeth], 0.55);
      const cap = [l];
      for (let j = 1; j < 4; j++) {
        const p = lerp(l, rr, j / 4);
        cap.push([p[0], p[1] + (j % 2 ? th * 0.1 : -th * 0.03)]);
      }
      cap.push(rr);
      const litCap = cap.filter((p) => (L.dir > 0 ? p[0] <= x + 0.1 : p[0] >= x - 0.1));
      s += poly([apex, ...cap], S.shadow) + poly([apex, ...litCap, [x, (l[1] + rr[1]) / 2 + th * 0.06]], S.base);
    }
    if (sw) s += poly([apex, ...bottom], 'none', stroke);
  }
  return s;
}

function birch(t, L, K) {
  const { x, base, h, d } = t;
  const r = rng(t.seed);
  const B = L.mat(MAT.bark, d);
  const sw = Math.min(2.6, 0.5 + h / 200);
  const tw = h * 0.032;
  const lean = t.lean * h;
  const top = [x + lean, base - h * 0.86];
  const trunk = `M${f(x - tw)},${f(base)} Q${f(x - tw * 0.9 + lean * 0.4)},${f(base - h * 0.5)} ${f(top[0] - tw * 0.35)},${f(top[1])} L${f(top[0] + tw * 0.35)},${f(top[1])} Q${f(x + tw * 0.9 + lean * 0.4)},${f(base - h * 0.5)} ${f(x + tw)},${f(base)} Z`;
  let marks = '';
  for (let k = 0; k < 14; k++) {
    const u = 0.05 + k * 0.065 + r() * 0.03;
    const cx = x + lean * u * u;
    const wid = tw * (1 - 0.65 * u);
    const y = base - h * u;
    marks += `<path d="M${f(cx - wid + r() * wid)},${f(y)} l${f(wid * (0.4 + r() * 0.8))},${f((r() - 0.5) * 2)}" stroke="#211b18" stroke-width="${f(0.8 + h * 0.006)}" stroke-linecap="round"/>`;
  }
  const crown = Array.from({ length: 22 }, () => {
    const a = r() * 2 * Math.PI;
    const u = Math.sqrt(r());
    return [x + lean * 0.85 + Math.cos(a) * u * h * 0.16, base - h * 0.66 + Math.sin(a) * u * h * 0.27, h * (0.04 + r() * 0.035)];
  });
  const branches = Array.from({ length: 12 }, (_, k) => {
    const u = 0.42 + k * 0.037;
    const side = k % 2 ? 1 : -1;
    return [x + lean * u * u, base - h * u, side * h * (0.07 + r() * 0.08), -h * (0.04 + r() * 0.1)];
  });
  let s = '';
  if (L.snow) {
    const tw2 = L.mat(MAT.twigs, d);
    s += `<ellipse cx="${f(x + lean * 0.85)}" cy="${f(base - h * 0.72)}" rx="${f(h * 0.17)}" ry="${f(h * 0.25)}" fill="${tw2.base}" opacity="0.22"/>`;
    s += branches.map(([bx, by, dx, dy]) => `<path d="M${f(bx)},${f(by)} q${f(dx * 0.3)},${f(dy * 0.6)} ${f(dx)},${f(dy)}" fill="none" stroke="${tw2.shadow}" stroke-width="${f(Math.max(0.8, h * 0.008))}" stroke-linecap="round"/>`).join('');
  }
  s += K.shaded(trunk, B, { sx: L.dir * tw * 0.9, sy: 0, hx: 0, hy: 0, sw, inner: marks });
  if (!L.snow) {
    const F = L.mat(MAT.leaves, d);
    const circles = crown.map(([cx, cy, rad]) => `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(rad)}"/>`).join('');
    const id = K.id('crown');
    K.defs.push(`<clipPath id="${id}">${circles}</clipPath>`);
    s += `<g fill="none" stroke="${L.ink(d)}" stroke-width="${f(sw * 2)}">${circles}</g>`;
    s += `<g clip-path="url(#${id})"><rect x="${f(x - h)}" y="${f(base - 2 * h)}" width="${f(2 * h)}" height="${f(2 * h)}" fill="${F.shadow}"/><g fill="${F.base}" transform="translate(${f(-L.dir * h * 0.035)} ${f(-h * 0.045)})">${circles}</g><g fill="${F.light}" opacity="0.75" transform="translate(${f(-L.dir * h * 0.07)} ${f(-h * 0.085)})">${circles}</g></g>`;
  }
  return s;
}

function stone(t, L, K) {
  const r = rng(t.seed);
  const s0 = 26 * t.d * (0.7 + r() * 0.6);
  const n = 9;
  const p = Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const rad = s0 * (0.8 + r() * 0.35);
    return [t.x + Math.cos(a) * rad * 1.3, t.base - s0 * 0.45 + Math.sin(a) * rad * (Math.sin(a) > 0 ? 0.45 : 0.9)];
  });
  const d = `M${p.map(([x, y]) => `${f(x)},${f(y)}`).join(' L')} Z`;
  let s = K.shaded(d, L.mat(MAT.stone, t.d), { sx: L.dir * s0 * 0.5, sy: s0 * 0.25, hx: 0, hy: 0, sw: 2 });
  if (L.snow) s += `<path d="M${f(t.x - s0 * 1.1)},${f(t.base - s0 * 0.9)} Q${f(t.x)},${f(t.base - s0 * 1.5)} ${f(t.x + s0 * 1.1)},${f(t.base - s0 * 0.9)} Q${f(t.x)},${f(t.base - s0 * 0.6)} ${f(t.x - s0 * 1.1)},${f(t.base - s0 * 0.9)} Z" fill="${L.mat(MAT.snow, t.d).base}" stroke="${OUT}" stroke-width="1.5"/>`;
  return s;
}

function tuft(t, L) {
  if (t.ridge && L.snow) return '';
  const r = rng(t.seed);
  const M = L.mat(L.snow ? { base: '#9a8460', light: '#b8a27a', shadow: '#6e5c40' } : MAT.grass, t.d);
  const n = 7;
  let s = '';
  for (let i = 0; i < n; i++) {
    const bx = t.x + (i - n / 2) * 4 * t.s;
    const hgt = (24 + r() * 30) * t.s;
    const lean = (i - n / 2) * 4 * t.s + (r() - 0.5) * 10 * t.s;
    const tip = [bx + lean, t.y - hgt];
    const blade = [[bx - 2.6 * t.s, t.y], tip, [bx + 2.6 * t.s, t.y]];
    const lit = (L.dir > 0) === lean < 0;
    s += poly(blade, lit ? M.light : M.base, ` stroke="${L.ink(t.d)}" stroke-width="${f(Math.max(0.5, t.s))}" stroke-linejoin="round"`);
  }
  if (L.snow) s = `<ellipse cx="${f(t.x)}" cy="${f(t.y)}" rx="${f(26 * t.s)}" ry="${f(7 * t.s)}" fill="${L.mat(MAT.snow, t.d).light}"/>` + s;
  return s;
}

function cumulus(K, L, cx, cy, s, r) {
  const circles = Array.from({ length: 7 }, (_, i) => {
    const a = i / 6;
    return [cx + (a - 0.5) * s * 2.2 + (r() - 0.5) * s * 0.3, cy - Math.sin(a * Math.PI) * s * 0.5 + (r() - 0.5) * s * 0.2, s * (0.35 + Math.sin(a * Math.PI) * 0.35 + r() * 0.1)];
  });
  const cs = circles.map(([x, y, rad]) => `<circle cx="${f(x)}" cy="${f(y)}" r="${f(rad)}"/>`).join('');
  const a = K.id('cu');
  const b = K.id('cb');
  K.defs.push(`<clipPath id="${a}">${cs}</clipPath><clipPath id="${b}"><rect x="${f(cx - 3 * s)}" y="${f(cy - 3 * s)}" width="${f(6 * s)}" height="${f(3.25 * s)}"/></clipPath>`);
  const C = L.mat(L.moon ? { base: '#7d879c', light: '#b8c2d8', shadow: '#4a5266' } : MAT.cloud, 0.75);
  return `<g clip-path="url(#${a})"><g clip-path="url(#${b})"><rect x="${f(cx - 3 * s)}" y="${f(cy - 3 * s)}" width="${f(6 * s)}" height="${f(6 * s)}" fill="${C.shadow}"/><g fill="${C.base}" transform="translate(${f(-L.dir * s * 0.12)} ${f(-s * 0.2)})">${cs}</g><g fill="${C.light}" opacity="0.85" transform="translate(${f(-L.dir * s * 0.24)} ${f(-s * 0.36)})">${cs}</g></g></g>`;
}

function stratus(L, r) {
  const C = L.mat(L.rain ? { base: '#9aa2ae', light: '#b9c0ca', shadow: '#6f7784' } : MAT.cloud, 0.55);
  let s = '';
  for (let row = 0; row < 6; row++) {
    const y = 30 + row * 52;
    for (let x = -100; x < W + 100; x += 180 + r() * 120) {
      const rx = 150 + r() * 110;
      const ry = 22 + r() * 16;
      s += `<ellipse cx="${f(x)}" cy="${f(y + ry * 0.35)}" rx="${f(rx)}" ry="${f(ry)}" fill="${C.shadow}" opacity="0.55"/><ellipse cx="${f(x - L.dir * 10)}" cy="${f(y)}" rx="${f(rx * 0.92)}" ry="${f(ry * 0.8)}" fill="${C.base}" opacity="0.5"/>`;
    }
  }
  return s;
}

export function renderLandscape(params = {}) {
  const P = { terrain: 'forest_road', time: 'day', weather: 'clear', seed: 1230, ...params };
  const L = lighting(P.time, P.weather);
  const K = kit();
  const geo = layout(P.seed);
  const fx = rng(P.seed * 7 + 3);
  const o = [];
  const defs = [];

  defs.push(`<linearGradient id="sky" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${L.skyTop}"/><stop offset="1" stop-color="${L.skyBottom}"/></linearGradient>`);
  defs.push(`<linearGradient id="fogband" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${L.haze}" stop-opacity="0"/><stop offset="0.5" stop-color="${L.haze}" stop-opacity="1"/><stop offset="1" stop-color="${L.haze}" stop-opacity="0"/></linearGradient>`);
  defs.push(`<radialGradient id="sunglow"><stop offset="0" stop-color="${L.sun}" stop-opacity="${L.sunVisible ? 0.75 : 0.3}"/><stop offset="1" stop-color="${L.sun}" stop-opacity="0"/></radialGradient>`);
  defs.push(`<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.2"/></filter>`);

  o.push(`<rect width="${W}" height="${HOR + 20}" fill="url(#sky)"/>`);
  const [sx, sy] = L.sunPos;
  if (L.moon && !L.cover) {
    for (let i = 0; i < 140; i++) o.push(`<circle cx="${f(fx() * W)}" cy="${f(fx() * HOR * 0.95)}" r="${f(0.5 + fx() * 1.2)}" fill="#fff" opacity="${f(0.3 + fx() * 0.7)}"/>`);
  }
  o.push(`<circle cx="${sx}" cy="${sy}" r="${L.moon ? 120 : 230}" fill="url(#sunglow)"/>`);
  if (L.sunVisible) {
    o.push(`<circle cx="${sx}" cy="${sy}" r="${L.moon ? 26 : 34}" fill="${L.sun}"/>`);
    if (L.moon) o.push(`<circle cx="${sx - 8}" cy="${sy - 6}" r="6" fill="#9aa6c4" opacity="0.35"/><circle cx="${sx + 9}" cy="${sy + 7}" r="4" fill="#9aa6c4" opacity="0.3"/><circle cx="${sx + 4}" cy="${sy - 12}" r="3" fill="#9aa6c4" opacity="0.3"/>`);
  }
  if (L.cumulus) {
    const cr = rng(P.seed + 11);
    for (let i = 0; i < L.cumulus; i++) o.push(cumulus(K, L, 80 + i * 200 + (cr() - 0.5) * 80, 70 + cr() * 150, 40 + cr() * 45, cr));
  }
  if (L.stratus) o.push(stratus(L, rng(P.seed + 13)));

  geo.lines.forEach((line, k) => {
    const depth = k * 0.05;
    const amp = k ? 30 : 46;
    let path = `M-20,${HOR + 6}`;
    for (const [x, w, a, j] of line) path += ` L${f(x + w / 2)},${f(HOR + 4 - amp * a)} L${f(x + w)},${f(HOR + 4 - amp * 0.18 * j)}`;
    path += ` L${W + 20},${HOR + 6} Z`;
    o.push(`<path d="${path}" fill="${L.mat(MAT.spruce, depth).shadow}"/>`);
    if (L.snow) o.push(`<path d="${path}" fill="${L.mat(MAT.snow, depth).shadow}" opacity="0.35"/>`);
    if (k === 0) o.push(`<rect x="0" y="${HOR - 70}" width="${W}" height="110" fill="url(#fogband)" opacity="${L.fog ? 0.9 : 0.35}"/>`);
  });

  const depthGrad = (id, colorAt) => defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="${HOR}" y2="${H}">${[0, 0.05, 0.12, 0.25, 0.45, 0.7, 1].map((d) => `<stop offset="${d}" stop-color="${colorAt(d)}"/>`).join('')}</linearGradient>`);
  const GM = L.snow ? MAT.snow : MAT.grass;
  depthGrad('ground', (d) => L.mat(GM, d).base);
  o.push(`<rect y="${HOR + 2}" width="${W}" height="${H - HOR}" fill="url(#ground)"/>`);
  const gp = rng(P.seed + 17);
  for (let i = 0; i < 18; i++) {
    const d = 0.15 + gp() * 0.9;
    o.push(`<ellipse cx="${f(gp() * W)}" cy="${f(yOf(d))}" rx="${f(60 + 160 * d)}" ry="${f(6 + 22 * d)}" fill="${L.mat(GM, d)[gp() < 0.5 ? 'shadow' : 'light']}" opacity="0.45"/>`);
  }

  const RM = L.snow ? { base: mix(MAT.snow.base, MAT.road.base, 0.1), light: MAT.snow.light, shadow: mix(MAT.snow.shadow, MAT.road.shadow, 0.2), snowy: true } : MAT.road;
  const RUT = L.snow ? { base: mix(MAT.snow.shadow, MAT.road.base, 0.45), light: MAT.snow.base, shadow: MAT.road.shadow } : { base: mix(MAT.road.base, MAT.road.shadow, 0.6), light: MAT.road.base, shadow: MAT.road.shadow };
  const wet = (c) => (L.rain ? mix(c, '#000000', 0.22) : c);
  depthGrad('roadBase', (d) => wet(L.mat(RM, d).base));
  depthGrad('roadBank', (d) => wet(mix(L.mat(RM, d).base, L.mat(RM, d).shadow, 0.75)));
  depthGrad('rut', (d) => wet(L.rain ? mix(L.mat(RUT, d).base, '#000000', 0.12) : L.mat(RUT, d).base));
  const { pts, nrm } = geo.road;
  const at = (i, o) => proj([pts[i][0] + nrm[i][0] * o, pts[i][1] + nrm[i][1] * o]);
  const strip = (o1, o2, i0 = 0, i1 = pts.length - 1) => {
    const a = [];
    const b = [];
    for (let i = i0; i <= i1; i++) {
      a.push(at(i, o1(pts[i][2])));
      b.push(at(i, o2(pts[i][2])));
    }
    return [...a, ...b.reverse()];
  };
  const rr = rng(P.seed + 19);
  const eL = wobble(rr, 0.12);
  const eR = wobble(rr, 0.12);
  const edge = (side) => (s) => side * ROAD + (side < 0 ? eL(s) : eR(s));
  o.push(poly(strip(edge(-1), edge(1)), 'url(#roadBase)'));
  const bw = wobble(rr, 0.08);
  const bank = edge(-L.dir);
  o.push(poly(strip(bank, (s) => bank(s) + L.dir * (0.3 + bw(s))), 'url(#roadBank)', ` opacity="${f(0.3 + 0.7 * L.contrast)}"`));
  for (const c of [-0.7, 0.7]) {
    const a = wobble(rr, 0.05);
    const b = wobble(rr, 0.05);
    const lo = (s) => c - 0.17 + a(s);
    const hi = (s) => c + 0.17 + b(s);
    o.push(poly(strip(lo, hi), 'url(#rut)'));
  }
  if (!L.snow) {
    const ridge = wobble(rr, 0.1);
    for (let i = 0; i < pts.length && pts[i][1] < 24; ) {
      const len = 4 + Math.floor(rr() * 12);
      const j = Math.min(i + len, pts.length - 1);
      const [s0, s1] = [pts[i][2], pts[j][2]];
      const tw = (s) => Math.sqrt(Math.sin((Math.PI * (s - s0)) / (s1 - s0)));
      if (rr() < 0.55) o.push(poly(strip((s) => ridge(s) - 0.24 * tw(s), (s) => ridge(s) + 0.2 * tw(s), i, j), 'url(#ground)'));
      i += len + 2 + Math.floor(rr() * 8);
    }
  }
  for (const side of [-1, 1]) {
    const e = edge(side);
    const outer = [];
    const inner = [];
    pts.forEach(([, , s], i) => {
      outer.push(at(i, e(s) + side * 0.5));
      inner.push(at(i, e(s) - side * (i % 2 ? 0.04 + rr() * 0.2 : 0)));
    });
    o.push(poly([...outer, ...inner.reverse()], 'url(#ground)'));
  }
  if (!L.snow) {
    const pb = rng(P.seed + 27);
    for (let n = 0; n < 30; n++) {
      const i = Math.floor(pb() * pts.length);
      const Z = pts[i][1];
      const off = (pb() - 0.5) * 2.8;
      const rad = (FOC * (0.04 + pb() * 0.05)) / Z;
      if (Z > 14) continue;
      const [px, py] = at(i, off);
      const M = L.mat(MAT.stone, Z0 / Z);
      o.push(`<ellipse cx="${f(px)}" cy="${f(py)}" rx="${f(rad)}" ry="${f(rad * 0.55)}" fill="${M.shadow}"/><ellipse cx="${f(px - L.dir * rad * 0.2)}" cy="${f(py - rad * 0.18)}" rx="${f(rad * 0.75)}" ry="${f(rad * 0.38)}" fill="${M.base}"/>`);
    }
  }
  if (L.rain) {
    const pr = rng(P.seed + 23);
    const sky = mix(L.skyBottom, L.skyTop, 0.35);
    for (const [Zc, c] of [[6.5 + pr() * 2, -0.6], [10 + pr() * 3, 0.55], [14 + pr() * 4, -0.5], [8.5 + pr() * 2, 0.6]]) {
      const i = pts.findIndex((q) => q[1] >= Zc);
      const [X, Z] = pts[i];
      const [nx, nz] = nrm[i];
      const len = 0.35 + pr() * 0.35;
      const wid = 0.3 + pr() * 0.2;
      const ph = pr() * 6;
      const ring = (k, dl) => Array.from({ length: 24 }, (_, n) => {
        const t = (n / 24) * Math.PI * 2;
        const r = k * (1 + 0.16 * Math.sin(3 * t + ph) + 0.08 * Math.sin(5 * t + 2 * ph));
        const al = dl + Math.cos(t) * len * r;
        const ac = c + Math.sin(t) * wid * r;
        return proj([X - nz * al + nx * ac, Z + nx * al + nz * ac]);
      });
      o.push(poly(ring(1, 0), sky, ` stroke="${wet(L.mat(RUT, Z0 / Z).shadow)}" stroke-width="2" stroke-linejoin="round"`));
      for (const [u, k] of [[0.3, 0.5], [0.05, 0.3]]) {
        const [xa, ya] = proj([X - nz * len * u + nx * (c - wid * k), Z + nx * len * u + nz * (c - wid * k)]);
        const [xb, yb] = proj([X - nz * len * u + nx * (c + wid * k * 0.4), Z + nx * len * u + nz * (c + wid * k * 0.4)]);
        o.push(`<path d="M${f(xa)},${f(ya)} L${f(xb)},${f(yb)}" stroke="${mix(sky, '#ffffff', 0.45)}" stroke-width="${f(Math.max(1, 14 / Z))}" stroke-linecap="round"/>`);
      }
    }
  }


  if (L.sunVisible) {
    for (const t of geo.items) {
      if (t.d < 0.06 || t.kind === 'stone') continue;
      const len = t.h * L.shadowLen * 0.5;
      o.push(`<ellipse cx="${f(t.x + L.dir * len)}" cy="${f(t.base + 1)}" rx="${f(len + t.h * 0.06)}" ry="${f(2 + t.h * 0.018)}" fill="${L.shade}" opacity="${f(0.2 * L.contrast)}"/>`);
    }
  }

  let fogMid = false;
  let ti = 0;
  for (const t of geo.items) {
    if (L.fog && !fogMid && t.d > 0.2) {
      o.push(`<rect x="0" y="${HOR - 60}" width="${W}" height="260" fill="url(#fogband)" opacity="0.75"/>`);
      fogMid = true;
    }
    while (ti < geo.tufts.length && geo.tufts[ti].d <= t.d) o.push(tuft(geo.tufts[ti++], L));
    o.push(t.kind === 'spruce' ? spruce(t, L) : t.kind === 'birch' ? birch(t, L, K) : stone(t, L, K));
  }
  while (ti < geo.tufts.length) o.push(tuft(geo.tufts[ti++], L));

  if (L.fog) o.push(`<rect x="0" y="${H - 260}" width="${W}" height="420" fill="url(#fogband)" opacity="0.35"/>`);
  if (L.rain) {
    const rr = rng(P.seed + 29);
    const c = mix('#dfe6f0', L.skyBottom, 0.3);
    let s = '';
    for (let i = 0; i < 420; i++) {
      const x = rr() * (W + 100) - 50;
      const y = rr() * (H + 40) - 40;
      const len = 18 + rr() * 26;
      s += `M${f(x)},${f(y)} l${f(-len * 0.22)},${f(len)} `;
    }
    o.push(`<rect width="${W}" height="${H}" fill="#0a1020" opacity="0.12"/><path d="${s}" stroke="${c}" stroke-width="1.2" opacity="0.4"/>`);
  }
  if (L.snow) {
    const sr = rng(P.seed + 31);
    let s = '';
    for (let i = 0; i < 320; i++) {
      const rad = 0.8 + Math.pow(sr(), 3) * 3.4;
      s += `<circle cx="${f(sr() * W)}" cy="${f(sr() * H)}" r="${f(rad)}"/>`;
    }
    o.push(`<g fill="#fff" opacity="${L.moon ? 0.6 : 0.9}">${s}</g>`);
  }
  o.push(`<radialGradient id="vig" cx="0.5" cy="0.45" r="0.75"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${L.moon ? 0.5 : 0.25}"/></radialGradient><rect width="${W}" height="${H}" fill="url(#vig)"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defs.join('')}${K.defs.join('')}</defs>${o.join('')}</svg>`;
}

export const LANDSCAPE_TIMES = Object.keys(TIMES);
export const LANDSCAPE_WEATHER = Object.keys(WEATHER);
