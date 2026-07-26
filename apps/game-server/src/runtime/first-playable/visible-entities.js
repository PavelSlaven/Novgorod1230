export function visibleEntityRefs(state) {
  const refs = [];
  if (state.npc && state.location === 'landing_edge') {
    refs.push('npc:fisher');
  }
  if (state.location === 'landing_edge') {
    refs.push('resource:visible');
  }
  if (state.boat && [
    'landing_edge',
    'yp025_navigation_corridor',
    'yp026_boundary_anchor'
  ].includes(state.location)) {
    refs.push('transport:player_boat');
  }
  return refs;
}
