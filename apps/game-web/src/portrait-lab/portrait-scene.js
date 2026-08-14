import { ellipsePoints } from './handmade.js';
import { buildFaceScene } from './face-scene.js';
import { pointsToWorld } from './geometry-utils.js';
import { buildPortraitGeometry } from './portrait-geometry.js';
import { buildHatches, buildScratches } from './portrait-hatches.js';
import {
  insetPatch,
  patch,
  verticalSlice
} from './scene-primitives.js';
import { buildVisibleStrokes } from './visible-contours.js';

export function buildPortraitScene(model) {
  const geometry = buildPortraitGeometry(model);
  const visibility = resolveVisibility(model, geometry);
  const face = buildFaceScene(model);
  const strokes = [
    ...buildVisibleStrokes(model, geometry, visibility),
    ...face.strokes
  ];
  const hatches = [
    ...buildHatches(model, geometry, visibility),
    ...face.hatches
  ];
  const patches = [
    ...buildPatches(model, geometry, visibility),
    ...face.patches
  ];
  return Object.freeze({
    geometry,
    visibility,
    patches: Object.freeze(patches),
    strokes: Object.freeze(strokes),
    hatches: Object.freeze(hatches),
    scratches: Object.freeze(buildScratches(model))
  });
}

function resolveVisibility(model, geometry) {
  const crownOwner = geometry.headwear.present
    ? 'headwear'
    : geometry.hair.present ? 'hair' : 'head';
  const jawOwner = geometry.beard.present ? 'beard' : 'head';
  const neckStartY = geometry.beard.present
    ? Math.max(geometry.head.chin[1], geometry.beard.bottomY + 2)
    : geometry.head.chin[1] - 2;
  return Object.freeze({
    crownOwner,
    jawOwner,
    neckVisible: neckStartY < geometry.body.collarY - 3,
    neckStartY,
    lowerGarmentBoundary: model.clothing.outer === 'none'
      ? 'tunic'
      : model.clothing.outer,
    hidden: Object.freeze({
      headCrown: crownOwner !== 'head',
      jaw: jawOwner !== 'head',
      neckBehindCollar: true,
      tunicUnderOuter: model.clothing.outer !== 'none'
    })
  });
}

function buildPatches(model, geometry, visibility) {
  const patches = [
    patch(
      'skin',
      insetPatch(
        geometry.head.patch,
        model.head.cx,
        model.head.cy,
        .985
      ),
      model.skin.base,
      { alpha: .2, salt: 4000, roughness: 5 }
    ),
    patch(
      'tunic',
      insetPatch(
        geometry.body.torsoPatch,
        model.body.centerX,
        650,
        .985
      ),
      model.clothing.main.base,
      { alpha: .16, salt: 4002, roughness: 6 }
    )
  ];
  if (visibility.neckVisible) {
    const left = verticalSlice(
      geometry.body.neckLeft,
      visibility.neckStartY,
      geometry.body.collarY
    );
    const right = verticalSlice(
      geometry.body.neckRight,
      visibility.neckStartY,
      geometry.body.collarY
    );
    patches.push(patch('neck', [
      left[0], left[1], right[1], right[0]
    ], model.skin.base, {
      alpha: .12, salt: 4001, roughness: 3.5
    }));
  }
  for (const [index, points] of geometry.hair.patches.entries()) {
    patches.push(patch('hair', points, model.hair.base, {
      alpha: .28,
      salt: 4020 + index,
      roughness: 4.5
    }));
  }
  if (geometry.beard.present) {
    patches.push(patch('beard', geometry.beard.patch, model.hair.base, {
      alpha: .22,
      salt: 4040,
      roughness: 5
    }));
  }
  for (const [index, points] of geometry.headwear.patches.entries()) {
    patches.push(patch(
      'headwear',
      points,
      model.clothing.secondary.base,
      { alpha: .24, salt: 4060 + index, roughness: 5 }
    ));
  }
  patches.push(...garmentPatches(model, geometry));
  const cheek = pointsToWorld(model, ellipsePoints(
    model.head.width * .23 + model.head.faceAxisX,
    model.head.height * .13,
    model.head.width * .145,
    model.head.height * .095,
    23
  ));
  patches.push(patch('cheek_wash', cheek, '#a8675f', {
    alpha: .055 + model.expression.tension * .018,
    salt: 4080,
    roughness: 5.5
  }));
  return patches;
}

function garmentPatches(model, geometry) {
  const body = geometry.body;
  const center = model.body.centerX;
  if (model.clothing.outer === 'none') return [];
  if (model.clothing.outer === 'caftan') {
    return [
      patch('caftan_left', [
        body.collarLeft,
        [model.body.shoulderLeft + 22, model.body.shoulderLeftY + 44],
        [model.body.waistLeft - 4, 782],
        [center - 4, 782],
        [center - 18, 555]
      ], model.clothing.secondary.base, {
        alpha: .12, salt: 4100, roughness: 6
      }),
      patch('caftan_right', [
        body.collarRight,
        [model.body.shoulderRight - 20, model.body.shoulderRightY + 45],
        [model.body.waistRight + 4, 782],
        [center + 10, 782],
        [center - 18, 555]
      ], model.clothing.secondary.base, {
        alpha: .1, salt: 4101, roughness: 6
      })
    ];
  }
  if (model.clothing.outer === 'cloak') {
    return [patch('cloak', [
      [center - 20, 468],
      [model.body.shoulderLeft - 8, model.body.shoulderLeftY + 48],
      [model.body.waistLeft - 14, 782],
      [center - 62, 782]
    ], model.clothing.secondary.base, {
      alpha: .15, salt: 4120, roughness: 7
    })];
  }
  return [
    patch('sheepskin_left', [
      [model.body.shoulderLeft + 28, model.body.shoulderY + 31],
      [center - 36, 520],
      [center - 24, 782],
      [model.body.waistLeft + 17, 782]
    ], model.clothing.secondary.base, {
      alpha: .12, salt: 4140, roughness: 7
    }),
    patch('sheepskin_right', [
      [model.body.shoulderRight - 28, model.body.shoulderY + 31],
      [center + 36, 520],
      [center + 24, 782],
      [model.body.waistRight - 17, 782]
    ], model.clothing.secondary.base, {
      alpha: .12, salt: 4141, roughness: 7
    })
  ];
}
