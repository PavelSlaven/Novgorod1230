import { createHash } from 'node:crypto';
import { canonicalStringify } from './canonical-records.js';
import { loadApprovedG4NaturalPresentationCatalog } from './g4-natural-presentation-catalog.js';
import { deepFreeze, fail } from './shared.js';

export function loadApprovedG4NaturalPlacementCatalog({ verifiedCatalog, pin } = {}) {
  const presentation = loadApprovedG4NaturalPresentationCatalog({ verifiedCatalog, pin });
  const rows = verifiedCatalog.records_by_table.procedural_scene_compiled_records
    .filter((row) => row.payload?.schema === 'rus.g4_natural_placement_catalog.v1');
  if (rows.length !== 1) invalid('exact_placement_catalog_required');
  const row = rows[0]; const payload = row.payload;
  if (row.record_kind !== 'profile' || row.record_id !== `profile:${payload.id}`
    || !Number.isSafeInteger(payload.version) || payload.version < 1
    || Number(row.version) !== payload.version
    || row.status !== 'approved_authoring_not_runtime_selectable'
    || row.payload_digest !== createHash('sha256').update(canonicalStringify(payload)).digest('hex')
    || payload.world_revision_id !== pin.compatible_world_revision_id
    || !/^[a-f0-9]{64}$/u.test(payload.source_candidate_sha256 ?? '')
    || !Array.isArray(payload.placements) || !payload.placements.length
    || !Array.isArray(payload.condition_policies) || !Array.isArray(payload.acoustic_source_rules)) invalid('catalog');
  const conditionValues = ['clear', 'partial', 'none'];
  const mapping = (value, allowed) => value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length > 0 && Object.values(value).every((entry) => allowed.includes(entry));
  const fields = (value, expected) => Array.isArray(value) && value.length === expected.length
    && new Set(value).size === expected.length && expected.every((entry) => value.includes(entry));
  if (payload.condition_policies.some((p) => !versioned(p)
    || !versioned(p.calendar_record_ref) || !versioned(p.weather_record_ref)
    || !mapping(p.lighting_by_light_state, conditionValues) || !mapping(p.weather_by_visibility, conditionValues)
    || !fields(p.accepted_current_condition_values, conditionValues)
    || !fields(p.required_current_visual_fields, ['stable_cover', 'dynamic_occlusion', 'concealment'])
    || !fields(p.required_current_actor_fields, ['visual_capability', 'hearing_capability'])
    || !fields(p.visual_source_rule?.accepted_current_source_states, ['present', 'absent']))
    || payload.acoustic_source_rules.some((rule) => !versioned(rule)
      || rule.source_state_field !== 'current_water_source_state'
      || !mapping(rule.source_state_by_current_water, ['present', 'absent']))) invalid('condition_policy');
  const seen = new Set();
  for (const placement of payload.placements) {
    const profile = presentation.profiles.filter((p) => p.id === placement.presentation_profile_ref?.id
      && p.version === placement.presentation_profile_ref?.version
      && canonicalStringify(p.natural_profile_ref) === canonicalStringify(placement.natural_profile_ref)
      && canonicalStringify(p.g4_ref) === canonicalStringify(placement.g4_ref));
    const key = `${placement.natural_profile_ref?.id}@${placement.natural_profile_ref?.version}:${placement.scene_template_ref?.id}@${placement.scene_template_ref?.version}:${placement.source_endpoint_slot_key}`;
    if (profile.length !== 1 || placement.world_revision_id !== payload.world_revision_id
      || !placement.id || !Number.isSafeInteger(placement.version) || placement.version < 1 || seen.has(key)
      || !/^[a-f0-9]{64}$/u.test(placement.scene_template_ref?.canonical_digest ?? '')
      || !['arrival', 'both'].includes(placement.source_endpoint_role)
      || !placement.source_endpoint_slot_key || !placement.g6_scene_slot_key || !placement.required_position_slot_key
      || !placement.scene_physical_pins || typeof placement.scene_physical_pins !== 'object'
      || !placement.visible_scene || typeof placement.visible_scene !== 'string'
      || !Number.isSafeInteger(placement.required_position_instance_ordinal) || placement.required_position_instance_ordinal < 0
      || !['visual_layers', 'acoustic_layers', 'unplaced_visual_layers', 'unprojected_layers'].every((field) => Array.isArray(placement[field]))
      || payload.condition_policies.filter((p) => exact(p, placement.condition_policy_ref)).length !== 1
      || (placement.acoustic_layers.length > 0 && payload.acoustic_source_rules.filter((p) => exact(p, placement.acoustic_source_rule_ref)).length !== 1)) invalid('placement');
    const groups = ['visual_layers', 'acoustic_layers', 'unplaced_visual_layers', 'unprojected_layers'];
    const layers = groups.flatMap((group) => placement[group]);
    if (layers.length !== profile[0].layers.length || new Set(layers).size !== layers.length
      || profile[0].layers.some((descriptor) => descriptor.channel === 'visual'
        ? ![...placement.visual_layers, ...placement.unplaced_visual_layers].includes(descriptor.layer)
        : !(descriptor.channel === 'acoustic' ? placement.acoustic_layers : placement.unprojected_layers).includes(descriptor.layer))) invalid('layer_channels');
    seen.add(key);
  }
  return deepFreeze({ ...structuredClone(payload), schema: 'rus.verified_g4_natural_placement_catalog.v1',
    verified: true, pin: structuredClone(pin) });
}
function exact(row, ref) { return row.id === ref?.id && row.version === ref?.version; }
function versioned(row) { return typeof row?.id === 'string' && row.id.length > 0
  && Number.isSafeInteger(row.version) && row.version > 0; }
function invalid(reason) { fail('G4_NATURAL_PLACEMENT_CATALOG_INVALID',
  'Exact activated natural placement membership is required.', { reason }); }
