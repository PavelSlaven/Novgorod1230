import { canonicalDigest, MATERIALIZER_VERSION, MaterializationError, RNG_VERSION } from './core.js';
import {
  ARTIFACT_CONTRACTS,
  M1_ARTIFACT_CONTRACT_OVERRIDES,
  M1_REQUIRED_ARTIFACTS,
  M2_ARTIFACT_CONTRACT_OVERRIDES,
  M2_REQUIRED_ARTIFACTS,
  M3_ARTIFACT_CONTRACT_OVERRIDES,
  M3_REQUIRED_ARTIFACTS,
  M4_ARTIFACT_CONTRACT_OVERRIDES,
  M4_REQUIRED_ARTIFACTS,
  M5_ARTIFACT_CONTRACT_OVERRIDES,
  M5_REQUIRED_ARTIFACTS,
  M6_ARTIFACT_CONTRACT_OVERRIDES,
  M6_REQUIRED_ARTIFACTS,
  M7_ARTIFACT_CONTRACT_OVERRIDES,
  M7_REQUIRED_ARTIFACTS,
  M8_ARTIFACT_CONTRACT_OVERRIDES,
  M8_REQUIRED_ARTIFACTS,
  M9_ARTIFACT_CONTRACT_OVERRIDES,
  M9_REQUIRED_ARTIFACTS,
  M10_ARTIFACT_CONTRACT_OVERRIDES,
  M10_REQUIRED_ARTIFACTS,
  M11_ARTIFACT_CONTRACT_OVERRIDES,
  M11_REQUIRED_ARTIFACTS,
  M12_ARTIFACT_CONTRACT_OVERRIDES,
  M12_REQUIRED_ARTIFACTS,
  M13_ARTIFACT_CONTRACT_OVERRIDES,
  M13_REQUIRED_ARTIFACTS,
  M14_ARTIFACT_CONTRACT_OVERRIDES,
  M15_ARTIFACT_CONTRACT_OVERRIDES,
  M16_ARTIFACT_CONTRACT_OVERRIDES,
  M17_ARTIFACT_CONTRACT_OVERRIDES,
  M18_ARTIFACT_CONTRACT_OVERRIDES,
  M19_ARTIFACT_CONTRACT_OVERRIDES,
  M20_ARTIFACT_CONTRACT_OVERRIDES,
  PHASE_3_ARTIFACT_CONTRACT_OVERRIDES,
  PHASE_3_PICKUP_ARTIFACT_CONTRACT_OVERRIDES,
  PHASE_4_ARTIFACT_CONTRACT_OVERRIDES,
  PHASE_6_ARTIFACT_CONTRACT_OVERRIDES,
  PHASE_5_ARTIFACT_CONTRACT_OVERRIDES,
  REQUIRED_ARTIFACTS
} from './lower-dvina-trace-artifact-contracts.js';
import { assertLowerDvinaTracePhase1AValidation } from './lower-dvina-trace-phase-1a-validation.js';

