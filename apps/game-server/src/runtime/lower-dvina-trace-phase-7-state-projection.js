export function applyTracePhase7ScheduleState({ state, execution,
  changeSetId, activeActorStep }) {
  const next = structuredClone(state);
  const npc = next.npcs.find(({ instance_id: id }) =>
    id === execution.npc_ref);
  const completed = execution.status === 'executed';
  const stillRunning = execution.status === 'started'
    && activeActorStep?.status === 'started'
    && activeActorStep?.npc_ref === execution.npc_ref;
  if (!npc || (!completed && !stillRunning)) {
    fail('TRACE_PHASE_7_SCHEDULE_STATE_INVALID');
  }
  const history = tracePhase7ScheduleHistoryEntry(execution, changeSetId);
  npc.machine_state = {
    ...npc.machine_state,
    ...(completed && execution.movement_proposal ? {
      location_ref: execution.movement_proposal.location_ref,
      spatial_zone_ref: execution.movement_proposal.destination_zone_ref
    } : {}),
    status: completed ? activityStatus(execution.semantic_operation) : 'active',
    current_activity_ref: execution.activity_profile_ref,
    last_phase7_change_set_id: changeSetId,
    last_schedule_execution: history,
    npc_schedule_history: [
      ...(npc.machine_state?.npc_schedule_history ?? []), history
    ],
    ...(completed ? {} : {
      active_npc_actor_step: structuredClone(activeActorStep)
    })
  };
  if (completed && execution.property_proposal) {
    applyPropertyProposal(next, execution.property_proposal, changeSetId);
  }
  return next;
}

export function tracePhase7ScheduleHistoryEntry(execution, changeSetId) {
  return {
    status: execution.status,
    failure_code: execution.failure_code ?? null,
    semantic_operation: structuredClone(execution.semantic_operation),
    execution_binding_ref: execution.execution_binding_ref,
    schedule_option_id: execution.schedule_option_id,
    activity_profile_ref: execution.activity_profile_ref,
    exact_elapsed: structuredClone(execution.exact_elapsed),
    clock_before: structuredClone(execution.clock_before),
    clock_after: structuredClone(execution.clock_after),
    factual_result_source: execution.factual_result_source,
    change_set_id: changeSetId
  };
}

function applyPropertyProposal(next, property, changeSetId) {
  const container = next.containers.find(
    ({ container_id: id }) => id === property.item_id);
  if (!container) fail('TRACE_PHASE_7_ROAD_BAG_STATE_MISSING');
  container.state = {
    ...container.state,
    location_ref: property.destination.location_ref,
    zone_ref: property.destination.zone_ref,
    controller_npc_id: property.destination.controller_actor_id,
    ...(property.destination.visibility_state == null ? {} : {
      visibility_state: property.destination.visibility_state
    }),
    approved_transition_history: [
      ...(container.state?.approved_transition_history ?? []),
      {
        transition_profile_id: property.transition_profile_id,
        owner_change: 'forbidden',
        change_set_id: changeSetId
      }
    ]
  };
  container.state_version += 1;
}

function activityStatus(operation) {
  if (operation?.op === 'apply_semantic_activity') return 'idle';
  if (operation?.activity_kind === 'wait') return 'waiting';
  if (operation?.activity_kind === 'observe') return 'observing';
  return 'active';
}

function fail(code) {
  throw Object.assign(new Error(code), { code });
}
