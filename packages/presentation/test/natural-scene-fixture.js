export function naturalSceneFixture() {
  const row = (id, fields) => ({ id, party_id: 'party:1', status: 'active', state_version: 1, ...fields });
  const g4_ref = { id: 'g4', version: 1, world_revision_id: 'world' };
  const scene_template_ref = { id: 'template', version: 1 };
  return { natural_baseline: { schema: 'rus.g4_natural_baseline.v1', g4_ref,
    scene_template_ref, profile_ref: { id: 'natural', version: 1, payload_digest: 'a'.repeat(64) },
    layers: [{ layer: 'surface', applicability: 'present', value: { class: 'machine-only-substrate' } },
      { layer: 'audible_context', applicability: 'present', value: { class: 'machine-only-sound' } },
      { layer: 'tree_layer', applicability: 'not_applicable', value: null }] },
    presentation_profile: { id: 'natural-text', version: 1, status: 'approved',
      natural_profile_ref: { id: 'natural', version: 1, payload_digest: 'a'.repeat(64) },
      layers: [{ layer: 'surface', channel: 'visual', clear_text: 'Под ногами влажный ил.',
        partial_text: 'Внизу различима неровная поверхность.' },
      { layer: 'audible_context', channel: 'acoustic', loudness: 2,
        clear_text: 'Слышно движение воды.', partial_text: 'Доносится неясный шум.' }] },
    observer: { actor_id: 'player:1', party_id: 'party:1', position_id: 'position:inside',
      visual_capability: 'clear', hearing_capability: 'clear' },
    scene: { party_id: 'party:1', baseline_id: 'baseline', g4_ref, scene_template_ref,
      visible_scene: 'Берег', positions: [row('position:inside', { g6_instance_id: 'g6:inside' }),
        row('position:shore', { g6_instance_id: 'g6:inside' })],
      g6: [row('g6:inside', { scene_baseline_id: 'baseline', intra_g6_visibility_mode: 'default_clear', acoustic_uniformity: 'uniform' })],
      acoustic_profiles: [{ party_id: 'party:1', g6_instance_id: 'g6:inside', ambient_noise: 0 }] },
    observations: [{ layer: 'surface', source_position_id: 'position:shore', visual_conditions: {
      lighting: 'clear', stable_cover: 'clear', dynamic_occlusion: 'clear', concealment: 'clear', weather: 'clear' } },
      { layer: 'audible_context', source_position_id: 'position:shore', condition_losses: {} }] };
}
