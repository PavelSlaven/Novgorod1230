// ponytail: production path must not invent world semantics; fixtures/tests may keep procedural fillers
export function allowsProceduralSemantics(world = null) {
  if (process.env.NODE_TEST_CONTEXT) return true;
  if (world?.scenarioFixture) return true;
  return false;
}

export function allowsDeterministicFallback(context = null) {
  if (process.env.NODE_TEST_CONTEXT) return true;
  if (context?.NODE_TEST_CONTEXT) return true;
  if (context?.scenarioFixture) return true;
  return false;
}

export function isProductionSemanticMode(env = process.env) {
  return !allowsDeterministicFallback(env);
}

export function queueSemanticPending(world, kind, context = {}) {
  if (!world || typeof world !== 'object') return;
  if (!Array.isArray(world.pendingSemanticWorld)) world.pendingSemanticWorld = [];
  world.pendingSemanticWorld.unshift({
    kind,
    context,
    at: world.clock ? { ...world.clock } : null,
    status: 'pending_llm'
  });
  world.pendingSemanticWorld = world.pendingSemanticWorld.slice(0, 20);
}

export function getPendingSemanticWorld(world) {
  return (world?.pendingSemanticWorld ?? []).filter((entry) => entry?.status === 'pending_llm');
}

export function resolveSemanticPending(world, kind) {
  if (!world || typeof world !== 'object' || !kind) return;
  for (const entry of world.pendingSemanticWorld ?? []) {
    if (entry?.kind === kind && entry?.status === 'pending_llm') {
      entry.status = 'resolved_llm';
    }
  }
}
