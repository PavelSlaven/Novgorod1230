import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../errors.js';

const IDS = Object.freeze({
  bag: 'trace_ld_v1_container_road_bag',
  packet: 'trace_ld_v1_item_sealed_packet',
  storehouse: 'trace_ld_v1_loc_zhdanko_storehouse',
  camp: 'trace_ld_v1_loc_fishing_camp',
  onisimSlot: 'onisim_boatman'
});

export function resolveTracePhase9Contracts({ state, bundle,
  conversationBindings }) {
  const binding = bundle?.phase_9_bindings;
  if (![17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
    32].includes(bundle?.definition_revision)
      || binding?.scenario_definition_revision !== 17
      || binding?.fallback_policy !== 'forbidden') gap();
  const profiles = bundle.activity_check_consequence_profiles;
  const policies = bundle.npc_decision_schedule_policies;
  const property = binding.property_recovery;
  const bag = exact(state.containers, 'template_id', property.bag_template_ref);
  const packet = exact(state.items, 'template_id', property.packet_template_ref);
  const onisim = exact(state.npcs, 'participant_slot_ref',
    binding.onisim_testimony.target_slot_ref);
  const activities = Object.freeze({
    inspect: exact(profiles.activity_profiles, 'profile_id',
      property.activity_profile_ref),
    return: exact(profiles.activity_profiles, 'profile_id',
      binding.return_movement.activity_profile_ref),
    disposition: exact(profiles.activity_profiles, 'profile_id',
      binding.temporary_disposition.activity_profile_ref)
  });
  const transitions = Object.freeze({
    bag: exact(policies.property_transition_profiles,
      'transition_profile_id', property.bag_recovery_transition_ref),
    open: exact(policies.property_transition_profiles,
      'transition_profile_id', property.bag_open_transition_ref),
    packet: property.packet_recovery_transition_refs.map((id) =>
      exact(policies.property_transition_profiles, 'transition_profile_id', id))
  });
  const route = exact(bundle.movement_bindings.route_bindings, 'route_id',
    binding.return_movement.route_ref);
  const sourceEndpoint = exact(bundle.location_topology_set.endpoints,
    'endpoint_id', route.source_endpoint);
  const destinationEndpoint = exact(bundle.location_topology_set.endpoints,
    'endpoint_id', route.destination_endpoint);
  const access = exact(bundle.location_access_policies.access_policies,
    'policy_id', 'trace_ld_v1_access_zhdanko_storehouse');
  const capacity = exact(bundle.location_capacity_contracts.capacity_contracts,
    'contract_id', 'trace_ld_v1_capacity_zhdanko_storehouse');
  const campScene = (state.prepared_scenes ?? []).find(
    ({ location_profile_ref: id }) => id === IDS.camp)
    ?? (state.first_entry_preparation?.scene?.location_profile_ref === IDS.camp
      ? state.first_entry_preparation.scene : null);
  const historicalDisposition = exact(profiles.temporary_disposition_contracts,
    'contract_id', binding.temporary_disposition.contract_ref);
  const disposition = binding.temporary_disposition.approved_contract;
  const promisePolicy = bundle.promise_policy;
  const statementEffect = exact(policies.statement_effect_contracts,
    'statement_effect_contract_id',
    binding.onisim_testimony.statement_effect_contract_ref);
  const testimonyTemplate = exact(bundle.knowledge_lie_memory_rules
    .statement_templates, 'statement_template_id',
  binding.onisim_testimony.statement_template_ref);
  const authoredClaim = binding.onisim_testimony.authored_claim_contract;
  if (bag.template_id !== IDS.bag || packet.template_id !== IDS.packet
      || route.terminal_position_outcome !== IDS.camp
      || sourceEndpoint.location_profile_id !== IDS.storehouse
      || destinationEndpoint.location_profile_id !== IDS.camp
      || !campScene?.anchor?.instance_id || !campScene?.node?.instance_id
      || onisim.participant_slot_ref !== IDS.onisimSlot
      || transitions.bag.owner !== '@rus/items-property'
      || transitions.open.owner !== '@rus/items-property'
      || transitions.packet.some((record) =>
        record.owner !== '@rus/items-property')
      || activities.return.progress_policy !== 'movement_route_owner'
      || activities.inspect.no_check_required !== true
      || activities.disposition.temporary_disposition_contract_ref
        !== disposition.contract_id
      || disposition.supersedes_contract_ref?.contract_id
        !== historicalDisposition.contract_id
      || disposition.supersedes_contract_ref?.version
        !== historicalDisposition.version
      || disposition.version !== historicalDisposition.version + 1
      || historicalDisposition.owner !== '@rus/turn'
      || disposition.owner !== '@rus/social-law'
      || disposition.selection_contract?.selection_source
        !== 'raw_intent_to_closed_exact_option_id_per_dimension'
      || disposition.selection_contract?.selected_option_cardinality
        !== 'exactly_one_per_dimension'
      || binding.owner_contracts?.disposition_applicability
        !== '@rus/social-law'
      || binding.owner_contracts?.disposition_selection !== '@rus/turn'
      || binding.temporary_disposition.promise_policy_ref
        !== promisePolicy?.policy_id
      || promisePolicy?.owner !== '@rus/social-law'
      || statementEffect.forbidden_write_targets?.includes('objective_truth')
        !== true
      || testimonyTemplate.speaker_ref !== IDS.onisimSlot
      || testimonyTemplate.statement_template_id
        !== statementEffect.statement_template_ref
      || authoredClaim?.schema !== 'authored_statement_claim_contract_v1'
      || authoredClaim.statement_template_ref
        !== testimonyTemplate.statement_template_id
      || authoredClaim.claim_id
        !== testimonyTemplate.assertion?.assertion_id
      || authoredClaim.claim?.claim_id !== authoredClaim.claim_id
      || authoredClaim.claim?.source_knowledge_refs?.length !== 1
      || authoredClaim.claim.source_knowledge_refs[0]?.entity_kind
        !== 'knowledge_scope'
      || authoredClaim.claim.source_knowledge_refs[0]?.entity_id
        !== binding.onisim_testimony.knowledge_scope_ref
      || typeof authoredClaim.utterance_text !== 'string'
      || authoredClaim.utterance_text.trim() !== authoredClaim.utterance_text
      || authoredClaim.utterance_text.length === 0
      || bundle.clue_evidence_graph_set?.clue_evidence_graph_set_id
        !== binding.evidence_resolution.graph_ref
      || conversationBindings == null
      || binding.onisim_testimony.signal_mapping?.target_npc_ref
        !== IDS.onisimSlot) gap();
  const activityPins = [activities.inspect, activities.return,
    activities.disposition, binding.onisim_testimony.activity_profile]
    .map((profile) => ({ id: profile.profile_id, version: profile.version,
      digest: canonicalDigest(profile) }));
  const artifactPins = [bundle.artifact_pins.phase_9_bindings,
    bundle.artifact_pins.turn_step_bindings,
    bundle.artifact_pins.promise_policy].map((pin) => ({ id: pin.key,
      revision: pin.revision, digest: `sha256:${pin.digest}`,
      canonical_digest: pin.canonical_digest }));
  return Object.freeze({ binding, bag: structuredClone(bag),
    packet: structuredClone(packet), onisim: { ...structuredClone(onisim),
      ref: IDS.onisimSlot },
    activities, transitions, route: structuredClone(route),
    disposition: structuredClone(disposition),
    promisePolicy: structuredClone(promisePolicy),
    evidenceGraph: structuredClone(bundle.clue_evidence_graph_set),
    sourceEndpoint, destinationEndpoint, access, capacity,
    campAnchor: campScene.anchor.instance_id,
    campNode: campScene.node.instance_id,
    conversationBindings: structuredClone(conversationBindings),
    statementEffect: structuredClone(statementEffect),
    testimonyTemplate: structuredClone(testimonyTemplate),
    ids: IDS,
    activityPins, bindingPin: artifactPins[0],
    pins: [...artifactPins, ...activityPins],
    digest: canonicalDigest({ binding, bag: bag.container_id,
      packet: packet.item_id, route: route.route_id,
      onisim: onisim.instance_id }) });
}

function exact(records, field, value) {
  const found = (records ?? []).filter((record) => record?.[field] === value);
  if (found.length !== 1) gap();
  return found[0];
}
function gap() {
  throw serverError('TRACE_PHASE_9_CONTRACT_GAP',
    'Phase 9 requires exact revision-17 approved bindings.', { status: 409 });
}
