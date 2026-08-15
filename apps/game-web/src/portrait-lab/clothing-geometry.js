import { cubicPoints, joinPointSets, quadraticPoints } from './handmade.js';
import {
  buildArmholeBoundary,
  buildCentralUnderlayer,
  buildClothingDetails,
  buildFrontBoundary,
  buildFullSilhouettePatch,
  buildSleeveBoundaries
} from './clothing-details.js';

const FABRIC_VOLUME = Object.freeze({
  light_linen: 0,
  wool: 4,
  coarse_wool: 7,
  furred: 10
});

export function buildClothingGeometry(model, body) {
  const anchors = body.anchors;
  const owner = model.clothing.outer === 'none'
    ? 'base_garment'
    : 'outer_garment';
  const silhouette = buildSilhouette(model, anchors);
  const necklineResult = buildNeckline(model, anchors);
  const construction = buildOuterConstruction(model, anchors, silhouette);
  const seams = Object.freeze([
    ...buildSleeveBoundaries(model, anchors),
    ...construction.seams
  ]);
  const boundaries = Object.freeze([
    ...necklineResult.paths,
    ...seams,
    ...construction.outerBoundaries
  ]);
  const tensionRegions = Object.freeze({
    neckline: Object.freeze(
      necklineResult.paths.flatMap((entry) => entry.points)
    ),
    shoulder: Object.freeze([
      anchors.shoulderLeft,
      anchors.shoulderRight
    ]),
    underarm: Object.freeze([
      anchors.underarmLeft,
      anchors.underarmRight
    ]),
    closure: Object.freeze(
      construction.closure.flatMap((entry) => entry.points)
    )
  });
  const base = {
    owner,
    anchors,
    silhouette,
    neckline: necklineResult.paths,
    neckOpening: necklineResult.opening,
    seams,
    outerBoundaries: construction.outerBoundaries,
    boundaries,
    trimBoundaryIds: Object.freeze(
      construction.trimBoundaryIds.length
        ? construction.trimBoundaryIds
        : [necklineResult.paths[0].id]
    ),
    patches: construction.patches,
    tensionRegions
  };
  const details = buildClothingDetails(model, base);
  return Object.freeze({
    ...base,
    folds: details.folds,
    trim: details.trim,
    texture: details.texture
  });
}

function buildSilhouette(model, anchors) {
  const sleeve = model.clothing.sleeve === 'wide' ? 20 : 0;
  const volume = Math.min(22, sleeve + FABRIC_VOLUME[model.clothing.fabric]);
  const shoulderDrop = model.clothing.sleeve === 'wide' ? 8 : 0;
  const leftShoulder = [
    anchors.shoulderLeft[0] - volume,
    anchors.shoulderLeft[1] + shoulderDrop
  ];
  const rightShoulder = [
    anchors.shoulderRight[0] + volume,
    anchors.shoulderRight[1] + shoulderDrop
  ];
  const leftUnderarm = [
    anchors.underarmLeft[0] - volume * .45,
    anchors.underarmLeft[1]
  ];
  const rightUnderarm = [
    anchors.underarmRight[0] + volume * .45,
    anchors.underarmRight[1]
  ];
  const left = joinPointSets(
    cubicPoints(
      anchors.waistLeft,
      [anchors.waistLeft[0] - 8, mixPoint(anchors.underarmLeft, anchors.waistLeft, .62)[1]],
      [leftUnderarm[0] - 5, leftUnderarm[1] + 40],
      leftUnderarm,
      12
    ),
    cubicPoints(
      leftUnderarm,
      [leftUnderarm[0] - 3, leftUnderarm[1] - 28],
      [leftShoulder[0] - 4, leftShoulder[1] + 8],
      leftShoulder,
      8
    ),
    cubicPoints(
      leftShoulder,
      [leftShoulder[0] + 58, leftShoulder[1] - 42],
      [anchors.collarLeft[0] - 28, anchors.collarLeft[1] - 5],
      anchors.collarLeft,
      12
    )
  );
  const right = joinPointSets(
    cubicPoints(
      anchors.collarRight,
      [anchors.collarRight[0] + 28, anchors.collarRight[1] - 5],
      [rightShoulder[0] - 58, rightShoulder[1] - 42],
      rightShoulder,
      12
    ),
    cubicPoints(
      rightShoulder,
      [rightShoulder[0] + 4, rightShoulder[1] + 8],
      [rightUnderarm[0] + 3, rightUnderarm[1] - 28],
      rightUnderarm,
      8
    ),
    cubicPoints(
      rightUnderarm,
      [rightUnderarm[0] + 5, rightUnderarm[1] + 40],
      [anchors.waistRight[0] + 8, mixPoint(anchors.underarmRight, anchors.waistRight, .62)[1]],
      anchors.waistRight,
      12
    )
  );
  return Object.freeze({
    left: Object.freeze(left),
    right: Object.freeze(right)
  });
}

