import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalPhase11LlmResponder } from './lower-dvina-phase-11-llm.js';

test('canonical local fixture serves the active S1 descriptor role', async () => {
  const response = await createCanonicalPhase11LlmResponder()({
    model: 'fixture-spatial-semantic-descriptor',
    input: { request_id: 's1-local', approved_envelope: {
      required_semantic_requirements: ['interior_space'] } }
  });
  assert.deepEqual(response, {
    schema: 'rus.s1_spatial_semantic_proposal.v1', request_id: 's1-local',
    name: 'Низкая плетёная загородка',
    description: 'Сырая плетёная загородка у берега, без особого значения.',
    semantic_requirements: ['interior_space']
  });
});

test('canonical local fixture routes a free general look into the shared planner',
  async () => {
    const plan = await createCanonicalPhase11LlmResponder()({
      model: 'fixture-turn-step-planner', input: {
        request_id: 'look-local', committed_state_version: 1,
        working_revision: 0, step_index: 1,
        root_player_action: 'Осматриваюсь вокруг.',
        remaining_intent: 'Осматриваюсь вокруг.',
        actor: { actor_id: 'player-local' },
        player_safe_state: { spatial_semantic: {
          semantic_grounding_available: true, position_ref: 'position:local' } }
      }
    });
    assert.deepEqual(plan.operations, [{ op: 'request_discovery',
      actor_ref: 'player-local', discovery_kind: 'look',
      target_refs: ['position:local'], query: 'осмотреться' }]);
  });

test('canonical local fixture copies exact required player operation', async () => {
  const operation = {
    op: 'emit_interaction', interaction_kind: 'present_item_as_evidence',
    actor_ref: { entity_kind: 'player_character', entity_id: 'player-1' },
    target_ref: { entity_kind: 'npc', entity_id: 'eremey-1' },
    entity_ref: { entity_kind: 'item', entity_id: 'item:blue-wool' }
  };
  const request = {
    request_id: 'eremey-clue', conversation_id: 'conversation-1',
    state_version: 1, raw_text: 'Показать Еремею синюю шерсть.',
    speaker_ref: operation.actor_ref,
    player_safe_context: {
      target_npc_ref: operation.target_ref,
      required_supporting_operation: operation,
      available_check: {
        attribute_ref: 'attribute:presence', skill_ref: 'skill:persuasion',
        difficulty_band: 'hard'
      }
    }
  };

  for (const model of [
    'fixture-player-conversation-interpreter',
    'fixture-player-conversation-interpreter-repair'
  ]) {
    const plan = await createCanonicalPhase11LlmResponder()({ model,
      input: { request } });
    assert.equal(plan.resolution, 'check_required');
    assert.deepEqual(plan.supporting_operations, [operation]);
    assert.notStrictEqual(plan.supporting_operations[0], operation);
  }
});

test('canonical local fixture mirrors required Eremey route reply fields',
  async () => {
    const playerRef = { entity_kind: 'player_character', entity_id: 'player-1' };
    const operation = {
      op: 'disclose_known_route', target_ref: playerRef,
      route_ref: 'route:camp-to-shed',
      source_knowledge_scope_ref: 'knowledge:eremey-route'
    };
    const plan = await createCanonicalPhase11LlmResponder()({
      model: 'fixture-npc-conversation-responder', input: { request: {
        request_id: 'eremey-required-route', boundary_id: 'boundary-1',
        conversation_id: 'conversation-1', exchange_id: 'exchange-1',
        state_version: 1,
        npc_ref: { entity_kind: 'npc', entity_id: 'eremey-1' },
        public_conversation_history: [{ speaker_ref: playerRef }],
        decision_scope: {
          required_resolution: 'check_required',
          required_check: {
            attribute_ref: 'attribute:presence', skill_ref: 'skill:persuasion',
            difficulty_band: 'hard'
          },
          required_supporting_operation: operation,
          operation_contract: { disclose_known_route: {
            route_ref: operation.route_ref,
            source_knowledge_scope_ref: operation.source_knowledge_scope_ref
          } }
        }
      } }
    });

    assert.equal(plan.resolution, 'check_required');
    assert.deepEqual(plan.check, {
      purpose: 'resolve social delivery',
      attribute_ref: 'attribute:presence', skill_ref: 'skill:persuasion',
      difficulty_band: 'hard', outcomes: {
        clean_success: { delivery_quality: 'compelling', observable_effects: [] },
        success: { delivery_quality: 'credible', observable_effects: [] },
        success_with_cost: {
          delivery_quality: 'credible_with_visible_cost', observable_effects: []
        },
        failure_with_consequence: {
          delivery_quality: 'unconvincing', observable_effects: []
        },
        severe_failure: {
          delivery_quality: 'transparently_manipulative', observable_effects: []
        }
      }
    });
    assert.deepEqual(plan.supporting_operations, [operation]);
    assert.deepEqual(plan.primary_addressee_ref, playerRef);
    assert.deepEqual(plan.intended_addressee_refs, [playerRef]);
    assert.deepEqual(plan.speech.claims[0].source_knowledge_refs, [{
      entity_kind: 'knowledge_scope', entity_id: operation.source_knowledge_scope_ref
    }]);
  });
