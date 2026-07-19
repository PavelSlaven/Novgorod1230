import { computeSpatialV3CanonicalDigest, createSpatialV3TypedError } from '@rus/contracts/spatial-v3/registry';

export const SPATIAL_V3_COMMAND_KINDS = Object.freeze([
  'path_query', 'prepare_target', 'resolve_frontier', 'activate_plan',
  'immediate_action', 'timed_activity', 'timed_traversal',
  'resume_plan', 'replan', 'recover_journey',
  'board_carrier', 'disembark_carrier', 'load_carrier', 'change_cohort'
]);

const COMMANDS = new Set(SPATIAL_V3_COMMAND_KINDS);
const clone = (value) => structuredClone(value);
const text = (value) => typeof value === 'string' ? value.trim() : '';
const record = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const freeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const digest = (value) => computeSpatialV3CanonicalDigest(value);
const sealed = (value) => {
  if (!record(value) || !text(value.canonical_digest)) return false;
  const payload = { ...value }; delete payload.canonical_digest;
  return value.canonical_digest === digest(payload);
};
const same = (left, right) => digest(left) === digest(right);
const pins = (value) => record(value) && Array.isArray(value.pins) && value.pins.length > 0 && text(value.canonical_digest) && value.canonical_digest === digest(value.pins).replace('sha256:', '');
const exact = (value, kind, partyId, dependencyPins) => sealed(value) && value.kind === kind && value.party_id === partyId && (!dependencyPins || (pins(value.dependency_pins) && same(value.dependency_pins, dependencyPins)));

function fail(code, partyId = 'unknown', diagnostics = {}) {
  const pins = [{ dependency_role: 'source_authoring', entity_ref: { entity_kind: 'world_revision', entity_id: 'target' }, version_pin: { pin_kind: 'authoring_version', authoring_version: '4.2.0-target.1', state_version: null } }];
  return freeze({ ok: false, error: createSpatialV3TypedError(code, {
    subject_ref: { entity_kind: 'party_route_plan_execution', entity_id: partyId || 'unknown' },
    dependency_pins: { pins, canonical_digest: digest(pins).replace('sha256:', '') }, diagnostics
  }) });
}

function requirePort(value, name) {
  if (typeof value !== 'function') throw new TypeError(`P21 ${name} port is required.`);
}

/**
 * An explicit command registry.  It accepts neither free text nor a default
 * handler, making a newly added command an intentional composition change.
 */
export function createSpatialV3CommandRegistry(handlers = {}) {
  if (!record(handlers) || Object.keys(handlers).some((key) => !COMMANDS.has(key)) ||
    SPATIAL_V3_COMMAND_KINDS.some((kind) => typeof handlers[kind] !== 'function')) {
    throw new TypeError('P21 registry requires exactly one handler for every known v3 command kind.');
  }
  return freeze({
    command_kinds: [...SPATIAL_V3_COMMAND_KINDS],
    async dispatch(command) {
      const allowed = new Set(['party_id', 'command_id', 'command_kind', 'idempotency_key', 'command_payload', 'canonical_digest']);
      if (!record(command) || Object.keys(command).some((key) => !allowed.has(key)) || !text(command.party_id) || !text(command.command_id) || !text(command.idempotency_key) || !COMMANDS.has(command.command_kind) || !sealed(command) ||
        (command.command_payload != null && !sealed(command.command_payload))) {
        return fail('route_plan_version_pin_missing', command?.party_id, { stage: 'command_registry' });
      }
      const result = await handlers[command.command_kind](freeze(clone(command)));
      if (!record(result) || typeof result.ok !== 'boolean') return fail('generated_schema_mismatch', command.party_id, { stage: 'command_registry', command_kind: command.command_kind });
      return freeze(clone(result));
    }
  });
}

