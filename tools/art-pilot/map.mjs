import { OUT, mix, f, rng } from './warrior.mjs';

const C = 25;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const WOOD = { light: '#b07a4c', base: '#8a5e3a', shadow: '#5e3e26' };
const DOME = { light: '#c4bdae', shadow: '#857e70' };

const SEASONS = {
  summer: {
    ground: '#8db255', blotch: ['#9cc062', '#7da449'],
    floor: '#56853c', floorEdge: '#2f5426',
    fields: [['#e0c060', '#c29a40'], ['#b3c95e', '#93ab48'], ['#b08a5c', '#8d6a42']],
    swamp: '#7f8c4c', reed: '#4d5a2c',
    water: '#4f90c4', deep: '#3a73a8', shine: '#a6d2ee', shore: '#1f3f66',
    road: '#d6b47a', roadEdge: '#6b4a2a', earth: '#c4a77a',
    spruce: { light: '#5a9058', base: '#2f5c3c', shadow: '#1b3a2c' },
    leaves: { light: '#c2d866', base: '#8aab3c', shadow: '#5a7a2c' },
    roof: { light: '#a8916c', shadow: '#6e5c46' },
    shadow: ['#1d2a1a', 0.28], paper: '#f6efd9', balk: '#5f4a2c'
  },
  winter: {
    ground: '#e6edf5', blotch: ['#f7fafd', '#d2ddeb'],
    floor: '#d2deeb', floorEdge: '#7d91ad',
    fields: [['#eff4f9', '#c6d2e2'], ['#e9eff6', '#c1cddd'], ['#f2f6fa', '#cad6e4']],
    swamp: '#cbd6df', reed: '#7a6a50',
    water: '#c3dcee', deep: '#aecbe3', shine: '#ffffff', shore: '#4f6f92',
    road: '#c9bba6', roadEdge: '#6b5a48', earth: '#dcd6cd',
    spruce: { light: '#4f8057', base: '#2c5440', shadow: '#1a3630' },
    leaves: null,
    roof: { light: '#f6f9fd', shadow: '#b6c5da' },
    shadow: ['#5d6f8c', 0.3], paper: '#ffffff', balk: '#aebbcc'
  }
};

const hash = (a, b, s = 0) => {
  let h = (a * 374761393 + b * 668265263 + s * 974634257) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const pts = (a) => a.map(([x, y]) => `${f(x)},${f(y)}`).join(' ');
const poly = (a, fill, extra = '') => `<polygon points="${pts(a)}" fill="${fill}"${extra}/>`;
const ink = (w) => ` stroke="${OUT}" stroke-width="${w}" stroke-linejoin="round"`;
const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];

function spruceSym(id, S, narrow) {
  const P = S.spruce;
  let s = `<rect x="-1.3" y="-3.5" width="2.6" height="3.5" fill="${WOOD.shadow}"${ink(0.8)}/>`;
  for (let i = 0; i < 3; i++) {
    const yb = -2.5 - i * 6.2;
    const hw = (8.2 - i * 2.3) * narrow;
    const apex = [0, yb - 10.5 + i * 0.6];
    const bottom = [0, 1, 2, 3, 4].map((j) => [-hw + (2 * hw * j) / 4, yb + (j % 2 ? -1.6 : 0)]);
    s += poly([apex, ...bottom], P.shadow) + poly([apex, ...bottom.slice(0, 3)], P.base);
    s += `<path d="M${f(apex[0])},${f(apex[1])} L${f(bottom[0][0])},${f(bottom[0][1])}" stroke="${P.light}" stroke-width="0.9"/>`;
    if (S === SEASONS.winter) {
      const l = lerp(apex, bottom[0], 0.5);
      const r = lerp(apex, bottom[4], 0.5);
      const cap = [l, [lerp(l, r, 0.25)[0], l[1] + 1.2], [lerp(l, r, 0.5)[0], l[1] - 0.4], [lerp(l, r, 0.75)[0], l[1] + 1.2], r];
      s += poly([apex, ...cap], '#b9c8dc') + poly([apex, ...cap.slice(0, 3)], '#f4f8fc');
    }
    s += poly([apex, ...bottom], 'none', ink(0.9));
  }
  return `<g id="${id}">${s}</g>`;
}

