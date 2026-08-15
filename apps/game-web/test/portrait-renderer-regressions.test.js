import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildPortraitScene,
  buildRenderModel
} from '../src/portrait-lab/renderer.js';
import { SAMPLE_PORTRAIT_SPEC } from '../src/portrait-lab/sample.js';

test('visibility removes occluded colour regions and ear marks', () => {
  for (const outer of [
    'wrap', 'front_open', 'shoulder_drape', 'sleeveless_overlayer'
  ]) {
    const outerScene = scene(spec({ clothing: { outer } }));
    const clothing = outerScene.patches.filter(
      (entry) => entry.part === 'clothing'
    );
    assert.equal(
      clothing.some((entry) => (
        entry.layer === 'base' && entry.role !== 'garment_underlayer'
      )),
      false,
      outer
    );
    assert.equal(
      clothing.every((entry) => entry.owner === 'outer_garment'),
      true,
      outer
    );
    assert.equal(
      outerScene.strokes.filter(
        (entry) => entry.role === 'garment_silhouette'
      ).length,
      2,
      outer
    );
    assert.equal(
      patches(outerScene, 'garment_underlayer').length,
      outer === 'front_open' ? 1 : 0,
      outer
    );
    if (outer === 'front_open') {
      const underlayer = patches(outerScene, 'garment_underlayer')[0];
      for (const wash of patches(outerScene, 'garment_wash')) {
        assert.equal(
          polygonsOverlap(underlayer.points, wash.points),
          false,
          'front-open washes must not overlap the underlayer'
        );
      }
    }
  }

  for (const headwear of ['linen_cap', 'fur_hat']) {
    const coveredScene = scene(spec({
      hair: { length: 'long' },
      clothing: { headwear }
    }));
    assert.equal(patches(coveredScene, 'hair').length, 2, headwear);
    assert.equal(hasStroke(coveredScene, 'ear_mark'), false, headwear);
  }

  const scarf = scene(spec({
    hair: { length: 'long' },
    clothing: { headwear: 'headscarf' }
  }));
  assert.equal(hasPatch(scarf, 'hair'), false);
  assert.equal(patches(scarf, 'headwear').length, 1);
  assert.equal(hasStroke(scarf, 'ear_mark'), false);

  const braidedScarf = scene(spec({
    hair: { length: 'long', style: 'braided' },
    clothing: { headwear: 'headscarf' }
  }));
  assert.equal(hasStroke(braidedScarf, 'braid_lead'), false);
  assert.equal(hasStroke(braidedScarf, 'braid_link'), true);

  const longHair = scene(spec({ hair: { length: 'long' } }));
  assert.equal(hasStroke(longHair, 'ear_mark'), false);

  const visibleEars = scene(spec({
    hair: { length: 'short' },
    clothing: { headwear: 'none' }
  }));
  assert.equal(hasStroke(visibleEars, 'ear_mark'), true);
});

test('sleeves contain anchored arm boundaries down to the portrait crop', () => {
  const boundaries = [];
  for (const sleeve of ['narrow', 'wide']) {
    const portrait = scene(spec({ clothing: { outer: 'none', sleeve } }));
    const sleevePaths = portrait.geometry.clothing.seams.filter(
      (entry) => entry.id.startsWith('sleeve_')
    );
    assert.equal(sleevePaths.length, 2, sleeve);
    assert.deepEqual(
      sleevePaths.map((entry) => entry.points[0]),
      [
        portrait.geometry.body.anchors.shoulderLeft,
        portrait.geometry.body.anchors.shoulderRight
      ]
    );
    assert.ok(sleevePaths.every((entry) => (
      entry.points.at(-1)[1]
        >= portrait.geometry.body.anchors.waistLeft[1] - 2
    )));
    assert.ok(sleevePaths.every((entry) => portrait.strokes.some(
      (stroke) => stroke.boundaryId === entry.id
    )));
    boundaries.push(sleevePaths.map((entry) => entry.points));
  }
  assert.notDeepEqual(boundaries[0], boundaries[1]);

  const sleeveless = scene(spec({
    clothing: { outer: 'sleeveless_overlayer' }
  }));
  assert.equal(
    sleeveless.geometry.clothing.seams.some(
      (entry) => entry.id.startsWith('sleeve_')
    ),
    false
  );
  assert.deepEqual(
    sleeveless.geometry.clothing.outerBoundaries.map((entry) => entry.id),
    ['armhole_left', 'armhole_right']
  );
});

