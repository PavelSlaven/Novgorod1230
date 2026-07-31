import { canonicalDigest } from '@rus/materialization';

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
        return validatePhase6TemporalSourceResolution({ candidate,
          projection: context.projection,
          resolution: registration.resolve(candidate, context) });
      } };
  });
}

export function validatePhase6TemporalSourceResolution({ candidate,
  projection, resolution }) {
  const nextProjection = resolution?.state_projection ?? projection;
  const before = projection.phase6_state;
  const after = nextProjection.phase6_state;
  if (before?.party_id !== after?.party_id) fail(candidate,
    'TRACE_PHASE_6_TEMPORAL_SOURCE_PROJECTION_INVALID');
  const beforeRest = structuredClone(before);
  const afterRest = structuredClone(after);
  delete beforeRest.npcs;
  delete afterRest.npcs;
  if (canonicalDigest(beforeRest) !== canonicalDigest(afterRest)) {
    fail(candidate, 'TRACE_PHASE_6_TEMPORAL_SOURCE_PROJECTION_UNSUPPORTED');
  }
  const beforeNpcs = new Map((before.npcs ?? []).map(
    (npc) => [npc.instance_id, npc]
  ));
  const afterNpcs = new Map((after.npcs ?? []).map(
    (npc) => [npc.instance_id, npc]
  ));
  if (beforeNpcs.size !== afterNpcs.size) fail(candidate,
    'TRACE_PHASE_6_TEMPORAL_SOURCE_PROJECTION_UNSUPPORTED');
  const writes = (resolution.proposals ?? []).flatMap((proposal) =>
    proposal.write_set?.updates ?? []).filter((write) =>
    write.target_table === 'party_npcs');
  const changed = [];
  for (const [npcId, prior] of beforeNpcs) {
    const next = afterNpcs.get(npcId);
    if (next == null) fail(candidate,
      'TRACE_PHASE_6_TEMPORAL_SOURCE_PROJECTION_UNSUPPORTED');
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
      'TRACE_PHASE_6_TEMPORAL_SOURCE_PROJECTION_WRITE_GAP', {
        npc_id: npcId, matching_write_count: matching.length,
        write_ids: writes.map((write) => write.id)
      });
  }
  if (writes.some((write) => !changed.includes(write.id))) fail(candidate,
    'TRACE_PHASE_6_TEMPORAL_SOURCE_PROJECTION_WRITE_GAP');
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
