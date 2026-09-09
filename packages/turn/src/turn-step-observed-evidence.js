import { deepFreeze } from '@rus/kernel';
import { isCurrentVisibleDiscoveryRef } from './turn-step-ordinary-discovery.js';

export function isObservedEvidenceInspectionInScope({ operation,
  playerSafeState }) {
  const target = operation?.target_refs?.length === 1
    ? operation.target_refs[0] : null;
  return operation?.op === 'request_discovery'
    && operation.discovery_kind === 'inspect'
    && typeof target === 'string'
    && typeof operation.query === 'string' && operation.query.trim().length > 0
    && !isCurrentVisibleDiscoveryRef(playerSafeState, target)
    && (playerSafeState?.knowledge ?? []).some((entry) =>
      entry?.fact_id === target && entry.knowledge_state === 'observed');
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