function buildNeckline(model, anchors) {
  const centerX = (anchors.collarLeft[0] + anchors.collarRight[0]) / 2;
  const collarY = (anchors.collarLeft[1] + anchors.collarRight[1]) / 2;
  const kind = model.clothing.neckline;
  let openingLeft = anchors.collarLeft;
  let openingRight = anchors.collarRight;
  let paths;
  if (kind === 'high_closed') {
    openingLeft = mixPoint(anchors.neckLeft, anchors.collarLeft, .72);
    openingRight = mixPoint(anchors.neckRight, anchors.collarRight, .72);
    paths = [boundary('neckline_high', quadraticPoints(
      openingLeft,
      [centerX, (openingLeft[1] + openingRight[1]) / 2 + 7],
      openingRight,
      14
    ))];
  } else if (kind === 'v_slit') {
    const point = [centerX + model.body.turn * 8, collarY + 44];
    paths = [boundary('neckline_v', joinPointSets(
      quadraticPoints(anchors.collarLeft, [centerX - 25, collarY + 8], point, 8),
      quadraticPoints(point, [centerX + 25, collarY + 8], anchors.collarRight, 8)
    ))];
  } else {
    const round = boundary('neckline_round', quadraticPoints(
      anchors.collarLeft,
      [centerX, collarY + 27],
      anchors.collarRight,
      16
    ));
    paths = [round];
    if (kind === 'slit_round') {
      const start = round.points[Math.floor(round.points.length / 2)];
      paths.push(boundary('neckline_slit', quadraticPoints(
        start,
        [start[0] + model.body.turn * 8, start[1] + 18],
        [start[0] + model.body.turn * 10, start[1] + 38],
        7
      )));
    }
  }
  return Object.freeze({
    paths: Object.freeze(paths),
    opening: Object.freeze({
      left: openingLeft,
      right: openingRight,
      y: Math.max(openingLeft[1], openingRight[1])
    })
  });
}

function buildOuterConstruction(model, anchors, silhouette) {
  const fullPatch = patchDescriptor(
    model.clothing.outer === 'none' ? 'base' : 'outer',
    'main',
    buildFullSilhouettePatch(anchors, silhouette)
  );
  if (model.clothing.outer === 'none') {
    return construction([], [], [], [fullPatch], []);
  }
  if (model.clothing.outer === 'wrap') {
    const closure = boundary('wrap_closure', quadraticPoints(
      anchors.collarLeft,
      [anchors.chestCenter[0] - 30, anchors.chestCenter[1] - 45],
      [anchors.chestCenter[0] + 18, anchors.waistLeft[1] - 6],
      20
    ));
    const overlap = boundary('wrap_overlap', quadraticPoints(
      anchors.collarRight,
      [anchors.chestCenter[0] + 34, anchors.chestCenter[1] - 80],
      closure.points[Math.floor(closure.points.length * .34)],
      9
    ));
    return construction(
      [closure, overlap], [], [closure, overlap], [fullPatch],
      ['wrap_closure']
    );
  }
  if (model.clothing.outer === 'front_open') {
    const left = buildFrontBoundary(
      'front_left', anchors.collarLeft, anchors, -1
    );
    const right = buildFrontBoundary(
      'front_right', anchors.collarRight, anchors, 1
    );
    const underlayer = buildCentralUnderlayer(anchors);
    const patches = [
      patchDescriptor('outer', 'main', [
        ...silhouette.left,
        ...left.points.slice(1)
      ]),
      patchDescriptor('outer', 'main', [
        ...[...right.points].reverse(),
        ...silhouette.right.slice(1)
      ]),
      patchDescriptor('base', 'secondary', underlayer)
    ];
    return construction(
      [left, right], [], [left, right], patches,
      ['front_left', 'front_right']
    );
  }
  if (model.clothing.outer === 'shoulder_drape') {
    const yoke = boundary('drape_yoke', cubicPoints(
      anchors.shoulderLeft,
      [anchors.chestLeft[0], anchors.collarLeft[1] + 10],
      [anchors.chestRight[0], anchors.collarRight[1] + 16],
      anchors.shoulderRight,
      18
    ));
    const fall = boundary('drape_fall', quadraticPoints(
      anchors.shoulderLeft,
      [anchors.chestCenter[0] - 72, anchors.chestCenter[1]],
      anchors.waistLeft,
      18
    ));
    return construction([], [yoke, fall], [yoke, fall], [fullPatch], [
      'drape_yoke'
    ]);
  }
  const leftOpening = buildArmholeBoundary('armhole_left', anchors, -1);
  const rightOpening = buildArmholeBoundary('armhole_right', anchors, 1);
  return construction(
    [], [leftOpening, rightOpening], [leftOpening, rightOpening],
    [fullPatch], ['armhole_left', 'armhole_right']
  );
}

function construction(seams, outer, closure, patches, trimIds) {
  return Object.freeze({
    seams: Object.freeze(seams),
    outerBoundaries: Object.freeze(outer),
    closure: Object.freeze(closure),
    patches: Object.freeze(patches),
    trimBoundaryIds: Object.freeze(trimIds)
  });
}

const boundary = (id, points) => Object.freeze({ id, points: Object.freeze(points) });

const patchDescriptor = (layer, tone, points) => Object.freeze({
  layer, tone, points: Object.freeze(points)
});

function mixPoint(start, end, ratio) {
  return [
    start[0] + (end[0] - start[0]) * ratio,
    start[1] + (end[1] - start[1]) * ratio
  ];
}
