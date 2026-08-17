import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../errors.js';
import {
  assertTracePhase2ExecutionBinding
} from './lower-dvina-trace-phase-2-binding.js';
import {
  assertBlueWoolPickupContract
} from './lower-dvina-trace-phase-2-pickup-contract.js';

export const TRACE_PHASE_2_IDS = Object.freeze({
  option: 'inspect_wreck_in_detail',
  activity: 'trace_ld_v1_activity_detailed_wreck_inspection',
  check: 'trace_ld_v1_check_detailed_wreck_inspection',
  bodyEffect: 'trace_ld_v1_body_wreck_inspection_15m',
  blueWool: 'trace_ld_v1_item_blue_wool_fragment',
  blueWoolSlot: 'trace_ld_v1_slot_wreck_willow_branch'
});

export function resolveTracePhase2Contracts({
  state,
  bundle,
  phase2Bundle
}) {
  const ids = TRACE_PHASE_2_IDS;
  const source = bundle.activity_check_consequence_profiles;
  const activity = exactRecord(
    source.activity_profiles,
    'profile_id',
    ids.activity
  );
  const check = exactRecord(
    source.check_profiles,
    'check_id',
    ids.check
  );
  const bodyEffect = exactRecord(
    bundle.body_environment_profiles.effect_profiles,
    'effect_profile_id',
    ids.bodyEffect
  );
  const accessPolicy = exactRecord(
    bundle.location_access_policies.access_policies,
    'policy_id',
    activity.preconditions.access_policy_ref
  );
  const item = exactRecord(
    bundle.item_container_set.item_templates,
    'item_template_id',
    ids.blueWool
  );
  const placement = exactRecord(
    bundle.item_container_set.placement_slots,
    'placement_slot_id',
    ids.blueWoolSlot
  );
  const pickupTransition = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].includes(
    bundle.definition_revision
  )
    ? exactRecord(
        bundle.item_container_set.transition_templates,
        'transition_template_id',
        'trace_ld_v1_transition_blue_wool_pickup'
      )
    : null;
  const inventoryProfile = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].includes(
    bundle.definition_revision
  )
    ? exactRecord(
        bundle.item_container_set.item_inventory_profiles,
        'inventory_profile_id',
        item.inventory_profile_ref
      )
    : null;
  const cluePlacement =
    phase2Bundle.binding.clue_placement_contract;
  const capacityContract = exactRecord(
    bundle.location_capacity_contracts.capacity_contracts,
    'contract_id',
    cluePlacement?.g5_anchor_binding?.capacity_contract_ref
  );
  assertSelection(state, 'activities', ids.activity, activity);
  assertSelection(state, 'checks', ids.check, check);
  assertSelection(state, 'items', ids.blueWool, item);
  assertSelection(
    state,
    'clue_placements',
    ids.blueWoolSlot,
    placement
  );
  assertPolicySetPin(
    state,
    'location_access_policies',
    bundle.location_access_policies
  );
  assertPolicySetPin(
    state,
    'body_environment_profiles',
    bundle.body_environment_profiles
  );
  assertExactBodyEffect(bodyEffect, bundle.body_environment_profiles);
  assertTracePhase2ExecutionBinding({
    activity,
    check,
    bodyEffect,
    item,
    placement,
    capacityContract,
    phase2Bundle
  });
  if (activity.semantic_option_ids.length !== 1
      || activity.semantic_option_ids[0] !== ids.option
      || activity.check_ref !== ids.check
      || item.placement_slot_ref !== ids.blueWoolSlot
      || placement.location_ref
        !== activity.preconditions.location_ref
      || accessPolicy.location_ref
        !== activity.preconditions.location_ref
      || accessPolicy.hidden_or_open_state !== 'open'
      || accessPolicy.unmaterialized_access !== 'forbidden') {
    throw dataGap('TRACE_PHASE_2_APPROVED_CHAIN_INVALID');
  }
  if ([9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].includes(bundle.definition_revision)) {
  assertBlueWoolPickupContract({
    item,
    placement,
    pickupTransition,
    inventoryProfile,
    activity,
    check,
    fail: dataGap
  });
  }
  const activityRecord = selectionRecord(
    state,
    'activities',
    ids.activity
  );
  return {
    activity,
    accessPolicy,
    check,
    bodyEffect,
    bodyApplicationVariants:
      structuredClone(phase2Bundle.binding.body_application_variants),
    phase2BindingPin: {
      id: phase2Bundle.binding.binding_id,
      version: phase2Bundle.binding.revision,
      digest: phase2Bundle.binding_digest
    },
    locationRef: activity.preconditions.location_ref,
    activityPin: {
      id: ids.activity,
      version: activity.version,
      digest: activityRecord.record_digest
    },
    bodyEnvironmentPin: {
      id: bundle.body_environment_profiles.set_id,
      version: bundle.body_environment_profiles.revision,
      digest: canonicalDigest(bundle.body_environment_profiles)
    },
    cluePlacementContract: structuredClone(cluePlacement),
    blueWoolPickupTransition:
      structuredClone(pickupTransition),
    blueWoolInventoryProfile:
      structuredClone(inventoryProfile),
    blueWoolClue: {
      instance_id: `item:${state.party_id}:blue-wool`,
      template_id: item.item_template_id,
      semantic_category: item.semantic_category,
      property_state:
        structuredClone(item.property_state_template),
      placement: {
        placement_model: cluePlacement.placement_model,
        placement_slot_id: placement.placement_slot_id,
        local_anchor_semantics: placement.local_anchor_semantics,
        location_ref: placement.location_ref,
        anchor_id: state.position.g5_anchor_id,
        capacity_contract_ref:
          cluePlacement.g5_anchor_binding.capacity_contract_ref,
        zone_ref: cluePlacement.g5_anchor_binding.zone_ref,
        item_capacity_class: cluePlacement.item_capacity_class,
        g5_item_capacity_consumed: 0
      },
      causal_basis: item.causal_basis
    },
    evidenceGraph: bundle.clue_evidence_graph_set
  };
}

