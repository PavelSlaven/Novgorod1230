const OUT = '#1b130e';

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');
const tone = (h) => ({ base: h, shadow: mix(h, '#140c1c', 0.42), light: mix(h, '#fff4e0', 0.22) });
const f = (n) => +n.toFixed(1);

const SKINS = {
  fair: { base: '#e2b496', shadow: '#ad7b5e', light: '#f6d9c2' },
  ruddy: { base: '#cf9a78', shadow: '#9a6246', light: '#ecc3a2' },
  tanned: { base: '#b07a56', shadow: '#7a4c31', light: '#cf9c78' }
};
const METAL = { base: '#adb3b9', shadow: '#6c727a', light: '#eef1f3' };
const STEEL = { base: '#878d94', shadow: '#555a61', light: '#c8ccd1' };
const LEATHER = { base: '#7a4626', shadow: '#4f2c17', light: '#a3653a' };
const WOOD = { base: '#93602f', shadow: '#5e3c1c', light: '#c58f57' };
const GOLD = { base: '#c99a3e', shadow: '#86621f', light: '#f2da8c' };
const TROUSERS = tone('#4a3f37');
const BOOTS = tone('#5a3820');
const HAIR = {
  grey: { base: '#9d8f80', shadow: '#6c5f53', light: '#cfc4b6' },
  brown: { base: '#6d4a2e', shadow: '#45301d', light: '#9a6e48' },
  black: { base: '#3b302a', shadow: '#211a16', light: '#5f5249' },
  blond: { base: '#c49a5c', shadow: '#8a6834', light: '#e6c590' },
  red: { base: '#9c4c26', shadow: '#683016', light: '#c27242' }
};
const IRIS = { brown: '#4a3424', blue: '#45698f', grey: '#69737b' };
const SHAPES = { oval: [1, 226], broad: [1.1, 224], narrow: [0.92, 232] };
const FACE = { shape: 'oval', age: 'old', skin: 'ruddy', beard: 'long', moustache: 'full', nose: 'straight', brows: 'stern', eyes: 'brown', scar: 'none', hair: 'parted' };
const BEARD_D = {
  long: 'M265,182 C262,204 262,228 268,246 C272,258 278,264 283,268 Q289,264 292,270 Q296,280 300,285 Q304,280 308,270 Q311,264 317,268 C322,264 328,258 332,246 C338,228 338,204 335,182 C331,196 324,204 316,207 C310,213 290,213 284,207 C276,204 269,196 265,182 Z',
  short: 'M265,182 C262,200 263,218 270,231 C278,243 289,248 300,249 C311,248 322,243 330,231 C337,218 338,200 335,182 C331,196 324,204 316,207 C310,213 290,213 284,207 C276,204 269,196 265,182 Z',
  forked: 'M265,182 C262,204 262,228 268,246 C274,262 282,276 290,292 Q295,278 300,266 Q305,278 310,292 C318,276 326,262 332,246 C338,228 338,204 335,182 C331,196 324,204 316,207 C310,213 290,213 284,207 C276,204 269,196 265,182 Z'
};
const STRANDS = {
  long: ['M276,214 C276,232 280,248 286,262', 'M290,218 C290,238 293,256 297,276', 'M310,218 C310,238 307,256 303,276', 'M324,214 C324,232 320,248 314,262', 'M270,200 C268,220 270,236 276,250', 'M330,200 C332,220 330,236 324,250'],
  short: ['M276,212 C277,224 281,234 287,242', 'M292,216 C292,228 294,238 297,246', 'M308,216 C308,228 306,238 303,246', 'M324,212 C323,224 319,234 313,242', 'M270,198 C269,210 271,220 275,228', 'M330,198 C331,210 329,220 325,228'],
  forked: ['M276,214 C277,236 282,256 290,286', 'M290,218 C291,238 294,254 297,268', 'M310,218 C309,238 306,254 303,268', 'M324,214 C323,236 318,256 310,286', 'M270,200 C268,220 270,236 276,250', 'M330,200 C332,220 330,236 324,250']
};
const MOUSTACHE_D = {
  full: 'M300,196 C292,193 283,196 276,203 C272,208 270,214 271,220 C276,212 284,208 292,208 C296,208 299,206 300,205 C301,206 304,208 308,208 C316,208 324,212 329,220 C330,214 328,208 324,203 C317,196 308,193 300,196 Z',
  drooping: 'M300,196 C292,193 283,196 278,202 C272,210 272,226 276,244 C279,230 282,216 290,209 C295,207 299,206 300,205 C301,206 305,207 310,209 C318,216 321,230 324,244 C328,226 328,210 322,202 C317,196 308,193 300,196 Z'
};
const NOSE = {
  straight: ['M293,193 Q296,197 300,196 Q304,197 308,192', 'M292,190.5 Q290.5,195 295,196.5', 'M309,189.5 Q310.5,195 306,196.5'],
  hooked: ['M294,195 Q298,199.5 301,198.5 Q305,198 308,193.5', 'M292,191.5 Q291,196 295,197.5', 'M309,190.5 Q310.5,195.5 306.5,197.5'],
  broad: ['M291,193.5 Q296,198.5 300,197.5 Q304,198.5 309,193.5', 'M289.5,189.5 Q286.5,195.5 293,198', 'M310.5,189.5 Q313.5,195.5 307,198']
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function kit() {
  let n = 0;
  const defs = [];
  const id = (p) => `${p}${++n}`;
  const clip = (d) => {
    const c = id('c');
    defs.push(`<clipPath id="${c}"><path d="${d}"/></clipPath>`);
    return c;
  };
  const outline = (d, sw) => (sw ? `<path d="${d}" fill="none" stroke="${OUT}" stroke-width="${sw}" stroke-linejoin="round"/>` : '');

  // Cel shading: the part shifted toward the light leaves a hard shadow band on the far side.
  const shaded = (d, c, o = {}) => {
    const { sx = 12, sy = 3, hx = 3, hy = 3, sw = 2.5, inner = '' } = o;
    const a = clip(d);
    const b = id('s');
    defs.push(`<clipPath id="${b}"><path d="${d}" transform="translate(${-sx} ${-sy})"/></clipPath>`);
    return `<g clip-path="url(#${a})"><path d="${d}" fill="${c.shadow}"/><g clip-path="url(#${b})"><path d="${d}" fill="${c.light}"/><path d="${d}" fill="${c.base}" transform="translate(${hx} ${hy})"/></g>${inner}</g>${outline(d, sw)}`;
  };

  const cel = (d, sx, sy, op) => {
    const m = id('m');
    defs.push(`<mask id="${m}" maskUnits="userSpaceOnUse" x="-3000" y="-3000" width="6000" height="6000"><rect x="-3000" y="-3000" width="6000" height="6000" fill="#fff"/><path d="${d}" transform="translate(${-sx} ${-sy})" fill="#000"/></mask>`);
    return `<path d="${d}" fill="#000" opacity="${op}" mask="url(#${m})"/>`;
  };

  const patterned = (d, content, o = {}) => {
    const { sx = 26, sy = 4, op = 0.42, sw = 2.5, vol = true } = o;
    const a = clip(d);
    return `<g clip-path="url(#${a})">${content}${cel(d, sx, sy, op)}${vol ? `<path d="${d}" fill="url(#vol)"/>` : ''}</g>${outline(d, sw)}`;
  };

  return { defs, id, clip, shaded, cel, patterned };
}

// Banded Lambert on a vertical cylinder lit from front-left; bands keep the cel look.
function cylShade(t) {
  const L = Math.cos(t + 0.6);
  const op = L > 0.8 ? 0 : L > 0.45 ? 0.2 : L > 0.1 ? 0.4 : 0.55;
  return `fill="#140c10" opacity="${op}"`;
}

function cylBands(cx, R, y0, y1) {
  let s = '';
  const n = 40;
  for (let i = 0; i < n; i++) {
    const t0 = -Math.PI / 2 + (Math.PI * i) / n;
    const t1 = t0 + Math.PI / n;
    const xa = cx + R * Math.sin(t0);
    const xb = cx + R * Math.sin(t1);
    s += `<rect x="${f(xa)}" y="${y0}" width="${f(xb - xa + 0.3)}" height="${y1 - y0}" ${cylShade((t0 + t1) / 2)}/>`;
  }
  return s;
}

function lamellar(cx, R, y0, y1, rowH, r) {
  let s = '';
  const n = Math.max(6, Math.round((Math.PI * R) / 15));
  for (let y = y0; y < y1; y += rowH) {
    for (let i = 0; i < n; i++) {
      const t0 = -Math.PI / 2 + (Math.PI * i) / n;
      const t1 = t0 + Math.PI / n;
      const xa = cx + R * Math.sin(t0);
      const xb = cx + R * Math.sin(t1);
      const w = xb - xa;
      if (w < 1.5) continue;
      const yy = y + 4 * Math.sin((t0 + t1) / 2) ** 2;
      s += `<rect x="${f(xa + 0.5)}" y="${f(yy)}" width="${f(w - 1)}" height="${rowH - 1}" rx="${f(Math.min(2.2, w / 3))}" fill="url(#plate)" stroke="${OUT}" stroke-width="0.9"/>`;
      const tm = (t0 + t1) / 2;
      s += `<rect x="${f(xa + 0.5)}" y="${f(yy)}" width="${f(w - 1)}" height="${rowH - 1}" rx="2" ${cylShade(tm)}/>`;
      s += `<rect x="${f(xa + 0.5)}" y="${f(yy)}" width="${f(w - 1)}" height="${rowH - 1}" rx="2" fill="${r() < 0.5 ? '#000000' : '#fff'}" opacity="${f(r() * 0.1)}"/>`;
      if (Math.abs(tm + 0.6) < 0.25) s += `<rect x="${f(xa + 1.5)}" y="${f(yy + 2)}" width="${f(Math.max(1, w * 0.25))}" height="${rowH - 6}" fill="#fff" opacity="0.55"/>`;
      if (w > 5) {
        const xm = f((xa + xb) / 2);
        s += `<ellipse cx="${xm}" cy="${f(yy + 6)}" rx="1.3" ry="1.8" fill="#3a2a20"/><ellipse cx="${xm}" cy="${f(yy + rowH - 6)}" rx="1.1" ry="1.5" fill="#3a2a20"/>`;
      }
    }
    s += `<rect x="${cx - R - 30}" y="${y - 2}" width="${2 * R + 60}" height="4" fill="${LEATHER.shadow}"/>`;
  }
  return s;
}

function scales(cx, R, y0, y1, h, r) {
  const rows = [];
  for (let y = y0, k = 0; y < y1; y += h * 0.62, k++) rows.push([y, k]);
  let s = '';
  const n = Math.max(6, Math.round((Math.PI * R) / 10));
  for (const [y, k] of rows.reverse()) {
    const off = k % 2 ? 0.5 : 0;
    for (let i = -1; i < n + 1; i++) {
      const t0 = -Math.PI / 2 + (Math.PI * (i + off)) / n;
      const t1 = t0 + Math.PI / n;
      if (t0 < -Math.PI / 2 - 0.01 || t1 > Math.PI / 2 + 0.01) continue;
      const xa = cx + R * Math.sin(t0);
      const xb = cx + R * Math.sin(t1);
      if (xb - xa < 1.5) continue;
      const yy = y + 4 * Math.sin((t0 + t1) / 2) ** 2;
      const xm = (xa + xb) / 2;
      const sd = `M${f(xa)},${f(yy)} L${f(xb)},${f(yy)} L${f(xb)},${f(yy + h * 0.5)} Q${f(xm)},${f(yy + h * 1.2)} ${f(xa)},${f(yy + h * 0.5)} Z`;
      s += `<path d="${sd}" fill="url(#plate)" stroke="${OUT}" stroke-width="0.9"/><path d="${sd}" ${cylShade((t0 + t1) / 2)}/>`;
      s += `<path d="M${f(xm)},${f(yy + 2)} L${f(xm)},${f(yy + h * 0.7)}" stroke="#ffffff" stroke-width="0.8" opacity="${f(0.25 + r() * 0.3)}"/>`;
    }
  }
  return s;
}

const MAIL = '<rect x="-1000" y="-1000" width="3000" height="3000" fill="url(#mail)"/>';

function commonDefs() {
  return `
<radialGradient id="bg" cx="0.3" cy="0.64" r="0.9"><stop offset="0" stop-color="#7a5232"/><stop offset="0.45" stop-color="#3d322b"/><stop offset="1" stop-color="#1c1917"/></radialGradient>
<linearGradient id="vol" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.3" stop-color="#fff" stop-opacity="0"/><stop offset="0.65" stop-color="#000" stop-opacity="0.06"/><stop offset="1" stop-color="#000" stop-opacity="0.32"/></linearGradient>
<linearGradient id="plate" x1="0" x2="0.3" y1="0" y2="1"><stop offset="0" stop-color="#eef0f2"/><stop offset="0.5" stop-color="#b9bec4"/><stop offset="1" stop-color="#8a9097"/></linearGradient>
<linearGradient id="blade" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#f3f5f7"/><stop offset="0.45" stop-color="#b3b9bf"/><stop offset="1" stop-color="#6b7178"/></linearGradient>
<linearGradient id="fogbottom" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#2a2522" stop-opacity="0"/><stop offset="1" stop-color="#2a2522" stop-opacity="0.85"/></linearGradient>
<pattern id="mail" width="6" height="5" patternUnits="userSpaceOnUse"><rect width="6" height="5" fill="#7c8288"/><g fill="none" stroke="#2b2f34" stroke-width="1.1"><circle cx="0" cy="0" r="2.2"/><circle cx="6" cy="0" r="2.2"/><circle cx="3" cy="2.5" r="2.2"/><circle cx="0" cy="5" r="2.2"/><circle cx="6" cy="5" r="2.2"/></g><g fill="none" stroke="#c9ced3" stroke-width="0.7"><path d="M1.6,3.6 a2,2 0 0 0 2.6,-2.4"/><path d="M-1.4,1.1 a2,2 0 0 0 2.6,-2.4"/><path d="M4.6,1.1 a2,2 0 0 0 2.6,-2.4"/></g></pattern>
<filter id="smoke" x="-50%" y="-50%" width="200%" height="200%"><feTurbulence type="fractalNoise" baseFrequency="0.018" numOctaves="2" seed="7" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="34" xChannelSelector="R" yChannelSelector="G" result="d"/><feGaussianBlur in="d" stdDeviation="3"/></filter>
<filter id="blur50" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="50"/></filter>
<filter id="blur16" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter>
<filter id="glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="1.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
}

function cloud(cx, cy, s, r) {
  const blobs = Array.from({ length: 8 }, () => [cx + (r() - 0.5) * s * 1.9, cy + (r() - 0.5) * s * 0.9, s * (0.3 + r() * 0.35)]);
  const warm = Math.max(0, Math.min(1, (cy - 300) / 300)) * (cx < 320 ? 1 : 0.5);
  const tint = (c) => mix(c, '#9a5a30', warm * 0.55);
  const layer = (dx, dy, k, fill, op) =>
    `<g fill="${tint(fill)}" opacity="${op}">${blobs.map(([x, y, rad]) => `<circle cx="${f(x + dx)}" cy="${f(y + dy)}" r="${f(rad * k)}"/>`).join('')}</g>`;
  return `<g filter="url(#smoke)" opacity="0.8">${layer(0, 0, 1.05, '#35302d', 0.75)}${layer(-s * 0.07, -s * 0.09, 0.85, '#504a45', 0.7)}${layer(-s * 0.14, -s * 0.16, 0.55, '#6e6760', 0.45)}</g>`;
}

function backdrop(r, clouds) {
  return `<rect width="600" height="800" fill="url(#bg)"/><ellipse cx="150" cy="560" rx="220" ry="190" fill="#b5662a" opacity="0.32" filter="url(#blur50)"/>${clouds.map(([x, y, s]) => cloud(x, y, s, r)).join('')}`;
}

function sparks(r, n) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = r() * 600;
    const y = 800 - Math.pow(r(), 1.6) * 440;
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.6 + r() * 1.6)}" fill="${r() < 0.5 ? '#ffb24d' : '#ff8a2b'}"/>`;
  }
  return `<g filter="url(#glow)">${s}</g>`;
}

