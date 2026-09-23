import assert from 'node:assert/strict';
import test from 'node:test';
import { sha256 } from '@rus/kernel';
import { approvedNaturalPerceptionFixture } from './g4-natural-perception-fixture.js';
import { readInitialCanonicalNaturalSourceState } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-2-initial-state.js';

async function fixture() {
  const source = await approvedNaturalPerceptionFixture({ canonical: true });
  const { input, initialRule, sceneClosure } = source;
  const environment = { ...input.currentFacts.current_environment,
    calendar_date: initialRule.initial_environment_inputs.calendar_date,
    local_minute_of_day: initialRule.initial_environment_inputs.local_minute_of_day };
  const changeSet = 'initial-change';
  const stamped = (value) => ({ ...value, state_version: 1, updated_change_set_id: changeSet });
  const expected = { player: { character_id: 'player:1' },
    body: stamped({ health: 100, energy: 80, satiety: 70, body_profile_ref: { id: 'body-ready' } }),
    clock: stamped({ ...initialRule.initial_environment_inputs.game_timestamp,
      clock_owner_kind: 'party', clock_owner_id: null }), conditions: [] };
  const payload = { schema: 'rus.authored_start_initial_party_snapshot.v3',
    request_identity: { party_id: 'party:1', scenario_id: initialRule.scenario_id,
      idempotency_key: 'initial-idempotency', scenario_manifest_digest: initialRule.source_candidate_sha256,
      world_revision_id: initialRule.world_pin.world_revision_id,
      world_catalog_digest: initialRule.world_pin.world_catalog_digest },
    immediate: { player: { instance_id: 'player:1' }, environment_snapshot: environment,
      timestamp: structuredClone(initialRule.initial_environment_inputs.game_timestamp) },
    policy_profile_pins: [{ key: initialRule.rule.id, revision: initialRule.rule.version,
      digest: initialRule.source_candidate_sha256 }],
    initial_spatial_v3_runtime: { g5: 'site', baseline: 'baseline', position: 'position:shore' },
    persisted_projection: expected, persisted_projection_digest: sha256(expected) };
  const row = { world_revision_id: initialRule.world_pin.world_revision_id,
    world_catalog_digest: initialRule.world_pin.world_catalog_digest,
    party_state_version: 0, session_state_version: 1, turn_number: 0, last_turn_id: null,
    stage26_result: { scenario_id: initialRule.scenario_id }, state_payload: payload,
    state_digest: sha256(payload), body: structuredClone(expected.body), clock: structuredClone(expected.clock),
    conditions: [], body_history_count: 0, change_sets: [{ id: changeSet, operation_kind: 'new_game' }] };
  const scene = input.currentFacts.scene;
  const snapshot = { site: stamped({ id: 'site' }), baseline: stamped({ id: 'baseline' }),
    location: stamped({ party_id: 'party:1', owner_id: 'player:1', scene_position_id: 'position:shore' }),
    positions: scene.positions.map(stamped), g6: scene.g6.map(stamped),
    acoustic_profiles: scene.acoustic_profiles.map(stamped), visibility_links: [], acoustic_edges: [], portals: [] };
  const args = { partyId: 'party:1', actorId: 'player:1', snapshot, sceneClosure,
    verifiedCatalog: input.verifiedCatalog, pin: input.pin,
    rule_ref: { id: initialRule.rule.id, version: initialRule.rule.version },
    transaction: { async query(sql, params) {
      assert.match(sql, /party_state_snapshots/u);
      assert.deepEqual(params, ['party:1', 'player:1']);
      return { rows: [row] };
    } } };
  return { args, row };
}

test('initial supplier admits only exact committed initial sensory source and pinned rule', async () => {
  const { args } = await fixture();
  const current = await readInitialCanonicalNaturalSourceState(args);
  assert.equal(current.position_id, 'position:shore');
  assert.equal(current.visual_capability, 'clear');
  assert.equal(current.canonical_initial_state.verified, true);
  assert.equal(current.canonical_initial_state.initial_snapshot_identity.state_version, 0);
  assert.ok(current.source_observations.length > 0);
  assert.ok(current.source_observations.every((value) => value.source_state === 'present'
    && value.stable_cover === 'partial' && value.source_position_id === 'position:shore'));
  assert.ok(current.source_observations.every((value) => value.layer !== 'audible_context'));
});

test('wait, body change, scene change, different request and altered snapshot cannot reuse initial facts', async () => {
  const mutations = [
    ({ row }) => { row.party_state_version = 1; },
    ({ row }) => { row.turn_number = 1; },
    ({ row }) => { row.last_turn_id = 'turn'; },
    ({ row }) => { row.clock.whole_minutes = String(Number(row.clock.whole_minutes) + 1); },
    ({ row }) => { row.clock.state_version = 2; },
    ({ row }) => { row.body.energy -= 1; },
    ({ row }) => { row.conditions.push({ condition_id: 'blindness' }); },
    ({ row }) => { row.body_history_count = 1; },
    ({ row }) => { row.change_sets.push({ id: 'world', operation_kind: 'materialization' }); },
    ({ args }) => { args.snapshot.positions[0].state_version = 2; },
    ({ args }) => { args.snapshot.location.updated_change_set_id = 'another'; },
    ({ row }) => { row.state_payload.policy_profile_pins[0].digest = 'f'.repeat(64);
      row.state_digest = sha256(row.state_payload); },
    ({ row }) => { row.state_payload.immediate.environment_snapshot.light_state = 'night'; },
    ({ row }) => { row.state_payload.request_identity.idempotency_key = null;
      row.state_digest = sha256(row.state_payload); }
  ];
  for (const mutate of mutations) {
    const value = await fixture(); mutate(value);
    await assert.rejects(readInitialCanonicalNaturalSourceState(value.args),
      { code: 'NATURAL_SCENE_PERCEPTION_DATA_GAP' });
  }
  const value = await fixture();
  value.args.verifiedCatalog.records_by_table.procedural_scene_compiled_records.pop();
  await assert.rejects(readInitialCanonicalNaturalSourceState(value.args),
    { code: 'G4_NATURAL_INITIAL_RULE_INVALID' });
});
