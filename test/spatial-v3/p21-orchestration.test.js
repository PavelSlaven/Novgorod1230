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
import { createSpatialV3TargetShadowComposition } from '@rus/turn/spatial-v3-target-composition';
import { createSpatialV3ExecutionEngine } from '@rus/turn/spatial-v3-execution';
import { createMovementPlanner } from '@rus/movement-routes/spatial-v3-planner';
import { createFrontierTopologyResolver, createSceneMaterializer, createTargetPreparationService } from '@rus/materialization/spatial-v3-materialization';
import { createSpatialV3CombinedAtomicCommitter } from '../../apps/game-server/src/infrastructure/postgres/spatial-v3-combined-atomic-committer.js';
import { createSpatialV3TargetShadowCompositionRoot } from '../../apps/game-server/src/composition/spatial-v3-target-shadow.js';
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
  const coordinator = createSpatialV3ModeHandoffOrchestrator({ endPlan: async () => ({ ok: true, execution_status: 'superseded', handoff_endpoint_snapshot: handoff, persisted_state: expectedState }), createSuccessorPlan: async ({ predecessor_execution_id, source_endpoint_snapshot }) => ({ ok: true, plan: sealed({ predecessor_execution_id, source_endpoint_snapshot, journey_owner_ref: nextOwner }) }), rollbackEndedPlan: async () => ({ ok: true, execution_status: 'active' }), verifyTransitionArtifact: verifier });
  assert.equal((await coordinator.handoff({ party_id: 'party-1', execution_id: 'execution-1', next_owner_ref: nextOwner, mode_transition: transition, trusted_transition_artifact: artifact, handoff_endpoint_snapshot: handoff, expected_persisted_state: expectedState })).ok, true);
  const forged = createSpatialV3ModeHandoffOrchestrator({ endPlan: async () => ({ ok: true, execution_status: 'superseded', handoff_endpoint_snapshot: handoff, persisted_state: sealed({ ...expectedState, carrier_attachment: 'detached' }) }), createSuccessorPlan: async () => { throw new Error('must not create successor'); }, rollbackEndedPlan: async () => ({ ok: true, execution_status: 'active' }), verifyTransitionArtifact: verifier });
  assert.equal((await forged.handoff({ party_id: 'party-1', execution_id: 'execution-1', next_owner_ref: nextOwner, mode_transition: transition, trusted_transition_artifact: artifact, handoff_endpoint_snapshot: handoff, expected_persisted_state: expectedState })).ok, false);
  const forgedState = sealed({ ...expectedState, carrier_attachment: 'detached' });
  const forgedBoth = createSpatialV3ModeHandoffOrchestrator({ endPlan: async () => ({ ok: true, execution_status: 'superseded', handoff_endpoint_snapshot: handoff, persisted_state: forgedState }), createSuccessorPlan: async () => ({ ok: true, plan: {} }), rollbackEndedPlan: async () => ({ ok: true, execution_status: 'active' }), verifyTransitionArtifact: async () => ({ ok: false }) });
  const forgedTransition = sealed({ ...transition, post_transition_state_binding: forgedState });
  assert.equal((await forgedBoth.handoff({ party_id: 'party-1', execution_id: 'execution-1', next_owner_ref: nextOwner, mode_transition: forgedTransition, trusted_transition_artifact: artifact, handoff_endpoint_snapshot: handoff, expected_persisted_state: forgedState })).ok, false);
});

test('P21 handoff compensates a failed successor and target composition stays shadow-only', async () => {
  const handoff = sealed({ endpoint_ref: { endpoint_kind: 'scene_position', endpoint_id: 'position-1' }, dependency_pins: [] });
  const nextOwner = { entity_kind: 'carrier', entity_id: 'carrier-1' };
  const expectedState = sealed({ next_owner_ref: nextOwner, handoff_endpoint_snapshot: handoff, carrier_attachment: 'attached', location: 'position-1', mode: 'root_authoritative' });
  const artifact = sealed({ contract_kind: 'p19_mode_transition_result', capability: 'trusted_p19_transition' });
  const transition = sealed({ kind: 'mode_transition', transition_kind: 'board_carrier', from_mode: 'attached', to_mode: 'root_authoritative', final_step: true, next_owner_ref: nextOwner, post_transition_state_binding: expectedState, p19_artifact_digest: artifact.canonical_digest });
  const calls = [];
  const saga = createSpatialV3ModeHandoffOrchestrator({
    verifyTransitionArtifact: async () => ({ ok: true, artifact }),
    endPlan: async () => ({ ok: true, execution_status: 'superseded', handoff_endpoint_snapshot: handoff, persisted_state: expectedState }),
    createSuccessorPlan: async () => ({ ok: false }),
    rollbackEndedPlan: async () => { calls.push('rollback'); return { ok: true, execution_status: 'active' }; }
  });
  assert.equal((await saga.handoff({ party_id: 'party-1', execution_id: 'execution-1', next_owner_ref: nextOwner, mode_transition: transition, trusted_transition_artifact: artifact, handoff_endpoint_snapshot: handoff, expected_persisted_state: expectedState })).ok, false);
  assert.deepEqual(calls, ['rollback']);
  assert.throws(() => createSpatialV3TargetShadowComposition({}), /P18 planner/);
});

