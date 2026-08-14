import {
  cubicPoints,
  joinPointSets,
  quadraticPoints
} from './handmade.js';
import {
  buildBodyGeometry,
  buildHeadwearGeometry
} from './body-geometry.js';
import { buildBraidGeometry } from './braid-geometry.js';
import { pointsToWorld, toWorld } from './geometry-utils.js';

export { pointsToWorld, toWorld } from './geometry-utils.js';

export function buildPortraitGeometry(model) {
  const head = buildHeadGeometry(model);
  const hair = buildHairGeometry(model, head);
  const beard = buildBeardGeometry(model, head);
  const body = buildBodyGeometry(model);
  const headwear = buildHeadwearGeometry(model, head);
  return Object.freeze({ head, hair, beard, body, headwear });
}

function buildHeadGeometry(model) {
  const width = model.head.width;
  const height = model.head.height;
  const asymmetry = model.identity.asymmetry;
  const left = width * (.49 + asymmetry.faceLeft);
  const right = width * (.5 + asymmetry.faceRight);
  const leftJawX = left * model.head.jaw;
  const rightJawX = right * model.head.jaw;
  const oldSag = model.age.sag * 9;
  const top = [(model.identity.variants.contour - 1.5) * 7, -height * .505];
  const leftTemple = [-left, -height * .1];
  const rightTemple = [right, -height * .11];
  const leftJawPoint = [-leftJawX, height * .38 + oldSag];
  const rightJawPoint = [rightJawX, height * .375 + oldSag * .45];
  const chin = [
    asymmetry.mouth * .7 + model.head.faceAxisX * .22,
    height * (.515 + model.age.sag * .018)
  ];
  const leftBeardStart = [-left * .92, height * .205 + asymmetry.beard[0]];
  const rightBeardStart = [right * .92, height * .2 + asymmetry.beard[1]];

  const crown = joinPointSets(
    cubicPoints(
      leftTemple,
      [-left, -height * .36],
      [-left * .6, -height * .51],
      top, 16
    ),
    cubicPoints(
      top,
      [right * .61, -height * .51],
      [right, -height * .38],
      rightTemple, 16
    )
  );
  const leftSide = cubicPoints(
    leftTemple,
    [-left * 1.03, height * .12],
    [-leftJawX * 1.08, height * .29],
    leftJawPoint, 15
  );
  const leftJaw = cubicPoints(
    leftJawPoint,
    [-leftJawX * .64, height * .49],
    [chin[0] - width * .15, height * .53],
    chin, 13
  );
  const rightJaw = cubicPoints(
    chin,
    [chin[0] + width * .16, height * .53],
    [rightJawX * .66, height * .48],
    rightJawPoint, 13
  );
  const rightSide = cubicPoints(
    rightJawPoint,
    [rightJawX * 1.08, height * .28],
    [right * 1.02, height * .11],
    rightTemple, 15
  );
  const patch = pointsToWorld(model, joinPointSets(
    crown,
    [...rightSide].reverse(),
    [...rightJaw].reverse(),
    [...leftJaw].reverse(),
    [...leftSide].reverse()
  ));

  return Object.freeze({
    width,
    height,
    patch,
    crown: pointsToWorld(model, crown),
    leftSide: pointsToWorld(model, leftSide),
    leftJaw: pointsToWorld(model, leftJaw),
    rightJaw: pointsToWorld(model, rightJaw),
    rightSide: pointsToWorld(model, rightSide),
    leftBeardStart: toWorld(model, leftBeardStart),
    rightBeardStart: toWorld(model, rightBeardStart),
    chin: toWorld(model, chin),
    local: Object.freeze({
      top, leftTemple, rightTemple,
      leftJaw: leftJawPoint,
      rightJaw: rightJawPoint,
      leftBeardStart, rightBeardStart, chin
    })
  });
}

