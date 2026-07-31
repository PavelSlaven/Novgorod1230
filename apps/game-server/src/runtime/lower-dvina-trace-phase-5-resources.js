import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../errors.js';

export const TRACE_PHASE_5_RESOURCE_IDS = Object.freeze({
  net: 'trace_ld_v1_item_fishing_net',
  poles: 'trace_ld_v1_item_carry_poles',
  water: 'trace_ld_v1_item_eremey_drinking_water_vessel',
  rope: 'trace_ld_v1_item_ratsha_binding_rope'
});

export function resolveTracePhase5ParticipatingFisher(state) {
  const promise = state.promise_instances?.[0];
  const boundId = promise?.witness_slot_bindings
    ?.trace_ld_v1_audience_slot_participating_fisher;
  const matches = (state.npcs ?? []).filter((npc) =>
    npc.instance_id === boundId
      && /^background_fisher_[12]$/u.test(npc.participant_slot_ref)
  );
  const selection = (state.sealed_selections ?? []).filter(
    ({ selection_kind: kind }) => kind === 'audience'
  );
  const selectedSlot = selection[0]?.records?.[0]?.selected_id;
  if (!boundId || matches.length !== 1 || selection.length !== 1
      || selection[0].records?.length !== 1
      || selectedSlot !== matches[0].participant_slot_ref
      || !(promise.witness_actor_ids ?? []).includes(boundId)) {
    gap('TRACE_PHASE_5_PARTICIPATING_FISHER_MISSING');
  }
  return structuredClone(matches[0]);
}

export function buildTracePhase5ArrivalResources({ state, contracts }) {
  const binding = contracts.resourceArrivalBinding;
  const committedCarrier = contracts.actors.participating_fisher;
  const carrier = (state.npcs ?? []).find(
    ({ instance_id: id }) => id === committedCarrier?.instance_id
  );
  const eremey = contracts.actors.eremey_fisher;
  const backgroundOne = contracts.actors.background_fisher_1;
  const runId = state.materialization_trace?.run_id;
  if (!runId || !binding || !carrier?.instance_id
      || carrier.participant_slot_ref
        !== committedCarrier.participant_slot_ref
      || carrier.anchor_id !== contracts.anchors.shed
      || binding.arrival_location_ref !== contracts.ids.shed) {
    gap('TRACE_PHASE_5_RESOURCE_ARRIVAL_PRECONDITION_FAILED');
  }
  const byTemplate = new Map(
    binding.arrival_item_bindings.map((entry) => [entry.item_template_ref, entry])
  );
  const definitions = [
    [TRACE_PHASE_5_RESOURCE_IDS.net, eremey, carrier,
      contracts.itemTemplates.net, contracts.resourceInventoryProfiles.net],
    [TRACE_PHASE_5_RESOURCE_IDS.poles, backgroundOne, carrier,
      contracts.itemTemplates.poles, contracts.resourceInventoryProfiles.poles]
  ];
  const items = definitions.map(([templateId, owner, holder, template,
    inventoryProfile]) =>
    arrivalItem({ state, runId, binding: byTemplate.get(templateId), template,
      inventoryProfile, owner, holder })
  );
  const waterBinding = binding.eremey_water_vessel_initial_binding;
  items.push(arrivalItem({ state, runId, binding: waterBinding,
    template: contracts.itemTemplates.water, owner: eremey, holder: eremey,
    inventoryProfile: contracts.resourceInventoryProfiles.water }));
  if (new Set(items.map(({ item_id: id }) => id)).size !== items.length) {
    gap('TRACE_PHASE_5_RESOURCE_INSTANCE_AMBIGUOUS');
  }
  return Object.freeze(items);
}

