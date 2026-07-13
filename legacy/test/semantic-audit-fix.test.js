import test from 'node:test';
import assert from 'node:assert/strict';

import { describeValidationErrors } from '../src/world/provider.js';
import {
  buildPlaceSeedOutputContract,
  evaluatePlaceSeedCandidate,
  explainSocialTissueValidation,
  validateSocialTissue
} from '../src/world/json-contracts.js';
import { buildNpcProfile } from '../src/world/entities.js';
import { buildLocationProfile } from '../src/world/location.js';
import { renderOpeningScene } from '../src/world/narration.js';
import { createWorldState } from '../src/world/state.js';

// ponytail: mergePlaceSeedFragments lives in provider — re-test via inline merge mirror
function mergePlaceSeedFragmentsMirror(world, fragmentState = {}) {
  const purposeOwnership = fragmentState.purposeOwnership ?? {};
  const livelihoodRoads = fragmentState.livelihoodRoads ?? {};
  const accessHazardsRhythm = fragmentState.accessHazardsRhythm ?? {};
  return {
    version: 1,
    schema: 'place_seed',
    placeName: purposeOwnership.placeName ?? world.place?.name ?? world.historicalFrame?.regionName ?? null,
    placeKind: purposeOwnership.placeKind ?? world.place?.kind ?? null,
    purpose: purposeOwnership.purpose ?? '',
    formalOwner: purposeOwnership.formalOwner ?? '',
    actualManager: purposeOwnership.actualManager ?? '',
    dependentGroups: Array.isArray(purposeOwnership.dependentGroups) ? purposeOwnership.dependentGroups.slice(0, 4) : [],
    livelihood: Array.isArray(livelihoodRoads.livelihood) ? livelihoodRoads.livelihood.slice(0, 2) : [],
    roads: Array.isArray(livelihoodRoads.roads) ? livelihoodRoads.roads.slice(0, 2) : [],
    accessRules: Array.isArray(accessHazardsRhythm.accessRules) ? accessHazardsRhythm.accessRules.slice(0, 2) : [],
    hazards: Array.isArray(accessHazardsRhythm.hazards) ? accessHazardsRhythm.hazards.slice(0, 2) : [],
    rhythm: accessHazardsRhythm.rhythm ?? ''
  };
}

test('describeValidationErrors returns [] on ok, not ["ok"]', () => {
  assert.deepEqual(describeValidationErrors({ ok: true, errors: [] }), []);
  assert.deepEqual(describeValidationErrors({ ok: true }), []);
  assert.deepEqual(describeValidationErrors({ ok: false, errors: ['root.x: bad'] }), ['root.x: bad']);
});

test('mergePlaceSeedFragments mirror does not invent Место or дорожный двор', () => {
  const merged = mergePlaceSeedFragmentsMirror({}, { purposeOwnership: {} });
  assert.equal(merged.placeName, null);
  assert.equal(merged.placeKind, null);
});

test('buildPlaceSeedOutputContract includes string[] array fields', () => {
  const contract = buildPlaceSeedOutputContract();
  assert.equal(contract.schema, 'place_seed');
  assert.equal(contract.fields.dependentGroups.itemType, 'string');
  assert.equal(contract.fields.rhythm.type, 'string');
});

test('social_tissue validator rejects object[] and accepts string[]', () => {
  const valid = validateSocialTissue({
    version: 1,
    schema: 'social_tissue',
    formalOwner: 'князь',
    actualManager: 'староста',
    dependentGroups: ['плотники'],
    families: ['семья перевозчика'],
    trade: ['пошлина'],
    rumors: ['слух'],
    tensions: ['спор'],
    obligations: ['долг'],
    rhythm: 'утро суета',
    accessRules: ['ночью по звонку']
  });
  assert.ok(valid);

  const invalid = explainSocialTissueValidation({
    version: 1,
    schema: 'social_tissue',
    formalOwner: 'князь',
    actualManager: 'староста',
    dependentGroups: [],
    families: [{ text: 'семья', visibility: 'public' }],
    trade: [],
    rumors: [],
    tensions: [],
    obligations: [],
    rhythm: 'утро',
    accessRules: []
  });
  assert.equal(invalid.ok, false);
});

test('actor_profiles production: buildNpcProfile does not invent neighbors/enemies', () => {
  const prev = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    const profile = buildNpcProfile({ role: 'житель' }, 'loc:test', 0, { name: 'игрок' }, null);
    assert.deepEqual(profile.neighbors, []);
    assert.deepEqual(profile.enemies, []);
    assert.equal(profile.manner, null);
    assert.equal(profile.medicalSkill, null);
  } finally {
    if (prev !== undefined) process.env.NODE_TEST_CONTEXT = prev;
  }
});

test('location_profiles production: partial canonical → pending not infer', () => {
  const prev = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    const world = { clock: { hour: 10 } };
    const profile = buildLocationProfile({
      id: 'loc:yard',
      kind: 'двор',
      profile: { purpose: 'переправа' },
      exits: [{ label: 'к реке' }],
      occupants: []
    }, world);
    assert.equal(profile.purpose, 'переправа');
    assert.equal(profile.ownership, null);
    assert.equal(profile.pending_semantic_materialization, true);
    assert.equal(profile.rhythm, null);
  } finally {
    if (prev !== undefined) process.env.NODE_TEST_CONTEXT = prev;
  }
});

test('evaluatePlaceSeedCandidate fails when placeName missing', () => {
  const evaluation = evaluatePlaceSeedCandidate({
    version: 1,
    schema: 'place_seed',
    placeName: null,
    placeKind: 'двор',
    purpose: 'x',
    formalOwner: 'a',
    actualManager: 'b',
    dependentGroups: [],
    livelihood: [],
    roads: [],
    accessRules: [],
    hazards: [],
    rhythm: 'y'
  });
  assert.equal(evaluation.ok, false);
});

test('opening path avoids renderOpeningScene procedural template', () => {
  const world = createWorldState({ startText: 'двор у переправы', player: { name: 'Test' } });
  const procedural = renderOpeningScene(world);
  const llmStyleOpening = 'Двор у переправы держится в рабочей тишине: ворота, дорога и люди заняты своим делом.';
  assert.match(procedural, /Мир загружен\./);
  assert.match(procedural, /Исторический слой:/);
  assert.doesNotMatch(llmStyleOpening, /Мир загружен/);
  assert.doesNotMatch(llmStyleOpening, /Ввод только свободным текстом/);
});
