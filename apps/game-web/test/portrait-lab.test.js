import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiClient } from '../src/api/client.js';
import { PORTRAIT_SPEC_V1_ENUMS } from '../src/portrait-lab/contract.js';
import { resolvePortraitInput } from '../src/portrait-lab/input.js';
import { projectFacePoint } from '../src/portrait-lab/render-model.js';
import {
  buildPortraitScene,
  buildRenderModel,
  renderPortrait
} from '../src/portrait-lab/renderer.js';
import { SAMPLE_PORTRAIT_SPEC } from '../src/portrait-lab/sample.js';

test('direct portrait JSON bypasses server normalization', async () => {
  let calls = 0;
  const result = await resolvePortraitInput(JSON.stringify(SAMPLE_PORTRAIT_SPEC), {
    normalizeText: async () => { calls += 1; return { spec: SAMPLE_PORTRAIT_SPEC }; }
  });
  assert.equal(result.source, 'json');
  assert.deepEqual(result.spec, SAMPLE_PORTRAIT_SPEC);
  assert.equal(calls, 0);
});

test('natural language uses server normalization exactly once', async () => {
  const calls = [];
  const result = await resolvePortraitInput('  Пожилая женщина в платке  ', {
    normalizeText: async (text) => {
      calls.push(text);
      return { spec: SAMPLE_PORTRAIT_SPEC };
    }
  });
  assert.equal(result.source, 'text');
  assert.deepEqual(calls, ['Пожилая женщина в платке']);
});

test('malformed JSON and invalid provider output fail before rendering', async () => {
  let calls = 0;
  await assert.rejects(
    () => resolvePortraitInput('{"schema":', {
      normalizeText: async () => { calls += 1; }
    }),
    { code: 'PORTRAIT_JSON_INVALID' }
  );
  assert.equal(calls, 0);

  for (const jsonArray of ['[', '[]']) {
    await assert.rejects(
      () => resolvePortraitInput(jsonArray, {
        normalizeText: async () => { calls += 1; }
      }),
      { code: jsonArray === '['
        ? 'PORTRAIT_JSON_INVALID'
        : 'PORTRAIT_JSON_SCHEMA_INVALID' }
    );
  }
  assert.equal(calls, 0);

  await assert.rejects(
    () => resolvePortraitInput('Сердитый человек', {
      normalizeText: async () => ({ spec: { schema: 'portrait_spec_v1' } })
    }),
    { code: 'PORTRAIT_SPEC_SERVER_INVALID' }
  );
});

test('portrait API client uses the bounded v1 normalization endpoint', async () => {
  const calls = [];
  const api = createApiClient({
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        status: 200,
        json: async () => ({
          version: 1, schema: 'rus_api_success', ok: true,
          data: { spec: SAMPLE_PORTRAIT_SPEC }
        })
      };
    }
  });
  const result = await api.normalizePortraitSpec({ text: 'Портрет' });
  assert.deepEqual(result.spec, SAMPLE_PORTRAIT_SPEC);
  assert.equal(calls[0].url, '/api/v1/portrait-spec');
  assert.equal(JSON.parse(calls[0].options.body).text, 'Портрет');
});

test('render model exposes visible branches for core portrait traits', () => {
  const slim = buildRenderModel(variant('person', 'build', 'slim'));
  const stocky = buildRenderModel(variant('person', 'build', 'stocky'));
  assert.ok(
    stocky.body.shoulderRight - stocky.body.shoulderLeft
      > slim.body.shoulderRight - slim.body.shoulderLeft
  );

  const young = buildRenderModel(variant('person', 'age', 'young'));
  const old = buildRenderModel(variant('person', 'age', 'old'));
  assert.ok(old.age.lines > young.age.lines);
  assert.ok(old.age.eyeBag > young.age.eyeBag);

  const calm = buildRenderModel(variant('expression', 'emotion', 'calm'));
  const afraid = buildRenderModel(variant('expression', 'emotion', 'afraid'));
  const angry = buildRenderModel(variant('expression', 'emotion', 'angry'));
  assert.ok(afraid.eyes.leftOpen > calm.eyes.leftOpen);
  assert.ok(angry.expression.tension > calm.expression.tension);

  const frontal = buildRenderModel(variant('pose', 'body', 'frontal'));
  const turned = buildRenderModel(variant('pose', 'body', 'three_quarter'));
  assert.notEqual(frontal.body.centerX, turned.body.centerX);
});

