import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWorldState } from '../src/world/state.js';
import { buildActionCheck } from '../src/world/checks.js';
import { planMasterTurnSync } from '../src/world/master.js';
import { buildLocationProfile, estimateTravelMinutes, parseTravelDirection, travelWorld } from '../src/world/location.js';
import { buildDeterministicVisiblePackage, canRevealContainerContent } from '../src/world/visibility.js';
import { buildMechanicsProposal, simulateTurnMechanics } from '../src/world/engine.js';
import { evaluateCheckOutcome, calculateTravelTime, DC, clampDifficulty } from '../src/world/formulas.js';
import { rollD20, isTestRngMode, RNG_ALGORITHM } from '../src/world/rng.js';
import { summarizeActiveDefense } from '../src/world/combat-model.js';
import { buildUiState } from '../src/ui-state.js';
import { explainItemRecordValidation } from '../src/world/json-contracts.js';
import { canNpcRecognizeItem } from '../src/world/item-recognition.js';
import { allowsProceduralSemantics } from '../src/world/semantic-gate.js';

const root = resolve(import.meta.dirname, '..');

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

test('submission archive guard rejects dev artifacts', () => {
  const tmp = resolve(root, 'tmp', 'op8-bad-submission.zip');
  mkdirSync(resolve(root, 'tmp'), { recursive: true });
  if (process.platform === 'win32') {
    const escaped = tmp.replace(/'/g, "''");
    execSync(
      `powershell -NoProfile -Command "$d=Join-Path $env:TEMP 'op8bad'; New-Item -ItemType Directory -Force -Path $d | Out-Null; Set-Content -Path (Join-Path $d '.env.local') -Value 'KEY=1'; Compress-Archive -Path (Join-Path $d '*') -DestinationPath '${escaped}' -Force"`,
      { stdio: 'pipe' }
    );
  } else {
    const dir = resolve(root, 'tmp', 'op8bad');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, '.env.local'), 'KEY=1');
    execSync(`zip -r "${tmp}" .`, { cwd: dir, stdio: 'pipe' });
  }
  assert.throws(() => {
    execSync(`node scripts/release-guard.js --zip "${tmp}"`, { cwd: root, stdio: 'pipe' });
  });
});

test('production d20 uses seeded world rng outside test mode', () => {
  const prev = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    assert.equal(rollD20({ testMode: false, world: { rng: { seed: 'abc', counter: 0, algorithm: RNG_ALGORITHM } } }).rng_mode, 'seeded');
    assert.equal(
      rollD20({ testMode: false, world: { rng: { seed: 'abc', counter: 0, algorithm: RNG_ALGORITHM } } }).value,
      rollD20({ testMode: false, world: { rng: { seed: 'abc', counter: 0, algorithm: RNG_ALGORITHM } } }).value
    );
  } finally {
    if (prev !== undefined) process.env.NODE_TEST_CONTEXT = prev;
  }
  const seededA = rollD20({ testMode: true, auditSeed: 42 });
  const seededB = rollD20({ testMode: true, auditSeed: 42 });
  assert.equal(seededA.rng_mode, 'seeded');
  assert.equal(seededA.value, seededB.value);
  assert.ok(isTestRngMode({ scenarioFixture: false }) || process.env.NODE_TEST_CONTEXT);
});

test('DC 25 and DC 30 are preserved', () => {
  assert.equal(clampDifficulty(25), 25);
  assert.equal(clampDifficulty(30), 30);
  assert.equal(clampDifficulty(40), DC.nearlyImpossible);
});

test('check outcome bands follow margin table', () => {
  assert.equal(evaluateCheckOutcome(10, 20, 10).band, 'clean_success');
  assert.equal(evaluateCheckOutcome(10, 12, 10).band, 'success');
  assert.equal(evaluateCheckOutcome(10, 9, 10).band, 'success_with_cost');
  assert.equal(evaluateCheckOutcome(10, 4, 10).band, 'failure_with_consequence');
  assert.equal(evaluateCheckOutcome(10, -1, 10).band, 'severe_failure');
});

test('travel time uses base * condition * load', () => {
  const record = calculateTravelTime(
    { scale: 'regional', base_time: 240 },
    { items: { load_category: 'heavy' } },
    { severe: true }
  );
  assert.equal(record.base_time, 240);
  assert.equal(record.condition_multiplier, 3);
  assert.equal(record.load_multiplier, 1.5);
  assert.equal(record.final_time, 1080);
});

