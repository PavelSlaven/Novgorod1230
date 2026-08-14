import { joinPointSets, quadraticPoints } from './handmade.js';
import { pointsToWorld } from './geometry-utils.js';

export function buildBraidGeometry(model, width, height) {
  if (model.spec.hair.style !== 'braided'
      || model.spec.hair.length === 'bald') {
    return emptyBraid();
  }
  const side = model.identity.variants.hair % 2 ? 1 : -1;
  const linkCount = model.spec.hair.length === 'long' ? 8
    : model.spec.hair.length === 'medium' ? 6 : 4;
  const step = height * .078;
  const startY = height * .04;
  const links = Array.from({ length: linkCount }, (_, index) => {
    const centerX = side * width * .47
      + (index % 2 ? -side : side) * width * .018;
    const centerY = startY + index * step;
    const radiusX = width * Math.max(.038, .06 - index * .0022);
    const radiusY = height * .052;
    const top = [centerX, centerY - radiusY];
    const bottom = [centerX, centerY + radiusY];
    return pointsToWorld(model, joinPointSets(
      quadraticPoints(
        top,
        [centerX + radiusX * 1.25, centerY - radiusY * .18],
        bottom,
        6
      ),
      quadraticPoints(
        bottom,
        [centerX - radiusX * 1.25, centerY + radiusY * .18],
        top,
        6
      )
    ));
  });
  const lead = pointsToWorld(model, quadraticPoints(
    [side * width * .42, -height * .35],
    [side * width * .6, -height * .24],
    [side * width * .5, startY - height * .052],
    9
  ));
  const endY = startY + (linkCount - 1) * step + height * .065;
  const endX = side * width * .47;
  const ties = [
    pointsToWorld(model, [
      [endX - width * .055, endY],
      [endX + width * .055, endY + height * .012]
    ]),
    pointsToWorld(model, [
      [endX, endY - height * .018],
      [endX + side * width * .025, endY + height * .07]
    ])
  ];
  return Object.freeze({
    present: true,
    lead,
    links: Object.freeze(links),
    ties: Object.freeze(ties)
  });
}

function emptyBraid() {
  const empty = Object.freeze([]);
  return Object.freeze({
    present: false,
    lead: empty,
    links: empty,
    ties: empty
  });
}
