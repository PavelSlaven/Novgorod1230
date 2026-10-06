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
  const recordEvent = (event) => {
    const snapshot = structuredClone(event);
    events.push(snapshot);
    try { options.onEvent?.(structuredClone(snapshot)); }
    catch { /* progress observation must not change the turn */ }
  };
  let graphResult;
  try {
    const initial = deepFreeze({ version: 1, schema: 'turn_workflow_state' });
    const prefix = await runStages(stages.slice(0, 7), initial, services, recordEvent);
    if (prefix.status !== 'approved') {
      graphResult = prefix;
    } else if (isSpatialRouteCommand(prefix.artifact)) {
      const transact = services.partyStore.withSpatialP16Transaction;
      if (typeof transact !== 'function') {
        throw turnFailure('TURN_SPATIAL_P16_TRANSACTION_REQUIRED',
          'Spatial route commands require a P16 transaction.');
      }
      const preloadPresentation = services.partyStore.preloadSpatialRoutePresentation;
      if (typeof preloadPresentation !== 'function') {
        throw turnFailure('TURN_SPATIAL_PRESENTATION_PRELOAD_REQUIRED',
          'Spatial route commits require presentation loaded before BEGIN.');
      }
      await preloadPresentation.call(services.partyStore,
        prefix.artifact.revalidatedState);
      let activeTransaction = null;
      const routeStages = createTurnStageDefinitions({
        context, services, rawInput: input, now,
        getTransaction: () => activeTransaction
      });
      let stopped;
      try {
        const middle = await transact.call(services.partyStore, async (transaction) => {
          activeTransaction = transaction;
          try {
            const result = await runStages(routeStages.slice(7, 14), prefix.artifact,
              services, recordEvent);
            if (result.status !== 'approved') {
              stopped = result;
              throw new RouteGraphStopped();
            }
            return result;
          } finally {
            activeTransaction = null;
          }
        });
        graphResult = await runStages(routeStages.slice(14), middle.artifact,
          services, recordEvent);
      } catch (error) {
        if (error instanceof RouteGraphStopped) graphResult = stopped;
        else throw error;
      }
    } else {
      graphResult = await runStages(stages.slice(7), prefix.artifact, services, recordEvent);
    }
  } catch (error) {
    observeFailure(options.onFailure, error, events, context);
    throw error;
  }

  if (graphResult.status !== 'approved') {
    const error = turnFailure(
      graphResult.status === 'repair_required' ? 'TURN_REPAIR_REQUIRED' : 'TURN_WORKFLOW_STOPPED',
      `Turn workflow stopped at ${graphResult.stage_id} with status ${graphResult.status}.`,
      { stage_id: graphResult.stage_id, status: graphResult.status, result: graphResult.result,
        events }
    );
    observeFailure(options.onFailure, error, events, context);
    throw error;
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
    ...(state.narration?.factual_delivery ? {
      factual_delivery: state.narration.factual_delivery
    } : {}),
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

async function runStages(stages, input, services, onEvent) {
  return runStageGraph({ stages, input, services, transient: true, onEvent });
}

function isSpatialRouteCommand(state) {
  return typeof state?.modeResolution?.command_id === 'string'
    && state.modeResolution.command_id.startsWith('live_world.follow_');
}

class RouteGraphStopped extends Error {}

function observeFailure(observer, error, events, context) {
  if (typeof observer !== 'function') return;
  try { Promise.resolve(observer({ error, events: structuredClone(events),
    checkpoint: context.snapshot() })).catch(() => undefined); }
  catch { /* Private failure observation must not change the turn. */ }
}
