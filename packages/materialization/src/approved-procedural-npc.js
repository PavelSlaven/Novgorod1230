import { deepFreeze } from '@rus/kernel';
import { materializeActorBaseAppearance } from './actor-base-appearance.js';
import { compileApprovedNpcRuntimeBasis } from './approved-npc-runtime-basis.js';
import { materializeActorBaseAttributes } from './actor-base-attributes.js';
import { deterministicInstanceId, MaterializationError } from './core.js';

export function materializeApprovedProceduralNpc({ party_id: partyId,
  run_id: runId, binding, approved_bundle: bundle, environment, random } = {}) {
  if (!text(partyId) || !text(runId)
      || binding?.schema !== 'rus.approved_procedural_npc_binding.v1'
      || binding.status !== 'approved'
      || !['background','scene','key'].includes(binding.profile_level)
      || ![binding.actor_slot_ref, binding.role_ref, binding.occupation_ref,
        binding.actor_profile_rule_ref, binding.demographic_profile_ref,
        binding.appearance_profile_ref, binding.anchor_id, binding.g5_node_id,
        binding.location_profile_ref, binding.zone_ref,
        binding.activity_record_ref, binding.world_revision_id].every(text)
      || !/^[a-f0-9]{64}$/.test(String(
        binding.profile_candidate_set_digest ?? ''))
      || !/^[a-f0-9]{64}$/.test(String(binding.profile_record_digest ?? ''))
      || bundle?.schema !== 'rus.procedural_actor_temporal_bundle.v1'
      || environment?.schema !== 'rus.approved_initial_environment.v1') {
    invalid('PROCEDURAL_NPC_INPUT_INVALID');
  }
  const role = exact(bundle.roles, 'role_id', binding.role_ref);
  const occupation = exact(bundle.occupations, 'occupation_id',
    binding.occupation_ref);
  const legal = exact(bundle.legal_status_archetypes, 'id',
    role.legal_status_archetype_id);
  const social = exact(bundle.social_position_archetypes, 'id',
    role.social_position_archetype_id);
  const roleArchetype = exact(bundle.role_archetypes, 'id',
    role.role_archetype_id);
  const occupationArchetype = exact(bundle.occupation_archetypes, 'id',
    occupation.occupation_archetype_id);
  const runtimeBasis = compileApprovedNpcRuntimeBasis({ role, occupation,
    season: environment.season, profile_level: binding.profile_level });
  const appearance = materializeActorBaseAppearance({ identity: {},
    approved_entries: actorAppearanceEntries(bundle.actor_profiles, binding),
    random, choice_key_prefix: `npc:${binding.actor_slot_ref}`,
    rule_id: binding.actor_profile_rule_ref });
  const attributes = materializeActorBaseAttributes({
    approved_bundle: binding.actor_base_attributes_bundle,
    occupation_archetype_id: occupation.occupation_archetype_id,
    actor_slot_ref: binding.actor_slot_ref,
    seed_basis: { world_revision_id: binding.world_revision_id,
      world_catalog_digest: binding.world_catalog_digest ?? null,
      materialization_seed: `${partyId}:${runId}` }
  });
  const activity = exact(bundle.temporal_records, 'record_id',
    binding.activity_record_ref);
  if (activity.record_kind !== 'activity_profile') {
    gap('PROCEDURAL_NPC_ACTIVITY_DATA_GAP');
  }
  const bodyEffects = (activity.payload?.body_effect_profile_refs ?? []).map(
    (ref) => exactTemporalEntity(bundle.temporal_records,
      'body_effect_profile', ref?.entity_ref?.entity_id));
  const equipmentRequired = activity.payload?.resource_requirements?.mode
    !== 'intrinsic_none' || binding.equipment_required === true;
  const equipment = binding.initial_equipment_candidates ?? [];
  const requiredEquipmentRefs = binding.activity_equipment_candidate_refs ?? [];
  if (equipmentRequired && (!Array.isArray(equipment)
      || !Array.isArray(requiredEquipmentRefs)
      || equipment.length === 0 || requiredEquipmentRefs.length === 0
      || binding.equipment_activation?.status !== 'active')) {
    gap('PROCEDURAL_NPC_EQUIPMENT_DATA_GAP');
  }
  if (equipmentRequired && (requiredEquipmentRefs.some((id) =>
    !equipment.some((candidate) => candidate.status === 'approved'
      && candidate.equipment_candidate_id === id
      && candidate.target_actor_slot_ref === binding.actor_slot_ref)))) {
    gap('PROCEDURAL_NPC_EQUIPMENT_DATA_GAP');
  }
  const body = binding.body_profile;
  if (body?.status !== 'approved' || !text(body.profile_id)
      || !text(body.source_ref) || !/^[a-f0-9]{64}$/.test(
        String(body.record_digest ?? ''))
      || !['health','energy','satiety'].every((key) =>
        Number.isFinite(body.values?.[key]))) {
    gap('PROCEDURAL_NPC_BODY_DATA_GAP');
  }
  const observable = binding.observable_activity;
  if (!text(observable?.value) || !text(observable?.source_ref)) {
    gap('PROCEDURAL_NPC_ACTIVITY_DATA_GAP');
  }
  const npcId = deterministicInstanceId(partyId, runId, 'npc',
    binding.actor_slot_ref, binding.ordinal ?? 0);
  const skills = (bundle.occupation_skill_defaults ?? []).filter((row) =>
    row.status === 'approved'
      && row.occupation_archetype_id === occupation.occupation_archetype_id)
    .sort((a, b) => String(a.skill_id).localeCompare(String(b.skill_id)));
  const publicLabel = role.role_title ?? occupation.occupation_title
    ?? binding.public_role_label;
  if (!text(publicLabel)) gap('PROCEDURAL_NPC_PUBLIC_LABEL_DATA_GAP');
  const identity = { ...structuredClone(appearance.identity),
    public_role_label: publicLabel };
  const npc = {
    instance_id: npcId, participant_slot_ref: binding.actor_slot_ref,
    profile_id: binding.actor_profile_rule_ref, profile_revision: 1,
    profile_level: binding.profile_level,
    anchor_id: binding.anchor_id,
    location_profile_ref: binding.location_profile_ref,
    zone_ref: binding.zone_ref,
    role_ref: { id: role.role_id, source: 'approved_social_roles' },
    occupation_ref: { id: occupation.occupation_id,
      source: 'approved_occupations' },
    identity_state: identity,
    appearance_contract_version: 'actor_base_appearance_v1',
    base_attributes: { contract_version: attributes.contract_version,
      values: structuredClone(attributes.values),
      profile_ref: structuredClone(attributes.profile_ref),
      generation: structuredClone(attributes.generation) },
    machine_state: { status: 'active', materialization_depth: 'full',
      schedule_state: 'working', current_activity: {
        activity_ref: activity.payload.activity_profile_id,
        activity_category_id: activity.payload.activity_category_id,
        status: 'active', can_continue_automatically: true,
        summary: observable.value, source_ref: observable.source_ref } },
    semantic_state: { scenario_function: 'ordinary_procedural_person',
      causal_basis: 'approved_procedural_binding',
      legal_status_ref: { id: legal.id, source: 'legal_status_archetypes' },
      social_position_ref: { id: social.id,
        source: 'social_position_archetypes' },
      attribute_basis: [{ id: roleArchetype.id,
        source: 'social_role_archetypes' }, { id: occupationArchetype.id,
        source: 'occupation_archetypes' }],
      behavior_basis: roleBehaviorBasis(role),
      approved_runtime_basis: runtimeBasis,
      body_time_effect_profile_refs: bodyEffects.map((record) =>
        record.payload?.body_effect_profile_id) },
    relationships: [], skill_profile_snapshot: { approved_defaults: skills },
    knowledge_profile_snapshot: { local: runtimeBasis.local_knowledge,
      routes: runtimeBasis.route_knowledge },
    schedule_records: [{ time_band: environment.day_part,
      schedule_profile_id: runtimeBasis.schedule.source_ref,
      g5_node_id: binding.g5_node_id }],
    body: structuredClone(body),
    profile_candidate_set_digest: binding.profile_candidate_set_digest,
    profile_record_digest: binding.profile_record_digest
  };
  return deepFreeze({ schema: 'rus.approved_procedural_npc_result.v1',
    version: 1, npc, choices: appearance.choices.map((choice) =>
      structuredClone(choice)),
    attribute_trace: structuredClone(attributes.trace),
    environment: structuredClone(environment),
    actor_candidate_instance_map: [{ actor_candidate_id: binding.actor_slot_ref,
      actor_instance_id: npcId, actor_kind: 'npc' }],
    initial_equipment_candidates:
      structuredClone(binding.initial_equipment_candidates ?? []) });
}

