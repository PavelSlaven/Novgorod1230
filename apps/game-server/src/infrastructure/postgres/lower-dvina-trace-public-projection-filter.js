const INTERNAL_PUBLIC_KEYS = new Set([
  'hidden', 'hidden_state', 'private_motives', 'private_knowledge',
  'closed_container_contents', 'future_event_timers',
  'truth_status_for_system', 'actual_truth_hidden_from_character',
  'write_plan', 'commit_plan', 'raw_audit', 'raw_prompt',
  'provider_request', 'provider_response', 'diagnostics', 'trace',
  'candidate_set', 'candidate_sets', 'resolved_factual_target_ref',
  'factual_topology', 'factual_route', 'internal_route_binding',
  'endpoint_binding', 'recovery_topology', 'pins', 'dependency_pins',
  'dependency_pin_set', 'candidate', 'candidates', 'raw_diagnostic',
  'raw_diagnostics', 'diagnostic_trace', 'route_plan', 'route_steps',
  'route_binding', 'route_bindings', 'resolved_route', 'routes',
  'factual_routes', 'internal_routes', 'coordinate', 'coordinates',
  'layout_x', 'layout_y', 'bearing', 'distance', 'traces', 'raw_trace',
  'raw_traces', 'binding', 'bindings', 'endpoint_bindings'
]);

export function publicTimeProjection(timeUpdate) {
  if (timeUpdate == null) return null;
  return {
    owner: timeUpdate.owner, schema: timeUpdate.schema,
    version: timeUpdate.version,
    clock_before: structuredClone(timeUpdate.clock_before),
    clock_after: structuredClone(timeUpdate.clock_after),
    exact_elapsed: structuredClone(timeUpdate.exact_elapsed),
    nearest_boundary: structuredClone(timeUpdate.nearest_boundary ?? null)
  };
}

export function publicCheckProjection(check) {
  if (check == null) return null;
  const { audit: _privateAudit, ...visible } = check;
  return visible;
}

export function stripPublicInternals(value, path = '$') {
  if (Array.isArray(value)) return value.map((entry, index) =>
    stripPublicInternals(entry, `${path}[${index}]`));
  if (value === null || typeof value !== 'object') return value;
  const projected = {};
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
      .replace(/[\s.-]+/gu, '_').toLowerCase();
    const panelRoute = path.endsWith('.panels') && normalized === 'route';
    if (!panelRoute && internalPublicKey(normalized)) continue;
    projected[key] = stripPublicInternals(child, `${path}.${key}`);
  }
  return projected;
}

function internalPublicKey(key) {
  return INTERNAL_PUBLIC_KEYS.has(key) || key.startsWith('hidden_')
    || key.startsWith('private_') || key.includes('candidate')
    || key.includes('diagnostic') || key.includes('dependency_pin')
    || key === 'pin' || key.endsWith('_pins') || key.includes('trace')
    || key.includes('binding') || key.startsWith('route_')
    || key.endsWith('_route') || key === 'route' || key === 'routes'
    || key.includes('factual_topology') || ['x', 'y', 'z'].includes(key);
}
