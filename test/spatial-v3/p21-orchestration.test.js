import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import {
  SPATIAL_V3_COMMAND_KINDS,
  createSpatialV3CommandRegistry,
  createSpatialV3ModeHandoffOrchestrator,
  createSpatialV3NewGameStarter,
  createSpatialV3TurnOrchestrator
} from '@rus/turn/spatial-v3-orchestration';
import { MODULAR_NEW_GAME_STAGE_PLAN } from '@rus/new-game/orchestrator';
import { SPATIAL_V3_NEW_GAME_STAGE_MAPPING, assertSpatialV3TargetStageMapping } from '@rus/new-game/spatial-v3-stage-mapping';

const sealed = (value) => ({ ...value, canonical_digest: computeSpatialV3CanonicalDigest(value) });
const dependencyPins = (() => { const pins = [{ dependency_role: 'source_authoring', entity_ref: { entity_kind: 'world_revision', entity_id: 'target' }, version_pin: { pin_kind: 'authoring_version', authoring_version: '4.2.0-target.1', state_version: null } }]; return { pins, canonical_digest: computeSpatialV3CanonicalDigest(pins).replace('sha256:', '') }; })();
const command = sealed({ party_id: 'party-1', command_id: 'command-1', command_kind: 'immediate_action', idempotency_key: 'idem-1' });
const snapshot = sealed({ party_id: 'party-1', kind: 'turn_factual_snapshot', state_version: 1, dependency_pins: dependencyPins });
const proposal = sealed({ party_id: 'party-1', kind: 'immediate_action_proposal', command_id: 'command-1', idempotency_key: 'idem-1', dependency_pins: dependencyPins });
const report = sealed({ party_id: 'party-1', kind: 'turn_validation_report', command_id: 'command-1', proposal_digest: proposal.canonical_digest, dependency_pins: dependencyPins });
const plan = sealed({ party_id: 'party-1', kind: 'combined_write_plan', command_id: 'command-1', validation_report_digest: report.canonical_digest, dependency_pins: dependencyPins });
const changeSet = sealed({ party_id: 'party-1', kind: 'committed_change_set', id: 'change-1', write_plan_digest: plan.canonical_digest, dependency_pins: dependencyPins });
const projection = sealed({ party_id: 'party-1', kind: 'visible_projection', change_set_digest: changeSet.canonical_digest, known: [], dependency_pins: dependencyPins });
const narration = sealed({ party_id: 'party-1', kind: 'approved_narration', projection_digest: projection.canonical_digest, text: 'ok', dependency_pins: dependencyPins });

function allHandlers(overrides = {}) {
  return Object.fromEntries(SPATIAL_V3_COMMAND_KINDS.map((kind) => [kind, async () => ({ ok: true, proposal })]).map(([kind, handler]) => [kind, overrides[kind] ?? handler]));
}

test('P21 registry is exhaustive and rejects free-text/unknown commands', async () => {
  assert.throws(() => createSpatialV3CommandRegistry({}), /exactly one handler/);
  const registry = createSpatialV3CommandRegistry(allHandlers());
  assert.equal((await registry.dispatch(command)).ok, true);
  const unknown = await registry.dispatch(sealed({ ...command, command_kind: 'invent_a_route' }));
  assert.equal(unknown.ok, false);
  assert.equal(unknown.error.code, 'route_plan_version_pin_missing');
  const freeText = await registry.dispatch(sealed({ ...command, free_text: 'create a road to Kyiv' }));
  assert.equal(freeText.ok, false);
});

test('P21 turn graph stops before commit when validation fails', async () => {
  const calls = [];
  const orchestrator = createSpatialV3TurnOrchestrator({
    loadSnapshots: async () => ({ ok: true, snapshot }), registry: createSpatialV3CommandRegistry(allHandlers()),
    validateProposal: async () => ({ ok: false }), buildWritePlan: async () => { calls.push('write'); return { ok: true, plan }; },
    commit: async () => { calls.push('commit'); return { ok: true, change_set: changeSet }; },
    projectVisible: async () => ({ ok: true, projection }), narrate: async () => ({ ok: true, result: narration })
  });
  const result = await orchestrator.run({ party_id: 'party-1', request_id: 'request-1', command });
  assert.equal(result.ok, false); assert.deepEqual(calls, []);
});

