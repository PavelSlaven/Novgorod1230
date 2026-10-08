import { canonicalDigest } from '@rus/materialization';
import { compareGameTimestamp } from '@rus/time-events-history';
import { applyNpcRoutineProjection } from './npc-routine-temporal.js';
import { applyLocalFireTemporalProjection } from
  './lower-dvina-trace-local-fire-temporal.js';

export function lowerDvinaTraceTemporalSourceRegistrations(registrations) {
  if (!Array.isArray(registrations)) {
    throw new TypeError('Lower Dvina temporal sources require registrations');
  }
  return registrations.map((registration) => {
    if (typeof registration?.resolve !== 'function') {
      throw new TypeError('Lower Dvina temporal source owner is missing');
    }
    return { ...registration,
      resolve(candidate, context) {
        const resolution = registration.resolve(candidate, context);
        if (candidate?.boundary_kind === 'body_threshold') {
          return validateBodyThresholdProjection({ candidate,
            projection: context.projection, resolution,
            request: context.request });
        }
        const routine = resolution?.proposals?.find((proposal) => proposal.npc_routine_transition);
        if (routine) {
          const expected = applyNpcRoutineProjection(context.projection, routine.npc_routine_transition);
          if (canonicalDigest(expected)
              !== canonicalDigest(resolution.state_projection)) fail(candidate,
            'NPC_ROUTINE_TEMPORAL_PROJECTION_INVALID');
          return resolution;
        }
        return context.projection.conversation_state == null
          ? validatePhase6TemporalSourceResolution({ candidate,
              projection: context.projection, resolution })
          : validateConversationTemporalSourceResolution({ candidate,
              projection: context.projection, resolution });
      } };
  });
}

function validateBodyThresholdProjection({ candidate, projection,
  resolution, request }) {
  const descriptors = projection?.body_threshold_descriptors;
  const candidateDigest = canonicalDigest(candidate);
  const profileId = candidate.rule_ref?.entity_ref?.entity_id;
  const expectedMetric = BODY_THRESHOLD_PROFILE_METRICS[profileId];
  const matches = Array.isArray(descriptors) ? descriptors.filter((entry) =>
    entry?.candidate_digest === candidateDigest
      && entry?.boundary_id === candidate.boundary_id) : [];
  const descriptor = matches.length === 1 ? matches[0] : null;
  const critical = descriptor?.threshold_value?.numerator === '0'
    && descriptor?.threshold_value?.denominator === '1';
  const stop = descriptor?.metric === 'energy' && critical
    && request?.inclusive_limit_timestamp
    && compareGameTimestamp(candidate.scheduled_at,
      request.inclusive_limit_timestamp) < 0;
  const proposal = resolution?.proposals?.length === 1
    ? resolution.proposals[0] : null;
  const expectedSource = { entity_kind: 'temporal_boundary_candidate',
    entity_id: candidate.boundary_id };
  const proposalKeys = stop
    ? ['boundary_kind', 'boundary_id', 'candidate_digest', 'source_event_ref',
      'subject_ref', 'scope_ref', 'threshold', 'reason_code']
    : ['boundary_kind', 'boundary_id', 'candidate_digest', 'source_event_ref',
      'subject_ref', 'scope_ref', 'threshold'];
  const value = descriptor?.threshold_value;
  if (candidate?.boundary_kind !== 'body_threshold'
      || candidate.primary_subject_ref?.entity_kind !== 'body_state'
      || candidate.scope_ref?.entity_kind !== 'party'
      || candidate.primary_subject_ref?.entity_id
        !== projection?.phase6_state?.actor_id
      || candidate.scope_ref?.entity_id !== projection?.phase6_state?.party_id
      || candidate.rule_ref?.entity_ref?.entity_kind !== 'body_effect'
      || !expectedMetric
      || candidate.policy_ref?.entity_ref?.entity_kind !== 'condition_set'
      || candidate.policy_ref?.entity_ref?.entity_id
        !== `${profileId}:threshold-boundary`
      || !Array.isArray(candidate.subject_refs)
      || !candidate.subject_refs.some((subject) =>
        canonicalDigest(subject) === canonicalDigest(candidate.primary_subject_ref))
      || !Array.isArray(descriptors)
      || matches.length !== 1
      || !exactKeys(descriptor, ['candidate_digest', 'boundary_id', 'metric',
        'threshold_value', 'critical'])
      || descriptor?.metric !== expectedMetric
      || descriptor?.critical !== critical
      || !value || !/^(0|[1-9]\d*)$/u.test(String(value.numerator))
      || value.denominator !== '1'
      || !['0', '20', '50'].includes(value.numerator)
      || !request?.inclusive_limit_timestamp
      || resolution?.disposition !== 'execute'
      || !proposal || !exactKeys(proposal, proposalKeys)
      || proposal.boundary_kind !== candidate.boundary_kind
      || proposal.boundary_id !== candidate.boundary_id
      || proposal.candidate_digest !== candidateDigest
      || canonicalDigest(proposal.source_event_ref)
        !== canonicalDigest(expectedSource)
      || canonicalDigest(proposal.subject_ref)
        !== canonicalDigest(candidate.primary_subject_ref)
      || canonicalDigest(proposal.scope_ref)
        !== canonicalDigest(candidate.scope_ref)
      || !exactKeys(proposal.threshold, ['metric', 'value'])
      || proposal.threshold.metric !== descriptor.metric
      || canonicalDigest(proposal.threshold.value) !== canonicalDigest(value)
      || (stop ? proposal.reason_code !== 'event_effect_gap'
        : Object.hasOwn(proposal, 'reason_code'))
      || resolution.stop_after_current_batch !== Boolean(stop)
      || canonicalDigest(resolution.state_projection ?? projection)
        !== canonicalDigest(projection)) {
    fail(candidate, 'TRACE_BODY_THRESHOLD_TEMPORAL_SOURCE_PROJECTION_INVALID');
  }
  return resolution;
}

