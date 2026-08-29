import { deepFreeze } from '@rus/kernel';
import {
  canonicalDigest,
  issueBoundedDecisionRequest,
  validateBoundedDecisionResult
} from '@rus/materialization';
import {
  isDomainStepOperation,
  resolveBoundTurnStepCommand
} from './turn-step-admission.js';
import { validateTurnStepOperationDto } from './turn-step-contracts/operations.js';

const registries = new WeakSet();
const actionSets = new WeakMap();
const stepBindings = new WeakMap();
const sealedPlans = new WeakSet();

export function createTurnCommandRegistry(definitions = []) {
  const commands = new Map();
  const options = new Map();
  const semanticBindings = [];
  for (const definition of definitions) {
    if (!definition?.command_id || commands.has(definition.command_id) || typeof definition.matches !== 'function' || typeof definition.availability !== 'function' || typeof definition.consequence !== 'function' || typeof definition.writeTargets !== 'function') throw new TypeError('Every turn command requires unique ID and code handlers.');
    const normalized = deepFreeze(structuredCloneHandlers(definition));
    if (options.has(normalized.option_id)) throw new TypeError('Every turn command requires a unique stable option_id.');
    commands.set(definition.command_id, normalized);
    options.set(normalized.option_id, normalized);
    if (normalized.semantic_binding) {
      semanticBindings.push({
        command: normalized,
        binding: normalized.semantic_binding
      });
    }
  }
  const registry = Object.freeze({
    eligible(context) { return [...commands.values()].filter((command) => command.matches(context) === true).sort((left, right) => left.command_id.localeCompare(right.command_id)); },
    registered() { return [...commands.values()].sort((left, right) => left.option_id.localeCompare(right.option_id)); },
    stateBlocks() {
      return [...new Set([...commands.values()].flatMap((command) =>
        command.mode?.resolution_plan?.state_blocks_to_load ?? []))].sort();
    },
    get(commandId) { return commands.get(commandId) ?? null; },
    getByOptionId(optionId) { return options.get(optionId) ?? null; }
  });
  registries.add(registry);
  stepBindings.set(registry, deepFreeze(semanticBindings));
  return registry;
}

export async function createTurnAvailableActionSet({
  registry,
  committedState,
  actorId,
  policyPins
}) {
  requireRegistry(registry);
  if (!plain(committedState) || !stable(actorId) || !Array.isArray(policyPins)) {
    throw turnCommandError('TURN_ACTION_SET_INPUT_INVALID', 'Committed state, actor and exact policy pins are required.');
  }
  const stateVersion = Number(committedState.party_state?.state_version
    ?? committedState.state_version);
  if (!Number.isSafeInteger(stateVersion) || stateVersion < 0) {
    throw turnCommandError('TURN_ACTION_SET_STATE_VERSION_INVALID', 'Committed state version is required.');
  }
  const included = [];
  const handlers = new Map();
  const availabilityDecisions = new Map();
  const availabilityContext = deepFreeze({
    committed_state: structuredClone(committedState),
    actor_id: actorId,
    policy_pins: structuredClone(policyPins),
    action_set_evaluation: true
  });
  for (const command of registry.registered()) {
    assertApprovedRecordBinding(command, policyPins);
    const availability = await command.availability(availabilityContext);
    if (availability?.can_attempt !== true || availability.status === 'blocked') continue;
    const option = {
      option_id: command.option_id,
      label: command.label,
      actor_id: actorId,
      target_id: command.target_id ?? actorId,
      preconditions: structuredClone(command.preconditions),
      expected_cost: structuredClone(command.expected_cost),
      known_risks: structuredClone(command.known_risks),
      reason_visible_to_actor: command.reason_visible_to_actor,
      state_version: stateVersion,
      metadata: {
        policy_ref: structuredClone(command.approved_record),
        availability_status: availability.status
      }
    };
    included.push(option);
    handlers.set(command.option_id, command);
    availabilityDecisions.set(command.option_id,
      deepFreeze(structuredClone(availability)));
  }
  included.sort((left, right) => left.option_id.localeCompare(right.option_id));
  if (included.length === 0 && (stepBindings.get(registry)?.length ?? 0) === 0) {
    throw turnCommandError('TURN_AVAILABLE_ACTION_SET_EMPTY', 'No registered action is available in committed state.');
  }
  const actionSet = deepFreeze({
    version: 1,
    schema: 'turn_available_action_set',
    actor_id: actorId,
    state_version: stateVersion,
    options: included,
    options_digest: canonicalDigest(included)
  });
  actionSets.set(actionSet, {
    registry,
    handlers,
    availabilityDecisions,
    committedState,
    policyPins
  });
  return actionSet;
}

