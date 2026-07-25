import {
  computeSpatialV3CanonicalDigest,
  createSpatialV3TypedError
} from '@rus/contracts/spatial-v3/registry';

export const TABLES = Object.freeze({
  party_v3_change_sets: { modes: ['append'], key: ['id'] },
  party_route_plan_execution_events: { modes: ['append'], key: ['execution_id', 'event_ordinal'] },
  party_traversal_interval_results: { modes: ['append'], key: ['id'] },
  party_timed_activity_attempts: { modes: ['append'], key: ['activity_execution_id', 'attempt_ordinal'] },
  party_activity_resource_bindings: { modes: ['append'], key: ['activity_execution_id', 'resource_kind', 'resource_id', 'binding_kind', 'change_set_id'] },
  party_temporal_event_subjects: { modes: ['append'], key: ['event_id', 'subject_kind', 'subject_id', 'subject_role'] },
  party_temporal_event_dependencies: { modes: ['append'], key: ['event_id', 'depends_on_event_id'] },
  party_npc_runtime_transitions: { modes: ['append'], key: ['transition_id'] },
  party_perception_records: { modes: ['append'], key: ['perception_id'] },
  party_perception_witnesses: { modes: ['append'], key: ['perception_id', 'witness_kind', 'witness_id'] },
  party_perception_replay_evidence: { modes: ['append'], key: ['perception_id'] },
  party_npc_reaction_option_proposals: { modes: ['append'], key: ['request_id'] },
  party_npc_decision_traces: { modes: ['append'], key: ['request_id'] },
  party_npc_reaction_consequences: { modes: ['append'], key: ['request_id'] },
  party_npc_knowledge_merge_results: { modes: ['append'], key: ['proposal_id'] },
  party_body_temporal_history: { modes: ['append'], key: ['history_id'] },
  party_visible_packages: { modes: ['append'], key: ['package_id'] },
  party_route_plan_executions: { modes: ['update'], key: ['id'], version: true },
  party_timed_activity_executions: { modes: ['insert', 'update'], key: ['id'], version: true },
  traveller_travel_states: { modes: ['update'], key: ['id'], version: true },
  party_journey_locations: { modes: ['update'], key: ['id'], version: true },
  party_clocks: { modes: ['update'], key: ['party_id'], version: true },
  party_carrier_attachments: { modes: ['update'], key: ['id'], version: true },
  party_npc_spatial_schedules: { modes: ['update'], key: ['id'], version: true },
  entity_placements: { modes: ['update'], key: ['party_id', 'entity_kind', 'entity_id'], version: true },
  expansion_frontiers: { modes: ['update'], key: ['id'], version: true },
  expansion_capacity_reservations: { modes: ['update'], key: ['id'], version: true },
  party_activity_participant_bindings: { modes: ['insert', 'update'], key: ['activity_execution_id', 'participant_kind', 'participant_id'], version: true },
  party_temporal_events: { modes: ['insert', 'update'], key: ['event_id'], version: true },
  party_remote_aggregate_states: { modes: ['insert', 'update'], key: ['aggregate_id'], version: true },
  party_propagation_processes: { modes: ['insert', 'update'], key: ['process_id'], version: true },
  party_npc_knowledge_merge_states: { modes: ['update'], key: ['party_id', 'npc_id'], version: true },
  party_npc_knowledge: { modes: ['insert'], key: ['party_id', 'npc_id', 'fact_id'] },
  party_route_plans: { modes: ['insert'], key: ['id'] },
  party_route_plan_steps: { modes: ['insert'], key: ['route_plan_id', 'ordinal'] },
  preparation_claims: { modes: ['insert', 'update'], key: ['id'], version: true },
  party_g5_sites: { modes: ['insert'], key: ['id'] },
  party_scene_baselines: { modes: ['insert'], key: ['id'] },
  party_g6_instances: { modes: ['insert'], key: ['id'] },
  scene_position_nodes: { modes: ['insert'], key: ['id'] },
  party_cohorts: { modes: ['insert'], key: ['id'] },
  party_cohort_memberships: { modes: ['insert'], key: ['id'] },
  party_narration_jobs: { modes: ['insert'], key: ['job_id'] }
});
export const CHILD_TABLES = new Set([
  'party_route_plan_execution_events',
  'party_traversal_interval_results',
  'party_timed_activity_attempts',
  'party_timed_activity_executions',
  'party_route_plan_steps',
  'preparation_claims',
  'party_activity_participant_bindings',
  'party_activity_resource_bindings',
  'party_temporal_event_subjects',
  'party_temporal_event_dependencies',
  'party_perception_witnesses'
]);
const IDENT = /^[a-z_][a-z0-9_]*$/u;
export const stable = (value) => typeof value === 'string' && value.trim().length > 0;
export const sha256Hex = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
export const FIRST_ENTRY_BINDING_FIELDS = Object.freeze([
  'baseline_disposition',
  'g4_id',
  'preparation_snapshot_id',
  'preparation_member_ordinal',
  'preparation_snapshot_digest',
  'preparation_member_digest',
  'route_plan_id',
  'route_plan_digest',
  'route_plan_execution_id',
  'preparation_claim_id',
  'scene_baseline_id',
  'g5_site_id',
  'g6_instance_id',
  'position_id'
]);
export const FIRST_ENTRY_PHYSICAL_RECHECK_FIELDS = Object.freeze([
  'kind',
  'digest',
  'materialization_scope_key',
  ...FIRST_ENTRY_BINDING_FIELDS
]);
export const quote = (value) => { if (!IDENT.test(String(value ?? ''))) throw Object.assign(new Error('unsafe identifier'), { spatialCode: 'generated_schema_mismatch' }); return `\"${value}\"`; };
const pin = (party_id) => ({ dependency_role: 'planning_context_dependency', entity_ref: { entity_kind: 'party_change_set', entity_id: party_id || 'unknown' }, version_pin: { pin_kind: 'party_state_version', state_version: 1 } });
export const error = (code, party_id, diagnostics = {}) => createSpatialV3TypedError(code, { subject_ref: { entity_kind: 'party_change_set', entity_id: party_id || 'unknown' }, dependency_pins: { pins: [pin(party_id)], canonical_digest: computeSpatialV3CanonicalDigest([pin(party_id)]).replace('sha256:', '') }, diagnostics });
export const digestInput = (plan) => { const { digest, ...value } = plan; return value; };
export const keyOf = (write) => `${write.target_schema ?? 'party_runtime'}.${write.target_table}:${write.id}`;
export const validIdentity = (write) => write?.target_table === 'entity_placements'
  ? write.id === `${write.record?.entity_kind}:${write.record?.entity_id}`
  : write?.target_table === 'party_clocks' ? write.record?.party_id === write.id
    : write?.target_table === 'party_route_plan_execution_events' ? write.id === `${write.record?.execution_id}:${write.record?.event_ordinal}`
      : write?.target_table === 'party_timed_activity_attempts' ? write.id === `${write.record?.activity_execution_id}:${write.record?.attempt_ordinal}`
        : write?.target_table === 'party_route_plan_steps' ? write.id === `${write.record?.route_plan_id}:${write.record?.ordinal}`
          : write?.target_table === 'party_visible_packages' ? write.record?.package_id === write.id
        : write?.target_table === 'party_narration_jobs' ? write.record?.job_id === write.id
          : write?.target_table === 'party_activity_participant_bindings' ? write.id === `${write.record?.activity_execution_id}:${write.record?.participant_kind}:${write.record?.participant_id}`
            : write?.target_table === 'party_activity_resource_bindings' ? write.id === `${write.record?.activity_execution_id}:${write.record?.resource_kind}:${write.record?.resource_id}:${write.record?.binding_kind}:${write.record?.change_set_id}`
              : write?.target_table === 'party_temporal_events' ? write.record?.event_id === write.id
                : write?.target_table === 'party_temporal_event_subjects' ? write.id === `${write.record?.event_id}:${write.record?.subject_kind}:${write.record?.subject_id}:${write.record?.subject_role}`
                  : write?.target_table === 'party_temporal_event_dependencies' ? write.id === `${write.record?.event_id}:${write.record?.depends_on_event_id}`
                    : write?.target_table === 'party_npc_runtime_transitions' ? write.record?.transition_id === write.id
                      : write?.target_table === 'party_perception_records' ? write.record?.perception_id === write.id
                        : write?.target_table === 'party_perception_witnesses' ? write.id === `${write.record?.perception_id}:${write.record?.witness_kind}:${write.record?.witness_id}`
                          : write?.target_table === 'party_perception_replay_evidence' ? write.record?.perception_id === write.id
                            : write?.target_table === 'party_npc_reaction_option_proposals' ? write.record?.request_id === write.id
                              : write?.target_table === 'party_npc_decision_traces' ? write.record?.request_id === write.id
                            : write?.target_table === 'party_npc_reaction_consequences' ? write.record?.request_id === write.id
                              : write?.target_table === 'party_npc_knowledge_merge_results' ? write.record?.proposal_id === write.id
                                : write?.target_table === 'party_npc_knowledge_merge_states' ? write.id === `${write.record?.party_id}:${write.record?.npc_id}`
                                  : write?.target_table === 'party_npc_knowledge' ? write.id === `${write.record?.npc_id}:${write.record?.knowledge_ref_kind}:${write.record?.fact_id}`
                            : write?.target_table === 'party_body_temporal_history' ? write.record?.history_id === write.id
                              : write?.target_table === 'party_remote_aggregate_states' ? write.record?.aggregate_id === write.id
                                : write?.target_table === 'party_propagation_processes' ? write.record?.process_id === write.id
                                  : write?.record?.id === write?.id;