export const LOWER_DVINA_TRACE_SCENARIO_ID = 'lower_dvina_trace_v1';
export const LOWER_DVINA_TRACE_DEFINITION_REVISION = 7;
export const LOWER_DVINA_TRACE_PHASE_3_DEFINITION_REVISION = 8;
export const LOWER_DVINA_TRACE_PHASE_3_PICKUP_DEFINITION_REVISION = 9;
export const LOWER_DVINA_TRACE_PHASE_4_DEFINITION_REVISION = 10;
export const LOWER_DVINA_TRACE_PHASE_5_DEFINITION_REVISION = 11;
export const LOWER_DVINA_TRACE_PHASE_6_DEFINITION_REVISION = 12;
export const LOWER_DVINA_TRACE_M1_DEFINITION_REVISION = 13;
export const LOWER_DVINA_TRACE_M2_DEFINITION_REVISION = 14;
export const LOWER_DVINA_TRACE_M3_DEFINITION_REVISION = 15;
export const LOWER_DVINA_TRACE_M4_DEFINITION_REVISION = 16;
export const LOWER_DVINA_TRACE_M5_DEFINITION_REVISION = 17;
export const LOWER_DVINA_TRACE_M6_DEFINITION_REVISION = 18;
export const LOWER_DVINA_TRACE_M7_DEFINITION_REVISION = 19;
export const LOWER_DVINA_TRACE_M8_DEFINITION_REVISION = 20;
export const LOWER_DVINA_TRACE_M9_DEFINITION_REVISION = 21;
export const LOWER_DVINA_TRACE_M10_DEFINITION_REVISION = 22;
export const LOWER_DVINA_TRACE_M11_DEFINITION_REVISION = 23;
export const LOWER_DVINA_TRACE_M12_DEFINITION_REVISION = 24;
export const LOWER_DVINA_TRACE_M13_DEFINITION_REVISION = 25;
export const LOWER_DVINA_TRACE_M14_DEFINITION_REVISION = 26;
export const LOWER_DVINA_TRACE_M15_DEFINITION_REVISION = 27;
export const LOWER_DVINA_TRACE_M16_DEFINITION_REVISION = 28;
export const LOWER_DVINA_TRACE_M17_DEFINITION_REVISION = 29;
export const LOWER_DVINA_TRACE_M18_DEFINITION_REVISION = 30;
export const LOWER_DVINA_TRACE_M19_DEFINITION_REVISION = 31;
export const LOWER_DVINA_TRACE_M20_DEFINITION_REVISION = 32;
export const LOWER_DVINA_TRACE_ACCEPTANCE_SEED_CONTEXT = 'lower_dvina_trace_phase_1a_mikula_v1';
export const LOWER_DVINA_TRACE_APPROVED_WORLD_COMPATIBILITY_DIGEST =
  '0e239d47657a9bdf996f5a0cc5ca46e57e42a5326feb540d8acca747ad257b54';
export const LOWER_DVINA_TRACE_APPEARANCE_WORLD_COMPATIBILITY_DIGEST =
  '3d019f3e51cb4e7629713108bb7658127996ee5c70acd38ccb03e7160385ff00';
export const LOWER_DVINA_TRACE_SPATIAL_SEMANTIC_WORLD_COMPATIBILITY_DIGEST =
  'bbc14100e3f43d4a383c22fc717b4b54f4a464bf5f9c90489be22d5ab4b70e11';
export const LOWER_DVINA_TRACE_REVISION26_WORLD_COMPATIBILITY_DIGEST =
  '822e2e890374a9aa8e24470c5fbab55e6d7addf6e8160a47db5e597bd66f0163';

