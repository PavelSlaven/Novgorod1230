import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldState, ensureWorldRng } from '../src/world/state.js';
import { buildActionCheck } from '../src/world/checks.js';
import { planMasterTurnSync } from '../src/world/master.js';
import { simulateTurnMechanics } from '../src/world/engine.js';
import { evaluateCheckOutcome, progressBandFromSteps } from '../src/world/formulas.js';
import { rollD20, RNG_ALGORITHM } from '../src/world/rng.js';
import {
  deriveCarriedWeight,
  deriveLoadWeightValidation,
  resolveLoadCategory
} from '../src/world/load-model.js';
import { loadDesignBundleSync, inspectDesignBundleCoverageSync } from '../src/world/corpus-loader.js';
import { assessActionSocialRisk } from '../src/world/social.js';
import { validateStateDeltaItemChange } from '../src/world/item-resolver.js';
import { allowsProceduralSemantics } from '../src/world/semantic-gate.js';
import { travelWorld } from '../src/world/location.js';

function makeSignificantItem(overrides = {}) {
  return {
    label: 'нож',
    type: 'weapon',
    material: 'железо',
    condition: 'целый',
    size: 'small',
    placement: 'carried',
    access: 'immediate',
    visibility: 'visible',
    legal_status: 'legal',
    function: 'режет',
    weight: 1,
    discoverability: 0.8,
    plausibility: 0.8,
    risk: 1,
    visible: true,
    marks: [],
    owner_id: 'npc:1',
    holder_id: 'player',
    ownership_status: 'stolen',
    holder_status: 'carried',
    ...overrides
  };
}

test('new world always initializes seeded rng', () => {
  const world = createWorldState({ startText: 'двор' });
  assert.ok(world.rng);
  assert.equal(world.rng.algorithm, RNG_ALGORITHM);
  assert.equal(typeof world.rng.seed, 'string');
  assert.equal(world.rng.counter, 0);
});

test('seeded rng is reproducible and counter increments', () => {
  const worldA = createWorldState({ startText: 'двор', worldKey: 'repeat-seed' });
  const worldB = createWorldState({ startText: 'двор', worldKey: 'repeat-seed' });
  const prev = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    const rollA = rollD20({ world: worldA, testMode: false });
    const rollB = rollD20({ world: worldB, testMode: false });
    assert.equal(rollA.value, rollB.value);
    assert.equal(rollA.rng_mode, 'seeded');
    assert.ok(rollA.seed_ref);
    assert.equal(worldA.rng.counter, 1);
    rollD20({ world: worldA, testMode: false });
    assert.equal(worldA.rng.counter, 2);
  } finally {
    if (prev !== undefined) process.env.NODE_TEST_CONTEXT = prev;
  }
});

test('rollRecord stores seed_ref algorithm and counter outside test rng mode', () => {
  const world = createWorldState({ startText: 'двор' });
  ensureWorldRng(world, 'audit-roll');
  const prev = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    const plan = planMasterTurnSync(world, 'осматриваю двор');
    const check = buildActionCheck(world, plan.frame);
    if (!check.required) return;
    assert.equal(check.rollRecord.die, 'd20');
    assert.equal(check.rollRecord.rng_mode, 'seeded');
    assert.ok(check.rollRecord.seed_ref);
    assert.equal(check.rollRecord.algorithm, RNG_ALGORITHM);
    assert.equal(check.rollRecord.counter, 0);
    assert.ok(check.check_audit?.rng?.seed_ref);
  } finally {
    if (prev !== undefined) process.env.NODE_TEST_CONTEXT = prev;
  }
});

test('natural 1 and 20 follow margin table without auto override', () => {
  const low = evaluateCheckOutcome(1, 25, 30);
  assert.equal(low.roll_note, 'natural_1');
  assert.equal(low.band, 'failure_with_consequence');
  assert.equal(low.success, false);

  const high = evaluateCheckOutcome(20, 5, 30);
  assert.equal(high.roll_note, 'natural_20');
  assert.equal(high.band, 'severe_failure');
  assert.equal(high.success, false);
});

test('suspicion does not raise DC and modifier together', () => {
  const world = createWorldState({ startText: 'двор' });
  world.social = { ...(world.social ?? {}), suspicion: 8 };
  const plan = planMasterTurnSync(world, 'говорю со старостой');
  const check = buildActionCheck(world, plan.frame);
  if (!check.required) return;
  const modifierIds = new Set((check.modifiers ?? []).map((item) => item.source_id));
  const dcBasis = check.check_breakdown?.dc_basis ?? [];
  assert.equal(modifierIds.has('social:suspicion'), false);
  assert.equal(dcBasis.some((item) => String(item).includes('suspicion')), false);
  assert.ok((check.social_risk?.social_risk_score ?? 0) >= 2);
});

