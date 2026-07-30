import { canonicalDigest, MATERIALIZER_VERSION, MaterializationError, RNG_VERSION } from './core.js';
import {
  assertLowerDvinaTracePhase3Bindings,
  assertLowerDvinaTracePhase3Cutover,
  assertLowerDvinaTracePhase3PickupCutover
} from './lower-dvina-trace-phase-3-contract.js';
import {
  ARTIFACT_CONTRACTS,
  PHASE_3_ARTIFACT_CONTRACT_OVERRIDES,
  PHASE_3_PICKUP_ARTIFACT_CONTRACT_OVERRIDES,
  REQUIRED_ARTIFACTS
} from './lower-dvina-trace-artifact-contracts.js';

export const LOWER_DVINA_TRACE_SCENARIO_ID = 'lower_dvina_trace_v1';
export const LOWER_DVINA_TRACE_DEFINITION_REVISION = 7;
export const LOWER_DVINA_TRACE_PHASE_3_DEFINITION_REVISION = 8;
export const LOWER_DVINA_TRACE_PHASE_3_PICKUP_DEFINITION_REVISION = 9;
export const LOWER_DVINA_TRACE_ACCEPTANCE_SEED_CONTEXT = 'lower_dvina_trace_phase_1a_mikula_v1';
export const LOWER_DVINA_TRACE_APPROVED_WORLD_COMPATIBILITY_DIGEST =
  '0e239d47657a9bdf996f5a0cc5ca46e57e42a5326feb540d8acca747ad257b54';

