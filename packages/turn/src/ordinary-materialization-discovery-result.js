export function ordinaryNoop(request) { return Object.freeze({
  working_projection: structuredClone(request?.working_projection ?? {}),
  write_fragments: [], summary: 'ordinary discovery unavailable',
  duration_minutes: 0,
  consequence_fragment: { visible_seed: { ordinary_presence_seed: {
    kind: 'ordinary_presence_seed', resolution: 'no_change',
    query: request.operation.query
  } } },
  player_response_boundary: true }); }
export function knownNegativeResolution(request, knownResolution) {
  const resolution = knownResolution?.resolution;
  if (!['absent', 'no_change', 'authority_required'].includes(resolution)) {
    return ordinaryNoop(request);
  }
  return Object.freeze({
    working_projection: structuredClone(request?.working_projection ?? {}),
    write_fragments: [], summary: 'ordinary discovery resolved',
    known_resolution: structuredClone(knownResolution),
    duration_minutes: 0, player_response_boundary: true,
    consequence_fragment: { visible_seed: { ordinary_presence_seed: {
      kind: 'ordinary_presence_seed', resolution, query: request.operation.query
    } } }
  });
}
