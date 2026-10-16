export function ordinaryNoop(request) { return Object.freeze({
  working_projection: structuredClone(request?.working_projection ?? {}),
  write_fragments: [], summary: 'ordinary discovery unavailable',
  duration_minutes: 0,
  consequence_fragment: { visible_seed: { ordinary_presence_seed: {
    kind: 'ordinary_presence_seed', resolution: 'no_change',
    query: request.operation.query
  } } },
  player_response_boundary: true }); }
export function preflightRefusalResult(request, reasonCode = null) {
  return Object.freeze({
    working_projection: structuredClone(request?.working_projection ?? {}),
    write_fragments: [], summary: 'ordinary discovery unavailable',
    duration_minutes: 0, player_response_boundary: true,
    consequence_fragment: { visible_seed: { ordinary_presence_seed: {
      kind: 'ordinary_presence_seed',
      resolution: reasonCode == null ? 'no_change' : 'authority_required',
      query: request.operation.query,
      ...(reasonCode == null ? {} : { reason_code: reasonCode })
    } } }
  });
}
export function knownResolutionResult(request, knownResolution,
  { displayName = null, reasonCode = null } = {}) {
  const resolution = knownResolution?.resolution;
  if (!['materialize', 'absent', 'no_change', 'authority_required']
    .includes(resolution)) {
    return ordinaryNoop(request);
  }
  const presence = resolution === 'materialize'
    ? typeof displayName === 'string' && displayName.trim()
      ? { kind: 'ordinary_presence_seed', resolution: 'materialized',
          query: request.operation.query, display_name: displayName }
      : null
    : { kind: 'ordinary_presence_seed', resolution,
        query: request.operation.query,
        ...(resolution === 'authority_required' && reasonCode != null
          ? { reason_code: reasonCode } : {}) };
  return Object.freeze({
    working_projection: structuredClone(request?.working_projection ?? {}),
    write_fragments: [], summary: 'ordinary discovery resolved',
    known_resolution: structuredClone(knownResolution),
    duration_minutes: 0, player_response_boundary: true,
    ...(presence == null ? {} : { consequence_fragment: { visible_seed: {
      ordinary_presence_seed: presence
    } } })
  });
}
