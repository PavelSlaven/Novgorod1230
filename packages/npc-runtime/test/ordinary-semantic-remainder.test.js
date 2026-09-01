import assert from 'node:assert/strict';
import test from 'node:test';
import { buildNpcOrdinarySemanticRemainder,
  validateNpcOrdinarySemanticRemainder,
  validateNpcOrdinarySemanticRemainderProposal,
  validateNpcOrdinarySemanticRemainderRequest } from '../src/index.js';

const request = {
  schema: 'npc_ordinary_semantic_remainder_request_v1', request_id: 'req:1',
  npc_ref: 'npc:1', profile_ref: 'n1@1',
  observable_context: { display_label: 'рыбак', observable_cues: {},
    scene_details: ['У воды сохнут сети.'] }
};
const proposal = { schema: 'npc_ordinary_semantic_remainder_proposal_v1',
  request_id: 'req:1', ordinary_descriptor: 'Коренастый мужчина в мокрой рубахе.',
  ordinary_activity: 'Он перебирает край сети.' };

test('N1 admits only strict non-authoritative ordinary facets', () => {
  assert.equal(validateNpcOrdinarySemanticRemainderRequest(request), true);
  assert.equal(validateNpcOrdinarySemanticRemainderProposal(proposal, request), true);
  const remainder = buildNpcOrdinarySemanticRemainder({ request, proposal,
    profileRef: 'n1@1', causalBasisRefs: ['fisher@2', 'shore'] });
  assert.equal(validateNpcOrdinarySemanticRemainder(remainder), true);
  assert.equal(validateNpcOrdinarySemanticRemainderProposal({ ...proposal,
    canonical_name: 'Еремей' }, request), false);
});
