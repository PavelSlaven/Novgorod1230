import { loadApprovedG4NaturalPlacementCatalog } from '@rus/runtime-catalog';
import { prepareG4NaturalBaseline } from '../../runtime/g4-natural-baseline.js';
import { readCurrentActorBodyCapability } from './spatial-v3-current-movement-capability.js';
import { approvedNaturalStableCover } from './g4-natural-perception-reader.js';
import { currentSceneVisibilityModifiers } from './spatial-v3-current-visibility-inputs.js';
import { serverError } from '../../errors.js';

/** Current source facts for canonical or generated G5 scenes, read in the caller's snapshot. */
export async function readCurrentNaturalSourceState({ transaction, partyId, actorId, snapshot,
  sceneClosure, naturalProfile, verifiedCatalog, pin, readCurrentEnvironment } = {}) {
  if (typeof transaction?.query !== 'function' || typeof readCurrentEnvironment !== 'function') {
    gap('current_temporal_owner_required');
  }
  const catalog = loadApprovedG4NaturalPlacementCatalog({ verifiedCatalog, pin });
  const placements = catalog.placements.filter((row) =>
    row.natural_profile_ref.id === naturalProfile?.payload?.profile_id
    && row.natural_profile_ref.version === naturalProfile.payload.profile_version
    && row.natural_profile_ref.payload_digest === naturalProfile.payload_digest
    && row.scene_template_ref.id === sceneClosure?.header?.id
    && row.scene_template_ref.version === sceneClosure.header.version
    && row.scene_template_ref.canonical_digest === sceneClosure.header.canonical_digest);
  if (placements.length !== 1 || snapshot?.location?.party_id !== partyId
    || snapshot.location.owner_id !== actorId) gap('exact_current_placement_required');
  const placement = placements[0];
  const sourceG6 = snapshot.g6.filter((row) => row.scene_slot_key === placement.g6_scene_slot_key
    && Object.entries(placement.scene_physical_pins).every(([key, value]) =>
      (key === 'enclosing_structure_slot_key' ? row.enclosing_stable_structure_id : row[key]) === value));
  const sourcePositions = snapshot.positions.filter((row) =>
    row.g6_instance_id === sourceG6[0]?.id
    && row.template_slot_key === placement.required_position_slot_key
    && row.template_instance_ordinal === placement.required_position_instance_ordinal);
  if (sourceG6.length !== 1 || sourcePositions.length !== 1) {
    gap('exact_current_source_geometry_required');
  }
  const modifiers = await transaction.query(`SELECT id,state_version,affected_scope_ref FROM party_runtime.visibility_modifiers
    WHERE party_id=$1`, [partyId]);
  if (!Array.isArray(modifiers?.rows)) gap('complete_current_visibility_required');
  if (currentSceneVisibilityModifiers(modifiers.rows, snapshot).length) {
    gap('visibility_modifier_effect_policy_required');
  }
  if (snapshot.portals.length) gap('p22_relation_conditions_required');
  const current_environment = await readCurrentEnvironment({ transaction, partyId, actorId });
  const body = await readCurrentActorBodyCapability({ transaction, partyId, actorId,
    purpose: 'perception' });
  const baseline = prepareG4NaturalBaseline({ verifiedCatalog, pin,
    g4_ref: naturalProfile.payload.g4_ref,
    scene_template_ref: { id: sceneClosure.header.id, version: sceneClosure.header.version },
    current_environment });
  const stable_cover = approvedNaturalStableCover(naturalProfile.payload);
  const source_observations = placement.visual_layers.map((layer) => ({ layer,
    source_position_id: sourcePositions[0].id,
    source_state: baseline.layers.find((row) => row.layer === layer)?.applicability === 'present'
      ? 'present' : 'absent',
    stable_cover, dynamic_occlusion: 'clear', concealment: 'clear' }));
  source_observations.push(...placement.acoustic_layers.map((layer) => ({ layer,
    source_position_id: sourcePositions[0].id,
    data_gap: 'current_water_source_state_required' })));
  return { party_id: partyId, actor_id: actorId,
    position_id: snapshot.location.scene_position_id, current_environment,
    visual_capability: body.visual_capability, hearing_capability: body.hearing_capability,
    source_observations,
    source_state_pins: { environment: {
      calendar_record_ref: current_environment.calendar_record_ref,
      weather_record_ref: current_environment.weather_record_ref },
    scene: [snapshot.site, snapshot.baseline, snapshot.location, ...snapshot.positions,
      ...snapshot.g6, ...snapshot.visibility_links, ...snapshot.acoustic_edges,
      ...snapshot.portals].map((row) => ({ id: row.id, state_version: row.state_version })),
    visibility_modifiers: [], body: body.dependency_pins } };
}

function gap(reason) { throw serverError('NATURAL_SCENE_PERCEPTION_DATA_GAP',
  'Current natural source state is unavailable.', { status: 409, details: { reason } }); }
