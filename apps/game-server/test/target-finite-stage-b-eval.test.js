import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { evaluateLowerDvinaTraceOrdinaryStageBModelOutputs as evaluate,
  validateLowerDvinaTraceOrdinaryStageBEval as valid,
  lowerDvinaTraceOrdinaryStageBQualificationCases as casesOf } from
  '../src/internal/lower-dvina-trace-ordinary-stage-b-eval.js';

const url = new URL('../../../data/world-catalogs/novgorod/live-world-runtime-v17/'
  + 'm2c-finite-only-ordinary-stage-b-successor-candidate.json', import.meta.url);

test('v17 finite Stage B qualifies only exact classes, mechanics and refusals', async () => {
  const successor = JSON.parse(await readFile(url, 'utf8'));
  const contract = successor.stage_b_classification_eval;
  assert.equal(successor.runtime_selectable, false);
  assert.equal(valid(contract), true);
  const outputs = casesOf(contract).map((probe) => ({ id: probe.id,
    resolution: probe.expected_entity ? 'materialize' : probe.allowed_resolutions[0],
    entities: probe.expected_entity ? [{ admission_class: 'common_mundane',
      semantic_descriptor: { semantic_type: probe.expected_entity.semantic_type },
      mechanics_proposal: { ...probe.expected_entity.mechanics_proposal, container: null } }] : [] }));
  assert.equal(evaluate({ eval_contract: contract, outputs }).pass, true);
  for (const probe of contract.cases) {
    const changed = outputs.map((output) => output.id !== probe.id ? output : {
      ...output, ...(probe.expected_entity
        ? { entities: [{ ...output.entities[0], semantic_descriptor: {
          semantic_type: 'unapproved_resource' } }] }
        : { resolution: 'materialize' }) });
    assert.deepEqual(evaluate({ eval_contract: contract, outputs: changed })
      .failed_case_ids, [probe.id]);
  }
  const wrongMass = outputs.map((output) => output.id !== 'reeds' ? output : {
    ...output, entities: [{ ...output.entities[0], mechanics_proposal: {
      ...output.entities[0].mechanics_proposal, mass_grams: 100 } }] });
  assert.deepEqual(evaluate({ eval_contract: contract, outputs: wrongMass })
    .failed_case_ids, ['reeds']);
  assert.equal(valid({ ...contract, cases: [] }), false);
  assert.equal(evaluate({ eval_contract: contract,
    outputs: [outputs[0], ...outputs.slice(2), outputs[0]] }).pass, false);
});
