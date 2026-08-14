import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildPortraitScene,
  buildRenderModel
} from '../src/portrait-lab/renderer.js';
import { SAMPLE_PORTRAIT_SPEC } from '../src/portrait-lab/sample.js';

test('visibility removes occluded colour regions and ear marks', () => {
  for (const outer of ['caftan', 'cloak', 'sheepskin']) {
    const outerScene = scene(spec({ clothing: { outer } }));
    assert.equal(hasPatch(outerScene, 'tunic'), false, outer);
    assert.equal(hasPatch(outerScene, 'skin'), false, outer);
    assert.equal(patches(outerScene, outer).length, 1, outer);
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
  assert.equal(hasStroke(braidedScarf, 'braid_link'), false);

  const longHair = scene(spec({ hair: { length: 'long' } }));
  assert.equal(hasStroke(longHair, 'ear_mark'), false);

  const visibleEars = scene(spec({
    hair: { length: 'short' },
    clothing: { headwear: 'none' }
  }));
  assert.equal(hasStroke(visibleEars, 'ear_mark'), true);
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