function stick(x1, y1, x2, y2, w, c) {
  const L = Math.hypot(x2 - x1, y2 - y1);
  const nx = (y2 - y1) / L;
  const ny = -(x2 - x1) / L;
  const line = (k) => `M${f(x1 + nx * k)},${f(y1 + ny * k)} L${f(x2 + nx * k)},${f(y2 + ny * k)}`;
  return `<path d="${line(0)}" stroke="${OUT}" stroke-width="${w + 4}" stroke-linecap="round"/><path d="${line(0)}" stroke="${c.base}" stroke-width="${w}" stroke-linecap="round"/><path d="${line(w * 0.28)}" stroke="${c.shadow}" stroke-width="${f(w * 0.4)}" stroke-linecap="round"/><path d="${line(-w * 0.25)}" stroke="${c.light}" stroke-width="${f(w * 0.2)}" stroke-linecap="round"/>`;
}

function axeHead(K) {
  const blade = 'M-7,-10 L-28,-13 C-36,-14 -42,-17 -47,-21 C-54,-2 -52,25 -38,47 C-31,37 -22,23 -13,15 C-10,12 -8,11 -7,10 Z';
  return `<path d="${blade}" fill="url(#blade)"/>${K.cel(blade, 7, 0, 0.3)}<path d="${blade}" fill="none" stroke="${OUT}" stroke-width="2.4" stroke-linejoin="round"/><path d="M-44,-14 C-50,1 -48,23 -38,40" fill="none" stroke="#ffffff" stroke-width="2.4" opacity="0.85"/>${K.shaded('M-8,-14 L8,-14 L8,14 L-8,14 Z', STEEL, { sx: 5, sy: 0, sw: 2.2 })}<circle cx="0" cy="-6" r="1.6" fill="${METAL.light}" stroke="${OUT}" stroke-width="0.7"/><circle cx="0" cy="6" r="1.6" fill="${METAL.light}" stroke="${OUT}" stroke-width="0.7"/>`;
}

