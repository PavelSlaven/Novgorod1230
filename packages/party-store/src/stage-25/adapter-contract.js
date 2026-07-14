export function assertStage25PhysicalPlanAdapter(adapter) {
  if (typeof adapter !== 'function') throw new TypeError('Stage 25 physical plan adapter must be a function.');
  return adapter;
}