test('semantic geometry is canonical and the hidden armature projects a turned face', () => {
  const reordered = {
    background: SAMPLE_PORTRAIT_SPEC.background,
    pose: structuredClone(SAMPLE_PORTRAIT_SPEC.pose),
    clothing: structuredClone(SAMPLE_PORTRAIT_SPEC.clothing),
    expression: structuredClone(SAMPLE_PORTRAIT_SPEC.expression),
    eyes: structuredClone(SAMPLE_PORTRAIT_SPEC.eyes),
    hair: structuredClone(SAMPLE_PORTRAIT_SPEC.hair),
    person: structuredClone(SAMPLE_PORTRAIT_SPEC.person),
    schema: SAMPLE_PORTRAIT_SPEC.schema
  };
  const original = buildRenderModel(SAMPLE_PORTRAIT_SPEC);
  const canonical = buildRenderModel(reordered);
  assert.deepEqual(original.semantic_geometry, canonical.semantic_geometry);
  assert.notEqual(
    buildRenderModel(variant('person', 'face_shape', 'angular'))
      .semantic_geometry.features.nose,
    original.semantic_geometry.features.nose
  );
  assert.notEqual(
    buildRenderModel(variant('hair', 'style', 'braided'))
      .semantic_geometry.features.hair,
    original.semantic_geometry.features.hair
  );

  const turnedSpec = variant('pose', 'body', 'three_quarter');
  turnedSpec.pose.head = 'slightly_turned';
  const turned = buildRenderModel(turnedSpec);
  const far = projectFacePoint(turned, -50, 0);
  const near = projectFacePoint(turned, 50, 0);
  assert.ok(turned.armature.face.farScale < turned.armature.face.nearScale);
  assert.ok(
    turned.armature.face.axisX - far.x
      < near.x - turned.armature.face.axisX
  );
});

test('renderer keeps an ink-first canvas without vector gradients', () => {
  const canvas = recordingCanvas();
  renderPortrait(canvas, SAMPLE_PORTRAIT_SPEC);
  const operationNames = canvas.operations.map(([name]) => name);
  assert.equal(operationNames.includes('createLinearGradient'), false);
  assert.equal(operationNames.includes('createRadialGradient'), false);
  assert.ok(operationNames.filter((name) => name === 'stroke').length > 90);
  assert.ok(operationNames.filter((name) => name === 'lineTo').length > 500);
});

test('transparent portrait mode omits only the paper background', () => {
  const defaultCanvas = recordingCanvas();
  const transparentCanvas = recordingCanvas();
  renderPortrait(defaultCanvas, SAMPLE_PORTRAIT_SPEC);
  renderPortrait(transparentCanvas, SAMPLE_PORTRAIT_SPEC, {
    background: false
  });
  assert.equal(defaultCanvas.operations.some(([name]) => name === 'fillRect'), true);
  assert.equal(
    transparentCanvas.operations.some(([name]) => name === 'fillRect'),
    false
  );
  assert.ok(transparentCanvas.operations.filter(([name]) => name === 'stroke')
    .length > 90);
});

test('scene visibility gives each occluded contour one visible owner', () => {
  const hairModel = buildRenderModel(SAMPLE_PORTRAIT_SPEC);
  const hairScene = buildPortraitScene(hairModel);
  assert.equal(hairScene.visibility.crownOwner, 'hair');
  assert.equal(hairScene.visibility.hidden.headCrown, true);
  assert.equal(
    hairScene.strokes.some((entry) => entry.points === hairScene.geometry.head.crown),
    false
  );
  assert.equal(
    hairScene.strokes.some(
      (entry) => entry.points === hairScene.geometry.hair.outer[0]
    ),
    true
  );

  const beardSpec = variant('hair', 'facial_hair', 'full_beard');
  const beardScene = buildPortraitScene(buildRenderModel(beardSpec));
  assert.equal(beardScene.visibility.jawOwner, 'beard');
  assert.equal(
    beardScene.strokes.some(
      (entry) => entry.points === beardScene.geometry.head.leftJaw
        || entry.points === beardScene.geometry.head.rightJaw
    ),
    false
  );
  assert.equal(
    beardScene.strokes.some(
      (entry) => entry.points === beardScene.geometry.beard.outer
    ),
    true
  );

  const scarfSpec = variant('clothing', 'headwear', 'headscarf');
  const scarfScene = buildPortraitScene(buildRenderModel(scarfSpec));
  assert.equal(scarfScene.visibility.crownOwner, 'headwear');
  assert.equal(
    scarfScene.strokes.some(
      (entry) => entry.points === scarfScene.geometry.hair.outer[0]
    ),
    false
  );
  assert.equal(
    scarfScene.strokes.filter(
      (entry) => entry.role === 'garment_silhouette'
    ).length,
    2
  );
  assert.equal(scarfScene.visibility.hidden.baseGarmentUnderOuter, true);

  for (const headwear of ['linen_cap', 'fur_hat']) {
    const coveredHairSpec = variant('clothing', 'headwear', headwear);
    const coveredHairScene = buildPortraitScene(
      buildRenderModel(coveredHairSpec)
    );
    assert.equal(coveredHairScene.visibility.crownOwner, 'headwear');
    for (const hiddenCrownStrand of coveredHairScene.geometry.hair.crownStrands) {
      assert.equal(
        coveredHairScene.hatches.some(
          (entry) => entry.points === hiddenCrownStrand
        ),
        false
      );
    }
    assert.equal(
      coveredHairScene.geometry.hair.sideStrands.some(
        (sideStrand) => coveredHairScene.hatches.some(
          (entry) => entry.points === sideStrand
        )
      ),
      true
    );
  }

  const coveredSpec = variant('clothing', 'headwear', 'headscarf');
  coveredSpec.hair.facial_hair = 'full_beard';
  const coveredScene = buildPortraitScene(buildRenderModel(coveredSpec));
  assert.equal(coveredScene.visibility.crownOwner, 'headwear');
  assert.equal(coveredScene.visibility.jawOwner, 'beard');
  for (const hiddenContour of [
    coveredScene.geometry.head.crown,
    coveredScene.geometry.head.leftSide,
    coveredScene.geometry.head.rightSide,
    coveredScene.geometry.head.leftJaw,
    coveredScene.geometry.head.rightJaw
  ]) {
    assert.equal(
      coveredScene.strokes.some((entry) => entry.points === hiddenContour),
      false
    );
  }
  assert.equal(
    coveredScene.strokes.some(
      (entry) => entry.points === coveredScene.geometry.beard.outer
    ),
    true
  );
  assert.equal(
    coveredScene.strokes.some(
      (entry) => entry.points === coveredScene.geometry.headwear.outer[0]
    ),
    true
  );
});