function helmetParts(K, kind, standalone = false) {
  if (kind === 'none') return { back: '', front: '' };
  const aventail = 'M257,146 C253,184 242,222 222,258 Q300,276 378,258 C358,222 347,184 343,146 Z';
  let back = K.patterned(aventail, MAIL, { sx: 18, sy: 4, op: 0.32 });
  if (standalone) {
    const hole = 'M268,150 C266,182 272,212 288,230 Q300,236 312,230 C328,212 334,182 332,150 Z';
    back += `<path d="${hole}" fill="#141110" stroke="${OUT}" stroke-width="2"/><path d="M268,150 C266,182 272,212 288,230" fill="none" stroke="#4a4744" stroke-width="5" opacity="0.6"/>`;
  }
  const domes = {
    sphero_conical: 'M259,152 C258,128 268,110 284,98 C292,92 297,86 300,79 C303,86 308,92 316,98 C332,110 342,128 341,152 Z',
    tall_conical: 'M260,152 C259,126 272,104 286,84 C292,74 297,62 300,50 C303,62 308,74 314,84 C328,104 341,126 340,152 Z'
  };
  const dome = domes[kind];
  const top = kind === 'tall_conical' ? 50 : 79;
  let inner = `<path d="M300,${top + 3} L300,148" stroke="${STEEL.shadow}" stroke-width="1.6"/>`;
  inner += kind === 'tall_conical'
    ? `<path d="M273,142 C272,118 282,96 296,66 C290,92 284,118 282,143 Z" fill="#fff" opacity="0.7"/><path d="M285,148 C285,118 291,90 299,60" fill="none" stroke="${STEEL.shadow}" stroke-width="1.2"/><path d="M315,148 C315,118 309,90 301,60" fill="none" stroke="${STEEL.shadow}" stroke-width="1.2"/>`
    : `<path d="M272,142 C271,122 281,106 294,94 C287,110 282,126 281,143 Z" fill="#fff" opacity="0.7"/><ellipse cx="289" cy="104" rx="3" ry="6" transform="rotate(35 289 104)" fill="#fff" opacity="0.8"/>`;
  let front = K.shaded(dome, METAL, { sx: 13, sy: 2, hx: 3, hy: 2, sw: 2.8, inner });
  front += kind === 'tall_conical'
    ? `${K.shaded('M297.5,52 L302.5,52 L301.5,36 L298.5,36 Z', STEEL, { sx: 2, sy: 0, sw: 1.6 })}<circle cx="300" cy="34" r="4" fill="${METAL.base}" stroke="${OUT}" stroke-width="1.6"/><circle cx="298.8" cy="32.8" r="1.3" fill="#fff"/>`
    : `<circle cx="300" cy="78" r="4.5" fill="${METAL.base}" stroke="${OUT}" stroke-width="1.8"/><circle cx="298.6" cy="76.6" r="1.4" fill="#fff"/>`;
  front += K.shaded('M257,143 Q300,152 343,143 L343,157 Q300,167 257,157 Z', STEEL, { sx: 9, sy: 0, sw: 2.4 });
  for (const x of [264, 280, 300, 320, 336]) {
    const y = 150 + 6 * (1 - ((x - 300) / 43) ** 2);
    front += `<circle cx="${x}" cy="${f(y)}" r="2.2" fill="${METAL.light}" stroke="${OUT}" stroke-width="0.8"/>`;
  }
  if (kind === 'tall_conical' && !standalone) {
    front += K.shaded('M296,152 L304,152 L303,186 Q300,190 297,186 Z', METAL, { sx: 3, sy: 0, sw: 1.8 });
  }
  return { back, front };
}