export async function resolveTurnSemanticIntent({
  rawText,
  actionSet,
  semanticResolver,
  stateVersion,
  policyVersion,
  policyId = 'turn_semantic_intent',
  requestId,
  partyId,
  decisionSecret,
  issuedAt,
  expiresAt,
  decisionNow,
  evaluatePrecondition
}) {
  const capability = actionSets.get(actionSet);
  if (!capability) throw turnCommandError('TURN_ACTION_SET_INVALID', 'Action set must be built by createTurnAvailableActionSet.');
  if (stateVersion !== actionSet.state_version) throw turnCommandError('TURN_SEMANTIC_STATE_STALE', 'Committed state changed before semantic resolution.');
  if (!stable(policyVersion) || !stable(policyId) || !stable(requestId) || !stable(partyId)
    || !stable(decisionSecret) || !stable(issuedAt) || !stable(expiresAt)) {
    throw turnCommandError('TURN_SEMANTIC_DEPENDENCY_MISSING', 'Semantic resolution requires exact policy, identity, expiry and decision secret.');
  }
  if (canonicalDigest(actionSet.options) !== actionSet.options_digest) {
    throw turnCommandError('TURN_ACTION_SET_DIGEST_MISMATCH', 'Available action set digest changed.');
  }
  const exact = resolveExactTurnIntent({ rawText, actionSet, capability,
    stateVersion, policyVersion });
  if (exact) return exact;
  if (typeof semanticResolver !== 'function') {
    throw turnCommandError('TURN_SEMANTIC_RESOLVER_MISSING', 'Free-form intent requires the configured semantic resolver.');
  }
  if (typeof decisionNow !== 'function') {
    throw turnCommandError(
      'TURN_SEMANTIC_DEPENDENCY_MISSING',
      'Free-form intent requires an explicit post-resolver decision clock.'
    );
  }
  const request = issueBoundedDecisionRequest({
    requestId,
    partyId,
    actorId: actionSet.actor_id,
    policyId,
    policyVersion,
    stateVersion,
    issuedAt,
    expiresAt,
    secret: decisionSecret,
    options: actionSet.options.map((option) => ({
      option_id: option.option_id,
      command_id: capability.handlers.get(option.option_id).command_id,
      actor_id: option.actor_id,
      target_id: option.target_id,
      preconditions: structuredClone(option.preconditions),
      expected_cost: structuredClone(option.expected_cost),
      known_risks: structuredClone(option.known_risks),
      reason_visible_to_actor: option.reason_visible_to_actor,
      state_version: option.state_version,
      metadata: structuredClone(option.metadata)
    }))
  });
  const resolverOptions = actionSet.options.map((option) => ({
    option_id: option.option_id,
    label: option.label,
    actor_id: option.actor_id,
    target_id: option.target_id,
    preconditions: structuredClone(option.preconditions),
    expected_cost: structuredClone(option.expected_cost),
    known_risks: structuredClone(option.known_risks),
    reason_visible_to_actor: option.reason_visible_to_actor,
    state_version: option.state_version,
    metadata: structuredClone(option.metadata)
  }));
  const raw = await semanticResolver(deepFreeze({
    version: 1,
    schema: 'turn_semantic_resolution_request',
    raw_text: String(rawText ?? ''),
    action_set: resolverOptions,
    action_set_digest: actionSet.options_digest,
    state_version: actionSet.state_version,
    policy_id: policyId,
    policy_version: policyVersion
  }));
  if (raw?.status === 'unknown') {
    if (Object.keys(raw).some((key) => !['status', 'reason_code'].includes(key))) {
      throw turnCommandError('TURN_SEMANTIC_RESULT_INVALID', 'Unknown result contains forbidden fields.');
    }
    return deepFreeze({
      status: 'unknown',
      option_id: null,
      command_id: null,
      trace: {
        decision_protocol: 'bounded_decision_v2',
        resolver_version: 'turn_semantic_resolution_request_v1',
        action_set_digest: actionSet.options_digest,
        state_version: request.state_version,
        policy_version: request.policy_version,
        reason_code: String(raw.reason_code ?? 'unknown_intent')
      }
    });
  }
  const resultKeys = Object.keys(raw ?? {});
  if (resultKeys.length !== 1 || resultKeys[0] !== 'option_id'
      || !stable(raw.option_id)) {
    throw turnCommandError(
      'TURN_SEMANTIC_RESULT_INVALID',
      'Semantic resolver must return only one exact option_id.'
    );
  }
  const selected = request.options.find(
    (option) => option.option_id === raw.option_id
  );
  if (!selected) {
    throw turnCommandError(
      'TURN_SEMANTIC_OPTION_INVALID',
      'Semantic resolver selected an option outside the closed action set.'
    );
  }
  const result = {
    version: 2,
    schema: 'bounded_decision_result_v2',
    request_id: request.request_id,
    state_version: request.state_version,
    option_id: selected.option_id,
    command_token: selected.command_token
  };
  const resolvedAt = decisionNow();
  let validated;
  try {
    validated = validateBoundedDecisionResult({
      request,
      result,
      secret: decisionSecret,
      now: resolvedAt,
      currentPolicyVersion: policyVersion,
      currentState: capability.committedState,
      evaluatePrecondition
    });
  } catch (error) {
    throw turnCommandError(
      error.code === 'DECISION_EXPIRED'
        ? 'TURN_SEMANTIC_DECISION_EXPIRED'
        : error.code === 'DECISION_STATE_MISMATCH'
          ? 'TURN_SEMANTIC_STATE_STALE'
        : error.code === 'DECISION_POLICY_STALE' ? 'TURN_SEMANTIC_POLICY_STALE'
          : error.code === 'DECISION_OPTIONS_TAMPERED' ? 'TURN_ACTION_SET_DIGEST_MISMATCH'
            : 'TURN_SEMANTIC_OPTION_INVALID',
      error.message
    );
  }
  const command = capability.registry.get(validated.command_id);
  if (!command || command.option_id !== validated.option_id) {
    throw turnCommandError('TURN_SEMANTIC_OPTION_INVALID', 'Resolved option has no exact registered handler.');
  }
  return deepFreeze({
    status: 'resolved',
    option_id: validated.option_id,
    command_id: validated.command_id,
    trace: {
      decision_protocol: 'bounded_decision_v2',
      resolver_version: 'turn_semantic_resolution_request_v1',
      action_set_digest: actionSet.options_digest,
      state_version: request.state_version,
      policy_version: request.policy_version,
      resolved_at: resolvedAt,
      bounded_request_digest: request.options_digest,
      selected_option_id: validated.option_id
    }
  });
}

