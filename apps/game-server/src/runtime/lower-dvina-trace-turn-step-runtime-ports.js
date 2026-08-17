import { createTurnStepExecutionRegistry } from '@rus/turn';
import {
  applyBodyEvent,
  applySemanticActivity,
  resolveLowerDvinaTraceTurnStepCheckContext
} from './lower-dvina-trace-turn-step-delegated-ports.js';
import {
  createItemOperationHandlers,
  initializeRuntimeState
} from './lower-dvina-trace-turn-step-item-operations.js';
import { applyInventoryTransition, matchesItem, requireProjectedItem } from
  './lower-dvina-trace-turn-step-item-support.js';
import { applyActionProducedRuntimeProjection } from
  './lower-dvina-trace-action-produced-runtime.js';
import { createContainerAccessHandler, snapshotO2bCommittedContainerInput } from
  './lower-dvina-trace-turn-step-container-access.js';
import {
  createLowerDvinaTracePreparedDomainEffect
} from './lower-dvina-trace-turn-step-prepared-effects.js';

export function createLowerDvinaTraceTurnStepRuntimePorts({
  bodyEventOwner = null,
  committedState = null,
  genericCheckContextOwner = null,
  ordinaryDiscoveryResolver = null,
  ordinaryResultPolicy = null,
  admitAmbientOrdinaryPortion = null,
  requireAmbientOrdinaryAdmission = false,
  ordinaryContainerContentsResolver = null,
  resolveItemMechanics = null,
  semanticActivityOwner = null,
  temporalAdvance = null,
  bodyEffect = null,
  workingProjectionAuthority
} = {}) {
  if (typeof workingProjectionAuthority?.admit !== 'function') {
    throw new TypeError('workingProjectionAuthority.admit is required.');
  }
  const safeCommittedState = typeof ordinaryContainerContentsResolver === 'function'
    ? snapshotO2bCommittedContainerInput(committedState) : committedState;
  if (typeof ordinaryContainerContentsResolver === 'function'
      && committedState != null && safeCommittedState == null) {
    const error = new TypeError('TRACE_TURN_STEP_CONTAINER_ORDINARY_CONTEXT_INVALID');
    error.code = 'TRACE_TURN_STEP_CONTAINER_ORDINARY_CONTEXT_INVALID';
    throw error;
  }
  const state = initializeRuntimeState(safeCommittedState);
  const containerAccessHandler = createContainerAccessHandler(state, {
    ordinaryContainerContentsResolver
  });
  const handlers = {
    ...createItemOperationHandlers(state, {
      ordinaryResultPolicy,
      ambientOrdinaryPortionAdmission: admitAmbientOrdinaryPortion,
      requireAmbientOrdinaryAdmission,
      ordinaryContainerContentsResolver,
      resolveItemMechanics
    }),
    apply_body_event: (execution) =>
      applyBodyEvent(execution, state, bodyEventOwner)
  };
  const direct = Object.fromEntries(Object.entries(handlers)
    .map(([operation, handler]) => [
      operation,
      (execution) => admitResult(
        handler(execution), workingProjectionAuthority)
    ]));
  const phase9ContainerOwner = [17, 18, 19, 20, 21, 22, 23].includes(safeCommittedState
    ?.materialization_trace?.seed_context?.scenario_definition_revision)
    && (safeCommittedState.phase9 != null
      || safeCommittedState.last_turn?.consequence?.combat?.session_after
        ?.status === 'ended');
  const domain = phase9ContainerOwner ? {} : {
    request_container_access: (execution) => admitResult(
      containerAccessHandler(execution), workingProjectionAuthority)
  };
  const preparedDomainEffect = typeof temporalAdvance === 'function'
      && typeof bodyEffect?.apply === 'function'
    ? createLowerDvinaTracePreparedDomainEffect({
        state, committedState: safeCommittedState, temporalAdvance, bodyEffect
      })
    : null;
  return Object.freeze({
    executionRegistry: createTurnStepExecutionRegistry({
      direct,
      domain,
      applySemanticActivity: (execution) =>
        admitResult(
          applySemanticActivity(execution, state, semanticActivityOwner),
          workingProjectionAuthority
        )
    }),
    ...(preparedDomainEffect == null ? {} : {
      preparedDomainEffect: Object.freeze({
        supports: (input) => preparedDomainEffect.supports(input),
        assertContinuation: (input) => preparedDomainEffect.assertContinuation(input),
        currentState: (input) => preparedDomainEffect.currentState(input),
        apply: (input) => admitResult(
          preparedDomainEffect.apply(input), workingProjectionAuthority)
      })
    }),
    ...(preparedDomainEffect == null ? {} : {
      preparedEffectContext: Object.freeze({
        current_clock: structuredClone(
          safeCommittedState?.clock_weather_light?.clock
            ?? safeCommittedState?.clock),
        current_body_state: structuredClone(safeCommittedState?.body_state)
      }),
      preparedEffectTimeOwner: (input) => prepareEffectTime(
        input, safeCommittedState, temporalAdvance),
      preparedEffectBodyOwner: (input) => prepareEffectBody(
        input, safeCommittedState, bodyEffect),
      preparedEffectProjectionOwner: (input) => {
        preparedDomainEffect.advanceState(input);
        let projection = input.working_projection;
        for (const plan of input.prepared_effect?.time_update
          ?.local_fire_atomic_write_plans ?? []) {
          projection = applyLocalFireRuntimeProjection({ projection,
            actor: input.actor, plan, state, resolveItemMechanics });
        }
        return workingProjectionAuthority.admit(projection);
      }
    }),
    resolveCheckContext: (input) =>
      resolveLowerDvinaTraceTurnStepCheckContext(
        {
          ...input,
          actor: input.prepared_chain_context?.current_body_state == null
            ? input.actor : {
            ...input.actor,
            body: structuredClone(
              input.prepared_chain_context.current_body_state)
          }
        },
        genericCheckContextOwner),
    ...(typeof ordinaryDiscoveryResolver === 'function' ? {
      ordinaryDiscoveryResolver
    } : {}),
    applyActionProductionProjection: ({ working_projection: projection,
      actor, action_production_atomic_write_plan: plan }) =>
      workingProjectionAuthority.admit(applyActionProducedRuntimeProjection({
        workingProjection: projection, actor, plan, state,
        resolveItemMechanics
      })),
    applyLocalFireProjection: ({ working_projection: projection, actor,
      local_fire_atomic_write_plan: plan }) =>
      workingProjectionAuthority.admit(applyLocalFireRuntimeProjection({
        projection, actor, plan, state, resolveItemMechanics
      }))
  });
}

