import assert from 'node:assert/strict';
import test from 'node:test';
import {
  actorFacetsOf, playerActorFacetsFromState, semanticInputOf
} from '../src/runtime/world-knowledge-request-context.js';
import { createLowerDvinaTracePlayerConversationModel } from
  '../src/runtime/lower-dvina-trace-conversation-llm.js';
import { createLowerDvinaTraceNarrationService } from
  '../src/runtime/lower-dvina-trace-narration-llm.js';
import { canAccess } from '@rus/world-knowledge';

test('actorFacetsOf maps dossier social_role_id to role_ref', () => {
  assert.deepEqual(actorFacetsOf({
    player_safe_state: { social_role_id: 'nov_role_merchant_clerk' }
  }, null), { role_ref: 'nov_role_merchant_clerk' });
  assert.deepEqual(playerActorFacetsFromState({
    player_profile: {
      social_status: {
        social_role_id: 'nov_role_merchant_clerk',
        occupation_id: 'nov_occ_clerk'
      }
    }
  }), {
    role_ref: 'nov_role_merchant_clerk',
    occupation_ref: 'nov_occ_clerk'
  });
});

test('semanticInputOf accepts player raw_text and narration visible changes', () => {
  assert.equal(semanticInputOf({
    schema: 'player_conversation_input_v1',
    raw_text: 'Спроси про сети'
  }), 'Спроси про сети');
  assert.equal(semanticInputOf({
    schema: 'narration_request',
    visible_context: { visible_changes: ['Ты поднял сеть.'] },
    context: { attempt: { text: 'взять сеть' } }
  }), 'Ты поднял сеть. взять сеть');
});

test('player conversation model grounds with semantic_resolution', async () => {
  const grounds = [];
  let sawClosure = false;
  const roleRunner = {
    async run(call) {
      if (call.messages[0].content.includes('world_knowledge is the only factual')) {
        sawClosure = true;
      }
      return { output: { invalid: true } };
    }
  };
  const grounder = {
    async ground(request, purpose, authoritative) {
      grounds.push({ purpose, authoritative });
      return {
        ...request,
        world_knowledge: {
          sufficiency: 'SUFFICIENT_KNOWLEDGE',
          pack_revision: 'test',
          facts: []
        }
      };
    }
  };
  const model = createLowerDvinaTracePlayerConversationModel({
    roleRunner, worldKnowledgeGrounder: grounder
  });
  await model({
    schema: 'player_conversation_input_v1',
    request_id: 'req-1',
    raw_text: 'Спроси про сети',
    player_safe_context: {
      current_game_timestamp: {
        whole_minutes: '0', subminute_numerator: '0', subminute_denominator: '1'
      }
    }
  }, {
    actor_facets: { role_ref: 'nov_role_merchant_clerk' },
    historical_events: []
  });
  assert.equal(grounds.length, 1);
  assert.equal(grounds[0].purpose, 'semantic_resolution');
  assert.deepEqual(grounds[0].authoritative.actor_facets,
    { role_ref: 'nov_role_merchant_clerk' });
  assert.equal(sawClosure, true);
});

test('narration service calls ground with narration before writer', async () => {
  const grounds = [];
  const visible = {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: 'Тёмная речная вода.',
    visible_changes: ['Ты поднял сеть.'],
    uncertainties: [],
    do_not_imply: [],
    allowed_tensions: [],
    sensory_details: [],
    visible_objects: [],
    known_context: []
  };
  const roleRunner = {
    async run(call) {
      assert.equal(Object.hasOwn(JSON.parse(call.messages[1].content),
        'world_knowledge_authoritative'), false);
      if (call.role_id === 'gameplay_narrator') {
        assert.match(call.messages[0].content, /world_knowledge is the only factual/u);
        return { output: { prose: 'Ты поднял сеть.' } };
      }
      return { output: {} };
    }
  };
  const grounder = {
    async ground(request, purpose, authoritative) {
      grounds.push({ purpose, authoritative });
      return {
        ...request,
        world_knowledge: {
          sufficiency: 'PARTIAL_KNOWLEDGE',
          pack_revision: 'test',
          facts: []
        }
      };
    }
  };
  const service = createLowerDvinaTraceNarrationService({
    roleRunner, worldKnowledgeGrounder: grounder
  });
  const result = await service.run({
    version: 1,
    schema: 'narration_request',
    request_id: 'n1',
    surface: 'turn',
    visible_context: visible,
    world_knowledge_authoritative: {
      clock: null,
      historical_events: [],
      actor_facets: { role_ref: 'nov_role_merchant_clerk' }
    }
  });
  assert.equal(result.status, 'blocked');
  assert.ok(grounds.length >= 1);
  assert.equal(grounds[0].purpose, 'narration');
  assert.deepEqual(grounds[0].authoritative.actor_facets,
    { role_ref: 'nov_role_merchant_clerk' });
});

test('canAccess still gates conversation/narration after D15', () => {
  const access = { class: 'domain_internal_only', required_facets: [] };
  assert.equal(canAccess(access, {}, 'npc_decision'), true);
  assert.equal(canAccess(access, {}, 'conversation'), false);
  assert.equal(canAccess(access, {}, 'narration'), false);
});
