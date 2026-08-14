const FACE_ZONES = Object.freeze({
  eyes: Object.freeze({
    roles: Object.freeze([
      'eye_white', 'eye', 'iris', 'pupil', 'eyelid', 'lash', 'eye_bag', 'brow'
    ]),
    minX: -.58, maxX: .58, minY: -.4, maxY: .18
  }),
  nose: Object.freeze({
    roles: Object.freeze(['nose']),
    minX: -.34, maxX: .34, minY: -.14, maxY: .3
  }),
  mouth: Object.freeze({
    roles: Object.freeze(['mouth', 'lower_lip']),
    minX: -.4, maxX: .4, minY: .17, maxY: .5
  })
});

const FORBIDDEN_FACE_REGION = Object.freeze({
  minX: -.22, maxX: .22, minY: -.08, maxY: .43
});

export function validateFaceRegions(model, scene, limits, issues) {
  validateForbiddenFaceIntersections(model, scene, issues);
  validateBrowClearance(scene, issues);
  validateFaceFeatures(model, scene, limits, issues);
}

function validateFaceFeatures(model, scene, limits, issues) {
  const entries = [...scene.strokes, ...scene.hatches, ...scene.patches];
  for (const [zoneName, zone] of Object.entries(FACE_ZONES)) {
    const matching = entries.filter((entry) => zone.roles.includes(entry.role));
    for (const entry of matching) {
      const outside = entry.points.some((point) => {
        const [x, y] = toHeadLocal(model, point);
        return x < model.head.width * zone.minX
          || x > model.head.width * zone.maxX
          || y < model.head.height * zone.minY
          || y > model.head.height * zone.maxY;
      });
      if (outside) {
        issues.push(issue(
          'FACE_REGION_VIOLATION',
          zoneName,
          `${entry.role} must remain inside the ${zoneName} face region.`
        ));
        break;
      }
    }
  }

  const eyeY = averageLocalY(model, entries, ['eye']);
  const noseY = averageLocalY(model, entries, ['nose']);
  const mouthY = averageLocalY(model, entries, ['mouth']);
  if (!(eyeY < noseY && noseY < mouthY)) {
    issues.push(issue(
      'FACE_ORDER_INVALID',
      'face',
      'Eyes, nose and mouth must keep their vertical face order.'
    ));
  }
  const noseBottom = extremeLocalY(model, entries, ['nose'], Math.max);
  const mouthTop = extremeLocalY(model, entries, ['mouth'], Math.min);
  if (mouthTop - noseBottom < limits.featureGap) {
    issues.push(issue(
      'NOSE_MOUTH_GAP_INVALID',
      'face',
      'The mouth must keep a visible anatomical gap below the nose.'
    ));
  }
}

function averageLocalY(model, entries, roles) {
  const points = entries
    .filter((entry) => roles.includes(entry.role))
    .flatMap((entry) => entry.points);
  return points.reduce(
    (total, point) => total + toHeadLocal(model, point)[1],
    0
  ) / points.length;
}

function extremeLocalY(model, entries, roles, operation) {
  const values = entries
    .filter((entry) => roles.includes(entry.role))
    .flatMap((entry) => entry.points)
    .map((point) => toHeadLocal(model, point)[1]);
  return operation(...values);
}

function validateForbiddenFaceIntersections(model, scene, issues) {
  const region = {
    minX: model.head.width * FORBIDDEN_FACE_REGION.minX,
    maxX: model.head.width * FORBIDDEN_FACE_REGION.maxX,
    minY: model.head.height * FORBIDDEN_FACE_REGION.minY,
    maxY: model.head.height * FORBIDDEN_FACE_REGION.maxY
  };
  const entries = [
    ...scene.strokes,
    ...scene.hatches,
    ...scene.patches
  ].filter((entry) => ['hair', 'headwear'].includes(entry.part));
  for (const entry of entries) {
    const local = entry.points.map((point) => toHeadLocal(model, point));
    const closed = Object.hasOwn(entry, 'fill');
    if (pathIntersectsRegion(local, region, closed)) {
      issues.push(issue(
        'FORBIDDEN_FACE_INTERSECTION',
        entry.part,
        `${entry.role} must not enter the central face region.`
      ));
    }
  }
}

function validateBrowClearance(scene, issues) {
  const occluders = [
    ...scene.strokes,
    ...scene.hatches,
    ...scene.patches
  ].filter((entry) => ['hair', 'headwear'].includes(entry.part));
  for (const brow of scene.strokes.filter((entry) => entry.role === 'brow')) {
    const xs = brow.points.map((point) => point[0]);
    const ys = brow.points.map((point) => point[1]);
    const margin = 4;
    const envelope = {
      minX: Math.min(...xs) - margin,
      maxX: Math.max(...xs) + margin,
      minY: Math.min(...ys) - margin,
      maxY: Math.max(...ys) + margin
    };
    if (occluders.some((entry) => pathIntersectsRegion(
      entry.points,
      envelope,
      Object.hasOwn(entry, 'fill')
    ))) {
      issues.push(issue(
        'BROW_OCCLUSION_CONFLICT',
        'eyes',
        'Hair and headwear must not overlap visible brow ink.'
      ));
      return;
    }
  }
}

function pathIntersectsRegion(points, region, closed) {
  if (points.some((point) => pointInsideRegion(point, region))) return true;
  const corners = [
    [region.minX, region.minY],
    [region.maxX, region.minY],
    [region.maxX, region.maxY],
    [region.minX, region.maxY]
  ];
  if (closed && corners.some((point) => pointInsidePolygon(point, points))) {
    return true;
  }
  const segmentCount = closed ? points.length : points.length - 1;
  for (let index = 0; index < segmentCount; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    for (let edge = 0; edge < corners.length; edge += 1) {
      if (segmentsIntersect(
        start,
        end,
        corners[edge],
        corners[(edge + 1) % corners.length]
      )) return true;
    }
  }
  return false;
}

function pointInsideRegion([x, y], region) {
  return x >= region.minX && x <= region.maxX
    && y >= region.minY && y <= region.maxY;
}

function pointInsidePolygon([x, y], polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1;
    index < polygon.length;
    previous = index, index += 1) {
    const [x1, y1] = polygon[index];
    const [x2, y2] = polygon[previous];
    if ((y1 > y) !== (y2 > y)
        && x < (x2 - x1) * (y - y1) / (y2 - y1) + x1) {
      inside = !inside;
    }
  }
  return inside;
}

function toHeadLocal(model, point) {
  const cosine = Math.cos(model.head.rotation);
  const sine = Math.sin(model.head.rotation);
  const dx = point[0] - model.head.cx;
  const dy = point[1] - model.head.cy;
  return [dx * cosine + dy * sine, -dx * sine + dy * cosine];
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
