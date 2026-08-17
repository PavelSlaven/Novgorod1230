import { applyLocalFireAtomicWritePlanInTransaction } from
  './local-fire-persistence.js';

export async function assertLocalFireFuelMutationBound(client, plan) {
  const itemIds = [...new Set([
    ...genericItemMutationRefs(plan),
    ...(plan.local_fire_atomic_write_plan?.transition_proposal
      ?.added_fuel_refs ?? [])
  ])];
  if (itemIds.length === 0) return;
  const generic = new Set(genericItemMutationRefs(plan));
  const added = plan.local_fire_atomic_write_plan?.transition_proposal
    ?.added_fuel_refs ?? [];
  if (added.some((ref) => generic.has(ref))) conflict();
  const result = await client.query(
    `SELECT fuel_item_id FROM party_runtime.party_local_world_process_fuel_bindings
     WHERE party_id=$1 AND fuel_item_id=ANY($2::text[])
       AND released_at_change_set_id IS NULL FOR UPDATE`,
  [plan.party_id, itemIds]);
  if (result.rows.length === 0) return;
  if (result.rows.some(({ fuel_item_id: id }) => generic.has(id))) conflict();
}

function genericItemMutationRefs(plan) {
  return [...(plan.inserts ?? []), ...(plan.updates ?? []),
    ...(plan.deletes ?? [])].flatMap((write) => {
    if (write.target_table === 'party_items'
        || write.target_table === 'party_item_placements') {
      return [write.record?.item_id ?? write.id];
    }
    if (write.target_table === 'party_ownership'
        && write.record?.item_id != null) return [write.record.item_id];
    return [];
  });
}

function conflict() {
  throw Object.assign(new Error(
    'generic item, placement or ownership writes conflict with local-fire fuel'),
  { spatialCode: 'state_version_conflict' });
}

export async function applyLocalFireP16Extension(client, plan) {
  if (plan.local_fire_atomic_write_plan == null) return;
  try {
    await applyLocalFireAtomicWritePlanInTransaction({ client,
      input: plan.local_fire_atomic_write_plan,
      partyStateVersionAfter:
        plan.local_fire_atomic_write_plan.base_party_state_version + 1,
      p16ChangeSetId: plan.change_set_id });
  } catch (cause) {
    if (['LOCAL_FIRE_FUEL_STALE', 'LOCAL_FIRE_PROCESS_STALE',
      'LOCAL_FIRE_AUTHORITY_STALE', 'LOCAL_FIRE_IGNITION_BASIS_STALE']
      .includes(cause?.code)) cause.spatialCode = 'state_version_conflict';
    else if (['LOCAL_FIRE_IDEMPOTENCY_CONFLICT',
      'LOCAL_FIRE_PROCESS_COLLISION', 'LOCAL_FIRE_FUEL_BOUND']
      .includes(cause?.code)) cause.spatialCode = 'idempotency_conflict';
    throw cause;
  }
}