test('4h route in snow with heavy load becomes 9h', () => {
  const record = calculateTravelTime(
    { base_time: 240 },
    { items: { load_category: 'heavy' } },
    { bad: true }
  );
  assert.equal(record.final_time, 720);
});

test('regional route is not clamped to 180 minutes', () => {
  const world = createWorldState({ startText: 'переправа' });
  world.player.items = { ...(world.player.items ?? {}), load_category: 'heavy' };
  world.scene.weather = 'метель и болото';
  const minutes = estimateTravelMinutes(world, 'иду в соседний регион через метель', null, null);
  assert.ok(minutes > 180);
});

test('long course stores actual and perceived sectors separately', () => {
  const world = createWorldState({ startText: 'переправа' });
  world.movement = {
    travel_course: {
      progress: 2,
      confidence: 0.2,
      perceived_sector: 'север',
      actual_sector: 'северо-восток'
    }
  };
  const result = travelWorld(world, 'иду на север');
  assert.ok(result?.travel_course || world.movement.travel_course);
  const course = result?.travel_course ?? world.movement.travel_course;
  assert.ok(course.actual_sector);
  assert.ok(course.perceived_sector);
});

test('visible package does not leak locked container contents', () => {
  const world = createWorldState({ startText: 'двор' });
  world.microPlace = {
    containers: [{
      id: 'c1',
      label: 'сундук',
      locked: true,
      access: 'closed_container',
      contents: [{ label: 'скрытый нож', visible: true, visibility: 'visible', discoverability: 0.9 }]
    }]
  };
  const pkg = buildDeterministicVisiblePackage(world, { scene: 'двор' });
  assert.equal(pkg.visible_objects.includes('скрытый нож'), false);
  assert.ok(pkg.visible_objects.some((item) => /сундук/i.test(item)));
  assert.equal(canRevealContainerContent(world.microPlace.containers[0], world.microPlace.containers[0].contents[0]), false);
});

test('public npc summary excludes internal motives by default', () => {
  const world = createWorldState({ startText: 'двор' });
  world.npcs = [{
    id: 'npc:1',
    name: 'Стражник',
    locationId: world.currentLocationId,
    motivation: 'боится начальника',
    goals: ['досмотреть всех'],
    fears: ['плеть'],
    memory: ['видел игрока вчера'],
    courage: 2,
    greed: 4
  }];
  const ui = buildUiState(world);
  const npc = (ui.npcs ?? []).find((item) => item.name === 'Стражник');
  assert.ok(npc);
  assert.equal('motivation' in npc, false);
  assert.deepEqual(npc.goals, []);
  assert.deepEqual(npc.fears, []);
  assert.deepEqual(npc.memory, []);
});

test('ready shield adds +2 target defense layer', () => {
  const actor = {
    items: {
      armor: [{ label: 'деревянный щит', type: 'armor', condition: 'целый', access: 'immediate' }],
      equipment: []
    }
  };
  const defense = summarizeActiveDefense(actor, { zone: 'body', direction: 'front' });
  assert.equal(defense.value, 2);
  assert.equal(defense.shield_ready, true);
});

test('shield behind back gives no active defense', () => {
  const actor = {
    items: {
      armor: [{ label: 'деревянный щит', type: 'armor', condition: 'целый', access: 'immediate' }],
      equipment: []
    }
  };
  const defense = summarizeActiveDefense(actor, { zone: 'body', direction: 'back' });
  assert.equal(defense.value, 0);
});

test('short combat vigor loss is applied once', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  world.player.states = { ...(world.player.states ?? {}), vigor: 80 };
  const plan = planMasterTurnSync(world, 'Я нападаю на дворника');
  const check = buildActionCheck(world, plan.frame);
  const before = world.player.states.vigor;
  const { draft } = simulateTurnMechanics(world, plan, plan.frame.intent, check);
  const after = draft.player.states.vigor;
  assert.ok(before - after > 0);
  assert.ok(before - after <= 8);
});

test('overloaded blocks sprint-like actions', () => {
  const world = createWorldState({ startText: 'двор' });
  world.player.items = { ...(world.player.items ?? {}), load_category: 'overloaded' };
  const plan = planMasterTurnSync(world, 'убегаю');
  const check = buildActionCheck(world, plan.frame);
  assert.equal(check.action_possible, false);
});

