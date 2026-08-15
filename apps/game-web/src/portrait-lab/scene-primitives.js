export const PORTRAIT_PARTS = Object.freeze([
  'head', 'face', 'eyes', 'nose', 'mouth', 'hair', 'beard',
  'body', 'clothing', 'headwear', 'background', 'finishing'
]);

const ROLE_PART = Object.freeze({
  neck: 'body',
  garment_silhouette: 'clothing',
  neckline: 'clothing',
  garment_boundary: 'clothing',
  fold: 'clothing',
  garment_trim: 'clothing',
  garment_texture: 'clothing',
  garment_wash: 'clothing',
  garment_underlayer: 'clothing',
  eye_white: 'eyes',
  eye: 'eyes',
  iris: 'eyes',
  pupil: 'eyes',
  eyelid: 'eyes',
  lash: 'eyes',
  eye_bag: 'eyes',
  brow: 'eyes',
  nose: 'nose',
  mouth: 'mouth',
  lower_lip: 'mouth',
  age_line: 'face',
  face_hatch: 'face',
  ear_mark: 'face',
  cheek_wash: 'face',
  hair: 'hair',
  hairline: 'hair',
  hair_hatch: 'hair',
  braid_lead: 'hair',
  braid_link: 'hair',
  braid_tie: 'hair',
  beard: 'beard',
  beard_hatch: 'beard',
  moustache: 'beard',
  headwear: 'headwear',
  headwear_boundary: 'headwear',
  finishing_scratch: 'finishing'
});

export function line(role, points, color, options = {}) {
  return primitive({ role, points, color, options });
}

export function patch(role, points, fill, options = {}) {
  return primitive({ role, points, fill, options });
}

function primitive({ role, points, color, fill, options }) {
  const { part = ROLE_PART[role], ...rest } = options;
  if (!PORTRAIT_PARTS.includes(part)) {
    throw new TypeError(`Portrait primitive ${role} requires a known part.`);
  }
  return Object.freeze({
    role,
    part,
    points,
    ...(color == null ? {} : { color }),
    ...(fill == null ? {} : { fill }),
    ...rest
  });
}

export function insetPatch(points, cx, cy, scale) {
  return points.map(([x, y]) => [
    cx + (x - cx) * scale,
    cy + (y - cy) * scale
  ]);
}

export function verticalSlice(points, minY, maxY) {
  if (points.length !== 2) {
    return points.filter((point) => point[1] >= minY && point[1] <= maxY);
  }
  const [start, end] = points;
  const y1 = Math.max(minY, Math.min(maxY, start[1]));
  const y2 = Math.max(minY, Math.min(maxY, end[1]));
  if (Math.abs(y2 - y1) < 1) return [];
  const atY = (y) => {
    const ratio = (y - start[1]) / (end[1] - start[1] || 1);
    return [start[0] + (end[0] - start[0]) * ratio, y];
  };
  return [atY(y1), atY(y2)];
}

export function slicePoints(points, startRatio, endRatio) {
  const start = Math.floor((points.length - 1) * startRatio);
  const end = Math.max(
    start + 1,
    Math.ceil((points.length - 1) * endRatio)
  );
  return points.slice(start, end + 1);
}
