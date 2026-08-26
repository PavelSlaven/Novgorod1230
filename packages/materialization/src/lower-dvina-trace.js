import { deepFreeze } from '@rus/kernel';
import { computeMaterializationEnvelopeDigest } from '@rus/contracts';
import {
  canonicalDigest,
  createRandomSource,
  deriveSeed,
  deterministicInstanceId,
  MATERIALIZER_VERSION,
  RNG_VERSION
} from './core.js';
import { buildLowerDvinaTracePhase4Promise } from './lower-dvina-trace-phase-4-promise.js';
import {
  assertLowerDvinaTraceBundle,
  assertLowerDvinaTraceRequest,
  assertLowerDvinaTraceSemanticClosure,
  assertLowerDvinaTraceTimestamp,
  failLowerDvinaTraceMaterialization,
  LOWER_DVINA_TRACE_ACCEPTANCE_SEED_CONTEXT,
  LOWER_DVINA_TRACE_DEFINITION_REVISION,
  LOWER_DVINA_TRACE_M2_DEFINITION_REVISION,
  LOWER_DVINA_TRACE_M3_DEFINITION_REVISION,
  LOWER_DVINA_TRACE_SCENARIO_ID,
  lowerDvinaTraceRequestIdentity
} from './lower-dvina-trace-contract.js';
import { assertLowerDvinaTraceSelectionClosure } from './lower-dvina-trace-selection-closure.js';
import {
  materializeLowerDvinaTracePreparedCamp,
  materializeLowerDvinaTracePreparedDryingShed,
  materializeLowerDvinaTracePreparedStorehouse
} from './lower-dvina-trace-phase-3.js';
import {
  buildLowerDvinaTraceSealedSelections
} from './lower-dvina-trace-sealed-selections.js';
import { buildLowerDvinaTracePhase5InitialBandage } from './lower-dvina-trace-phase-5-initial-item.js';
import {
  materializeRevision19ActorAppearances
} from './lower-dvina-trace-appearance.js';
import { buildLowerDvinaTracePlayerDossier } from
  './lower-dvina-trace-player-dossier.js';
import { materializeLocalFireActivation } from
  './lower-dvina-trace-local-fire.js';

export {
  assertLowerDvinaTraceSelectionClosure,
  LOWER_DVINA_TRACE_ACCEPTANCE_SEED_CONTEXT,
  LOWER_DVINA_TRACE_DEFINITION_REVISION,
  LOWER_DVINA_TRACE_M2_DEFINITION_REVISION,
  LOWER_DVINA_TRACE_M3_DEFINITION_REVISION,
  LOWER_DVINA_TRACE_SCENARIO_ID
};

const fail = failLowerDvinaTraceMaterialization;

