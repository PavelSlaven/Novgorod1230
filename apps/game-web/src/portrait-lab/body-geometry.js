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
  const torsoPatch = [
    ...leftOutline,
    ...rightOutline,
    [ribcage.cx, 786]
  ];
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
    const left = [-width * .49, -height * .1];
    const right = [width * .5, -height * .11];
    const outer = joinPointSets(
      cubicPoints(
        left,
        [-width * .55, -height * .32],
        [-width * .46, -height * .56],
        [3, -height * .59], 12
      ),
      cubicPoints(
        [3, -height * .59],
        [width * .48, -height * .58],
        [width * .56, -height * .34],
        right, 12
      )
    );
    const innerLeft = [-width * .42, -height * .35];
    const innerRight = [width * .43, -height * .35];
    const inner = joinPointSets(
      quadraticPoints(
        left, [-width * .5, -height * .27], innerLeft, 6
      ),
      quadraticPoints(
        innerLeft, [6, -height * .46], innerRight, 10
      ),
      quadraticPoints(
        innerRight, [width * .5, -height * .27], right, 6
      )
    );
    return headwear(
      model, kind,
      [[...outer, ...[...inner].reverse()]],
      [outer],
      [inner]
    );
  }
  if (kind === 'fur_hat') {
    const left = [-width * .47, -height * .1];
    const right = [width * .48, -height * .1];
    const outer = [
      left,
      [-width * .55, -height * .3],
      [-width * .48, -height * .56],
      [-width * .2, -height * .72],
      [width * .25, -height * .72],
      [width * .5, -height * .55],
      [width * .56, -height * .3],
      right
    ];
    const inner = [
      left,
      [-width * .48, -height * .27],
      [-width * .42, -height * .35],
      [0, -height * .43],
      [width * .42, -height * .35],
      [width * .49, -height * .27],
      right
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
    [-width * .515, height * .06],
    [-width * .52, -height * .2],
    [-width * .46, -height * .56],
    [0, -height * .64],
    [width * .48, -height * .53],
    [width * .53, -height * .18],
    [width * .495, height * .08],
    [width * .46, height * .34]
  ];
  const inner = [
    [-width * .42, height * .2],
    [-width * .5, -height * .08],
    [-width * .49, -height * .28],
    [0, -height * .43],
    [width * .49, -height * .28],
    [width * .5, -height * .08],
    [width * .42, height * .2]
  ];
  return headwear(
    model, kind,
    [[...outer, ...[...inner].reverse()]],
    [outer],
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
