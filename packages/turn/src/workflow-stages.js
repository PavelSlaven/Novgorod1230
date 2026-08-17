import { deepFreeze } from '@rus/kernel';
import { normalizeTurnIntent } from './stages/normalize-intent.js';
import { resolveTurnModeStage } from './stages/resolve-mode.js';
import { loadTurnContextStage } from './stages/load-context.js';
import { buildAvailableActionsStage } from './stages/available-actions.js';
import {
  revalidateTurnContextStage
} from './stages/revalidate-context.js';
import { resolveAvailabilityStage } from './stages/availability.js';
import { executeApprovedChecksStage } from './stages/checks.js';
import { resolveConsequenceStage } from './stages/consequence.js';
import { buildTimeUpdateStage } from './stages/time-update.js';
import { buildBodyUpdateStage } from './stages/body-update.js';
import { buildHiddenUpdateStage } from './stages/hidden-update.js';
import { buildVisibleProjectionStage } from './stages/visible-projection.js';
import { buildNarrationStage } from './stages/narration.js';
import { buildPersistencePlanStage } from './stages/persistence-plan.js';
import { commitTurnStage } from './stages/commit.js';
import {
  loadPersistedVisibleProjectionStage
} from './stages/persisted-visible-projection.js';
import { buildScreenProjectionStage } from './stages/screen-projection.js';
import {
  getTurnStepWorkflowDraft,
  turnStepDraftActionProductionAtomicWritePlan,
  turnStepDraftLocalFireAtomicWritePlan,
  turnStepDraftOrdinaryAtomicWritePlan,
  turnStepDraftOperationBatch,
  turnStepDraftPreparedEffectLedger
} from './turn-step-workflow-draft.js';

export function createTurnStageDefinitions({ context, services, rawInput, now }) {
  const definitions = [
    stage(1, 'normalize_intent', async (state) => next(state, 'playerInput', normalizeTurnIntent(rawInput, now), context)),
    stage(2, 'load_context', async (state) => next(state, 'retrievedState', await loadTurnContextStage({
      playerInput: state.playerInput,
      routingContext: rawInput.routing_context ?? rawInput.routingContext ?? {},
      commandRegistry: services.commandRegistry,
      stateReader: services.stateReader
    }), context)),
    stage(3, 'available_actions', async (state) => next(state, 'actionSet', await buildAvailableActionsStage({
      playerInput: state.playerInput,
      retrievedState: state.retrievedState,
      routingContext: rawInput.routing_context ?? rawInput.routingContext ?? {},
      commandRegistry: services.commandRegistry
    }), context)),
    stage(4, 'resolve_mode', async (state) => next(state, 'modeResolution', await resolveTurnModeStage({
      playerInput: state.playerInput,
      routingContext: rawInput.routing_context ?? rawInput.routingContext ?? {},
      retrievedState: state.retrievedState,
      actionSet: state.actionSet,
      commandRegistry: services.commandRegistry,
      services,
      now
    }), context)),
    stage(5, 'revalidate_context', async (state) => next(
      state,
      'revalidatedState',
      await revalidateTurnContextStage({
        playerInput: state.playerInput,
        modeResolution: state.modeResolution,
        routingContext:
          rawInput.routing_context ?? rawInput.routingContext ?? {},
        actionSet: state.actionSet,
        commandRegistry: services.commandRegistry,
        stateReader: services.stateReader
      }),
      context
    )),
    stage(6, 'availability', async (state) => next(state, 'availability', await resolveAvailabilityStage({
      playerInput: state.playerInput,
      modeResolution: state.modeResolution,
      retrievedState: state.revalidatedState,
      commandRegistry: services.commandRegistry
    }), context)),
    stage(7, 'checks', async (state) => next(state, 'checks', executeApprovedChecksStage({
      availability: state.availability,
      services,
      modeResolution: state.modeResolution
    }), context)),
    stage(8, 'consequence', async (state) => {
      const consequence = await resolveConsequenceStage({
        playerInput: state.playerInput,
        modeResolution: state.modeResolution,
        retrievedState: state.revalidatedState,
        availability: state.availability,
        checks: state.checks,
        commandRegistry: services.commandRegistry
      });
      if (consequence.status === 'repair_required'
          || consequence.status === 'blocked') {
        return { status: consequence.status, artifact: consequence };
      }
      return approved(next(state, 'consequence', consequence, context));
    }, true),
    stage(9, 'time_update', async (state) => next(state, 'timeUpdate', await buildTimeUpdateStage({
      retrievedState: state.revalidatedState,
      consequence: state.consequence,
      temporalAdvance: services.temporalAdvance,
      turnStepOperationBatch: turnStepDraftOperationBatch(
        getTurnStepWorkflowDraft(state.modeResolution)),
      preparedEffectLedger: turnStepDraftPreparedEffectLedger(
        getTurnStepWorkflowDraft(state.modeResolution))
    }), context)),
    stage(10, 'body_update', async (state) => next(state, 'bodyUpdate', await buildBodyUpdateStage({
      retrievedState: state.revalidatedState,
      consequence: state.consequence,
      timeUpdate: state.timeUpdate,
      bodyEffect: services.bodyEffect,
      preparedEffectLedger: turnStepDraftPreparedEffectLedger(
        getTurnStepWorkflowDraft(state.modeResolution))
    }), context)),
    stage(11, 'hidden_update', async (state) => next(state, 'hiddenUpdate', await buildHiddenUpdateStage({
      playerInput: state.playerInput,
      modeResolution: state.modeResolution,
      retrievedState: state.revalidatedState,
      consequence: state.consequence,
      timeUpdate: state.timeUpdate,
      commandRegistry: services.commandRegistry
    }), context)),
    stage(12, 'visible_projection', async (state) => next(state, 'visibleContext', await buildVisibleProjectionStage({
      playerInput: state.playerInput,
      modeResolution: state.modeResolution,
      retrievedState: state.revalidatedState,
      consequence: state.consequence,
      timeUpdate: state.timeUpdate,
      bodyUpdate: state.bodyUpdate,
      visibleProjector: services.visibleProjector
    }), context)),
    stage(13, 'persistence_plan', async (state) => next(state, 'writePlan', await buildPersistencePlanStage({
      playerInput: state.playerInput,
      retrievedState: state.revalidatedState,
      modeResolution: state.modeResolution,
      availability: state.availability,
      checks: state.checks,
      consequence: state.consequence,
      timeUpdate: state.timeUpdate,
      bodyUpdate: state.bodyUpdate,
      hiddenUpdate: state.hiddenUpdate,
      visibleContext: state.visibleContext,
      ordinary_materialization_atomic_write_plan: turnStepDraftOrdinaryAtomicWritePlan(
        getTurnStepWorkflowDraft(state.modeResolution)),
      action_production_atomic_write_plan:
        turnStepDraftActionProductionAtomicWritePlan(
          getTurnStepWorkflowDraft(state.modeResolution)),
      local_fire_atomic_write_plan: turnStepDraftLocalFireAtomicWritePlan(
        getTurnStepWorkflowDraft(state.modeResolution)),
      commandRegistry: services.commandRegistry
    }), context)),
    stage(14, 'commit', async (state) => {
      if (getTurnStepWorkflowDraft(state.modeResolution)) {
        await revalidateTurnContextStage({
          playerInput: state.playerInput,
          modeResolution: state.modeResolution,
          routingContext:
            rawInput.routing_context ?? rawInput.routingContext ?? {},
          actionSet: state.actionSet,
          commandRegistry: services.commandRegistry,
          stateReader: services.stateReader,
          finalCommit: true
        });
      }
      return next(state, 'commit', await commitTurnStage({
        writePlan: state.writePlan,
        partyStore: services.partyStore,
        materializer: services.materializer
      }), context);
    }),
    stage(15, 'persisted_visible_projection', async (state) => next(state, 'persistedVisibleContext', await loadPersistedVisibleProjectionStage({
      playerInput: state.playerInput,
      modeResolution: state.modeResolution,
      commit: state.commit,
      expectedVisibleContext: state.visibleContext,
      persistedVisibleReader: services.persistedVisibleReader
    }), context)),
    stage(16, 'narration', async (state) => next(state, 'narration', await buildNarrationStage({
      playerInput: state.playerInput,
      modeResolution: state.modeResolution,
      visibleContext: state.persistedVisibleContext,
      narrator: services.narrator
    }), context)),
    stage(17, 'screen_projection', async (state) => next(state, 'screen', buildScreenProjectionStage({
      playerInput: state.playerInput,
      modeResolution: state.modeResolution,
      visibleContext: state.persistedVisibleContext,
      narration: state.narration,
      consequence: state.consequence,
      screenProjector: services.screenProjector
    }), context))
  ];
  return deepFreeze(definitions);
}