function buildHairGeometry(model, head) {
  const braid = buildBraidGeometry(model, head.width, head.height);
  if (model.spec.hair.length === 'bald') {
    const empty = Object.freeze([]);
    return Object.freeze({
      present: false,
      patches: empty,
      outer: empty,
      hairline: empty,
      strands: empty,
      crownStrands: empty,
      sideStrands: empty,
      braid
    });
  }
  const width = head.width;
  const height = head.height;
  const jitter = model.identity.asymmetry.hair;
  const recede = model.age.category === 'old' ? .095
    : model.age.category === 'middle_aged' ? .045 : 0;
  const hairlineY = -height * (.35 + recede * .75);
  const leftEdge = [-width * .52, -height * .2];
  const rightEdge = [width * .53, -height * .22];
  const top = [jitter[4], -height * (.54 - recede * .15)];
  const crown = joinPointSets(
    cubicPoints(leftEdge, [-width * .44, -height * .45], [-width * .2, -height * .57], top, 13),
    cubicPoints(top, [width * .2, -height * .58], [width * .46, -height * .44], rightEdge, 13)
  );
  const hairline = Array.from({ length: 11 }, (_, index) => {
    const ratio = index / 10;
    return [
      -width * .36 + ratio * width * .72,
      hairlineY + jitter[index % 7] * .5
        + (index % 2 ? 4 : -2) + Math.abs(ratio - .5) * 7
    ];
  });
  const crownWash = crown.filter((point) => (
    point[1] <= hairlineY - height * .015
  ));
  const crownPatch = pointsToWorld(model, [
    ...crownWash,
    ...[...hairline].reverse()
  ]);
  const patches = [crownPatch];
  const outer = [pointsToWorld(model, crown)];
  const crownStrokeGuides = crownStrands(model, width, height, hairlineY);
  const sideStrokeGuides = [];

  if (model.spec.hair.length !== 'short'
      && model.spec.hair.style !== 'braided') {
    const long = model.spec.hair.length === 'long';
    const bottom = height * (long ? .79 : .5);
    const leftOuter = cubicPoints(
      leftEdge,
      [-width * .62, -height * .02],
      [-width * .53, bottom * .72],
      [-width * .4, bottom + jitter[1]], 15
    );
    const rightOuter = cubicPoints(
      rightEdge,
      [width * .62, -height * .02],
      [width * .54, bottom * .72],
      [width * .4, bottom + jitter[2]], 15
    );
    const leftInner = cubicPoints(
      [-width * .33, bottom - 8],
      [-width * .35, height * .27],
      [-width * .39, -height * .02],
      leftEdge, 12
    );
    const rightInner = cubicPoints(
      rightEdge,
      [width * .4, -height * .02],
      [width * .36, height * .27],
      [width * .33, bottom - 5], 12
    );
    patches.push(pointsToWorld(model, joinPointSets(leftOuter, [[-width * .33, bottom - 8]], leftInner)));
    patches.push(pointsToWorld(model, joinPointSets(rightOuter, [[width * .33, bottom - 5]], [...rightInner].reverse())));
    outer.push(pointsToWorld(model, leftOuter));
    outer.push(pointsToWorld(model, rightOuter));
    sideStrokeGuides.push(...sideHairStrands(model, width, height, bottom));
  }

  return Object.freeze({
    present: true,
    patches: Object.freeze(patches),
    outer: Object.freeze(outer),
    hairline: pointsToWorld(model, hairline),
    strands: Object.freeze([...crownStrokeGuides, ...sideStrokeGuides]),
    crownStrands: Object.freeze(crownStrokeGuides),
    sideStrands: Object.freeze(sideStrokeGuides),
    braid
  });
}

function crownStrands(model, width, height, hairlineY) {
  const braided = model.spec.hair.style === 'braided';
  const count = model.spec.hair.style === 'straight' ? 8 : braided ? 7 : 12;
  const wavy = ['wavy', 'loose'].includes(model.spec.hair.style);
  const braidSide = model.identity.variants.hair % 2 ? 1 : -1;
  return Array.from({ length: count }, (_, index) => {
    const ratio = index / Math.max(1, count - 1);
    const x = -width * .4 + ratio * width * .8;
    const bend = braided
      ? braidSide * width * (.12 + ratio * .09)
      : wavy ? (index % 2 ? 16 : -14) : 0;
    const endX = braided
      ? x * .35 + braidSide * width * .24
      : x;
    return pointsToWorld(model, quadraticPoints(
      [x * .72, -height * (.47 + index % 3 * .015)],
      [x + bend, -height * .34],
      [endX, hairlineY + Math.abs(ratio - .5) * 7], 11
    ));
  });
}

function sideHairStrands(model, width, height, bottom) {
  return Array.from({ length: 6 }, (_, index) => {
    const side = index % 2 ? 1 : -1;
    const lane = Math.floor(index / 2);
    return pointsToWorld(model, quadraticPoints(
      [side * width * (.37 + lane * .025), -height * .12 + lane * 12],
      [side * width * (.48 + lane * .02), bottom * .42],
      [side * width * (.31 + lane * .02), bottom - lane * 13], 15
    ));
  });
}

function buildBeardGeometry(model, head) {
  const style = model.spec.hair.facial_hair;
  if (style !== 'short_beard' && style !== 'full_beard') {
    return Object.freeze({ present: false, patch: [], outer: [], bottomY: null });
  }
  const full = style === 'full_beard';
  const width = head.width;
  const height = head.height;
  const beard = model.identity.asymmetry.beard;
  const left = head.local.leftBeardStart;
  const right = head.local.rightBeardStart;
  const bottomY = height * (full ? .67 : .5) + beard[3];
  const tip = [beard[2] * .6, bottomY + (full ? 15 : 4)];
  const outer = joinPointSets(
    cubicPoints(left, [-width * .45, height * .36], [-width * .25, bottomY - 12], tip, 15),
    cubicPoints(tip, [width * .26, bottomY], [width * .45, height * .36], right, 15)
  );
  const inner = joinPointSets(
    quadraticPoints(right, [width * .28, height * .3], [width * .18, height * .36], 7),
    quadraticPoints([width * .18, height * .36], [0, height * .41], [-width * .18, height * .36], 8),
    quadraticPoints([-width * .18, height * .36], [-width * .28, height * .3], left, 7)
  );
  return Object.freeze({
    present: true,
    full,
    patch: pointsToWorld(model, [...outer, ...inner.slice(1)]),
    outer: pointsToWorld(model, outer),
    bottomY: toWorld(model, tip)[1]
  });
}