function assertPolicySetPin(state, key, source) {
  const pin = state.policy_pins?.find((entry) => entry.key === key);
  if (!pin || pin.canonical_digest !== canonicalDigest(source)) {
    throw dataGap('TRACE_PHASE_2_POLICY_SET_PIN_MISMATCH');
  }
}

export function evidenceSupportsFact(contracts, evidenceId, factId) {
  const node = contracts.evidenceGraph.evidence_records
    ?.find((entry) => entry.evidence_id === evidenceId);
  return evidenceId === factId
    || node?.source_fact_refs?.includes(factId) === true;
}

function assertExactBodyEffect(effect, profileSet) {
  const metricKeys = Object.keys(effect.exact_deltas ?? {}).sort();
  const outcomes = effect.condition_outcomes;
  if ('delta_bounds' in effect
      || metricKeys.join(',') !== 'energy,health,satiety'
      || metricKeys.some((metric) =>
        !Number.isInteger(effect.exact_deltas[metric]))
      || effect.selection_policy !== 'fixed_approved_effect'
      || effect.rng_consumption !== 'forbidden'
      || !Array.isArray(outcomes)
      || outcomes.length !== effect.condition_profile_refs.length) {
    throw dataGap('TRACE_PHASE_2_BODY_EFFECT_POLICY_GAP');
  }
  const outcomeRefs = new Set();
  for (const outcome of outcomes) {
    const condition = exactRecord(
      profileSet.condition_profiles,
      'condition_profile_id',
      outcome.condition_profile_ref
    );
    if (outcomeRefs.has(outcome.condition_profile_ref)
        || outcome.from !== condition.state
        || !condition.permitted_transitions.includes(outcome.to)
        || !['persists', 'worsens'].includes(outcome.outcome)) {
      throw dataGap('TRACE_PHASE_2_BODY_CONDITION_TRANSITION_GAP');
    }
    outcomeRefs.add(outcome.condition_profile_ref);
  }
  if (effect.condition_profile_refs.some((ref) => !outcomeRefs.has(ref))) {
    throw dataGap('TRACE_PHASE_2_BODY_CONDITION_TRANSITION_GAP');
  }
}

function assertSelection(state, kind, id, record) {
  const selected = selectionRecord(state, kind, id);
  if (!selected
      || selected.record_digest !== canonicalDigest(record)) {
    throw dataGap('TRACE_PHASE_2_SEALED_SELECTION_MISMATCH');
  }
}

function selectionRecord(state, kind, id) {
  return state.sealed_selections
    .find((group) => group.selection_kind === kind)
    ?.records.find((record) => record.selected_id === id) ?? null;
}

function exactRecord(records, key, id) {
  const found = records.filter((record) => record[key] === id);
  if (found.length !== 1) throw dataGap('TRACE_PHASE_2_RECORD_GAP');
  return found[0];
}

function dataGap(code) {
  return serverError(
    code,
    'The exact party-pinned Phase 2 data chain is incomplete.',
    { status: 409 }
  );
}
