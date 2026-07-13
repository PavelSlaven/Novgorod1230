import { deepFreeze } from '@rus/kernel';
import { normalizeTurnIntent } from './stages/normalize-intent.js';
import { resolveTurnModeStage } from './stages/resolve-mode.js';
import { loadTurnContextStage } from './stages/load-context.js';
import { resolveAvailabilityStage } from './stages/availability.js';
import { executeApprovedChecksStage } from './stages/checks.js';
import { resolveConsequenceStage } from './stages/consequence.js';
import { buildTimeUpdateStage } from './stages/time-update.js';
import { buildHiddenUpdateStage } from './stages/hidden-update.js';
import { buildVisibleProjectionStage } from './stages/visible-projection.js';
import { buildNarrationStage } from './stages/narration.js';
import { buildPersistencePlanStage } from './stages/persistence-plan.js';
import { commitTurnStage } from './stages/commit.js';
import { buildScreenProjectionStage } from './stages/screen-projection.js';

export function createTurnStageDefinitions({ context, services, rawInput, now }) {
  const definitions = [
    stage(1, 'normalize_intent', async (state) => next(state, 'playerInput', normalizeTurnIntent(rawInput, now), context)),
    stage(2, 'resolve_mode', async (state) => next(state, 'modeResolution', await resolveTurnModeStage({
      playerInput: state.playerInput,
      routingContext: rawInput.routing_context ?? rawInput.routingContext ?? {},
      modeResolver: services.modeResolver
    }), context)),
    stage(3, 'load_context', async (state) => next(state, 'retrievedState', await loadTurnContextStage({
      playerInput: state.playerInput,
      modeResolution: state.modeResolution,
      stateReader: services.stateReader
    }), context)),
    stage(4, 'availability', async (state) => next(state, 'availability', await resolveAvailabilityStage({
      playerInput: state.playerInput,
      modeResolution: state.modeResolution,
      retrievedState: state.retrievedState,
      availabilityResolver: services.availabilityResolver
    }), context)),
    stage(5, 'checks', async (state) => next(state, 'checks', executeApprovedChecksStage({ availability: state.availability, services }), context)),
    stage(6, 'consequence', async (state) => {
      const consequence = await resolveConsequenceStage({
        playerInput: state.playerInput,
        modeResolution: state.modeResolution,
        retrievedState: state.retrievedState,
        availability: state.availability,
        checks: state.checks,
        consequenceResolver: services.consequenceResolver
      });
      if (consequence.status === 'repair_required') {
        return { status: 'repair_required', artifact: consequence };
      }
      return approved(next(state, 'consequence', consequence, context));
    }, true),
    stage(7, 'time_update', async (state) => next(state, 'timeUpdate', buildTimeUpdateStage({ retrievedState: state.retrievedState, consequence: state.consequence }), context)),
    stage(8, 'hidden_update', async (state) => next(state, 'hiddenUpdate', await buildHiddenUpdateStage({
      playerInput: state.playerInput,
      modeResolution: state.modeResolution,
      retrievedState: state.retrievedState,
      consequence: state.consequence,
      timeUpdate: state.timeUpdate,
      hiddenUpdater: services.hiddenUpdater
    }), context)),
    stage(9, 'visible_projection', async (state) => next(state, 'visibleContext', await buildVisibleProjectionStage({
      playerInput: state.playerInput,
      modeResolution: state.modeResolution,
      retrievedState: state.retrievedState,
      consequence: state.consequence,
      timeUpdate: state.timeUpdate,
      visibleProjector: services.visibleProjector
    }), context)),
    stage(10, 'narration', async (state) => next(state, 'narration', await buildNarrationStage({
      playerInput: state.playerInput,
      modeResolution: state.modeResolution,
      visibleContext: state.visibleContext,
      narrator: services.narrator
    }), context)),
    stage(11, 'persistence_plan', async (state) => next(state, 'writePlan', await buildPersistencePlanStage({
      playerInput: state.playerInput,
      modeResolution: state.modeResolution,
      availability: state.availability,
      consequence: state.consequence,
      timeUpdate: state.timeUpdate,
      hiddenUpdate: state.hiddenUpdate,
      visibleContext: state.visibleContext,
      narration: state.narration,
      writePlanner: services.writePlanner
    }), context)),
    stage(12, 'commit', async (state) => next(state, 'commit', await commitTurnStage({ writePlan: state.writePlan, partyStore: services.partyStore }), context)),
    stage(13, 'screen_projection', async (state) => next(state, 'screen', buildScreenProjectionStage({
      playerInput: state.playerInput,
      modeResolution: state.modeResolution,
      visibleContext: state.visibleContext,
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
  return deepFreeze({ ...structuredClone(state), [key]: structuredClone(value) });
}

function stageNameForKey(key) {
  return {
    playerInput: 'normalize_intent',
    modeResolution: 'resolve_mode',
    retrievedState: 'load_context',
    availability: 'availability',
    checks: 'checks',
    consequence: 'consequence',
    timeUpdate: 'time_update',
    hiddenUpdate: 'hidden_update',
    visibleContext: 'visible_projection',
    narration: 'narration',
    writePlan: 'persistence_plan',
    commit: 'commit',
    screen: 'screen_projection'
  }[key];
}