test('handmade strokes contain no independent per-point micro noise', async () => {
  const source = await readFile(
    new URL('../src/portrait-lab/handmade.js', import.meta.url),
    'utf8'
  );
  assert.doesNotMatch(
    source,
    /deterministicUnit\([^)]*\bindex\b[^)]*\)/u
  );
});

test('braided hair has its own visible procedural construction', () => {
  const braided = scene(spec({
    hair: { length: 'long', style: 'braided' }
  }));
  const straight = scene(spec({
    hair: { length: 'long', style: 'straight' }
  }));
  const braidInk = ink(braided).filter((entry) => entry.role?.startsWith('braid'));
  assert.ok(braidInk.length >= 6);
  assert.equal(hasStroke(braided, 'ear_mark'), false);
  assert.equal(
    ink(straight).some((entry) => entry.role?.startsWith('braid')),
    false
  );
});

test('long loose hair has attached open sides without a detached loop', () => {
  const loose = scene(spec({
    hair: { length: 'long', style: 'loose', facial_hair: 'none' },
    clothing: { headwear: 'none' }
  }));
  const [crown, leftSide, rightSide] = loose.geometry.hair.outer;
  assert.equal(loose.geometry.hair.outer.length, 3);
  assert.deepEqual(leftSide[0], crown[0]);
  assert.deepEqual(rightSide[0], crown.at(-1));
  assert.notDeepEqual(leftSide[0], leftSide.at(-1));
  assert.notDeepEqual(rightSide[0], rightSide.at(-1));
});

test('headscarf omits the detached angular tail loop', () => {
  const scarf = scene(spec({
    hair: { length: 'long', style: 'loose', facial_hair: 'none' },
    clothing: { headwear: 'headscarf' }
  }));
  assert.equal(scarf.geometry.headwear.outer.length, 1);
});

test('medium wavy hair stays clear of brows on a tilted turned face', () => {
  const value = spec({
    person: { age: 'old', build: 'average', face_shape: 'long' },
    hair: { length: 'medium', facial_hair: 'none' },
    expression: { emotion: 'angry', intensity: 'high' },
    pose: { head: 'tilted' }
  });
  assert.doesNotThrow(() => scene(value));
});

function spec(overrides = {}) {
  const value = structuredClone(SAMPLE_PORTRAIT_SPEC);
  for (const [group, fields] of Object.entries(overrides)) {
    Object.assign(value[group], fields);
  }
  return value;
}

function scene(value) {
  return buildPortraitScene(buildRenderModel(value));
}

function ink(value) {
  return [...value.strokes, ...value.hatches, ...value.scratches];
}

function hasPatch(value, role) {
  return value.patches.some((entry) => entry.role === role);
}

function patches(value, role) {
  return value.patches.filter((entry) => entry.role === role);
}

function hasStroke(value, role) {
  return ink(value).some((entry) => entry.role === role);
}

function polygonsOverlap(left, right) {
  if (left.some((point) => pointInsidePolygon(point, right))
      || right.some((point) => pointInsidePolygon(point, left))) {
    return true;
  }
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const leftEnd = (leftIndex + 1) % left.length;
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const rightEnd = (rightIndex + 1) % right.length;
      if (segmentsCross(
        left[leftIndex], left[leftEnd], right[rightIndex], right[rightEnd]
      )) return true;
    }
  }
  return false;
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

function segmentsCross(a, b, c, d) {
  const side = (start, end, point) => (
    (end[0] - start[0]) * (point[1] - start[1])
      - (end[1] - start[1]) * (point[0] - start[0])
  );
  const abC = side(a, b, c);
  const abD = side(a, b, d);
  const cdA = side(c, d, a);
  const cdB = side(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}
