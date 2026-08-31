import { localFirePhysicalKeys } from './local-fire-atomic-write-plan.js';

export function phase2LockContext(writes, state, localFirePlans = []) {
  return {
    owner_keys: [`actor:${state.actor_id}`],
    execution_keys: [],
    g4_keys: [],
    physical_keys: [
      ...Object.values(writes).flat().map(
        (write) => `party_runtime.${write.target_table}:${write.id}`
      ),
      ...localFirePlans.flatMap(localFirePhysicalKeys)
    ]
  };
}