export function assertLowerDvinaTraceRequest(input) {
  if (!input || typeof input !== 'object') fail('TRACE_MATERIALIZATION_REQUEST_INVALID', 'Materialization request is required.');
  const required = ['party_id', 'scenario_id', 'scenario_manifest_digest', 'world_revision_id', 'world_catalog_digest', 'materializer_version', 'rng_algorithm_id', 'seed_context', 'idempotency_key', 'trigger'];
  for (const key of required) if (typeof input[key] !== 'string' || !input[key]) fail('TRACE_MATERIALIZATION_REQUEST_INVALID', `Missing request field ${key}.`);
  if (input.scenario_id !== LOWER_DVINA_TRACE_SCENARIO_ID
    || ![
      LOWER_DVINA_TRACE_DEFINITION_REVISION,
      LOWER_DVINA_TRACE_PHASE_3_DEFINITION_REVISION,
      LOWER_DVINA_TRACE_PHASE_3_PICKUP_DEFINITION_REVISION,
      LOWER_DVINA_TRACE_PHASE_4_DEFINITION_REVISION,
      LOWER_DVINA_TRACE_PHASE_5_DEFINITION_REVISION,
      LOWER_DVINA_TRACE_PHASE_6_DEFINITION_REVISION,
      LOWER_DVINA_TRACE_M1_DEFINITION_REVISION,
      LOWER_DVINA_TRACE_M2_DEFINITION_REVISION,
      LOWER_DVINA_TRACE_M3_DEFINITION_REVISION,
      LOWER_DVINA_TRACE_M4_DEFINITION_REVISION,
      LOWER_DVINA_TRACE_M5_DEFINITION_REVISION,
      LOWER_DVINA_TRACE_M6_DEFINITION_REVISION,
      LOWER_DVINA_TRACE_M7_DEFINITION_REVISION,
      LOWER_DVINA_TRACE_M8_DEFINITION_REVISION,
      LOWER_DVINA_TRACE_M9_DEFINITION_REVISION
      ,LOWER_DVINA_TRACE_M10_DEFINITION_REVISION
      ,LOWER_DVINA_TRACE_M11_DEFINITION_REVISION
      ,LOWER_DVINA_TRACE_M12_DEFINITION_REVISION
      ,LOWER_DVINA_TRACE_M13_DEFINITION_REVISION
      ,LOWER_DVINA_TRACE_M14_DEFINITION_REVISION
      ,LOWER_DVINA_TRACE_M15_DEFINITION_REVISION
      ,LOWER_DVINA_TRACE_M16_DEFINITION_REVISION
      ,LOWER_DVINA_TRACE_M17_DEFINITION_REVISION
      ,LOWER_DVINA_TRACE_M18_DEFINITION_REVISION
      ,LOWER_DVINA_TRACE_M19_DEFINITION_REVISION
      ,LOWER_DVINA_TRACE_M20_DEFINITION_REVISION
    ]
      .includes(input.scenario_definition_revision)) {
    fail(
      'TRACE_SCENARIO_REVISION_UNSUPPORTED',
      'The requested Lower Dvina trace definition revision is not approved.'
    );
  }
  if (input.materializer_version !== MATERIALIZER_VERSION || input.rng_algorithm_id !== RNG_VERSION) fail('TRACE_MATERIALIZER_VERSION_UNSUPPORTED', 'Materializer and RNG pins must match production versions.');
  if (!Number.isInteger(input.occurrence) || input.occurrence < 0) fail('TRACE_MATERIALIZATION_REQUEST_INVALID', 'occurrence must be a non-negative integer.');
  if (input.existing_party_state?.baseline_exists === true) fail('BASELINE_ALREADY_MATERIALIZED', 'An existing baseline cannot be materialized again.');
  if (typeof input.resolve_timestamp !== 'function') fail('TIME_OWNER_MISSING', 'The approved time-owner resolver is required.');
  const domainPin = input.domain_catalog_pin;
  const requiredDomainPinFields = [
    'catalog_scope',
    'catalog_revision_id',
    'catalog_digest',
    'import_id',
    'import_audit_digest',
    'record_registry_digest',
    'runtime_contract_digest',
    'compatible_world_revision_id',
    'compatible_world_catalog_digest',
    'compatible_world_pin_manifest_digest',
    'activation_event_id'
  ];
  if (domainPin?.schema !== 'rus.runtime_catalog_pin.v2'
    || domainPin.catalog_scope !== 'item_container_materialization_v2'
    || requiredDomainPinFields.some((key) => typeof domainPin[key] !== 'string' || !domainPin[key])
    || domainPin.compatible_world_revision_id !== input.world_revision_id
    || domainPin.compatible_world_catalog_digest !== input.world_catalog_digest) {
    fail('TRACE_DOMAIN_CATALOG_PIN_INVALID', 'An exact active item/container domain catalog pin compatible with the world tuple is required.');
  }
}

