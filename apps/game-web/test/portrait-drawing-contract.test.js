import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PORTRAIT_DRAWING_CONTRACT_V1,
  validatePortraitDrawingContract,
  buildPortraitScene,
  buildRenderModel
} from '../src/portrait-lab/renderer.js';
import { PORTRAIT_SPEC_V1_ENUMS } from '../src/portrait-lab/contract.js';
import { SAMPLE_PORTRAIT_SPEC } from '../src/portrait-lab/sample.js';
import { PORTRAIT_PARTS } from '../src/portrait-lab/scene-primitives.js';
import {
  buildPairwisePortraitSpecs,
  uncoveredPortraitPairs
} from './portrait-pairwise.js';
import {
  buildPortraitControlSheetSpecs,
  PORTRAIT_CONTROL_SHEET_SIZE
} from './portrait-control-sheet.js';

test('unrelated fields preserve face geometry and face-part seeds', () => {
  const baseline = portrait(SAMPLE_PORTRAIT_SPEC);
  for (const changedSpec of [
    changed('clothing', 'main_color', 'forest_green'),
    changed(null, 'background', 'cool')
  ]) {
    const changedPortrait = portrait(changedSpec);
    assert.notEqual(changedPortrait.model.identity.seed, baseline.model.identity.seed);
    assert.deepEqual(changedPortrait.scene.geometry.head, baseline.scene.geometry.head);
    assert.deepEqual(changedPortrait.scene.geometry.hair, baseline.scene.geometry.hair);
    assert.deepEqual(
      faceInk(changedPortrait.scene),
      faceInk(baseline.scene)
    );
    for (const part of ['head', 'face', 'eyes', 'nose', 'mouth', 'hair']) {
      assert.equal(
        changedPortrait.model.identity.seeds[part],
        baseline.model.identity.seeds[part],
        part
      );
    }
  }
});

test('female portraits keep readable sex cues with every other field fixed', () => {
  const female = portrait(sexVariant('female'));
  const male = portrait(sexVariant('male'));
  const ratio = (left, right) => left / right;

  assert.ok(ratio(female.model.head.width, male.model.head.width) < .9);
  assert.ok(ratio(
    jawSpan(female.scene), jawSpan(male.scene)
  ) < .82);
  assert.ok(ratio(
    shoulderSpan(female.model), shoulderSpan(male.model)
  ) < .84);
  assert.ok(ratio(
    female.model.head.neckWidth, male.model.head.neckWidth
  ) < .8);
  assert.ok(
    browArch(female.scene) > browArch(male.scene) + 3,
    'female brow must have a visibly softer arch'
  );
  assert.equal(
    female.scene.strokes.filter((entry) => entry.role === 'lash').length,
    4
  );
  assert.equal(
    male.scene.strokes.filter((entry) => entry.role === 'lash').length,
    0
  );
});

test('every built scene is admitted by Portrait Drawing Contract v1', () => {
  const { model, scene } = portrait(SAMPLE_PORTRAIT_SPEC);
  assert.equal(scene.contract, 'portrait_drawing_contract_v1');
  assert.equal(PORTRAIT_DRAWING_CONTRACT_V1.style.wobble, 'low_frequency');
  assert.equal(PORTRAIT_DRAWING_CONTRACT_V1.style.fillsBeforeInk, true);
  for (const field of ['anchors', 'allowedRegions']) {
    assert.deepEqual(
      Object.keys(PORTRAIT_DRAWING_CONTRACT_V1[field]).sort(),
      [...PORTRAIT_PARTS].sort(),
      field
    );
  }
  assert.deepEqual(validatePortraitDrawingContract(model, scene), []);
});

test('drawing contract rejects detached and closed attachment contours', () => {
  const loose = portrait(changed('hair', 'length', 'long'));
  const detachedHair = structuredClone(loose.scene);
  detachedHair.geometry.hair.outer[1][0][0] += 180;
  assert.ok(
    validatePortraitDrawingContract(loose.model, detachedHair)
      .some((issue) => issue.code === 'HAIR_ANCHOR_INVALID')
  );

  const scarf = portrait(changed('clothing', 'headwear', 'headscarf'));
  const detachedTail = structuredClone(scarf.scene);
  detachedTail.geometry.headwear.outer.push([
    [590, 390], [650, 450], [610, 540], [590, 390]
  ]);
  assert.ok(
    validatePortraitDrawingContract(scarf.model, detachedTail)
      .some((issue) => issue.code === 'ATTACHMENT_CONTOUR_CLOSED')
  );

  const openDetachedTail = structuredClone(scarf.scene);
  openDetachedTail.geometry.headwear.outer.push([
    [590, 390], [650, 450], [610, 540]
  ]);
  assert.ok(
    validatePortraitDrawingContract(scarf.model, openDetachedTail)
      .some((issue) => issue.code === 'HEADWEAR_ATTACHMENT_INVALID')
  );
});