function applyLocalFireRuntimeProjection({ projection, actor, plan, state,
  resolveItemMechanics }) {
  let next = structuredClone(projection);
  for (const transition of plan.fuel_placement_transitions ?? []) {
    const item = requireProjectedItem(next, transition.item_id);
    const mechanics = state.entities.get(transition.item_id)?.mechanics
      ?? resolveItemMechanics?.(transition.item_id);
    next = applyInventoryTransition({ projection: next, actor,
      beforePlacement: item.placement ?? {},
      afterPlacement: transition.after_placement,
      beforeMechanics: mechanics, afterMechanics: mechanics,
      itemRef: transition.item_id, state });
    next.items = next.items.map((entry) => matchesItem(entry,
      transition.item_id) ? { ...entry,
        placement: projectedPlacement(transition.after_placement) } : entry);
    updateRuntimePlacement(state, transition.item_id,
      transition.after_placement);
  }
  const retirement = plan.item_retirement_transition;
  if (retirement != null) {
    const item = requireProjectedItem(next, retirement.item_id);
    const mechanics = state.entities.get(retirement.item_id)?.mechanics
      ?? resolveItemMechanics?.(retirement.item_id);
    next = applyInventoryTransition({ projection: next, actor,
      beforePlacement: item.placement ?? {}, afterPlacement: null,
      beforeMechanics: mechanics, afterMechanics: null,
      itemRef: retirement.item_id, state });
    next.items = next.items.filter((entry) =>
      !matchesItem(entry, retirement.item_id));
    state.entities.delete(retirement.item_id);
    state.materializedItems.delete(retirement.item_id);
    state.authoredItems.delete(retirement.item_id);
    state.retiredEntities.add(retirement.item_id);
  }
  return next;
}

