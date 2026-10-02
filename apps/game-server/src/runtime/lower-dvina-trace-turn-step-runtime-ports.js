import { createTurnStepExecutionRegistry } from '@rus/turn';
import { applyBodyEvent, applySemanticActivity, resolveLowerDvinaTraceTurnStepCheckContext } from './lower-dvina-trace-turn-step-delegated-ports.js';
import { createItemOperationHandlers, createTransientItemUseHandler, initializeRuntimeState } from
  './lower-dvina-trace-turn-step-item-operations.js';
import { applyInventoryTransition, matchesItem, requireProjectedItem } from './lower-dvina-trace-turn-step-item-support.js';
import { applyActionProducedRuntimeProjection } from './lower-dvina-trace-action-produced-runtime.js';
import { createContainerAccessHandler, snapshotO2bCommittedContainerInput } from './lower-dvina-trace-turn-step-container-access.js';
import { createLowerDvinaTracePreparedDomainEffect } from './lower-dvina-trace-turn-step-prepared-effects.js';
import { refreshPreparedMovementScene } from './lower-dvina-trace-turn-step-prepared-state-projection.js';
import { prepareOrdinaryDiscoveryResult } from './lower-dvina-trace-ordinary-discovery.js';
import { createLowerDvinaTracePostAppliedActorStepOwner } from './lower-dvina-trace-post-applied-actor-step.js';
import { npcSharesPlayerScene, SCENE_NPC_SOURCE } from './lower-dvina-trace-scene-presence.js';
import { projectNpcs } from './lower-dvina-trace-player-safe-entities.js';
export function createLowerDvinaTraceTurnStepRuntimePorts({
  bodyEventOwner = null,
  committedState = null,
  partyId = null,
  genericCheckContextOwner = null,
  ordinaryDiscoveryResolver = null,
  ordinaryResultPolicy = null,
  admitAmbientOrdinaryPortion = null,
  requireAmbientOrdinaryAdmission = false,
  ordinaryContainerContentsResolver = null,
  resolveItemMechanics = null,
  semanticActivityOwner = null,
  temporalAdvance = null,
  bodyEffect = null, idempotencyKey = null,
  postActionPerceptionProfile = null,
  projectCurrentScene = null,
  loadPreparedMovementScene = null,
  onNpcSceneProjection = null,
  requestId = null,
  workingProjectionAuthority
} = {}) {
  if (typeof workingProjectionAuthority?.admit !== 'function') {
    throw new TypeError('workingProjectionAuthority.admit is required.');
  }
  const safeCommittedState = typeof ordinaryContainerContentsResolver === 'function' ? snapshotO2bCommittedContainerInput(committedState) : committedState;
  if (typeof ordinaryContainerContentsResolver === 'function'
      && committedState != null && safeCommittedState == null) {
    const error = new TypeError('TRACE_TURN_STEP_CONTAINER_ORDINARY_CONTEXT_INVALID');
    error.code = 'TRACE_TURN_STEP_CONTAINER_ORDINARY_CONTEXT_INVALID';
    throw error;
  }
  const state = initializeRuntimeState(safeCommittedState);
  const preparedOrdinaryDiscoveryResolver =
    typeof ordinaryDiscoveryResolver !== 'function' ? null
      : async (execution) => {
          return prepareOrdinaryDiscoveryResult({
            applied: await ordinaryDiscoveryResolver(execution), execution,
            state, semanticActivityOwner, workingProjectionAuthority });
        };
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
  const phase9ContainerOwner = [17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
    28, 29, 30, 31, 32, 33, 34, 35].includes(safeCommittedState
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
    postAppliedActorStep: createLowerDvinaTracePostAppliedActorStepOwner(
      { committedState: safeCommittedState, idempotencyKey,
        perceptionProfile: postActionPerceptionProfile }),
    executionRegistry: createTurnStepExecutionRegistry({
      direct,
      domain: { ...domain, request_item_use: createTransientItemUseHandler() },
      applySemanticActivity: (execution) => admitResult(
        applySemanticActivity(execution, state, semanticActivityOwner), workingProjectionAuthority)
    }),
    ...(preparedDomainEffect == null ? {} : {
      preparedDomainEffect: Object.freeze({
        supports: (input) => preparedDomainEffect.supports(input),
        assertContinuation: (input) => preparedDomainEffect.assertContinuation(input),
        currentState: (input) => preparedDomainEffect.currentState(input),
        replaceCurrentState: (input) => preparedDomainEffect.replaceCurrentState(input),
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
        input, preparedDomainEffect.currentState(), temporalAdvance),
      preparedEffectBodyOwner: (input) => prepareEffectBody(
        input, safeCommittedState, bodyEffect),
      preparedEffectProjectionOwner: async (input) => {
        const movement = input.prepared_effect.consequence?.movement;
        const isMovement = movement?.destination?.location_ref != null;
        const beforeState = preparedDomainEffect.currentState();
        const beforeProjection = structuredClone(input.working_projection);
        preparedDomainEffect.advanceState(input);
        let projection = structuredClone(input.working_projection);
        if (isMovement) {
          let committedState = preparedDomainEffect.currentState();
          if (typeof loadPreparedMovementScene === 'function'
              && typeof input.prepared_effect.consequence?.position_transition
                ?.destination_site_id === 'string') {
            committedState = await loadPreparedMovementScene({
              partyId, state: committedState
            });
            preparedDomainEffect.replaceCurrentState(committedState);
          }
          if (typeof projectCurrentScene === 'function') {
            projection = refreshPreparedMovementScene({ projection,
              committedState, projectCurrentScene });
          }
          try {
            onNpcSceneProjection?.({ request_id: requestId,
              before: npcSceneProjectionDiagnostic(beforeState,
                beforeProjection),
              after: npcSceneProjectionDiagnostic(committedState, projection) });
          } catch { /* Opt-in capture must never affect gameplay. */ }
        }
        if ((input.prepared_effect.time_update.temporal_results ?? []).some(
          (result) => result.combined_change_set?.proposals?.some(
            (proposal) => proposal.npc_routine_transition != null))) {
          // Rebuild advanced NPC views; old aliases would mask transition.
          for (const key of ['npcs', 'visible_npcs', 'scene_npcs',
            'visible_context', 'visible_context_package', 'current_visible_context']) {
            delete projection[key];
          }
        }
        for (const plan of input.prepared_effect?.time_update?.local_fire_atomic_write_plans ?? []) {
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
    ...(preparedOrdinaryDiscoveryResolver == null ? {} : {
      ordinaryDiscoveryResolver: preparedOrdinaryDiscoveryResolver
    }),
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
function npcSceneProjectionDiagnostic(state, projection) {
  const position = state?.position ?? {};
  const g6 = (npc) => state?.scene_position_g6?.[npc?.position_id]
    ?? (npc?.position_id === position.position_id
      ? position.g6_instance_id ?? position.g6_id ?? null : null);
  const ids = (record) => [record?.instance_id, record?.npc_id,
    record?.actor_id].find((id) => typeof id === 'string') ?? null;
  const visibleIds = (state?.current_visible_context?.visible_npc ?? [])
    .map((npc) => npc?.entity_ref?.entity_kind === 'npc'
      ? npc.entity_ref.entity_id : null).filter(Boolean);
  return {
    player: {
      site_id: position.site_id ?? null,
      position_id: position.position_id ?? null,
      g6_instance_id: position.g6_instance_id ?? position.g6_id ?? null
    },
    candidates: (state?.npcs ?? []).map((npc) => ({
      npc_id: ids(npc),
      source: npc?.runtime_source === SCENE_NPC_SOURCE
        ? SCENE_NPC_SOURCE : 'committed',
      position_id: npc?.position_id ?? null,
      g6_instance_id: g6(npc),
      same_scene_locus: npcSharesPlayerScene(state, npc)
    })).filter(({ npc_id }) => npc_id != null),
    projection_npc_ids: (projection?.npcs
      ?? projectNpcs(state?.npcs, { position }))?.map(ids).filter(Boolean) ?? [],
    current_visible_npc_ids: visibleIds
  };
}
function applyLocalFireRuntimeProjection({ projection, actor, plan, state, resolveItemMechanics }) {
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
function projectedPlacement(value) { return Object.fromEntries(Object.entries(value)
  .filter(([key, entry]) => key !== 'item_id' && entry != null)); }
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
  const exactElapsed = { exact_minutes: { numerator: String(duration), denominator: '1' } };
  const result = await temporalAdvance({
    clock_before: structuredClone(
      input.prepared_chain_context.current_clock),
    exact_elapsed: exactElapsed, effect_kind: input.effect_kind,
    relevant_state: structuredClone(committedState),
    consequence: structuredClone(input.consequence),
    working_projection: structuredClone(input.working_projection),
    local_fire_atomic_write_plans: structuredClone(
      input.local_fire_atomic_write_plans ?? []),
    root_turn_id: input.root_turn_id,
    step_index: input.step_index,
    change_set_id: `change:${committedState.party_id}:turn-step:${
      committedState.party_state.turn_number + 1}`
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
  if ((input.consequence?.body_effect_ref == null
        && input.consequence?.parent_activity_completion?.status
          !== 'completed')
      || input.consequence?.generic_known_route === true
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