test('drawing contract anchors braid and headwear to their parent regions', () => {
  const braided = portrait(combined({
    'hair.length': 'long',
    'hair.style': 'braided',
    'clothing.headwear': 'none'
  }));
  const detachedBraid = structuredClone(braided.scene);
  detachedBraid.geometry.hair.braid.lead[0][0] += 180;
  assert.ok(
    validatePortraitDrawingContract(braided.model, detachedBraid)
      .some((issue) => issue.code === 'BRAID_ANCHOR_INVALID')
  );

  const capped = portrait(changed('clothing', 'headwear', 'linen_cap'));
  const detachedCap = structuredClone(capped.scene);
  for (const collection of ['patches', 'outer', 'inner']) {
    for (const path of detachedCap.geometry.headwear[collection]) {
      for (const point of path) point[0] += 240;
    }
  }
  assert.ok(
    validatePortraitDrawingContract(capped.model, detachedCap)
      .some((issue) => issue.code === 'HEADWEAR_ANCHOR_INVALID')
  );
});

test('a headscarf exposes only the attached lower braid tail', () => {
  const wrapped = portrait(combined({
    'hair.length': 'long',
    'hair.style': 'braided',
    'clothing.headwear': 'headscarf'
  }));
  const braidInk = wrapped.scene.hatches.filter(
    (entry) => entry.role.startsWith('braid_')
  );
  assert.equal(wrapped.scene.visibility.details.braid, false);
  assert.equal(wrapped.scene.visibility.details.braidTail, true);
  assert.ok(braidInk.filter((entry) => entry.role === 'braid_link').length >= 3);
  assert.equal(braidInk.some((entry) => entry.role === 'braid_lead'), false);
});

test('drawing contract excludes hair and headwear from central face area', () => {
  for (const portraitValue of [
    portrait(combined({
      'hair.length': 'long',
      'hair.style': 'loose',
      'clothing.headwear': 'none'
    })),
    portrait(changed('clothing', 'headwear', 'fur_hat'))
  ]) {
    const intruding = structuredClone(portraitValue.scene);
    const entry = [...intruding.strokes, ...intruding.hatches]
      .find((candidate) => ['hair', 'headwear'].includes(candidate.part));
    entry.points[Math.floor(entry.points.length / 2)] = [
      portraitValue.model.head.cx + portraitValue.model.head.width * .12,
      portraitValue.model.head.cy + portraitValue.model.head.height * .15
    ];
    assert.ok(
      validatePortraitDrawingContract(portraitValue.model, intruding)
        .some((issue) => issue.code === 'FORBIDDEN_FACE_INTERSECTION'),
      entry.part
    );
  }
});

test('drawing contract keeps face features inside ordered face zones', () => {
  const baseline = portrait(SAMPLE_PORTRAIT_SPEC);
  const escapedEye = structuredClone(baseline.scene);
  const eye = escapedEye.strokes.find((entry) => entry.role === 'eye');
  for (const point of eye.points) point[0] += 300;
  assert.ok(
    validatePortraitDrawingContract(baseline.model, escapedEye)
      .some((issue) => issue.code === 'FACE_REGION_VIOLATION')
  );

  const inverted = structuredClone(baseline.scene);
  for (const nose of inverted.strokes.filter((entry) => entry.role === 'nose')) {
    for (const point of nose.points) point[1] += 180;
  }
  assert.ok(
    validatePortraitDrawingContract(baseline.model, inverted)
      .some((issue) => issue.code === 'FACE_ORDER_INVALID')
  );
});

test('drawing contract rejects hair or headwear over the brow envelope', () => {
  for (const portraitValue of [
    portrait(combined({
      'hair.length': 'long',
      'hair.style': 'loose',
      'clothing.headwear': 'none'
    })),
    portrait(changed('clothing', 'headwear', 'linen_cap'))
  ]) {
    const occluded = structuredClone(portraitValue.scene);
    const browPoint = occluded.strokes
      .find((entry) => entry.role === 'brow').points[5];
    const occluder = occluded.patches.find(
      (entry) => ['hair', 'headwear'].includes(entry.part)
    );
    occluder.points[Math.floor(occluder.points.length / 2)] = browPoint;
    assert.ok(
      validatePortraitDrawingContract(portraitValue.model, occluded)
        .some((issue) => issue.code === 'BROW_OCCLUSION_CONFLICT'),
      occluder.part
    );
  }
});

