import assert from 'node:assert/strict';
import test from 'node:test';
import { generatedState, profile } from
  './lower-dvina-trace-generated-npc-fixture.js';
import { createM2ConversationModels } from
  './lower-dvina-trace-m2-conversation-fixture.js';

const runtimePath = process.env.ISSUE_553_RUNTIME_MODULE
  ?? '../src/runtime/lower-dvina-trace-phase-2.js';
const { liveWorldTurnRegistry } = await import(runtimePath);
const turnModulePath = process.env.ISSUE_553_TURN_MODULE ?? '@rus/turn';
const { createTurnAvailableActionSet } = await import(turnModulePath);
const admissionPath = process.env.ISSUE_553_ADMISSION_MODULE
  ?? '../../../packages/turn/src/turn-step-admission.js';
const { createTurnStepDomainOwnerPreflight } = await import(admissionPath);

async function conversationRegistry(state = generatedState()) {
  const models = createM2ConversationModels();
  const registry = await liveWorldTurnRegistry({ state,
    inputDigest: 'a'.repeat(64), authoredTurnProfile: profile,
    playerConversationModel: models.playerConversationModel,
    npcSemanticModel: models.npcSemanticModel });
  const registered = registry.registered();
  const actionSet = await createTurnAvailableActionSet({ registry,
    committedState: state, actorId: state.actor_id,
    policyPins: registered.map(({ approved_record }) => approved_record)
      .filter(Boolean) });
  const availableOptions = new Set(actionSet.options.map(({ option_id }) =>
    option_id));
  const semanticBindings = registered.filter(({ semantic_binding }) =>
    semantic_binding).map((command) => ({ command,
    binding: command.semantic_binding }));
  const preflight = createTurnStepDomainOwnerPreflight({ externalRegistry: null,
    semanticBindings, availableOptions,
    actor: { actor_id: state.actor_id }, committedState: state,
    services: {} });
  const availableOperations = conversationCommands(registry).flatMap(
    ({ semantic_binding }) => semantic_binding.operation_dtos);
  return { registry, state, preflight, availableOperations };
}

function conversationCommands(registry) {
  return registry.registered().filter(({ command_id: id }) =>
    id.startsWith('live_world.conversation.'));
}

function preflightOperation(preflight, operation, availableOperations = [operation]) {
  const plan = { resolution: 'domain_request', operations: [operation] };
  const request = { remaining_intent: 'обращаюсь к людям',
    available_domain_operations: availableOperations,
    player_safe_state: {} };
  return { validate: () => preflight({ plan, request }),
    owner: preflight.resolve({ operation, plan, request }) };
}

function groupOperation(registry, visibleIds) {
  const operations = conversationCommands(registry).flatMap(({ semantic_binding }) =>
    semantic_binding.operation_dtos);
  const interactionKind = operations.find(({ op }) => op === 'emit_interaction')
    ?.interaction_kind;
  return operations.filter(({ op, target_actor_refs, interaction_kind }) =>
    op === 'emit_interaction' && interaction_kind === interactionKind
    && target_actor_refs.length === 2
    && visibleIds.every((id) => target_actor_refs.includes(id)));
}

test('production registry exposes one emit_interaction to both visible NPCs',
  async () => {
    const { registry, state, preflight } =
      await conversationRegistry();
    const visibleIds = state.npcs.filter((npc) =>
      npc.g6_instance_id === state.position.g6_instance_id)
      .map(({ instance_id }) => instance_id);
    assert.equal(visibleIds.length, 2);
    const groupOperations = groupOperation(registry, visibleIds);
    const [operationTemplate] = conversationCommands(registry)
      .flatMap(({ semantic_binding }) => semantic_binding.operation_dtos);
    const fixedModelAnswer = { ...operationTemplate,
      target_actor_refs: visibleIds };
    const admission = preflightOperation(preflight, fixedModelAnswer,
      groupOperations);
    assert.equal(admission.owner.kind, 'binding',
      'the fixed model answer must resolve to one real conversation owner');
    assert.doesNotThrow(admission.validate,
      'the fixed model answer must pass production semantic admission');
    assert.deepEqual(admission.owner.bound_operation?.target_actor_refs,
      visibleIds);
    assert.equal(groupOperations.length, 1,
      'registry must expose exactly one group operation for both visible NPCs');
  });

test('group semantic admission treats target order as irrelevant', async () => {
  const { registry, state, preflight } =
    await conversationRegistry();
  const visibleIds = state.npcs.filter((npc) =>
    npc.g6_instance_id === state.position.g6_instance_id)
    .map(({ instance_id }) => instance_id);
  const [operation] = groupOperation(registry, visibleIds);
  assert.ok(operation, 'group operation is required before permutation check');

  const permuted = { ...operation,
    target_actor_refs: [...operation.target_actor_refs].reverse() };
  const admission = preflightOperation(preflight, permuted, [operation]);
  assert.doesNotThrow(admission.validate);
  assert.equal(admission.owner.kind, 'binding');
  assert.deepEqual(admission.owner.bound_operation?.target_actor_refs,
    operation.target_actor_refs);
});

test('semantic admission rejects a group containing an invisible NPC', async () => {
  const { registry, state, preflight } =
    await conversationRegistry();
  const visibleIds = state.npcs.filter((npc) =>
    npc.g6_instance_id === state.position.g6_instance_id)
    .map(({ instance_id }) => instance_id);
  const invisibleId = state.npcs.find((npc) =>
    npc.g6_instance_id !== state.position.g6_instance_id)?.instance_id;
  assert.ok(invisibleId);
  const [base] = groupOperation(registry, visibleIds);
  assert.ok(base, 'group operation is required before visibility check');

  const admission = preflightOperation(preflight, { ...base,
    target_actor_refs: [...base.target_actor_refs, invisibleId] },
  [base]);
  assert.throws(admission.validate, (error) =>
    error.code === 'TURN_STEP_PLAN_INVALID'
      && error.details.errors.some(({ rule }) =>
        rule === 'domain_owner_unavailable'));
});

test('semantic admission keeps a valid single-target conversation', async () => {
  const { registry, preflight, availableOperations } =
    await conversationRegistry();
  const operation = conversationCommands(registry)
    .flatMap(({ semantic_binding }) => semantic_binding.operation_dtos)
    .find(({ op }) => op === 'emit_interaction');
  assert.ok(operation);
  const admission = preflightOperation(preflight, operation, availableOperations);
  assert.doesNotThrow(admission.validate);
  assert.equal(admission.owner.kind, 'binding');
  assert.deepEqual(admission.owner.bound_operation?.target_actor_refs,
    operation.target_actor_refs);
});
