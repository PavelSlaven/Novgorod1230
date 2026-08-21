import { deepFreeze } from '@rus/kernel';

export function resolveWorldProcessRemainder({ operation, execution,
  projected, committedState, services }) {
  if (operation.op !== 'request_world_process'
      || typeof services.turnStepWorldProcessResolver !== 'function') {
    return null;
  }
  return services.turnStepWorldProcessResolver(deepFreeze({
    schema: 'turn_step_world_process_request_v1',
    operation: structuredClone(operation), plan: structuredClone(execution.plan),
    request: structuredClone(execution.request),
    actor: structuredClone(projected.actor),
    working_projection: structuredClone(execution.working_projection),
    committed_state: structuredClone(committedState),
    prepared_chain_context: structuredClone(execution.prepared_chain_context),
    prepared_ordinary_materialization_atomic_write_plan: structuredClone(
      execution.prepared_ordinary_materialization_atomic_write_plan),
    prepared_action_production_atomic_write_plans: structuredClone(
      execution.prepared_action_production_atomic_write_plans)
  }));
}
