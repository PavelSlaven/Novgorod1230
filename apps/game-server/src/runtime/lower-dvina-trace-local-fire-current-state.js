import { createLocalFireAtomicWritePlan } from
  '../infrastructure/postgres/local-fire-atomic-write-plan.js';

export function projectLowerDvinaTraceF1CurrentState({ committedState,
  localFireRuntime = null, priorLocalFirePlans = [] } = {}) {
  const current = structuredClone(committedState);
  if (Array.isArray(localFireRuntime)) {
    current.local_fire_runtime = structuredClone(localFireRuntime);
  }
  for (const raw of priorLocalFirePlans) {
    const plan = createLocalFireAtomicWritePlan(raw);
    for (const transition of plan.fuel_placement_transitions) {
      const item = current.items?.find(({ item_id: id }) => id === transition.item_id);
      if (item != null) item.placement = structuredClone(transition.after_placement);
    }
    const retirement = plan.item_retirement_transition;
    if (retirement != null) {
      const item = current.items?.find(({ item_id: id }) => id === retirement.item_id);
      if (item != null) Object.assign(item, structuredClone(retirement.after_item));
    }
  }
  current.items = (current.items ?? []).filter((item) =>
    item?.condition_state !== 'retired' && item?.state?.lifecycle_status !== 'retired');
  return current;
}
