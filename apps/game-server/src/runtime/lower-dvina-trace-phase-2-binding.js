import { canonicalDigest } from '@rus/materialization';
import { serverError } from '../errors.js';

export function assertTracePhase2ExecutionBinding({
  activity,
  check,
  bodyEffect,
  item,
  placement,
  capacityContract,
  phase2Bundle
}) {
  const binding = phase2Bundle?.binding;
  const activityRef = binding?.activity_ref;
  const checkRef = binding?.check_ref;
  const bodyRef = binding?.body_effect_ref;
  const variants = binding?.body_application_variants;
  const cluePlacement = binding?.clue_placement_contract;
  const anchorBinding = cluePlacement?.g5_anchor_binding;
  const zone = capacityContract?.zones?.find(
    ({ zone_id: zoneId }) => zoneId === anchorBinding?.zone_ref
  );
  const revision = phase2Bundle?.manifest?.scenario_definition_revision;
  const initialCold = revision >= 27 ? {
    from: 'mild_shivering', to: 'mild_shivering', outcome: 'worsens'
  } : { from: 'cold_with_possible_shivering', to: 'mild_shivering', outcome: 'worsens' };
  if (!(revision === 7
        || Number.isSafeInteger(revision) && revision >= 27)
      || activityRef?.id !== activity.profile_id
      || activityRef?.version !== activity.version
      || activityRef?.record_digest !== canonicalDigest(activity)
      || checkRef?.id !== check.check_id
      || checkRef?.version !== check.version
      || checkRef?.record_digest !== canonicalDigest(check)
      || bodyRef?.id !== bodyEffect.effect_profile_id
      || bodyRef?.record_digest !== canonicalDigest(bodyEffect)
      || bodyRef?.profile_set_id
        !== 'trace_ld_v1_body_environment_profiles'
      || bodyRef?.profile_set_revision !== (revision >= 29 ? 8 : revision >= 27 ? 7 : 4)
      || bodyRef?.profile_set_digest
        !== phase2Bundle.source_digests?.body_environment_profiles
      || binding?.attempt_policy?.new_attempt_elapsed_minutes
        !== activity.duration_minutes
      || binding?.attempt_policy?.new_attempt_rng
        !== 'new_code_owned_d20'
      || binding?.attempt_policy?.clock_writes_per_attempt !== 1
      || binding?.evidence_repeat_policy
        ?.repeat_discovery_creates_duplicate !== false
      || binding?.evidence_repeat_policy
        ?.existing_item_instance_is_reused !== true
      || binding?.evidence_repeat_policy
        ?.existing_observation_and_knowledge_records_are_not_duplicated
        !== true
      || cluePlacement?.item_template_ref !== item.item_template_id
      || cluePlacement?.item_capacity_class !== 'evidence'
      || cluePlacement?.placement_model
        !== 'local_evidence_slot_within_g5_anchor'
      || cluePlacement?.placement_slot_ref
        !== placement.placement_slot_id
      || cluePlacement?.location_ref !== placement.location_ref
      || cluePlacement?.local_anchor_semantics
        !== placement.local_anchor_semantics
      || anchorBinding?.template_id
        !== 'trace_ld_v1_g5_anchor_wreck_open_shore_v1'
      || anchorBinding?.slot_key !== 'open_shore'
      || anchorBinding?.capacity_contract_ref
        !== capacityContract.contract_id
      || anchorBinding?.zone_ref !== 'open_shore'
      || anchorBinding?.item_capacity_application
        !== 'not_consumed_by_local_evidence_slot'
      || anchorBinding?.expected_item_capacity !== 0
      || cluePlacement?.placement_slot_capacity !== 1
      || cluePlacement?.existing_instance_policy
        !== 'reuse_exact_item_instance'
      || cluePlacement?.commit_recheck_policy
        !== 'exact_anchor_scene_zone_slot_and_unique_item'
      || !zone?.item_classes?.includes('evidence')
      || !Array.isArray(variants)
      || variants.length !== 2) {
    fail('TRACE_PHASE_2_EXECUTION_BINDING_MISMATCH');
  }
  const initial = exactVariant(variants, 'initial_cold_exposure');
  const repeated = exactVariant(variants, 'repeated_mild_shivering');
  assertBodyVariant(initial, {
    prior: 'not_committed_for_actor',
    coldFrom: initialCold.from,
    coldTo: initialCold.to,
    coldOutcome: initialCold.outcome
  });
  assertBodyVariant(repeated, {
    prior: 'committed_for_actor',
    coldFrom: 'mild_shivering',
    coldTo: 'mild_shivering',
    coldOutcome: 'persists'
  });
  if (canonicalDigest(initial.exact_deltas)
        !== canonicalDigest(bodyEffect.exact_deltas)
      || canonicalDigest(initial.condition_outcomes)
        !== canonicalDigest(bodyEffect.condition_outcomes)) {
    fail('TRACE_PHASE_2_INITIAL_BODY_VARIANT_MISMATCH');
  }
}

function assertBodyVariant(variant, {
  prior,
  coldFrom,
  coldTo,
  coldOutcome
}) {
  const wet = variant.condition_outcomes?.find(
    (outcome) =>
      outcome.condition_profile_ref
        === 'trace_ld_v1_condition_wet_clothing'
  );
  const cold = variant.condition_outcomes?.find(
    (outcome) =>
      outcome.condition_profile_ref
        === 'trace_ld_v1_condition_cold_shivering'
  );
  if (variant.required_prior_effect_state !== prior
      || variant.selection_policy !== 'exact_committed_condition_state'
      || variant.rng_consumption !== 'forbidden'
      || canonicalDigest(variant.exact_deltas) !== canonicalDigest({
        health: 0,
        satiety: 0,
        energy: -1
      })
      || variant.condition_outcomes?.length !== 2
      || wet?.from !== 'wet'
      || wet?.to !== 'wet'
      || wet?.outcome !== 'persists'
      || cold?.from !== coldFrom
      || cold?.to !== coldTo
      || cold?.outcome !== coldOutcome) {
    fail('TRACE_PHASE_2_BODY_VARIANT_MISMATCH');
  }
}

function exactVariant(variants, id) {
  const found = variants.filter(({ variant_id: variantId }) =>
    variantId === id);
  if (found.length !== 1) {
    fail('TRACE_PHASE_2_BODY_VARIANT_MISMATCH');
  }
  return found[0];
}

function fail(code) {
  throw serverError(
    code,
    'The exact Phase 2 execution binding is incomplete.',
    { status: 409 }
  );
}