export function assertLowerDvinaTraceBundle(bundle, input) {
  if (!bundle || bundle.schema !== 'rus.lower_dvina_trace_materialization_bundle.v1' || bundle.version !== 1) fail('TRACE_SCENARIO_BUNDLE_INVALID', 'Pinned materialization bundle v1 is required.');
  if (bundle.scenario_id !== input.scenario_id || bundle.definition_revision !== input.scenario_definition_revision || bundle.manifest_digest !== input.scenario_manifest_digest) fail('TRACE_SCENARIO_MANIFEST_MISMATCH', 'Scenario bundle identity does not match the request.');
  const requiredArtifacts = input.scenario_definition_revision
      >= LOWER_DVINA_TRACE_M13_DEFINITION_REVISION
    ? M13_REQUIRED_ARTIFACTS
    : input.scenario_definition_revision
      === LOWER_DVINA_TRACE_M12_DEFINITION_REVISION
    ? M12_REQUIRED_ARTIFACTS
    : input.scenario_definition_revision
      === LOWER_DVINA_TRACE_M11_DEFINITION_REVISION
    ? M11_REQUIRED_ARTIFACTS
    : input.scenario_definition_revision
      === LOWER_DVINA_TRACE_M10_DEFINITION_REVISION
    ? M10_REQUIRED_ARTIFACTS
    : input.scenario_definition_revision
      === LOWER_DVINA_TRACE_M9_DEFINITION_REVISION
    ? M9_REQUIRED_ARTIFACTS
    : input.scenario_definition_revision
      === LOWER_DVINA_TRACE_M8_DEFINITION_REVISION
    ? M8_REQUIRED_ARTIFACTS
    : input.scenario_definition_revision
      === LOWER_DVINA_TRACE_M7_DEFINITION_REVISION
    ? M7_REQUIRED_ARTIFACTS
    : input.scenario_definition_revision
      === LOWER_DVINA_TRACE_M6_DEFINITION_REVISION
    ? M6_REQUIRED_ARTIFACTS
    : input.scenario_definition_revision
      === LOWER_DVINA_TRACE_M5_DEFINITION_REVISION
    ? M5_REQUIRED_ARTIFACTS
    : input.scenario_definition_revision
      === LOWER_DVINA_TRACE_M4_DEFINITION_REVISION
    ? M4_REQUIRED_ARTIFACTS
    : input.scenario_definition_revision
      === LOWER_DVINA_TRACE_M3_DEFINITION_REVISION
    ? M3_REQUIRED_ARTIFACTS
    : input.scenario_definition_revision
        === LOWER_DVINA_TRACE_M2_DEFINITION_REVISION
    ? M2_REQUIRED_ARTIFACTS
    : input.scenario_definition_revision
        === LOWER_DVINA_TRACE_M1_DEFINITION_REVISION
      ? M1_REQUIRED_ARTIFACTS
      : REQUIRED_ARTIFACTS;
  for (const key of requiredArtifacts) {
    const artifact = bundle[key];
    const pin = bundle.artifact_pins?.[key];
    if (!artifact || !pin || pin.key !== key || !/^[a-f0-9]{64}$/.test(pin.digest ?? '') || canonicalDigest(artifact) !== pin.canonical_digest) fail('TRACE_SCENARIO_ARTIFACT_INVALID', `Required artifact ${key} is missing or stale.`);
    const [schema, revision] = artifactContractFor(key, input.scenario_definition_revision);
    const [actualSchema, actualRevision] = exactArtifactContractIdentity(key, artifact, pin);
    if (actualSchema !== schema || actualRevision !== revision || pin.schema !== schema || pin.revision !== revision) {
      fail('TRACE_SCENARIO_ARTIFACT_CONTRACT_UNSUPPORTED', `Required artifact ${key} has an unsupported schema or revision.`);
    }
  }
  if (bundle.definition?.scenario_id !== LOWER_DVINA_TRACE_SCENARIO_ID
    || bundle.definition?.revision !== input.scenario_definition_revision
    || bundle.definition?.required_unresolved_refs?.length !== 0) {
    fail('TRACE_SCENARIO_DEFINITION_INCOMPLETE', `Scenario definition revision ${input.scenario_definition_revision} must be fully resolved.`);
  }
  const spatial = bundle.location_topology_set?.spatial_source_ref;
  if (spatial?.manifest_digest !== bundle.artifact_pins.spatial_manifest.digest
    || !worldTupleIsDirectOrApprovedDescendant(spatial, input)) {
    fail('TRACE_WORLD_PIN_INCOMPATIBLE', 'Scenario spatial source does not match the requested world pin.');
  }
  assertLowerDvinaTracePhase1AValidation({
    bundle,
    definitionRevision: input.scenario_definition_revision,
    fail,
    scenarioId: LOWER_DVINA_TRACE_SCENARIO_ID,
    revisions: {
      base: LOWER_DVINA_TRACE_DEFINITION_REVISION,
      phase3: LOWER_DVINA_TRACE_PHASE_3_DEFINITION_REVISION,
      phase3Pickup: LOWER_DVINA_TRACE_PHASE_3_PICKUP_DEFINITION_REVISION,
      phase4: LOWER_DVINA_TRACE_PHASE_4_DEFINITION_REVISION,
      phase5: LOWER_DVINA_TRACE_PHASE_5_DEFINITION_REVISION,
      phase6: LOWER_DVINA_TRACE_PHASE_6_DEFINITION_REVISION,
      m1: LOWER_DVINA_TRACE_M1_DEFINITION_REVISION,
      m2: LOWER_DVINA_TRACE_M2_DEFINITION_REVISION,
      m3: LOWER_DVINA_TRACE_M3_DEFINITION_REVISION,
      m4: LOWER_DVINA_TRACE_M4_DEFINITION_REVISION,
      m5: LOWER_DVINA_TRACE_M5_DEFINITION_REVISION,
      m6: LOWER_DVINA_TRACE_M6_DEFINITION_REVISION,
      m7: LOWER_DVINA_TRACE_M7_DEFINITION_REVISION,
      m8: LOWER_DVINA_TRACE_M8_DEFINITION_REVISION
      ,m9: LOWER_DVINA_TRACE_M9_DEFINITION_REVISION
      ,m10: LOWER_DVINA_TRACE_M10_DEFINITION_REVISION
      ,m11: LOWER_DVINA_TRACE_M11_DEFINITION_REVISION
      ,m12: LOWER_DVINA_TRACE_M12_DEFINITION_REVISION
      ,m13: LOWER_DVINA_TRACE_M13_DEFINITION_REVISION
      ,m14: LOWER_DVINA_TRACE_M14_DEFINITION_REVISION
      ,m15: LOWER_DVINA_TRACE_M15_DEFINITION_REVISION
      ,m16: LOWER_DVINA_TRACE_M16_DEFINITION_REVISION
      ,m17: LOWER_DVINA_TRACE_M17_DEFINITION_REVISION
      ,m18: LOWER_DVINA_TRACE_M18_DEFINITION_REVISION
      ,m19: LOWER_DVINA_TRACE_M19_DEFINITION_REVISION
      ,m20: LOWER_DVINA_TRACE_M20_DEFINITION_REVISION
    }
  });
  return bundle;
}

