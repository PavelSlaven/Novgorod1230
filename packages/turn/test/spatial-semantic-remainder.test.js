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
  assert.match(prompt, /exactly these keys: schema, request_id, name, description, semantic_requirements/u);
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
