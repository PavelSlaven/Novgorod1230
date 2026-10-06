import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSpatialSemanticDescriptor } from '../src/spatial-semantic-remainder.js';

function request() {
  return { schema: 'rus.s1_spatial_semantic_model_request.v1', request_id: 'request:s1',
    proposal_schema: 'rus.s1_spatial_semantic_proposal.v1',
    semantic_context: { allowed_kind: 'ordinary_structure', period: '1230, Rus',
      region: 'Lower Dvina', place_type: 'shore', environment: 'wet sand',
      material_culture: 'wood and stone', ordinary_boundary: 'ordinary only' },
    approved_envelope: { kind: 'ordinary_structure', structural_variant: 'open_one_space',
      available_mechanics: [], required_semantic_requirements: ['interior_space'] },
    proposal_example: { schema: 'rus.s1_spatial_semantic_proposal.v1', request_id: 'request:s1',
      name: 'ordinary shelter', description: 'ordinary river shelter',
      semantic_requirements: ['interior_space'] } };
}

test('S1 turn boundary owns prompt and accepts only its exact proposal DTO', async () => {
  let modelRequest; let prompt;
  const result = await resolveSpatialSemanticDescriptor({ request: request(), roleRunner: {
    run: async ({ messages }) => {
      prompt = messages[0].content; modelRequest = JSON.parse(messages[1].content);
      return { output: { schema: 'rus.s1_spatial_semantic_proposal.v1', request_id: 'request:s1',
        name: 'Низкий навес', description: 'Низкий навес из ветвей.',
        semantic_requirements: ['interior_space'] } };
    }
  } });
  assert.equal(modelRequest.semantic_context.region, 'Lower Dvina');
  assert.deepEqual(modelRequest, request());
  assert.match(prompt, /ровно с такими ключами: schema, request_id, name, description, semantic_requirements/u);
  assert.match(prompt, /включи каждое значение из approved_envelope\.required_semantic_requirements/u);
  assert.match(prompt, /hazard/u);
  assert.match(prompt, /Не создавай .* опасности/u);
  assert.doesNotMatch(prompt, /Return one ordinary local concretization/u);
  assert.deepEqual(result.semantic_requirements, ['interior_space']);
  assert.equal(Object.isFrozen(result), true);
});

test('S1 turn boundary rejects extra proposal fields before materialization', async () => {
  await assert.rejects(resolveSpatialSemanticDescriptor({ request: request(), roleRunner: {
    run: async () => ({ output: { schema: 'rus.s1_spatial_semantic_proposal.v1',
      request_id: 'request:s1', name: 'Навес', description: 'Навес.',
      semantic_requirements: ['interior_space'], topology: 'forged' } })
  } }), { code: 'TURN_SPATIAL_SEMANTIC_PROPOSAL_INVALID' });
});

test('S1 live evaluation sends each validated intent outside production DTO', async () => {
  const inputs = [];
  const roleRunner = { run: async ({ messages }) => {
    inputs.push(JSON.parse(messages[1].content));
    return { output: { schema: 'rus.s1_spatial_semantic_proposal.v1', request_id: 'request:s1',
      name: 'Навес', description: 'Низкий навес.', semantic_requirements: ['interior_space'] } };
  } };
  await resolveSpatialSemanticDescriptor({ request: request(), roleRunner,
    evaluation: { case_id: 'ordinary-windbreak', intent: 'Describe a windbreak.' } });
  await resolveSpatialSemanticDescriptor({ request: request(), roleRunner,
    evaluation: { case_id: 'ordinary-shelter', intent: 'Describe a shelter.' } });
  assert.deepEqual(inputs.map(({ evaluation_intent }) => evaluation_intent),
    ['Describe a windbreak.', 'Describe a shelter.']);
  assert.ok(inputs.every((value) => value.schema === 'rus.s1_spatial_semantic_model_request.v1'
    && value.approved_envelope.required_semantic_requirements[0] === 'interior_space'
    && Object.keys(value).length === 8));
});

test('S1 receives factual compatibility without turning it into presence', async () => {
  let input; let prompt;
  await resolveSpatialSemanticDescriptor({ request: request(),
    worldKnowledge: knowledge(), roleRunner: { async run({ messages }) {
      prompt = messages[0].content;
      input = JSON.parse(messages[1].content);
      return { output: { schema: 'rus.s1_spatial_semantic_proposal.v1',
        request_id: 'request:s1', name: 'Навес', description: 'Низкий навес.',
        semantic_requirements: ['interior_space'] } };
    } } });
  assert.equal(input.world_knowledge.pack_revision, 'revision:test');
  assert.equal(Object.hasOwn(input.world_knowledge, 'context_text'), false);
  assert.match(prompt, /Совместимость не доказывает текущее наличие/u);
  assert.match(prompt, /world_knowledge — единственный фактический источник/u);
  assert.doesNotMatch(prompt, /Compatibility does not prove current presence/u);
});

function knowledge() {
  return { schema: 'world_knowledge_slice_v1', pack_ref: 'wk-pack:test',
    pack_revision: 'revision:test', coverage: [], hard_constraints: [],
    facts: [{ claim_ref: 'claim:t', runtime_text: 'обычный навес' }],
    disputes: [], gaps: [], context_text: 'FACT claim:t: обычный навес' };
}