export function assertTracePhase5ArrivalResources(state, contracts) {
  const expected = buildTracePhase5ArrivalResources({ state, contracts });
  const actual = (state.items ?? []).filter(({ template_id: id }) =>
    Object.values(TRACE_PHASE_5_RESOURCE_IDS).includes(id)
      && id !== TRACE_PHASE_5_RESOURCE_IDS.rope
  );
  for (const item of expected) {
    const matches = actual.filter(({ template_id: id }) => id === item.template_id);
    if (matches.length !== 1 || canonicalDigest(matches[0]) !== canonicalDigest(item)) {
      gap('TRACE_PHASE_5_RESOURCE_ARRIVAL_STATE_INVALID');
    }
  }
  return expected;
}

function arrivalItem({ state, runId, binding, template, inventoryProfile = null,
  owner, holder }) {
  if (!binding || binding.item_template_ref !== template?.item_template_id
      || binding.owner_ref !== owner?.participant_slot_ref
      || !['resolved_participating_fisher', owner.participant_slot_ref]
        .includes(binding.holder_ref)
      || binding.controller_ref !== binding.holder_ref
      || !binding.persistence_profile_ref
      || binding.physical_position == null
      || binding.accessibility == null
      || binding.condition_state == null
      || binding.use_state == null
      || binding.location_policy == null) {
    gap('TRACE_PHASE_5_RESOURCE_ARRIVAL_BINDING_INVALID');
  }
  if (inventoryProfile != null
      && !approvedInventoryProfile({ binding, template,
        inventoryProfile })) {
    gap('TRACE_PHASE_5_RESOURCE_INVENTORY_PROFILE_INVALID');
  }
  const itemId = deterministicResourceInstanceId(
    state.party_id,
    runId,
    template.item_template_id
  );
  return {
    item_id: itemId,
    template_id: template.item_template_id,
    profile_id: binding.persistence_profile_ref,
    category_id: template.semantic_category,
    quantity: 1,
    condition_state: binding.condition_state,
    legal_status: 'owned',
    placement: {
      anchor_id: null,
      container_id: null,
      holder_npc_id: holder.instance_id,
      holder_character_id: null,
      physical_position: binding.physical_position,
      equipment_slot_category_id: null
    },
    ownership: {
      ownership_id: `ownership:${itemId}`,
      owner_npc_id: owner.instance_id,
      owner_character_id: null,
      owner_external_ref: null,
      owner_party: false,
      controller_npc_id: holder.instance_id,
      controller_character_id: null,
      claim_state: 'established'
    },
    state: {
      semantic_category: template.semantic_category,
      accessibility: binding.accessibility,
      use_state: binding.use_state,
      ...(binding.water_portions_remaining == null ? {} : {
        water_portions_remaining: binding.water_portions_remaining
      }),
      ...(inventoryProfile == null ? {} : {
        inventory_profile_snapshot: structuredClone(inventoryProfile)
      }),
      location_policy: binding.location_policy,
      arrival_binding_digest: canonicalDigest(binding),
      causal_basis: template.causal_basis
    }
  };
}

function approvedInventoryProfile({ binding, template, inventoryProfile }) {
  const exactByTemplate = {
    [TRACE_PHASE_5_RESOURCE_IDS.net]: [2500, 'long', 1],
    [TRACE_PHASE_5_RESOURCE_IDS.poles]: [2500, 'long', 1],
    [TRACE_PHASE_5_RESOURCE_IDS.water]: [100, 'compact', 0]
  };
  const exact = exactByTemplate[template.item_template_id];
  return exact != null
    && binding.persistence_profile_ref === inventoryProfile.inventory_profile_id
    && inventoryProfile.item_template_ref === template.item_template_id
    && inventoryProfile.mass_grams === exact[0]
    && inventoryProfile.carry_form === exact[1]
    && inventoryProfile.external_hand_cost === exact[2]
    && inventoryProfile.status === 'approved';
}

function deterministicResourceInstanceId(partyId, runId, itemTemplateId) {
  return `item_${canonicalDigest([
    partyId,
    runId,
    'item',
    itemTemplateId,
    0
  ]).slice(0, 24)}`;
}

function gap(code) {
  throw serverError(code, 'The exact Phase 5 resource carrier binding is incomplete.',
    { status: 409 });
}
