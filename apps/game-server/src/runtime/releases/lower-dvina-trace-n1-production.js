import { buildNpcOrdinarySemanticRemainder,
  validateNpcOrdinarySemanticRemainder, npcRoutineActivity } from '@rus/npc-runtime';
import { resolveNpcOrdinarySemanticRemainder as resolveTurnRemainder } from
  '@rus/turn';
import { backgroundNpcFormalStateDigest,
  createBackgroundNpcSemanticAtomicWritePlan } from
  '../../infrastructure/postgres/background-npc-semantic-atomic-write-plan.js';

export function createLowerDvinaTraceN1ProductionResolverFactory({
  loadedProfile, roleRunner, worldKnowledgeGrounder = null,
  resolveNpcOrdinarySemanticRemainder = resolveTurnRemainder
} = {}) {
  if (!['rus.lower_dvina_trace_n1_loaded_profile.v1',
    'rus.live_world_runtime.n1_loaded_profile.v1'].includes(loadedProfile?.schema)
      || loadedProfile.profile?.status !== 'approved'
      || typeof resolveNpcOrdinarySemanticRemainder !== 'function') {
    throw new TypeError('Approved N1 profile and turn resolver are required.');
  }
  const profile = loadedProfile.profile;
  const profileRef = `${profile.profile_id}@${profile.revision}`;
  return ({ partyId, applyWorkingProjection }) =>
    async function resolveBackgroundNpcRemainder(input) {
      const value = snapshot(input);
      const operation = value?.operation;
      const request = value?.request;
      const actorRef = value?.actor?.actor_id;
      const target = operation?.target_refs?.[0];
      const safeState = request?.player_safe_state;
      const visible = visibleNpc(safeState, target);
      const npc = exactNpc(value?.committed_state?.npcs, target);
      const participant = resolveNpcOrdinarySemanticParticipant({ npc, loadedProfile,
        committedState: value?.committed_state });
      if (value?.schema !== 'turn_step_background_npc_remainder_request_v1'
          || operation?.op !== 'request_discovery'
          || !['look', 'inspect'].includes(operation.discovery_kind)
          || operation?.actor_ref !== actorRef
          || operation?.target_refs?.length !== 1
          || !text(actorRef) || !text(target) || visible == null || npc == null
          || participant == null
          || !safeState?.background_npc_remainder?.eligible_npc_refs
            ?.includes(target)) fail('TRACE_N1_SCOPE_INVALID');
      const committed = npc.semantic_state?.n1_remainder;
      if (committed != null) {
        if (!validateNpcOrdinarySemanticRemainder(committed)) {
          fail('TRACE_N1_COMMITTED_REMAINDER_INVALID');
        }
        return result(value, committed, null, applyWorkingProjection);
      }
      const locationRef = npc.location_profile_ref
        ?? npc.semantic_state?.location_profile_ref
        ?? value.committed_state?.position?.location_ref;
      const roleRef = refText(npc.role_ref);
      const occupationRef = refText(npc.occupation_ref);
      const currentActivity = participant.current_activity;
      if (!text(roleRef) || !text(occupationRef) || locationRef == null) {
        fail('TRACE_N1_FORMAL_FACETS_MISSING');
      }
      const modelRequest = {
        schema: 'npc_ordinary_semantic_remainder_request_v1',
        request_id: `n1:${request.request_id}:${target}`,
        npc_ref: target,
        profile_ref: profileRef,
        observable_context: {
          display_label: visible.display_label,
          observable_cues: snapshot(visible.observable_cues ?? {}),
          scene_details: (safeState.current_visible_context
            ?.sensory_details ?? []).filter(text).slice(0, 8)
        }
      };
      const proposal = await resolveNpcOrdinarySemanticRemainder({
        request: modelRequest, roleRunner,
        worldKnowledge: worldKnowledgeGrounder == null ? null
          : (await worldKnowledgeGrounder.ground(modelRequest,
              'materialization_support', {
                clock: safeState.clock,
                place_refs: [locationRef],
                actor_facets: {
                  role_ref: roleRef,
                  occupation_ref: occupationRef
                }
              })).world_knowledge
      });
      const remainder = buildNpcOrdinarySemanticRemainder({
        request: modelRequest, proposal, profileRef,
        ordinaryActivity: currentActivity,
        causalBasisRefs: [`${participant.profile_id}@${participant.revision}`, locationRef]
      });
      const plan = createBackgroundNpcSemanticAtomicWritePlan({
        schema: 'background_npc_semantic_atomic_write_plan_v1',
        party_id: partyId,
        base_party_state_version: request.committed_state_version,
        change_set_id: exactChangeSetId(value, partyId),
        causal_identity: {
          request_id: request.request_id,
          root_turn_id: request.root_turn_id,
          step_index: request.step_index,
          actor_ref: actorRef,
          npc_ref: target
        },
        npc_ref: target,
        formal_state_digest: backgroundNpcFormalStateDigest(npc),
        remainder
      });
      return result(value, remainder, plan, applyWorkingProjection);
    };
}