function birchSym(id, S) {
  let s = `<path d="M-1,0 L-0.7,-13 L0.7,-13 L1,0 Z" fill="#f2efe6"${ink(0.8)}/><path d="M-0.9,-4 h1.2 M-0.2,-8 h1 M-0.8,-11 h0.9" stroke="${OUT}" stroke-width="0.7"/>`;
  if (!S.leaves) {
    s += `<ellipse cx="0" cy="-16" rx="6" ry="6.5" fill="#6a5050" opacity="0.25"/><path d="M0,-12 L-4,-19 M0,-13 L3.5,-20 M0,-15 L0,-22 M-2,-16 L-5,-15 M2,-17 L5,-16" stroke="#5a4444" stroke-width="0.8" stroke-linecap="round"/>`;
    return `<g id="${id}">${s}</g>`;
  }
  const P = S.leaves;
  const crown = [[-3, -14, 4.2], [2.6, -15.4, 4.4], [-0.2, -19.4, 4.2]];
  const circles = (dx, dy, k) => crown.map(([x, y, r]) => `<circle cx="${f(x + dx)}" cy="${f(y + dy)}" r="${f(r * k)}"/>`).join('');
  s += `<g fill="none" stroke="${OUT}" stroke-width="1.8">${circles(0, 0, 1)}</g><g fill="${P.shadow}">${circles(0, 0, 1)}</g><g fill="${P.base}">${circles(-0.9, -0.9, 0.78)}</g><g fill="${P.light}">${circles(-1.8, -1.8, 0.38)}</g>`;
  return `<g id="${id}">${s}</g>`;
}

function izbaSym(id, S) {
  const R = S.roof;
  const front = [[-5, 0], [5, 0], [5, -7], [0, -12], [-5, -7]];
  return `<g id="${id}">${poly([[5, 0], [10, -3], [10, -10], [5, -7]], WOOD.shadow, ink(0.9))}${poly(front, WOOD.base, ink(0.9))}<path d="M-5,-2.3 H5 M-5,-4.6 H5" stroke="${WOOD.shadow}" stroke-width="0.6"/><rect x="-1.5" y="-5.4" width="3" height="2.4" fill="#2a1c12" stroke="${WOOD.light}" stroke-width="0.6"/>${poly([[-6, -6.4], [0, -12.6], [5, -15.6], [-1, -9.4]], R.light, ink(0.9))}${poly([[0, -12.6], [5, -15.6], [11, -9.4], [6, -6.4]], R.shadow, ink(0.9))}<path d="M-6,-6.4 L0,-12.6 L6,-6.4" fill="none" stroke="${OUT}" stroke-width="2.2" stroke-linejoin="round"/><path d="M-6,-6.4 L0,-12.6 L6,-6.4" fill="none" stroke="${WOOD.light}" stroke-width="1" stroke-linejoin="round"/></g>`;
}

function churchSym(id, S) {
  const R = S.roof;
  const dome = 'M-2.4,-18.5 C-2.8,-22 -0.2,-23 1,-26.5 C2.2,-23 4.8,-22 4.4,-18.5 Z';
  return `<g id="${id}">${poly([[5.5, 0], [9.5, -2.5], [9.5, -13.5], [5.5, -11]], WOOD.shadow, ink(0.9))}${poly([[-5.5, 0], [5.5, 0], [5.5, -11], [-5.5, -11]], WOOD.base, ink(0.9))}<rect x="-1.6" y="-6" width="3.2" height="6" fill="#2a1c12" stroke="${WOOD.light}" stroke-width="0.6"/>${poly([[-5.5, -11], [5.5, -11], [9.5, -13.5], [-1.5, -13.5]], R.light, ink(0.9))}${poly([[2.6, -12.3], [4.4, -13.4], [4.4, -19], [2.6, -18]], WOOD.shadow, ink(0.8))}${poly([[-2.2, -12.3], [2.6, -12.3], [2.6, -18], [-2.2, -18]], WOOD.base, ink(0.8))}<path d="${dome}" fill="${DOME.shadow}"/><path d="M-2.4,-18.5 C-2.8,-22 -0.2,-23 1,-26.5 L1,-18.5 Z" fill="${DOME.light}"/><path d="${dome}" fill="none"${ink(0.9)}/><path d="M1,-26.5 V-31 M-0.6,-29.4 H2.6" stroke="${OUT}" stroke-width="1"/></g>`;
}

