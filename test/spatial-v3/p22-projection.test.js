import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSpatialV3AcousticResolver,
  createSpatialV3PlayerProjection,
  createSpatialV3ProjectionPanels,
  createSpatialV3VisibilityResolver,
  deriveSpatialV3Interaction,
  projectSpatialV3NavigationBelief,
  projectSpatialV3RouteOptions
} from '@rus/presentation/spatial-v3-projection';

test('P22 resolves directed visibility without coordinates and honours portal states', () => {
  const resolver = createSpatialV3VisibilityResolver({
    positions: [{ id: 'a', g6_id: 'room' }, { id: 'b', g6_id: 'room' }, { id: 'c', g6_id: 'yard' }],
    g6: [{ id: 'room', intra_g6_visibility_mode: 'default_clear' }, { id: 'yard', intra_g6_visibility_mode: 'explicit' }],
    links: [{ from_position_id: 'b', to_position_id: 'c', base_result: 'clear', portal_id: 'gate' }],
    portals: { gate: { state: 'closed', condition_profile_ref: 'gate-profile', visibility_by_state: { open: 'clear', closed: 'none', locked: 'none', destroyed: 'clear' } } }
  });
  const conditions = { lighting: 'clear', stable_cover: 'clear', dynamic_occlusion: 'clear', concealment: 'clear', weather: 'clear' };
  assert.equal(resolver.resolve({ from_position_id: 'a', to_position_id: 'b', ...conditions }).visibility, 'clear');
  assert.equal(resolver.resolve({ from_position_id: 'b', to_position_id: 'c', ...conditions }).visibility, 'none');
  assert.equal(resolver.resolve({ from_position_id: 'c', to_position_id: 'b', ...conditions }).visibility, 'none', 'directed link is asymmetric');
  assert.throws(() => createSpatialV3VisibilityResolver({ positions: [{ id: 'a', g6_id: 'room', x: 1 }], g6: [{ id: 'room', intra_g6_visibility_mode: 'default_clear' }] }), /coordinate/i);
  assert.throws(() => createSpatialV3VisibilityResolver({ positions: [{ id: 'a', g6_id: 'room', metadata: { layoutX: 2 } }], g6: [{ id: 'room', intra_g6_visibility_mode: 'default_clear' }] }), /coordinate/i);
  assert.throws(() => createSpatialV3VisibilityResolver({ positions: [{ id: 'a', g6_id: 'room' }, { id: 'b', g6_id: 'yard' }], g6: [{ id: 'room', intra_g6_visibility_mode: 'explicit' }, { id: 'yard', intra_g6_visibility_mode: 'explicit' }], links: [{ from_position_id: 'a', to_position_id: 'b', base_result: 'clear', portal_id: 'gate' }], portals: { gate: { state: 'ajar', condition_profile_ref: 'profile', visibility_by_state: { open: 'clear', closed: 'none', locked: 'none', destroyed: 'clear' } } } }).resolve({ from_position_id: 'a', to_position_id: 'b', ...conditions }), /portal visibility/i);
});

test('P22 acoustic path uses least loss and target ambient exactly once', () => {
  const resolver = createSpatialV3AcousticResolver({
    g6: [{ id: 'a', acoustic_uniformity: 'uniform' }, { id: 'b', acoustic_uniformity: 'uniform' }, { id: 'c', acoustic_uniformity: 'uniform' }],
    edges: [
      { from_g6_id: 'a', to_g6_id: 'b', base_loss: 1 },
      { from_g6_id: 'b', to_g6_id: 'c', base_loss: 0, portal_id: 'door' },
      { from_g6_id: 'a', to_g6_id: 'c', base_loss: 2 }
    ],
    portals: { door: { state: 'closed', condition_profile_ref: 'door-profile', acoustic_loss_by_state: { open: 0, closed: 0, locked: 'blocked', destroyed: 0 } } }
  });
  const result = resolver.resolve({ from_g6_id: 'a', to_g6_id: 'c', loudness: 4, target_ambient_noise: 1 });
  assert.equal(result.minimum_loss, 1);
  assert.equal(result.remaining_loudness, 2);
  assert.equal(result.audibility, 'clear');
});

