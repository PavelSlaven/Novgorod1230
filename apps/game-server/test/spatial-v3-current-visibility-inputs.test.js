import test from 'node:test';
import assert from 'node:assert/strict';
import { readCommittedEntityExterior, readPlayerKnowledge } from
  '../src/infrastructure/postgres/spatial-v3-current-visibility-inputs.js';

test('exterior excludes committed hidden identity', async () => {
  const transaction = { async query(_sql, params) {
    assert.deepEqual(params, ['party', 'npc']);
    return { rows: [{ identity_state: { canonical_name: 'hidden', public_role_label: 'путник',
      appearance: { coat: 'grey' } } }] };
  } };
  assert.deepEqual(await readCommittedEntityExterior({ transaction, partyId: 'party',
    placement: { entity_kind: 'npc', entity_id: 'npc' } }),
  { public_role_label: 'путник', appearance: { coat: 'grey' } });
});

test('NPC name requires exact committed self-introduction heard in full by this player', async () => {
  const statement = { statement_id: 'said', speaker_ref: { entity_kind: 'npc', entity_id: 'npc' },
    utterance_text: 'Я Влас.', audience_projection: { schema: 'conversation_audience_projection_v1',
      statement_ref: { entity_kind: 'conversation_statement', entity_id: 'said' },
      received_messages: [{ source_statement_ref: { entity_kind: 'conversation_statement',
        entity_id: 'said' }, listener_ref: { entity_kind: 'player_character', entity_id: 'actor' },
      comprehension: 'full', utterance_text: 'Я Влас.' }] } };
  const rows = [statement];
  const transaction = { async query(sql, params) {
    assert.deepEqual(params, ['party', 'npc']);
    if (sql.includes('party_npcs')) return { rows: [{ npc_id: 'npc' }] };
    assert.match(sql, /party_conversation_statements/u);
    return { rows };
  } };
  const input = { transaction, partyId: 'party', actorId: 'actor',
    placement: { entity_kind: 'npc', entity_id: 'npc' } };
  assert.deepEqual(await readPlayerKnowledge(input), { display_name: 'Влас' });
  rows.length = 0;
  assert.equal(await readPlayerKnowledge(input), null);
  rows.push(statement);
  statement.audience_projection.received_messages[0].comprehension = 'partial';
  assert.equal(await readPlayerKnowledge(input), null);
  statement.audience_projection.received_messages[0].comprehension = 'full';
  statement.audience_projection.received_messages[0].utterance_text = 'Я Еремей.';
  assert.equal(await readPlayerKnowledge(input), null);
  statement.audience_projection.received_messages[0].utterance_text = 'Я Влас.';
  statement.audience_projection.received_messages[0].listener_ref.entity_id = 'other';
  assert.equal(await readPlayerKnowledge(input), null);
  statement.audience_projection.received_messages = null;
  await assert.rejects(readPlayerKnowledge(input),
    (error) => error.details?.reason === 'player_npc_name_knowledge_required');
});