function artifactContractFor(key, definitionRevision) {
  if (definitionRevision === LOWER_DVINA_TRACE_M20_DEFINITION_REVISION) {
    return M20_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key];
  }
  if (definitionRevision === LOWER_DVINA_TRACE_M18_DEFINITION_REVISION) {
    return M18_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key];
  }
  if (definitionRevision === LOWER_DVINA_TRACE_M19_DEFINITION_REVISION) {
    return M19_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key];
  }
  if (definitionRevision === LOWER_DVINA_TRACE_M17_DEFINITION_REVISION) {
    return M17_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key];
  }
  if (definitionRevision === LOWER_DVINA_TRACE_M16_DEFINITION_REVISION) {
    return M16_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key];
  }
  if (definitionRevision === LOWER_DVINA_TRACE_M15_DEFINITION_REVISION) {
    return M15_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key];
  }
  if (definitionRevision === LOWER_DVINA_TRACE_M14_DEFINITION_REVISION) {
    return M14_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key];
  }
  if (definitionRevision === LOWER_DVINA_TRACE_M13_DEFINITION_REVISION) {
    return M13_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key];
  }
  if (definitionRevision === LOWER_DVINA_TRACE_M12_DEFINITION_REVISION) {
    return M12_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key];
  }
  if (definitionRevision === LOWER_DVINA_TRACE_M11_DEFINITION_REVISION) {
    return M11_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key];
  }
  if (definitionRevision === LOWER_DVINA_TRACE_M10_DEFINITION_REVISION) {
    return M10_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key];
  }
  if (definitionRevision === LOWER_DVINA_TRACE_M9_DEFINITION_REVISION) {
    return M9_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key];
  }
  if (definitionRevision === LOWER_DVINA_TRACE_M8_DEFINITION_REVISION) {
    return M8_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key];
  }
  if (definitionRevision === LOWER_DVINA_TRACE_M7_DEFINITION_REVISION) {
    return M7_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key];
  }
  if (definitionRevision === LOWER_DVINA_TRACE_M6_DEFINITION_REVISION) {
    return M6_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key];
  }
  if (definitionRevision === LOWER_DVINA_TRACE_M5_DEFINITION_REVISION) {
    return M5_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key];
  }
  if (definitionRevision === LOWER_DVINA_TRACE_M4_DEFINITION_REVISION) return M4_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key];
  if (definitionRevision === LOWER_DVINA_TRACE_M3_DEFINITION_REVISION) return M3_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key];
  if (definitionRevision === LOWER_DVINA_TRACE_M2_DEFINITION_REVISION) return M2_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key];
  if (definitionRevision === LOWER_DVINA_TRACE_M1_DEFINITION_REVISION) return M1_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key];
  if (definitionRevision === LOWER_DVINA_TRACE_PHASE_6_DEFINITION_REVISION) return PHASE_6_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key];
  if (definitionRevision === LOWER_DVINA_TRACE_PHASE_5_DEFINITION_REVISION) return PHASE_5_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key];
  if (definitionRevision === LOWER_DVINA_TRACE_PHASE_4_DEFINITION_REVISION) return PHASE_4_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key];
  if (definitionRevision
      === LOWER_DVINA_TRACE_PHASE_3_PICKUP_DEFINITION_REVISION) {
    return PHASE_3_PICKUP_ARTIFACT_CONTRACT_OVERRIDES[key]
      ?? ARTIFACT_CONTRACTS[key];
  }
  return definitionRevision === LOWER_DVINA_TRACE_PHASE_3_DEFINITION_REVISION
    ? (PHASE_3_ARTIFACT_CONTRACT_OVERRIDES[key] ?? ARTIFACT_CONTRACTS[key])
    : ARTIFACT_CONTRACTS[key];
}