test('P22 keeps belief separate from factual topology and filters hidden route choices', () => {
  const belief = projectSpatialV3NavigationBelief({
    party_id: 'p', character_id: 'actor', updated_at_turn: 7, state_version: 2, updated_change_set_id: 'c',
    perceived_area_ref: { knowledge_kind: 'unknown_area_token', knowledge_id: 'river-road' }, confidence: 'rough',
    source_facts: [{ knowledge_visible: true, evidence_kind: 'report', exactness: 'approximate', fact_ref: { entity_kind: 'knowledge_fact', entity_id: 'rumor' } }]
  });
  assert.equal(belief.perceived_area_ref.knowledge_id, 'river-road');
  assert.throws(() => projectSpatialV3NavigationBelief({ ...belief, perceived_area_ref: { spatial_kind: 'canonical_g5', spatial_id: 'hidden-site' } }), /knowledge/i);
  const options = projectSpatialV3RouteOptions([
    { option_id: 'shown', knowledge_visibility: 'visible', mechanical_readiness: 'ready', player_label: 'К воротам', observed_conditions: ['ворота открыты'], resolved_factual_target_ref: { endpoint_id: 'secret' } },
    { option_id: 'belief', knowledge_visibility: 'misidentified', mechanical_readiness: 'temporarily_blocked', player_label: 'Слух о дороге к реке', observed_conditions: [] },
    { option_id: 'secret', knowledge_visibility: 'hidden', mechanical_readiness: 'ready', player_label: 'secret', resolved_factual_target_ref: { endpoint_id: 'secret' } }
  ]);
  assert.deepEqual(options.map(({ option_id }) => option_id), ['shown', 'belief']);
  assert.equal('resolved_factual_target_ref' in options[0], false);
});

test('P22 derives interaction from current capability and any executable one-edge step', () => {
  const base = { actor_position_id: 'a', target_visible: true, capability: { required_relation: 'adjacent_position', allowed_position_ids: ['c'] } };
  assert.equal(deriveSpatialV3Interaction({ ...base, executable_scene_edges: [{ from_position_id: 'a', to_position_id: 'b', executable: true }, { from_position_id: 'b', to_position_id: 'c', executable: true }] }).relation, 'visible_only');
  assert.equal(deriveSpatialV3Interaction({ ...base, executable_scene_edges: [{ from_position_id: 'a', to_position_id: 'c', executable: true }, { from_position_id: 'a', to_position_id: 'b', executable: true }] }).relation, 'requires_step');
  assert.equal(deriveSpatialV3Interaction({ ...base, capability: { required_relation: 'same_position', allowed_position_ids: ['a'] }, executable_scene_edges: [] }).relation, 'within_reach');
});

test('P22 player read model strips hidden topology, diagnostics and layout reservation', () => {
  const projection = createSpatialV3PlayerProjection({
    journey_execution: { status: 'stranded_in_transit', player_message: 'Дальше требуется новое решение.', diagnostics: { raw: true } },
    scene: {
      nodes: [
        { id: 'visible', knowledge_visibility: 'visible', display_token: 'courtyard', label: 'Двор' },
        { id: 'wrong', knowledge_visibility: 'misidentified', display_token: 'rumor', label: 'Кажется, проход' },
        { id: 'hidden', knowledge_visibility: 'hidden', display_token: 'secret', label: 'Тайник' }
      ],
      links: [{ from_node_id: 'visible', to_node_id: 'wrong', knowledge_visibility: 'visible' }, { from_node_id: 'visible', to_node_id: 'hidden', knowledge_visibility: 'hidden' }]
    },
    route_options: [{ option_id: 'walk', knowledge_visibility: 'visible', mechanical_readiness: 'ready', player_label: 'Идти', observed_conditions: [] }],
    world_signals: [{ kind: 'bell', approximate_direction: 'north', approximate_area: 'nearby', factual_route: 'secret' }]
  });
  assert.equal(projection.scene_map.nodes.length, 2);
  assert.equal(projection.scene_map.nodes.some((node) => node.token === 'secret'), false);
  assert.equal(projection.scene_map.links.length, 1);
  assert.equal(projection.scene_map.nodes.every((node) => Number.isInteger(node.layout_order)), true);
  assert.equal('diagnostics' in projection, false);
  assert.equal('factual_route' in projection.world_signals[0], false);
  const panels = createSpatialV3ProjectionPanels(projection);
  assert.equal(panels.map.visible, true);
  assert.equal(panels.route.data.movement.status, 'stranded_in_transit');
});
