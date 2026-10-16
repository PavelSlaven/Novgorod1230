import assert from 'node:assert/strict';
import test from 'node:test';
import { createLowerDvinaTraceNpcSemanticModel } from
  '../src/runtime/lower-dvina-trace-conversation-llm.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });

test('semantic fallback keeps only exact memory, allowed WK, and current observation facts',
  async () => {
    const memoryRef = ref('knowledge_record',
      'x9714d2d695d71150898632bf');
    const wkRef = ref('knowledge_record', 'claim:fish-net');
    const inaccessibleWkRef = ref('knowledge_record', 'claim:private-store');
    const observationRef = ref('perception_result', 'current-scene:1:1');
    const memoryFact = 'На пристани выгрузили две связки сухих дров.';
    const wkFact = 'Рыбацкие сети служат для ловли рыбы.';
    const observationFact = 'На очаге не видно пламени.';
    const input = {
      schema: 'npc_conversation_response_request_v1',
      request_id: 'issue-247', boundary_id: 'boundary-1',
      conversation_id: 'conversation-1', exchange_id: 'exchange-1',
      state_version: 1, requested_at: { whole_minutes: '1',
        subminute_numerator: '0', subminute_denominator: '1' },
      npc_ref: ref('npc', 'npc-1'),
      decision_reasons: { significance: 'material', categories: ['communication'],
        signal_refs: [ref('npc_decision_signal', 'signal-1')],
        perceived_changes: ['Игрок обратился к NPC.'] },
      perceived_message: { source_statement_ref:
        ref('conversation_statement', 'statement-1'), perception_result_ref:
        ref('perception_result', 'perception-1') },
      public_conversation_history: [], knowledge: {},
      npc: {}, memory: {
        // Frozen N1 capture shape: exact_memory + fact_ref + fact_text.
        records: [{ fact_ref: memoryRef, source_type: 'exact_memory',
          observed_at: { whole_minutes: '1', subminute_numerator: '0',
            subminute_denominator: '1' }, fact_text: memoryFact }],
        received_messages: [],
        current_observations: [{ observation_ref: observationRef,
          source_type: 'direct_perception', fact_text: observationFact }]
      },
      allowed_references: { actor_refs: [ref('npc', 'npc-1'),
        ref('player_character', 'player-1')], entity_refs: [],
        knowledge_refs: [memoryRef, observationRef],
        combat_target_refs: [] },
      social_context: {}, available_resources: [], decision_scope: {
        conversation_mode: true, action_handoff_available: false,
        combat_handoff_available: false,
        allowed_attribute_refs: ['influence'],
        allowed_skill_refs: ['conversation'],
        allowed_check_profile_refs: ['hard'],
        allowed_duration_classes: ['domain_owned'],
        operation_contract: { emit_interaction: {} }
      }
    };
    const original = {
      schema: 'conversation_contribution_plan_v1', request_id: input.request_id,
      boundary_id: input.boundary_id, conversation_id: input.conversation_id,
      exchange_id: input.exchange_id, state_version: input.state_version,
      speaker_ref: input.npc_ref, contribution_kind: 'speech',
      speech: {
        utterance_text: `${memoryFact} На пристани никого не пропускали. ${wkFact} ${observationFact} В закрытом складе лежат три бочки. Вчера я видел князя.`,
        dominant_act: 'answer', interaction_tags: [], topic_refs: [],
        claims: [
          { claim_id: 'memory', content_summary: memoryFact,
            form: 'assertion', speaker_posture: 'believed_true',
            source_knowledge_refs: [memoryRef], mentioned_entity_refs: [] },
          { claim_id: 'unsupported-memory-claim',
            content_summary: 'На пристани никого не пропускали.',
            form: 'assertion', speaker_posture: 'believed_true',
            source_knowledge_refs: [memoryRef], mentioned_entity_refs: [] },
          { claim_id: 'wk', content_summary: wkFact,
            form: 'assertion', speaker_posture: 'believed_true',
            source_knowledge_refs: [wkRef], mentioned_entity_refs: [] },
          { claim_id: 'observation', content_summary: observationFact,
            form: 'assertion', speaker_posture: 'believed_true',
            source_knowledge_refs: [observationRef], mentioned_entity_refs: [] },
          { claim_id: 'inaccessible-wk',
            content_summary: 'В закрытом складе лежат три бочки.',
            form: 'assertion', speaker_posture: 'believed_true',
            source_knowledge_refs: [inaccessibleWkRef],
            mentioned_entity_refs: [] },
          { claim_id: 'unsupported', content_summary: 'Вчера я видел князя.',
            form: 'assertion', speaker_posture: 'believed_true',
            source_knowledge_refs: [], mentioned_entity_refs: [] }
        ], response_expectation: { kind: 'none', target_refs: [] }
      },
      primary_addressee_ref: ref('player_character', 'player-1'),
      intended_addressee_refs: [ref('player_character', 'player-1')],
      affected_actor_refs: [],
      interpretation: { intent: 'ответить', grounded_contribution: 'ответить по фактам',
        adaptation: 'literal' },
      resolution: 'automatic',
      activity: { duration_class: 'domain_owned', effort: 'none' },
      supporting_operations: [], check: null, handoff: null,
      reason: 'Ответить по известным фактам.'
    };
    const supportedClaims = original.speech.claims.filter(({ claim_id }) =>
      ['memory', 'wk', 'observation'].includes(claim_id));
    const roleRunner = { async run() {
      const corrected = structuredClone(original);
      corrected.speech.utterance_text = [memoryFact, wkFact,
        observationFact].join(' ');
      corrected.speech.claims = structuredClone(supportedClaims);
      return { output: corrected };
    } };
    const worldKnowledge = { schema: 'world_knowledge_slice_v1',
      pack_ref: 'wk:test', pack_revision: 'revision:test',
      purpose: 'conversation', coverage: [], verdict: 'supported',
      sufficiency: 'PARTIAL_KNOWLEDGE', hard_constraints: [],
      facts: [{ claim_ref: wkRef.entity_id, runtime_text: wkFact }],
      disputes: [], gaps: [] };
    const model = createLowerDvinaTraceNpcSemanticModel({ roleRunner,
      worldKnowledgeGrounder: { async ground(request) {
        return { ...request, world_knowledge: worldKnowledge };
      } } });
    const prepared = await model.prepareRequest(input);
    assert.ok(prepared.request.allowed_references.knowledge_refs.some(
      (reference) => reference.entity_kind === wkRef.entity_kind
        && reference.entity_id === wkRef.entity_id));

    const result = await model(prepared.request, { repair: {
      original_output: original,
      validation_errors: [{ category: 'semantic_grounding', retryable: true }]
    }, prepared_request_context: prepared.context });

    assert.equal(result.speech.claims.length, 3);
    assert.deepEqual(result.speech.claims.map((claim) =>
      claim.source_knowledge_refs[0]), [memoryRef, wkRef, observationRef]);
    assert.deepEqual(result.speech.claims.map(({ content_summary }) =>
      content_summary), [memoryFact, wkFact, observationFact]);
    assert.match(result.speech.utterance_text,
      /На пристани выгрузили две связки сухих дров\./u);
    assert.match(result.speech.utterance_text, /Рыбацкие сети служат для ловли рыбы\./u);
    assert.match(result.speech.utterance_text, /На очаге не видно пламени\./u);
    assert.doesNotMatch(result.speech.utterance_text,
      /никого не пропускали|закрытом складе|видел князя/u);
  });
