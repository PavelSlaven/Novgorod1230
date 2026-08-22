import { canonicalDigest } from '@rus/materialization';
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
        return context.projection.conversation_state == null
          ? validatePhase6TemporalSourceResolution({ candidate,
              projection: context.projection, resolution })
          : validateConversationTemporalSourceResolution({ candidate,
              projection: context.projection, resolution });
      } };
  });
}

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
      && matchesPhysicalWrite(priorPhysical, nextPhysical, write.record));
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

function matchesPhysicalWrite(prior, expected, record) {
  const anchorChanged = prior.anchor_id !== expected.anchor_id;
  const machineChanged = canonicalDigest(prior.machine_state)
    !== canonicalDigest(expected.machine_state);
  return (!anchorChanged || record.anchor_id === expected.anchor_id)
    && (!machineChanged || record.machine_state !== undefined
      && canonicalDigest(record.machine_state)
        === canonicalDigest(expected.machine_state))
    && (anchorChanged || machineChanged);
}

function fail(candidate, code, details = {}) {
  throw Object.assign(new Error(code), { code,
    details: { boundary_id: candidate.boundary_id, ...details } });
}
