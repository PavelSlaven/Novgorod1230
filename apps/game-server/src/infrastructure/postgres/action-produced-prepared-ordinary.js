import { createOrdinaryMaterializationAtomicWritePlan } from
  './ordinary-materialization-phase-6-commit.js';
import { ordinaryContainerRuntimeItemState } from
  './ordinary-materialization-container-batch-item.js';
import { failActionProducedPersistence as fail } from
  './action-produced-persistence-boundary.js';

export function actionProducedPreparedOrdinaryRows(input, requested) {
  if (input.prepared_ordinary_plan == null) return new Map();
  let plan;
  try {
    plan = createOrdinaryMaterializationAtomicWritePlan(
      input.prepared_ordinary_plan);
  } catch { fail('ACTION_PRODUCED_PREPARED_ITEM_INVALID'); }
  if (plan.schema !== 'ordinary_container_contents_atomic_write_plan_v2'
      || plan.party_id !== input.party_id
      || plan.expected_versions.party_state_version
        !== input.expected_party_state_version) {
    fail('ACTION_PRODUCED_PREPARED_ITEM_INVALID');
  }
  const byId = new Map();
  for (const item of plan.items) {
    if (!requested.includes(item.item_id)) continue;
    const evidence = item.item_proposal.property_placement_evidence;
    const provenance = item.runtime_mechanics_snapshot.provenance;
    if (evidence.owner_controller_ref !== input.actor_ref
        || provenance.root_turn_id !== input.root_turn_id
        || !Number.isSafeInteger(provenance.step_index)
        || provenance.step_index >= input.step_index
        || !plan.container_transition.revealed_refs.includes(item.item_id)) {
      fail('ACTION_PRODUCED_ITEM_ACCESS_DENIED');
    }
    byId.set(item.item_id, {
      row: preparedRow(item, input),
      preparedOrdinary: {
        schema: 'action_production_prepared_ordinary_pin_v1',
        request_identity: plan.request_identity,
        write_plan_digest: plan.write_plan_digest,
        root_turn_id: provenance.root_turn_id,
        step_index: provenance.step_index
      }
    });
  }
  return byId;
}

function preparedRow(item, input) {
  return {
    item_id: item.item_id, run_id: null, template_id: null,
    profile_id: null, category_id: null, quantity: 1,
    condition_state: item.condition_state,
    legal_status: 'ordinary_container_content',
    state: ordinaryContainerRuntimeItemState(item, input.change_set_id),
    state_version: 1, anchor_id: null, container_id: item.container_id,
    holder_npc_id: null, holder_character_id: null,
    physical_position: null, equipment_slot_category_id: null,
    attached_item_id: null, ownership_id: `ownership:${item.item_id}`,
    owner_npc_id: null, owner_character_id: input.actor_ref,
    owner_party: false, controller_npc_id: null,
    controller_character_id: input.actor_ref, claim_state: 'owned'
  };
}