export function materializeLowerDvinaTracePartyInstance(input) {
  assertLowerDvinaTraceRequest(input);
  const bundle = assertLowerDvinaTraceBundle(input.scenario_bundle, input);
  const seedContext = {
    party_id: input.party_id,
    scenario_id: input.scenario_id,
    scenario_definition_revision: input.scenario_definition_revision,
    scenario_manifest_digest: input.scenario_manifest_digest,
    world_revision_id: input.world_revision_id,
    world_catalog_digest: input.world_catalog_digest,
    trigger: input.trigger,
    occurrence: input.occurrence,
    materializer_version: input.materializer_version,
    rng_algorithm_id: input.rng_algorithm_id,
    seed_context: input.seed_context
  };
  const seed = deriveSeed(seedContext);
  const random = createRandomSource({ seed: seed.uint32, version: input.rng_algorithm_id });
  const runId = `trace_ld_v1_${seed.digest.slice(0, 24)}`;
  const choices = [];

  const name = choose({
    key: 'player_name',
    setRef: bundle.player_profile_set.profile_set_id,
    candidates: bundle.player_profile_set.name_candidates,
    idOf: (value) => value.id,
    random,
    choices
  });
  const profileRef = choose({
    key: 'player_profile',
    setRef: bundle.player_profile_set.profile_set_id,
    candidates: bundle.player_profile_set.profile_candidates,
    idOf: (value) => value.id,
    random,
    choices
  });
  if (profileRef.id !== bundle.player_profile.profile_id
    || profileRef.revision !== bundle.player_profile.revision
    || profileRef.digest !== bundle.artifact_pins.player_profile.digest) {
    fail('TRACE_PLAYER_PROFILE_REF_INVALID', 'Selected player profile does not resolve to the pinned approved profile.');
  }

  const approvedMotives = approved(bundle.hidden_truth_candidate_set.motive_candidates);
  const culprit = choose({
    key: 'hidden_truth_culprit',
    setRef: `${bundle.hidden_truth_candidate_set.hidden_truth_candidate_set_id}:culprit`,
    candidates: [...new Set(approvedMotives.map((value) => value.principal_ref))],
    idOf: String,
    random,
    choices
  });
  const motive = choose({
    key: 'hidden_truth_motive',
    setRef: bundle.hidden_truth_candidate_set.hidden_truth_candidate_set_id,
    candidates: approvedMotives,
    idOf: (value) => value.motive_id,
    random,
    choices
  });
  const sequence = choose({
    key: 'hidden_truth_sequence',
    setRef: bundle.hidden_truth_candidate_set.hidden_truth_candidate_set_id,
    candidates: approved(bundle.hidden_truth_candidate_set.sequence_candidates),
    idOf: (value) => value.hidden_sequence_candidate_id,
    random,
    choices
  });
  if (sequence.motive_ref !== motive.motive_id || motive.principal_ref !== culprit) {
    fail('HIDDEN_TRUTH_INCOMPLETE', 'Hidden sequence does not bind the selected motive.');
  }

  const participantSelections = selectParticipants(
    bundle.participant_profile_set,
    bundle.player_profile,
    bundle.materialization_bindings,
    random,
    choices
  );
  const locationSelections = selectLocations(bundle.location_topology_set, random, choices);
  const wreck = locationSelections.find((value) => value.slot_key === 'trace_ld_v1_loc_wreck_shore');
  if (!wreck) fail('MANDATORY_SLOT_MISSING', 'The wreck-shore start location is mandatory.');
  const accessPolicy = requiredById(
    bundle.location_access_policies.access_policies,
    'resolves_gap_id',
    wreck.location.access_contract_ref.gap_id
  );
  const capacityContract = requiredById(
    bundle.location_capacity_contracts.capacity_contracts,
    'resolves_gap_id',
    wreck.location.capacity_contract_ref.gap_id
  );
  const startZone = requiredById(capacityContract.zones, 'zone_id', capacityContract.decision_anchor);
  const spatialBinding = bundle.materialization_bindings.start_spatial_binding;
  const participatingFisher = choose({
    key: 'audience:participating_fisher',
    setRef: 'trace_ld_v1_audience_slot_participating_fisher',
    candidates: bundle.knowledge_lie_memory_rules.audience_candidate_slots[0]?.candidate_participant_refs ?? [],
    idOf: String,
    random,
    choices
  });
  assertLowerDvinaTraceSemanticClosure(bundle, {
    motive,
    sequence,
    participatingFisher
  });
  const bodyProfiles = bundle.body_environment_profiles;
  const body = bodyProfiles.start_profile;
  const environmentRef = bodyProfiles.start_timestamp_specification.environment_snapshot_candidate_refs;
  if (!Array.isArray(environmentRef) || environmentRef.length !== 1) fail('ENVIRONMENT_SNAPSHOT_INCOMPLETE', 'Exactly one approved start environment is required.');
  const environment = requiredById(bodyProfiles.environment_profiles, 'environment_profile_id', environmentRef[0]);

  const sealedSelections = buildLowerDvinaTraceSealedSelections(bundle, {
    participantSelections,
    locationSelections,
    participatingFisher,
    motive,
    sequence,
    body,
    environment
  });
  assertLowerDvinaTraceSelectionClosure(
    sealedSelections,
    bundle.materialization_bindings.sealed_selection_inventory
  );

  const playerId = deterministicInstanceId(input.party_id, runId, 'player_character', 'player_clerk', 0);
  const g5NodeId = deterministicInstanceId(input.party_id, runId, 'g5_node', 'trace_ld_v1_loc_wreck_shore', 0);
  const anchorId = deterministicInstanceId(input.party_id, runId, 'g5_anchor', spatialBinding.anchor_template.template_id, 0);
  const revision = input.scenario_definition_revision;
  const phase3Prepared = [8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25].includes(revision)
    ? materializeLowerDvinaTracePreparedCamp({ input, bundle, runId, participantSelections, locationSelections }) : null;
  const phase4Prepared = [10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25].includes(revision)
    ? materializeLowerDvinaTracePreparedDryingShed({ input, bundle, runId, participantSelections, locationSelections })
    : null;
  const phase7Prepared = [15,16,17,18,19,20,21,22,23,24,25].includes(revision)
    ? materializeLowerDvinaTracePreparedStorehouse({ input, bundle, runId, participantSelections, locationSelections }) : null;
  const knifeTemplate = requiredById(bundle.item_container_set.item_templates, 'item_template_id', 'trace_ld_v1_item_mikula_knife');
  const knifeInventoryProfile = requiredPinnedById(
    bundle.item_inventory_profiles,
    'id',
    knifeTemplate.base_catalog_ref.inventory_profile_id
  );
  if (knifeInventoryProfile.item_template_id !== knifeTemplate.base_catalog_ref.template_id
    || !Number.isInteger(knifeInventoryProfile.mass_grams)
    || ![0, 1, 2].includes(knifeInventoryProfile.external_hand_cost)) {
    fail('START_ITEM_PROFILE_INCOMPLETE', 'The pinned starter-item inventory profile is incomplete or incompatible.');
  }
  const knifeId = deterministicInstanceId(input.party_id, runId, 'item', knifeTemplate.item_template_id, 0);
  const ratshaKnifeTemplate = phase4Prepared
    ? requiredById(bundle.item_container_set.item_templates, 'item_template_id', phase4Prepared.binding.ratsha_knife_initial_binding.item_template_ref)
    : null;
  const ratshaKnifeProfile = ratshaKnifeTemplate
    ? requiredPinnedById(bundle.item_inventory_profiles, 'id', ratshaKnifeTemplate.base_catalog_ref.inventory_profile_id)
    : null;
  const phase5Bandage = buildLowerDvinaTracePhase5InitialBandage({
    input, bundle, runId, phase3Prepared, requiredById, fail
  });
  if (phase4Prepared) {
    const binding = phase4Prepared.binding.ratsha_knife_initial_binding;
    if (binding?.participant_slot_ref !== 'ratsha_storehouse_helper'
      || binding.item_template_ref !== ratshaKnifeTemplate.item_template_id
      || binding.owner_ref !== 'ratsha_storehouse_helper'
      || binding.holder_ref !== 'ratsha_storehouse_helper'
      || binding.controller_ref !== 'ratsha_storehouse_helper'
      || binding.physical_position !== 'worn_quick'
      || binding.accessibility !== 'quick'
      || binding.inventory_profile_ref !== ratshaKnifeProfile.id
      || binding.location_ref !== 'trace_ld_v1_loc_old_drying_shed'
      || ratshaKnifeProfile.mass_grams !== 400
      || ratshaKnifeProfile.carry_form !== 'compact'
      || ratshaKnifeProfile.external_hand_cost !== 0) {
      fail('TRACE_PHASE_4_RATSHA_KNIFE_BINDING_INVALID', 'The exact approved Ratsha knife placement is required.');
    }
  }
  const phase4Promise = phase4Prepared && phase3Prepared
    ? buildLowerDvinaTracePhase4Promise({
      input,
      runId,
      bundle,
      playerId,
      phase3Prepared,
      phase4Prepared,
      participatingFisher,
      fail
    })
    : null;
  const conditionBindings = body.conditions.map((state) => ({
    state,
    source_body_profile_ref: {
      id: body.profile_id,
      schema: body.schema,
      version: body.version,
      record_digest: canonicalDigest(body)
    }
  }));
  const timestamp = structuredClone(input.resolve_timestamp({
    specification: bodyProfiles.start_timestamp_specification,
    calendar_profile: bundle.calendar_profile
  }));
  assertLowerDvinaTraceTimestamp(timestamp);

  const firstEntryPreparation = phase3Prepared?.first_entry_preparation ?? null;
  const materializedNpcs = phase3Prepared
    ? [
      ...phase3Prepared.npcs,
      ...(phase4Prepared ? phase4Prepared.npcs : []),
      ...(phase7Prepared ? [phase7Prepared.npc] : [])
    ]
    : [];
    const revision19Actors = [19, 20, 21, 22, 23, 24, 25].includes(revision)
    ? materializeRevision19ActorAppearances({
      bundle, playerId, name, random, choices, npcs: materializedNpcs
    })
    : null;
  const revision19EquipmentHandoff = revision19Actors
    ? {
      party_id: input.party_id,
      world_revision_id: input.world_revision_id,
      request_id: input.idempotency_key,
      run_id: runId,
      g4_id: wreck.selected.g4_node_ref.id,
      actor_candidate_instance_map: [{
        actor_candidate_id: 'player_clerk',
        actor_kind: 'player_character',
        actor_instance_id: playerId
      }, ...materializedNpcs.map((npc) => ({
        actor_candidate_id: npc.participant_slot_ref,
        actor_kind: 'npc',
        actor_instance_id: npc.instance_id
      }))],
      initial_equipment_candidates:
        bundle.item_container_set.initial_equipment_candidates,
      item_templates: bundle.item_container_set.item_templates,
      item_inventory_profiles:
        bundle.item_container_set.item_inventory_profiles,
      item_visual_profiles:
        bundle.item_container_set.item_visual_profiles,
      catalog_digest: bundle.artifact_pins.item_container_set.digest
    } : null;

  const dossier = buildLowerDvinaTracePlayerDossier({
    input,
    playerId,
    name,
    profile: bundle.player_profile,
    policy: bundle.approved_policy,
    body,
    knifeTemplate,
    knifeInventoryProfile,
    wreck,
    projection: bundle.materialization_bindings.player_dossier_projection,
    sourceDigest: bundle.artifact_pins.player_profile.digest,
    actorIdentity: revision19Actors?.playerIdentity
  });
  const policyPins = Object.values(bundle.artifact_pins)
    .map((pin) => structuredClone(pin))
    .sort((left, right) => left.key.localeCompare(right.key));
  const hiddenTruth = {
    culprit_ref: culprit,
    motive: structuredClone(motive),
    sequence: structuredClone(sequence),
    digest: canonicalDigest({ culprit, motive, sequence })
  };
  const localFire=[22,23,24,25].includes(revision)?materializeLocalFireActivation(
    input.party_id,playerId,anchorId,runId,bundle.local_fire_profile,
    deterministicInstanceId):null;
  const immediate = {
    player: { instance_id: playerId, dossier },
    spatial: {
      node: {
        instance_id: g5NodeId,
        parent_g4_id: wreck.selected.g4_node_ref.id,
        template_id: spatialBinding.node_template_ref,
        slot_key: spatialBinding.node_slot_ref,
        state: { location_profile_ref: wreck.location.location_profile_id, environment_profile_ref: environment.environment_profile_id }
      },
      anchor: {
        instance_id: anchorId,
        node_id: g5NodeId,
        template_id: spatialBinding.anchor_template.template_id,
        slot_key: spatialBinding.anchor_template.slot_key,
        npc_capacity: spatialBinding.anchor_template.npc_capacity,
        item_capacity: spatialBinding.anchor_template.item_capacity,
        container_capacity: spatialBinding.anchor_template.container_capacity,
        state: structuredClone(spatialBinding.anchor_template.state)
      },
      position: { g4_id: wreck.selected.g4_node_ref.id, g5_node_id: g5NodeId, g5_anchor_id: anchorId }
    },
    body: {
      ...structuredClone(body),
      record_digest: canonicalDigest(body),
      condition_bindings: conditionBindings
    },
    items: [{
      instance_id: knifeId,
      template_id: knifeTemplate.item_template_id,
      profile_id: knifeTemplate.base_catalog_ref.inventory_profile_id,
      category_id: knifeTemplate.semantic_category,
      quantity: 1,
      condition_state: bundle.materialization_bindings.player_dossier_projection
        .inventory_item_projections[knifeTemplate.item_template_id].condition_state,
      legal_status: bundle.materialization_bindings.player_dossier_projection
        .inventory_item_projections[knifeTemplate.item_template_id].legal_status,
      claim_state: bundle.materialization_bindings.player_dossier_projection
        .inventory_item_projections[knifeTemplate.item_template_id].claim_state,
      holder_character_id: playerId,
      physical_position: bundle.materialization_bindings.player_dossier_projection
        .inventory_item_projections[knifeTemplate.item_template_id].physical_position,
      owner_character_id: playerId,
      controller_character_id: playerId,
      state: {
        causal_basis: knifeTemplate.causal_basis,
        weapon_contract: structuredClone(knifeTemplate.weapon_contract),
        inventory_profile_snapshot: structuredClone(knifeInventoryProfile),
        source_digest: bundle.artifact_pins.item_inventory_profiles.digest
      }
    }, ...(phase4Prepared ? [{
      instance_id: deterministicInstanceId(input.party_id, runId, 'item', ratshaKnifeTemplate.item_template_id, 0),
      template_id: ratshaKnifeTemplate.item_template_id,
      profile_id: ratshaKnifeProfile.id,
      category_id: ratshaKnifeTemplate.semantic_category,
      quantity: 1,
      condition_state: 'serviceable',
      legal_status: 'owned',
      claim_state: 'established',
      owner_npc_id: phase4Prepared.ratsha.instance_id,
      holder_npc_id: phase4Prepared.ratsha.instance_id,
      controller_npc_id: phase4Prepared.ratsha.instance_id,
      physical_position: phase4Prepared.binding.ratsha_knife_initial_binding.physical_position,
      state: {
        causal_basis: ratshaKnifeTemplate.causal_basis,
        accessibility: phase4Prepared.binding.ratsha_knife_initial_binding.accessibility,
        inventory_profile_snapshot: structuredClone(ratshaKnifeProfile)
      }
    }]:[]),...(phase7Prepared?.weapon?[phase7Prepared.weapon]:[]),
    ...(phase7Prepared?.packet?[phase7Prepared.packet]:[]),
    ...(phase5Bandage ? [phase5Bandage] : []),
    ...(localFire?.items??[])],
    containers: phase7Prepared ? [phase7Prepared.container] : [],
    timestamp,
    environment_snapshot: structuredClone(environment),
    ...(phase3Prepared || phase4Prepared || phase7Prepared
      ? {
        prepared_scenes: [
          ...(phase3Prepared && revision < 24 ? [phase3Prepared.scene] : []),
          ...(phase4Prepared ? [phase4Prepared.scene] : []),
          ...(phase7Prepared ? [phase7Prepared.scene] : [])
        ],
        npcs: [
          ...(phase3Prepared
            ? revision < 24
              ? phase3Prepared.npcs
              : phase3Prepared.npcs.map((npc) => ({ ...npc, anchor_id: null }))
            : []),
          ...(phase4Prepared ? phase4Prepared.npcs : []),
          ...(phase7Prepared ? [phase7Prepared.npc] : [])
        ]
      }
      : {}),
    ...(phase4Promise ? { promise_instances: [phase4Promise] } : {})
  };
  const validationReport = {
    pass: true,
    checks: {
      request_identity: true,
      immutable_bundle: true,
      hidden_truth_complete: true,
      selections_closed: true,
      immediate_sealed_boundary: true
    }
  };
  const trace = {
    run_id: runId,
    idempotency_key: input.idempotency_key,
    materializer_version: MATERIALIZER_VERSION,
    rng_version: RNG_VERSION,
    seed_context: seedContext,
    seed_digest: seed.digest,
    input_digest: canonicalDigest(lowerDvinaTraceRequestIdentity(input)),
    world_revision_id: input.world_revision_id,
    catalog_digest: input.domain_catalog_pin.catalog_digest,
    scenario_manifest_digest: input.scenario_manifest_digest,
    policy_profile_pins: policyPins,
    policy_profile_pin_digest: canonicalDigest(policyPins),
    choices,
    rng_draw_count: random.drawCount
  };
  const result = {
    version: 1,
    schema: 'rus.lower_dvina_trace_party_materialization_result.v1',
    status: 'materialized',
    party_id: input.party_id,
    run_id: runId,
    request_identity: lowerDvinaTraceRequestIdentity(input),
    immediate,
    ...(firstEntryPreparation ? { first_entry_preparation: firstEntryPreparation } : {}),
    hidden_truth: hiddenTruth,
    ...(revision19EquipmentHandoff ? {
      initial_actor_equipment_handoff: revision19EquipmentHandoff
    } : {}),
    sealed_selections: sealedSelections,
    policy_profile_pins: policyPins,
    validation_report: validationReport,
    trace
  };
  trace.result_digest = computeMaterializationEnvelopeDigest(result);
  return deepFreeze(result);
}

