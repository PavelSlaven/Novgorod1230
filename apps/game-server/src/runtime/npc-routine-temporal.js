import { npcRoutineActivity, proposeNpcRoutineTransition } from '@rus/npc-runtime';
import { computeSpatialV3CanonicalDigest as digest } from '@rus/contracts/spatial-v3/registry';

const RULE = versioned('action_contract', 'npc-approved-routine-transition');
const POLICY = versioned('condition_set', 'npc-approved-routine');

export function npcRoutineCandidate(row) {
  const runtime = row.causal_state_ref.routine_state;
  if (runtime.status !== 'active') return null;
  const phase = runtime.profile.phases[runtime.phase_index];
  const id = `npc-schedule:${row.npc_id}:${row.state_version}:${phase.state_id}:${runtime.phase_started_at.whole_minutes}`;
  return { boundary_id: id, boundary_kind: 'npc_schedule',
    scheduled_at: structuredClone(runtime.next_transition_at),
    source_ref: { entity_kind: 'npc', entity_id: row.npc_id },
    primary_subject_ref: { entity_kind: 'npc', entity_id: row.npc_id },
    scope_ref: { entity_kind: 'party', entity_id: row.party_id }, rule_ref: RULE,
    policy_ref: POLICY, preconditions_digest: digest(runtime),
    resolution_class: 'npc_schedule', interrupt_effect: 'background',
    visibility_policy_ref: POLICY, idempotency_key: id,
    subject_refs: [{ entity_kind: 'npc', entity_id: row.npc_id }], causal_parent_refs: [] };
}