/** P21-S02 target/shadow turn graph. All effects remain behind injected ports. */
export function createSpatialV3TurnOrchestrator({ loadSnapshots, registry, validateProposal, buildWritePlan, commit, projectVisible, narrate } = {}) {
  [loadSnapshots, validateProposal, buildWritePlan, commit, projectVisible, narrate].forEach((port, index) => requirePort(port, ['loadSnapshots', 'validateProposal', 'buildWritePlan', 'commit', 'projectVisible', 'narrate'][index]));
  if (!registry || typeof registry.dispatch !== 'function') throw new TypeError('P21 registry.dispatch is required.');
  return freeze({
    async run(input = {}) {
      if (!record(input) || !text(input.party_id) || !text(input.request_id) || !sealed(input.command)) return fail('route_plan_version_pin_missing', input?.party_id, { stage: 'turn_input' });
      if (input.command.party_id !== input.party_id) return fail('route_plan_snapshot_missing', input.party_id, { stage: 'turn_input', reason: 'command party mismatch' });
      const snapshots = await loadSnapshots(freeze({ party_id: input.party_id, request_id: input.request_id, command: clone(input.command) }));
      if (!snapshots?.ok || !exact(snapshots.snapshot, 'turn_factual_snapshot', input.party_id) || !pins(snapshots.snapshot.dependency_pins)) return fail('route_plan_snapshot_missing', input.party_id, { stage: 'load_snapshots' });
      const resolved = await registry.dispatch(freeze(clone(input.command)));
      if (!resolved.ok) return resolved;
      if (!exact(resolved.proposal, `${input.command.command_kind}_proposal`, input.party_id, snapshots.snapshot.dependency_pins) || resolved.proposal.command_id !== input.command.command_id) return fail('generated_schema_mismatch', input.party_id, { stage: 'resolve', reason: 'handler proposal must bind exact command, party and pins' });
      const validation = await validateProposal(freeze({ party_id: input.party_id, command: clone(input.command), snapshot: clone(snapshots.snapshot), proposal: clone(resolved.proposal) }));
      if (!validation?.ok || !exact(validation.report, 'turn_validation_report', input.party_id, snapshots.snapshot.dependency_pins) || validation.report.command_id !== input.command.command_id || validation.report.proposal_digest !== resolved.proposal.canonical_digest) return fail('generated_schema_mismatch', input.party_id, { stage: 'validate' });
      const built = await buildWritePlan(freeze({ party_id: input.party_id, command: clone(input.command), snapshot: clone(snapshots.snapshot), proposal: clone(resolved.proposal), validation_report: clone(validation.report) }));
      if (!built?.ok || !exact(built.plan, 'combined_write_plan', input.party_id, snapshots.snapshot.dependency_pins) || built.plan.command_id !== input.command.command_id || built.plan.validation_report_digest !== validation.report.canonical_digest) return fail('generated_schema_mismatch', input.party_id, { stage: 'write_plan' });
      const committed = await commit(freeze({ party_id: input.party_id, plan: clone(built.plan) }));
      if (!committed?.ok || !exact(committed.change_set, 'committed_change_set', input.party_id, snapshots.snapshot.dependency_pins) || committed.change_set.write_plan_digest !== built.plan.canonical_digest) return fail('generated_schema_mismatch', input.party_id, { stage: 'commit' });
      const visible = await projectVisible(freeze({ party_id: input.party_id, change_set: clone(committed.change_set) }));
      if (!visible?.ok || !exact(visible.projection, 'visible_projection', input.party_id, snapshots.snapshot.dependency_pins) || visible.projection.change_set_digest !== committed.change_set.canonical_digest) return fail('generated_schema_mismatch', input.party_id, { stage: 'project_visible' });
      const narration = await narrate(freeze({ party_id: input.party_id, projection: clone(visible.projection) }));
      if (!narration?.ok || !exact(narration.result, 'approved_narration', input.party_id, snapshots.snapshot.dependency_pins) || narration.result.projection_digest !== visible.projection.canonical_digest) return fail('generated_schema_mismatch', input.party_id, { stage: 'narrate' });
      return freeze({ ok: true, command: clone(input.command), snapshot: clone(snapshots.snapshot), proposal: clone(resolved.proposal), validation_report: clone(validation.report), write_plan: clone(built.plan), change_set: clone(committed.change_set), projection: clone(visible.projection), narration: clone(narration.result) });
    }
  });
}

