import { deepFreeze } from '@rus/kernel';
import {
  createTurnStepExecutionRegistry,
  requireTurnStepExecutionRegistry,
  runTurnStepLoop
} from './turn-step-loop.js';
import {
  TURN_STEP_OPERATION_BATCH_TARGET
} from './turn-step-operation-batch.js';
import {
  assertValid,
  validateAvailabilityDecision,
  validateConsequencePackage
} from './validators.js';

const DOMAIN_STEP_OPERATIONS = new Set([
  'request_discovery',
  'request_container_access',
  'request_movement',
  'request_item_use',
  'request_activity',
  'emit_interaction',
  'request_combat'
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
  const projected = await services.playerSafeStateProjector(deepFreeze({
    committed_state: structuredClone(committedState),
    actor_id: routingContext.actor_id ?? playerInput.party_id,
    party_id: playerInput.party_id,
    turn_number: playerInput.turn_number
  }));
  if (!plain(projected) || !plain(projected.actor)
      || !plain(projected.player_safe_state)) {
    throw turnCommandError('TURN_STEP_PLAYER_SAFE_PROJECTION_INVALID',
      'Player-safe projector must return actor and player_safe_state objects.');
  }
  const availableOptions = new Set(actionSet.options.map(
    ({ option_id: optionId }) => optionId
  ));
  const selectedCommands = [];
  let firstProjection = structuredClone(projected.player_safe_state);
  const externalRegistry = services.turnStepExecutionRegistry ?? null;
  if (externalRegistry != null) {
    requireTurnStepExecutionRegistry(externalRegistry);
  }
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
      const externalHandler = externalRegistry?.domain?.(operation);
      if (typeof externalHandler === 'function') {
        return externalHandler(execution);
      }
      const matches = semanticBindings.filter(({ command, binding }) =>
        ((execution.prepared_chain_context?.prior_effect_count ?? 0) > 0
          || availableOptions.has(command.option_id))
        && binding.operation === operation.op
        && binding.matches(deepFreeze({
          operation: structuredClone(operation),
          plan: structuredClone(execution.plan),
          actor: structuredClone(projected.actor),
          player_safe_state: structuredClone(
            execution.request.player_safe_state
          ),
          committed_state: structuredClone(committedState)
        })) === true);
      if (matches.length !== 1) {
        throw turnCommandError(
          matches.length === 0
            ? 'TURN_STEP_DOMAIN_BINDING_MISSING'
            : 'TURN_STEP_DOMAIN_BINDING_AMBIGUOUS',
          'Semantic domain request must resolve to exactly one available owner.'
        );
      }
      const selectedCommand = matches[0].command;
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
    actor: structuredClone(projected.actor),
    initialWorkingProjection: firstProjection,
    maxInternalSteps: 8
  }, {
    turnStepModel: services.turnStepModel,
    executionRegistry,
    preparedEffectContext: services.turnStepPreparedEffectContext,
    preparedEffectTimeOwner: services.turnStepPreparedEffectTimeOwner,
    preparedEffectBodyOwner: services.turnStepPreparedEffectBodyOwner,
    preparedEffectProjectionOwner:
      services.turnStepPreparedEffectProjectionOwner,
    admitPreparedDomainPlan: async ({ plan, request,
      prepared_chain_context: preparedChainContext }) => {
      const operation = plan.operations[0];
      if (plan.operations.length !== 1 || operation == null) return false;
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
    async projectPlayerSafeState({ working_projection: workingProjection,
      completed_steps: completedSteps }) {
      if (firstProjection != null) {
        const first = firstProjection;
        firstProjection = null;
        return first;
      }
      const next = await services.playerSafeStateProjector(deepFreeze({
        committed_state: structuredClone(committedState),
        working_projection: structuredClone(workingProjection),
        completed_steps: structuredClone(completedSteps),
        actor_id: routingContext.actor_id ?? playerInput.party_id,
        party_id: playerInput.party_id,
        turn_number: playerInput.turn_number
      }));
      if (!plain(next) || !plain(next.player_safe_state)) {
        throw turnCommandError('TURN_STEP_PLAYER_SAFE_PROJECTION_INVALID',
          'Player-safe projector must return actor and player_safe_state objects.');
      }
      return next.player_safe_state;
    },
    async revalidateCommittedState({ step_index: stepIndex }) {
      return services.stateReader.read({
        party_id: playerInput.party_id,
        turn_number: playerInput.turn_number,
        requested_blocks: structuredClone(registry.stateBlocks()),
        routing_context: structuredClone(routingContext),
        revalidation: true,
        turn_step: true,
        step_index: stepIndex
      });
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

function plain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function turnCommandError(code, message) {
  return Object.assign(new Error(message), { code });
}