export function npcRoutineTemporalRegistration() {
  return { rule_ref: RULE, policy_ref: POLICY, resolve(candidate, context) {
    const row = findSchedule(context.projection, candidate.primary_subject_ref.entity_id);
    if (row == null || digest(npcRoutineCandidate(row)) !== digest(candidate)) fail('temporal_candidate_stale');
    const npc = findNpc(context.projection, row.npc_id) ?? row.npc_snapshot;
    if (npc == null) fail('npc_schedule_gap');
    const runtime = row.causal_state_ref.routine_state;
    const machine = npc.machine_state;
    const placement = { entity_kind: 'entity_placement', entity_id: `npc:${row.npc_id}` };
    const expectedActivity = npcRoutineActivity(runtime);
    const interrupted = machine?.current_activity?.can_continue_automatically !== true
      || machine.current_activity.activity_ref !== expectedActivity.activity_ref
      || machine.current_activity.status !== expectedActivity.status
      || row.current_activity_execution_id != null
      || ['dead', 'unconscious', 'incapacitated'].includes(machine?.status)
      || (Number.isFinite(npc.check_body_state?.health) && npc.check_body_state.health <= 0)
      || (machine?.current_activity_ref != null && machine.current_activity_ref
        !== machine.current_activity?.activity_ref);
    let proposed = null;
    if (!interrupted) {
      proposed = proposeNpcRoutineTransition({ runtime, scheduled_at: candidate.scheduled_at,
        npc_state: { npc_ref: candidate.primary_subject_ref, state_version: String(row.state_version),
          current_activity_execution_ref: row.current_activity_execution_id == null ? null : {
            entity_kind: 'party_timed_activity_execution', entity_id: row.current_activity_execution_id },
          placement_ref: placement, attention_state_ref: row.attention_state_ref,
          body_state_ref: row.body_state_ref, knowledge_state_ref: row.knowledge_state_ref,
          relationship_state_ref: row.relationship_state_ref },
        recheck_snapshot: { observed_state_version: String(row.state_version), placement_ref: placement,
          access_ok: true, orders_ok: true, danger_ok: true, body_ok: true, activity_ok: true } });
      if (!proposed.ok) fail(proposed.error.code);
    }
    const runtimeAfter = interrupted ? { ...runtime, status: 'inactive',
      next_transition_at: null, runtime_status: 'unavailable' } : proposed.runtime_after;
    const nextPhase = runtimeAfter.profile.phases[runtimeAfter.phase_index];
    const machineAfter = interrupted ? { ...machine, schedule_state: 'interrupted' } : {
      ...machine, schedule_state: nextPhase.state_id,
      current_activity: proposed.activity_after,
      current_activity_ref: proposed.activity_after.activity_ref,
      runtime_status: runtimeAfter.runtime_status,
      activity_changed_at: candidate.scheduled_at };
    const causal = { ...row.causal_state_ref, routine_state: runtimeAfter };
    delete causal.canonical_digest;
    causal.canonical_digest = digest(causal);
    const after = { ...row, causal_state_ref: causal, status: runtimeAfter.status,
      next_transition_at_whole_minutes: runtimeAfter.next_transition_at?.whole_minutes ?? null,
      next_transition_at_subminute_numerator: runtimeAfter.next_transition_at?.subminute_numerator ?? null,
      next_transition_at_subminute_denominator: runtimeAfter.next_transition_at?.subminute_denominator ?? null,
      npc_snapshot: { ...npc, machine_state: machineAfter } };
    const transition = { boundary_id: candidate.boundary_id, schedule_id: row.id, npc_id: row.npc_id,
      before: structuredClone(row), after, occurred_at: candidate.scheduled_at,
      proposal: proposed, interrupted };
    const projection = applyNpcRoutineProjection(context.projection, transition);
    const replacement = npcRoutineCandidate(after);
    const changeSetId = context.request.idempotency_context.change_set_id;
    const exact = candidate.scheduled_at;
    const record = { id: row.id, party_id: row.party_id, npc_id: row.npc_id,
      causal_state_ref: causal, status: runtimeAfter.status,
      next_transition_at_whole_minutes: after.next_transition_at_whole_minutes,
      next_transition_at_subminute_numerator: after.next_transition_at_subminute_numerator,
      next_transition_at_subminute_denominator: after.next_transition_at_subminute_denominator,
      state_version: Number(row.state_version) + 1, updated_change_set_id: changeSetId };
    const decisionRequired = proposed?.factual_transition.decision_required === true;
    return { disposition: replacement == null ? 'execute' : 'replace',
      ...(replacement == null ? {} : { replacement }), follow_up_candidates: [],
      state_projection: projection, stop_after_current_batch: decisionRequired,
      proposals: [{ proposal_id: candidate.boundary_id, npc_routine_transition: transition,
        write_set: { inserts: [], deletes: [], updates: [
          { ...write('party_npc_spatial_schedules', row.id, record),
            previous_record: { causal_state_ref: row.causal_state_ref } },
          { ...write('party_npcs', row.npc_id, { party_id: row.party_id,
            npc_id: row.npc_id, machine_state: machineAfter }),
            previous_record: { machine_state: machine } }],
        appends: [write('party_npc_runtime_transitions', candidate.boundary_id, {
          transition_id: candidate.boundary_id, party_id: row.party_id, npc_id: row.npc_id,
          transition_kind: interrupted ? 'routine_interrupted' : 'routine_transition', event_id: null,
          change_set_id: changeSetId, idempotency_record_id: candidate.idempotency_key,
          occurred_at_whole_minutes: exact.whole_minutes,
          occurred_at_subminute_numerator: exact.subminute_numerator,
          occurred_at_subminute_denominator: exact.subminute_denominator,
          trace: { transition: proposed?.factual_transition ?? null,
            evidence: proposed?.transition_evidence ?? null } })] },
        expected_state_versions: [{ target_table: 'party_npc_spatial_schedules', id: row.id,
          state_version: Number(row.state_version) }],
        physical_keys: [`party_runtime.party_npc_spatial_schedules:${row.id}`,
          `party_runtime.party_npcs:${row.npc_id}`,
          `party_runtime.party_npc_runtime_transitions:${candidate.boundary_id}`] }] };
  } };
}