function result(value, remainder, plan, admit) {
  const context = snapshot(value.request.player_safe_state
    .current_visible_context);
  const visible = visibleNpc(value.request.player_safe_state,
    remainder.npc_ref);
  const stepIndex = value.request.step_index;
  if (visible == null || !Number.isSafeInteger(stepIndex) || stepIndex < 1) {
    fail('TRACE_N1_SCOPE_INVALID');
  }
  context.visible_npc = context.visible_npc.map((entry) =>
    entry.entity_ref?.entity_kind === 'npc'
      && entry.entity_ref.entity_id === remainder.npc_ref ? {
        ...entry,
        observable_cues: {
          ...(entry.observable_cues ?? {}),
          ordinary_remainder: {
            ordinary_descriptor: remainder.ordinary_descriptor,
            ordinary_activity: remainder.ordinary_activity
          }
        }
      } : entry);
  const working = { ...snapshot(value.working_projection),
    current_visible_context: context };
  return Object.freeze({
    working_projection: typeof admit === 'function' ? admit(working) : working,
    summary: 'background NPC observed',
    write_fragments: [],
    duration_minutes: 0,
    player_response_boundary: true,
    consequence_fragment: { visible_seed: {
      [`turn_step_background_npc_observation_${stepIndex}`]: {
        kind: 'background_npc_observation', npc_ref: remainder.npc_ref,
        display_label: visible.display_label,
        ordinary_descriptor: remainder.ordinary_descriptor
      }
    } },
    ...(plan == null ? {} : {
      background_npc_semantic_atomic_write_plan: plan
    })
  });
}

function visibleNpc(state, ref) {
  const matches = (state?.current_visible_context?.visible_npc ?? []).filter(
    (entry) => entry?.entity_ref?.entity_kind === 'npc'
      && entry.entity_ref.entity_id === ref
      && text(entry.display_label));
  return matches.length === 1 ? matches[0] : null;
}
function exactNpc(npcs, ref) {
  const matches = (npcs ?? []).filter((npc) =>
    (npc.instance_id ?? npc.npc_id) === ref);
  return matches.length === 1 ? matches[0] : null;
}
function hasMaterializedSchedule(npc) {
  const activity = npc?.machine_state?.current_activity;
  return npc?.machine_state?.schedule_state === 'working'
    && activity?.status === 'active'
    && text(activity.activity_ref)
    && text(activity.summary)
    && activity.can_continue_automatically === true
    && Array.isArray(npc.schedule_records)
    && npc.schedule_records.some((schedule) =>
      schedule?.schedule_profile_id === activity.activity_ref
        && text(schedule.time_band) && text(schedule.g5_node_id));
}
/** Shared admission for projection and execution; target identity is recovered from approved bindings. */
export function resolveNpcOrdinarySemanticParticipant({ npc, loadedProfile, committedState }) {
  if (loadedProfile?.profile?.status !== 'approved' || npc?.profile_level !== 'background') return null;
  const neutral = loadedProfile.schema === 'rus.live_world_runtime.n1_loaded_profile.v1';
  if (!neutral && loadedProfile.schema !== 'rus.lower_dvina_trace_n1_loaded_profile.v1') return null;
  if (neutral && !['persisted_profile_revision', 'approved_source_binding']
    .includes(loadedProfile.participant_binding_kind)) return null;
  const isTarget = neutral && loadedProfile.participant_binding_kind === 'approved_source_binding';
  if (!isTarget && (loadedProfile.target_applicability != null || npc.semantic_state?.source_binding != null)) return null;
  const target = isTarget ? loadedProfile.target_applicability : null;
  if (isTarget && !validTargetApplicability(target)) return null;
  let participant;
  if (target) {
    const source = npc.semantic_state?.source_binding;
    const basis = target.n1_binding_basis?.filter((entry) => sameRef(entry.binding_ref, source?.npc_binding_ref));
    if (source?.world_revision_id !== target.world_revision_id || basis?.length !== 1) return null;
    const [entry] = basis;
    const scope = target.applicability?.filter((entry) => sameRef(entry.npc_composition_ref, source.npc_composition_ref)
      && sameRef(entry.g4_ref, source.g4_ref)
      && Boolean(entry.canonical_g5_ref) === Boolean(source.canonical_g5_ref)
      && Boolean(entry.generation_template_ref) === Boolean(source.generation_template_ref)
      && sameRef(entry.canonical_g5_ref ?? entry.generation_template_ref,
        source.canonical_g5_ref ?? source.generation_template_ref));
    if (scope?.length !== 1 || !scope[0].eligible_npc_binding_refs.some((ref) => sameRef(ref, entry.binding_ref))
      || !entry.regional_context_refs.some((ref) => sameRef(ref, source.regional_context_ref))
      || !sameRef(npc.semantic_state?.regional_context?.profile_ref, source.regional_context_ref)
      || entry.profile_level !== npc.profile_level
      || (npc.profile_id ?? npc.profile_set_id) !== entry.binding_ref.id
      || (npc.semantic_state?.profile_revision ?? npc.profile_revision) !== entry.binding_ref.version
      || refId(npc.role_ref) !== entry.role_ref
      || refId(npc.occupation_ref) !== entry.participant_profile.profile_id) return null;
    const schedules = committedState?.npc_schedule_runtime?.filter((row) => row.npc_id === (npc.instance_id ?? npc.npc_id));
    if (schedules?.length !== 1 || schedules[0].status !== 'active'
      || schedules[0].current_position_node_id !== npc.position_id) return null;
    const runtime = schedules[0].causal_state_ref?.routine_state;
    if (runtime?.status !== 'active' || runtime.profile?.status !== 'approved'
      || schedules[0].schedule_profile_ref?.entity_ref?.entity_id !== runtime.profile.profile_id
      || schedules[0].schedule_profile_ref?.authoring_version !== String(runtime.profile.revision)) return null;
    let activity;
    try { activity = npcRoutineActivity(runtime); } catch { return null; }
    if (!text(activity.summary) || !activity.can_continue_automatically
      || !['activity_ref', 'status', 'summary', 'can_continue_automatically']
        .every((key) => activity[key] === npc.machine_state?.current_activity?.[key])) return null;
    participant = { ...entry.participant_profile, current_activity: activity.summary };
  } else {
    if (!hasMaterializedSchedule(npc)) return null;
    participant = { profile_id: npc.profile_id ?? npc.profile_set_id,
      revision: npc.profile_revision ?? npc.semantic_state?.profile_revision,
      current_activity: npc.machine_state.current_activity.summary };
  }
  return loadedProfile.profile.eligible_participant_profiles.some((entry) =>
    entry.profile_id === participant.profile_id && entry.revision === participant.revision) ? participant : null;
}
function sameRef(left, right) { return text(left?.id) && left.id === right?.id
  && Number.isSafeInteger(left.version) && left.version > 0 && left.version === right.version; }