function face(K, P, hair, skin) {
  const F = { ...FACE, ...P.face };
  const [w, chin] = SHAPES[F.shape];
  const x = (v) => f(300 + (v - 300) * w);
  const wide = (body) => `<g transform="translate(300 0) scale(${w} 1) translate(-300 0)">${body}</g>`;
  const lv = { young: 0, mature: 1, old: 2 }[F.age];
  const bare = P.helmet === 'none';
  const bald = bare && F.hair === 'bald';
  const line = (d, wd = 1.2, c = skin.shadow) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${wd}" stroke-linecap="round"/>`;
  const sides = [(v) => v, (v) => 600 - v];
  let s = '';

  if (bare) {
    s += K.shaded(`M${x(283)},200 L${x(317)},200 L${x(320)},248 L${x(280)},248 Z`, skin, { sx: 10, sy: 0, sw: 2.2, inner: `<rect x="270" y="200" width="60" height="${chin - 188}" fill="${skin.shadow}" opacity="0.65"/>` });
    s += K.shaded('M272,238 Q300,250 328,238 L330,249 Q300,262 270,249 Z', GOLD, { sx: 5, sy: 0, sw: 2 });
    if (bald) {
      for (const m of sides) s += K.shaded(`M${x(m(268))},144 C${x(m(258))},148 ${x(m(252))},162 ${x(m(252))},178 C${x(m(253))},188 ${x(m(258))},195 ${x(m(265))},198 C${x(m(264))},182 ${x(m(265))},162 ${x(m(270))},148 Z`, hair, { sx: 4, sy: 1, sw: 2, inner: line(`M${x(m(262))},152 C${x(m(257))},164 ${x(m(256))},178 ${x(m(259))},190`, 1.2, hair.shadow) });
    }
    for (const m of sides) s += K.shaded(`M${x(m(267))},164 C${x(m(258))},160 ${x(m(254))},171 ${x(m(256))},180 C${x(m(258))},189 ${x(m(264))},191 ${x(m(268))},188 Z`, skin, { sx: 3, sy: 1, sw: 2 });
  }

  const T = bald ? 150 : bare ? 132 : 146;
  const sideD = `C${x(265)},165 ${x(263)},182 ${x(267)},198 C${x(273)},214 ${x(286)},${chin - 2} 300,${chin} C${x(314)},${chin - 2} ${x(327)},214 ${x(333)},198 C${x(337)},182 ${x(335)},165 ${x(332)},${T}`;
  const faceD = bald
    ? `M${x(268)},${T} ${sideD} C${x(338)},122 ${x(321)},103 300,103 C${x(279)},103 ${x(262)},122 ${x(268)},${T} Z`
    : `M${x(268)},${T} ${sideD} Z`;
  let inner = bare ? '' : `<path d="M250,140 L350,140 L350,157 Q300,166 250,157 Z" fill="${skin.shadow}" opacity="0.9"/>`;
  inner += `<ellipse cx="285" cy="171" rx="13" ry="7" fill="${skin.shadow}" opacity="${0.4 + lv * 0.1}"/><ellipse cx="315" cy="171" rx="13" ry="7" fill="${skin.shadow}" opacity="${0.55 + lv * 0.1}"/>`;
  inner += `<ellipse cx="${x(276)}" cy="191" rx="8" ry="5" fill="#b8604a" opacity="0.3"/><ellipse cx="${x(324)}" cy="191" rx="8" ry="5" fill="#b8604a" opacity="0.25"/>`;
  inner += `<path d="M302,166 C305,176 308,185 309,191 L303,194 C302,185 301,176 300,166 Z" fill="${skin.shadow}" opacity="0.85"/>`;
  inner += `<path d="M${x(318)},182 C${x(326)},185 ${x(331)},191 ${x(333)},199 L${x(327)},201 C${x(325)},193 ${x(322)},188 ${x(316)},185 Z" fill="${skin.shadow}" opacity="0.7"/>`;
  inner += `<path d="M${x(270)},183 C${x(273)},186 ${x(277)},187 ${x(281)},186" fill="none" stroke="${skin.light}" stroke-width="2.5" opacity="0.7"/><ellipse cx="298" cy="188" rx="2.6" ry="1.8" fill="${skin.light}"/><path d="M290,159 Q300,156 310,159 L310,163 Q300,160 290,163 Z" fill="${skin.light}" opacity="0.5"/>`;
  if (F.beard === 'none') {
    inner += `<path d="M292,${chin - 12} Q300,${chin - 15} 308,${chin - 12} Q300,${chin - 6} 292,${chin - 12} Z" fill="${skin.light}" opacity="0.55"/>`;
    if (lv > 0) inner += `<path d="M${x(262)},188 C${x(270)},204 ${x(284)},212 300,213 C${x(316)},212 ${x(330)},204 ${x(338)},188 L${x(345)},250 L${x(255)},250 Z" fill="${hair.shadow}" opacity="0.3"/>`;
  }
  if (bald) inner += `<ellipse cx="288" cy="121" rx="13" ry="7" transform="rotate(-20 288 121)" fill="#fff" opacity="0.35"/>`;
  s += K.shaded(faceD, skin, { sx: 12, sy: 2, hx: 2, hy: 2, sw: 2.5, inner });

  if (lv >= 1) s += line('M298,159 L299,166') + line('M302,159 L301,166') + line('M279,178.5 Q285,181.5 292,178.5', 1.1) + line('M308,178.5 Q315,181.5 321,178.5', 1.1);
  if (lv >= 2) {
    s += line('M281,182 Q286,184 290,182.5', 0.9) + line('M310,182.5 Q314,184 319,182', 0.9);
    s += line(`M${x(274)},170 L${x(269)},168`, 1) + line(`M${x(274)},173.5 L${x(269)},174.5`, 1) + line(`M${x(326)},170 L${x(331)},168`, 1) + line(`M${x(326)},173.5 L${x(331)},174.5`, 1);
    if (bare) {
      const y = bald ? 138 : 148;
      s += line(`M284,${y} Q300,${y - 3} 316,${y}`, 1.1) + line(`M286,${y + 5.5} Q300,${y + 3} 314,${y + 5.5}`, 1.1);
    }
  }

  for (const [cx, d, lid] of [
    [286, 'M278,172.5 Q285,169 293,172.5 Q285,175.5 278,172.5 Z', 'M276.5,172.5 Q285,167.5 294,172.5'],
    [314, 'M307,172.5 Q315,169 322,172.5 Q315,175.5 307,172.5 Z', 'M306,172.5 Q315,167.5 323.5,172.5']
  ]) {
    s += `<path d="${d}" fill="#e2d6c8" stroke="${OUT}" stroke-width="0.9"/><circle cx="${cx}" cy="172.3" r="2.6" fill="${IRIS[F.eyes]}"/><circle cx="${cx}" cy="172.3" r="1.2" fill="#120c08"/><circle cx="${cx - 0.9}" cy="171.4" r="0.6" fill="#fff"/>${line(lid, 2.4, OUT)}`;
  }
  const browD = F.brows === 'stern'
    ? ['M269,167 Q281,156 298,161.5 L297.5,167 Q284,163 271,171 Z', 'M331,167 Q319,156 302,161.5 L302.5,167 Q316,163 329,171 Z']
    : ['M270,164.5 Q283,157.5 297,161.5 L297,166 Q284,162.5 271,169 Z', 'M330,164.5 Q317,157.5 303,161.5 L303,166 Q316,162.5 329,169 Z'];
  s += browD.map((d) => `<path d="${d}" fill="${mix(hair.shadow, '#000000', 0.2)}" stroke="${OUT}" stroke-width="1.1"/>`).join('');
  s += line('M273,166 Q282,160 293,162', 0.9, hair.light) + line('M307,162 Q318,160 327,166', 0.9, hair.light);

  if (F.nose === 'hooked') s += line('M301.5,167 C306.5,175 308.5,182 305.5,190', 1.4, mix(skin.shadow, '#000000', 0.3));
  s += NOSE[F.nose].map((d, i) => line(d, i ? 1.2 : 1.6, OUT)).join('');
  if (F.moustache === 'none') s += line(F.brows === 'stern' ? 'M289,210.5 Q300,207.5 311,210.5' : 'M290,209 Q300,209.5 310,209', 1.5, OUT);
  s += `<path d="M292,210 Q300,215.5 308,210 Q300,212.5 292,210 Z" fill="#a0584a"/>`;
  if (F.beard === 'none') s += line(`M297,${chin - 6} Q300,${chin - 4} 303,${chin - 6}`, 1);

  if (F.scar === 'cheek') {
    s += `<path d="M${x(318)},176 L${x(331)},199" stroke="#9e5446" stroke-width="2.6" stroke-linecap="round"/><path d="M${x(317)},176 L${x(330)},199" stroke="${skin.light}" stroke-width="1" stroke-linecap="round"/>`;
    for (const t of [0.25, 0.5, 0.75]) {
      const px = 318 + 13 * t;
      const py = 176 + 23 * t;
      s += line(`M${x(px - 3)},${f(py + 1.5)} L${x(px + 3)},${f(py - 1.5)}`, 1, '#9e5446');
    }
  }

  if (bare && !bald) {
    const hairD = 'M259,178 C252,136 272,100 300,98 C328,100 348,136 341,178 C337,168 335,158 331,150 C323,141 310,139 300,146 C290,139 277,141 269,150 C265,158 263,168 259,178 Z';
    const hairLines = ['M299,104 C290,112 278,124 272,146', 'M300,106 C292,118 284,130 280,143', 'M301,104 C310,112 322,124 328,146', 'M300,106 C308,118 316,130 320,143', 'M285,108 C272,120 264,140 262,166', 'M315,108 C328,120 336,140 338,166']
      .map((d, i) => line(d, 1.4, i % 2 ? hair.light : hair.shadow)).join('');
    s += wide(K.shaded(hairD, hair, { sx: 10, sy: 3, sw: 2.5, inner: `${line('M300,100 L300,146', 1.6, hair.shadow)}${hairLines}` }));
  }

  if (F.beard !== 'none') {
    const st = STRANDS[F.beard];
    const strandInner = st.map((d) => line(d, 1.6, hair.shadow)).join('') + st.slice(0, 2).map((d) => `<path d="${d}" transform="translate(-3 0)" fill="none" stroke="${hair.light}" stroke-width="1.2"/>`).join('');
    s += wide(K.shaded(BEARD_D[F.beard], hair, { sx: 10, sy: 3, sw: 2.5, inner: strandInner }));
  }
  if (F.moustache !== 'none') {
    s += K.shaded(MOUSTACHE_D[F.moustache], hair, { sx: 5, sy: 2, sw: 1.8, inner: line('M298,199 C290,199 282,204 276,212', 1.1, hair.light) });
  }
  if (F.scar === 'brow') {
    for (const d of ['M281,154 L284.5,167', 'M286,177.5 L289,188']) s += `<path d="${d}" stroke="${skin.base}" stroke-width="3.4" stroke-linecap="round"/><path d="${d}" stroke="#9e5446" stroke-width="1.6" stroke-linecap="round"/>`;
  }
  return s;
}