test('muted patches stay independent from the final ink contours', () => {
  const scene = buildPortraitScene(buildRenderModel(SAMPLE_PORTRAIT_SPEC));
  assert.ok(scene.patches.length < scene.strokes.length);
  for (const colorPatch of scene.patches) {
    assert.equal(
      scene.strokes.some((entry) => entry.points === colorPatch.points),
      false,
      `patch ${colorPatch.role} must not create its own outline`
    );
  }
});

test('ink-only mode remains a complete deterministic drawing without fill regions', () => {
  const scene = buildPortraitScene(buildRenderModel(SAMPLE_PORTRAIT_SPEC));
  const roles = new Set([
    ...scene.strokes,
    ...scene.hatches,
    ...scene.scratches
  ].map((entry) => entry.role));
  for (const required of [
    'garment_silhouette', 'neckline', 'garment_boundary', 'fold',
    'garment_trim', 'eye', 'nose', 'mouth'
  ]) {
    assert.equal(roles.has(required), true, `missing ink role: ${required}`);
  }

  const colored = recordingCanvas();
  const inkOnly = recordingCanvas();
  const inkRepeat = recordingCanvas();
  renderPortrait(colored, SAMPLE_PORTRAIT_SPEC);
  renderPortrait(inkOnly, SAMPLE_PORTRAIT_SPEC, { fills: false });
  renderPortrait(inkRepeat, SAMPLE_PORTRAIT_SPEC, { fills: false });
  const fills = (canvas) => canvas.operations
    .filter(([name]) => name === 'fill').length;
  assert.ok(fills(colored) >= fills(inkOnly) + scene.patches.length);
  assert.ok(
    inkOnly.operations.filter(([name]) => name === 'stroke').length > 90
  );
  assert.deepEqual(inkOnly.operations, inkRepeat.operations);
});

test('renderer is deterministic and handles every supported enum value', () => {
  for (const [group, fields] of Object.entries(PORTRAIT_SPEC_V1_ENUMS)) {
    if (group === 'background') {
      for (const value of fields) renderPortrait(recordingCanvas(), variant(null, 'background', value));
      continue;
    }
    for (const [field, values] of Object.entries(fields)) {
      for (const value of values) {
        assert.doesNotThrow(
          () => renderPortrait(recordingCanvas(), variant(group, field, value)),
          `${group}.${field}=${value}`
        );
      }
    }
  }

  const first = recordingCanvas();
  const second = recordingCanvas();
  renderPortrait(first, structuredClone(SAMPLE_PORTRAIT_SPEC));
  renderPortrait(second, structuredClone(SAMPLE_PORTRAIT_SPEC));
  assert.deepEqual(first.operations, second.operations);
});

function variant(group, field, value) {
  const spec = structuredClone(SAMPLE_PORTRAIT_SPEC);
  if (group == null) spec[field] = value;
  else spec[group][field] = value;
  return spec;
}

function recordingCanvas() {
  const operations = [];
  const gradient = () => ({
    addColorStop: (...args) => operations.push(['addColorStop', ...args])
  });
  const methods = [
    'save', 'restore', 'translate', 'rotate', 'clearRect', 'scale', 'fillRect',
    'beginPath', 'arc', 'stroke', 'moveTo', 'bezierCurveTo',
    'quadraticCurveTo', 'closePath', 'fill', 'clip', 'ellipse', 'lineTo'
  ];
  const target = {
    createLinearGradient: (...args) => {
      operations.push(['createLinearGradient', ...args]);
      return gradient();
    },
    createRadialGradient: (...args) => {
      operations.push(['createRadialGradient', ...args]);
      return gradient();
    }
  };
  for (const method of methods) {
    target[method] = (...args) => operations.push([method, ...args]);
  }
  const context = new Proxy(target, {
    set(object, property, value) {
      operations.push(['set', String(property), typeof value === 'object' ? 'object' : value]);
      object[property] = value;
      return true;
    }
  });
  return {
    width: 768,
    height: 768,
    operations,
    getContext: (kind) => kind === '2d' ? context : null
  };
}
