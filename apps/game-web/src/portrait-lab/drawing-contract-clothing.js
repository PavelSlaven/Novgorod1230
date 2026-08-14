export function validateClothingContract(model, scene, limits, issues) {
  const clothing = scene.geometry.clothing;
  validateStructuralAnchors(clothing, limits, issues);
  validateClothingRegion(scene.geometry.body, clothing, limits, issues);
  validateSleeveConstruction(model, clothing, limits, issues);
  validateTrimAttachment(clothing, limits, issues);
  validateFoldOrigins(clothing, limits, issues);
  validateClothingOwnership(scene, clothing, issues);
  validateHiddenGarments(model, scene, limits, issues);
}
function validateSleeveConstruction(model, clothing, limits, issues) {
  const sleeveless = model.clothing.outer === 'sleeveless_overlayer';
  const prefix = sleeveless ? 'armhole' : 'sleeve';
  const paths = sleeveless ? clothing.outerBoundaries : clothing.seams;
  const expected = [
    ['left', clothing.anchors.shoulderLeft, clothing.anchors.waistLeft],
    ['right', clothing.anchors.shoulderRight, clothing.anchors.waistRight]
  ];
  const valid = expected.every(([side, shoulder, waist]) => {
    const path = paths.find((entry) => entry.id === `${prefix}_${side}`)?.points;
    return path && nearestPointDistance(shoulder, path) <= limits.clothingAnchor
      && Math.abs(path.at(-1)[1] - waist[1]) <= limits.clothingAnchor;
  });
  if (!valid) issues.push(issue(
    'CLOTHING_ANCHOR_INVALID',
    'Each visible sleeve or armhole must follow the anchored arm construction.'
  ));
}
function validateStructuralAnchors(clothing, limits, issues) {
  const structural = structuralPaths(clothing);
  const bodyAnchors = Object.values(clothing.anchors);
  const silhouetteAnchors = [
    [clothing.anchors.shoulderLeft, clothing.silhouette.left],
    [clothing.anchors.underarmLeft, clothing.silhouette.left],
    [clothing.anchors.shoulderRight, clothing.silhouette.right],
    [clothing.anchors.underarmRight, clothing.silhouette.right]
  ];
  if (silhouetteAnchors.some(([anchor, path]) => (
    nearestPointDistance(anchor, path) > limits.clothingAnchor
  ))) {
    issues.push(issue(
      'CLOTHING_ANCHOR_INVALID',
      'Sleeve and shoulder geometry must stay within its body anchors.'
    ));
  }
  for (const entry of structural) {
    const endpoints = [entry.points[0], entry.points.at(-1)];
    const touchesBody = endpoints.some(
      (point) => nearestPointDistance(point, bodyAnchors)
        <= limits.clothingAnchor
    );
    const touchesOwned = endpoints.some((point) => structural.some(
      (candidate) => candidate !== entry
        && nearestPathDistance(point, candidate.points)
          <= limits.clothingAnchor
    ));
    if (!touchesBody && !touchesOwned) {
      issues.push(issue(
        'CLOTHING_ANCHOR_INVALID',
        `${entry.id} must connect to a body anchor or owned boundary.`
      ));
    }
  }
}

function validateClothingRegion(body, clothing, limits, issues) {
  const envelope = body.torsoPatch;
  const points = [
    ...structuralPaths(clothing).flatMap((entry) => entry.points),
    ...clothing.folds.flatMap((entry) => entry.points),
    ...clothing.trim.flatMap((entry) => entry.points),
    ...clothing.texture.flatMap((entry) => entry.points),
    ...clothing.patches.flatMap((entry) => entry.points)
  ];
  if (points.some((point) => !pointInsidePolygon(point, envelope)
      && nearestPathDistance(point, envelope) > limits.clothingRegionMargin)) {
    issues.push(issue(
      'CLOTHING_REGION_VIOLATION',
      'Garment geometry must remain inside the torso and shoulder envelope.'
    ));
  }
}

function validateTrimAttachment(clothing, limits, issues) {
  for (const entry of clothing.trim) {
    const boundary = clothing.boundaries.find(
      (candidate) => candidate.id === entry.boundaryId
    );
    if (!boundary || entry.points.some((point) => (
      nearestPathDistance(point, boundary.points) > limits.trimAttachment
    ))) {
      issues.push(issue(
        'TRIM_ATTACHMENT_INVALID',
        `${entry.kind} trim must follow its garment boundary.`
      ));
    }
  }
}

function validateFoldOrigins(clothing, limits, issues) {
  const allowed = new Set(['neckline', 'shoulder', 'underarm', 'closure']);
  for (const entry of clothing.folds) {
    const region = clothing.tensionRegions[entry.origin] ?? [];
    if (!allowed.has(entry.origin)
        || nearestPointDistance(entry.points[0], region) > limits.foldOrigin) {
      issues.push(issue(
        'FOLD_ORIGIN_INVALID',
        'Every fold must begin in a permitted clothing tension region.'
      ));
    }
  }
}