test('P21 turn graph invokes ports in one gate-ordered path and has no v2 fallback', async () => {
  const calls = [];
  const orchestrator = createSpatialV3TurnOrchestrator({
    loadSnapshots: async () => { calls.push('load'); return { ok: true, snapshot }; }, registry: createSpatialV3CommandRegistry(allHandlers({ immediate_action: async () => { calls.push('resolve'); return { ok: true, proposal }; } })),
    validateProposal: async () => { calls.push('validate'); return { ok: true, report }; }, buildWritePlan: async () => { calls.push('plan'); return { ok: true, plan }; },
    commit: async () => { calls.push('commit'); return { ok: true, change_set: changeSet }; }, projectVisible: async () => { calls.push('project'); return { ok: true, projection }; }, narrate: async () => { calls.push('narrate'); return { ok: true, result: narration }; }
  });
  const result = await orchestrator.run({ party_id: 'party-1', request_id: 'request-1', command });
  assert.equal(result.ok, true); assert.deepEqual(calls, ['load', 'resolve', 'validate', 'plan', 'commit', 'project', 'narrate']);
});

test('P21 new game requires prepared v3 G6/position and handoff requires an exact endpoint', async () => {
  const g5 = sealed({ kind: 'canonical_party_g5_projection', party_id: 'party-1' }); const baseline = sealed({ kind: 'scene_baseline', party_id: 'party-1' }); const binding = sealed({ kind: 'start_position_binding', party_id: 'party-1' });
  const startSnapshot = sealed({ party_id: 'party-1', kind: 'canonical_party_g5_start_snapshot', dependency_pins: dependencyPins, canonical_party_g5_projection: g5, start_scene_baseline: baseline, start_position_binding: binding });
  const preparation = sealed({ party_id: 'party-1', kind: 'prepared_start', dependency_pins: dependencyPins, canonical_party_g5_projection: g5, start_scene_baseline: baseline, start_position_binding: binding, start_position: { g6_id: 'g6-1', position_id: 'position-1' } });
  const startPlan = sealed({ party_id: 'party-1', kind: 'party_runtime_v3_start_write_plan', dependency_pins: dependencyPins, start_snapshot_digest: startSnapshot.canonical_digest, preparation_digest: preparation.canonical_digest });
  const startChange = sealed({ party_id: 'party-1', kind: 'committed_change_set', dependency_pins: dependencyPins, write_plan_digest: startPlan.canonical_digest });
  const starter = createSpatialV3NewGameStarter({ loadStartSnapshot: async () => ({ ok: true, start_snapshot: startSnapshot }), prepareStart: async () => ({ ok: true, preparation }), persistStart: async () => ({ ok: true, schema_version: 3, write_plan: startPlan, change_set: startChange }) });
  const started = await starter.start(sealed({ party_id: 'party-1', request_id: 'new-game-1' }));
  assert.equal(started.ok, true); assert.equal(started.schema_version, 3);
  const handoff = sealed({ endpoint_ref: { endpoint_kind: 'scene_position', endpoint_id: 'position-1' }, dependency_pins: [] });
  const nextOwner = { entity_kind: 'carrier', entity_id: 'carrier-1' };
  const expectedState = sealed({ next_owner_ref: nextOwner, handoff_endpoint_snapshot: handoff, carrier_attachment: 'attached', location: 'position-1', mode: 'root_authoritative' });
  const artifact = sealed({ contract_kind: 'p19_mode_transition_result', capability: 'trusted_p19_transition', execution_id: 'execution-1' });
  const transition = sealed({ kind: 'mode_transition', transition_kind: 'board_carrier', from_mode: 'attached', to_mode: 'root_authoritative', final_step: true, next_owner_ref: nextOwner, post_transition_state_binding: expectedState, p19_artifact_digest: artifact.canonical_digest });
  const verifier = async () => ({ ok: true, artifact });
  const coordinator = createSpatialV3ModeHandoffOrchestrator({ endPlan: async () => ({ ok: true, execution_status: 'superseded', handoff_endpoint_snapshot: handoff, persisted_state: expectedState }), createSuccessorPlan: async ({ predecessor_execution_id, source_endpoint_snapshot }) => ({ ok: true, plan: sealed({ predecessor_execution_id, source_endpoint_snapshot, journey_owner_ref: nextOwner }) }), verifyTransitionArtifact: verifier });
  assert.equal((await coordinator.handoff({ party_id: 'party-1', execution_id: 'execution-1', next_owner_ref: nextOwner, mode_transition: transition, trusted_transition_artifact: artifact, handoff_endpoint_snapshot: handoff, expected_persisted_state: expectedState })).ok, true);
  const forged = createSpatialV3ModeHandoffOrchestrator({ endPlan: async () => ({ ok: true, execution_status: 'superseded', handoff_endpoint_snapshot: handoff, persisted_state: sealed({ ...expectedState, carrier_attachment: 'detached' }) }), createSuccessorPlan: async () => { throw new Error('must not create successor'); }, verifyTransitionArtifact: verifier });
  assert.equal((await forged.handoff({ party_id: 'party-1', execution_id: 'execution-1', next_owner_ref: nextOwner, mode_transition: transition, trusted_transition_artifact: artifact, handoff_endpoint_snapshot: handoff, expected_persisted_state: expectedState })).ok, false);
  const forgedState = sealed({ ...expectedState, carrier_attachment: 'detached' });
  const forgedBoth = createSpatialV3ModeHandoffOrchestrator({ endPlan: async () => ({ ok: true, execution_status: 'superseded', handoff_endpoint_snapshot: handoff, persisted_state: forgedState }), createSuccessorPlan: async () => ({ ok: true, plan: {} }), verifyTransitionArtifact: async () => ({ ok: false }) });
  const forgedTransition = sealed({ ...transition, post_transition_state_binding: forgedState });
  assert.equal((await forgedBoth.handoff({ party_id: 'party-1', execution_id: 'execution-1', next_owner_ref: nextOwner, mode_transition: forgedTransition, trusted_transition_artifact: artifact, handoff_endpoint_snapshot: handoff, expected_persisted_state: forgedState })).ok, false);
});