export function assertLowerDvinaTraceSemanticClosure(bundle, { motive, sequence, participatingFisher }) {
  const participants = exactIds(bundle.participant_profile_set.participant_slots, 'participant slot');
  const locations = exactIds(bundle.location_topology_set.location_profiles.map((value) => value.location_profile_id), 'location profile');
  const items = exactIds([
    ...bundle.item_container_set.item_templates.map((value) => value.item_template_id),
    ...bundle.item_container_set.container_templates.map((value) => value.container_template_id)
  ], 'item or container template');
  const transitions = exactIds(bundle.item_container_set.transition_templates.map((value) => value.transition_template_id), 'item transition');
  const perceptions = exactIds(bundle.knowledge_lie_memory_rules.perception_source_templates.map((value) => value.perception_template_id), 'perception template');
  const statements = exactIds(bundle.knowledge_lie_memory_rules.statement_templates.map((value) => value.statement_template_id), 'statement template');
  const placementSlots = exactIds(bundle.item_container_set.placement_slots.map((value) => value.placement_slot_id), 'placement slot');

  if (sequence.motive_ref !== motive.motive_id || sequence.actor_bindings?.principal !== motive.principal_ref) {
    fail('HIDDEN_TRUTH_INCOMPLETE', 'Hidden sequence, culprit and motive are not causally bound.');
  }
  for (const actorRef of Object.values(sequence.actor_bindings ?? {})) requireRef(participants, actorRef, 'hidden actor binding');
  for (const actorRef of sequence.excluded_pre_game_participant_refs ?? []) requireRef(participants, actorRef, 'excluded participant');

  const events = sequence.event_templates ?? [];
  const eventIds = exactIds(events.map((value) => value.event_template_id), 'hidden event');
  if (events.length === 0 || new Set(events.map((value) => value.order)).size !== events.length) fail('HIDDEN_SEQUENCE_INVALID', 'Hidden event order must be complete and unique.');
  const orderById = new Map(events.map((value) => [value.event_template_id, value.order]));
  for (const event of events) {
    if (!Number.isInteger(event.order) || event.order < 1) fail('HIDDEN_SEQUENCE_INVALID', `Hidden event ${event.event_template_id} has an invalid order.`);
    for (const predecessor of event.predecessor_refs ?? []) {
      requireRef(eventIds, predecessor, 'hidden predecessor');
      if (orderById.get(predecessor) >= event.order) fail('HIDDEN_SEQUENCE_INVALID', `Hidden event ${event.event_template_id} has a non-causal predecessor.`);
    }
    for (const ref of event.actor_refs ?? []) requireRef(participants, ref, 'hidden event actor');
    for (const ref of event.location_refs ?? []) requireRef(locations, ref, 'hidden event location');
    for (const ref of event.item_refs ?? []) requireRef(items, ref, 'hidden event item');
    if (event.effect_template?.until_event_ref) requireRef(eventIds, event.effect_template.until_event_ref, 'hidden effect boundary');
    if (event.audible_action_contract) {
      requireRef(participants, event.audible_action_contract.speaker_ref, 'audible speaker');
      for (const ref of event.audible_action_contract.audible_to_refs ?? []) requireRef(participants, ref, 'audible observer');
      requireRef(perceptions, event.audible_action_contract.perception_template_ref, 'audible perception');
    }
    if (event.controlled_item_use) {
      requireRef(items, event.controlled_item_use.item_ref, 'controlled item');
      requireRef(transitions, event.controlled_item_use.transition_template_ref, 'controlled-item transition');
      requireRef(locations, event.controlled_item_use.resulting_placement_location_ref, 'controlled-item location');
    }
    for (const ref of event.transfer?.transition_template_refs ?? []) requireRef(transitions, ref, 'property transfer transition');
    for (const ref of event.transfer?.contained_item_refs ?? []) requireRef(items, ref, 'contained item');
  }

  for (const slot of bundle.item_container_set.placement_slots) requireRef(locations, slot.location_ref, 'clue placement location');
  for (const evidence of bundle.clue_evidence_graph_set.evidence_records ?? []) {
    if (!evidence.discovery_slot_ref) fail('CLUE_BINDING_INCOMPLETE', `Evidence ${evidence.evidence_id} has no discovery slot.`);
    for (const ref of evidence.allowed_location_refs ?? []) requireRef(locations, ref, 'evidence location');
    for (const ref of evidence.allowed_actor_refs ?? []) requireRef(participants, ref, 'evidence actor');
    for (const ref of evidence.allowed_item_refs ?? []) requireRef(items, ref, 'evidence item');
    if (evidence.compatible_hidden_sequence_ref !== sequence.hidden_sequence_candidate_id) fail('CLUE_BINDING_INCOMPLETE', `Evidence ${evidence.evidence_id} is not bound to the selected hidden sequence.`);
    if (['physical_item', 'physical_trace'].includes(evidence.evidence_kind)
      && !placementSlots.has(evidence.discovery_slot_ref)
      && !evidence.allowed_location_refs?.includes('trace_ld_v1_loc_zhdanko_storehouse')) {
      fail('CLUE_BINDING_INCOMPLETE', `Physical evidence ${evidence.evidence_id} has no approved concrete or late-scene discovery slot.`);
    }
    if (['testimonial_statement', 'confession_statement'].includes(evidence.evidence_kind)) requireRef(statements, evidence.discovery_slot_ref, 'evidence statement');
  }

  const knowledgeScopes = exactIds([
    ...bundle.participant_profile_set.knowledge_scope_profiles.map((value) => value.profile_id),
    bundle.player_profile.profile_id
  ], 'knowledge scope');
  for (const binding of bundle.knowledge_lie_memory_rules.participant_knowledge_bindings ?? []) {
    requireRef(participants, binding.participant_ref, 'knowledge participant');
    requireRef(knowledgeScopes, binding.knowledge_scope_ref, 'knowledge scope binding');
  }
  const audience = bundle.knowledge_lie_memory_rules.audience_candidate_slots?.[0];
  const audienceCandidates = exactIds(audience?.candidate_participant_refs ?? [], 'audience candidate');
  requireRef(audienceCandidates, participatingFisher, 'participating fisher audience');
  requireRef(participants, participatingFisher, 'participating fisher participant');
}

