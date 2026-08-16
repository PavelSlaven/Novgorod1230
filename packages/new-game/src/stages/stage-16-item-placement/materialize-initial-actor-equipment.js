import { computeMaterializationEnvelopeDigest } from '@rus/contracts';
import { deepFreeze } from '@rus/kernel';
import {
  MaterializationError,
  materializeApprovedActorEquipment
} from '@rus/materialization';

/** Completes an authored party result through the common Stage 16 owner. */
export function materializeInitialActorEquipment(partyMaterialization) {
  const handoff = partyMaterialization?.initial_actor_equipment_handoff;
  if (handoff == null) return partyMaterialization;
  if (!Array.isArray(partyMaterialization?.immediate?.items)
      || !partyMaterialization?.trace) {
    throw new MaterializationError(
      'INITIAL_ACTOR_EQUIPMENT_HANDOFF_INVALID',
      'Initial actor equipment requires a materialized party result.'
    );
  }
  const stage16 = materializeApprovedActorEquipment(handoff);
  const completed = structuredClone(partyMaterialization);
  completed.immediate.items.push(
    ...structuredClone(stage16.item_instances)
  );
  delete completed.initial_actor_equipment_handoff;
  delete completed.trace.result_digest;
  completed.trace.initial_actor_equipment_materialization =
    structuredClone(stage16.materialization_run);
  completed.trace.result_digest =
    computeMaterializationEnvelopeDigest(completed);
  return deepFreeze(completed);
}