test('drawing contract keeps an anatomical gap between nose and mouth', () => {
  const baseline = portrait(SAMPLE_PORTRAIT_SPEC);
  const collided = structuredClone(baseline.scene);
  const noseTip = collided.strokes
    .filter((entry) => entry.role === 'nose')
    .flatMap((entry) => entry.points)
    .sort((left, right) => right[1] - left[1])[0];
  const mouth = collided.strokes.find((entry) => entry.role === 'mouth');
  mouth.points[Math.floor(mouth.points.length / 2)] = noseTip;
  assert.ok(
    validatePortraitDrawingContract(baseline.model, collided)
      .some((issue) => issue.code === 'NOSE_MOUTH_GAP_INVALID')
  );
});

test('drawing contract rejects pathological jumps and self-intersections', () => {
  const baseline = portrait(SAMPLE_PORTRAIT_SPEC);
  const jumped = structuredClone(baseline.scene);
  jumped.scratches[0].points = [[100, 100], [600, 600]];
  assert.ok(
    validatePortraitDrawingContract(baseline.model, jumped)
      .some((issue) => issue.code === 'PATH_SEGMENT_TOO_LONG')
  );

  const closingJump = structuredClone(baseline.scene);
  closingJump.patches[0].points = [
    [100, 100], [250, 100], [400, 100]
  ];
  assert.ok(
    validatePortraitDrawingContract(baseline.model, closingJump)
      .some((issue) => issue.code === 'PATH_SEGMENT_TOO_LONG')
  );

  const crossed = structuredClone(baseline.scene);
  crossed.patches[0].points = [
    [300, 300], [460, 460], [300, 460], [460, 300]
  ];
  assert.ok(
    validatePortraitDrawingContract(baseline.model, crossed)
      .some((issue) => issue.code === 'CONTOUR_SELF_INTERSECTION')
  );
});

test('drawing contract enforces contour ownership and scoped style metadata', () => {
  const beard = portrait(changed('hair', 'facial_hair', 'full_beard'));
  const doubledJaw = structuredClone(beard.scene);
  doubledJaw.strokes.push({
    ...doubledJaw.strokes[0],
    role: 'outer_silhouette',
    part: 'head',
    points: doubledJaw.geometry.head.leftJaw,
    seed: beard.model.identity.seeds.head
  });
  assert.ok(
    validatePortraitDrawingContract(beard.model, doubledJaw)
      .some((issue) => issue.code === 'CONTOUR_OWNER_CONFLICT')
  );

  const missingBeardJaw = structuredClone(beard.scene);
  missingBeardJaw.strokes = missingBeardJaw.strokes.filter(
    (entry) => !(
      entry.part === 'beard'
      && pathsEqual(entry.points, missingBeardJaw.geometry.beard.outer)
    )
  );
  assert.ok(
    validatePortraitDrawingContract(beard.model, missingBeardJaw)
      .some((issue) => issue.code === 'CONTOUR_OWNER_CONFLICT')
  );

  const haired = portrait(changed('hair', 'length', 'long'));
  const missingHairCrown = structuredClone(haired.scene);
  missingHairCrown.strokes = missingHairCrown.strokes.filter(
    (entry) => !(
      entry.part === 'hair'
      && pathsEqual(entry.points, missingHairCrown.geometry.hair.outer[0])
    )
  );
  assert.ok(
    validatePortraitDrawingContract(haired.model, missingHairCrown)
      .some((issue) => issue.code === 'CONTOUR_OWNER_CONFLICT')
  );

  const leakedEar = structuredClone(haired.scene);
  leakedEar.strokes.push({
    ...leakedEar.strokes[0],
    role: 'ear_mark',
    part: 'face',
    points: [
      [haired.model.head.cx - haired.model.head.width * .48, haired.model.head.cy],
      [haired.model.head.cx - haired.model.head.width * .46, haired.model.head.cy + 8]
    ],
    seed: haired.model.identity.seeds.face
  });
  assert.ok(
    validatePortraitDrawingContract(haired.model, leakedEar)
      .some((issue) => issue.code === 'HIDDEN_PART_VISIBLE')
  );

  const baseline = portrait(SAMPLE_PORTRAIT_SPEC);
  const wrongSeed = structuredClone(baseline.scene);
  wrongSeed.strokes[0].seed = baseline.model.identity.seeds.nose;
  assert.ok(
    validatePortraitDrawingContract(baseline.model, wrongSeed)
      .some((issue) => issue.code === 'PART_SEED_MISMATCH')
  );

  const outlinedPatch = structuredClone(baseline.scene);
  outlinedPatch.strokes.push({
    ...outlinedPatch.strokes[0],
    points: outlinedPatch.patches[0].points
  });
  assert.ok(
    validatePortraitDrawingContract(baseline.model, outlinedPatch)
      .some((issue) => issue.code === 'PATCH_OUTLINE_CONFLICT')
  );
});