function towerSym(id, S) {
  const R = S.roof;
  return `<g id="${id}">${poly([[4, 0], [7, -2], [7, -14], [4, -12]], WOOD.shadow, ink(0.9))}${poly([[-4, 0], [4, 0], [4, -12], [-4, -12]], WOOD.base, ink(0.9))}<path d="M-4,-3 H4 M-4,-6 H4 M-4,-9 H4" stroke="${WOOD.shadow}" stroke-width="0.6"/><rect x="-1" y="-10" width="2" height="2.4" fill="#2a1c12"/>${poly([[-5, -11.5], [5, -11.5], [1.5, -20]], R.light, ink(0.9))}${poly([[5, -11.5], [8, -13.5], [1.5, -20]], R.shadow, ink(0.9))}</g>`;
}

const GOO = '<filter id="goo" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="5"/><feComponentTransfer><feFuncA type="linear" slope="24" intercept="-11"/></feComponentTransfer></filter>';

function circles(list, r, salt, grow = 0) {
  return list.map(([x, y]) => `<circle cx="${f((x + 0.5 + (hash(x, y, salt) - 0.5) * 0.2) * C)}" cy="${f((y + 0.5 + (hash(y, x, salt) - 0.5) * 0.2) * C)}" r="${f(r * C * (0.92 + hash(x, y, salt + 1) * 0.16) + grow)}"/>`).join('');
}

function blob(list, r, fill, edge, sw, salt) {
  const edgeLayer = edge ? `<g fill="${edge}" filter="url(#goo)">${circles(list, r, salt, sw)}</g>` : '';
  return `${edgeLayer}<g fill="${fill}" filter="url(#goo)">${circles(list, r, salt)}</g>`;
}

function network(T, W, H, isPart, joins, salt) {
  const mid = (x, y, dx, dy) => {
    const j = (hash(2 * x + dx, 2 * y + dy, salt) - 0.5) * 0.36 * C;
    return [(x + 0.5 + dx / 2) * C + (dy ? j : 0), (y + 0.5 + dy / 2) * C + (dx ? j : 0)];
  };
  let d = '';
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!isPart(T(x, y))) continue;
      const c = [(x + 0.5 + (hash(x, y, salt + 3) - 0.5) * 0.3) * C, (y + 0.5 + (hash(y, x, salt + 3) - 0.5) * 0.3) * C];
      const links = DIRS.filter(([dx, dy]) => joins(T(x + dx, y + dy)));
      if (links.length === 1) {
        const edges = DIRS.filter(([dx, dy]) => T(x + dx, y + dy) === null);
        const out = edges.find(([dx, dy]) => dx === -links[0][0] && dy === -links[0][1]) ?? edges[0];
        if (out) links.push(out);
      }
      const m = links.map(([dx, dy]) => mid(x, y, dx, dy));
      if (m.length === 2) d += `M${f(m[0][0])},${f(m[0][1])} Q${f(c[0])},${f(c[1])} ${f(m[1][0])},${f(m[1][1])} `;
      else for (const p of m) d += `M${f(c[0])},${f(c[1])} L${f(p[0])},${f(p[1])} `;
    }
  }
  return d;
}

function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list) => {
    const out = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], q) <= 0) out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  return [...half(p), ...half([...p].reverse())];
}

