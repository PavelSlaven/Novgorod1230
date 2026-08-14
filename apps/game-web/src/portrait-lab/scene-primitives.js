export function line(role, points, color, options = {}) {
  return Object.freeze({ role, points, color, ...options });
}

export function patch(role, points, fill, options = {}) {
  return Object.freeze({ role, points, fill, ...options });
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
