export function scenePresentationForLocation({ scenePresentation, locationRef }) {
  const locations = scenePresentation?.locations;
  const matches = Array.isArray(locations)
    ? locations.filter(({ location_ref: ref }) => ref === locationRef)
    : [];
  if (matches.length !== 1 || !text(matches[0].display_name)
      || !Array.isArray(matches[0].player_visible_physical_facts)
      || matches[0].player_visible_physical_facts.some((fact) => !text(fact))) {
    fail();
  }
  return {
    display_name: matches[0].display_name,
    player_visible_physical_facts: [...matches[0].player_visible_physical_facts]
  };
}

export function ordinaryBackgroundSeedForLocation({
  scenePresentation,
  locationRef
}) {
  const locations = scenePresentation?.locations;
  const matches = Array.isArray(locations)
    ? locations.filter(({ location_ref: ref }) => ref === locationRef)
    : [];
  if (matches.length !== 1
      || !text(matches[0].ordinary_background_descriptor)
      || !['sparse', 'ordinary', 'dense'].includes(
        matches[0].ordinary_density_band)) fail();
  return Object.freeze({
    descriptor: matches[0].ordinary_background_descriptor,
    density_band: matches[0].ordinary_density_band
  });
}

export function factPresentationForRef({ scenePresentation, factRef }) {
  return presentationFor(scenePresentation?.fact_presentations, 'fact_ref', factRef);
}

export function routePresentationForFact({ scenePresentation, routeFactRef }) {
  return presentationFor(scenePresentation?.route_presentations, 'route_fact_ref', routeFactRef);
}

export function routePresentationForRoute({ scenePresentation, routeRef }) {
  return presentationFor(scenePresentation?.route_presentations, 'route_ref', routeRef);
}

function presentationFor(records, key, ref) {
  const matches = Array.isArray(records)
    ? records.filter((record) => record?.[key] === ref)
    : [];
  if (matches.length !== 1 || !text(matches[0].source_basis)
      || !text(matches[0].perception_requirement)) fail();
  return structuredClone(matches[0]);
}

function text(value) {
  return typeof value === 'string' && value.length > 0;
}

function fail() {
  throw Object.assign(
    new Error('Scene presentation is not an exact player-safe location projection.'),
    { code: 'TRACE_SCENE_PRESENTATION_INVALID', status: 409 }
  );
}