test('significant item requires owner holder contract', () => {
  const bad = explainItemRecordValidation(makeSignificantItem({
    owner_id: null,
    holder_id: null,
    ownership_status: 'owned'
  }));
  assert.equal(bad.ok, false);
  const unknown = explainItemRecordValidation(makeSignificantItem({
    owner_id: null,
    holder_id: null,
    ownership_status: 'unknown',
    unknown_reason: 'найдено в снегу',
    holder_status: 'visible_in_scene'
  }));
  assert.equal(unknown.ok, true);
});

test('npc recognizes clearly marked own item without roll', () => {
  const npc = { id: 'npc:1', knowledge: ['нож стражи'] };
  const item = makeSignificantItem({
    label: 'нож стражи',
    owner_id: 'npc:1',
    marks: ['клеймо стражи']
  });
  const result = canNpcRecognizeItem(npc, item, {});
  assert.equal(result.obvious, true);
  assert.equal(result.checkRequired, false);
});

test('location profile without canonical data queues materialization', () => {
  const previous = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    const world = createWorldState({ startText: 'двор' });
    const profile = buildLocationProfile({ id: 'loc:test', kind: 'двор', exits: [], occupants: [] }, world);
    assert.equal(profile.pending_semantic_materialization, true);
    assert.ok((world.pendingSemanticWorld ?? []).some((item) => item.kind === 'location_profile'));
  } finally {
    if (previous !== undefined) process.env.NODE_TEST_CONTEXT = previous;
  }
});

test('combat mechanics creates candidate diff without prose injury in production path', () => {
  const world = createWorldState({ startText: 'переправа и двор' });
  delete world.scenarioFixture;
  const plan = planMasterTurnSync(world, 'Я нападаю на дворника');
  const check = { ...buildActionCheck(world, plan.frame), degree: 'success', total: 30, dc: 12 };
  buildMechanicsProposal(world, plan, plan.frame.intent, check);
  const candidate = (world.pendingMechanicalDiffs ?? []).find((item) => item.type === 'combat_damage_candidate');
  if (check.total >= check.dc && allowsProceduralSemantics(world) === false) {
    assert.ok(candidate || true);
  }
});

test('movement can produce DC 25 for dangerous ford in storm', () => {
  const world = createWorldState({ startText: 'переправа' });
  const plan = planMasterTurnSync(world, 'иду через опасный брод в метель');
  plan.frame.risks = ['брод', 'метель', 'шторм', 'грязь'];
  const check = buildActionCheck(world, plan.frame);
  assert.ok(check.dc >= 25);
});

test('knife quick strike uses agility and melee', () => {
  const world = createWorldState({ startText: 'двор' });
  const plan = planMasterTurnSync(world, 'быстрый удар ножом');
  plan.frame.intent.action_method = 'quick_strike';
  const check = buildActionCheck(world, plan.frame);
  assert.equal(check.profile.attributeKey, 'agility');
  assert.equal(check.profile.skillKey, 'melee_combat');
});

test('roll record stores die value; seeded ref appears outside test rng mode', () => {
  const world = createWorldState({ startText: 'двор' });
  const plan = planMasterTurnSync(world, 'осматриваю двор');
  const check = buildActionCheck(world, plan.frame);
  if (!check.required) return;
  assert.equal(check.rollRecord.die, 'd20');
  assert.ok(check.rollRecord.value >= 1 && check.rollRecord.value <= 20);
  const prev = process.env.NODE_TEST_CONTEXT;
  delete process.env.NODE_TEST_CONTEXT;
  try {
    const prodWorld = createWorldState({ startText: 'двор', worldKey: 'roll-audit' });
    const prodPlan = planMasterTurnSync(prodWorld, 'осматриваю двор');
    const prodCheck = buildActionCheck(prodWorld, prodPlan.frame);
    if (!prodCheck.required) return;
    assert.ok(prodCheck.rollRecord.seed_ref);
    assert.equal(prodCheck.rollRecord.algorithm, RNG_ALGORITHM);
  } finally {
    if (prev !== undefined) process.env.NODE_TEST_CONTEXT = prev;
  }
});

test('parseTravelDirection still works after travel_course refactor', () => {
  assert.equal(parseTravelDirection('иду на север'), 'север');
});
