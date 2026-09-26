import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createWorldKnowledgeCore } from '@rus/world-knowledge';
import {
  actorFacetsOf, playerActorFacetsFromState, playerWorldKnowledgeAuthoritativeFromState,
  semanticInputOf, withPlayerWorldKnowledgeAuthoritative
} from '../src/runtime/world-knowledge-request-context.js';
import { createLowerDvinaTracePlayerConversationModel,
  rejectIntentParaphraseWorldKnowledgeLeak } from
  '../src/runtime/lower-dvina-trace-conversation-llm.js';
import { createLowerDvinaTraceNarrationService, narrationWire } from
  '../src/runtime/lower-dvina-trace-narration-llm.js';
import { createProductionWorldKnowledgeGrounder } from
  '../src/runtime/world-knowledge-grounding.js';
import { canAccess } from '@rus/world-knowledge';
import { reviewedNarration } from './narration-audit-fixture.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const bundlePath = join(ROOT,
  'data/world-catalogs/novgorod/world-knowledge/production-v1/runtime-bundle.json');

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

test('F9 committed state wins over callContext facets/events/clock', async () => {
  const seen = [];
  const model = async (_request, ctx) => { seen.push(ctx); return { ok: true }; };
  const wrapped = withPlayerWorldKnowledgeAuthoritative(model, () => ({
    clock: { whole_minutes: '10', subminute_numerator: '0', subminute_denominator: '1' },
    historical_events: [{ event_id: 'event:from-state', phases: [] }],
    player_profile: { social_status: { social_role_id: 'role-state' } }
  }));
  await wrapped({ schema: 'x' }, {
    clock: { whole_minutes: '99', subminute_numerator: '0', subminute_denominator: '1' },
    historical_events: [{ event_id: 'event:from-call', phases: [] }],
    actor_facets: { role_ref: 'role-call' }
  });
  assert.equal(seen[0].actor_facets.role_ref, 'role-state');
  assert.equal(seen[0].historical_events[0].event_id, 'event:from-state');
  assert.equal(seen[0].clock.whole_minutes, '10');
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

test('F5 rejectIntentParaphraseWorldKnowledgeLeak catches copied fact text', () => {
  const slice = {
    facts: [{ claim_ref: 'claim:bathing-washing-water',
      runtime_text: 'Купальщик моется водой из бани для стирки белья.' }]
  };
  assert.throws(() => rejectIntentParaphraseWorldKnowledgeLeak({
    input_mode: 'intent_paraphrase',
    speech: { utterance_text: 'Купальщик моется водой из бани для стирки белья.' }
  }, slice), /PLAYER_CONVERSATION_WK_UTTERANCE_LEAK|utterance must not copy/u);
  // N5: punctuation / ё variants still catch.
  assert.throws(() => rejectIntentParaphraseWorldKnowledgeLeak({
    input_mode: 'intent_paraphrase',
    speech: { utterance_text: 'Купальщик моется водой из бани для стирки белья?' }
  }, slice), /PLAYER_CONVERSATION_WK_UTTERANCE_LEAK|utterance must not copy/u);
  assert.throws(() => rejectIntentParaphraseWorldKnowledgeLeak({
    input_mode: 'intent_paraphrase',
    speech: { utterance_text: 'Купальщик моется водой из бани для стирки белья.' }
  }, {
    facts: [{ claim_ref: 'claim:yo',
      runtime_text: 'Купальщик моётся водой из бани для стирки белья.' }]
  }), /PLAYER_CONVERSATION_WK_UTTERANCE_LEAK|utterance must not copy/u);
  assert.doesNotThrow(() => rejectIntentParaphraseWorldKnowledgeLeak({
    input_mode: 'intent_paraphrase',
    speech: { utterance_text: 'Где сети?' }
  }, slice));
});

test('player conversation model grounds with semantic_resolution', async () => {
  const grounds = [];
  let sawClosure = false;
  const roleRunner = {
    async run(call) {
      if (call.messages[0].content.includes('world_knowledge is the only factual')) {
        sawClosure = true;
      }
      assert.match(call.messages[0].content, /Never add an unstated claim/u);
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

test('F3 narrationWire strips authoritative from nested repair original', () => {
  const wired = narrationWire({
    schema: 'narration_format_repair_request',
    party_id: 'party-leak',
    world_knowledge_authoritative: {
      clock: { whole_minutes: '0', subminute_numerator: '0', subminute_denominator: '1' },
      historical_events: [{
        event_id: 'event:future',
        phases: [{ start: { whole_minutes: '10000000', subminute_numerator: '0',
          subminute_denominator: '1' } }]
      }],
      actor_facets: { role_ref: 'nov_role_merchant_clerk' }
    },
    world_knowledge: {
      schema: 'world_knowledge_slice_v1',
      pack_ref: 'pack',
      pack_revision: 'rev',
      coverage: [], hard_constraints: [], facts: [{ claim_ref: 'c1', runtime_text: 'ok' }],
      disputes: [], gaps: []
    },
    request: {
      schema: 'narration_request',
      party_id: 'nested-party',
      world_knowledge_authoritative: {
        actor_facets: { role_ref: 'should-not-leak' }
      },
      visible_context: {
        visible_changes: ['Ты поднял сеть.'],
        uncertainties: [],
        do_not_imply: [],
        allowed_tensions: [],
        visible_scene: 'Река.'
      }
    }
  });
  assert.equal(Object.hasOwn(wired, 'world_knowledge_authoritative'), false);
  assert.equal(Object.hasOwn(wired, 'party_id'), false);
  assert.equal(wired.world_knowledge?.facts?.[0]?.claim_ref, 'c1');
  assert.equal(wired.required_current_beat.changes[0].text, 'Ты поднял сеть.');
});

test('F1/F2 narration grounds once and keeps WK on writer wire', async () => {
  const grounds = [];
  const writerBodies = [];
  const roleCalls = [];
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
      roleCalls.push(call.role_id);
      const body = JSON.parse(call.messages[1].content);
      assert.equal(Object.hasOwn(body, 'world_knowledge_authoritative'), false);
      assert.equal(Object.hasOwn(body, 'party_id'), false);
      if (call.role_id === 'gameplay_narrator') {
        writerBodies.push(body);
        assert.equal(body.world_knowledge?.facts?.[0]?.claim_ref, 'claim:allowed');
        assert.match(call.messages[0].content, /world_knowledge is the only factual/u);
        return { output: { prose: 'Ты поднял сеть.' } };
      }
      if (call.role_id === 'gameplay_narrator_auditor') {
        assert.equal(body.world_knowledge?.facts?.[0]?.claim_ref, 'claim:allowed');
        const refs = [...body.required_current_beat.changes,
          ...body.required_current_beat.uncertainties];
        return {
          output: reviewedNarration(body.segments,
            Object.fromEntries(refs.map(({ ref }) => [ref, ['s1']])))
        };
      }
      return { output: {} };
    }
  };
  const grounder = {
    async ground(request, purpose, authoritative) {
      grounds.push({ purpose, schema: request.schema, authoritative });
      assert.equal(request.schema, 'narration_request');
      return {
        ...request,
        world_knowledge: {
          schema: 'world_knowledge_slice_v1',
          pack_ref: 'pack',
          pack_revision: 'rev',
          coverage: [],
          hard_constraints: [],
          facts: [{ claim_ref: 'claim:allowed', runtime_text: 'Сеть мокрая.' }],
          disputes: [],
          gaps: []
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
    visible_context: visible
  }, {
    worldKnowledgeAuthoritative: {
      clock: null,
      historical_events: [],
      actor_facets: { role_ref: 'nov_role_merchant_clerk' }
    }
  });
  assert.equal(grounds.length, 1);
  assert.equal(grounds[0].purpose, 'narration');
  assert.deepEqual(grounds[0].authoritative.actor_facets,
    { role_ref: 'nov_role_merchant_clerk' });
  assert.equal(writerBodies.length, 1);
  assert.ok(roleCalls.includes('gameplay_narrator_auditor'));
  assert.equal(result.status, 'approved');
  assert.equal(result.pass, true);
});

test('F1 format-repair and semantic-repair reuse writer WK pack', async () => {
  const grounds = [];
  const roleWk = [];
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
  let writerCalls = 0;
  let auditorPasses = 0;
  const roleRunner = {
    async run(call) {
      const body = JSON.parse(call.messages[1].content);
      roleWk.push({ role: call.role_id, claim: body.world_knowledge?.facts?.[0]?.claim_ref });
      if (call.role_id === 'gameplay_narrator') {
        writerCalls += 1;
        return { output: { not_prose: true } };
      }
      if (call.role_id === 'gameplay_narrator_format_repair') {
        return { output: { prose: 'Ты поднял сеть.' } };
      }
      if (call.role_id === 'gameplay_narrator_auditor') {
        auditorPasses += 1;
        const refs = [...body.required_current_beat.changes,
          ...body.required_current_beat.uncertainties];
        if (auditorPasses === 1) {
          return {
            output: {
              ...reviewedNarration(body.segments,
                Object.fromEntries(refs.map(({ ref }) => [ref, ['s1']]))),
              unsupported: [{ segment_choice: 's1', kind: 'unsupported_fact',
                reason: 'лишнее' }]
            }
          };
        }
        return {
          output: reviewedNarration(body.segments,
            Object.fromEntries(refs.map(({ ref }) => [ref, ['s1']])))
        };
      }
      if (call.role_id === 'gameplay_narrator_semantic_repair') {
        return { output: { replacements: [{ prose: 'Ты поднял сеть.' }] } };
      }
      return { output: {} };
    }
  };
  const service = createLowerDvinaTraceNarrationService({
    roleRunner,
    worldKnowledgeGrounder: {
      async ground(request, purpose) {
        grounds.push(purpose);
        return {
          ...request,
          world_knowledge: {
            schema: 'world_knowledge_slice_v1',
            pack_ref: 'pack', pack_revision: 'rev', coverage: [],
            hard_constraints: [],
            facts: [{ claim_ref: 'claim:allowed', runtime_text: 'Сеть мокрая.' }],
            disputes: [], gaps: []
          }
        };
      }
    }
  });
  const result = await service.run({
    version: 1, schema: 'narration_request', request_id: 'n-chain',
    surface: 'turn', visible_context: visible, max_repairs: 1
  }, {
    worldKnowledgeAuthoritative: {
      clock: null, historical_events: [],
      actor_facets: { role_ref: 'nov_role_fisher' }
    }
  });
  assert.equal(grounds.length, 1);
  assert.equal(writerCalls, 1);
  assert.ok(roleWk.some((x) => x.role === 'gameplay_narrator_format_repair'
    && x.claim === 'claim:allowed'));
  assert.ok(roleWk.some((x) => x.role === 'gameplay_narrator_semantic_repair'
    && x.claim === 'claim:allowed'));
  assert.equal(result.status, 'approved');
});


test('A4 WK degradation emits telemetry trace with code/purpose/request_id', async () => {
  const traces = [];
  const details = [];
  const roleRunner = {
    async run(call) {
      if (call.role_id === 'gameplay_narrator') {
        return { output: { prose: 'Ты стоишь у воды.' } };
      }
      if (call.role_id === 'gameplay_narrator_auditor') {
        const body = JSON.parse(call.messages[1].content);
        return {
          output: {
            reviewed_segments: body.segments.map((s) => s.segment_id),
            source_reviews: [...body.required_current_beat.changes,
              ...body.required_current_beat.uncertainties]
              .map(({ ref }) => ({ ref, segment_choices: [body.segments[0].segment_id] })),
            unsupported: [],
            literary_failures: [],
            evidence: ['ok']
          }
        };
      }
      return { output: {} };
    }
  };
  const service = createLowerDvinaTraceNarrationService({
    roleRunner,
    worldKnowledgeGrounder: {
      async ground() {
        throw Object.assign(new Error('vector down'), {
          code: 'WORLD_KNOWLEDGE_UNAVAILABLE'
        });
      }
    },
    telemetry: {
      onGameplayTrace: (entry) => traces.push(entry),
      onDetail: (entry) => details.push(entry)
    }
  });
  const result = await service.run({
    version: 1, schema: 'narration_request', request_id: 'n-degrade',
    surface: 'turn',
    visible_context: {
      version: 1, schema: 'visible_context_package',
      visible_scene: 'Река.', visible_changes: ['Ты стоишь у воды.'],
      uncertainties: [], do_not_imply: [], allowed_tensions: [],
      sensory_details: [], visible_objects: [], known_context: []
    }
  });
  assert.equal(result.status, 'approved');
  assert.equal(traces.length, 1);
  assert.equal(traces[0].event, 'world_knowledge_narration_degraded');
  assert.equal(traces[0].code, 'WORLD_KNOWLEDGE_UNAVAILABLE');
  assert.equal(traces[0].purpose, 'narration');
  assert.equal(traces[0].request_id, 'n-degrade');
  assert.equal(details[0].code, 'WORLD_KNOWLEDGE_UNAVAILABLE');
});

test('A4 TypeError from grounder is rethrown (no catch-all)', async () => {
  const service = createLowerDvinaTraceNarrationService({
    roleRunner: {
      async run() { return { output: { prose: 'x' } }; }
    },
    worldKnowledgeGrounder: {
      async ground() { throw new TypeError('boom'); }
    }
  });
  await assert.rejects(() => service.run({
    version: 1, schema: 'narration_request', request_id: 'n-bug',
    surface: 'turn',
    visible_context: {
      version: 1, schema: 'visible_context_package',
      visible_scene: 'Река.', visible_changes: ['Ты стоишь у воды.'],
      uncertainties: [], do_not_imply: [], allowed_tensions: [],
      sensory_details: [], visible_objects: [], known_context: []
    }
  }), (err) => err instanceof TypeError && err.message === 'boom');
});

test('canAccess still gates conversation/narration after D15', () => {
  const access = { class: 'domain_internal_only', required_facets: [] };
  assert.equal(canAccess(access, {}, 'npc_decision'), true);
  assert.equal(canAccess(access, {}, 'conversation'), false);
  assert.equal(canAccess(access, {}, 'narration'), false);
});