function exactKeys(value, expected) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('|') === [...expected].sort().join('|');
}

const BODY_THRESHOLD_PROFILE_METRICS = Object.freeze({
  satiety_hourly_spend_v2: 'satiety',
  energy_awake_spend_v2: 'energy',
  starvation_health_harm_v2: 'health'
});

export function validatePhase6TemporalSourceResolution({ candidate,
  projection, resolution }) {
  const nextProjection = resolution?.state_projection ?? projection;
  if (candidate?.source_ref?.entity_kind === 'propagation_process') {
    return validateLocalFireProjection({ candidate, projection, resolution,
      nextProjection });
  }
  return validateNpcStateProjection({ candidate, resolution, projection,
    nextProjection, before: projection.phase6_state,
    after: nextProjection.phase6_state,
    invalidCode: 'TRACE_PHASE_6_TEMPORAL_SOURCE_PROJECTION_INVALID',
    unsupportedCode: 'TRACE_PHASE_6_TEMPORAL_SOURCE_PROJECTION_UNSUPPORTED',
    writeGapCode: 'TRACE_PHASE_6_TEMPORAL_SOURCE_PROJECTION_WRITE_GAP' });
}

export function validateConversationTemporalSourceResolution({ candidate,
  projection, resolution }) {
  const nextProjection = resolution?.state_projection ?? projection;
  if (candidate?.source_ref?.entity_kind === 'propagation_process') {
    return validateLocalFireProjection({ candidate, projection, resolution,
      nextProjection });
  }
  if ((resolution?.proposals ?? []).some((proposal) =>
    (proposal.expected_state_versions ?? []).some((entry) =>
      entry.target_table === 'party_npcs'))) {
    fail(candidate, 'TRACE_CONVERSATION_TEMPORAL_SOURCE_PROJECTION_WRITE_GAP');
  }
  return validateNpcStateProjection({ candidate, resolution, projection,
    nextProjection,
    before: projection.conversation_state?.world_state,
    after: nextProjection.conversation_state?.world_state,
    invalidCode: 'TRACE_CONVERSATION_TEMPORAL_SOURCE_PROJECTION_INVALID',
    unsupportedCode:
      'TRACE_CONVERSATION_TEMPORAL_SOURCE_PROJECTION_UNSUPPORTED',
    writeGapCode: 'TRACE_CONVERSATION_TEMPORAL_SOURCE_PROJECTION_WRITE_GAP' });
}