export function renderMap(params) {
  const { map, season = 'summer', visibility = null, hero = null, npcs = [], seed = 1230 } = params;
  const S = SEASONS[season];
  const { width: GW, height: GH, cells } = map;
  const W = GW * C;
  const H = GH * C;
  const T = (x, y) => (x >= 0 && y >= 0 && x < GW && y < GH ? cells[y][x] : null);
  const all = (pred) => cells.flatMap((row, y) => row.flatMap((t, x) => (pred(t, x, y) ? [[x, y]] : [])));
  const r = rng(seed);
  const defs = [GOO, spruceSym('sp0', S, 1), spruceSym('sp1', S, 0.82), birchSym('bi0', S), izbaSym('iz0', S), churchSym('ch0', S), towerSym('tw0', S)];
  const w = [];

  w.push(`<rect width="${W}" height="${H}" fill="${S.ground}"/>`);
  for (let i = 0; i < 70; i++) w.push(`<ellipse cx="${f(r() * W)}" cy="${f(r() * H)}" rx="${f(20 + r() * 50)}" ry="${f(8 + r() * 18)}" fill="${S.blotch[i % 2]}" opacity="0.5"/>`);

  const town = all((t) => t === 'town');
  const townAll = all((t, x, y) => t === 'town' || (t === 'church' && DIRS.some(([dx, dy]) => T(x + dx, y + dy) === 'town')));
  w.push(blob(townAll, 0.8, S.earth, mix(S.earth, OUT, 0.35), 1.2, 7));

  const fieldOf = (x, y) => (T(x, y) === 'field' ? `${x >> 1},${y >> 1}` : null);
  let balks = '';
  for (const [x, y] of all((t) => t === 'field')) {
    const vertical = hash(x >> 1, y >> 1, 12) < 0.5;
    const n = 5;
    for (let i = 0; i < n; i++) {
      const strip = vertical ? x * n + i : y * n + i;
      const [base, line] = S.fields[Math.floor(hash(Math.floor(strip / 3), vertical ? y >> 1 : x >> 1, 11) * S.fields.length)];
      const u = (i * C) / n;
      const [sx, sy, sw, sh] = vertical ? [x * C + u, y * C, C / n, C] : [x * C, y * C + u, C, C / n];
      const mid = vertical ? `M${f(sx + sw / 2)},${sy} v${C}` : `M${sx},${f(sy + sh / 2)} h${C}`;
      w.push(`<rect x="${f(sx)}" y="${f(sy)}" width="${f(sw + 0.3)}" height="${f(sh + 0.3)}" fill="${base}"/><path d="${mid}" stroke="${line}" stroke-width="0.9" opacity="0.6"/>`);
    }
    for (const [dx, dy] of DIRS) {
      if (fieldOf(x + dx, y + dy) === fieldOf(x, y)) continue;
      const ax = (x + (dx > 0 ? 1 : 0)) * C;
      const ay = (y + (dy > 0 ? 1 : 0)) * C;
      balks += dx ? `M${ax},${y * C} v${C} ` : `M${x * C},${ay} h${C} `;
    }
  }
  w.push(`<path d="${balks}" stroke="${S.balk}" stroke-width="1.4" stroke-linecap="square"/>`);

  const swamp = all((t) => t === 'swamp');
  w.push(blob(swamp, 0.72, S.swamp, mix(S.swamp, OUT, 0.35), 1.2, 21));
  for (const [x, y] of swamp) {
    if (hash(x, y, 26) < 0.3) continue;
    const cx = (x + 0.1 + hash(x, y, 22) * 0.8) * C;
    const cy = (y + 0.15 + hash(x, y, 23) * 0.7) * C;
    w.push(`<ellipse cx="${f(cx)}" cy="${f(cy)}" rx="${f(4 + hash(x, y, 24) * 4)}" ry="${f(2 + hash(x, y, 25) * 1.6)}" fill="${S.water}" stroke="${S.shore}" stroke-width="0.9"/><path d="M${f(cx + 7)},${f(cy + 5)} l-1.5,-6 M${f(cx + 8.5)},${f(cy + 5)} l0.5,-7 M${f(cx + 10)},${f(cy + 5)} l2,-5.5" stroke="${S.reed}" stroke-width="1" stroke-linecap="round"/>`);
  }

  const forest = all((t) => t === 'forest');
  w.push(blob(forest, 0.8, S.floor, S.floorEdge, 1.4, 31));

  const lake = all((t) => t === 'lake');
  const isWater = (t) => t === 'river' || t === 'bridge';
  const riverD = network(T, GW, GH, isWater, (t) => isWater(t) || t === 'lake', 41);
  const rw = C * 0.62;
  w.push(`<g fill="${S.shore}" filter="url(#goo)">${circles(lake, 0.85, 42, 2.4)}</g><path d="${riverD}" fill="none" stroke="${S.shore}" stroke-width="${f(rw + 4.4)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  w.push(`<g fill="${S.water}" filter="url(#goo)">${circles(lake, 0.85, 42)}</g><path d="${riverD}" fill="none" stroke="${S.water}" stroke-width="${f(rw)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  const land = all((t) => t !== 'lake');
  const shoreDist = (x, y) => Math.min(3, ...land.filter(([a, b]) => Math.abs(a - x) < 3 && Math.abs(b - y) < 3).map(([a, b]) => Math.hypot(a - x, b - y)));
  const deep = lake.filter(([x, y]) => shoreDist(x, y) >= 2.2);
  w.push(blob(deep, 0.85, S.deep, null, 0, 43));
  for (const [x, y] of all((t) => t === 'river')) {
    if (hash(x, y, 45) > 0.3) continue;
    const cx = (x + 0.35 + hash(x, y, 46) * 0.3) * C;
    const cy = (y + 0.35 + hash(y, x, 46) * 0.3) * C;
    w.push(season === 'winter'
      ? `<path d="M${f(cx - 4)},${f(cy - 1)} l3,2 l3,-2" fill="none" stroke="${S.shore}" stroke-width="0.7" opacity="0.5"/>`
      : `<path d="M${f(cx - 4)},${f(cy)} q2,-2 4,0 q2,2 4,0" fill="none" stroke="${S.shine}" stroke-width="1.1" stroke-linecap="round" opacity="0.85"/>`);
  }
  for (const [x, y] of deep.filter(([x, y]) => hash(x, y, 44) < 0.35)) {
    const cx = (x + 0.5) * C;
    const cy = (y + 0.5) * C;
    w.push(season === 'winter'
      ? `<path d="M${f(cx - 8)},${f(cy - 2)} l5,3 l4,-4 l6,2" fill="none" stroke="${S.shore}" stroke-width="0.8" opacity="0.5"/>`
      : `<path d="M${f(cx - 6)},${f(cy)} q3,-3 6,0 q3,3 6,0" fill="none" stroke="${S.shine}" stroke-width="1.2" stroke-linecap="round" opacity="0.8"/>`);
  }

  const isRoad = (t) => t === 'road' || t === 'bridge';
  const roadD = network(T, GW, GH, isRoad, (t) => isRoad(t) || t === 'town', 51);
  w.push(`<path d="${roadD}" fill="none" stroke="${S.roadEdge}" stroke-width="5.4" stroke-linecap="round" stroke-linejoin="round"/><path d="${roadD}" fill="none" stroke="${S.road}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`);
  for (const [x, y] of all((t) => t === 'bridge')) {
    const across = isRoad(T(x - 1, y)) || isRoad(T(x + 1, y));
    const [lw, lh] = across ? [C * 1.2, 8] : [8, C * 1.2];
    const cx = (x + 0.5) * C;
    const cy = (y + 0.5) * C;
    const planks = across
      ? Array.from({ length: 7 }, (_, i) => `M${f(cx - lw / 2 + (i + 1) * (lw / 8))},${f(cy - 4)} v8`).join(' ')
      : Array.from({ length: 7 }, (_, i) => `M${f(cx - 4)},${f(cy - lh / 2 + (i + 1) * (lh / 8))} h8`).join(' ');
    w.push(`<rect x="${f(cx - lw / 2 + 1.5)}" y="${f(cy - lh / 2 + 2)}" width="${f(lw)}" height="${f(lh)}" fill="${S.shadow[0]}" opacity="${S.shadow[1]}"/><rect x="${f(cx - lw / 2)}" y="${f(cy - lh / 2)}" width="${f(lw)}" height="${f(lh)}" fill="${WOOD.light}"${ink(1)}/><path d="${planks}" stroke="${WOOD.shadow}" stroke-width="0.7"/>`);
  }

  const things = [];
  const put = (id, x, y, s = 1) => things.push([y, `<use href="#${id}" transform="translate(${f(x)} ${f(y)})${s === 1 ? '' : ` scale(${f(s)})`}"/>`, x, s, id]);
  for (const [x, y] of forest) {
    for (let k = 0; k < 4; k++) {
      const px = (x + 0.25 + 0.5 * (k % 2) + (hash(x, y, 60 + k) - 0.5) * 0.3) * C;
      const py = (y + 0.35 + 0.45 * (k >> 1) + (hash(y, x, 60 + k) - 0.5) * 0.25) * C;
      const roll = hash(x * 4 + k, y, 70);
      put(roll < 0.2 ? 'bi0' : roll < 0.6 ? 'sp0' : 'sp1', px, py, 0.82 + hash(x, y * 4 + k, 71) * 0.36);
    }
  }
  for (const [x, y] of all((t) => t === 'meadow' || t === 'field')) {
    if (hash(x, y, 80) < (T(x, y) === 'field' ? 0.02 : 0.08)) put(hash(x, y, 81) < 0.5 ? 'bi0' : 'sp0', (x + 0.5) * C, (y + 0.8) * C, 0.9 + hash(x, y, 82) * 0.3);
  }
  for (const [x, y] of all((t) => t === 'house')) {
    put('iz0', (x + 0.4 + (hash(x, y, 90) - 0.5) * 0.2) * C, (y + 0.75) * C);
    if (hash(x, y, 91) < 0.4) put('iz0', (x + 0.75) * C, (y + 0.4) * C, 0.85);
  }
  for (const [x, y] of town) {
    put('iz0', (x + 0.28 + (hash(x, y, 92) - 0.5) * 0.25) * C, (y + 0.45 + (hash(y, x, 92) - 0.5) * 0.2) * C, 0.8 + hash(x, y, 93) * 0.2);
    if (hash(x, y, 94) < 0.75) put('iz0', (x + 0.7 + (hash(x, y, 95) - 0.5) * 0.2) * C, (y + 0.95) * C, 0.8 + hash(x, y, 96) * 0.2);
  }
  for (const [x, y] of all((t) => t === 'church')) put('ch0', (x + 0.5) * C, (y + 0.85) * C, 1.1);

  if (town.length) {
    const corners = townAll.flatMap(([x, y]) => [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]].map(([a, b]) => [a * C, b * C]));
    const hl = hull(corners);
    const cx = hl.reduce((s, p) => s + p[0], 0) / hl.length;
    const cy = hl.reduce((s, p) => s + p[1], 0) / hl.length;
    const ring = hl.map(([x, y]) => [x + (x - cx) * 0.06, y + (y - cy) * 0.1]);
    const d = `M${pts(ring).replaceAll(' ', ' L')} Z`;
    w.push(`<path d="${d}" fill="none" stroke="${OUT}" stroke-width="9" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${WOOD.base}" stroke-width="6.4" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${WOOD.shadow}" stroke-width="6.4" stroke-dasharray="1.2 2.6"/><path d="${d}" fill="none" stroke="${WOOD.light}" stroke-width="1.4" transform="translate(-1 -1.6)" stroke-linejoin="round"/>`);
    for (const [x, y] of ring) put('tw0', x, y + 3, 1.05);
  }

  const [sc, so] = S.shadow;
  w.push(`<g fill="${sc}" opacity="${so}">${things.map(([y, , x, s, id]) => `<ellipse cx="${f(x + 3.5 * s)}" cy="${f(y + 0.5)}" rx="${f((id[0] === 's' ? 8 : id === 'bi0' ? 6 : 10) * s)}" ry="${f(2.6 * s)}"/>`).join('')}</g>`);
  things.sort((a, b) => a[0] - b[0]);
  w.push(things.map((t) => t[1]).join(''));

  const top = [];
  const seenAt = (x, y) => !visibility || visibility[Math.round(y)]?.[Math.round(x)] === 'seen';
  const knownAt = (x, y) => !visibility || (visibility[Math.max(0, Math.min(GH - 1, Math.round(y)))]?.[Math.max(0, Math.min(GW - 1, Math.round(x)))] ?? 'unseen') !== 'unseen';
  let body;
  defs.push(`<g id="world">${w.join('')}</g>`);
  if (!visibility) body = '<use href="#world"/>';
  else {
    defs.push(`<filter id="memory" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0.15"/><feComponentTransfer><feFuncR type="linear" slope="0.72" intercept="0.24"/><feFuncG type="linear" slope="0.7" intercept="0.22"/><feFuncB type="linear" slope="0.62" intercept="0.2"/></feComponentTransfer></filter>`);
    defs.push(`<pattern id="hatch" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0,0 V9" stroke="#b3a88e" stroke-width="1.2"/></pattern>`);
    const circ = (list, k, salt) => list.map(([x, y]) => `<circle cx="${f((x + 0.5 + (hash(x, y, salt) - 0.5) * 0.3) * C)}" cy="${f((y + 0.5 + (hash(y, x, salt) - 0.5) * 0.3) * C)}" r="${f(C * k * (0.9 + hash(x, y, salt + 1) * 0.25))}"/>`).join('');
    const seen = all((_, x, y) => visibility[y][x] === 'seen');
    const unseen = all((_, x, y) => visibility[y][x] === 'unseen');
    defs.push(`<mask id="seen"><g fill="#ffffff" filter="url(#goo)">${circ(seen, 0.8, 101)}</g></mask>`);
    const fog = circ(unseen, 0.82, 103);
    defs.push(`<clipPath id="fog">${fog}</clipPath>`);
    body = `<use href="#world" filter="url(#memory)"/><use href="#world" mask="url(#seen)"/><g fill="none" stroke="#6a604c" stroke-width="5">${fog}</g><g fill="#ddd4bd">${fog}</g><rect width="${W}" height="${H}" fill="url(#hatch)" clip-path="url(#fog)" opacity="0.7"/>`;
  }

  for (const p of map.places) {
    if (!knownAt(p.x, p.y + 1)) continue;
    const big = p.kind === 'town';
    const water = p.kind === 'water';
    top.push(`<text x="${f((p.x + 0.5) * C)}" y="${f((p.y + 0.5) * C)}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${big ? 21 : water ? 15 : 16}" font-style="${water ? 'italic' : 'normal'}" font-weight="${big ? 'bold' : 'normal'}" letter-spacing="${big ? 3 : 0.5}" fill="${water ? '#1d4a78' : '#2a1c12'}" stroke="${S.paper}" stroke-width="4.5" stroke-linejoin="round" paint-order="stroke">${big ? p.name.toUpperCase() : p.name}</text>`);
  }
  for (const [x, y] of npcs.filter(([x, y]) => seenAt(x, y))) {
    const cx = (x + 0.5) * C;
    const cy = (y + 0.6) * C;
    top.push(`<g transform="translate(${f(cx)} ${f(cy)}) scale(1.45)"><ellipse cx="2" cy="3" rx="6" ry="2.2" fill="${sc}" opacity="${so}"/><path d="M-5,3 C-5,-3 5,-3 5,3 Z" fill="#c9a95a"${ink(0.9)}/><path d="M-5,3 C-5,-3 0,-3 0,-1.5 L0,3 Z" fill="#e2c87e"/><path d="M-5,3 C-5,-3 5,-3 5,3 Z" fill="none"${ink(0.9)}/><circle cy="-4.6" r="3" fill="#ecd9a0"${ink(0.9)}/></g>`);
  }
  if (hero) {
    const cx = (hero[0] + 0.5) * C;
    const cy = (hero[1] + 0.5) * C;
    const shield = 'M0,-11 C7,-11 8,-5 7,0 C6,5 3,9 0,13 C-3,9 -6,5 -7,0 C-8,-5 -7,-11 0,-11 Z';
    top.push(`<circle cx="${f(cx)}" cy="${f(cy)}" r="17" fill="none" stroke="#ffffff" stroke-width="2.4" opacity="0.9"/><circle cx="${f(cx)}" cy="${f(cy)}" r="17" fill="none" stroke="${OUT}" stroke-width="1" opacity="0.6"/><ellipse cx="${f(cx + 3)}" cy="${f(cy + 13)}" rx="8" ry="2.6" fill="${sc}" opacity="${so + 0.1}"/><g transform="translate(${f(cx)} ${f(cy)})"><path d="${shield}" fill="#8f2a22"/><path d="M0,-11 C-7,-11 -8,-5 -7,0 C-6,5 -3,9 0,13 Z" fill="#c4463a"/><path d="${shield}" fill="none" stroke="#d8b04a" stroke-width="1.6"/><path d="${shield}" fill="none"${ink(1)} transform="scale(1.12)"/><circle r="2.4" fill="#e4c260"${ink(0.8)}/></g>`);
  }

  const N = [W - 58, 62];
  top.push(`<g transform="translate(${N[0]} ${N[1]})"><circle r="24" fill="${S.paper}" opacity="0.85"${ink(1.2)}/><path d="M0,-30 L6,0 L0,30 L-6,0 Z" fill="#7c6a52"/><path d="M0,-30 L-6,0 L0,0 Z M0,30 L6,0 L0,0 Z" fill="#b8a684"/><path d="M-26,0 L0,-5 L26,0 L0,5 Z" fill="#7c6a52"/><path d="M-26,0 L0,-5 L0,0 Z M26,0 L0,5 L0,0 Z" fill="#b8a684"/><path d="M0,-30 L6,0 L0,30 L-6,0 Z M-26,0 L0,-5 L26,0 L0,5 Z" fill="none"${ink(1.1)}/><path d="M0,-30 L-6,0 L0,0 Z" fill="#a8322a"/><path d="M0,-30 L6,0 L0,0 Z" fill="#7a2018"/><text y="-36" text-anchor="middle" font-family="Georgia, serif" font-size="15" font-weight="bold" fill="#2a1c12" stroke="${S.paper}" stroke-width="4" paint-order="stroke">С</text></g>`);
  const seg = (50 / 24) * C;
  const bx = 26;
  const by = H - 30;
  let bar = '';
  for (let i = 0; i < 4; i++) bar += `<rect x="${f(bx + i * seg)}" y="${by}" width="${f(seg)}" height="6" fill="${i % 2 ? S.paper : '#3a2a1c'}"/>`;
  top.push(`<rect x="${bx - 10}" y="${by - 22}" width="${f(seg * 4 + 48)}" height="40" rx="4" fill="${S.paper}" opacity="0.85"${ink(1)}/>${bar}<rect x="${bx}" y="${by}" width="${f(seg * 4)}" height="6" fill="none"${ink(1)}/>${['0', '100', '200 м'].map((t, i) => `<text x="${f(bx + i * seg * 2)}" y="${by - 6}" text-anchor="${i === 2 ? 'start' : 'middle'}" font-family="Georgia, serif" font-size="12" fill="#2a1c12">${t}</text>`).join('')}`);
  top.push(`<rect x="3" y="3" width="${W - 6}" height="${H - 6}" fill="none" stroke="${OUT}" stroke-width="6"/><rect x="9" y="9" width="${W - 18}" height="${H - 18}" fill="none" stroke="${S.paper}" stroke-width="1.5" opacity="0.8"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><defs>${defs.join('')}</defs>${body}${top.join('')}</svg>`;
}
