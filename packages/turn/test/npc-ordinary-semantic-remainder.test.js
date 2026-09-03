import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveNpcOrdinarySemanticRemainder } from '../src/index.js';

const request = {
  schema: 'npc_ordinary_semantic_remainder_request_v1', request_id: 'req:1',
  npc_ref: 'npc:1', profile_ref: 'n1@1',
  observable_context: { display_label: 'рыбак', observable_cues: {},
    scene_details: ['У воды сохнут сети.'] }
};

test('N1 rejects semantically unsupported authority before commit', async () => {
  const roles = [];
  const roleRunner = { async run({ role_id }) {
    roles.push(role_id);
    if (role_id === 'npc_ordinary_semantic_remainder') return { output: {
      schema: 'npc_ordinary_semantic_remainder_proposal_v1',
      request_id: request.request_id,
      ordinary_descriptor: 'Рыбак прячет украденный нож.',
      ordinary_activity: null
    } };
    return { output: {
      schema: 'npc_ordinary_semantic_remainder_audit_v1',
      request_id: request.request_id, approved: false,
      concern_kinds: ['forbidden_authority']
    } };
  } };
  await assert.rejects(resolveNpcOrdinarySemanticRemainder({ request,
    roleRunner }), { code: 'TURN_NPC_ORDINARY_REMAINDER_SEMANTIC_REJECTED' });
  assert.deepEqual(roles, ['npc_ordinary_semantic_remainder',
    'npc_ordinary_semantic_remainder_auditor']);
});

test('N1 returns an audited observable proposal without repair cascade', async () => {
  const roles = [];
  const roleRunner = { async run({ role_id }) {
    roles.push(role_id);
    return role_id === 'npc_ordinary_semantic_remainder'
      ? { output: {
        schema: 'npc_ordinary_semantic_remainder_proposal_v1',
        request_id: request.request_id,
        ordinary_descriptor: 'Коренастый человек в мокрой рубахе.',
        ordinary_activity: null
      } }
      : { output: {
        schema: 'npc_ordinary_semantic_remainder_audit_v1',
        request_id: request.request_id, approved: true, concern_kinds: []
      } };
  } };
  const result = await resolveNpcOrdinarySemanticRemainder({ request,
    roleRunner });
  assert.equal(result.ordinary_activity, null);
  assert.deepEqual(roles, ['npc_ordinary_semantic_remainder',
    'npc_ordinary_semantic_remainder_auditor']);
});
