import { deterministicUnit } from './render-model.js';

export function quadraticPoints(start, control, end, steps = 18) {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    const inverse = 1 - t;
    return [
      inverse * inverse * start[0] + 2 * inverse * t * control[0] + t * t * end[0],
      inverse * inverse * start[1] + 2 * inverse * t * control[1] + t * t * end[1]
    ];
  });
}

export function cubicPoints(start, controlA, controlB, end, steps = 22) {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    const inverse = 1 - t;
    return [
      inverse ** 3 * start[0]
        + 3 * inverse * inverse * t * controlA[0]
        + 3 * inverse * t * t * controlB[0]
        + t ** 3 * end[0],
      inverse ** 3 * start[1]
        + 3 * inverse * inverse * t * controlA[1]
        + 3 * inverse * t * t * controlB[1]
        + t ** 3 * end[1]
    ];
  });
}

export function joinPointSets(...sets) {
  return sets.flatMap((set, index) => index ? set.slice(1) : set);
}

export function fillHandmadePatch(context, points, {
  fill,
  seed,
  salt = 0,
  roughness = 2,
  alpha = 1
} = {}) {
  const wobbled = wobble(points, {
    seed, salt, amplitude: roughness, closed: true
  });
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = fill;
  trace(context, wobbled, true);
  context.fill();
  context.restore();
  return wobbled;
}

export function strokeHandmade(context, points, {
  color,
  seed,
  salt = 0,
  roughness = 1,
  width = 2.4,
  alpha = .92,
  closed = false,
  double = false
} = {}) {
  const first = wobble(points, { seed, salt, amplitude: roughness, closed });
  strokePass(context, first, { color, width, alpha, closed });
  if (double) {
    const second = wobble(points, {
      seed, salt: salt + 37, amplitude: roughness * .72, closed
    });
    strokePass(context, second, {
      color, width: Math.max(.7, width * .52), alpha: alpha * .34, closed
    });
  }
}

export function ellipsePoints(cx, cy, radiusX, radiusY, count = 36) {
  return Array.from({ length: count }, (_, index) => {
    const angle = index / count * Math.PI * 2;
    return [cx + Math.cos(angle) * radiusX, cy + Math.sin(angle) * radiusY];
  });
}

function wobble(points, { seed, salt, amplitude, closed }) {
  const phaseA = deterministicUnit(seed, salt) * Math.PI * 2;
  const phaseB = deterministicUnit(seed, salt + 1) * Math.PI * 2;
  const phaseC = deterministicUnit(seed, salt + 2) * Math.PI * 2;
  const count = points.length;
  return points.map((point, index) => {
    const previous = points[index === 0 ? (closed ? count - 1 : 0) : index - 1];
    const next = points[index === count - 1 ? (closed ? 0 : count - 1) : index + 1];
    const dx = next[0] - previous[0];
    const dy = next[1] - previous[1];
    const length = Math.hypot(dx, dy) || 1;
    const t = closed ? index / count : index / Math.max(1, count - 1);
    const offset = amplitude * (
      .58 * Math.sin(t * Math.PI * 2 + phaseA)
      + .29 * Math.sin(t * Math.PI * 4 + phaseB)
      + .13 * Math.sin(t * Math.PI * 6 + phaseC)
    );
    return [
      point[0] - dy / length * offset,
      point[1] + dx / length * offset
    ];
  });
}

function strokePass(context, points, { color, width, alpha, closed }) {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.globalAlpha = alpha;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  trace(context, points, closed);
  context.stroke();
  context.restore();
}

function trace(context, points, closed) {
  context.beginPath();
  context.moveTo(points[0][0], points[0][1]);
  for (const point of points.slice(1)) context.lineTo(point[0], point[1]);
  if (closed) context.closePath();
}
