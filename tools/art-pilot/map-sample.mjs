import { rng } from './warrior.mjs';

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];

function valueNoise(g, W, H, step) {
  const gw = Math.ceil(W / step) + 2;
  const gh = Math.ceil(H / step) + 2;
  const v = Array.from({ length: gw * gh }, () => g());
  const at = (i, j) => v[j * gw + i];
  const s = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const fx = x / step;
    const fy = y / step;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = s(fx - i);
    const w = s(fy - j);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * u;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * u;
    return a + (b - a) * w;
  };
}

export function sampleOvermap(seed = 1230, W = 48, H = 30) {
  const g = rng(seed);
  const cells = Array.from({ length: H }, () => Array(W).fill('meadow'));
  const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
  const get = (x, y) => (inside(x, y) ? cells[y][x] : null);
  const set = (x, y, t) => inside(x, y) && (cells[y][x] = t);
  const nForest = valueNoise(g, W, H, 7);
  const nDetail = valueNoise(g, W, H, 3);
  const nSwamp = valueNoise(g, W, H, 5);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) if (nForest(x, y) * 0.8 + nDetail(x, y) * 0.2 > 0.5) set(x, y, 'forest');
  }

  const lake = { x: 7 + g() * 6, y: H - 4 - g() * 2, rx: 7 + g() * 3, ry: 3.5 + g() * 1.5 };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const e = ((x - lake.x) / lake.rx) ** 2 + ((y - lake.y) / lake.ry) ** 2;
      if (e < 1 + (nDetail(x, y) - 0.5) * 0.6) set(x, y, 'lake');
      else if (e < 3.2 && nSwamp(x, y) > 0.52) set(x, y, 'swamp');
    }
  }

  const river = [];
  const start = [W * (0.55 + g() * 0.2), -1];
  const end = [lake.x + lake.rx * 0.4, lake.y - lake.ry * 0.6];
  const ph = g() * 6;
  let last = null;
  for (let t = 0; t <= 1; t += 0.002) {
    const bend = Math.sin(t * Math.PI * 3 + ph) * 4 * Math.sin(t * Math.PI);
    const x = Math.round(start[0] + (end[0] - start[0]) * t + bend);
    const y = Math.round(start[1] + (end[1] - start[1]) * t);
    if (last && last[0] !== x && last[1] !== y) river.push([x, last[1]]);
    if (!last || last[0] !== x || last[1] !== y) river.push([x, y]);
    last = [x, y];
    if (get(x, y) === 'lake') break;
  }
  for (const [x, y] of river) if (get(x, y) !== 'lake') set(x, y, 'river');

  const ti = river.findIndex(([, y]) => y >= H * 0.4);
  const [rx, ry] = river[ti];
  const town = [];
  for (let y = ry - 2; y <= ry + 3; y++) {
    for (let x = rx + 1; x <= rx + 7; x++) {
      if (((x - rx - 3.5) / 3.4) ** 2 + ((y - ry - 0.5) / 2.6) ** 2 > 1) continue;
      if (get(x, y) && get(x, y) !== 'river' && get(x, y) !== 'lake') {
        set(x, y, 'town');
        town.push([x, y]);
      }
    }
  }
  set(rx + 3, ry, 'church');

  const villages = [];
  for (let tries = 0; villages.length < 4 && tries < 400; tries++) {
    const v = [3 + Math.floor(g() * (W - 6)), 3 + Math.floor(g() * (H - 6))];
    const t = get(...v);
    if (t === 'river' || t === 'lake' || t === 'town' || t === 'church') continue;
    if ([[rx + 3, ry], ...villages].some(([a, b]) => Math.hypot(a - v[0], b - v[1]) < 10)) continue;
    villages.push(v);
  }

  const cost = { meadow: 1, field: 1, forest: 2.5, swamp: 6, river: 14, road: 0.4, bridge: 0.4, town: 1, church: 50, house: 50, lake: Infinity };
  const route = (from, to) => {
    const dist = new Map([[from.join(), 0]]);
    const prev = new Map();
    const open = [[0, from]];
    while (open.length) {
      open.sort((a, b) => a[0] - b[0]);
      const [dc, [x, y]] = open.shift();
      if (x === to[0] && y === to[1]) break;
      if (dc > dist.get(`${x},${y}`)) continue;
      for (const [dx, dy] of DIRS) {
        const n = [x + dx, y + dy];
        const t = get(...n);
        if (!t) continue;
        const nd = dc + (n[0] === to[0] && n[1] === to[1] ? 1 : cost[t]);
        if (nd < (dist.get(n.join()) ?? Infinity)) {
          dist.set(n.join(), nd);
          prev.set(n.join(), [x, y]);
          open.push([nd, n]);
        }
      }
    }
    const path = [];
    for (let p = to; p; p = prev.get(p.join())) path.push(p);
    return path.reverse();
  };
  const gate = [rx + 7, ry + 1];
  const roads = [];
  for (const v of villages) {
    const p = route(v, gate);
    roads.push(p);
    for (const [x, y] of p) {
      const t = get(x, y);
      if (t === 'river') set(x, y, 'bridge');
      else if (t !== 'town' && t !== 'church' && t !== 'bridge') set(x, y, 'road');
    }
  }
  const outward = route(gate, [W - 1, Math.floor(H * 0.3 + g() * H * 0.4)]);
  for (const [x, y] of outward) if (get(x, y) !== 'town' && get(x, y) !== 'church') set(x, y, get(x, y) === 'river' ? 'bridge' : 'road');

  const fieldAround = (cx, cy, r) => {
    for (let y = cy - r; y <= cy + r; y++) {
      for (let x = cx - r; x <= cx + r; x++) {
        const t = get(x, y);
        if ((t === 'forest' || t === 'meadow') && Math.hypot(x - cx, y - cy) < r + (nDetail(x, y) - 0.5) * 3 && g() < 0.8) set(x, y, 'field');
      }
    }
  };
  for (const [vx, vy] of villages) {
    fieldAround(vx, vy, 5);
    for (let y = vy - 2; y <= vy + 2; y++) {
      for (let x = vx - 2; x <= vx + 2; x++) {
        const t = get(x, y);
        if (t === 'road' || t === 'bridge' || t === 'river' || t === 'lake' || Math.hypot(x - vx, y - vy) > 2.6) continue;
        if (DIRS.some(([dx, dy]) => get(x + dx, y + dy) === 'road') && g() < 0.8) set(x, y, 'house');
      }
    }
  }
  fieldAround(rx + 3, ry, 7);
  const [cvx, cvy] = villages[0];
  const pogost = DIRS.map(([dx, dy]) => [cvx + dx * 2, cvy + dy * 2]).find(([x, y]) => get(x, y) === 'house' || get(x, y) === 'field');
  if (pogost) set(...pogost, 'church');

  const names = ['Заречье', 'Боровое', 'Липня', 'Озерки'];
  const places = [
    { name: 'Ольховец', kind: 'town', x: rx + 3, y: ry - 1.6 },
    ...villages.map(([x, y], i) => ({ name: names[i], kind: 'village', x, y: y - 1.4 })),
    { name: 'Чёрное озеро', kind: 'water', x: lake.x, y: lake.y + 0.3 },
    { name: 'р. Ольховка', kind: 'water', x: river[Math.floor(river.length * 0.2)][0] + 1.6, y: river[Math.floor(river.length * 0.2)][1] }
  ];
  return { width: W, height: H, cells, places, villages, town: [rx + 3, ry], roads };
}

export function sampleVisibility(map, hero) {
  const { width: W, height: H, roads } = map;
  const trail = roads.find((p) => p[0][0] === hero[0] && p[0][1] === hero[1]) ?? roads[0];
  const vis = Array.from({ length: H }, () => Array(W).fill('unseen'));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (Math.hypot(x - hero[0], y - hero[1]) < 6.5) vis[y][x] = 'seen';
      else if (trail.some(([a, b]) => Math.hypot(x - a, y - b) < 3.2) || Math.hypot(x - map.town[0], y - map.town[1]) < 5.5) vis[y][x] = 'remembered';
    }
  }
  return vis;
}
