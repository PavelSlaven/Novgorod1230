import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createOrdinaryMaterializationModel } from
  '../src/runtime/ordinary-materialization-llm.js';
import { loadLowerDvinaTraceOrdinaryStageBApproval } from
  '../src/internal/lower-dvina-trace-ordinary-stage-b-approval.js';
import { createOrdinaryMaterializationStageBQualifier } from
  '../src/runtime/ordinary-materialization-stage-b-qualification.js';
import { absentPlan, modelIdentity, presenceRequest } from
  './lower-dvina-trace-ordinary-stage-b-eval-fixture.js';

const profileUrl = new URL('../../../data/world-catalogs/novgorod/'
  + 'lower-dvina-trace-v1/phase-m7-content/'
  + 'ordinary-materialization-profile.json', import.meta.url);

async function evalContract() {
  const profile = JSON.parse(await readFile(profileUrl, 'utf8'));
  return profile.stage_b_classification_eval;
}

test('custom Stage B qualification rejects schema-invalid evaluator-safe output', async () => {
  const contract = await evalContract();
  const identity = modelIdentity();
  const qualifier = createOrdinaryMaterializationStageBQualifier({
    evalContract: contract,
    roleRunner: { describe() { return identity; }, async run(input) {
      const request = JSON.parse(input.messages[1].content);
      return { output: { ...absentPlan(request), unexpected: true },
        provider_record: identity };
    } }
  });
  await assert.rejects(qualifier({}), (error) => {
    assert.equal(error.code, 'LLM_SETTINGS_ORDINARY_STAGE_B_QUALIFICATION_FAILED');
    assert.deepEqual(error.details.failed_case_ids, contract.cases.map(({ id }) => id).sort());
    return true;
  });
});

test('production O1 response boundary rejects accessors without reading them',
  async () => {
    let outputReads = 0;
    let providerReads = 0;
    const hostile = {};
    Object.defineProperty(hostile, 'output', { enumerable: true,
      get() { outputReads += 1; return {}; } });
    Object.defineProperty(hostile, 'provider_record', { enumerable: true,
      get() { providerReads += 1; return modelIdentity(); } });
    const model = createOrdinaryMaterializationModel({ roleRunner: {
      async run() { return hostile; }
    }, stageBApprovalReceipt:
      await loadLowerDvinaTraceOrdinaryStageBApproval() });
    await assert.rejects(model(presenceRequest('ложка'), { repair: null }), {
      code: 'TRACE_ORDINARY_MODEL_RESPONSE_INVALID'
    });
    assert.equal(outputReads, 0);
    assert.equal(providerReads, 0);
  });

test('production O1 cutover rejects a jointly forged activation receipt', async () => {
  const contract = await evalContract();
  const approval = structuredClone(
    await loadLowerDvinaTraceOrdinaryStageBApproval());
  approval.eval_contract_digest = 'forged';
  const model = createOrdinaryMaterializationModel({ roleRunner: {
    async run() { throw new Error('must not run'); }
  }, stageBApprovalReceipt: approval });
  await assert.rejects(model.verifyStageBCutover({ eval_contract: contract }), {
    code: 'TRACE_ORDINARY_STAGE_B_EVAL_INPUT_INVALID' });
});
