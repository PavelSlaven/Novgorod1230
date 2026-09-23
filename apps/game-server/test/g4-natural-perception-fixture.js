import { readFile } from 'node:fs/promises';
import { buildG4NaturalCompiledRecords } from '../../../tools/runtime-catalog-activation/src/g4-natural-compiled-records.js';
import { buildG4NaturalPresentationCompiledRecords } from '../../../tools/runtime-catalog-activation/src/g4-natural-presentation-compiled-records.js';
import { buildG4NaturalPlacementCompiledRecords } from '../../../tools/runtime-catalog-activation/src/g4-natural-placement-compiled-records.js';
import { prepareG4NaturalScenePerceptionInput } from '../src/runtime/g4-natural-perception.js';

/** Real approved immutable authoring; current observations are controlled test facts. */
export async function approvedNaturalPerceptionFixture() {
  const read = async (path) => readFile(new URL(`../../../data/world-catalogs/novgorod/${path}`, import.meta.url), 'utf8');
  const natural = JSON.parse(await read('m2c-natural/candidate.json'));
  const candidateBytes = await read('m2c-natural-presentation/candidate.json');
  const approval = JSON.parse(await read('m2c-sol-data-approval.json'));
  const naturalRows = buildG4NaturalCompiledRecords({ candidate: natural });
  const presentationRows = buildG4NaturalPresentationCompiledRecords({ candidateBytes, approval });
  const placementBytes = await read('m2c-natural-placement/candidate.json');
  const placementRows = buildG4NaturalPlacementCompiledRecords({ candidateBytes: placementBytes, approval });
  const selected = presentationRows.find((row) => row.payload.layers.some((layer) => layer.channel === 'acoustic'));
  const profile = naturalRows.find((row) => row.payload.profile_id === selected.payload.natural_profile_ref.id).payload;
  const layers = profile.natural_profile.layer_applicability;
  const placement = placementRows[0].payload.placements.find((row) => row.natural_profile_ref.id === profile.profile_id);
  const scene_template_ref = { id: placement.scene_template_ref.id, version: placement.scene_template_ref.version };
  const pin = { compatible_world_revision_id: profile.g4_ref.world_revision_id,
    compatible_world_catalog_digest: 'a'.repeat(64), catalog_digest: 'b'.repeat(64) };
  const verifiedCatalog = { schema: 'rus.verified_item_catalog.v2', verified: true, pin,
    records_by_table: { procedural_scene_compiled_records: [...naturalRows, ...presentationRows, ...placementRows] } };
  const active = (id, extra) => ({ id, party_id: 'party:1', status: 'active', state_version: 1, ...extra });
  const currentFacts = {
    observer: { actor_id: 'player:1', party_id: 'party:1', position_id: 'position:inside',
      visual_capability: 'clear', hearing_capability: 'clear' },
    current_environment: { schema: 'rus.approved_initial_environment.v1', season: 'summer',
      light_state: 'daylight', weather_state: { weather_state_id: 'clear', visibility: 'normal' },
      calendar_record_ref: { id: layers.light.value.calendar_profile_ref, version: layers.light.value.calendar_profile_version },
      weather_record_ref: { id: layers.weather.value.weather_profile_ref, version: layers.weather.value.weather_profile_version } },
    scene: { party_id: 'party:1', baseline_id: 'baseline', site_id: 'site', visible_scene: 'Берег',
      g4_ref: profile.g4_ref, scene_template_ref,
      positions: [active('position:inside', { g6_instance_id: 'g6:inside', template_slot_key: 'inside', template_instance_ordinal: 0 }),
        active('position:shore', { g6_instance_id: 'g6:inside', template_slot_key: 'arrival', template_instance_ordinal: 0 })],
      g6: [active('g6:inside', { scene_baseline_id: 'baseline', scene_slot_key: placement.g6_scene_slot_key,
        ...placement.scene_physical_pins, enclosing_stable_structure_id: null })],
      acoustic_profiles: [{ party_id: 'party:1', g6_instance_id: 'g6:inside', ambient_noise: 0 }] },
    source_endpoint: { scene_template_id: scene_template_ref.id, scene_template_version: scene_template_ref.version,
      slot_key: 'arrival', endpoint_role: 'arrival', required_position_slot_key: 'arrival', required_position_instance_ordinal: 0 },
    source_bindings: [{ id: 'binding', party_id: 'party:1', status: 'active', g5_site_id: 'site',
      source_slot_key: 'arrival', position_id: 'position:shore' }],
    layer_admissions: selected.payload.layers.filter((layer) => layer.channel !== 'none').map((layer) => ({
      layer: layer.layer, source_state: 'present', ...(layer.channel === 'visual' ? { visual_conditions: {
        lighting: 'clear', stable_cover: 'clear', dynamic_occlusion: 'clear', concealment: 'clear', weather: 'clear' } } : { condition_losses: {} }) }))
  };
  const input = { verifiedCatalog, pin, currentFacts };
  const currentSourceState = { party_id: 'party:1', actor_id: 'player:1', position_id: 'position:inside',
    visual_capability: 'clear', hearing_capability: 'clear', current_environment: currentFacts.current_environment,
    source_observations: currentFacts.layer_admissions.map((row) => ({ layer: row.layer,
      source_position_id: 'position:shore', source_state: row.source_state,
      stable_cover: 'clear', dynamic_occlusion: 'clear', concealment: 'clear',
      ...(row.layer === 'audible_context' ? { current_water_source_state: 'moving_unfrozen', condition_losses: {} } : {}) })) };
  const sceneClosure = { header: { ...placement.scene_template_ref, world_revision_id: profile.g4_ref.world_revision_id, status: 'approved' },
    endpoint_slots: [currentFacts.source_endpoint] };
  return { input, perception: prepareG4NaturalScenePerceptionInput(input), candidateBytes, approval,
    placementBytes, placement, sceneClosure, currentSourceState,
    naturalProfile: naturalRows.find((row) => row.payload.profile_id === profile.profile_id) };
}
