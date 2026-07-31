import {
  computeSpatialV3CanonicalDigest,
  createSpatialV3TypedError
} from '@rus/contracts/spatial-v3/registry';

export const TABLES = Object.freeze({
  parties: { modes: ['update'], key: ['party_id'], version: true },
  party_server_sessions: {
    modes: ['update'],
    key: ['party_id'],
    version: true
  },
  party_state_snapshots: {
    modes: ['insert'],
    key: ['party_id', 'state_version']
  },
  party_v3_change_sets: { modes: ['append'], key: ['id'] },
  party_route_plan_execution_events: { modes: ['append'], key: ['execution_id', 'event_ordinal'] },
  party_traversal_interval_results: { modes: ['append'], key: ['id'] },
  party_timed_activity_attempts: { modes: ['append'], key: ['activity_execution_id', 'attempt_ordinal'] },
  party_action_step_runs: { modes: ['append'], key: ['id'] },
  party_activity_resource_bindings: { modes: ['append'], key: ['activity_execution_id', 'resource_kind', 'resource_id', 'binding_kind'] },
  party_check_resolutions: { modes: ['append'], key: ['check_resolution_id'] },
  party_actor_npc_interactions: { modes: ['append'], key: ['interaction_id'] },
  party_actor_npc_interaction_summaries: { modes: ['append'], key: ['summary_id'] },
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
  party_route_plan_executions: { modes: ['insert', 'update'], key: ['id'], version: true },
  party_timed_activity_executions: { modes: ['insert', 'update'], key: ['id'], version: true },
  traveller_travel_states: { modes: ['insert', 'update'], key: ['id'], version: true },
  party_journey_locations: {
    modes: ['insert', 'update', 'delete'],
    key: ['id'],
    version: true
  },
  party_clocks: { modes: ['update'], key: ['party_id'], version: true },
  party_positions: { modes: ['update'], key: ['party_id'], version: false },
  party_carrier_attachments: { modes: ['insert', 'update'], key: ['id'], version: true },
  party_npc_spatial_schedules: { modes: ['update'], key: ['id'], version: true },
  entity_placements: { modes: ['insert', 'update', 'delete'], key: ['party_id', 'entity_kind', 'entity_id'], version: true },
  party_entity_controls: { modes: ['insert', 'update'], key: ['party_id', 'entity_kind', 'entity_id'], version: true },
  party_actor_profile_bindings: { modes: ['insert', 'update'], key: ['party_id', 'actor_kind', 'actor_id'], version: true },
  party_actor_body_states: { modes: ['insert', 'update'], key: ['party_id', 'actor_kind', 'actor_id'], version: true },
  party_actor_active_conditions: { modes: ['insert', 'update'], key: ['party_id', 'actor_kind', 'actor_id', 'condition_id'], version: true },
  party_resource_nodes: { modes: ['insert', 'update'], key: ['resource_node_id'], version: true },
  party_transports: { modes: ['insert', 'update'], key: ['party_id', 'transport_id'], version: true },
  party_actor_relations: { modes: ['insert', 'update'], key: ['relation_id'], version: true },
  expansion_frontiers: { modes: ['update'], key: ['id'], version: true },
  expansion_capacity_reservations: { modes: ['update'], key: ['id'], version: true },
  party_activity_participant_bindings: { modes: ['insert', 'update'], key: ['activity_execution_id', 'participant_kind', 'participant_id'], version: true },
  party_temporal_events: { modes: ['insert', 'update'], key: ['event_id'], version: true },
  party_remote_aggregate_states: { modes: ['insert', 'update'], key: ['aggregate_id'], version: true },
  party_propagation_processes: { modes: ['insert', 'update'], key: ['process_id'], version: true },
  party_npc_knowledge_merge_states: { modes: ['update'], key: ['party_id', 'npc_id'], version: true },
  party_npc_knowledge: { modes: ['insert'], key: ['party_id', 'npc_id', 'fact_id'] },
  party_npcs: { modes: ['insert'], key: ['party_id', 'npc_id'] },
  party_npc_traits: { modes: ['insert'], key: ['party_id', 'npc_id', 'trait_domain', 'category_id'] },
  party_items: { modes: ['insert'], key: ['party_id', 'item_id'] },
  party_item_placements: { modes: ['insert'], key: ['party_id', 'item_id'] },
  party_ownership: { modes: ['insert'], key: ['party_id', 'ownership_id'] },
  party_character_knowledge: {
    modes: ['insert'],
    key: ['party_id', 'character_id', 'fact_id']
  },
  party_containers: {
    modes: ['insert', 'update'],
    key: ['party_id', 'container_id'],
    version: true
  },
  party_route_plans: { modes: ['insert'], key: ['id'] },
  party_route_plan_steps: { modes: ['insert'], key: ['route_plan_id', 'ordinal'] },
  party_transit_anchors: { modes: ['insert', 'update'], key: ['id'], version: true },
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
  'party_actor_npc_interaction_summaries',
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
  : write?.target_table === 'party_entity_controls' ? write.id === `${write.record?.entity_kind}:${write.record?.entity_id}`
  : write?.target_table === 'parties' ? write.record?.party_id === write.id
    : write?.target_table === 'party_positions'
      ? write.record?.party_id === write.id
      : write?.target_table === 'party_server_sessions'
        ? write.record?.party_id === write.id
        : write?.target_table === 'party_state_snapshots'
          ? write.id === `${write.record?.party_id}:${write.record?.state_version}`
  : write?.target_table === 'party_clocks' ? write.record?.party_id === write.id
    : write?.target_table === 'party_route_plan_execution_events' ? write.id === `${write.record?.execution_id}:${write.record?.event_ordinal}`
      : write?.target_table === 'party_timed_activity_attempts' ? write.id === `${write.record?.activity_execution_id}:${write.record?.attempt_ordinal}`
        : write?.target_table === 'party_route_plan_steps' ? write.id === `${write.record?.route_plan_id}:${write.record?.ordinal}`
          : write?.target_table === 'party_visible_packages' ? write.record?.package_id === write.id
        : write?.target_table === 'party_narration_jobs' ? write.record?.job_id === write.id
          : write?.target_table === 'party_activity_participant_bindings' ? write.id === `${write.record?.activity_execution_id}:${write.record?.participant_kind}:${write.record?.participant_id}`
            : write?.target_table === 'party_activity_resource_bindings' ? write.id === `${write.record?.activity_execution_id}:${write.record?.resource_kind}:${write.record?.resource_id}:${write.record?.binding_kind}`
              : write?.target_table === 'party_actor_profile_bindings' ? write.id === `${write.record?.actor_kind}:${write.record?.actor_id}`
                : write?.target_table === 'party_actor_body_states' ? write.id === `${write.record?.actor_kind}:${write.record?.actor_id}`
                  : write?.target_table === 'party_actor_active_conditions' ? write.id === `${write.record?.actor_kind}:${write.record?.actor_id}:${write.record?.condition_id}`
                    : write?.target_table === 'party_resource_nodes' ? write.record?.resource_node_id === write.id
                      : write?.target_table === 'party_transports' ? write.record?.transport_id === write.id
                        : write?.target_table === 'party_actor_relations' ? write.record?.relation_id === write.id
                          : write?.target_table === 'party_check_resolutions' ? write.record?.check_resolution_id === write.id
                            : write?.target_table === 'party_actor_npc_interactions' ? write.record?.interaction_id === write.id
                              : write?.target_table === 'party_actor_npc_interaction_summaries' ? write.record?.summary_id === write.id
                                : write?.target_table === 'party_npcs' ? write.record?.npc_id === write.id
                                  : write?.target_table === 'party_npc_traits' ? write.id === `${write.record?.npc_id}:${write.record?.trait_domain}:${write.record?.category_id}`
                                    : write?.target_table === 'party_items' ? write.record?.item_id === write.id
                                      : write?.target_table === 'party_item_placements' ? write.record?.item_id === write.id
                                        : write?.target_table === 'party_ownership' ? write.record?.ownership_id === write.id
                                        : write?.target_table === 'party_character_knowledge' ? write.id === `${write.record?.character_id}:${write.record?.fact_id}`
                                      : write?.target_table === 'party_containers' ? write.record?.container_id === write.id
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
      return write.record?.execution_scope === 'standalone'
        ? []
        : [`party_runtime.party_route_plan_executions:${write.record?.route_plan_execution_id}`];
    case 'party_action_step_runs':
      return write.record?.action_scope === 'standalone'
        ? []
        : [`party_runtime.party_route_plan_executions:${write.record?.execution_id}`];
    case 'party_route_plan_execution_events':
    case 'party_traversal_interval_results':
      return [`party_runtime.party_route_plan_executions:${write.record?.route_plan_execution_id ?? write.record?.execution_id}`];
    case 'party_route_plan_steps':
      return [`party_runtime.party_route_plans:${write.record?.route_plan_id}`];
    case 'party_journey_locations':
      return write.record?.location_kind === 'in_transit'
        ? [`party_runtime.traveller_travel_states:${
            write.record?.travel_state_id
          }`]
        : [];
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
    case 'party_item_placements':
      return [`party_runtime.party_items:${write.record?.item_id}`];
    case 'party_ownership':
      return write.record?.item_id
        ? [`party_runtime.party_items:${write.record.item_id}`]
        : [`party_runtime.party_containers:${write.record?.container_id}`];
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
    case 'party_actor_npc_interaction_summaries':
      return [`party_runtime.party_actor_npc_interactions:${write.record?.interaction_id}`];
    case 'party_actor_active_conditions':
      return [`party_runtime.party_actor_body_states:${write.record?.actor_kind}:${write.record?.actor_id}`];
    default:
      return [];
  }
}
