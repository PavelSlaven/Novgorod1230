import { loadApprovedG4NaturalPlacementCatalog } from '@rus/runtime-catalog';
import { serverError } from '../errors.js';

/** Translate approved placement/presentation policy and current owner facts to
 * P22 inputs. This does not create initial actor, weather or source state. */
export function resolveG4NaturalPerceptionConditions({ verifiedCatalog, pin, snapshot,
  sceneClosure, naturalProfile, current } = {}) {
  const catalog = loadApprovedG4NaturalPlacementCatalog({ verifiedCatalog, pin });
  const placements = catalog.placements.filter((row) =>
    row.natural_profile_ref.id === naturalProfile?.payload?.profile_id
    && row.natural_profile_ref.version === naturalProfile.payload.profile_version
    && row.natural_profile_ref.payload_digest === naturalProfile.payload_digest
    && row.scene_template_ref.id === sceneClosure?.header?.id
    && row.scene_template_ref.version === sceneClosure.header.version
    && row.scene_template_ref.canonical_digest === sceneClosure.header.canonical_digest);
  if (placements.length !== 1 || current?.party_id !== snapshot?.location?.party_id
    || current?.actor_id !== snapshot.location.owner_id
    || current?.position_id !== snapshot.location.scene_position_id) gap('exact_current_placement_required');
  const placement = placements[0];
  const policy = catalog.condition_policies.find((row) => exact(row, placement.condition_policy_ref));
  const endpoint = sceneClosure.endpoint_slots.filter((row) => row.slot_key === placement.source_endpoint_slot_key
    && row.endpoint_role === placement.source_endpoint_role
    && row.required_position_slot_key === placement.required_position_slot_key
    && row.required_position_instance_ordinal === placement.required_position_instance_ordinal);
  const g6 = snapshot.g6.filter((row) => row.scene_slot_key === placement.g6_scene_slot_key);
  if (endpoint.length !== 1 || g6.length !== 1
    || Object.entries(placement.scene_physical_pins).some(([key, value]) =>
      (key === 'enclosing_structure_slot_key' ? g6[0].enclosing_stable_structure_id : g6[0][key]) !== value)) {
    gap('exact_current_source_geometry_required');
  }
  const positions = snapshot.positions.filter((row) => row.g6_instance_id === g6[0].id
    && row.template_slot_key === placement.required_position_slot_key
    && row.template_instance_ordinal === placement.required_position_instance_ordinal);
  if (positions.length !== 1) gap('exact_current_source_geometry_required');
  const environment = current.current_environment;
  if (environment?.schema !== 'rus.approved_initial_environment.v1'
    || !exactVersion(environment.calendar_record_ref, policy.calendar_record_ref)
    || !exactVersion(environment.weather_record_ref, policy.weather_record_ref)
    || !policy.accepted_current_condition_values.includes(current.visual_capability)
    || !policy.accepted_current_condition_values.includes(current.hearing_capability)) gap('exact_current_actor_and_temporal_facts_required');
  const lighting = policy.lighting_by_light_state[environment.light_state];
  const weather = policy.weather_by_visibility[environment.weather_state?.visibility];
  if (![lighting, weather].every((value) => policy.accepted_current_condition_values.includes(value))) {
    gap('current_light_and_weather_policy_required');
  }
  const observation = (layer) => {
    const values = current.source_observations?.filter((row) => row.layer === layer
      && row.source_position_id === positions[0].id) ?? [];
    if (values.length !== 1) gap('current_source_evidence_required');
    return values[0];
  };
  const layer_admissions = placement.visual_layers.map((layer) => {
    const source = observation(layer);
    if (!policy.visual_source_rule.accepted_current_source_states.includes(source.source_state)) gap('current_source_evidence_required');
    if (source.source_state === 'absent') return { layer, source_state: 'absent' };
    if (policy.required_current_visual_fields.some((key) =>
      !policy.accepted_current_condition_values.includes(source[key]))) gap('current_visual_conditions_required');
    return { layer, source_state: 'present', visual_conditions: { lighting, weather,
      ...Object.fromEntries(policy.required_current_visual_fields.map((key) => [key, source[key]])) } };
  });
  layer_admissions.push(...placement.unplaced_visual_layers.map((layer) => ({ layer, source_state: 'absent' })));
  for (const layer of placement.acoustic_layers) {
    const source = observation(layer);
    const rule = catalog.acoustic_source_rules.find((row) => exact(row, placement.acoustic_source_rule_ref));
    const source_state = rule?.source_state_by_current_water?.[source.current_water_source_state];
    if (!['present', 'absent'].includes(source_state)) gap('current_causal_sound_evidence_required');
    layer_admissions.push({ layer, source_state, condition_losses: structuredClone(source.condition_losses ?? {}) });
  }
  return { source_endpoint_slot_key: placement.source_endpoint_slot_key,
    visible_scene: placement.visible_scene, visual_capability: current.visual_capability,
    hearing_capability: current.hearing_capability, current_environment: structuredClone(environment),
    layer_admissions, portal_profiles: structuredClone(current.portal_profiles ?? {}) };
}

function exact(row, ref) { return row.id === ref?.id && row.version === ref?.version; }
function exactVersion(row, ref) { return row?.id === ref?.id && String(row?.version) === String(ref?.version); }
function gap(reason) { throw serverError('NATURAL_SCENE_PERCEPTION_DATA_GAP',
  'Current natural perception conditions are unavailable.', { status: 409, details: { reason } }); }
