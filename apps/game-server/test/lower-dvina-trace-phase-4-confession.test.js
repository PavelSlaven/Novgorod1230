import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyRatshaPlan } from
  '../src/runtime/lower-dvina-trace-m2-conversation-plans.js';
import { projectPhase4Confession } from
  '../src/infrastructure/postgres/lower-dvina-trace-phase-4-confession-state.js';
import { npcSpeechPlan } from './lower-dvina-trace-m2-conversation-fixture.js';

test('Ratsha confession remains sourced evidence instead of objective truth', () => {
  const assertionId = 'trace_ld_v1_assertion_ratsha_confession';
  const plan = npcSpeechPlan({ request_id: 'request-1', boundary_id: 'b-1',
    conversation_id: 'c-1', exchange_id: 'e-1', state_version: 1,
    npc_ref: { entity_kind: 'npc', entity_id: 'ratsha-1' },
    public_conversation_history: [] }, {
    utteranceText: 'Я получил приказ забрать сумку.', dominantAct: 'confess',
    interactionTags: ['surrender'], supportingOperations: [
      { op: 'commit_surrender' }], claims: [{ claim_id: assertionId,
      content_summary: 'Ратша признаёт полученный приказ.', form: 'assertion',
      speaker_posture: 'believed_true', source_knowledge_refs: [],
      mentioned_entity_refs: [] }]
  });
  assert.equal(classifyRatshaPlan(plan, {
    confessionAssertionId: assertionId }).confessionClaimId, assertionId);

  const state = { party_id: 'party-1', actor_id: 'player-1',
    interactions: [], knowledge: [] };
  projectPhase4Confession({ state, turnNumber: 4,
    contracts: { actors: { ratsha_storehouse_helper: {
      instance_id: 'ratsha-1' } } }, confession: {
      statement_ref: 'statement-1', required_audience_ids: [],
      source_statement_ref: { entity_kind: 'conversation_statement',
        entity_id: 'statement-1' }, assertion: { assertion_id: assertionId }
    } });
  assert.equal(state.interactions[0].truth_projection, 'forbidden');
  assert.deepEqual(state.knowledge[0].evidence_refs, ['statement-1']);
});