export function childParentKeys(write) {
  switch (write?.target_table) {
    case 'party_activity_participant_bindings':
    case 'party_activity_resource_bindings':
    case 'party_timed_activity_attempts':
      return [`party_runtime.party_timed_activity_executions:${write.record?.activity_execution_id}`];
    case 'party_timed_activity_executions':
    case 'party_route_plan_execution_events':
    case 'party_traversal_interval_results':
      return [`party_runtime.party_route_plan_executions:${write.record?.route_plan_execution_id ?? write.record?.execution_id}`];
    case 'party_route_plan_steps':
      return [`party_runtime.party_route_plans:${write.record?.route_plan_id}`];
    case 'party_g6_instances':
      return [`party_runtime.party_scene_baselines:${write.record?.scene_baseline_id}`];
    case 'scene_position_nodes':
      return [`party_runtime.party_g6_instances:${write.record?.g6_instance_id}`];
    case 'party_temporal_event_subjects':
    case 'party_temporal_event_dependencies':
      return [`party_runtime.party_temporal_events:${write.record?.event_id}`];
    case 'party_npc_runtime_transitions':
    case 'party_perception_records':
      return write.record?.event_id ? [`party_runtime.party_temporal_events:${write.record.event_id}`] : [];
    case 'party_perception_witnesses':
      return [`party_runtime.party_perception_records:${write.record?.perception_id}`];
    case 'party_perception_replay_evidence':
      return [
        `party_runtime.party_perception_records:${write.record?.perception_id}`,
        `party_runtime.party_v3_change_sets:${write.record?.change_set_id}`
      ];
    case 'party_npc_reaction_option_proposals':
      return [
        `party_runtime.party_perception_records:${write.record?.source_perception_id}`,
        `party_runtime.party_v3_change_sets:${write.record?.change_set_id}`
      ];
    case 'party_npc_reaction_consequences':
      return [
        `party_runtime.party_perception_records:${write.record?.perception_id}`,
        `party_runtime.party_npc_decision_traces:${write.record?.request_id}`,
        `party_runtime.party_v3_change_sets:${write.record?.change_set_id}`
      ];
    case 'party_npc_knowledge_merge_results':
      return [
        `party_runtime.party_perception_records:${write.record?.source_perception_id}`,
        `party_runtime.party_v3_change_sets:${write.record?.change_set_id}`
      ];
    case 'party_npc_knowledge_merge_states':
      return [`party_runtime.party_v3_change_sets:${write.record?.updated_change_set_id}`];
    case 'party_npc_knowledge':
      return [
        `party_runtime.party_perception_records:${write.record?.source_perception_id}`,
        `party_runtime.party_npc_knowledge_merge_results:${write.record?.proposal_id}`,
        `party_runtime.party_v3_change_sets:${write.record?.updated_change_set_id}`
      ];
    case 'party_visible_packages':
      return [`party_runtime.party_v3_change_sets:${write.record?.change_set_id}`];
    case 'party_narration_jobs':
      return [`party_runtime.party_visible_packages:${write.record?.package_id}`];
    default:
      return [];
  }
}

