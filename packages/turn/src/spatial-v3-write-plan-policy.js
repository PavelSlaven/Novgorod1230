export const PRESENTATION_TABLES = new Set(['party_visible_packages', 'party_narration_jobs']);
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
export const TABLE_MODES = Object.freeze({
  parties: ['updates'],
  party_server_sessions: ['updates'],
  party_state_snapshots: ['inserts'],
  party_v3_change_sets: ['appends'],
  party_route_plan_execution_events: ['appends'],
  party_traversal_interval_results: ['appends'],
  party_timed_activity_attempts: ['appends'],
  party_action_step_runs: ['appends'],
  party_activity_resource_bindings: ['appends'],
  party_check_resolutions: ['appends'],
  party_actor_npc_interactions: ['appends'],
  party_actor_npc_interaction_summaries: ['appends'],
  party_temporal_event_subjects: ['appends'],
  party_temporal_event_dependencies: ['appends'],
  party_npc_runtime_transitions: ['appends'],
  party_perception_records: ['appends'],
  party_perception_witnesses: ['appends'],
  party_perception_replay_evidence: ['appends'],
  party_npc_reaction_option_proposals: ['appends'],
  party_npc_decision_traces: ['appends'],
  party_npc_reaction_consequences: ['appends'],
  party_npc_knowledge_merge_results: ['appends'],
  party_body_temporal_history: ['appends'],
  party_visible_packages: ['appends'],
  party_route_plan_executions: ['inserts', 'updates'],
  party_timed_activity_executions: ['inserts', 'updates'],
  traveller_travel_states: ['inserts', 'updates'],
  party_journey_locations: ['inserts', 'updates', 'deletes'],
  party_clocks: ['updates'],
  party_carrier_attachments: ['inserts', 'updates'],
  party_npc_spatial_schedules: ['updates'],
  entity_placements: ['inserts', 'updates', 'deletes'],
  party_entity_controls: ['inserts', 'updates'],
  party_actor_profile_bindings: ['inserts', 'updates'],
  party_actor_body_states: ['inserts', 'updates'],
  party_actor_active_conditions: ['inserts', 'updates'],
  party_resource_nodes: ['inserts', 'updates'],
  party_transports: ['inserts', 'updates'],
  party_actor_relations: ['inserts', 'updates'],
  expansion_frontiers: ['updates'],
  expansion_capacity_reservations: ['updates'],
  party_activity_participant_bindings: ['inserts', 'updates'],
  party_temporal_events: ['inserts', 'updates'],
  party_remote_aggregate_states: ['inserts', 'updates'],
  party_propagation_processes: ['inserts', 'updates'],
  party_npc_knowledge_merge_states: ['updates'],
  party_npc_knowledge: ['inserts'],
  party_npcs: ['inserts'],
  party_npc_traits: ['inserts'],
  party_items: ['inserts'],
  party_item_placements: ['inserts'],
  party_character_knowledge: ['inserts'],
  party_containers: ['inserts', 'updates'],
  party_route_plans: ['inserts'],
  party_route_plan_steps: ['inserts'],
  party_transit_anchors: ['inserts', 'updates'],
  preparation_claims: ['inserts', 'updates'],
  party_g5_sites: ['inserts'],
  party_scene_baselines: ['inserts'],
  party_g6_instances: ['inserts'],
  scene_position_nodes: ['inserts'],
  party_cohorts: ['inserts'],
  party_cohort_memberships: ['inserts'],
  party_narration_jobs: ['inserts']
});
export const ALLOWED = new Set(Object.keys(TABLE_MODES));
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
export const validIdentity = (write) => write?.target_table === 'entity_placements'
  ? write.id === `${write.record?.entity_kind}:${write.record?.entity_id}`
  : write?.target_table === 'party_entity_controls' ? write.id === `${write.record?.entity_kind}:${write.record?.entity_id}`
  : write?.target_table === 'parties' ? write.record?.party_id === write.id
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
export function childParentIdentities(write) {
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