function refId(value) { return typeof value === 'string' ? value : value?.id ?? value?.occupation_id ?? value?.role_id; }
function validTargetApplicability(target) {
  return text(target?.world_revision_id)
    && Array.isArray(target.applicability) && target.applicability.length > 0
    && target.applicability.every((scope) => sameRef(scope?.g4_ref, scope?.g4_ref)
      && sameRef(scope.npc_composition_ref, scope.npc_composition_ref)
      && Boolean(scope.canonical_g5_ref) !== Boolean(scope.generation_template_ref)
      && sameRef(scope.canonical_g5_ref ?? scope.generation_template_ref,
        scope.canonical_g5_ref ?? scope.generation_template_ref)
      && Array.isArray(scope.eligible_npc_binding_refs) && scope.eligible_npc_binding_refs.length > 0
      && scope.eligible_npc_binding_refs.every((ref) => sameRef(ref, ref)))
    && Array.isArray(target.n1_binding_basis) && target.n1_binding_basis.length > 0
    && target.n1_binding_basis.every((basis) => sameRef(basis?.binding_ref, basis?.binding_ref)
      && text(basis.role_ref) && basis.profile_level === 'background'
      && text(basis.participant_profile?.profile_id)
      && Number.isSafeInteger(basis.participant_profile.revision) && basis.participant_profile.revision > 0
      && Array.isArray(basis.regional_context_refs) && basis.regional_context_refs.length > 0
      && basis.regional_context_refs.every((ref) => sameRef(ref, ref)));
}
function refText(value) {
  if (text(value)) return value;
  const id = value?.profile_id ?? value?.id ?? value?.role_id
    ?? value?.occupation_id;
  const revision = value?.revision ?? value?.version;
  return text(id) ? `${id}${Number.isSafeInteger(revision)
    ? `@${revision}` : ''}` : null;
}
function exactChangeSetId(value, partyId) {
  const turn = value?.committed_state?.party_state?.turn_number + 1;
  if (!Number.isSafeInteger(turn) || turn < 1) fail('TRACE_N1_SCOPE_INVALID');
  return `change:${partyId}:turn-step:${turn}`;
}
function text(value) { return typeof value === 'string'
  && value.trim() === value && value.length > 0; }
function snapshot(value) { try { return structuredClone(value); } catch { return null; } }
function fail(code) { throw Object.assign(new Error(code), { code, status: 409 }); }