function selectParticipants(set, playerProfile, bindings, random, choices) {
  const results = [];
  if (!Array.isArray(set.candidate_sets) || !Array.isArray(set.profiles) || !Array.isArray(set.participant_slots)) {
    fail('PARTICIPANT_SELECTION_INCOMPLETE', 'Exact participant data is required.');
  }
  for (const candidateSet of [...set.candidate_sets].sort((left, right) => left.candidate_set_id.localeCompare(right.candidate_set_id))) {
    const slots = Array.isArray(candidateSet.slots)
      ? exactArray(candidateSet.slots, `participant set ${candidateSet.candidate_set_id}.slots`)
      : [requiredText(candidateSet.slot, `participant set ${candidateSet.candidate_set_id}.slot`)];
    if (!slots.every(Boolean)) fail('MANDATORY_SLOT_MISSING', `Participant set ${candidateSet.candidate_set_id} has no exact slot.`);
    for (const slot of slots) {
      const selected = choose({ key: `participant:${slot}`, setRef: candidateSet.candidate_set_id, candidates: candidateSet.candidates, idOf: (value) => value.profile_id, random, choices });
      const profileRecords = [...set.profiles, playerProfile].filter((value) => (
        value?.profile_id === selected.profile_id && value?.revision === selected.revision
      ));
      if (profileRecords.length !== 1) fail('PARTICIPANT_PROFILE_REF_INVALID', `Participant profile ${selected.profile_id} is not exact.`);
      const profile = profileRecords[0];
      if (candidateSet.slot && profile.slot && profile.slot !== candidateSet.slot && slot !== 'player_clerk') {
        fail('PARTICIPANT_PROFILE_REF_INVALID', `Participant profile ${selected.profile_id} is incompatible with slot ${slot}.`);
      }
      const materializationDepth = bindings.participant_materialization_depths?.[slot];
      if (!materializationDepth
        || (slot === 'player_clerk' && materializationDepth !== 'immediate_player')
        || (slot !== 'player_clerk' && profile.initial_materialization_depth !== materializationDepth)) {
        fail('PARTICIPANT_MATERIALIZATION_DEPTH_MISSING', `Participant slot ${slot} has no approved depth.`);
      }
      results.push({
        selected_id: slot,
        slot_key: slot,
        selected_profile: structuredClone(selected),
        candidate_set_ref: candidateSet.candidate_set_id,
        candidate_record_digest: canonicalDigest(selected),
        record_digest: canonicalDigest(profile),
        causal_binding: slot === 'player_clerk'
          ? requiredText(profile.approval?.basis, 'player profile approval.basis')
          : requiredText(profile.causal_basis, `participant profile ${profile.profile_id}.causal_basis`),
        materialization_rule: materializationDepth,
        candidate_set_digest: choices.at(-1).candidate_set_digest
      });
    }
  }
  const expected = new Set(set.participant_slots);
  if (results.length !== expected.size || results.some((item) => !expected.has(item.slot_key))) fail('PARTICIPANT_SELECTION_INCOMPLETE', 'Participant slots must resolve exactly.');
  return results;
}

