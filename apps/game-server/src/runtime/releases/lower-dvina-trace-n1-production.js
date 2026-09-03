import { buildNpcOrdinarySemanticRemainder,
  validateNpcOrdinarySemanticRemainder } from '@rus/npc-runtime';
import { resolveNpcOrdinarySemanticRemainder as resolveTurnRemainder } from
  '@rus/turn';
import { backgroundNpcFormalStateDigest,
  createBackgroundNpcSemanticAtomicWritePlan } from
  '../../infrastructure/postgres/background-npc-semantic-atomic-write-plan.js';

export function createLowerDvinaTraceN1ProductionResolverFactory({
  loadedProfile, roleRunner,
  resolveNpcOrdinarySemanticRemainder = resolveTurnRemainder
} = {}) {
  if (loadedProfile?.schema !== 'rus.lower_dvina_trace_n1_loaded_profile.v1'
      || loadedProfile.profile?.status !== 'approved'
      || typeof resolveNpcOrdinarySemanticRemainder !== 'function') {
    throw new TypeError('Approved N1 profile and turn resolver are required.');
  }
  const profile = loadedProfile.profile;
  const profileRef = `${profile.profile_id}@${profile.revision}`;
  const eligible = new Set(profile.eligible_participant_profiles.map(
    ({ profile_id: id, revision }) => `${id}@${revision}`));
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
      const profileId = npc?.profile_id ?? npc?.profile_set_id;
      const profileRevision = npc?.profile_revision
        ?? npc?.semantic_state?.profile_revision;
      if (value?.schema !== 'turn_step_background_npc_remainder_request_v1'
          || operation?.op !== 'request_discovery'
          || !['look', 'inspect'].includes(operation.discovery_kind)
          || operation?.actor_ref !== actorRef
          || operation?.target_refs?.length !== 1
          || !text(actorRef) || !text(target) || visible == null || npc == null
          || npc.profile_level !== 'background'
          || !hasMaterializedSchedule(npc)
          || !eligible.has(`${profileId}@${profileRevision}`)
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
      const currentActivity = materializedActivity(npc);
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
        request: modelRequest, roleRunner
      });
      const remainder = buildNpcOrdinarySemanticRemainder({
        request: modelRequest, proposal, profileRef,
        ordinaryActivity: currentActivity,
        causalBasisRefs: [`${profileId}@${profileRevision}`, locationRef]
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
function materializedActivity(npc) {
  if (!hasMaterializedSchedule(npc)) fail('TRACE_N1_SCOPE_INVALID');
  return npc.machine_state.current_activity.summary;
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