function fist(K, m, skin) {
  const d = `M${m(190)},459 C${m(188)},470 ${m(189)},484 ${m(194)},493 C${m(202)},499 ${m(216)},499 ${m(224)},493 C${m(229)},484 ${m(229)},469 ${m(225)},459 C${m(214)},454 ${m(200)},454 ${m(190)},459 Z`;
  const fingers = [`M${m(193)},470 Q${m(208)},474 ${m(226)},469`, `M${m(192)},479 Q${m(208)},483 ${m(227)},478`, `M${m(194)},488 Q${m(208)},491 ${m(225)},487`]
    .map((p) => `<path d="${p}" fill="none" stroke="${OUT}" stroke-width="1.4"/>`).join('');
  return K.shaded(d, skin, { sx: 6, sy: 2, sw: 2.3, inner: fingers }) + K.shaded(`M${m(220)},459 C${m(230)},458 ${m(233)},468 ${m(228)},474 C${m(224)},477 ${m(218)},474 ${m(216)},468 Z`, skin, { sx: 3, sy: 1, sw: 1.8 });
}

function shieldAlmond(K, sc) {
  const d = 'M-100,42 C-101,14 -62,0 0,-2 C62,0 101,14 100,42 C99,140 62,238 0,330 C-62,238 -99,140 -100,42 Z';
  const curl = (y, s) => `M0,${y} C${-22 * s},${y - 8} ${-44 * s},${y + 8} ${-38 * s},${y + 30} C${-34 * s},${y + 44} ${-16 * s},${y + 42} ${-18 * s},${y + 28} C${-20 * s},${y + 20} ${-29 * s},${y + 22} ${-27 * s},${y + 29}`;
  const orn = [70, 140, 205].flatMap((y) => [curl(y, 1), curl(y, -1)]).join(' ') + ' M0,46 L0,282';
  const ornament = `<path d="${d}" transform="translate(0 16) scale(0.86)" fill="none" stroke="${OUT}" stroke-width="5"/><path d="${d}" transform="translate(0 16) scale(0.86)" fill="none" stroke="${GOLD.base}" stroke-width="2.5"/><path d="${orn}" fill="none" stroke="${OUT}" stroke-width="8" stroke-linecap="round"/><path d="${orn}" fill="none" stroke="${GOLD.base}" stroke-width="4.5" stroke-linecap="round"/><path d="M0,18 L9,32 L0,46 L-9,32 Z M0,280 C8,292 6,304 0,312 C-6,304 -8,292 0,280 Z" fill="${GOLD.base}" stroke="${OUT}" stroke-width="2"/>`;
  let s = K.patterned(d, `<path d="${d}" fill="${sc.base}"/>${ornament}`, { sx: 48, sy: 0, op: 0.3, sw: 0 });
  s += `<path d="${d}" fill="none" stroke="${OUT}" stroke-width="14"/><path d="${d}" fill="none" stroke="url(#rimgold)" stroke-width="9"/>`;
  const segs = [
    [[-100, 42], [-101, 14], [-62, 0], [0, -2]],
    [[0, -2], [62, 0], [101, 14], [100, 42]],
    [[100, 42], [99, 140], [62, 238], [0, 330]],
    [[0, 330], [-62, 238], [-99, 140], [-100, 42]]
  ];
  for (const [p0, p1, p2, p3] of segs) {
    for (const t of [0.25, 0.5, 0.75]) {
      const u = 1 - t;
      const x = u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0];
      const y = u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1];
      s += `<circle cx="${f(x)}" cy="${f(y)}" r="2.6" fill="${GOLD.light}" stroke="${OUT}" stroke-width="1"/>`;
    }
  }
  return `<g transform="translate(405 298) rotate(-3)">${s}</g>`;
}