function orderingParentKeys(write) {
  const parents = new Set();
  for (const required of childParentKeys(write)) parents.add(required);
  if (write?.target_table === 'party_scene_baselines' && write.record?.host_kind === 'g5_site') {
    parents.add(`party_runtime.party_g5_sites:${write.record.host_id}`);
  }
  if (write?.target_table === 'party_journey_locations'
    && write.record?.location_kind === 'scene'
    && write.record?.scene_position_id) {
    parents.add(`party_runtime.scene_position_nodes:${write.record.scene_position_id}`);
  }
  if (write?.target_table === 'party_temporal_event_dependencies' && write.record?.depends_on_event_id) {
    parents.add(`party_runtime.party_temporal_events:${write.record.depends_on_event_id}`);
  }
  if (write?.target_table === 'party_propagation_processes' && write.record?.aggregate_id) {
    parents.add(`party_runtime.party_remote_aggregate_states:${write.record.aggregate_id}`);
  }
  if (write?.target_table === 'party_npc_spatial_schedules' && write.record?.current_activity_execution_id) {
    parents.add(`party_runtime.party_timed_activity_executions:${write.record.current_activity_execution_id}`);
  }
  return [...parents];
}

export function orderWrites(plan) {
  const modeRank = Object.freeze({ update: 0, insert: 1, append: 2 });
  const pending = new Map([
    ...plan.updates.map((write) => [keyOf(write), { mode: 'update', write }]),
    ...plan.inserts.map((write) => [keyOf(write), { mode: 'insert', write }]),
    ...plan.appends.map((write) => [keyOf(write), { mode: 'append', write }])
  ]);
  const planKeys = new Set(pending.keys());
  const completed = new Set();
  const ordered = [];
  while (pending.size) {
    const ready = [...pending.entries()]
      .filter(([, entry]) => orderingParentKeys(entry.write)
        .filter((parent) => planKeys.has(parent))
        .every((parent) => completed.has(parent)))
      .sort((left, right) => modeRank[left[1].mode] - modeRank[right[1].mode] || left[0].localeCompare(right[0]));
    if (!ready.length) throw Object.assign(new Error('write dependency cycle'), { spatialCode: 'generated_schema_mismatch' });
    for (const [key, entry] of ready) {
      pending.delete(key);
      completed.add(key);
      ordered.push(entry);
    }
  }
  return ordered;
}