function validateLocalFireProjection({candidate,projection,resolution,
  nextProjection}){
  const plans=(resolution?.proposals??[]).flatMap((proposal)=>
    proposal.local_fire_atomic_write_plans??[]);
  if(plans.length!==1
      || plans[0].transition_proposal.cause?.boundary_id!==candidate.boundary_id){
    fail(candidate,'TRACE_LOCAL_FIRE_TEMPORAL_SOURCE_PROJECTION_WRITE_GAP');
  }
  const expected=applyLocalFireTemporalProjection(projection,plans[0]);
  if(canonicalDigest(expected)!==canonicalDigest(nextProjection)){
    fail(candidate,'TRACE_LOCAL_FIRE_TEMPORAL_SOURCE_PROJECTION_UNSUPPORTED');
  }
  return resolution;
}

function validateNpcStateProjection({ candidate, resolution, before, after,
  invalidCode, unsupportedCode, writeGapCode }) {
  if (before?.party_id !== after?.party_id) fail(candidate,
    invalidCode);
  const beforeRest = structuredClone(before);
  const afterRest = structuredClone(after);
  delete beforeRest.npcs;
  delete afterRest.npcs;
  if (canonicalDigest(beforeRest) !== canonicalDigest(afterRest)) {
    fail(candidate, unsupportedCode);
  }
  const beforeNpcs = new Map((before.npcs ?? []).map(
    (npc) => [npc.instance_id, npc]
  ));
  const afterNpcs = new Map((after.npcs ?? []).map(
    (npc) => [npc.instance_id, npc]
  ));
  if (beforeNpcs.size !== afterNpcs.size) fail(candidate,
    unsupportedCode);
  const writes = (resolution.proposals ?? []).flatMap((proposal) =>
    proposal.write_set?.updates ?? []).filter((write) =>
    write.target_table === 'party_npcs');
  const changed = [];
  for (const [npcId, prior] of beforeNpcs) {
    const next = afterNpcs.get(npcId);
    if (next == null) fail(candidate,
      unsupportedCode);
    const priorPhysical = physicalNpcState(prior);
    const nextPhysical = physicalNpcState(next);
    if (canonicalDigest(priorPhysical) === canonicalDigest(nextPhysical)) {
      continue;
    }
    changed.push(npcId);
    const matching = writes.filter((write) => write.id === npcId
      && write.record?.party_id === after.party_id
      && write.record?.npc_id === npcId
      && matchesPhysicalWrite(priorPhysical, nextPhysical, write.record, after));
    if (matching.length !== 1) fail(candidate,
      writeGapCode, {
        npc_id: npcId, matching_write_count: matching.length,
        write_ids: writes.map((write) => write.id)
      });
  }
  if (writes.some((write) => !changed.includes(write.id))) fail(candidate,
    writeGapCode);
  return resolution;
}

function physicalNpcState(npc) {
  return { anchor_id: npc.anchor_id,
    machine_state: structuredClone(npc.machine_state ?? null) };
}

function matchesPhysicalWrite(prior, expected, record, state) {
  const anchorChanged = prior.anchor_id !== expected.anchor_id;
  const machineChanged = canonicalDigest(prior.machine_state)
    !== canonicalDigest(expected.machine_state);
  const legacyAnchor = usesPreparedFirstEntry(state, expected.anchor_id)
    ? null : expected.anchor_id;
  return (!anchorChanged || record.anchor_id === legacyAnchor)
    && (!machineChanged || record.machine_state !== undefined
      && canonicalDigest(record.machine_state)
        === canonicalDigest(expected.machine_state))
    && (anchorChanged || machineChanged);
}

function usesPreparedFirstEntry(state, anchorId) {
  const firstEntry = state.first_entry_preparation;
  return firstEntry?.spatial_v3?.target?.status === 'prepared'
    && anchorId === firstEntry.scene?.anchor?.instance_id;
}

function fail(candidate, code, details = {}) {
  throw Object.assign(new Error(code), { code,
    details: { boundary_id: candidate.boundary_id, ...details } });
}