export async function resolveRegisteredTurnCommand({
  registry,
  playerInput,
  routingContext,
  services,
  now,
  committedState,
  actionSet
}) {
  requireRegistry(registry);
  const resolvedActionSet = actionSet ?? await createTurnAvailableActionSet({
    registry,
    committedState,
    actorId: routingContext.actor_id ?? playerInput.party_id,
    policyPins: routingContext.policy_pins ?? []
  });
  const capability = actionSets.get(resolvedActionSet);
  const exact = resolveExactTurnIntent({
    rawText: playerInput.raw_text,
    actionSet: resolvedActionSet,
    capability,
    stateVersion: resolvedActionSet.state_version,
    policyVersion: String(routingContext.policy_version ?? '1')
  });
  if (exact) {
    return {
      command: registry.get(exact.command_id),
      decisionTrace: exact.trace,
      optionId: exact.option_id
    };
  }
  const semanticBindings = stepBindings.get(registry) ?? [];
  if (semanticBindings.length > 0) {
    return resolveBoundTurnStepCommand({
      registry,
      semanticBindings,
      playerInput,
      routingContext,
      services,
      committedState,
      actionSet: resolvedActionSet,
      availabilityDecisions: capability.availabilityDecisions
    });
  }
  const resolved = await resolveTurnSemanticIntent({
    rawText: playerInput.raw_text,
    actionSet: resolvedActionSet,
    semanticResolver: services.semanticResolver,
    stateVersion: resolvedActionSet.state_version,
    policyVersion: String(routingContext.policy_version ?? '1'),
    policyId: String(routingContext.policy_id ?? 'turn_semantic_intent'),
    requestId: `turn-decision:${playerInput.party_id}:${playerInput.turn_number}`,
    partyId: playerInput.party_id,
    decisionSecret: services.decisionSecret,
    issuedAt: now,
    expiresAt: services.decisionExpiresAt,
    decisionNow: services.decisionNow,
    evaluatePrecondition: services.evaluatePrecondition
  });
  if (resolved.status === 'unknown') {
    throw turnCommandError('TURN_SEMANTIC_INTENT_UNKNOWN', 'Player intent does not match an available action.');
  }
  return {
    command: registry.get(resolved.command_id),
    decisionTrace: resolved.trace,
    optionId: resolved.option_id
  };
}


