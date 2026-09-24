import { computeMaterializationEnvelopeDigest } from '@rus/contracts';
import { deepFreeze } from '@rus/kernel';
import { createNpcRoutineState, npcRoutineActivity } from '@rus/npc-runtime';
import { canonicalDigest, createRandomSource, deriveSeed, deterministicInstanceId,
  MaterializationError } from './core.js';
import { deriveApprovedInitialEnvironment } from './approved-initial-environment.js';
import { materializeActorBaseAttributes } from './actor-base-attributes.js';
import { compileApprovedActorAppearanceEntries, materializeActorBaseAppearance } from './actor-base-appearance.js';
import { materializeSpatialV3GeneratedScene } from './spatial-v3-generated-scene.js';
import { compileGeneratedNpcBindings } from './generated-npc-bindings.js';
import { materializeApprovedProceduralNpc } from './approved-procedural-npc.js';
import { materializeApprovedActorEquipment } from './approved-actor-equipment.js';

/** Canonical branch of the existing authored-start owner; all outputs are proposals. */
export function materializeCanonicalAuthoredStart({ input, profile, admission, identity }) {
  const source = profile.canonical_start;
  const transfer = source.player_transfer; const basis = source.player_basis;
  const start = source.start; const placement = start?.initial_placement;
  const actorBundle = input.approved_actor_temporal_bundle;
  const npcClosure = input.canonical_npc_closure;
  if (!transfer || !basis || !placement || source.approved !== true
    || identity.scenario_id !== start.scenario_id
    || identity.scenario_manifest_digest !== profile.manifest_digest
    || identity.world_revision_id !== start.world_pin.world_revision_id
    || identity.world_catalog_digest !== start.world_pin.world_catalog_digest
    || input.domain_catalog_pin.compatible_world_revision_id !== identity.world_revision_id
    || input.domain_catalog_pin.compatible_world_catalog_digest !== identity.world_catalog_digest
    || actorBundle?.schema !== 'rus.procedural_actor_temporal_bundle.v1'
    || actorBundle.world_pin?.world_revision_id !== identity.world_revision_id
    || actorBundle.world_pin?.world_catalog_digest !== identity.world_catalog_digest
    || input.actor_base_attributes_runtime_profile?.catalog_revision_id !== start.new_game_stage_bindings.actor_catalog_revision_id
    || !npcClosure || npcClosure.canonical_g5_ref?.id !== placement.canonical_g5_ref.id
    || npcClosure.canonical_g5_ref?.version !== placement.canonical_g5_ref.version
    || npcClosure.world_revision_id !== identity.world_revision_id
    || npcClosure.g4_ref?.id !== placement.g4_ref.id || npcClosure.g4_ref?.version !== placement.g4_ref.version
    || input.actor_equipment_activation?.status !== 'active') gap('CANONICAL_START_RUNTIME_DEPENDENCIES_REQUIRED');
  const seed = deriveSeed(identity);
  const random = createRandomSource({ seed: seed.uint32, version: input.rng_algorithm_id });
  const runId = `authored_${seed.digest.slice(0, 24)}`;
  const id = (kind, slot) => deterministicInstanceId(input.party_id, runId, kind, slot, 0);
  const playerId = id('player_character', 'player');
  const nodeId = id('g5_node', profile.geometry.start.slot_key);
  const anchorId = id('g5_anchor', profile.geometry.start.anchor_slot_key);
  const siteId = `g5:${nodeId}`; const baselineId = `baseline:${nodeId}`;
  // Stage 24 stamps the actual commit change set on the proposal before writing.
  const prepared = materializeSpatialV3GeneratedScene({ party_id: input.party_id,
    site_id: siteId, baseline_id: baselineId, change_set_id: `proposal:${runId}`,
    materializer_version: input.materializer_version, materialization_trace_id: runId,
    canonical_g5: admission.spatial_closures[0].binding,
    scene_closure: admission.spatial_closures[0].closure,
    acoustic_rows: input.canonical_acoustic_rows, dependency_pins: input.world_base_reference_snapshot.dependency_pins });
  if (!prepared.ok) gap('CANONICAL_START_SCENE_CLOSURE_REQUIRED', prepared.error);
  const scene = prepared.proposal;
  const endpoints = scene.endpoints.filter((row) => row.slot_key === placement.scene_endpoint_slot_key);
  if (endpoints.length !== 1) gap('CANONICAL_START_ENDPOINT_REQUIRED');
  const endpoint = endpoints[0];
  const temporal = (ref) => {
    const rows = actorBundle.temporal_records?.filter((row) => row.record_id === ref.id
      && Number(row.version) === ref.version && row.status === 'approved') ?? [];
    if (rows.length !== 1) gap('CANONICAL_START_TEMPORAL_REQUIRED');
    return rows[0];
  };
  const environmentInput = start.initial_environment_inputs;
  const calendar = temporal(environmentInput.calendar_record_ref);
  if (input.calendar_profile?.provenance?.source_id !== calendar.record_id
    || Number(input.calendar_profile?.provenance?.source_version) !== Number(calendar.version)) {
    gap('CANONICAL_START_TEMPORAL_REQUIRED');
  }
  const environment = deriveApprovedInitialEnvironment({ calendar_record: calendar,
    weather_record: temporal(environmentInput.weather_record_ref),
    calendar_date: environmentInput.calendar_date,
    local_minute_of_day: environmentInput.local_minute_of_day, random });
  const appearance = materializeActorBaseAppearance({ identity: {
    character_id: playerId, name: profile.player.name, canonical_name: profile.player.name,
    ...basis.appearance.identity_intent },
  approved_entries: compileApprovedActorAppearanceEntries({ records: actorBundle.actor_profiles,
    demographic_profile_ref: basis.appearance.demographic_profile_ref,
    appearance_profile_ref: basis.appearance.appearance_profile_ref }),
  random, choice_key_prefix: 'player:player' });
  const attributes = materializeActorBaseAttributes({
    runtime_profile: input.actor_base_attributes_runtime_profile,
    occupation_archetype_id: transfer.attribute_transfer.occupation_archetype_id,
    actor_slot_ref: 'player', seed_basis: { world_revision_id: input.world_revision_id,
      world_catalog_digest: input.world_catalog_digest, parent_seed_digest: seed.digest } });
  if (attributes.profile_ref.digest !== transfer.attribute_transfer.profile_ref.digest) gap('CANONICAL_START_PLAYER_ATTRIBUTE_PIN_REQUIRED');
  const npcPlan = compileGeneratedNpcBindings({ party_id: input.party_id, run_id: runId,
    scene, closure: npcClosure, approved_bundle: actorBundle, environment,
    actor_base_attributes_runtime_profile: input.actor_base_attributes_runtime_profile,
    equipment_activation: input.actor_equipment_activation, world_catalog_digest: input.world_catalog_digest,
    equipment_catalog_digest: input.domain_catalog_pin.catalog_digest });
  const npcResults = npcPlan.npc_inputs.map((npcInput) => {
    const result = materializeApprovedProceduralNpc({ ...npcInput, party_id: input.party_id, run_id: runId });
    const npc = structuredClone(result.npc);
    npc.position_id = npcInput.position_id;
    npc.routine_state = createNpcRoutineState({ profile: npcInput.routine_profile,
      calendar_profile: input.calendar_profile, started_at: environmentInput.game_timestamp,
      current_activity: npc.machine_state.current_activity });
    npc.machine_state.current_activity = npcRoutineActivity(npc.routine_state);
    npc.machine_state.current_activity_ref = npc.machine_state.current_activity.activity_ref;
    npc.machine_state.runtime_status = npc.routine_state.runtime_status;
    npc.machine_state.schedule_state = npc.routine_state.profile.phases[npc.routine_state.phase_index].state_id;
    return { ...result, npc };
  });
  const equipment = transfer.clothing_transfer;
  const playerEquipment = equipment.equipment_entries.map((entry) => ({ ...entry,
    equipment_candidate_id: `player:${entry.item_template_ref}`, status: 'approved',
    target_actor_slot_ref: 'player', owner_ref: 'player', holder_ref: 'player', controller_ref: 'player',
    condition_state: equipment.condition_state, physical_position: equipment.physical_position,
    legal_status: equipment.legal_status, claim_state: equipment.claim_state }));
  const runtimeRows = npcClosure.runtime_profiles;
  const equipmentRows = (kind) => runtimeRows.filter((row) => row.profile_kind === kind
    && row.status === 'approved' && row.world_revision_id === input.world_revision_id).map((row) => row.payload);
  const materializedEquipment = materializeApprovedActorEquipment({
    party_id: input.party_id, world_revision_id: input.world_revision_id, request_id: input.idempotency_key,
    run_id: runId, g4_id: placement.g4_ref.id, catalog_digest: input.domain_catalog_pin.catalog_digest,
    actor_candidate_instance_map: [{ actor_candidate_id: 'player', actor_instance_id: playerId,
      actor_kind: 'player_character' }, ...npcResults.flatMap((row) => row.actor_candidate_instance_map)],
    initial_equipment_candidates: [...playerEquipment,
      ...npcResults.flatMap((row) => row.initial_equipment_candidates)],
    item_templates: equipmentRows('item_template'), item_inventory_profiles: equipmentRows('item_inventory'),
    item_visual_profiles: equipmentRows('item_visual') });
  const body = { profile_id: transfer.body_transfer.profile_id, schema: 'rus.body_state.profile.v1',
    version: 1, values: structuredClone(transfer.body_transfer.metrics), conditions: [], condition_bindings: [] };
  body.record_digest = canonicalDigest(body);
  const geometry = profile.geometry.start;
  const immediate = { player: { instance_id: playerId, base_attributes: attributes, attribute_generation_gate: 'active',
    dossier: { identity: appearance.identity, social_status: { social_role_id: profile.player.role_id,
      occupation_id: profile.player.occupation_id, display_name: profile.player.role_label,
      legal_status: transfer.applicability.legal_status, social_status_band: transfer.applicability.social_status_band },
    attributes: Object.fromEntries(Object.entries(attributes.values).map(([key, value]) => [key, { value }])),
    skills: structuredClone(basis.skills.values), language: Object.fromEntries(
      ['profile_id', 'speech_scope', 'foreign_language_claims', 'literacy'].map((key) => [key, structuredClone(basis.language[key])])),
    knowledge: Object.fromEntries(Object.entries(basis.knowledge).filter(([, value]) => Array.isArray(value))) } },
  spatial: { node: { instance_id: nodeId, parent_g4_id: placement.g4_ref.id,
    template_id: placement.scene_template_ref.id, slot_key: geometry.slot_key,
    state: { location_profile_ref: geometry.location_profile_id,
      canonical_g5_ref: placement.canonical_g5_ref, environment_profile_ref: null } },
  anchor: { instance_id: anchorId, node_id: nodeId, template_id: geometry.anchor_template_id,
    slot_key: geometry.anchor_slot_key, npc_capacity: geometry.capacities.npc,
    item_capacity: geometry.capacities.item, container_capacity: geometry.capacities.container,
    state: { access_class: 'ordinary_shared' } },
  position: { g4_id: placement.g4_ref.id, g5_node_id: nodeId, g5_anchor_id: anchorId } },
  body, items: materializedEquipment.item_instances, containers: [], prepared_scenes: [],
  timestamp: structuredClone(environmentInput.game_timestamp), environment_snapshot: environment,
  npcs: npcResults.map((row) => row.npc) };
  const resolved = admission.spatial_closures[0];
  const g6 = resolved.closure.g6_slots.find((row) => row.scene_slot_key === placement.g6_scene_slot_key);
  const initialSpatial = { canonical_g5_ref: { entity_kind: 'canonical_spatial_node',
    entity_id: placement.canonical_g5_ref.id, authoring_version: String(placement.canonical_g5_ref.version) },
  materialization_profile_ref: { entity_kind: 'scene_materialization_profile',
    entity_id: placement.scene_materialization_profile_ref.id,
    authoring_version: String(placement.scene_materialization_profile_ref.version) },
  scene_template_ref: { entity_ref: { entity_kind: 'scene_template', entity_id: placement.scene_template_ref.id },
    authoring_version: String(placement.scene_template_ref.version) },
  node_id: nodeId, anchor_id: anchorId, g6, position: resolved.position,
  canonical_scene_proposal: scene, selected_position_id: endpoint.position_id };
  const policies = source.policy_profile_pins;
  const choices = [{ choice_key: 'player_profile', slot_key: 'player_profile',
    candidate_set_digest: canonicalDigest([profile.player.name]), candidate_ids: [profile.player.name],
    selected_id: profile.player.name, rng_draw: 0 }, ...appearance.choices,
  ...npcResults.flatMap((row) => row.choices), ...materializedEquipment.materialization_run.choices]
    .map((choice, index) => ({ ...choice, choice_ordinal: index, slot_key: choice.slot_key ?? choice.choice_key }));
  const trace = { run_id: runId, idempotency_key: input.idempotency_key,
    materializer_version: input.materializer_version, rng_version: input.rng_algorithm_id,
    seed_context: identity, seed_digest: seed.digest, input_digest: canonicalDigest(identity),
    world_revision_id: input.world_revision_id, catalog_digest: input.domain_catalog_pin.catalog_digest,
    catalog_bundle_digest: admission.domain_catalog_bundle_digest, actor_catalog_digest: admission.actor_catalog_digest,
    scenario_manifest_digest: input.scenario_manifest_digest, policy_profile_pins: policies,
    policy_profile_pin_digest: canonicalDigest(policies), choices,
    rng_draw_count: random.drawCount + npcPlan.npc_inputs.reduce((sum, row) => sum + row.random.drawCount, 0)
      + npcPlan.selection_trace.choices.length + materializedEquipment.materialization_run.rng_draw_count,
    initial_actor_equipment_materialization: materializedEquipment.materialization_run,
    player_attribute_trace: attributes.trace, npc_selection_trace: npcPlan.selection_trace,
    actor_base_attributes_catalog_pin: Object.fromEntries(['catalog_scope', 'catalog_revision_id',
      'catalog_digest', 'activation_event_id', 'import_id', 'import_audit_digest',
      'record_registry_digest', 'runtime_contract_digest'].map((key) =>
      [key, input.actor_base_attributes_runtime_profile[key]])) };
  const result = { version: 3, schema: 'rus.authored_start_party_materialization_result.v3',
    status: 'materialized', party_id: input.party_id, run_id: runId, request_identity: identity,
    immediate, initial_spatial_v3: initialSpatial, hidden_truth: { kind: 'none', digest: canonicalDigest({ kind: 'none' }) },
    sealed_selections: [], policy_profile_pins: policies, validation_report: {
      ...admission.validation_report,
      resolved_actor_refs: [...admission.validation_report.resolved_actor_refs,
        ...npcResults.map(({ npc }) => ({ actor_ref: npc.participant_slot_ref,
          role_id: npc.role_ref.id, occupation_id: npc.occupation_ref.id,
          runtime_basis: npc.semantic_state.approved_runtime_basis }))]
    }, trace };
  trace.result_digest = computeMaterializationEnvelopeDigest(result);
  return deepFreeze(result);
}
function gap(code, details = {}) { throw new MaterializationError(code, 'Exact approved canonical start dependencies are required.', details); }
