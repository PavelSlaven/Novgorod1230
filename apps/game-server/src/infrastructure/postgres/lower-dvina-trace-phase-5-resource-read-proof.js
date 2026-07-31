import { canonicalDigest } from '@rus/materialization';
import { phase2IntegrityError } from './lower-dvina-trace-phase-2-read.js';

export function phase5Actor(payload, slot) {
  const matches = payload.npcs?.filter(
    ({ participant_slot_ref: ref }) => ref === slot
  ) ?? [];
  if (matches.length !== 1) fail();
  return matches[0];
}

export function phase5BandageItem(payload) {
  return exactSnapshotItem(payload, 'trace_ld_v1_item_bandage_cloth');
}

export function exactSnapshotItem(payload, templateId) {
  const matches = payload.items?.filter(
    ({ template_id: id }) => id === templateId
  ) ?? [];
  if (matches.length !== 1) fail();
  return matches[0];
}

export function phase5ParticipatingFisher(payload) {
  const id = payload.promise_instances?.[0]?.witness_slot_bindings
    ?.trace_ld_v1_audience_slot_participating_fisher;
  const matches = payload.npcs?.filter((npc) => npc.instance_id === id
    && /^background_fisher_[12]$/u.test(npc.participant_slot_ref)) ?? [];
  if (matches.length !== 1) fail();
  return matches[0];
}

export function assertPhase5TreatmentResources({ payload, treatmentResources,
  releaseTransition, npcTransitions, history, onisim }) {
  const templateIds = [
    'trace_ld_v1_item_fishing_net',
    'trace_ld_v1_item_carry_poles',
    'trace_ld_v1_item_eremey_drinking_water_vessel'
  ];
  const expected = templateIds.map((templateId) =>
    exactSnapshotItem(payload, templateId)
  ).sort((left, right) => left.template_id.localeCompare(right.template_id));
  const actual = treatmentResources.rows.map((entry) => ({
    item_id: entry.item_id,
    template_id: entry.template_id,
    profile_id: entry.profile_id,
    category_id: entry.category_id,
    quantity: Number(entry.quantity),
    condition_state: entry.condition_state,
    legal_status: entry.legal_status,
    placement: {
      anchor_id: entry.anchor_id,
      container_id: entry.container_id,
      holder_npc_id: entry.holder_npc_id,
      holder_character_id: entry.holder_character_id,
      physical_position: entry.physical_position,
      equipment_slot_category_id: entry.equipment_slot_category_id
    },
    ownership: {
      ownership_id: entry.ownership_id,
      owner_npc_id: entry.owner_npc_id,
      owner_character_id: entry.owner_character_id,
      owner_external_ref: entry.owner_external_ref,
      owner_party: entry.owner_party,
      controller_npc_id: entry.controller_npc_id,
      controller_character_id: entry.controller_character_id,
      claim_state: entry.claim_state
    },
    state: entry.state
  }));
  if (canonicalDigest(actual) !== canonicalDigest(expected)
      || onisim.rowCount !== 1
      || canonicalDigest(onisim.rows[0].machine_state)
        !== canonicalDigest(phase5Actor(payload, 'onisim_boatman').machine_state)) {
    fail();
  }
  const prepare = history.find(({ treatment }) =>
    treatment.completed_stage_ids?.includes('prepare_cloth_and_expose_injury')
  );
  if (!prepare) {
    if (releaseTransition.rowCount !== 0) fail();
    return;
  }
  if (releaseTransition.rowCount === 1) {
    const transition = releaseTransition.rows[0];
    if (transition.npc_id
          !== phase5Actor(payload, 'onisim_boatman').instance_id
        || transition.transition_kind !== 'onisim_released_from_binding'
        || transition.change_set_id !== prepare.change_set_id
        || transition.trace?.transition_profile_id
          !== 'trace_ld_v1_property_ratsha_binding_rope_released_to_eremey'
        || transition.trace?.water_transition_profile_id
          !== 'trace_ld_v1_property_eremey_water_vessel_used_for_onisim') {
      fail();
    }
    return;
  }
  const terminal = npcTransitions.rows[0];
  if (releaseTransition.rowCount !== 0
      || npcTransitions.rowCount !== 1
      || terminal.change_set_id !== prepare.change_set_id
      || terminal.trace?.stage_transition_bundle?.transition_kind
        !== 'onisim_released_from_binding'
      || terminal.trace.stage_transition_bundle.transition_profile_id
        !== 'trace_ld_v1_property_ratsha_binding_rope_released_to_eremey'
      || terminal.trace.stage_transition_bundle.water_transition_profile_id
        !== 'trace_ld_v1_property_eremey_water_vessel_used_for_onisim') {
    fail();
  }
}

export function assertPhase5TreatmentKnowledge({ knowledge, history, final,
  executionId }) {
  const factIds = history.flatMap(
    ({ treatment }) => treatment.stage_completion_facts ?? []
  );
  if (final) factIds.push(final.common_completion_fact, final.outcome_fact);
  const expected = [...new Set(factIds)].sort().map((fact_id) => ({
    fact_id,
    knowledge_state: 'known_from_committed_source',
    evidence: [executionId]
  }));
  if (canonicalDigest(knowledge.rows) !== canonicalDigest(expected)) fail();
}

function fail() { throw phase2IntegrityError(); }
