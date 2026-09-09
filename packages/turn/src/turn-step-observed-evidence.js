import { deepFreeze } from '@rus/kernel';
export function isObservedEvidenceInspectionInScope({ operation,
  playerSafeState }) {
  const targets = operation?.target_refs;
  const capability = playerSafeState?.observed_evidence_inspection;
  const candidates = capability?.candidates;
  const available = new Set(capability?.semantic_grounding_available === true
      && Array.isArray(candidates) && candidates.every((entry) =>
        typeof entry?.fact_ref === 'string'
        && typeof entry.text === 'string' && entry.text.trim().length > 0)
    ? candidates.map(({ fact_ref: ref }) => ref) : []);
  return operation?.op === 'request_discovery'
    && operation.discovery_kind === 'inspect'
    && Array.isArray(targets) && targets.length > 0
    && targets.every((target) => typeof target === 'string'
      && available.has(target))
    && typeof operation.query === 'string' && operation.query.trim().length > 0
    && available.size === candidates?.length;
}

export function resolveObservedEvidenceInspection(execution) {
  return deepFreeze({
    working_projection: structuredClone(execution.working_projection),
    write_fragments: [],
    summary: 'Наблюдение не содержит данных для нового достоверного вывода.',
    player_response_boundary: true,
    consequence_fragment: { visible_seed: { ordinary_presence_seed: {
      kind: 'ordinary_presence_seed', resolution: 'authority_required'
    } } }
  });
}