test('P21 target root binds a P19 ownership transition and v3 new-game through the P16 transaction boundary', async () => {
  const commandId = 'board-1';
  const handoffEndpoint = sealed({ endpoint_ref: { endpoint_kind: 'scene_position', endpoint_id: 'position-1' }, dependency_pins: [] });
  const nextOwner = { entity_kind: 'carrier', entity_id: 'carrier-1' };
  const expectedState = sealed({ next_owner_ref: nextOwner, handoff_endpoint_snapshot: handoffEndpoint, carrier_attachment: 'attached', location: 'position-1', mode: 'root_authoritative' });
  const artifact = sealed({ contract_kind: 'p19_mode_transition_result', capability: 'trusted_p19_transition', execution_id: 'execution-1' });
  const transition = sealed({ kind: 'mode_transition', transition_kind: 'board_carrier', from_mode: 'attached', to_mode: 'root_authoritative', final_step: true, next_owner_ref: nextOwner, post_transition_state_binding: expectedState, p19_artifact_digest: artifact.canonical_digest });
  const handoffInput = { party_id: 'party-1', execution_id: 'execution-1', next_owner_ref: nextOwner, mode_transition: transition, trusted_transition_artifact: artifact, handoff_endpoint_snapshot: handoffEndpoint, expected_persisted_state: expectedState };
  const p16Input = ({ operation_kind, idempotency_key, command_id }) => ({
    plan_id: `plan-${command_id}`, party_id: 'party-1', write_plan_kind: 'semantic_commit', operation_kind,
    canonical_input_digest: computeSpatialV3CanonicalDigest({ command_id }), expected_state_versions: [],
    validation_report: { status: 'pass', digest: computeSpatialV3CanonicalDigest({ command_id, report: true }) },
    idempotency: { id: `idem-${command_id}`, key: idempotency_key }, change_set: { id: `change-${command_id}` },
    lock_context: { owner_keys: [], execution_keys: [], g4_keys: [], physical_keys: [`party_runtime.party_v3_change_sets:change-${command_id}`] },
    commit_rechecks: ['physical', 'state', 'pin', 'endpoint', 'route', 'capacity', 'time', 'change_set'].map((kind) => ({ kind, digest: computeSpatialV3CanonicalDigest({ kind, command_id }) })),
    approved_write_sets: [{ inserts: [], updates: [], appends: [{ target_table: 'party_v3_change_sets', id: `change-${command_id}`, record: { id: `change-${command_id}`, party_id: 'party-1', operation_kind, idempotency_record_id: `idem-${command_id}` } }] }]
  });
  const basePorts = {
    planner: { resolve: async () => ({ ok: true, proposal }) }, activationValidator: { validate: async () => ({ ok: true, proposal }) },
    targetPreparation: { prepare: async () => ({ ok: true, proposal }) }, frontierResolver: { resolve: async () => ({ ok: true, proposal }) },
    loadSnapshots: async () => ({ ok: true, snapshot }), validateProposal: async ({ command: input, proposal: resolved }) => ({ ok: true, report: sealed({ party_id: 'party-1', kind: 'turn_validation_report', command_id: input.command_id, proposal_digest: resolved.canonical_digest, dependency_pins: dependencyPins }) }),
    projectVisible: async ({ change_set }) => ({ ok: true, projection: sealed({ party_id: 'party-1', kind: 'visible_projection', change_set_digest: change_set.canonical_digest, known: [], dependency_pins: dependencyPins }) }),
    narrate: async ({ projection: visible }) => ({ ok: true, result: sealed({ party_id: 'party-1', kind: 'approved_narration', projection_digest: visible.canonical_digest, text: 'ok', dependency_pins: dependencyPins }) }),
    verifyApproval: async () => ({ ok: true }), loadStartSnapshot: async () => ({ ok: false }), prepareStart: async () => ({ ok: false }), buildStartWritePlanInput: async () => ({ ok: false }),
    modeHandoff: createSpatialV3ModeHandoffOrchestrator({ handoffAtomically: async () => ({ ok: true, execution_status: 'superseded', handoff_endpoint_snapshot: handoffEndpoint, persisted_state: expectedState, successor_plan: sealed({ predecessor_execution_id: 'execution-1', source_endpoint_snapshot: handoffEndpoint, journey_owner_ref: nextOwner }) }), verifyTransitionArtifact: async () => ({ ok: true, artifact }) }),
    buildModeHandoffProposal: async ({ command: input }) => ({ ok: true, proposal: sealed({ party_id: 'party-1', kind: `${input.command_kind}_proposal`, command_id: input.command_id, idempotency_key: input.idempotency_key, dependency_pins: dependencyPins, combined_write_plan_input: p16Input({ operation_kind: input.command_kind, idempotency_key: input.idempotency_key, command_id: input.command_id }) }) })
  };
  const commits = [];
  const transactionQueries = [];
  const committer = createSpatialV3CombinedAtomicCommitter({
    withTransaction: async (work) => work({ query: async (sql) => {
      transactionQueries.push(sql);
      if (sql.includes('FROM party_runtime.party_v3_change_sets')) return { rows: [], rowCount: 0 };
      if (sql.includes('FROM party_runtime.party_command_idempotency')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    } }),
    recheck: async () => ({ ok: true })
  });
  const composition = createSpatialV3TargetShadowCompositionRoot({ ...basePorts, executionEngine: {
    executeImmediateAction: async () => ({ ok: true, proposal }), resolveTimedActivity: async () => ({ ok: true, proposal }), resolveTraversalInterval: async () => ({ ok: true, proposal }), startTraversal: async () => ({ ok: true, proposal }), resolveSynchronizedSlice: async () => ({ ok: true, proposal }),
    resolveModeTransition: async () => ({ ok: true, handoff_input: handoffInput })
  }, committer: { commit: async ({ plan: committed }) => { commits.push(committed); return committer.commit({ plan: committed }); } } });
  assert.equal(composition.status, 'target_shadow_only');
  assert.equal(composition.handoff, basePorts.modeHandoff);
  assert.equal(composition.health().activation, 'not_authorized');
  const carrierCommand = sealed({ party_id: 'party-1', command_id: commandId, command_kind: 'board_carrier', idempotency_key: 'idem-board', command_payload: sealed({}) });
  const result = await composition.submitTurn({ party_id: 'party-1', request_id: 'request-board', command: carrierCommand });
  assert.equal(result.ok, true); assert.equal(commits.length, 1); assert.equal(commits[0].schema, 'spatial_v3.combined_write_plan.v2');
  const g5 = sealed({ kind: 'canonical_party_g5_projection', party_id: 'party-1' }); const baseline = sealed({ kind: 'scene_baseline', party_id: 'party-1' }); const binding = sealed({ kind: 'start_position_binding', party_id: 'party-1' });
  const startSnapshot = sealed({ party_id: 'party-1', kind: 'canonical_party_g5_start_snapshot', dependency_pins: dependencyPins, canonical_party_g5_projection: g5, start_scene_baseline: baseline, start_position_binding: binding });
  const preparation = sealed({ party_id: 'party-1', kind: 'prepared_start', dependency_pins: dependencyPins, canonical_party_g5_projection: g5, start_scene_baseline: baseline, start_position_binding: binding, start_position: { g6_id: 'g6-1', position_id: 'position-1' } });
  const startComposition = createSpatialV3TargetShadowCompositionRoot({ ...basePorts, executionEngine: {
    executeImmediateAction: async () => ({ ok: true, proposal }), resolveTimedActivity: async () => ({ ok: true, proposal }), resolveTraversalInterval: async () => ({ ok: true, proposal }), startTraversal: async () => ({ ok: true, proposal }), resolveSynchronizedSlice: async () => ({ ok: true, proposal }), resolveModeTransition: async () => ({ ok: true, handoff_input: handoffInput })
  }, loadStartSnapshot: async () => ({ ok: true, start_snapshot: startSnapshot }), prepareStart: async () => ({ ok: true, preparation }), buildStartWritePlanInput: async () => ({ ok: true, input: p16Input({ operation_kind: 'new_game_start', idempotency_key: 'idem-start', command_id: 'start-1' }) }), committer: { commit: async ({ plan: committed }) => { commits.push(committed); return committer.commit({ plan: committed }); } } });
  const started = await startComposition.startNewGame(sealed({ party_id: 'party-1', request_id: 'start-1' }));
  assert.equal(started.ok, true, JSON.stringify(started)); assert.equal(started.schema_version, 3); assert.equal(commits.length, 2); assert.equal(commits[1].schema, 'spatial_v3.combined_write_plan.v2');
  assert.ok(transactionQueries.some((sql) => sql.includes('pg_advisory_xact_lock')));
  assert.ok(transactionQueries.some((sql) => sql.includes('party_command_idempotency')));
  const missingP19 = createSpatialV3TargetShadowComposition({ ...basePorts, executionEngine: { executeImmediateAction: async () => ({ ok: true, proposal }), resolveTimedActivity: async () => ({ ok: true, proposal }), resolveTraversalInterval: async () => ({ ok: true, proposal }) }, committer: { commit: async () => ({ ok: true, change_set_id: 'nope' }) } });
  const typedFailure = await missingP19.registry.dispatch(sealed({ party_id: 'party-1', command_id: 'traversal-missing', command_kind: 'timed_traversal', idempotency_key: 'idem-missing', command_payload: sealed({ operation: 'synchronized_slice' }) }));
  assert.equal(typedFailure.ok, false); assert.equal(typedFailure.error.code, 'generated_schema_mismatch');
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

test('P21 root awaits real P19 traversal results before the only approved adapter for every explicit operation', async () => {
  const engine = createSpatialV3ExecutionEngine();
  const seen = [];
  const writes = [];
  const dependency_pins = dependencyPins;
  const p19Pins = sealed({ pins: dependencyPins.pins });
  const endpoint = (id) => sealed({ endpoint_kind: 'world_route_endpoint', endpoint_id: id });
  const context = sealed({ context_id: 'p19-context' });
  const commandProposal = (input) => sealed({ party_id: 'party-1', kind: `${input.command.command_kind}_proposal`, command_id: input.command.command_id, idempotency_key: input.command.idempotency_key, dependency_pins });
  const traversalAdapter = async ({ command: input, result }) => {
    seen.push({ operation: input.command_payload.operation, result });
    assert.equal(result.ok, true);
    assert.equal(Object.isFrozen(result), true);
    return { ok: true, proposal: commandProposal({ command: input }) };
  };
  const scene = createSceneMaterializer();
  const p20 = createTargetPreparationService({
    materializeScene: async (value) => scene.materialize(value), readSnapshot: async () => ({ ok: false, code: 'not_found' }),
    claimPreparation: async () => ({ ok: false }), writeSnapshot: async () => ({ ok: false }), releasePreparation: async () => ({ ok: true })
  });
  const planner = createMovementPlanner({ loadTopology: async () => ({ ok: false }), snapshotEndpoint: async () => null, validateCapability: async () => ({ ok: false }) });
  const frontier = createFrontierTopologyResolver({ selectTemplate: async () => ({ ok: false }), acquireExclusiveReservation: async () => ({ ok: false }) });
  const root = createSpatialV3TargetShadowCompositionRoot({
    planner, activationValidator: { validate: async () => ({ ok: false }) }, targetPreparation: p20, frontierResolver: frontier,
    executionEngine: engine, commandAdapters: { timed_traversal: traversalAdapter },
    loadSnapshots: async () => ({ ok: true, snapshot }), validateProposal: async () => ({ ok: false }),
    projectVisible: async () => ({ ok: false }), narrate: async () => ({ ok: false }), verifyApproval: async () => ({ ok: true }),
    loadStartSnapshot: async () => ({ ok: false }), prepareStart: async () => ({ ok: false }), buildStartWritePlanInput: async () => ({ ok: false }),
    committer: { commit: async (input) => { writes.push(input); return { ok: true, change_set_id: 'unexpected' }; } },
    modeHandoff: { handoff: async () => ({ ok: false }) }, buildModeHandoffProposal: async () => ({ ok: false })
  });
  const startPayload = sealed({ operation: 'start', party_id: 'party-1', departure_valid: true, travel_state_id: 'travel-1', execution_id: 'execution-1', idempotency_key: 'traversal-start', idempotency_record_id: 'idem-record-start', change_set_id: 'change-start', occurred_at_turn: 0, step_ordinal: 0, departure_endpoint: endpoint('from'), arrival_endpoint: endpoint('to'), segment_id: 'segment-1', method_id: 'walk', capacity_units: 1, context_snapshot: context, dependency_pins: p19Pins });
  const dispatch = async (id, payload) => root.registry.dispatch(sealed({ party_id: 'party-1', command_id: id, command_kind: 'timed_traversal', idempotency_key: id, command_payload: payload }));
  const startDispatch = await dispatch('traversal-start', startPayload);
  assert.equal(startDispatch.ok, true, JSON.stringify(startDispatch));
  const start = seen.at(-1).result.travel_state;
  const intervalPayload = sealed({ operation: 'interval', party_id: 'party-1', execution_id: 'execution-1', idempotency_key: 'traversal-interval', idempotency_record_id: 'idem-record-interval', change_set_id: 'change-interval', occurred_at_turn: 0, step_ordinal: 0, interval_ordinal: 0, clock_commit_mode: 'direct_party_clock', world_time_before: { numerator: 0, denominator: 1 }, travel_state: start, execution_context_snapshot: context, dynamic_dependency_pins: p19Pins, dynamic_snapshot: sealed({ snapshot_id: 'p19-dynamic', resolved_factors: [], resolved_delays: [] }), source_signals: sealed({ dependency_pins: p19Pins }), delay_occurrence_history: sealed({ id: 'delay-history', committed_occurrence_keys: [] }), progress_before_ppm: 0, planned_progress_after_ppm: 100, actual_progress_after_ppm: 100, planned_time: { numerator: 1, denominator: 1 }, actual_time: { numerator: 1, denominator: 1 }, cumulative_before: { numerator: 0, denominator: 1 } });
  assert.equal((await dispatch('traversal-interval', intervalPayload)).ok, true);
  const interval = seen.at(-1).result.result;
  const sliceRoot = sealed({ id: 'root-slice-result', party_id: 'party-1', route_plan_execution_id: 'execution-1', actual_time: { numerator: 1, denominator: 1 }, result_kind: 'progressed' });
  const slicePayload = sealed({ operation: 'synchronized_slice', id: 'slice-1', party_id: 'party-1', root_transport_execution_id: 'execution-1', change_set_id: 'change-slice', idempotency_record_id: 'idem-record-slice', dependency_pins: p19Pins, world_time_before: { numerator: 0, denominator: 1 }, root: sliceRoot, locals: [], atomic_trace: sealed({ root_result_id: sliceRoot.id, root_transport_execution_id: 'execution-1', local_result_ids: [], change_set_id: 'change-slice', idempotency_record_id: 'idem-record-slice' }) });
  const sliceDispatch = await dispatch('traversal-slice', slicePayload);
  assert.equal(sliceDispatch.ok, true, JSON.stringify(sliceDispatch));
  assert.deepEqual(seen.map(({ operation }) => operation), ['start', 'interval', 'synchronized_slice']);
  assert.equal(root.health().activation, 'not_authorized');
  assert.equal((await root.registry.dispatch(sealed({ party_id: 'party-1', command_id: 'bad-path', command_kind: 'path_query', idempotency_key: 'bad-path', command_payload: sealed({}) }))).error.code, 'generated_schema_mismatch');
  assert.equal((await root.registry.dispatch(sealed({ party_id: 'party-1', command_id: 'bad-preparation', command_kind: 'prepare_target', idempotency_key: 'bad-preparation', command_payload: sealed({}) }))).error.code, 'generated_schema_mismatch');
  assert.deepEqual(writes, []);
  const missing = createSpatialV3TargetShadowCompositionRoot({
    planner, activationValidator: { validate: async () => ({ ok: false }) }, targetPreparation: p20, frontierResolver: frontier,
    executionEngine: { startTraversal: async () => { throw new Error('P19 rejected start'); } }, commandAdapters: { timed_traversal: traversalAdapter },
    loadSnapshots: async () => ({ ok: true, snapshot }), validateProposal: async () => ({ ok: false }), projectVisible: async () => ({ ok: false }), narrate: async () => ({ ok: false }), verifyApproval: async () => ({ ok: true }), loadStartSnapshot: async () => ({ ok: false }), prepareStart: async () => ({ ok: false }), buildStartWritePlanInput: async () => ({ ok: false }), committer: { commit: async (input) => { writes.push(input); return { ok: true, change_set_id: 'unexpected' }; } }, modeHandoff: { handoff: async () => ({ ok: false }) }, buildModeHandoffProposal: async () => ({ ok: false })
  });
  for (const payload of [startPayload, sealed({ operation: 'interval' }), sealed({ operation: 'synchronized_slice' })]) {
    const result = await missing.registry.dispatch(sealed({ party_id: 'party-1', command_id: `missing-${payload.operation}`, command_kind: 'timed_traversal', idempotency_key: `missing-${payload.operation}`, command_payload: payload }));
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'generated_schema_mismatch');
  }
  assert.deepEqual(writes, []);
});