function shieldRound(K, sc) {
  const r0 = 118;
  const d = `M${-r0},0 A${r0},${r0} 0 1 1 ${r0},0 A${r0},${r0} 0 1 1 ${-r0},0 Z`;
  const cream = mix(sc.base, '#eadcb4', 0.72);
  let paint = '';
  for (let i = 0; i < 8; i++) {
    const a0 = (i * Math.PI) / 4 - Math.PI / 2;
    const a1 = a0 + Math.PI / 4;
    paint += `<path d="M0,0 L${f(130 * Math.cos(a0))},${f(130 * Math.sin(a0))} Q${f(150 * Math.cos(a0 + 0.5))},${f(150 * Math.sin(a0 + 0.5))} ${f(130 * Math.cos(a1))},${f(130 * Math.sin(a1))} Z" fill="${i % 2 ? sc.base : cream}"/>`;
  }
  for (let x = -110; x <= 110; x += 22) paint += `<path d="M${x},-130 L${x},130" stroke="${OUT}" stroke-width="1" opacity="0.25"/>`;
  let s = K.patterned(d, paint, { sx: 40, sy: 6, op: 0.32, sw: 0 });
  s += `<path d="${d}" fill="none" stroke="${OUT}" stroke-width="13"/><path d="${d}" fill="none" stroke="${LEATHER.base}" stroke-width="8"/>`;
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    s += `<circle cx="${f(112 * Math.cos(a))}" cy="${f(112 * Math.sin(a))}" r="2.6" fill="${METAL.light}" stroke="${OUT}" stroke-width="1"/>`;
  }
  const boss = 'M-26,0 A26,26 0 1 1 26,0 A26,26 0 1 1 -26,0 Z';
  s += K.shaded(boss, METAL, { sx: 10, sy: 4, hx: 3, hy: 3, sw: 2.6, inner: '<ellipse cx="-8" cy="-9" rx="7" ry="5" transform="rotate(-30 -8 -9)" fill="#fff" opacity="0.8"/>' });
  return `<g transform="translate(410 420)">${s}</g>`;
}