export function assertLowerDvinaTraceTimestamp(timestamp) {
  if (!timestamp || !/^(?:0|[1-9][0-9]*)$/.test(timestamp.whole_minutes ?? '') || timestamp.subminute_numerator !== '0' || timestamp.subminute_denominator !== '1') fail('TIMESTAMP_AMBIGUOUS', 'Exact GameTimestamp could not be resolved.');
}

export function lowerDvinaTraceRequestIdentity(input) {
  return {
    party_id: input.party_id,
    scenario_id: input.scenario_id,
    scenario_definition_revision: input.scenario_definition_revision,
    scenario_manifest_digest: input.scenario_manifest_digest,
    world_revision_id: input.world_revision_id,
    world_catalog_digest: input.world_catalog_digest,
    domain_catalog_pin: structuredClone(input.domain_catalog_pin),
    materializer_version: input.materializer_version,
    rng_algorithm_id: input.rng_algorithm_id,
    seed_context: input.seed_context,
    idempotency_key: input.idempotency_key,
    trigger: input.trigger,
    occurrence: input.occurrence,
    existing_party_state: structuredClone(input.existing_party_state),
    ...(input.world_compatibility
      ? { world_compatibility: structuredClone(input.world_compatibility) }
      : {})
  };
}

export function failLowerDvinaTraceMaterialization(code, message, details = {}) {
  throw new MaterializationError(code, message, details);
}

