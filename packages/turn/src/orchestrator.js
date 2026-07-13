import { deepFreeze } from '@rus/kernel';
import { runStageGraph } from '@rus/pipeline-engine';
import { createTurnWorkflowContext } from './context.js';
import { TURN_WORKFLOW_STAGE_PLAN, validateTurnWorkflowStagePlan } from './stage-plan.js';
import { validateTurnServices } from './ports.js';
import { assertValid, validateTurnResult } from './validators.js';
import { createTurnStageDefinitions } from './workflow-stages.js';
import { turnFailure } from './errors.js';

export async function runTurnWorkflow(input = {}, services = {}, options = {}) {
  validateTurnWorkflowStagePlan(options.stagePlan ?? TURN_WORKFLOW_STAGE_PLAN);
  validateTurnServices(services);
  const now = String(options.now ?? input.received_at ?? new Date().toISOString());
  const context = createTurnWorkflowContext({
    requestId: options.requestId,
    partyId: input.party_id ?? input.partyId,
    turnNumber: input.turn_number ?? input.turnNumber,
    now,
    initial: options.checkpoint
  });
  const stages = createTurnStageDefinitions({ context, services, rawInput: input, now });
  const events = [];
  const graphResult = await runStageGraph({
    stages,
    input: deepFreeze({ version: 1, schema: 'turn_workflow_state' }),
    services,
    onEvent: (event) => events.push(structuredClone(event))
  });

  if (graphResult.status !== 'approved') {
    throw turnFailure(
      graphResult.status === 'repair_required' ? 'TURN_REPAIR_REQUIRED' : 'TURN_WORKFLOW_STOPPED',
      `Turn workflow stopped at ${graphResult.stage_id} with status ${graphResult.status}.`,
      { stage_id: graphResult.stage_id, status: graphResult.status, result: graphResult.result, events }
    );
  }

  const state = graphResult.artifact;
  const result = {
    version: 1,
    schema: 'turn_result',
    turn_id: state.modeResolution.turn_id,
    party_id: state.playerInput.party_id,
    turn_number: state.playerInput.turn_number,
    status: state.consequence.status,
    mode: state.modeResolution.selected_primary_mode,
    screen: state.screen,
    commit: state.commit,
    summary: {
      duration_minutes: state.consequence.duration_minutes ?? 0,
      check_count: state.checks.results.length,
      write_target_count: state.writePlan.write_targets.length,
      pipeline_event_count: events.length
    },
    checkpoint: context.snapshot()
  };
  assertValid('turn_result', validateTurnResult(result));
  return deepFreeze(result);
}
