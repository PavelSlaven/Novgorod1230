import { deepFreeze } from '@rus/kernel';
import { createTurnStepExecutionRegistry, requireTurnStepExecutionRegistry, runTurnStepLoop } from './turn-step-loop.js';
import { TURN_STEP_OPERATION_BATCH_TARGET } from './turn-step-operation-batch.js';
import { assertValid, validateAvailabilityDecision, validateConsequencePackage } from './validators.js';
import { isActionProductionOwnerInScope } from './turn-step-action-produced-remainder.js';
import { createTurnStepDomainOwnerPreflight as createPreflight } from './turn-step-domain-owner-preflight.js';
import { isOrdinaryDiscoveryInScope } from './turn-step-ordinary-discovery.js';
import { isSpatialSemanticRemainderInScope, resolveSpatialSemanticRemainder } from './turn-step-spatial-semantic-remainder.js';
import { initialWorkingProjectionFrom } from './turn-step-player-safe-projection.js';
import { resolveWorldProcessRemainder } from './turn-step-world-process-remainder.js';
export { isActionProductionOwnerInScope } from './turn-step-action-produced-remainder.js';
export { isOrdinaryDiscoveryInScope } from './turn-step-ordinary-discovery.js';
const DOMAIN_STEP_OPERATIONS = new Set([
  'request_discovery',
  'request_container_access',
  'request_movement',
  'request_item_use',
  'request_activity',
  'emit_interaction',
  'request_conversation',
  'request_combat',
  'request_world_process'
]);
export function isDomainStepOperation(value) {
  return DOMAIN_STEP_OPERATIONS.has(value);
}
const DIRECT_STEP_OPERATIONS = new Set([
  'create_entity',
  'move_entity',
  'change_entity_facts',
  'set_entity_mechanics',
  'retire_entity',
  'apply_body_event'
]);
export async function resolveBoundTurnStepCommand({
  registry,
  semanticBindings,
  playerInput,
  routingContext,
  services,
  committedState,
  actionSet,
  availabilityDecisions
}) {
  if (typeof services.turnStepModel !== 'function') {
    throw turnCommandError('TURN_STEP_MODEL_MISSING',
      'Semantic step admission requires the injected turn step model.');
  }
  if (typeof services.playerSafeStateProjector !== 'function') {
    throw turnCommandError('TURN_STEP_PLAYER_SAFE_PROJECTOR_MISSING',
      'Semantic step admission requires a player-safe state projector.');
  }
  const projected = deepFreeze(await services.playerSafeStateProjector(deepFreeze({
    committed_state: committedState,
    actor_id: routingContext.actor_id ?? playerInput.party_id,
    party_id: playerInput.party_id,
    turn_number: playerInput.turn_number
  })));
  if (!plain(projected) || !plain(projected.actor)
      || !plain(projected.player_safe_state)) {
    throw turnCommandError('TURN_STEP_PLAYER_SAFE_PROJECTION_INVALID',
      'Player-safe projector must return actor and player_safe_state objects.');
  }
  const availableOptions = new Set(actionSet.options.map(({ option_id: id }) => id));
  const selectedCommands = [];
  const initialDomainOperations = semanticBindings
    .filter(({ command }) => availableOptions.has(command.option_id))
    .flatMap(({ binding }) => bindingOperations(binding));
  const withAvailableDomainOperations = (state, operations,
    preparedFollowupCandidates = []) => deepFreeze({ player_safe_state: state,
    available_domain_operations: structuredClone(operations),
    ...(preparedFollowupCandidates.length === 0 ? {} : {
      prepared_followup_candidates: structuredClone(preparedFollowupCandidates)
    }) });
  const currentDomainOperations = async (context, remainingIntent, completedSteps) => {
    if ((context?.prior_effect_count ?? 0) === 0) return completedSteps.length === 0 ? initialDomainOperations : [];
    const owner = services.turnStepPreparedDomainEffect;
    if (typeof owner?.currentState !== 'function') return [];
    const currentState = await owner.currentState(deepFreeze({ prepared_chain_context: structuredClone(context), committed_state: structuredClone(committedState) }));
    const operations = [];
    for (const { command, binding } of semanticBindings) {
      for (const operation of bindingOperations(binding)) {
        if (owner.supports?.(deepFreeze({ operation,
          command_id: command.command_id, option_id: command.option_id,
          prepared_chain_context: structuredClone(context) })) !== true) continue;
        const availability = await command.availability(deepFreeze({
          playerInput: { ...structuredClone(playerInput), raw_text: remainingIntent },
          committed_state: structuredClone(currentState), retrievedState: structuredClone(currentState),
          modeResolution: null, action_set_evaluation: true }));
        assertValid('turn_availability_decision', validateAvailabilityDecision(availability));
        if (availability.can_attempt === true && availability.status !== 'blocked'
            && availability.check_requests.length === 0) operations.push(operation);
      }
    }
    return operations;
  };
  let firstProjection = withAvailableDomainOperations(projected.player_safe_state,
    initialDomainOperations, initialPreparedFollowupCandidates(
      semanticBindings, availableOptions));
  const initialWorkingProjection = initialWorkingProjectionFrom(projected);
  const externalRegistry = services.turnStepExecutionRegistry ?? null;
  if (externalRegistry != null) requireTurnStepExecutionRegistry(externalRegistry);
  const preflightDomainPlan = createPreflight({ externalRegistry,
    semanticBindings, availableOptions, actor: projected.actor, committedState, services,
    isDomainStepOperation, isOrdinaryDiscoveryInScope,
    isSpatialSemanticRemainderInScope, isActionProductionOwnerInScope,
    turnCommandError });
  const direct = Object.fromEntries([...DIRECT_STEP_OPERATIONS].map((op) => [
    op,
    async (execution) => {
      const handler = externalRegistry?.direct?.(execution.operation);
      if (typeof handler !== 'function') {
        throw turnCommandError('TURN_STEP_DIRECT_HANDLER_MISSING',
          `No code-owned workflow handler for ${op}.`);
      }
      return handler(execution);
    }
  ]));
  const domain = Object.fromEntries([...DOMAIN_STEP_OPERATIONS].map((op) => [
    op,
    async (execution) => {
      const operation = execution.operation;
      const owner = preflightDomainPlan.resolve({ operation,
        plan: execution.plan, request: execution.request, actor: projected.actor,
        playerSafeState: execution.request.player_safe_state, committedState,
        externalRegistry, semanticBindings, availableOptions,
        preparedChainContext: execution.prepared_chain_context, services,
        isOrdinaryDiscoveryInScope, isSpatialSemanticRemainderInScope,
        isActionProductionOwnerInScope });
      if (owner.kind === 'external') return owner.handler(execution);
      if (owner.kind === 'ordinary_discovery') {
        const ordinaryResolver =
          services.turnStepOrdinaryDiscoveryResolver;
        return ordinaryResolver(deepFreeze({
          schema: 'turn_step_ordinary_discovery_request_v1',
          operation: structuredClone(operation),
          plan: structuredClone(execution.plan),
          request: structuredClone(execution.request),
          actor: structuredClone(projected.actor),
          working_projection: structuredClone(execution.working_projection),
          committed_state: structuredClone(committedState),
          prepared_chain_context:
            structuredClone(execution.prepared_chain_context)
        }));
      }
      if (owner.kind === 'world_process') {
        const worldProcess = resolveWorldProcessRemainder({ operation,
          execution, projected, committedState, services });
        if (worldProcess !== null) return worldProcess;
      }
      if (owner.kind === 'spatial') {
        const spatialResolver = services.turnStepSpatialSemanticResolver;
        return resolveSpatialSemanticRemainder({ resolver: spatialResolver,
          execution, actor: projected.actor, committedState });
      }
      if (owner.kind === 'action_production') {
        const actionProductionOwner =
          services.turnStepActionProductionOwner;
        const checked = execution.check_result != null;
        return actionProductionOwner(deepFreeze({
          schema: checked
            ? 'turn_step_action_produced_remainder_request_v2'
            : 'turn_step_action_produced_remainder_request_v1',
          operation: structuredClone(operation),
          plan: structuredClone(execution.plan),
          request: structuredClone(execution.request),
          actor: structuredClone(projected.actor),
          working_projection: structuredClone(execution.working_projection),
          ...(checked ? { check_result: structuredClone(execution.check_result) } : {}),
          committed_state: structuredClone(committedState),
          prepared_chain_context: structuredClone(execution.prepared_chain_context),
          prepared_ordinary_materialization_atomic_write_plan: structuredClone(
            execution.prepared_ordinary_materialization_atomic_write_plan),
          prepared_action_production_atomic_write_plans: structuredClone(
            execution.prepared_action_production_atomic_write_plans)
        }));
      }
      if (owner.kind !== 'binding') throw domainOwnerResolutionError(owner);
      const selectedCommand = owner.command;
      const preparedOwner = services.turnStepPreparedDomainEffect;
      const supportsPreparedEffect = typeof preparedOwner?.supports === 'function'
        && preparedOwner.supports(deepFreeze({
          operation: structuredClone(operation),
          command_id: selectedCommand.command_id,
          option_id: selectedCommand.option_id,
          prepared_chain_context:
            structuredClone(execution.prepared_chain_context)
        })) === true;
      if (supportsPreparedEffect) {
        recordSelectedCommand(selectedCommands, selectedCommand);
        const stepPlayerInput = execution.prepared_chain_context
          .prior_effect_count === 0 ? playerInput : {
            ...structuredClone(playerInput),
            raw_text: execution.request.remaining_intent
          };
        const consequenceState = execution.prepared_chain_context
          .prior_effect_count === 0
          ? committedState
          : typeof preparedOwner.currentState === 'function'
            ? await preparedOwner.currentState(deepFreeze({
                prepared_chain_context:
                  structuredClone(execution.prepared_chain_context),
                committed_state: structuredClone(committedState)
              }))
            : committedState;
        const availability = await selectedCommand.availability(deepFreeze({
              playerInput: structuredClone(stepPlayerInput),
              committed_state: structuredClone(consequenceState),
              retrievedState: structuredClone(consequenceState),
              modeResolution: null,
              action_set_evaluation: false
            }));
        assertValid('turn_availability_decision',
          validateAvailabilityDecision(availability));
        if (availability.can_attempt !== true
            || availability.status === 'blocked'
            || availability.check_requests.length !== 0) {
          throw turnCommandError(
            'TURN_STEP_PREPARED_DOMAIN_AVAILABILITY_INVALID',
            'Prepared domain execution requires one available zero-check owner result.'
          );
        }
        const consequence = await selectedCommand.consequence(deepFreeze({
          playerInput: structuredClone(stepPlayerInput),
          semanticPlan: structuredClone(execution.plan),
          rootTurnId: execution.request.root_turn_id,
          retrievedState: structuredClone(consequenceState),
          availability: structuredClone(availability),
          checks: {
            version: 1,
            schema: 'turn_check_results',
            requests: [],
            results: []
          }
        }));
        assertValid('turn_consequence_package',
          validateConsequencePackage(consequence));
        if (typeof preparedOwner.apply !== 'function') {
          throw turnCommandError(
            'TURN_STEP_PREPARED_DOMAIN_OWNER_INVALID',
            'Prepared domain effect owner requires an apply handler.'
          );
        }
        return preparedOwner.apply(deepFreeze({
          command_id: selectedCommand.command_id,
          option_id: selectedCommand.option_id,
          operation: structuredClone(operation),
          plan: structuredClone(execution.plan),
          request: structuredClone(execution.request),
          prepared_chain_context:
            structuredClone(execution.prepared_chain_context),
          working_projection:
            structuredClone(execution.working_projection),
          availability: structuredClone(availability),
          consequence: structuredClone(consequence),
          committed_state: structuredClone(committedState)
        }));
      }
      if ((execution.prepared_chain_context?.prior_effect_count ?? 0) === 0) {
        recordSelectedCommand(selectedCommands, selectedCommand);
      }
      return {
        working_projection: execution.working_projection,
        summary: `delegated:${selectedCommand.command_id}`,
        write_fragments: [],
        player_response_boundary: true
      };
    }
  ]));
  const executionRegistry = createTurnStepExecutionRegistry({
    direct,
    domain,
    applySemanticActivity: async (execution) => {
      const handler = externalRegistry?.semanticActivity?.();
      if (typeof handler !== 'function') {
        throw turnCommandError('TURN_STEP_ACTIVITY_HANDLER_MISSING',
          'No code-owned workflow semantic activity handler is configured.');
      }
      return handler(execution);
    }
  });
  const loopResult = await runTurnStepLoop({
    requestId: `turn-step:${playerInput.party_id}:${playerInput.turn_number}`,
    rootTurnId: `turn:${playerInput.party_id}:${playerInput.turn_number}`,
    committedStateVersion: actionSet.state_version,
    rootPlayerAction: playerInput.raw_text,
    actor: projected.actor,
    initialWorkingProjection,
    maxInternalSteps: 8
  }, {
    turnStepModel: services.turnStepModel,
    executionRegistry,
    preparedEffectContext: services.turnStepPreparedEffectContext,
    preparedEffectTimeOwner: services.turnStepPreparedEffectTimeOwner,
    preparedEffectBodyOwner: services.turnStepPreparedEffectBodyOwner,
    preparedEffectProjectionOwner:
      services.turnStepPreparedEffectProjectionOwner,
    preflightActionProduction: typeof services
      .turnStepActionProductionPreflight !== 'function' ? null : (execution) =>
      services.turnStepActionProductionPreflight(deepFreeze({
        ...structuredClone(execution), actor: structuredClone(projected.actor),
        committed_state: structuredClone(committedState) })),
    semanticPlanValidator: preflightDomainPlan,
    admitPreparedDomainPlan: async ({ plan, request,
      prepared_chain_context: preparedChainContext }) => {
      const operation = plan.operations[0];
      if (plan.operations.length !== 1 || operation == null) return false;
      if (operation.op === 'request_world_process'
          && typeof services.turnStepWorldProcessResolver === 'function') return true;
      const preparedOwner = services.turnStepPreparedDomainEffect;
      const matches = semanticBindings.filter(({ command, binding }) =>
        ((preparedChainContext?.prior_effect_count ?? 0) > 0
          || availableOptions.has(command.option_id))
        && binding.operation === operation.op
        && binding.matches(deepFreeze({
          operation: structuredClone(operation),
          plan: structuredClone(plan),
          actor: structuredClone(projected.actor),
          player_safe_state: structuredClone(request.player_safe_state),
          committed_state: structuredClone(committedState)
        })) === true);
      if (matches.length !== 1) return false;
      const supported = typeof preparedOwner?.supports === 'function'
        && preparedOwner.supports(deepFreeze({
          operation: structuredClone(operation),
          command_id: matches[0].command.command_id,
          option_id: matches[0].command.option_id,
          prepared_chain_context: structuredClone(preparedChainContext)
        })) === true;
      if (!supported) {
        throw turnCommandError(
          'TURN_STEP_PREPARED_DOMAIN_PLAN_UNSUPPORTED',
          'The current-state domain plan cannot extend the prepared chain.'
        );
      }
      return true;
    },
    randomSource: services.randomSource,
    resolveCheckContext: services.turnStepCheckContextResolver,
    async projectPlayerSafeState({working_projection:workingProjection,completed_steps:completedSteps,
      local_fire_atomic_write_plans: localFirePlans,
      prepared_chain_context: preparedChainContext,
      remaining_intent: remainingIntent }) {
      if (firstProjection != null) {
        const first = firstProjection;
        firstProjection = null;
        return first;
      }
      const next = deepFreeze(await services.playerSafeStateProjector(deepFreeze({
        committed_state: committedState,
        working_projection: structuredClone(workingProjection),
        completed_steps:structuredClone(completedSteps),local_fire_atomic_write_plans:structuredClone(localFirePlans),
        actor_id: routingContext.actor_id ?? playerInput.party_id,
        party_id: playerInput.party_id,
        turn_number: playerInput.turn_number
      })));
      if (!plain(next) || !plain(next.player_safe_state)) {
        throw turnCommandError('TURN_STEP_PLAYER_SAFE_PROJECTION_INVALID',
          'Player-safe projector must return actor and player_safe_state objects.');
      }
      return withAvailableDomainOperations(next.player_safe_state,
        await currentDomainOperations(preparedChainContext, remainingIntent,
          completedSteps));
    },
    async revalidateCommittedState({ step_index: stepIndex }) {
      const request = {
        party_id: playerInput.party_id,
        turn_number: playerInput.turn_number,
        requested_blocks: structuredClone(registry.stateBlocks()),
        routing_context: structuredClone(routingContext),
        revalidation: true,
        turn_step: true,
        step_index: stepIndex
      };
      return typeof services.stateReader.revalidate === 'function'
        ? services.stateReader.revalidate(request)
        : services.stateReader.read(request);
    }
  });
  const command = commandWithDraftWrites({
    command: selectedCommands[0] ?? null,
    registry,
    loopResult
  });
  return {
    command,
    optionId: command.option_id,
    executionDraft: deepFreeze({
      base_state_version: actionSet.state_version,
      selected_command_id: selectedCommands[0]?.command_id ?? null,
      selected_command_ids: selectedCommands.map(
        ({ command_id: commandId }) => commandId),
      loop_result: structuredClone(loopResult)
    }),
    decisionTrace: deepFreeze({
      decision_protocol: 'turn_step_plan_v1',
      action_set_digest: actionSet.options_digest,
      state_version: actionSet.state_version,
      working_revision: loopResult.working_revision,
      step_count: loopResult.step_traces.length,
      stop_reason: loopResult.stop_reason,
      selected_option_id: selectedCommands[0]?.option_id ?? null,
      step_traces: structuredClone(loopResult.step_traces)
    })
  };
}
function commandWithDraftWrites({ command, registry, loopResult }) {
  const draftWrites = loopResult.write_fragments.length > 0
    ? [TURN_STEP_OPERATION_BATCH_TARGET]
    : [];
  if (loopResult.clarification) {
    draftWrites.push('party_player_visible_message');
  }
  const mode = command?.mode ?? {
    selected_primary_mode: 'combined',
    secondary_modes: [],
    resolution_plan: {
      subsystems: ['visible_context_projection'],
      checks_to_run: [],
      expected_writes: [],
      state_blocks_to_load: registry.stateBlocks()
    }
  };
  return {
    ...(command ?? {
      command_id: 'turn_step_execution_draft',
      option_id: 'turn_step_execution_draft'
    }),
    mode: {
      ...mode,
      resolution_plan: {
        ...mode.resolution_plan,
        expected_writes: [...new Set([
          ...(mode.resolution_plan?.expected_writes ?? []),
          ...draftWrites
        ])]
      }
    }
  };
}
function recordSelectedCommand(commands, command) {
  commands.push(command);
}
function initialPreparedFollowupCandidates(semanticBindings, availableOptions) {
  const candidates = [];
  for (const { command, binding } of semanticBindings) {
    const ref = command.prepared_followup_ref;
    if (!availableOptions.has(command.option_id)
        || binding.operation_dto == null
        || typeof ref !== 'string' || ref.length === 0) continue;
    const successors = semanticBindings.filter(({ command: candidate, binding }) =>
      candidate.command_id === ref && binding.operation_dto != null);
    if (successors.length !== 1) continue;
    candidates.push({ prepared_followup_ref: ref,
      precursor_operation: structuredClone(binding.operation_dto),
      operation: structuredClone(successors[0].binding.operation_dto) });
  }
  return candidates;
}
function bindingOperations(binding) {
  const operations = binding.operation_dtos
    ?? (binding.operation_dto == null ? [] : [binding.operation_dto]);
  return operations.map((operation) => structuredClone(operation));
}
function plain(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
export function createTurnStepDomainOwnerPreflight(input) {
  return createPreflight({ ...input, isDomainStepOperation,
    isOrdinaryDiscoveryInScope, isSpatialSemanticRemainderInScope,
    isActionProductionOwnerInScope, turnCommandError });
}

function turnCommandError(code, message, details = undefined) {
  return Object.assign(new Error(message), { code,
    ...(details === undefined ? {} : { details: deepFreeze(structuredClone(details)) })
  });
}