function roleBehaviorBasis(role) {
  return ['attitude_to_strangers','attitude_to_authority',
    'attitude_to_church','attitude_to_violence'].filter((field) =>
    text(role[field])).map((field) => ({
    source_ref: `approved_social_roles:${role.role_id}:${field}`,
    field, value: role[field]
  }));
}

function actorAppearanceEntries(records = {}, binding) {
  const profiles = [
    exact(records.region_demographic_profiles, 'id',
      binding.demographic_profile_ref),
    exact(records.region_appearance_profiles, 'id',
      binding.appearance_profile_ref)
  ];
  const profileIds = new Set(profiles.map(({ id }) => id));
  const entries = [...(records.region_demographic_profile_entries ?? []),
    ...(records.region_appearance_profile_entries ?? [])].filter((entry) =>
    entry.status === 'approved'
      && profileIds.has(entry.demographic_profile_id
        ?? entry.appearance_profile_id));
  return entries.map((entry) => {
    const option = exact(records.region_category_options, 'id', entry.option_id);
    const category = exact(records.universal_categories, 'id',
      option.category_id);
    return { entry_id: entry.id, facet: entry.facet,
      option_value: category.stable_code ?? category.preferred_label,
      weight: entry.weight, applicability: entry.applicability,
      applicable: true, status: 'approved' };
  });
}

function exactTemporalEntity(records, kind, id) {
  const matches = (records ?? []).filter((record) => record.status === 'approved'
    && record.payload?.[`${kind}_id`] === id);
  if (matches.length !== 1) gap('PROCEDURAL_NPC_TEMPORAL_DATA_GAP');
  return matches[0];
}
function exact(records, key, id) {
  const matches = (records ?? []).filter((record) => record?.[key] === id
    && record.status === 'approved');
  if (matches.length !== 1) gap('PROCEDURAL_NPC_APPROVED_RECORD_DATA_GAP');
  return matches[0];
}
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function gap(code) { throw new MaterializationError(code, code); }
function invalid(code) { throw new MaterializationError(code, code); }