export function assertLowerDvinaTraceRequest(input) {
  if (!input || typeof input !== 'object') fail('TRACE_MATERIALIZATION_REQUEST_INVALID', 'Materialization request is required.');
  const required = ['party_id', 'scenario_id', 'scenario_manifest_digest', 'world_revision_id', 'world_catalog_digest', 'materializer_version', 'rng_algorithm_id', 'seed_context', 'idempotency_key', 'trigger'];
  for (const key of required) if (typeof input[key] !== 'string' || !input[key]) fail('TRACE_MATERIALIZATION_REQUEST_INVALID', `Missing request field ${key}.`);
  if (input.scenario_id !== LOWER_DVINA_TRACE_SCENARIO_ID
    || ![
      LOWER_DVINA_TRACE_DEFINITION_REVISION,
      LOWER_DVINA_TRACE_PHASE_3_DEFINITION_REVISION,
      LOWER_DVINA_TRACE_PHASE_3_PICKUP_DEFINITION_REVISION
    ]
      .includes(input.scenario_definition_revision)) {
    fail(
      'TRACE_SCENARIO_REVISION_UNSUPPORTED',
      'Only approved Lower Dvina trace definition revisions 7, 8 and 9 are supported.'
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
  for (const key of REQUIRED_ARTIFACTS) {
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
  assertPhase1ACutoverIdentity(bundle, input.scenario_definition_revision);
  assertPhase1ABindings(bundle, input.scenario_definition_revision);
  return bundle;
}

function artifactContractFor(key, definitionRevision) {
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
  if (canonicalDigest(compatibility)
      !== LOWER_DVINA_TRACE_APPROVED_WORLD_COMPATIBILITY_DIGEST
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

function assertPhase1ABindings(bundle, definitionRevision) {
  const bindings = bundle.materialization_bindings;
  const phase3Definition = [
    LOWER_DVINA_TRACE_PHASE_3_DEFINITION_REVISION,
    LOWER_DVINA_TRACE_PHASE_3_PICKUP_DEFINITION_REVISION
  ].includes(definitionRevision);
  const expectedBindingId = phase3Definition
    ? definitionRevision
        === LOWER_DVINA_TRACE_PHASE_3_PICKUP_DEFINITION_REVISION
      ? 'lower_dvina_trace_phase_1a_materialization_bindings_v5'
      : 'lower_dvina_trace_phase_1a_materialization_bindings_v4'
    : 'lower_dvina_trace_phase_1a_materialization_bindings_v3';
  const expectedBindingDefinitionRevision =
    phase3Definition ? definitionRevision
      : LOWER_DVINA_TRACE_DEFINITION_REVISION;
  if (bindings.binding_set_id !== expectedBindingId
    || bindings.status !== 'approved'
    || bindings.scenario_id !== LOWER_DVINA_TRACE_SCENARIO_ID
    || bindings.scenario_definition_revision
      !== expectedBindingDefinitionRevision
    || bindings.fallback_policy !== 'forbidden'
    || bindings.normalization_policy !== 'forbidden') {
    fail('TRACE_PHASE_1A_BINDING_INVALID', 'Approved exact Phase-1A materialization bindings are required.');
  }
  const spatial = bindings.start_spatial_binding;
  const location = bundle.location_topology_set.location_profiles
    .filter((value) => value.location_profile_id === spatial?.location_profile_ref);
  const access = bundle.location_access_policies.access_policies
    .filter((value) => value.policy_id === spatial?.anchor_template?.state?.access_policy_ref);
  const capacity = bundle.location_capacity_contracts.capacity_contracts
    .filter((value) => value.contract_id === spatial?.anchor_template?.state?.capacity_contract_ref);
  const zone = capacity[0]?.zones?.filter((value) => value.zone_id === spatial?.anchor_template?.slot_key);
  const anchor = spatial?.anchor_template;
  if (location.length !== 1 || access.length !== 1 || capacity.length !== 1 || zone?.length !== 1
    || spatial.node_template_ref !== location[0].scene_template_ref
    || spatial.node_slot_ref !== location[0].location_profile_id
    || capacity[0].location_ref !== location[0].location_profile_id
    || capacity[0].decision_anchor !== anchor.slot_key
    || access[0].location_ref !== location[0].location_profile_id
    || anchor.state.zone_ref !== anchor.slot_key
    || anchor.npc_capacity !== zone[0].max_actors
    || !anchor.template_id
    || ![anchor.npc_capacity, anchor.item_capacity, anchor.container_capacity]
      .every((value) => Number.isInteger(value) && value >= 0)) {
    fail('TRACE_START_SPATIAL_BINDING_INCOMPLETE', 'Start G5 node/anchor template and capacities must resolve exactly.');
  }
  if (phase3Definition) {
    assertLowerDvinaTracePhase3Bindings(bundle, fail);
  }

  const dossier = bindings.player_dossier_projection;
  const playerKnowledge = bundle.knowledge_lie_memory_rules.participant_knowledge_bindings
    .filter((value) => value.participant_ref === 'player_clerk');
  const knife = bundle.item_container_set.item_templates
    .filter((value) => value.item_template_id === 'trace_ld_v1_item_mikula_knife');
  const startYear = Number(bundle.body_environment_profiles.start_timestamp_specification
    ?.calendar_date_contract?.exact_date?.year);
  const itemProjection = dossier?.inventory_item_projections?.[knife[0]?.item_template_id];
  if (playerKnowledge.length !== 1 || knife.length !== 1
    || dossier?.historical_year !== startYear
    || dossier.knowledge?.region_id !== location[0].region_ref
    || dossier.knowledge?.current_year !== startYear
    || canonicalDigest(dossier.knowledge?.initially_forbidden_categories)
      !== canonicalDigest(playerKnowledge[0].initially_forbidden_categories)
    || dossier.start_place_connection?.selected_candidate_id !== location[0].location_profile_id
    || dossier.start_place_connection?.region_id !== location[0].region_ref
    || dossier.start_place_connection?.year !== startYear
    || !dossier.start_place_connection?.reason
    || !dossier.goals?.immediate_need
    || !dossier.goals?.consequence_of_inaction
    || itemProjection?.use !== knife[0].causal_basis
    || !Array.isArray(itemProjection?.risk)
    || itemProjection.risk.length !== 0
    || !itemProjection?.condition_state
    || !itemProjection?.legal_status
    || !itemProjection?.physical_position
    || !itemProjection?.claim_state
    || !Array.isArray(dossier.property_and_access?.rules)
    || dossier.property_and_access.rules.length !== 0
    || !Array.isArray(dossier.relations)
    || dossier.relations.length !== 0
    || !Array.isArray(dossier.approved_empty_collections)
    || canonicalDigest(dossier.approved_empty_collections) !== canonicalDigest([
      'inventory_item_projections.trace_ld_v1_item_mikula_knife.risk',
      'property_and_access.rules',
      'relations'
    ])
    || dossier.audit_self_check?.pass !== true) {
    fail('TRACE_PLAYER_DOSSIER_BINDING_INCOMPLETE', 'Player dossier semantics must resolve from the approved Phase-1A binding.');
  }
}

function assertPhase1ACutoverIdentity(bundle, definitionRevision) {
  if (definitionRevision
      === LOWER_DVINA_TRACE_PHASE_3_PICKUP_DEFINITION_REVISION) {
    assertLowerDvinaTracePhase3PickupCutover(bundle, fail);
    return;
  }
  if (definitionRevision === LOWER_DVINA_TRACE_PHASE_3_DEFINITION_REVISION) {
    assertLowerDvinaTracePhase3Cutover(bundle, fail);
    return;
  }
  const manifest = bundle.phase_1a_manifest;
  const bindings = bundle.materialization_bindings;
  const definition = bundle.definition;
  const body = bundle.body_environment_profiles;
  if (manifest.package_id !== 'lower_dvina_trace_phase_1a_v3'
    || manifest.superseded_package_ref?.path
      !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v2/manifest.json'
    || manifest.superseded_package_ref.id
      !== 'lower_dvina_trace_phase_1a_v2'
    || manifest.superseded_package_ref.revision !== 2
    || manifest.superseded_package_ref.schema
      !== 'rus.lower_dvina_trace_phase_1a_manifest.v1'
    || manifest.superseded_package_ref.digest
      !== 'c6fcf966ff9638d6649eca90fd7ec45c8252620ce02908c4354e9bd934d0f895'
    || manifest.base_definition_ref?.path
      !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d-v4/manifest.json'
    || manifest.base_definition_ref.package_id
      !== 'lower_dvina_trace_phase_0d_v4'
    || manifest.base_definition_ref.revision !== 4
    || manifest.base_definition_ref.digest
      !== '2a8ed0f73f1ca9b8d10cf4d962fcf16d3064839d176f6e4a29a3d73617d26d91'
    || bindings.superseded_binding_ref?.path
      !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v2/materialization-bindings.json'
    || bindings.superseded_binding_ref.id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v2'
    || bindings.superseded_binding_ref.revision !== 2
    || bindings.superseded_binding_ref.schema
      !== 'rus.lower_dvina_trace_phase_1a_materialization_bindings.v1'
    || bindings.superseded_binding_ref.digest
      !== 'c1590cdf9e52577d062501d928d11ce5a75c05805cef9a2389a51c1af776b50b'
    || definition.supersedes_definition_ref?.path
      !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d-v3/definition.json'
    || definition.supersedes_definition_ref.id
      !== LOWER_DVINA_TRACE_SCENARIO_ID
    || definition.supersedes_definition_ref.revision !== 6
    || definition.supersedes_definition_ref.digest
      !== '3f181993af99ddd7e7d3c0292ac853e168960b99f5cc2c06aaaddd13b8db703c'
    || body.supersedes_ref?.path
      !== 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d-v3/body-environment-profiles.json'
    || body.supersedes_ref.id
      !== 'trace_ld_v1_body_environment_profiles'
    || body.supersedes_ref.revision !== 3
    || body.supersedes_ref.digest
      !== 'd6481bdb2b460d13a3beb37486e325a37401ce0de9aa813930308e1e96f0cd26') {
    fail(
      'TRACE_PHASE_1A_CUTOVER_IDENTITY_INVALID',
      'Phase 1A revision 7 must exact-supersede the immutable revision 6 chain.'
    );
  }
}
