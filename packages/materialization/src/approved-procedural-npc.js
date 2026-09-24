import { deepFreeze } from '@rus/kernel';
import { materializeActorBaseAppearance, compileApprovedActorAppearanceEntries } from './actor-base-appearance.js';
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
        binding.activity_record_ref, binding.world_revision_id,
        binding.world_catalog_digest, binding.parent_seed_digest].every(text)
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
  if (binding.source_binding) {
    const source = binding.source_binding;
    const same = (left, right) => text(left?.id) && left.id === right?.id
      && Number.isSafeInteger(left.version) && left.version > 0 && left.version === right.version;
    if (source.world_revision_id !== binding.world_revision_id
      || !text(source.npc_binding_ref?.id)
      || !Number.isSafeInteger(source.npc_binding_ref.version) || source.npc_binding_ref.version < 1
      || source.npc_composition_ref?.id !== binding.location_profile_ref
      || !Number.isSafeInteger(source.npc_composition_ref.version) || source.npc_composition_ref.version < 1
      || !same(source.g4_ref, binding.g4_ref) || !same(source.regional_context_ref, binding.regional_context_ref)
      || Boolean(source.canonical_g5_ref) !== Boolean(binding.canonical_g5_ref)
      || Boolean(source.generation_template_ref) !== Boolean(binding.generation_template_ref)
      || !same(source.canonical_g5_ref ?? source.generation_template_ref,
        binding.canonical_g5_ref ?? binding.generation_template_ref)) gap('PROCEDURAL_NPC_SOURCE_BINDING_DATA_GAP');
  }
  const regionalContext = approvedRegionalContext(bundle, binding);
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
    approved_entries: compileApprovedActorAppearanceEntries({ records: bundle.actor_profiles,
      demographic_profile_ref: binding.demographic_profile_ref,
      appearance_profile_ref: binding.appearance_profile_ref }),
    random, choice_key_prefix: `npc:${binding.actor_slot_ref}`,
    rule_id: binding.actor_profile_rule_ref });
  const clothing = approvedClothing(bundle, binding, appearance.identity, environment.season);
  const attributes = materializeActorBaseAttributes({
    runtime_profile: binding.actor_base_attributes_runtime_profile,
    occupation_archetype_id: occupation.occupation_archetype_id,
    actor_slot_ref: binding.actor_slot_ref,
    seed_basis: { world_revision_id: binding.world_revision_id,
      world_catalog_digest: binding.world_catalog_digest,
      parent_seed_digest: binding.parent_seed_digest }
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
  const equipment = [...(binding.initial_equipment_candidates ?? []), ...clothing.candidates];
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
    .sort((a, b) => a.occupation_archetype_id.localeCompare(b.occupation_archetype_id));
  const publicLabel = role.role_title ?? occupation.occupation_title
    ?? binding.public_role_label;
  if (!text(publicLabel)) gap('PROCEDURAL_NPC_PUBLIC_LABEL_DATA_GAP');
  const identity = { ...structuredClone(appearance.identity),
    public_role_label: publicLabel };
  const npc = {
    instance_id: npcId, participant_slot_ref: binding.actor_slot_ref,
    profile_id: binding.source_binding?.npc_binding_ref.id ?? binding.actor_profile_rule_ref,
    profile_revision: binding.source_binding?.npc_binding_ref.version ?? 1,
    profile_level: binding.profile_level,
    anchor_id: binding.anchor_id,
    location_profile_ref: binding.location_profile_ref,
    zone_ref: binding.zone_ref,
    role_ref: { id: role.role_id, source: 'approved_social_roles' },
    occupation_ref: { id: occupation.occupation_id,
      source: 'approved_occupations' },
    identity_state: identity,
    appearance_contract_version: 'actor_base_appearance_v1',
    base_attributes: structuredClone(attributes),
    attribute_generation_gate: 'active',
    machine_state: { status: 'active', materialization_depth: 'full',
      schedule_state: 'working', current_activity: {
        activity_ref: activity.payload.activity_profile_id,
        activity_category_id: activity.payload.activity_category_id,
        status: 'active', can_continue_automatically: true,
        summary: observable.value, source_ref: observable.source_ref } },
    semantic_state: { scenario_function: 'ordinary_procedural_person',
      causal_basis: 'approved_procedural_binding',
      ...(binding.source_binding ? {
        source_binding: structuredClone(binding.source_binding),
        profile_revision: binding.source_binding.npc_binding_ref.version,
        participant_slot_ref: binding.actor_slot_ref,
        location_profile_ref: binding.location_profile_ref,
        zone_ref: binding.zone_ref
      } : {}),
      legal_status_ref: { id: legal.id, source: 'legal_status_archetypes' },
      social_position_ref: { id: social.id,
        source: 'social_position_archetypes' },
      attribute_basis: [{ id: roleArchetype.id,
        source: 'social_role_archetypes' }, { id: occupationArchetype.id,
        source: 'occupation_archetypes' }],
      behavior_basis: roleBehaviorBasis(role),
      approved_runtime_basis: runtimeBasis,
      ...(regionalContext ? { regional_context: regionalContext } : {}),
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
      structuredClone(equipment),
    ...(clothing.profile_ref ? { clothing_binding: {
      profile_ref: clothing.profile_ref, variant_id: clothing.variant_id,
      required_clothing_slot_refs: clothing.required_clothing_slot_refs } } : {}) });
}

function approvedClothing(bundle, binding, identity, season) {
  if (binding.clothing_profile_ref == null) return { candidates: [] };
  const ref = binding.clothing_profile_ref;
  const matches = (bundle.clothing_profiles ?? []).filter((row) => row.id === ref.id
    && row.version === ref.version && row.status === 'approved');
  const profile = matches[0];
  if (!text(ref.id) || !Number.isSafeInteger(ref.version) || ref.version < 1
    || matches.length !== 1 || profile.world_revision_id !== binding.world_revision_id
    || !Array.isArray(profile.allowed_role_refs) || !profile.allowed_role_refs.includes(binding.role_ref)
    || !Array.isArray(profile.allowed_occupation_refs) || !profile.allowed_occupation_refs.includes(binding.occupation_ref)
    || !['owner', 'holder', 'controller'].every((key) => profile.property_binding?.[key] === 'actor')
    || !text(profile.property_binding?.source_ref) || !Array.isArray(profile.variants)) {
    gap('PROCEDURAL_NPC_CLOTHING_DATA_GAP');
  }
  const variants = (profile.variants ?? []).filter((variant) =>
    Array.isArray(variant.sex_categories) && variant.sex_categories.includes(identity.sex_category)
      && Array.isArray(variant.age_categories) && variant.age_categories.includes(identity.age_category)
      && Array.isArray(variant.seasons) && variant.seasons.includes(season));
  const variant = variants[0];
  const slots = variant?.required_clothing_slot_refs;
  const templates = variant?.equipment_templates;
  if (variants.length !== 1 || !text(variant.id) || !Array.isArray(slots) || !slots.length
    || slots.some((slot) => !text(slot)) || new Set(slots).size !== slots.length
    || !Array.isArray(templates) || new Set(templates.map((row) => row.equipment_candidate_id)).size !== templates.length
    || templates.some((row) => row.status !== 'approved' || !text(row.equipment_candidate_id)
      || row.physical_position !== 'equipped' || !slots.includes(row.equipment_slot_category_id))
    || slots.some((slot) => templates.filter((row) => row.equipment_slot_category_id === slot).length !== 1)) {
    gap('PROCEDURAL_NPC_CLOTHING_DATA_GAP');
  }
  return { profile_ref: structuredClone(ref), variant_id: variant.id,
    required_clothing_slot_refs: structuredClone(slots), candidates: templates.map((template) => ({
      ...structuredClone(template), equipment_candidate_id: `${binding.actor_slot_ref}:${template.equipment_candidate_id}`,
      target_actor_slot_ref: binding.actor_slot_ref, owner_ref: binding.actor_slot_ref,
      holder_ref: binding.actor_slot_ref, controller_ref: binding.actor_slot_ref,
      instance_key: `${binding.actor_slot_ref}:${template.equipment_candidate_id}` })) };
}

function approvedRegionalContext(bundle, binding) {
  if (binding.regional_context_ref == null) return null;
  const ref = binding.regional_context_ref;
  const matches = (bundle.regional_context_profiles ?? []).filter((record) =>
    record?.id === ref.id && record.version === ref.version
      && record.status === 'approved');
  if (!text(ref.id) || !Number.isSafeInteger(ref.version) || ref.version < 1
      || matches.length !== 1) gap('PROCEDURAL_NPC_REGIONAL_CONTEXT_DATA_GAP');
  const profile = matches[0];
  const g4 = binding.g4_ref;
  const canonical = binding.canonical_g5_ref;
  const template = binding.generation_template_ref;
  const siteSource = canonical ?? template;
  if (profile.schema !== 'rus.npc_regional_context_profile.v1'
      || profile.world_revision_id !== binding.world_revision_id
      || g4?.world_revision_id !== binding.world_revision_id
      || !text(g4?.id) || !Number.isSafeInteger(g4?.version) || g4.version < 1
      || Boolean(canonical) === Boolean(template)
      || !text(siteSource?.id) || !Number.isSafeInteger(siteSource?.version)
      || siteSource.version < 1
      || !Array.isArray(profile.allowed_role_refs)
      || !profile.allowed_role_refs.includes(binding.role_ref)
      || !Array.isArray(profile.allowed_occupation_refs)
      || !profile.allowed_occupation_refs.includes(binding.occupation_ref)
      || !Array.isArray(profile.applicability)
      || !profile.applicability.some((row) =>
        row.g4_ref?.world_revision_id === binding.world_revision_id
          && row.g4_ref?.id === g4.id && row.g4_ref?.version === g4.version
          && (canonical ? (row.generation_template_ref == null
            && row.canonical_g5_ref?.id === canonical.id && row.canonical_g5_ref?.version === canonical.version)
            || (text(binding.canonical_source_generation_template_ref?.id)
              && Number.isSafeInteger(binding.canonical_source_generation_template_ref?.version)
              && row.canonical_g5_ref == null
              && row.generation_template_ref?.id === binding.canonical_source_generation_template_ref.id
              && row.generation_template_ref?.version === binding.canonical_source_generation_template_ref.version)
            : row.canonical_g5_ref == null && row.generation_template_ref?.id === template.id
              && row.generation_template_ref?.version === template.version))
      || !text(profile.origin?.label)
      || !text(profile.origin?.directness)
      || !text(profile.origin?.confidence)
      || !Array.isArray(profile.origin?.source_refs)
      || profile.origin.source_refs.length === 0
      || !profile.origin.source_refs.every(text)
      || !['unknown', 'authored'].includes(profile.language_status)
      || (profile.language_status === 'unknown'
        && profile.language_repertoire !== null)
      || (profile.language_status === 'authored'
        && (!Array.isArray(profile.language_repertoire)
          || profile.language_repertoire.length === 0
          || profile.language_repertoire.some((language) =>
            !text(language.language_ref) || !text(language.proficiency_ref)
              || !Array.isArray(language.source_refs)
              || language.source_refs.length === 0
              || !language.source_refs.every(text))))) {
    gap('PROCEDURAL_NPC_REGIONAL_CONTEXT_DATA_GAP');
  }
  return { profile_ref: structuredClone(ref),
    origin: structuredClone(profile.origin),
    language_status: profile.language_status,
    language_repertoire: structuredClone(profile.language_repertoire) };
}

function roleBehaviorBasis(role) {
  return ['attitude_to_strangers','attitude_to_authority',
    'attitude_to_church','attitude_to_violence'].filter((field) =>
    text(role[field])).map((field) => ({
    source_ref: `approved_social_roles:${role.role_id}:${field}`,
    field, value: role[field]
  }));
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
