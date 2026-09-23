import {
  childParentKeys, keyOf
} from './spatial-v3-write-layout.js';

function orderingParentKeys(write) {
  const parents = new Set(childParentKeys(write));
  const record = write.record;
  if (write.target_table === 'party_npcs' && record.run_id) {
    parents.add(`party_runtime.party_materialization_runs:${record.run_id}`);
  }
  if (write.target_table === 'party_npc_spatial_schedules') {
    parents.add(`party_runtime.party_npcs:${record.npc_id}`);
  }
  if (['party_ordinary_materialization_contexts', 'party_ordinary_materialization_basis_catalog', 'party_ordinary_materialization_enablements'].includes(write.target_table)) {
    parents.add(`party_runtime.party_ordinary_materialization_aggregates:${record.party_id}:${record.scope_kind}:${record.scope_id}`);
  }
  if (write.target_table === 'party_ordinary_materialization_enablements') {
    parents.add(`party_runtime.party_ordinary_materialization_contexts:${record.party_id}:${record.scope_kind}:${record.scope_id}`);
  }
  if (write.target_table === 'party_resource_nodes' && record.position_node_id) {
    parents.add(`party_runtime.scene_position_nodes:${record.position_node_id}`);
  }
  if (write.target_table === 'party_materialization_runs') {
    if (record.trace?.created_change_set_id) parents.add(`party_runtime.party_v3_change_sets:${record.trace.created_change_set_id}`);
    if (record.supersedes_run_id) parents.add(`party_runtime.party_materialization_runs:${record.supersedes_run_id}`);
  }
  if (write.target_table === 'party_scene_baselines' && record.materialization_trace_id) {
    parents.add(`party_runtime.party_materialization_runs:${record.materialization_trace_id}`);
  }
  if (write.target_table === 'expansion_frontiers') {
    parents.add(`party_runtime.party_g5_sites:${record.source_g5_site_id}`);
    if (record.continuation_chain_id) {
      parents.add(`party_runtime.party_continuation_chains:${record.continuation_chain_id}`);
    }
  }
  if (['expansion_capacity_reservations', 'scene_frontier_bindings'].includes(write.target_table)) {
    parents.add(`party_runtime.expansion_frontiers:${record.frontier_id}`);
  }
  if (write.target_table === 'scene_frontier_bindings') {
    parents.add(`party_runtime.scene_position_nodes:${record.position_id}`);
    parents.add(`party_runtime.party_scene_baselines:${record.scene_baseline_id}`);
  }
  if (write.target_table === 'g5_site_connections') {
    parents.add(`party_runtime.party_g5_sites:${record.from_site_id}`);
    parents.add(`party_runtime.party_g5_sites:${record.to_site_id}`);
    if (record.portal_entity_id) parents.add(`party_runtime.portal_entities:${record.portal_entity_id}`);
  }
  if (write.target_table === 'party_site_connection_endpoint_bindings') {
    parents.add(`party_runtime.g5_site_connections:${record.site_connection_id}`);
    parents.add(`party_runtime.party_g5_sites:${record.g5_site_id}`);
    parents.add(`party_runtime.scene_position_nodes:${record.position_id}`);
  }
  if (write?.target_table !== 'party_v3_change_sets') {
    for (const [field, value] of Object.entries(write?.record ?? {})) {
      if (field.endsWith('_change_set_id') && value) {
        parents.add(`party_runtime.party_v3_change_sets:${value}`);
      }
    }
  }
  if (write?.target_table === 'party_scene_baselines'
      && write.record?.host_kind === 'g5_site') {
    parents.add(`party_runtime.party_g5_sites:${write.record.host_id}`);
  }
  if (write?.target_table === 'party_route_plan_executions'
      && write.record?.route_plan_id) {
    parents.add(
      `party_runtime.party_route_plans:${write.record.route_plan_id}`
    );
  }
  if (write?.target_table === 'traveller_travel_states'
      && write.record?.route_plan_execution_id) {
    parents.add(
      `party_runtime.party_route_plan_executions:${write.record.route_plan_execution_id}`
    );
  }
  if (write?.target_table === 'party_containers'
      && write.record?.holder_npc_id) {
    parents.add(
      `party_runtime.party_npcs:${write.record.holder_npc_id}`
    );
  }
  if (write?.target_table === 'party_journey_locations'
      && write.record?.location_kind === 'scene'
      && write.record?.scene_position_id) {
    parents.add(
      `party_runtime.scene_position_nodes:${write.record.scene_position_id}`
    );
  }
  if (write?.target_table === 'party_journey_locations'
      && write.record?.location_kind === 'transit_anchor'
      && write.record?.transit_anchor_id) {
    parents.add(
      `party_runtime.party_transit_anchors:${
        write.record.transit_anchor_id
      }`
    );
  }
  if (write?.target_table === 'party_journey_locations'
      && write.record?.location_kind === 'in_transit'
      && write.record?.travel_state_id) {
    parents.add(
      `party_runtime.traveller_travel_states:${
        write.record.travel_state_id
      }`
    );
  }
  if (write?.target_table === 'entity_placements'
      && write.record?.position_node_id) {
    parents.add(
      `party_runtime.scene_position_nodes:${write.record.position_node_id}`
    );
  }
  if (write?.target_table === 'party_temporal_event_dependencies'
      && write.record?.depends_on_event_id) {
    parents.add(
      `party_runtime.party_temporal_events:${write.record.depends_on_event_id}`
    );
  }
  if (write?.target_table === 'party_propagation_processes'
      && write.record?.aggregate_id) {
    parents.add(
      `party_runtime.party_remote_aggregate_states:${write.record.aggregate_id}`
    );
  }
  if (write?.target_table === 'party_npc_spatial_schedules'
      && write.record?.current_position_node_id) {
    parents.add(`party_runtime.scene_position_nodes:${write.record.current_position_node_id}`);
  }
  if (write?.target_table === 'party_npc_spatial_schedules'
      && write.record?.current_activity_execution_id) {
    parents.add(
      `party_runtime.party_timed_activity_executions:${write.record.current_activity_execution_id}`
    );
  }
  return [...parents];
}

