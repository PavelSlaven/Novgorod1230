export function toWorld(model, point) {
  const cosine = Math.cos(model.head.rotation);
  const sine = Math.sin(model.head.rotation);
  return [
    model.head.cx + point[0] * cosine - point[1] * sine,
    model.head.cy + point[0] * sine + point[1] * cosine
  ];
}

export function pointsToWorld(model, points) {
  return points.map((point) => toWorld(model, point));
}
