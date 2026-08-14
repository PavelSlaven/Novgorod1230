export function validateContractPaths(model, scene, limits, issues) {
  for (const [kind, entries] of Object.entries({
    stroke: [...scene.strokes, ...scene.hatches, ...scene.scratches],
    patch: scene.patches
  })) {
    const maxSegment = kind === 'patch'
      ? limits.patchSegment
      : limits.inkSegment;
    for (const entry of entries) {
      if (entry.points.some((point) => outsideCanvas(point, model, limits))) {
        issues.push(issue(
          'POINT_OUT_OF_BOUNDS',
          entry.part,
          `${entry.role} contains a point outside the drawing bounds.`
        ));
      }
      if (hasLongSegment(entry.points, maxSegment, kind === 'patch')) {
        issues.push(issue(
          'PATH_SEGMENT_TOO_LONG',
          entry.part,
          `${entry.role} contains a pathological segment jump.`
        ));
      }
      if (kind === 'patch' && selfIntersects(entry.points)) {
        issues.push(issue(
          'CONTOUR_SELF_INTERSECTION',
          entry.part,
          `${entry.role} contains a self-intersecting contour.`
        ));
      }
    }
  }
}

function outsideCanvas(point, model, limits) {
  const margin = limits.canvasMargin;
  return !Number.isFinite(point[0])
    || !Number.isFinite(point[1])
    || point[0] < -margin
    || point[0] > model.width + margin
    || point[1] < -margin
    || point[1] > model.height + margin;
}

function hasLongSegment(points, limit, closed) {
  const consecutive = points.slice(1).some(
    (point, index) => distance(point, points[index]) > limit
  );
  return consecutive || closed && distance(points.at(-1), points[0]) > limit;
}

function selfIntersects(input) {
  const points = distance(input[0], input.at(-1)) < .001
    ? input.slice(0, -1)
    : input;
  if (points.length < 4) return false;
  for (let left = 0; left < points.length; left += 1) {
    const leftNext = (left + 1) % points.length;
    for (let right = left + 1; right < points.length; right += 1) {
      const rightNext = (right + 1) % points.length;
      if (left === right || leftNext === right || rightNext === left) continue;
      if (segmentsIntersect(
        points[left], points[leftNext], points[right], points[rightNext]
      )) return true;
    }
  }
  return false;
}

function segmentsIntersect(a, b, c, d) {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return abC * abD < -.0001 && cdA * cdB < -.0001;
}

function cross(a, b, point) {
  return (b[0] - a[0]) * (point[1] - a[1])
    - (b[1] - a[1]) * (point[0] - a[0]);
}

function issue(code, part, message) {
  return { code, part, message };
}

function distance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}
