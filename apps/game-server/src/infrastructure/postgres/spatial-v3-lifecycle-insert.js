function quoted(value) {
  return `"${value}"`;
}

async function insertRecord(tx, table, record) {
  const columns = Object.keys(record);
  const values = columns.map((column) => record[column]);
  await tx.query(
    `INSERT INTO party_runtime.${quoted(table)}
     (${columns.map(quoted).join(', ')})
     VALUES (${values.map((_, index) => `$${index + 1}`).join(', ')})`,
    values
  );
}

export async function applySealedLifecycleInsert(tx, write) {
  if (write.target_table === 'party_route_plan_executions'
      && ['active', 'completed', 'aborted'].includes(
        write.record.status
      )) {
    return insertRouteExecution(tx, write.record);
  }
  if (write.target_table === 'party_timed_activity_executions'
      && ['completed', 'failed', 'aborted'].includes(write.record.status)) {
    return insertActivityExecution(tx, write.record);
  }
  if (write.target_table === 'party_temporal_events'
      && ['resolved', 'cancelled', 'blocked'].includes(write.record.status)) {
    return insertTemporalEvent(tx, write.record);
  }
  return null;
}

async function insertTemporalEvent(tx, terminal) {
  await insertRecord(tx, 'party_temporal_events', {
    ...terminal,
    status: 'pending',
    terminal_change_set_id: null,
    state_version: 1
  });
  return async () => {
    const result = await tx.query(
      `UPDATE party_runtime.party_temporal_events
          SET status=$2,terminal_change_set_id=$3,state_version=$4
        WHERE event_id=$1 AND status='pending' AND state_version=1`,
      [
        terminal.event_id,
        terminal.status,
        terminal.terminal_change_set_id,
        terminal.state_version
      ]
    );
    if (result.rowCount !== 1) {
      throw Object.assign(new Error('temporal event lifecycle transition failed'), {
        spatialCode: 'state_version_conflict'
      });
    }
  };
}

async function insertRouteExecution(tx, terminal) {
  const source = (await tx.query(
    `SELECT source_endpoint_snapshot
     FROM party_runtime.party_route_plans
     WHERE id=$1`,
    [terminal.route_plan_id]
  )).rows[0]?.source_endpoint_snapshot;
  if (!source) {
    throw Object.assign(
      new Error('route plan source is unavailable for lifecycle insert'),
      { spatialCode: 'generated_schema_mismatch' }
    );
  }
  const activeTravelStateId = terminal.id.replace(
    'route-execution:',
    'travel-state:'
  );
  await insertRecord(tx, 'party_route_plan_executions', {
    ...terminal,
    status: 'planned',
    current_step_ordinal: 0,
    current_endpoint_ref: source,
    active_travel_state_id: null,
    final_location_snapshot: null,
    abort_reason_code: null,
    started_at_turn: null,
    terminal_at_turn: null,
    state_version: 1
  });
  if (terminal.status === 'active') {
    return async () => {
      await tx.query(
        `UPDATE party_runtime.party_route_plan_executions
         SET status='active',
             current_step_ordinal=$2,
             current_endpoint_ref=NULL,
             active_travel_state_id=$3,
             started_at_turn=$4,
             state_version=2,
             updated_change_set_id=$5
         WHERE id=$1 AND status='planned' AND state_version=1`,
        [
          terminal.id,
          terminal.current_step_ordinal,
          terminal.active_travel_state_id,
          terminal.started_at_turn,
          terminal.updated_change_set_id
        ]
      );
      await tx.query(
        `UPDATE party_runtime.party_route_plan_executions
         SET state_version=$2,
             updated_change_set_id=$3
         WHERE id=$1 AND status='active' AND state_version=2`,
        [
          terminal.id,
          terminal.state_version,
          terminal.updated_change_set_id
        ]
      );
    };
  }
  return async () => {
    await tx.query(
      `UPDATE party_runtime.party_route_plan_executions
     SET status='active',
         current_endpoint_ref=NULL,
         active_travel_state_id=$2,
         started_at_turn=$3,
         state_version=2
     WHERE id=$1 AND status='planned' AND state_version=1`,
      [terminal.id, activeTravelStateId, terminal.started_at_turn]
    );
    await tx.query(
      `UPDATE party_runtime.party_route_plan_executions
     SET status=$2,
         current_step_ordinal=NULL,
         current_endpoint_ref=NULL,
         active_travel_state_id=NULL,
         final_location_snapshot=$3,
         abort_reason_code=$4,
         terminal_at_turn=$5,
         state_version=$7,
         updated_change_set_id=$6
     WHERE id=$1 AND status='active' AND state_version=2`,
      [
        terminal.id,
        terminal.status,
        terminal.final_location_snapshot,
        terminal.abort_reason_code,
        terminal.terminal_at_turn,
        terminal.updated_change_set_id,
        terminal.state_version
      ]
    );
  };
}

async function insertActivityExecution(tx, terminal) {
  const elapsed = terminal.original_total_minutes;
  await insertRecord(tx, 'party_timed_activity_executions', {
    ...terminal,
    cumulative_elapsed_numerator: 0,
    remaining_time_numerator: elapsed,
    next_attempt_ordinal: 0,
    status: 'active',
    state_version: 1,
    terminal_change_set_id: null,
    last_processed_at_whole_minutes:
      terminal.started_at_whole_minutes,
    next_boundary_at_whole_minutes:
      terminal.started_at_whole_minutes + Number(elapsed),
    next_boundary_at_subminute_numerator: 0,
    next_boundary_at_subminute_denominator: 1,
    terminal_reason_code: null
  });
  return async () => {
    await tx.query(
      `UPDATE party_runtime.party_timed_activity_executions
     SET cumulative_elapsed_numerator=$2,
         remaining_time_numerator=0,
         next_attempt_ordinal=1,
         status=$3,
         state_version=2,
         updated_change_set_id=$4,
         terminal_change_set_id=$4,
         last_processed_at_whole_minutes=$5,
         next_boundary_at_whole_minutes=NULL,
         next_boundary_at_subminute_numerator=NULL,
         next_boundary_at_subminute_denominator=NULL,
         terminal_reason_code=$6
     WHERE id=$1 AND status='active' AND state_version=1`,
      [
        terminal.id,
        elapsed,
        terminal.status,
        terminal.updated_change_set_id,
        terminal.last_processed_at_whole_minutes,
        terminal.terminal_reason_code
      ]
    );
  };
}