test('P21 rejects forged stage envelopes and arbitrary prepared starts before persistence', async () => {
  let persisted = false;
  const forged = createSpatialV3TurnOrchestrator({
    loadSnapshots: async () => ({ ok: true, snapshot }), registry: createSpatialV3CommandRegistry(allHandlers()),
    validateProposal: async () => ({ ok: true, report: sealed({ party_id: 'party-1', kind: 'generic_report', dependency_pins: dependencyPins }) }),
    buildWritePlan: async () => { throw new Error('must not build'); }, commit: async () => { throw new Error('must not commit'); },
    projectVisible: async () => ({ ok: true, projection }), narrate: async () => ({ ok: true, result: narration })
  });
  assert.equal((await forged.run({ party_id: 'party-1', request_id: 'request-1', command })).ok, false);
  const g5 = sealed({ kind: 'canonical_party_g5_projection', party_id: 'party-1' }); const baseline = sealed({ kind: 'scene_baseline', party_id: 'party-1' }); const binding = sealed({ kind: 'start_position_binding', party_id: 'party-1' });
  const startSnapshot = sealed({ party_id: 'party-1', kind: 'canonical_party_g5_start_snapshot', dependency_pins: dependencyPins, canonical_party_g5_projection: g5, start_scene_baseline: baseline, start_position_binding: binding });
  const starter = createSpatialV3NewGameStarter({ loadStartSnapshot: async () => ({ ok: true, start_snapshot: startSnapshot }), prepareStart: async () => ({ ok: true, preparation: sealed({ party_id: 'party-1', kind: 'prepared_start', dependency_pins: dependencyPins, canonical_party_g5_projection: sealed({ kind: 'forged_g5', party_id: 'party-1' }), start_scene_baseline: baseline, start_position_binding: binding, start_position: { g6_id: 'g6-1', position_id: 'position-1' } }) }), persistStart: async () => { persisted = true; return {}; } });
  assert.equal((await starter.start(sealed({ party_id: 'party-1', request_id: 'new-game-2' }))).ok, false);
  assert.equal(persisted, false);
});

test('P21 maps Stage 13 only in target/shadow and explicitly retires v2 Stage 24/25 from that flow', () => {
  assert.equal(SPATIAL_V3_NEW_GAME_STAGE_MAPPING.status, 'target_shadow_only');
  assert.equal(SPATIAL_V3_NEW_GAME_STAGE_MAPPING.replaces.active_stage_id, 13);
  assert.deepEqual(SPATIAL_V3_NEW_GAME_STAGE_MAPPING.retained_boundaries.map(({ active_stage_id }) => active_stage_id), [24, 25]);
  assert.equal(assertSpatialV3TargetStageMapping(MODULAR_NEW_GAME_STAGE_PLAN).replaces.persistence_schema_version, 3);
  assert.throws(() => assertSpatialV3TargetStageMapping([]), /does not permit altering/);
});