export function renderWarrior(params = {}) {
  const P = { helmet: 'sphero_conical', armor: 'lamellar', shield: 'almond', cloak: '#a3241f', tunic: '#2c4a8a', shieldColor: '#a87a30', hairColor: 'grey', seed: 7, face: {}, view: '0 0 600 800', ...params };
  const r = rng(P.seed);
  const K = kit();
  const cloak = tone(P.cloak);
  const tunic = tone(P.tunic);
  const sc = tone(P.shieldColor);
  const hair = HAIR[P.hairColor];
  const skin = SKINS[{ ...FACE, ...P.face }.skin];
  const Lm = (x) => x;
  const Rm = (x) => 600 - x;
  const o = [];

  o.push(backdrop(r, [[470, 160, 90], [560, 270, 80], [520, 70, 70], [80, 420, 80], [40, 320, 60], [130, 540, 60], [545, 430, 70], [70, 170, 55], [300, 30, 60]]));

  const cloakD = 'M256,232 C220,236 190,250 176,280 C166,330 160,420 152,520 C146,600 136,700 126,812 L474,812 C464,700 454,600 448,520 C440,420 434,330 424,280 C410,250 380,236 344,232 Z';
  const cloakFolds = `<path d="M180,290 C172,380 164,500 154,620 C148,690 142,750 138,812 L172,812 C174,740 178,660 182,570 C186,470 188,370 180,290 Z" fill="${cloak.shadow}"/><path d="M196,300 C192,430 186,600 180,812 L194,812 C198,600 202,430 196,300 Z" fill="${cloak.light}" opacity="0.6"/><path d="M190,470 C186,600 182,720 178,812 L188,812 C190,720 194,600 190,470 Z" fill="${cloak.shadow}" opacity="0.9"/><path d="M162,560 C158,650 152,740 148,812 L154,812 C158,740 162,650 162,560 Z" fill="${cloak.light}" opacity="0.4"/><path d="M432,300 C442,420 450,600 460,812 L474,812 C464,600 452,420 432,300 Z" fill="${mix(cloak.shadow, '#000000', 0.3)}"/>`;
  o.push(K.shaded(cloakD, cloak, { sx: 22, sy: 0, hx: 5, hy: 0, sw: 3, inner: cloakFolds }));

  for (const [leg, boot] of [
    ['M250,628 L297,628 L294,726 L254,726 Z', 'M252,716 L296,716 C298,742 300,762 302,778 C303,790 294,796 280,796 L256,796 C246,794 245,780 247,764 C248,748 250,732 252,716 Z'],
    ['M303,628 L350,628 L346,726 L306,726 Z', 'M304,716 L348,716 C350,732 352,748 353,764 C355,780 354,794 344,796 L320,796 C306,796 297,790 298,778 C300,762 302,742 304,716 Z']
  ]) {
    o.push(K.shaded(leg, TROUSERS, { sx: 9, sy: 0 }));
    o.push(K.shaded(boot, BOOTS, { sx: 9, sy: 2, inner: `<rect x="240" y="716" width="120" height="9" fill="${BOOTS.light}" opacity="0.5"/>` }));
  }

  const skirtD = 'M222,496 L378,496 C390,556 400,606 408,650 Q300,670 192,650 C200,606 210,556 222,496 Z';
  const skirtInner = `<path d="M262,505 C258,560 250,610 240,660 L252,662 C260,612 266,560 268,505 Z" fill="${tunic.shadow}"/><path d="M300,505 C302,560 304,610 306,666 L318,665 C314,610 310,560 306,505 Z" fill="${tunic.shadow}"/><path d="M340,505 C346,560 354,610 366,662 L378,660 C368,610 356,560 346,505 Z" fill="${tunic.shadow}"/><path d="M232,520 C228,570 220,615 212,654 L220,656 C228,615 236,570 240,520 Z" fill="${tunic.light}"/><path d="M280,515 C278,570 276,615 274,664 L280,665 C282,615 284,570 286,515 Z" fill="${tunic.light}" opacity="0.7"/><path d="M188,643 Q300,663 412,643" fill="none" stroke="${OUT}" stroke-width="15"/><path d="M188,643 Q300,663 412,643" fill="none" stroke="${GOLD.base}" stroke-width="10"/><path d="M188,643 Q300,663 412,643" fill="none" stroke="${OUT}" stroke-width="2.2" stroke-dasharray="3 8"/>`;
  o.push(K.shaded(skirtD, tunic, { sx: 14, sy: 0, hx: 4, hy: 0, sw: 2.8, inner: skirtInner }));

  const torsoD = 'M232,248 Q300,240 368,248 L386,264 C390,320 386,380 376,430 C382,460 388,490 392,522 Q300,536 208,522 C212,490 218,460 224,430 C214,380 210,320 214,264 Z';
  const torso = {
    lamellar: lamellar(300, 98, 244, 540, 26, r),
    scale: scales(300, 98, 238, 540, 15, r),
    chainmail: MAIL + cylBands(300, 98, 230, 545)
  }[P.armor];
  o.push(K.patterned(torsoD, torso, { sx: 44, sy: 4, op: 0.4, sw: 3 }));

  o.push(K.shaded('M223,428 Q300,436 377,428 L378,446 Q300,454 222,446 Z', LEATHER, { sx: 10, sy: 0, sw: 2.4 }));
  for (let x = 236; x <= 366; x += 14) {
    if (Math.abs(x - 300) < 16) continue;
    o.push(`<circle cx="${x}" cy="${f(437 + 4 * (1 - ((x - 300) / 77) ** 2))}" r="2.6" fill="${GOLD.base}" stroke="${OUT}" stroke-width="0.9"/>`);
  }
  o.push(K.shaded('M303,448 L313,448 L315,502 Q309,508 303,502 Z', LEATHER, { sx: 4, sy: 0, sw: 2 }));
  o.push(`<path d="M302,494 L316,494 L316,503 Q309,512 302,503 Z" fill="${GOLD.base}" stroke="${OUT}" stroke-width="1.6"/>`);
  o.push(K.shaded('M289,430 L311,430 L311,451 L289,451 Z', GOLD, { sx: 4, sy: 0, sw: 2, inner: `<rect x="294" y="435" width="12" height="11" fill="${LEATHER.shadow}"/>` }));

  const swordInner = (y0, y1) => Array.from({ length: Math.floor((y1 - y0) / 4) }, (_, i) => `<path d="M-4,${y0 + i * 4} L4,${y0 + i * 4 + 2}" stroke="${OUT}" stroke-width="0.9"/>`).join('');
  o.push(`<g transform="translate(330 392) rotate(-17)">${K.shaded('M-7,36 L7,36 L5,250 Q0,258 -5,250 Z', LEATHER, { sx: 4, sy: 0, sw: 2.2 })}${K.shaded('M-8.5,36 L8.5,36 L8,54 L-8,54 Z', GOLD, { sx: 3, sy: 0, sw: 2 })}${K.shaded('M-6,228 L6,228 L5,250 Q0,262 -5,250 Z', GOLD, { sx: 3, sy: 0, sw: 2 })}${K.shaded('M-4,6 L4,6 L4,28 L-4,28 Z', LEATHER, { sx: 2, sy: 0, sw: 1.8, inner: swordInner(7, 28) })}${K.shaded('M-23,28 Q0,23 23,28 L23,35 Q0,31 -23,35 Z', GOLD, { sx: 4, sy: 0, sw: 2 })}${K.shaded('M-10,7 C-12,0 -8,-6 -4,-5 C-3,-10 3,-10 4,-5 C8,-6 12,0 10,7 Z', GOLD, { sx: 3, sy: 1, sw: 2 })}</g>`);

  const sleeveD = (m) => `M${m(234)},262 C${m(214)},256 ${m(198)},266 ${m(192)},290 C${m(187)},318 ${m(187)},348 ${m(190)},378 L${m(227)},380 C${m(229)},350 ${m(231)},322 ${m(235)},296 Z`;
  const paulD = (m) => `M${m(242)},256 C${m(218)},247 ${m(196)},257 ${m(188)},282 C${m(183)},300 ${m(183)},320 ${m(185)},338 L${m(232)},340 C${m(238)},312 ${m(244)},282 ${m(242)},256 Z`;
  const mailSleeveD = (m) => `M${m(242)},256 C${m(218)},247 ${m(196)},257 ${m(188)},282 C${m(183)},312 ${m(184)},346 ${m(187)},374 L${m(229)},376 C${m(233)},340 ${m(240)},300 ${m(242)},256 Z`;
  const shoulder = (m) => {
    if (P.armor === 'chainmail') return K.patterned(mailSleeveD(m), MAIL + cylBands(m(211), 26, 240, 380), { sx: 12, sy: 2, op: 0.32 });
    const content = P.armor === 'lamellar' ? lamellar(m(212), 30, 246, 350, 22, r) : scales(m(212), 30, 242, 350, 13, r);
    return K.patterned(paulD(m), content, { sx: 12, sy: 2, op: 0.32 });
  };
  const vambraceInner = (x0, y0, y1) => `<path d="M${x0 - 4},${y0} l50,-2" stroke="${LEATHER.base}" stroke-width="5"/><path d="M${x0 - 4},${y1} l50,-2" stroke="${LEATHER.base}" stroke-width="5"/><path d="M${x0 - 4},${y0 - 3} l50,-2 M${x0 - 4},${y0 + 3} l50,-2 M${x0 - 4},${y1 - 3} l50,-2 M${x0 - 4},${y1 + 3} l50,-2" stroke="${OUT}" stroke-width="1"/>`;

  const vambrace = (m) => {
    const x0 = Math.min(m(188), m(228));
    return K.shaded(`M${m(188)},384 Q${m(207)},379 ${m(228)},385 L${m(225)},449 Q${m(208)},453 ${m(191)},449 Z`, METAL, { sx: 9, sy: 0, inner: `${vambraceInner(x0, 401, 433)}<path d="M${x0 + 7},392 L${x0 + 8},444" stroke="#fff" stroke-width="2.5" opacity="0.7"/>` });
  };
  for (const m of [Lm, Rm]) {
    o.push(K.shaded(sleeveD(m), tunic, { sx: 9, sy: 0 }));
    o.push(shoulder(m));
    o.push(vambrace(m));
    o.push(K.shaded(`M${m(191)},447 L${m(225)},447 L${m(224)},461 L${m(192)},461 Z`, LEATHER, { sx: 5, sy: 0, sw: 2.2 }));
  }
  o.push(fist(K, Rm, skin));

  const helmet = helmetParts(K, P.helmet);
  o.push(helmet.back);
  o.push(face(K, P, hair, skin));
  o.push(helmet.front);

  o.push(stick(187, 210, 212, 515, 9, WOOD));
  o.push(`<g transform="translate(189 236) rotate(-4.7) scale(1.35)">${axeHead(K)}</g>`);
  o.push(fist(K, Lm, skin));

  if (P.shield === 'almond') o.push(shieldAlmond(K, sc));
  if (P.shield === 'round') o.push(shieldRound(K, sc));

  o.push(`<rect x="0" y="690" width="600" height="110" fill="url(#fogbottom)"/><g filter="url(#blur16)" fill="#2f2a27"><ellipse cx="300" cy="818" rx="360" ry="60" opacity="0.9"/><ellipse cx="110" cy="792" rx="160" ry="38" opacity="0.6"/><ellipse cx="490" cy="796" rx="170" ry="42" opacity="0.6"/></g>`);
  o.push(sparks(r, 90));
  return svg(K, o.join(''), P.view);
}

