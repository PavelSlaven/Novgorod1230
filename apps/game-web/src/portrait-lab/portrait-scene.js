import { ellipsePoints } from './handmade.js';
import { buildFaceScene } from './face-scene.js';
import {
  PORTRAIT_DRAWING_CONTRACT_V1,
  assertPortraitDrawingContract
} from './drawing-contract.js';
import { pointsToWorld } from './geometry-utils.js';
import { buildPortraitGeometry } from './portrait-geometry.js';
import { buildHatches, buildScratches } from './portrait-hatches.js';
import {
  patch,
  verticalSlice
} from './scene-primitives.js';
import { buildVisibleStrokes } from './visible-contours.js';

export function buildPortraitScene(model) {
  const geometry = buildPortraitGeometry(model);
  const visibility = resolveVisibility(model, geometry);
  const face = buildFaceScene(model, visibility);
  const strokes = withPartSeeds([
    ...buildVisibleStrokes(model, geometry, visibility),
    ...face.strokes
  ], model);
  const hatches = withPartSeeds([
    ...buildHatches(model, geometry, visibility),
    ...face.hatches
  ], model);
  const patches = withPartSeeds([
    ...buildPatches(model, geometry, visibility),
    ...face.patches
  ], model);
  const scratches = withPartSeeds(buildScratches(model), model);
  const scene = Object.freeze({
    contract: PORTRAIT_DRAWING_CONTRACT_V1.schema,
    geometry,
    visibility,
    patches: Object.freeze(patches),
    strokes: Object.freeze(strokes),
    hatches: Object.freeze(hatches),
    scratches: Object.freeze(scratches)
  });
  assertPortraitDrawingContract(model, scene);
  return scene;
}

function withPartSeeds(entries, model) {
  return entries.map((entry) => Object.freeze({
    ...entry,
    seed: model.identity.seeds[entry.part]
  }));
}

function resolveVisibility(model, geometry) {
  const crownOwner = geometry.headwear.present
    ? 'headwear'
    : geometry.hair.present ? 'hair' : 'head';
  const jawOwner = geometry.beard.present ? 'beard' : 'head';
  const neckStartY = geometry.beard.present
    ? Math.max(geometry.head.chin[1], geometry.beard.bottomY + 2)
    : geometry.head.chin[1] - 2;
  const neckEndY = geometry.clothing.neckOpening.y;
  const hairCoversEars = geometry.hair.present && (
    ['medium', 'long'].includes(model.spec.hair.length)
      || model.spec.hair.style === 'braided'
  );
  const torsoOwner = geometry.clothing.owner;
  return Object.freeze({
    crownOwner,
    jawOwner,
    neckVisible: neckStartY < neckEndY - 3,
    neckStartY,
    neckEndY,
    torsoOwner,
    lowerGarmentBoundary: torsoOwner,
    patches: Object.freeze({
      garment: true,
      hairCrown: geometry.hair.present && crownOwner === 'hair',
      hairSides: geometry.hair.present
        && geometry.headwear.kind !== 'headscarf',
      beard: geometry.beard.present,
      headwear: geometry.headwear.present
    }),
    details: Object.freeze({
      earMarks: geometry.headwear.kind !== 'headscarf'
        && !hairCoversEars,
      braid: geometry.hair.braid.present
        && geometry.headwear.kind !== 'headscarf',
      braidTail: geometry.hair.braid.present
        && geometry.headwear.kind === 'headscarf'
    }),
    hidden: Object.freeze({
      headCrown: crownOwner !== 'head',
      jaw: jawOwner !== 'head',
      neckBehindCollar: true,
      baseGarmentUnderOuter: model.clothing.outer !== 'none',
      necklineCenter: geometry.beard.present
        && geometry.beard.bottomY > neckEndY - 8,
      earMarks: geometry.headwear.kind === 'headscarf'
        || hairCoversEars
    })
  });
}

function buildPatches(model, geometry, visibility) {
  const patches = clothingPatches(model, geometry.clothing);
  if (visibility.neckVisible) {
    const left = verticalSlice(
      geometry.body.neckLeft,
      visibility.neckStartY,
      visibility.neckEndY
    );
    const right = verticalSlice(
      geometry.body.neckRight,
      visibility.neckStartY,
      visibility.neckEndY
    );
    patches.push(patch('neck', [
      left[0], left[1], right[1], right[0]
    ], model.skin.base, {
      alpha: .12, salt: 4001, roughness: 3.5
    }));
  }
  const hairPatches = geometry.hair.patches.filter((_, index) => (
    index === 0
      ? visibility.patches.hairCrown
      : visibility.patches.hairSides
  ));
  for (const [index, points] of hairPatches.entries()) {
    patches.push(patch('hair', points, model.hair.base, {
      alpha: .28,
      salt: 4020 + index,
      roughness: 4.5
    }));
  }
  if (visibility.patches.beard) {
    patches.push(patch('beard', geometry.beard.patch, model.hair.base, {
      alpha: .22,
      salt: 4040,
      roughness: 5
    }));
  }
  const headwearPatches = !visibility.patches.headwear
    ? []
    : geometry.headwear.kind === 'headscarf'
      ? geometry.headwear.patches.slice(0, 1)
      : geometry.headwear.patches;
  for (const [index, points] of headwearPatches.entries()) {
    patches.push(patch(
      'headwear',
      points,
      model.clothing.secondary.base,
      { alpha: .24, salt: 4060 + index, roughness: 5 }
    ));
  }
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

function clothingPatches(model, clothing) {
  return clothing.patches.map((entry, index) => patch(
    entry.layer === 'base' && model.clothing.outer !== 'none'
      ? 'garment_underlayer'
      : 'garment_wash',
    entry.points,
    model.clothing[entry.tone].base,
    {
      alpha: entry.tone === 'main' ? .14 : .105,
      salt: 4002 + index,
      roughness: model.clothing.fabric === 'furred' ? 7 : 5.5,
      owner: clothing.owner,
      layer: entry.layer,
      tone: entry.tone
    }
  ));
}