function validateClothingOwnership(scene, clothing, issues) {
  const silhouettes = scene.strokes.filter(
    (entry) => entry.role === 'garment_silhouette'
  );
  const expected = [clothing.silhouette.left, clothing.silhouette.right];
  const valid = silhouettes.length === 2
    && silhouettes.every((entry) => (
      entry.owner === clothing.owner
        && entry.owner === scene.visibility.torsoOwner
    ))
    && expected.every((path) => silhouettes.some(
      (entry) => pathsEqual(entry.points, path)
    ));
  const wrongPatchOwner = scene.patches.some((entry) => (
    ['garment_wash', 'garment_underlayer'].includes(entry.role)
      && entry.owner !== clothing.owner
  ));
  if (!valid || wrongPatchOwner) {
    issues.push(issue(
      'CLOTHING_OWNER_CONFLICT',
      'Exactly one clothing owner must provide both torso silhouettes.'
    ));
  }
}

function validateHiddenGarments(model, scene, limits, issues) {
  const hiddenNecklineVisible = scene.visibility.hidden.necklineCenter
    && scene.strokes.some((entry) => entry.role === 'neckline'
      && scene.geometry.clothing.neckline.some(
        (boundary) => pathsEqual(entry.points, boundary.points)
      ));
  if (hiddenNecklineVisible) {
    issues.push(issue(
      'HIDDEN_GARMENT_VISIBLE',
      'A beard-hidden neckline segment must be omitted from the scene.'
    ));
  }
  if (model.clothing.outer === 'none') {
    if (scene.patches.some((entry) => entry.role === 'garment_underlayer')) {
      issues.push(issue(
        'HIDDEN_GARMENT_VISIBLE',
        'A base garment without an outer layer cannot expose an underlayer.'
      ));
    }
    return;
  }
  const fullBase = scene.patches.some((entry) => (
    entry.part === 'clothing'
      && entry.layer === 'base'
      && entry.role !== 'garment_underlayer'
  ));
  const shoulderSpan = Math.abs(
    scene.geometry.body.anchors.shoulderRight[0]
      - scene.geometry.body.anchors.shoulderLeft[0]
  );
  const torsoHeight = Math.abs(
    scene.geometry.body.anchors.waistLeft[1]
      - scene.geometry.body.anchors.collarLeft[1]
  );
  const oversizedUnderlayer = scene.patches
    .filter((entry) => entry.role === 'garment_underlayer')
    .some((entry) => {
      const box = bounds(entry.points);
      return box.width > shoulderSpan * limits.underlayerWidth
        || box.height > torsoHeight * limits.underlayerHeight;
    });
  const mainPatches = scene.patches.filter(
    (entry) => entry.role === 'garment_wash'
  );
  const overlappingUnderlayer = scene.patches
    .filter((entry) => entry.role === 'garment_underlayer')
    .some((underlayer) => mainPatches.some(
      (main) => polygonsOverlap(underlayer.points, main.points)
    ));
  if (fullBase || oversizedUnderlayer || overlappingUnderlayer) {
    issues.push(issue(
      'HIDDEN_GARMENT_VISIBLE',
      'An outer garment may expose only a narrow local base underlayer.'
    ));
  }
}

function structuralPaths(clothing) {
  return [
    { id: 'silhouette_left', points: clothing.silhouette.left },
    { id: 'silhouette_right', points: clothing.silhouette.right },
    ...clothing.neckline,
    ...clothing.seams,
    ...clothing.outerBoundaries
  ];
}

function bounds(points) {
  const xs = points.map((point) => point[0]);
  const ys = points.map((point) => point[1]);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  };
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

function polygonsOverlap(left, right) {
  if (left.some((point) => pointInsidePolygon(point, right))
      || right.some((point) => pointInsidePolygon(point, left))) {
    return true;
  }
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      if (segmentsCross(
        left[leftIndex], left[(leftIndex + 1) % left.length],
        right[rightIndex], right[(rightIndex + 1) % right.length]
      )) return true;
    }
  }
  return false;
}

function segmentsCross(start, end, otherStart, otherEnd) {
  const first = orientation(start, end, otherStart)
    * orientation(start, end, otherEnd);
  const second = orientation(otherStart, otherEnd, start)
    * orientation(otherStart, otherEnd, end);
  return first < 0 && second < 0;
}

function orientation(start, end, point) {
  return (end[0] - start[0]) * (point[1] - start[1])
    - (end[1] - start[1]) * (point[0] - start[0]);
}

function nearestPointDistance(point, candidates) {
  if (!point || !candidates.length) return Number.POSITIVE_INFINITY;
  return Math.min(...candidates.map((candidate) => distance(point, candidate)));
}

function nearestPathDistance(point, path) {
  if (!point || !path.length) return Number.POSITIVE_INFINITY;
  let nearest = nearestPointDistance(point, path);
  for (let index = 1; index < path.length; index += 1) {
    nearest = Math.min(nearest, pointSegmentDistance(
      point, path[index - 1], path[index]
    ));
  }
  return nearest;
}

function pointSegmentDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const squared = dx * dx + dy * dy;
  if (!squared) return distance(point, start);
  const ratio = Math.max(0, Math.min(1, (
    (point[0] - start[0]) * dx + (point[1] - start[1]) * dy
  ) / squared));
  return distance(point, [start[0] + dx * ratio, start[1] + dy * ratio]);
}

function pathsEqual(left, right) {
  return left.length === right.length && left.every(
    (point, index) => distance(point, right[index]) < .0001
  );
}

function distance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function issue(code, message) {
  return { code, part: 'clothing', message };
}