function selectLocations(set, random, choices) {
  const profiles = exactArray(set.location_profiles, 'location_topology_set.location_profiles');
  return [...profiles].sort((left, right) => left.location_profile_id.localeCompare(right.location_profile_id)).map((location) => ({
    selected_id: location.location_profile_id,
    slot_key: location.location_profile_id,
    location: structuredClone(location),
    selected: structuredClone(choose({
      key: `location:${location.location_profile_id}`,
      setRef: location.spatial_candidate_set.candidate_set_id,
      candidates: location.spatial_candidate_set.candidates,
      idOf: (value) => value.g4_node_ref.id,
      random,
      choices
    })),
    record_digest: canonicalDigest(location)
  }));
}

function choose({ key, setRef, candidates, idOf, random, choices }) {
  if (!setRef || !Array.isArray(candidates) || candidates.length === 0) fail('REQUIRED_CANDIDATE_SET_EMPTY', `Candidate set ${String(setRef)} is empty.`);
  const sorted = candidates.map((value) => ({ id: idOf(value), value })).sort((left, right) => String(left.id).localeCompare(String(right.id)));
  if (sorted.some((entry) => !entry.id) || new Set(sorted.map((entry) => entry.id)).size !== sorted.length) fail('CANDIDATE_SET_INVALID', `Candidate set ${setRef} has missing or duplicate stable IDs.`);
  const candidateIds = sorted.map((entry) => entry.id);
  const digest = canonicalDigest(candidateIds);
  const draw = random.nextUint32();
  const selected = sorted[draw % sorted.length];
  choices.push({
    choice_ordinal: choices.length,
    choice_key: key,
    slot_key: key,
    candidate_set_ref: setRef,
    candidate_digest: digest,
    candidate_set_digest: digest,
    candidate_ids: candidateIds,
    selected_id: selected.id,
    selected_weight: 1,
    rng_draw: draw,
    rng_counter: random.drawCount,
    rejection_summary: { rejected_count: 0, missing_count: 0, unapproved_count: 0, wrong_domain_count: 0 }
  });
  return selected.value;
}

function approved(values) {
  return (values ?? []).filter((value) => value?.status === 'approved');
}

function requiredById(values, key, id) {
  const matches = (values ?? []).filter((value) => value?.[key] === id && (value.status == null || value.status === 'approved'));
  if (matches.length !== 1) fail('MANDATORY_RECORD_INVALID', `Required record ${id} must resolve exactly once.`);
  return matches[0];
}

function requiredPinnedById(values, key, id) {
  const matches = (values ?? []).filter((value) => value?.[key] === id);
  if (matches.length !== 1) fail('MANDATORY_RECORD_INVALID', `Required pinned record ${id} must resolve exactly once.`);
  return matches[0];
}

function exactArray(value, label) { if (!Array.isArray(value) || value.length === 0) fail('MANDATORY_RECORD_INVALID', `${label} must be a non-empty exact array.`); return value; }

function requiredText(value, label) { if (typeof value !== 'string' || !value) fail('MANDATORY_RECORD_INVALID', `${label} is required.`); return value; }
