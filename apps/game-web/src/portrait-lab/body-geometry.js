import { cubicPoints, joinPointSets, quadraticPoints } from './handmade.js';
import { pointsToWorld } from './geometry-utils.js';

export function buildBodyGeometry(model) {
  const shoulders = model.armature.shoulders;
  const ribcage = model.armature.ribcage;
  const neckHalf = model.head.neckWidth * .58;
  const collarY = 486 + model.body.turn * 10;
  const neckTopY = model.head.cy + model.head.height * .43;
  const neckLeft = [model.head.cx - neckHalf, neckTopY];
  const neckRight = [model.head.cx + neckHalf, neckTopY];
  const collarLeft = [model.body.centerX - neckHalf * 1.22, collarY];
  const collarRight = [
    model.body.centerX + neckHalf * 1.22,
    collarY + model.body.turn * 8
  ];
  const leftShoulder = [shoulders.left.x, shoulders.left.y + 38];
  const rightShoulder = [shoulders.right.x, shoulders.right.y + 38];
  const leftBottom = [ribcage.cx - ribcage.radiusX * .92, 786];
  const rightBottom = [ribcage.cx + ribcage.radiusX * .92, 786];
  const leftOutline = joinPointSets(
    [[leftBottom[0], leftBottom[1]]],
    cubicPoints(
      leftBottom,
      [leftBottom[0] - 10, 690],
      [leftShoulder[0] - 12, 586],
      leftShoulder, 16
    ),
    cubicPoints(
      leftShoulder,
      [leftShoulder[0] + 58, leftShoulder[1] - 42],
      [model.body.centerX - 95, 460],
      collarLeft, 16
    )
  );
  const rightOutline = joinPointSets(
    [collarRight],
    cubicPoints(
      collarRight,
      [model.body.centerX + 96, 460],
      [rightShoulder[0] - 58, rightShoulder[1] - 42],
      rightShoulder, 16
    ),
    cubicPoints(
      rightShoulder,
      [rightShoulder[0] + 12, 590],
      [rightBottom[0] + 10, 690],
      rightBottom, 16
    )
  );
  const torsoPatch = [...leftOutline, ...rightOutline];
  return Object.freeze({
    torsoPatch,
    leftOutline,
    rightOutline,
    collarY,
    collarLeft,
    collarRight,
    neckPatch: [neckLeft, collarLeft, collarRight, neckRight],
    neckLeft: [neckLeft, collarLeft],
    neckRight: [neckRight, collarRight]
  });
}

export function buildHeadwearGeometry(model, head) {
  const kind = model.clothing.headwear;
  if (kind === 'none') {
    return Object.freeze({
      present: false, kind, patches: [], outer: [], inner: []
    });
  }
  const width = head.width;
  const height = head.height;
  if (kind === 'linen_cap') {
    const left = [-width * .49, -height * .21];
    const right = [width * .5, -height * .22];
    const outer = joinPointSets(
      cubicPoints(
        left,
        [-width * .42, -height * .54],
        [-width * .12, -height * .62],
        [3, -height * .59], 12
      ),
      cubicPoints(
        [3, -height * .59],
        [width * .23, -height * .6],
        [width * .45, -height * .48],
        right, 12
      )
    );
    const inner = quadraticPoints(left, [6, -height * .3], right, 14);
    return headwear(
      model, kind,
      [[...outer, ...[...inner].reverse()]],
      [outer],
      [inner]
    );
  }
  if (kind === 'fur_hat') {
    const outer = [
      [-width * .47, -height * .24],
      [-width * .34, -height * .66],
      [-width * .08, -height * .76],
      [width * .36, -height * .63],
      [width * .48, -height * .24]
    ];
    const inner = [
      [-width * .49, -height * .29],
      [0, -height * .22],
      [width * .49, -height * .29]
    ];
    return headwear(
      model, kind,
      [[...outer, ...[...inner].reverse()]],
      [outer],
      [inner]
    );
  }
  const outer = [
    [-width * .51, height * .32],
    [-width * .52, -height * .2],
    [-width * .38, -height * .56],
    [0, -height * .64],
    [width * .43, -height * .53],
    [width * .53, -height * .18],
    [width * .46, height * .34]
  ];
  const inner = [
    [-width * .29, height * .2],
    [-width * .31, -height * .16],
    [0, -height * .34],
    [width * .31, -height * .16],
    [width * .29, height * .2]
  ];
  const tail = [
    [width * .44, height * .24],
    [width * .64, height * .49],
    [width * .52, height * .76],
    [width * .39, height * .4]
  ];
  return headwear(
    model, kind,
    [[...outer, ...[...inner].reverse()], tail],
    [outer, [...tail, tail[0]]],
    [inner]
  );
}

function headwear(model, kind, patches, outer, inner) {
  return Object.freeze({
    present: true,
    kind,
    patches: Object.freeze(
      patches.map((points) => pointsToWorld(model, points))
    ),
    outer: Object.freeze(
      outer.map((points) => pointsToWorld(model, points))
    ),
    inner: Object.freeze(
      inner.map((points) => pointsToWorld(model, points))
    )
  });
}