function projectedPlacement(value) {
  return Object.fromEntries(Object.entries(value).filter(
    ([key, entry]) => key !== 'item_id' && entry != null));
}

function updateRuntimePlacement(state, itemId, placement) {
  for (const collection of [state.materializedItems, state.authoredItems]) {
    const item = collection.get(itemId);
    if (item != null) collection.set(itemId, { ...item,
      placement: structuredClone(placement) });
  }
}

async function prepareEffectTime(input, committedState, temporalAdvance) {
  if (typeof temporalAdvance !== 'function') {
    throw new TypeError('temporalAdvance is required for prepared effects.');
  }
  const duration = Number(input.consequence?.duration_minutes);
  if (!Number.isSafeInteger(duration) || duration < 0) {
    throw new TypeError('Prepared effect duration must be integral.');
  }
  const exactElapsed = {
    exact_minutes: { numerator: String(duration), denominator: '1' }
  };
  const result = await temporalAdvance({
    clock_before: structuredClone(
      input.prepared_chain_context.current_clock),
    exact_elapsed: exactElapsed,
    relevant_state: structuredClone(committedState),
    consequence: structuredClone(input.consequence),
    working_projection: structuredClone(input.working_projection),
    local_fire_atomic_write_plans: structuredClone(
      input.local_fire_atomic_write_plans ?? []),
    root_turn_id: input.root_turn_id,
    step_index: input.step_index
  });
  return Object.freeze({
    version: 2,
    schema: 'turn_time_update',
    owner: '@rus/time-events-history',
    ...structuredClone(result)
  });
}

async function prepareEffectBody(input, committedState, bodyEffect) {
  if (input.consequence?.combat_kind === 'exchange') {
    const after = input.consequence.combat?.working_state_after
      ?.actor_states?.[`player_character:${committedState.actor_id}`]
      ?.body_state;
    if (after == null) {
      throw new TypeError('Prepared combat body projection is required.');
    }
    const applied = input.consequence.combat.body_transitions.some(
      ({ actor_ref: actor }) => actor.entity_kind === 'player_character'
        && actor.entity_id === committedState.actor_id);
    return Object.freeze({
      version: 1,
      schema: 'turn_body_update',
      owner: '@rus/body-state',
      applied,
      proposal: applied ? { profile_ref: 'combat_harm',
        condition_transitions: [] } : null,
      state_after: structuredClone(after)
    });
  }
  if (input.effect_kind === 'semantic_activity'
      || Number(input.consequence?.duration_minutes) === 0) {
    return Object.freeze({
      version: 1,
      schema: 'turn_body_update',
      owner: '@rus/body-state',
      applied: false,
      proposal: null,
      state_after: structuredClone(
        input.prepared_chain_context.current_body_state)
    });
  }
  if (typeof bodyEffect?.apply !== 'function') {
    throw new TypeError('bodyEffect.apply is required for prepared effects.');
  }
  const result = await bodyEffect.apply({
    committed_state: {
      ...structuredClone(committedState),
      body_state: structuredClone(
        input.prepared_chain_context.current_body_state)
    },
    consequence: structuredClone(input.consequence),
    time_update: structuredClone(input.time_update)
  });
  return Object.freeze({
    version: 1,
    schema: 'turn_body_update',
    ...structuredClone(result)
  });
}

async function admitResult(pending, authority) {
  const result = await pending;
  return Object.freeze({
    ...result,
    working_projection: authority.admit(result.working_projection)
  });
}

export { resolveLowerDvinaTraceTurnStepCheckContext };