export function applyNpcRoutineProjection(projection, transition) {
  const next = structuredClone(projection);
  const row = findSchedule(next, transition.npc_id);
  if (!row || digest(row.causal_state_ref) !== digest(transition.before.causal_state_ref)) fail('temporal_candidate_stale');
  for (const world of worlds(next)) {
    const schedule = world?.npc_schedule_runtime?.find((entry) => entry.npc_id === transition.npc_id);
    if (schedule) Object.assign(schedule, structuredClone(transition.after));
    const npc = world?.npcs?.find(({ instance_id }) => instance_id === transition.npc_id);
    if (npc) npc.machine_state = structuredClone(transition.after.npc_snapshot.machine_state);
  }
  if (transition.proposal?.factual_transition.decision_required === true) {
      const source = { entity_kind: 'npc_activity_factual_transition', entity_id: transition.boundary_id };
      next.npc_decision_signal_descriptors = [...(next.npc_decision_signal_descriptors ?? []), {
        occurred_at: transition.occurred_at, category: 'objective', significance: 'material',
        source_event_ref: source, subject_ref: { entity_kind: 'npc', entity_id: transition.npc_id },
        scope_refs: [], perception_required: false, source_perception_ref: null,
        causal_parent_refs: [{ entity_kind: 'temporal_boundary_candidate', entity_id: transition.boundary_id }],
        perceived_change_summary: transition.proposal.factual_transition.summary }];
    }
  return next;
}
export function applyNpcRoutineTemporalResults(state, results) {
  const transitions = (results ?? []).flatMap((result) => result?.combined_change_set?.proposals ?? [])
    .map((proposal) => proposal.npc_routine_transition).filter(Boolean);
  for (const transition of transitions) {
    for (const group of [state.npcs, state.first_entry_preparation?.npcs,
      ...(state.first_entry_preparation?.members ?? []).map((member) => member.npcs)]) {
      const npc = group?.find((entry) => entry.instance_id === transition.npc_id);
      if (npc) npc.machine_state = structuredClone(transition.after.npc_snapshot.machine_state);
    }
    const runtime = state.npc_schedule_runtime?.find((entry) => entry.npc_id === transition.npc_id);
    if (runtime) Object.assign(runtime, structuredClone(transition.after));
    state.temporal_boundary_candidates = (state.temporal_boundary_candidates ?? [])
      .filter((candidate) => !(candidate.source_ref?.entity_kind === 'npc'
        && candidate.source_ref.entity_id === transition.npc_id && candidate.resolution_class === 'npc_schedule'));
    const next = npcRoutineCandidate(transition.after);
    if (next) state.temporal_boundary_candidates.push(next);
  }
  if (transitions.length && state.temporal_source_proof) {
    state.temporal_source_proof.candidates = structuredClone(state.temporal_boundary_candidates);
    state.temporal_source_proof.candidate_count = state.temporal_boundary_candidates.length;
    state.temporal_source_proof.active_schedule_count = (state.npc_schedule_runtime ?? [])
      .filter((row) => row.status === 'active').length;
  }
  return state;
}
export function npcRoutineRuntime(projection) {
  return worlds(projection).find((value) => Array.isArray(value?.npc_schedule_runtime))?.npc_schedule_runtime ?? [];
}
export function replaceNpcRoutineCandidates(candidates, projection) {
  const rows = npcRoutineRuntime(projection);
  const ids = new Set(rows.map(row => row.npc_id));
  return [...candidates.filter(candidate => !(candidate.rule_ref?.entity_ref?.entity_id
    === RULE.entity_ref.entity_id && ids.has(candidate.primary_subject_ref?.entity_id))),
  ...rows.map(npcRoutineCandidate).filter(Boolean)];
}
export function hydrateNpcRoutineState(state) {
  for (const row of state.npc_schedule_runtime ?? []) {
    for (const group of [state.npcs, state.first_entry_preparation?.npcs,
      ...(state.first_entry_preparation?.members ?? []).map((member) => member.npcs)]) {
      const npc = group?.find(({ instance_id }) => instance_id === row.npc_id);
      if (npc) npc.machine_state = structuredClone(row.npc_snapshot.machine_state);
    }
  }
  return state;
}
function findSchedule(projection, id) { return npcRoutineRuntime(projection).find((row) => row.npc_id === id); }
function findNpc(projection, id) { return worlds(projection).flatMap((world) => world?.npcs ?? [])
  .find(({ instance_id }) => instance_id === id); }
function worlds(value) { return [value, value?.phase6_state, value?.world_state, value?.conversation_state?.world_state]; }
function versioned(entity_kind, entity_id) { return { entity_ref: { entity_kind, entity_id }, authoring_version: '1' }; }
function write(target_table, id, record) { return { target_table, id, record }; }
function fail(code) { throw Object.assign(new Error(code), { code }); }