test('steal keeps physical check separate from social risk', () => {
  const world = createWorldState({ startText: 'двор' });
  world.social = { ...(world.social ?? {}), recentWitnesses: ['староста', 'стражник'] };
  const plan = planMasterTurnSync(world, 'краду мешок');
  plan.frame.intent.type = 'steal';
  plan.frame.riskAudit = { required: true };
  const check = buildActionCheck(world, plan.frame);
  const risk = assessActionSocialRisk(world, plan.frame, plan.frame.intent);
  assert.ok(risk.social_risk_score >= 4);
  assert.ok(risk.factors.includes('theft'));
  if (Array.isArray(check.modifiers)) {
    assert.equal(check.modifiers.some((item) => item.label.includes('кража')), false);
  }
});

test('explicit total_weight cannot understate load category', () => {
  const player = {
    attributes: { strength: 10 },
    items: {
      total_weight: 3,
      weapons: [{ id: 'w1', weight: 8 }],
      armor: [{ id: 'a1', weight: 10 }],
      carried_items: [{ id: 'c1', weight: 5 }]
    }
  };
  const validation = deriveLoadWeightValidation(player);
  assert.equal(validation.status, 'mismatch');
  assert.equal(validation.source_of_truth, 'calculated');
  assert.equal(deriveCarriedWeight(player), 23);
  assert.equal(resolveLoadCategory(player), 'moderate');
});

test('combat candidate does not mutate npc health before semantic commit in production path', () => {
  const previous = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    const world = createWorldState({ startText: 'переправа и двор' });
    world.npcs = [{
      id: 'npc:guard',
      name: 'Стражник',
      health: 100,
      locationId: world.currentLocationId,
      current_position: { location_id: world.currentLocationId }
    }];
    const plan = planMasterTurnSync(world, 'Я нападаю на стражника');
    plan.frame.world.combat = {
      targetDefense: 12,
      target: { id: 'npc:guard', name: 'Стражник', vulnerability: 2, armorProtection: 0 },
      attackFocus: { zone: 'body', direction: 'front' }
    };
    const check = { ...buildActionCheck(world, plan.frame), degree: 'success', total: 25, dc: 12, roll: 15 };
    const { draft } = simulateTurnMechanics(world, plan, plan.frame.intent, check);
    const npc = draft.npcs[0];
    if (allowsProceduralSemantics(world) === false) {
      assert.equal(npc.health, 100);
      assert.ok((draft.pendingMechanicalDiffs ?? []).some((item) => item.type === 'combat_damage_candidate'));
    }
  } finally {
    if (previous !== undefined) process.env.NODE_TEST_CONTEXT = previous;
  }
});

test('long course progress leaves near band after repeated steps', () => {
  assert.equal(progressBandFromSteps(1), 'near');
  assert.equal(progressBandFromSteps(4), 'day');
  assert.notEqual(progressBandFromSteps(12), 'near');
  const world = createWorldState({ startText: 'переправа' });
  world.movement = { travel_course: { progress: 10, confidence: 0.4, perceived_sector: 'север' } };
  const result = travelWorld(world, 'иду на север');
  const course = result?.travel_course ?? world.movement.travel_course;
  assert.ok(course.progress > 10);
  assert.notEqual(course.progress_band, 'near');
});

test('formulas.md is bundled for core mechanical tasks', () => {
  for (const task of ['combat', 'movement', 'inventory', 'master_narrative']) {
    const bundle = loadDesignBundleSync(task);
    assert.match(bundle, /formulas\.md/u);
    const coverage = inspectDesignBundleCoverageSync(task, bundle);
    assert.equal(coverage.ok, true, `${task}: ${coverage.missing?.join('; ') ?? 'missing excerpt'}`);
  }
});

test('significant item update requires owner holder access risk contract', () => {
  const world = createWorldState({ startText: 'двор' });
  const bad = validateStateDeltaItemChange(world, {
    op: 'move',
    item_id: 'item:knife',
    item: makeSignificantItem({ owner_id: null, holder_id: null, access: null, risk: null, placement: null })
  });
  assert.equal(bad.ok, false);
});