const fail = failLowerDvinaTraceMaterialization;

function worldTupleIsDirectOrApprovedDescendant(spatial, input) {
  if (spatial?.world_revision_id === input.world_revision_id
    && spatial?.world_revision_catalog_digest === input.world_catalog_digest) {
    return true;
  }
  const compatibility = input.world_compatibility;
  const lineage = compatibility?.lineage;
  if (![LOWER_DVINA_TRACE_APPROVED_WORLD_COMPATIBILITY_DIGEST,
    LOWER_DVINA_TRACE_APPEARANCE_WORLD_COMPATIBILITY_DIGEST,
    LOWER_DVINA_TRACE_SPATIAL_SEMANTIC_WORLD_COMPATIBILITY_DIGEST,
    LOWER_DVINA_TRACE_REVISION26_WORLD_COMPATIBILITY_DIGEST]
      .includes(canonicalDigest(compatibility))
    || compatibility?.source_world_revision_id !== spatial?.world_revision_id
    || compatibility?.source_world_catalog_digest
      !== spatial?.world_revision_catalog_digest
    || compatibility?.source_status !== 'approved'
    || compatibility?.production_world_revision_id !== input.world_revision_id
    || compatibility?.production_world_catalog_digest
      !== input.world_catalog_digest
    || compatibility?.production_status !== 'approved'
    || !Array.isArray(lineage) || lineage.length === 0) {
    return false;
  }
  let parent = spatial.world_revision_id;
  for (const revision of lineage) {
    if (revision?.parent_revision_id !== parent
      || typeof revision.world_revision_id !== 'string'
      || !revision.world_revision_id
      || typeof revision.path !== 'string'
      || !revision.path
      || revision.status !== 'approved'
      || !/^[a-f0-9]{64}$/u.test(revision.digest ?? '')) {
      return false;
    }
    parent = revision.world_revision_id;
  }
  return parent === input.world_revision_id;
}

function exactIds(values, label) {
  if (!Array.isArray(values) || values.length === 0 || values.some((value) => typeof value !== 'string' || !value)
    || new Set(values).size !== values.length) {
    fail('TRACE_SEMANTIC_SET_INVALID', `The ${label} set is empty, ambiguous or malformed.`);
  }
  return new Set(values);
}

function requireRef(values, ref, label) {
  if (!values.has(ref)) fail('TRACE_SEMANTIC_REF_INVALID', `Unknown ${label} ref: ${String(ref)}.`);
}

function exactArtifactContractIdentity(key, artifact, pin) {
  if (key === 'item_inventory_profiles') return [pin.schema, pin.revision];
  if (key === 'spatial_manifest') return [artifact.schema_version, pin.revision];
  if (key === 'calendar_profile') return [pin.schema, pin.revision];
  return [artifact.schema, artifact.revision];
}
