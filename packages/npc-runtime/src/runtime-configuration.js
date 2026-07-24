import { deepFreeze } from '@rus/kernel';

export const NPC_RUNTIME_OWNER = '@rus/npc-runtime';
export const NPC_RUNTIME_RESOURCE_LIMITS = deepFreeze({
  max_schedule_transitions: 256,
  max_decision_options: 128,
  max_known_fact_refs: 512,
  max_signal_path_edges: 256
});
export const NPC_RUNTIME_TYPED_ERRORS = deepFreeze([
  'npc_schedule_gap',
  'npc_decision_policy_gap',
  'perception_policy_gap',
  'temporal_candidate_stale',
  'activity_precondition_stale',
  'temporal_execution_unbounded',
  'time_timestamp_invalid',
  'idempotency_conflict',
  'temporal_change_set_conflict'
]);
