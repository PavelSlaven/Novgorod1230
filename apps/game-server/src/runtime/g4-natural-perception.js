import { projectSpatialV3NaturalScene } from '@rus/presentation/spatial-v3-projection';
import { loadApprovedG4NaturalPresentationCatalog, loadApprovedCanonicalNaturalInitialRule } from '@rus/runtime-catalog';
import { prepareG4NaturalBaseline } from './g4-natural-baseline.js';
import { serverError } from '../errors.js';

/** Called with a current read-only owner snapshot, never player request facts. */
export function prepareG4NaturalScenePerceptionInput({ verifiedCatalog, pin, currentFacts } = {}) {
  const { observer, scene, current_environment, source_endpoint, source_bindings,
    canonical_source_binding, layer_admissions } = currentFacts ?? {};
  const catalog = loadApprovedG4NaturalPresentationCatalog({ verifiedCatalog, pin });
  const baseline = prepareG4NaturalBaseline({ verifiedCatalog, pin,
    g4_ref: scene?.g4_ref, scene_template_ref: scene?.scene_template_ref, current_environment,
    member_selection: { party_id: scene?.party_id, g5_site_id: scene?.site_id } });
  const profiles = catalog.profiles.filter((row) => row.natural_profile_ref.id === baseline.profile_ref.id
    && row.natural_profile_ref.version === baseline.profile_ref.version
    && row.natural_profile_ref.payload_digest === baseline.profile_ref.payload_digest);
  const positions = scene?.positions?.filter((row) => row.template_slot_key === source_endpoint?.required_position_slot_key
    && row.template_instance_ordinal === source_endpoint?.required_position_instance_ordinal) ?? [];
  if (profiles.length !== 1 || positions.length !== 1
    || !['arrival', 'both'].includes(source_endpoint?.endpoint_role)
    || source_endpoint.scene_template_id !== scene?.scene_template_ref?.id
    || source_endpoint.scene_template_version !== scene?.scene_template_ref?.version
    || !Array.isArray(layer_admissions)) perceptionGap('exact_admitted_arrival_source_required');
  if (canonical_source_binding != null) {
    const binding = canonical_source_binding;
    if (binding.schema === 'rus.verified_canonical_scene_natural_source.v1') {
      if (binding.verified !== true || binding.party_id !== scene.party_id
        || binding.actor_id !== observer?.actor_id
        || binding.position_id !== observer.position_id
        || binding.g5_site_id !== scene.site_id || binding.baseline_id !== scene.baseline_id
        || binding.source_slot_key !== source_endpoint.slot_key) perceptionGap('verified_canonical_scene_source_required');
    } else {
      const approved = loadApprovedCanonicalNaturalInitialRule({ verifiedCatalog, pin, rule_ref: binding.rule_ref });
      const rule = approved.rule;
      const sourceG6 = scene.g6?.find((row) => row.id === positions[0].g6_instance_id);
      if (binding.schema !== 'rus.verified_canonical_initial_natural_source.v1' || binding.verified !== true
      || binding.party_id !== scene.party_id || binding.actor_id !== observer?.actor_id
      || binding.position_id !== positions[0].id || binding.position_id !== observer.position_id
      || binding.g5_site_id !== scene.site_id || binding.baseline_id !== scene.baseline_id
      || binding.scenario_id !== approved.scenario_id
      || binding.initial_request_identity?.party_id !== scene.party_id
      || binding.initial_request_identity?.scenario_id !== approved.scenario_id
      || !binding.initial_request_identity?.idempotency_key
      || binding.initial_snapshot_identity?.state_version !== 0 || !binding.initial_snapshot_identity?.state_digest
      || scene.g4_ref.id !== rule.g4_ref.id || scene.g4_ref.version !== rule.g4_ref.version
      || scene.scene_template_ref.id !== rule.scene_template_ref.id || scene.scene_template_ref.version !== rule.scene_template_ref.version
      || source_endpoint.slot_key !== rule.source_endpoint_slot_key
      || sourceG6?.scene_slot_key !== rule.g6_scene_slot_key
      || positions[0].template_slot_key !== rule.required_position_slot_key
      || positions[0].template_instance_ordinal !== rule.required_position_instance_ordinal) perceptionGap('verified_canonical_initial_source_required');
    }
  } else if (!Array.isArray(source_bindings) || source_bindings.length === 0
    || source_bindings.some((row) => row.party_id !== scene.party_id || row.status !== 'active'
      || row.g5_site_id !== scene.site_id || row.source_slot_key !== source_endpoint.slot_key
      || row.position_id !== positions[0].id)) perceptionGap('exact_committed_endpoint_binding_required');
  const profile = profiles[0]; const observations = [];
  for (const descriptor of profile.layers) {
    if (descriptor.channel === 'none'
      || baseline.layers.find((row) => row.layer === descriptor.layer)?.applicability !== 'present') continue;
    const admissions = layer_admissions.filter((row) => row.layer === descriptor.layer);
    if (admissions.length !== 1 || !(descriptor.channel === 'acoustic'
      && admissions[0].data_gap === 'current_water_source_state_required')
      && !['present', 'absent'].includes(admissions[0].source_state)) {
      perceptionGap('current_layer_source_admission_required');
    }
    const admission = admissions[0];
    if (admission.data_gap) {
      observations.push({ layer: descriptor.layer, source_position_id: positions[0].id,
        data_gap: admission.data_gap });
      continue;
    }
    observations.push({ layer: descriptor.layer, source_position_id: positions[0].id,
      active: admission.source_state === 'present',
      ...(descriptor.channel === 'visual' ? { visual_conditions: structuredClone(admission.visual_conditions) }
        : { condition_losses: structuredClone(admission.condition_losses ?? {}) }) });
  }
  const input = { natural_baseline: baseline, presentation_profile: profile,
    observer: structuredClone(observer), scene: structuredClone(scene), observations,
    ...(canonical_source_binding == null ? {} : { canonical_source_binding: structuredClone(canonical_source_binding) }) };
  // Reject incomplete conditions before the opening/arrival consumer runs.
  const result = projectSpatialV3NaturalScene(input);
  if (!result.ok) perceptionGap(result.error.reason);
  return input;
}

function perceptionGap(reason) {
  throw serverError('NATURAL_SCENE_PERCEPTION_DATA_GAP',
    'Current natural perception facts are unavailable.', { status: 409, details: { reason } });
}

/** Shared opening/arrival boundary. The caller loads exact current factual rows
 * and admitted sound/visual sources; no input is persisted by this projection. */
export function projectG4NaturalPerception({ input, partyId, actorId, positionId }) {
  if (input?.observer?.party_id !== partyId || input?.observer?.actor_id !== actorId
    || !positionId || input.observer.position_id !== positionId) {
    throw serverError('NATURAL_SCENE_PERCEPTION_DATA_GAP',
      'Natural perception does not match the current player position.', { status: 409 });
  }
  const result = projectSpatialV3NaturalScene(input);
  if (!result.ok) throw serverError(result.error.code,
    'Natural scene perception is unavailable.',
    { status: 409, details: { reason: result.error.reason } });
  return result;
}