function resolveExactTurnIntent({ rawText, actionSet, capability,
  stateVersion, policyVersion }) {
  if (!capability) {
    throw turnCommandError('TURN_ACTION_SET_INVALID',
      'Action set must be built by createTurnAvailableActionSet.');
  }
  const exactMatches = actionSet.options.filter((option) =>
    capability.handlers.get(option.option_id)?.matches(deepFreeze({
      raw_text: String(rawText ?? ''),
      playerInput: { raw_text: String(rawText ?? '') },
      player_input: { raw_text: String(rawText ?? '') },
      action_set_digest: actionSet.options_digest
    })) === true);
  if (exactMatches.length !== 1) return null;
  const option = exactMatches[0];
  return deepFreeze({
    status: 'resolved',
    option_id: option.option_id,
    command_id: capability.handlers.get(option.option_id).command_id,
    trace: {
      decision_protocol: 'code_exact_fast_path_v1',
      action_set_digest: actionSet.options_digest,
      state_version: stateVersion,
      policy_version: policyVersion
    }
  });
}

export function sealTurnWritePlan(plan) {
  const sealed = deepFreeze(structuredClone(plan));
  sealedPlans.add(sealed);
  return sealed;
}
export function isCodeOwnedTurnWritePlan(plan) { return sealedPlans.has(plan); }
export function requireTurnCommandRegistry(registry) { requireRegistry(registry); return registry; }

function requireRegistry(registry) { if (!registries.has(registry)) throw turnCommandError('TURN_COMMAND_REGISTRY_INVALID', 'Turn command registry must be created by the code registry factory.'); }
function structuredCloneHandlers(value) {
  const optionId = String(value.option_id ?? value.command_id).trim();
  if (!optionId) throw new TypeError('Every turn command requires stable option_id.');
  return {
    ...value,
    option_id: optionId,
    label: String(value.label ?? value.reason_visible_to_actor ?? optionId),
    mode: structuredClone(value.mode),
    approved_record: structuredClone(value.approved_record ?? null),
    preconditions: structuredClone(value.preconditions ?? []),
    expected_cost: structuredClone(value.expected_cost ?? { kind: 'time', value: 0 }),
    known_risks: structuredClone(value.known_risks ?? []),
    reason_visible_to_actor: value.reason_visible_to_actor ?? 'Разрешённая команда.',
    semantic_binding: normalizeSemanticBinding(value.semantic_binding)
  };
}
function normalizeSemanticBinding(value) {
  if (value == null) return null;
  let operationDto = null;
  if (value.operation_dto != null) {
    try { operationDto = structuredClone(value.operation_dto); }
    catch { throw new TypeError('semantic_binding operation_dto must be cloneable.'); }
  }
  if (!plain(value) || !stable(value.binding_id)
      || !isDomainStepOperation(value.operation)
      || typeof value.matches !== 'function'
      || Object.keys(value).some((key) =>
        !['binding_id', 'operation', 'operation_dto', 'matches'].includes(key))
      || (operationDto != null && (!plain(operationDto)
        || operationDto.op !== value.operation
        || !validateTurnStepOperationDto(operationDto).ok))) {
    throw new TypeError('semantic_binding requires binding_id, domain operation and code matcher.');
  }
  return {
    binding_id: value.binding_id,
    operation: value.operation,
    operation_dto: operationDto,
    matches: value.matches
  };
}
function assertApprovedRecordBinding(command, policyPins) {
  if (command.approved_record == null) return;
  const reference = command.approved_record;
  if (!stable(reference.id) || !Number.isSafeInteger(reference.version)
    || !/^[a-f0-9]{64}$/u.test(String(reference.digest ?? ''))
    || !policyPins.some((pin) => pin?.id === reference.id
      && pin.version === reference.version
      && pin.digest === reference.digest)) {
    throw turnCommandError('TURN_ACTION_POLICY_PIN_MISSING', `Action ${command.option_id} lacks its exact approved record pin.`);
  }
}
function plain(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function stable(value) { return typeof value === 'string' && value.trim().length > 0; }
function turnCommandError(code, message) { return Object.assign(new Error(message), { code }); }
