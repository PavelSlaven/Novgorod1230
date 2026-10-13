import assert from 'node:assert/strict';
import test from 'node:test';
import { createTurnAvailableActionSet } from '@rus/turn';
import { turnStepOperationChoices } from
  '../src/runtime/lower-dvina-trace-turn-step-operation-choices.js';
import { createTurnStepDomainOwnerPreflight } from
  '../../../packages/turn/src/turn-step-admission.js';
import { liveWorldTurnRegistry } from '../src/runtime/lower-dvina-trace-phase-2.js';
import { NEAR, generatedState, profile } from
  './lower-dvina-trace-generated-npc-fixture.js';
import { createM2ConversationModels } from
  './lower-dvina-trace-m2-conversation-fixture.js';

test('group admission has one canonical owner at both supported scene sizes',
  async () => {
    const kinds = profile.profile.neutral_conversation_profile.interaction_kinds;
    for (const groupSize of [2, 3]) {
      const state = generatedState((value) => {
        if (groupSize === 3) value.npcs[2] = { ...value.npcs[2],
          position_id: NEAR, g6_instance_id: value.position.g6_instance_id };
      });
      const visibleIds = state.npcs.slice(0, groupSize).map(
        ({ instance_id }) => instance_id);
      assert.equal(visibleIds.length, groupSize);
      const visibleActors = visibleIds.map((entity_id, index) => ({
        entity_ref: { entity_kind: 'npc', entity_id },
        display_label: `видимый человек ${index + 1}`,
        recognition: 'unrecognized'
      }));
      state.current_visible_context.visible_npc = visibleActors;

      const models = createM2ConversationModels();
      const registry = await liveWorldTurnRegistry({ state,
        inputDigest: 'a'.repeat(64), authoredTurnProfile: profile,
        playerConversationModel: models.playerConversationModel,
        npcSemanticModel: models.npcSemanticModel });
      const registered = registry.registered();
      const conversationCommands = registered.filter(({ command_id: id }) =>
        id.startsWith('live_world.conversation.'));
      const actionSet = await createTurnAvailableActionSet({ registry,
        committedState: state, actorId: state.actor_id,
        policyPins: registered.map(({ approved_record }) => approved_record)
          .filter(Boolean) });
      const semanticBindings = registered.filter(({ semantic_binding }) =>
        semantic_binding).map((command) => ({ command,
          binding: command.semantic_binding }));
      const preflight = createTurnStepDomainOwnerPreflight({
        externalRegistry: null, semanticBindings,
        availableOptions: new Set(actionSet.options.map(({ option_id }) =>
          option_id)), actor: { actor_id: state.actor_id },
        committedState: state, services: {}
      });
      const operations = conversationCommands.flatMap(({ semantic_binding }) =>
        semantic_binding.operation_dtos);
      const request = { remaining_intent: 'обращаюсь ко всей группе',
        available_domain_operations: operations, player_safe_state: {} };
      let groupOwnerId;

      for (const kind of kinds) {
        const groupDtos = operations.filter((operation) =>
          operation.op === 'emit_interaction'
            && operation.interaction_kind === kind
            && operation.target_actor_refs?.length === groupSize
            && visibleIds.every((id) =>
              operation.target_actor_refs.includes(id)));
        assert.equal(groupDtos.length, 1,
          `expected one ${groupSize}-target DTO for ${kind}`);
        const [dto] = groupDtos;
        assert.deepEqual(dto.target_actor_refs, visibleIds,
          `group DTO for ${kind} must use canonical scene order`);
        assert.equal(dto.content, 'Обратиться к видимым людям',
          `group DTO for ${kind} must describe all targets`);

        const choices = turnStepOperationChoices({
          available_domain_operations: operations,
          player_safe_state: { current_visible_context: {
            visible_npc: visibleActors
          } }
        });
        const groupChoice = choices.find(({ operation }) =>
          operation === dto || operation.op === dto.op
            && operation.interaction_kind === kind
            && operation.target_actor_refs.length === groupSize);
        assert.deepEqual(groupChoice?.player_safe_grounding?.target_actors,
          visibleActors,
          `planner grounding for ${kind} must include every visible target`);

        for (const id of visibleIds) {
          const singletonDtos = operations.filter((operation) =>
            operation.op === 'emit_interaction'
              && operation.interaction_kind === kind
              && operation.target_actor_refs?.length === 1
              && operation.target_actor_refs[0] === id);
          assert.equal(singletonDtos.length, 1,
            `singleton DTO for ${kind}/${id} must remain available`);
          const operation = singletonDtos[0];
          const plan = { resolution: 'domain_request', operations: [operation] };
          assert.equal(preflight.resolve({ operation, plan, request }).kind,
            'binding', `singleton owner for ${kind}/${id} must remain available`);
          assert.doesNotThrow(() => preflight({ plan, request }),
            `singleton admission for ${kind}/${id} must remain valid`);
        }

        const admit = (target_actor_refs) => {
          const operation = { ...dto, target_actor_refs };
          const plan = { resolution: 'domain_request', operations: [operation] };
          return { operation, plan, request,
            owner: preflight.resolve({ operation, plan, request }),
            validate: () => preflight({ plan, request }) };
        };
        for (const order of permutations(visibleIds)) {
          const admission = admit(order);
          assert.equal(admission.owner.kind, 'binding');
          groupOwnerId ??= admission.owner.command.command_id;
          assert.equal(admission.owner.command.command_id, groupOwnerId,
            'group target order or interaction kind changed canonical owner');
          assert.deepEqual(admission.owner.bound_operation?.target_actor_refs,
            visibleIds, 'admission lost canonical group targets');
          assert.doesNotThrow(admission.validate,
            `permutation must pass admission for ${kind}`);
        }

        const duplicateTargets = groupSize === 2
          ? [visibleIds[0], visibleIds[0]]
          : [visibleIds[0], visibleIds[1], visibleIds[1]];
        const duplicate = admit(duplicateTargets);
        assert.equal(duplicate.owner.kind, 'missing');
        assert.throws(duplicate.validate, (error) =>
          error.code === 'TURN_STEP_PLAN_INVALID'
            && error.details.errors.some(({ rule }) =>
              rule === 'domain_owner_unavailable'));
      }

      const groupOperation = operations.find((operation) =>
        operation.op === 'emit_interaction'
          && operation.target_actor_refs?.length === groupSize);
      const incompleteChoices = turnStepOperationChoices({
        available_domain_operations: [groupOperation],
        player_safe_state: { current_visible_context: {
          visible_npc: visibleActors.slice(0, -1)
        } }
      });
      assert.equal(Object.hasOwn(incompleteChoices[0] ?? {},
        'player_safe_grounding'), false,
      'planner must omit partial grounding when any group target is hidden');
    }
  });

function permutations(values) {
  if (values.length < 2) return [values];
  return values.flatMap((value, index) => permutations([
    ...values.slice(0, index), ...values.slice(index + 1)
  ]).map((rest) => [value, ...rest]));
}