test('pairwise specs and known triples satisfy universal drawing invariants', () => {
  const pairwise = buildPairwisePortraitSpecs(
    SAMPLE_PORTRAIT_SPEC,
    PORTRAIT_SPEC_V1_ENUMS
  );
  assert.deepEqual(
    uncoveredPortraitPairs(pairwise, PORTRAIT_SPEC_V1_ENUMS),
    []
  );
  assert.ok(pairwise.length < 200, `pairwise cases: ${pairwise.length}`);

  const knownTriples = [
    combined({
      'hair.length': 'long',
      'hair.style': 'braided',
      'clothing.headwear': 'headscarf'
    }),
    combined({
      'hair.facial_hair': 'full_beard',
      'pose.body': 'three_quarter',
      'pose.head': 'slightly_turned'
    }),
    combined({
      'person.age': 'old',
      'expression.emotion': 'surprised',
      'clothing.outer': 'cloak'
    })
  ];
  for (const [index, spec] of [...pairwise, ...knownTriples].entries()) {
    assert.doesNotThrow(() => portrait(spec), `contract case ${index}`);
  }
});

test('visual control sheet is fixed at 24 contract-valid portraits', () => {
  const controlSheet = buildPortraitControlSheetSpecs();
  assert.equal(controlSheet.length, PORTRAIT_CONTROL_SHEET_SIZE);
  assert.deepEqual(controlSheet, buildPortraitControlSheetSpecs());
  for (const [group, fields] of Object.entries(PORTRAIT_SPEC_V1_ENUMS)) {
    if (group === 'background') {
      assert.deepEqual(
        new Set(controlSheet.map((spec) => spec.background)),
        new Set(fields),
        group
      );
      continue;
    }
    for (const [field, values] of Object.entries(fields)) {
      assert.deepEqual(
        new Set(controlSheet.map((spec) => spec[group][field])),
        new Set(values),
        `${group}.${field}`
      );
    }
  }
  for (const [index, spec] of controlSheet.entries()) {
    const rendered = portrait(spec);
    assert.notEqual(
      spec.person.sex === 'female' && spec.hair.facial_hair !== 'none',
      true,
      `control portrait ${index}: female facial hair`
    );
    assert.notEqual(
      spec.hair.length === 'bald' && spec.hair.style === 'braided',
      true,
      `control portrait ${index}: bald braid`
    );
    if (spec.hair.facial_hair === 'moustache') {
      assert.equal(
        rendered.scene.strokes.filter((entry) => entry.role === 'moustache')
          .length,
        2,
        `control portrait ${index}: moustache ink`
      );
    }
  }
  assert.ok(controlSheet.some((spec) => (
    spec.hair.length === 'long'
      && spec.hair.style === 'loose'
      && spec.clothing.headwear === 'none'
  )));
  assert.ok(controlSheet.some((spec) => (
    spec.hair.length === 'long'
      && spec.hair.style === 'braided'
      && spec.clothing.headwear === 'headscarf'
  )));
});

function portrait(spec) {
  const model = buildRenderModel(structuredClone(spec));
  return { model, scene: buildPortraitScene(model) };
}

function changed(group, field, value) {
  const spec = structuredClone(SAMPLE_PORTRAIT_SPEC);
  if (group == null) spec[field] = value;
  else spec[group][field] = value;
  return spec;
}

function combined(values) {
  const spec = structuredClone(SAMPLE_PORTRAIT_SPEC);
  for (const [path, value] of Object.entries(values)) {
    const [group, field] = path.split('.');
    spec[group][field] = value;
  }
  return spec;
}

function sexVariant(sex) {
  return combined({
    'person.sex': sex,
    'person.age': 'adult',
    'person.build': 'average',
    'person.face_shape': 'oval',
    'hair.length': 'short',
    'hair.style': 'straight',
    'hair.facial_hair': 'none',
    'clothing.outer': 'none',
    'clothing.headwear': 'none',
    'pose.body': 'frontal',
    'pose.head': 'straight',
    'expression.emotion': 'neutral',
    'expression.intensity': 'medium'
  });
}

function jawSpan(scene) {
  const { leftJaw, rightJaw } = scene.geometry.head.local;
  return rightJaw[0] - leftJaw[0];
}

function shoulderSpan(model) {
  const { left, right } = model.armature.shoulders;
  return right.x - left.x;
}

function browArch(scene) {
  const points = scene.strokes.find((entry) => entry.role === 'brow').points;
  const endpointsY = (points[0][1] + points.at(-1)[1]) / 2;
  return endpointsY - Math.min(...points.map((point) => point[1]));
}

function faceInk(scene) {
  const parts = new Set(['head', 'face', 'eyes', 'nose', 'mouth']);
  return [...scene.strokes, ...scene.hatches]
    .filter((entry) => parts.has(entry.part));
}

function pathsEqual(left, right) {
  return left.length === right.length && left.every(
    (point, index) => point[0] === right[index][0]
      && point[1] === right[index][1]
  );
}