/** P21-S03 start adapter: it only persists an already selected/prepared v3 start. */
export function createSpatialV3NewGameStarter({ loadStartSnapshot, prepareStart, persistStart } = {}) {
  [loadStartSnapshot, prepareStart, persistStart].forEach((port, index) => requirePort(port, ['loadStartSnapshot', 'prepareStart', 'persistStart'][index]));
  return freeze({
    async start(input = {}) {
      if (!record(input) || !text(input.party_id) || !text(input.request_id) || !sealed(input)) return fail('generated_schema_mismatch', input?.party_id, { stage: 'new_game_input' });
      const snapshot = await loadStartSnapshot(freeze(clone(input)));
      if (!snapshot?.ok || !exact(snapshot.start_snapshot, 'canonical_party_g5_start_snapshot', input.party_id) || !pins(snapshot.start_snapshot.dependency_pins) || !sealed(snapshot.start_snapshot.canonical_party_g5_projection) || !sealed(snapshot.start_snapshot.start_scene_baseline) || !sealed(snapshot.start_snapshot.start_position_binding)) return fail('route_plan_snapshot_missing', input.party_id, { stage: 'new_game_load' });
      const prepared = await prepareStart(freeze({ party_id: input.party_id, request_id: input.request_id, start_snapshot: clone(snapshot.start_snapshot) }));
      if (!prepared?.ok || !exact(prepared.preparation, 'prepared_start', input.party_id, snapshot.start_snapshot.dependency_pins) || !same(prepared.preparation.canonical_party_g5_projection, snapshot.start_snapshot.canonical_party_g5_projection) || !same(prepared.preparation.start_scene_baseline, snapshot.start_snapshot.start_scene_baseline) || !same(prepared.preparation.start_position_binding, snapshot.start_snapshot.start_position_binding) || !record(prepared.preparation.start_position) || !text(prepared.preparation.start_position.g6_id) || !text(prepared.preparation.start_position.position_id)) return fail('target_preparation_failed', input.party_id, { stage: 'new_game_prepare' });
      const persisted = await persistStart(freeze({ party_id: input.party_id, schema_version: 3, start_snapshot: clone(snapshot.start_snapshot), preparation: clone(prepared.preparation) }));
      if (!persisted?.ok || persisted.schema_version !== 3 || !exact(persisted.write_plan, 'party_runtime_v3_start_write_plan', input.party_id, snapshot.start_snapshot.dependency_pins) || persisted.write_plan.start_snapshot_digest !== snapshot.start_snapshot.canonical_digest || persisted.write_plan.preparation_digest !== prepared.preparation.canonical_digest || !exact(persisted.change_set, 'committed_change_set', input.party_id, snapshot.start_snapshot.dependency_pins) || persisted.change_set.write_plan_digest !== persisted.write_plan.canonical_digest) return fail('generated_schema_mismatch', input.party_id, { stage: 'new_game_persist' });
      return freeze({ ok: true, party_id: input.party_id, schema_version: 3, start_snapshot: clone(snapshot.start_snapshot), preparation: clone(prepared.preparation), change_set: clone(persisted.change_set) });
    }
  });
}

