export function richCommittedState() {
  return {
    party_id: 'party', actor_id: 'mikula',
    player_profile: {
      attributes: { strength: { value: 9 } }, skills: { observation: { bonus: 2 } },
      inventory: { items: ['knife'] }, selected_candidate_refs: { internal: 'not-player-safe' }
    },
    body_state: { health: 79, energy: 37 },
    position: { location_ref: 'shed', g5_anchor_id: 'shed-anchor' },
    clock: { whole_minutes: '333060', subminute_numerator: '0', subminute_denominator: '1' },
    clock_weather_light: {
      clock: { whole_minutes: '333060', subminute_numerator: '0', subminute_denominator: '1' },
      weather: { precipitation: 'rain' }, light: { band: 'dawn' }
    },
    items: [
      { item_id: 'knife', placement: { holder_character_id: 'mikula' } },
      { item_id: 'open-box', visible: true, open_state: 'open', contents: [{ item_id: 'bandage' }] },
      { item_id: 'closed-box', visible: true, open_state: 'closed', contents_state: 'unknown' }
    ],
    visible_npcs: [{ instance_id: 'onisim' }], scene_npcs: [{ instance_id: 'ratsha' }],
    npcs: [
      { instance_id: 'onisim', anchor_id: 'shed-anchor' },
      { instance_id: 'eremey', anchor_id: 'camp-anchor' }
    ],
    interactions: [{ interaction_id: 'talk-1', statement_ref: 'known-statement' }],
    routes: [
      { route_id: 'shed-camp', knowledge_state: 'known' },
      { route_id: 'shed-secret', knowledge_state: 'closed' }
    ],
    available_routes: [{ route_id: 'shed-camp' }], route_history: [{ route_ref: 'shore-camp' }],
    route_knowledge: ['shore-camp'],
    knowledge: [
      { fact_id: 'onisim_stabilized', knowledge_state: 'known' },
      { fact_id: 'culprit', knowledge_state: 'closed_until_disclosed' }
    ],
    visible_context: { visible_scene: 'Старая сушильня', visible_objects: ['stretcher'] }
  };
}