export function orderWrites(plan) {
  const modeRank =
    Object.freeze({ update: 0, insert: 1, append: 2, delete: 3 });
  const pending = new Map([
    ...plan.updates.map((write) =>
      [keyOf(write), { mode: 'update', write }]),
    ...plan.inserts.map((write) =>
      [keyOf(write), { mode: 'insert', write }]),
    ...plan.appends.map((write) =>
      [keyOf(write), { mode: 'append', write }]),
    ...(plan.deletes ?? []).map((write) =>
      [keyOf(write), { mode: 'delete', write }])
  ]);
  const planKeys = new Set(pending.keys());
  const completed = new Set();
  const ordered = [];
  while (pending.size) {
    const ready = [...pending.entries()]
      .filter(([, entry]) => orderingParentKeys(entry.write)
        .filter((parent) => planKeys.has(parent))
        .every((parent) => completed.has(parent)))
      .sort((left, right) =>
        modeRank[left[1].mode] - modeRank[right[1].mode]
        || executionEventOrdinal(left[1].write)
          - executionEventOrdinal(right[1].write)
        || left[0].localeCompare(right[0]));
    if (!ready.length) {
      throw Object.assign(
        new Error('write dependency cycle'),
        { spatialCode: 'generated_schema_mismatch' }
      );
    }
    for (const [key, entry] of ready) {
      pending.delete(key);
      completed.add(key);
      ordered.push(entry);
    }
  }
  return ordered;
}

function executionEventOrdinal(write) {
  return write?.target_table === 'party_route_plan_execution_events'
    ? Number(write.record?.event_ordinal ?? 0)
    : 0;
}