/** P21-S04: ownership changes end a plan; the successor receives only its exact handoff. */
export function createSpatialV3ModeHandoffOrchestrator({ endPlan, createSuccessorPlan, verifyTransitionArtifact } = {}) {
  requirePort(endPlan, 'endPlan'); requirePort(createSuccessorPlan, 'createSuccessorPlan'); requirePort(verifyTransitionArtifact, 'verifyTransitionArtifact');
  return freeze({
    async handoff(input = {}) {
      const transition = input.mode_transition;
      const modes = new Set(['root_authoritative', 'attached']); const kinds = new Set(['board_carrier', 'disembark_carrier', 'load_carrier', 'change_cohort']);
      if (!record(input) || !text(input.party_id) || !text(input.execution_id) || !text(input.next_owner_ref?.entity_kind) || !text(input.next_owner_ref?.entity_id) || !sealed(input.handoff_endpoint_snapshot) || !sealed(input.expected_persisted_state) || !sealed(transition) || transition.kind !== 'mode_transition' || !kinds.has(transition.transition_kind) || !modes.has(transition.from_mode) || !modes.has(transition.to_mode) || transition.from_mode === transition.to_mode || transition.final_step !== true || !sealed(transition.post_transition_state_binding) || !sealed(input.trusted_transition_artifact) || transition.p19_artifact_digest !== input.trusted_transition_artifact.canonical_digest || !same(transition.next_owner_ref, input.next_owner_ref) || !same(input.expected_persisted_state, transition.post_transition_state_binding) || input.expected_persisted_state.mode !== transition.to_mode || !same(input.expected_persisted_state.next_owner_ref, input.next_owner_ref) || !same(input.expected_persisted_state.handoff_endpoint_snapshot, input.handoff_endpoint_snapshot) || input.expected_persisted_state.location !== input.handoff_endpoint_snapshot.endpoint_ref?.endpoint_id || (transition.to_mode === 'root_authoritative' && (input.next_owner_ref.entity_kind !== 'carrier' || input.expected_persisted_state.carrier_attachment !== 'attached')) || (transition.to_mode === 'attached' && input.next_owner_ref.entity_kind !== 'actor')) return fail('journey_handoff_snapshot_invalid', input?.party_id, { stage: 'handoff_input' });
      const trusted = await verifyTransitionArtifact(freeze({ party_id: input.party_id, execution_id: input.execution_id, mode_transition: clone(transition), artifact: clone(input.trusted_transition_artifact) }));
      if (!trusted?.ok || !sealed(trusted.artifact) || !same(trusted.artifact, input.trusted_transition_artifact) || trusted.artifact.contract_kind !== 'p19_mode_transition_result' || trusted.artifact.capability !== 'trusted_p19_transition') return fail('mode_transition_contract_missing', input.party_id, { stage: 'verify_transition_artifact' });
      const ended = await endPlan(freeze(clone(input)));
      if (!ended?.ok || !sealed(ended.handoff_endpoint_snapshot) || ended.handoff_endpoint_snapshot.canonical_digest !== input.handoff_endpoint_snapshot.canonical_digest || ended.execution_status !== 'superseded' || !sealed(ended.persisted_state) || !same(ended.persisted_state, input.expected_persisted_state)) return fail('journey_handoff_snapshot_invalid', input.party_id, { stage: 'end_plan' });
      const successor = await createSuccessorPlan(freeze({ party_id: input.party_id, predecessor_execution_id: input.execution_id, source_endpoint_snapshot: clone(ended.handoff_endpoint_snapshot), next_owner_ref: clone(input.next_owner_ref) }));
      if (!successor?.ok || !sealed(successor.plan) || successor.plan.predecessor_execution_id !== input.execution_id || successor.plan.source_endpoint_snapshot?.canonical_digest !== ended.handoff_endpoint_snapshot.canonical_digest || !same(successor.plan.journey_owner_ref, input.next_owner_ref)) return fail('journey_handoff_snapshot_invalid', input.party_id, { stage: 'create_successor' });
      return freeze({ ok: true, ended_execution_id: input.execution_id, handoff_endpoint_snapshot: clone(ended.handoff_endpoint_snapshot), successor_plan: clone(successor.plan) });
    }
  });
}
