export function registeredPhase7Owners({ npcOwnerCapabilities, state, contracts,
  worldProcessContract, worldProcessResolver }) {
  const raw = [...(Array.isArray(npcOwnerCapabilities)
    ? npcOwnerCapabilities : [])];
  if (worldProcessContract != null && typeof worldProcessResolver === 'function') raw.push({
    operation: 'request_world_process', capability: worldProcessContract,
    execute: (input) => worldProcessResolver(input), supports: () => true
  });
  return Object.freeze(raw.flatMap((entry) => {
    if (!entry || typeof entry.operation !== 'string'
        || !entry.capability || typeof entry.execute !== 'function'
        || entry.isApplicable?.({ state, contracts }) === false) return [];
    return [Object.freeze({ operation: entry.operation,
      capability: structuredClone(entry.capability), execute: entry.execute,
      supports: typeof entry.supports === 'function'
        ? entry.supports : () => true })];
  }));
}

export function mergePhase7Capability(current, next) {
  if (current == null) return structuredClone(next);
  if (current.owner !== next.owner) fail('TRACE_PHASE_7_OWNER_CAPABILITY_CONFLICT');
  if (!Array.isArray(current.allowed) || !Array.isArray(next.allowed)) {
    return Object.freeze({ owner: current.owner, alternatives: [
      structuredClone(current), structuredClone(next) ] });
  }
  return Object.freeze({ ...structuredClone(current), allowed: [
    ...structuredClone(current.allowed), ...structuredClone(next.allowed)
  ] });
}

export function phase7OwnerOutputs(resolved) {
  return Object.fromEntries([
    'ordinary_materialization_atomic_write_plan',
    'action_production_atomic_write_plan',
    'local_fire_atomic_write_plans',
    'spatial_semantic_atomic_write_plan'
  ].flatMap((key) => resolved[key] == null ? [] : [[key,
    structuredClone(resolved[key])]]));
}

export function phase7ActorStepOwnerOutputs(execution, registered = null) {
  return Object.freeze({
    write_fragments: structuredClone(execution.writeFragments ?? []),
    consequence_fragment: structuredClone(
      registered?.consequence_fragment ?? null),
    ordinary_materialization_atomic_write_plan:
      structuredClone(execution.ordinary_materialization_atomic_write_plan),
    action_production_atomic_write_plans:
      execution.action_production_atomic_write_plan == null ? [] : [
        structuredClone(execution.action_production_atomic_write_plan) ],
    local_fire_atomic_write_plans: structuredClone(
      execution.local_fire_atomic_write_plans ?? []),
    spatial_semantic_atomic_write_plan:
      structuredClone(execution.spatial_semantic_atomic_write_plan)
  });
}

function fail(code) { throw Object.assign(new Error(code), { code }); }