export function renderItemCard(params = {}) {
  const P = { item: 'helmet', helmet: 'sphero_conical', title: '', lines: [], seed: 3, ...params };
  const r = rng(P.seed);
  const K = kit();
  const o = [backdrop(r, [[480, 150, 80], [90, 200, 70], [520, 470, 70], [80, 520, 60]])];
  if (P.item === 'helmet') {
    const h = helmetParts(K, P.helmet, true);
    o.push(`<g transform="translate(300 330) scale(2.5) translate(-300 -170)">${h.back}${h.front}</g>`);
  } else if (P.item === 'axe') {
    o.push(`<g transform="translate(350 210) rotate(32) scale(1.9)">${stick(0, -20, 0, 190, 9, WOOD)}${axeHead(K)}</g>`);
  }
  o.push(`<rect x="0" y="560" width="600" height="240" fill="url(#fogbottom)"/>`);
  o.push(sparks(r, 40));
  o.push(`<rect x="10" y="10" width="580" height="780" rx="12" fill="none" stroke="${OUT}" stroke-width="6"/><rect x="16" y="16" width="568" height="768" rx="9" fill="none" stroke="${GOLD.base}" stroke-width="2.5"/>`);
  o.push(`<text x="300" y="652" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="30" fill="#eedbaa">${P.title}</text>`);
  o.push(`<path d="M150,674 L282,674 M318,674 L450,674" stroke="${GOLD.base}" stroke-width="1.6"/><path d="M300,666 L308,674 L300,682 L292,674 Z" fill="${GOLD.base}" stroke="${OUT}" stroke-width="1"/>`);
  P.lines.forEach((line, i) => o.push(`<text x="300" y="${712 + i * 28}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="19" fill="#c4ae86">${line}</text>`));
  return svg(K, o.join(''));
}

export { OUT, mix, f, rng, kit };

function svg(K, body, view = '0 0 600 800') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}" width="600" height="800"><defs>${commonDefs()}<linearGradient id="rimgold" gradientUnits="userSpaceOnUse" x1="-100" x2="100" y1="0" y2="0"><stop offset="0" stop-color="${GOLD.light}"/><stop offset="0.45" stop-color="${GOLD.base}"/><stop offset="1" stop-color="${GOLD.shadow}"/></linearGradient>${K.defs.join('')}</defs>${body}</svg>`;
}