function stage(id, name, execute, rawResult = false) {
  return {
    id,
    name,
    async execute({ input }) {
      const output = await execute(input);
      return rawResult ? output : approved(output);
    }
  };
}

function approved(artifact) {
  return { status: 'approved', artifact };
}

function next(state, key, value, context) {
  context.setStage(stageNameForKey(key), value);
  // The action set, semantic mode and write plan carry in-process capability
  // seals. Cloning deliberately strips the corresponding validation capability.
  const serializable = Object.fromEntries(
    Object.entries(state).filter(([name]) =>
      !['actionSet', 'modeResolution', 'writePlan'].includes(name))
  );
  return deepFreeze({
    ...structuredClone(serializable),
    ...(state.actionSet ? { actionSet: state.actionSet } : {}),
    ...(state.modeResolution ? { modeResolution: state.modeResolution } : {}),
    ...(state.writePlan ? { writePlan: state.writePlan } : {}),
    [key]: ['actionSet', 'modeResolution', 'writePlan'].includes(key)
      ? value
      : structuredClone(value)
  });
}

function stageNameForKey(key) {
  return {
    playerInput: 'normalize_intent',
    retrievedState: 'load_context',
    revalidatedState: 'revalidate_context',
    actionSet: 'available_actions',
    modeResolution: 'resolve_mode',
    availability: 'availability',
    checks: 'checks',
    consequence: 'consequence',
    timeUpdate: 'time_update',
    bodyUpdate: 'body_update',
    hiddenUpdate: 'hidden_update',
    visibleContext: 'visible_projection',
    writePlan: 'persistence_plan',
    commit: 'commit',
    persistedVisibleContext: 'persisted_visible_projection',
    narration: 'narration',
    screen: 'screen_projection'
  }[key];
}
