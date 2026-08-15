import { validateFaceRegions } from './drawing-contract-face.js';

export function validateContractRegions(model, scene, limits, issues) {
  validateHairAnchors(scene.geometry.hair, limits, issues);
  validateHeadwearAnchors(
    scene.geometry.headwear,
    scene.geometry.head,
    limits,
    issues
  );
  validateFaceRegions(model, scene, limits, issues);
}

function validateHairAnchors(hair, limits, issues) {
  if (hair.present && hair.outer.length >= 2) {
    const crown = hair.outer[0];
    const crownAnchors = [crown[0], crown.at(-1)];
    for (const side of hair.outer.slice(1)) {
      const nearest = Math.min(
        ...crownAnchors.map((anchor) => distance(side[0], anchor))
      );
      if (nearest > limits.hairAnchor) {
        issues.push(issue(
          'HAIR_ANCHOR_INVALID',
          'hair',
          'A visible hair side must start on the crown hair region.'
        ));
      }
    }
  }

  if (!hair.braid.present) return;
  const leadStart = hair.braid.lead[0];
  const leadEnd = hair.braid.lead.at(-1);
  const firstLink = hair.braid.links[0]?.[0];
  const hairlineDistance = nearestDistance(leadStart, hair.hairline);
  if (!hair.present
      || !leadStart
      || !leadEnd
      || !firstLink
      || hairlineDistance > limits.braidAnchor
      || distance(leadEnd, firstLink) > 18) {
    issues.push(issue(
      'BRAID_ANCHOR_INVALID',
      'hair',
      'A braid must start in the hair region and connect to its first link.'
    ));
  }
}

function validateHeadwearAnchors(headwear, head, limits, issues) {
  if (!headwear.present) return;
  const primary = [...headwear.outer[0], ...headwear.inner.flat()];
  const headBoundary = [
    ...head.crown,
    ...head.leftSide,
    ...head.leftJaw,
    ...head.rightJaw,
    ...head.rightSide
  ];
  const anchorPoints = headwear.inner.flatMap(
    (contour) => [contour[0], contour.at(-1)]
  );
  const anchored = anchorPoints.length >= 2 && anchorPoints.every(
    (point) => pointInsidePolygon(point, head.patch)
      || nearestDistance(point, headBoundary) <= limits.headwearAnchor + 2
  );
  if (!primary.length || !anchored) {
    issues.push(issue(
      'HEADWEAR_ANCHOR_INVALID',
      'headwear',
      'Headwear must touch the head boundary.'
    ));
  }
  if (headwear.kind !== 'headscarf') {
    const seam = [headwear.outer[0][0], headwear.outer[0].at(-1)];
    const temples = [head.leftSide[0], head.rightSide.at(-1)];
    if (seam.some((point, index) => (
      distance(point, temples[index]) > limits.headwearAnchor + 6
    ))) {
      issues.push(issue(
        'HEADWEAR_SEAM_DETACHED',
        'headwear',
        'A cap or hat seam must meet both head temples.'
      ));
    }
  }

  for (const contour of headwear.outer.slice(1)) {
    if (distance(contour[0], contour.at(-1)) < 1) {
      issues.push(issue(
        'ATTACHMENT_CONTOUR_CLOSED',
        'headwear',
        'A secondary headwear attachment must remain an open contour.'
      ));
    }
    if (nearestDistance(contour[0], primary) > limits.headwearAnchor) {
      issues.push(issue(
        'HEADWEAR_ATTACHMENT_INVALID',
        'headwear',
        'A secondary headwear attachment must start on the headwear.'
      ));
    }
  }
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

function nearestDistance(point, candidates) {
  if (!point || !candidates.length) return Number.POSITIVE_INFINITY;
  return Math.min(...candidates.map((candidate) => distance(point, candidate)));
}

function issue(code, part, message) {
  return { code, part, message };
}

function distance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}
