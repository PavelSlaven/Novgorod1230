import { deepFreeze } from './lower-dvina-trace-turn-step-runtime-common.js';
import { existingItemObservationChanges } from './lower-dvina-trace-visible-scene-items.js';
import { ownerFail } from './lower-dvina-trace-turn-step-owner-profiles.js';

/** Read the current actor-safe projection before ordinary creation admission. */
export function resolveExistingItemInspection(execution) {
  const { operation, request, plan } = execution;
  if (operation?.op !== 'request_discovery'
      || operation.discovery_kind !== 'inspect'
      || operation.target_refs?.length !== 1) return null;
  const safe = request?.player_safe_state;
  const targetRef = operation.target_refs[0];
  const item = safe?.items?.find(value =>
    (value.item_id ?? value.instance_id) === targetRef);
  if (item == null) return null;
  const changes = existingItemObservationChanges(item, safe.actor_id);
  return deepFreeze({
    working_projection: structuredClone(execution.working_projection),
    write_fragments: [], duration_minutes: 0,
    summary: 'Available physical item observations inspected.',
    player_response_boundary: plan?.continuation?.pending_discovery == null,
    consequence_fragment: { visible_seed: {
      [`turn_step_item_inspection_${request.step_index}`]: {
        kind: 'existing_item_inspection', target_ref: targetRef,
        query: operation.query, visible_changes: changes
      }
    } }
  });
}

export function existingItemInspectionVisibleResult(seed) {
  if (seed?.kind !== 'existing_item_inspection'
      || Object.keys(seed).length !== 4
      || typeof seed.target_ref !== 'string' || !seed.target_ref
      || typeof seed.query !== 'string' || !seed.query.trim()
      || !Array.isArray(seed.visible_changes) || seed.visible_changes.length === 0
      || seed.visible_changes.some(value => typeof value !== 'string' || !value.trim())) {
    ownerFail('TRACE_EXISTING_ITEM_INSPECTION_VISIBLE_SEED_INVALID');
  }
  return { changes: seed.visible_changes,
    uncertainty: `Вопрос «${seed.query}»: сведения сверх перечисленных доступных признаков пока не установлены.` };
}
