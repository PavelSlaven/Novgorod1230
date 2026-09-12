import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createLlmRoleRunnerAdapter } from '../src/adapters/llm-role-runner.js';
import { loadLowerDvinaTraceOrdinaryStageBApproval } from
  '../src/internal/lower-dvina-trace-ordinary-stage-b-approval.js';
import { buildOrdinaryMaterializationMessages,
  createOrdinaryMaterializationModel } from
  '../src/runtime/ordinary-materialization-llm.js';
import { createOrdinaryMaterializationStageBQualifier, runOrdinaryMaterializationStageBQualification } from
  '../src/runtime/ordinary-materialization-stage-b-qualification.js';
import { createLlmSettingsOwner } from '../src/runtime/llm-settings.js';
import { absentPlan, presenceRequest } from
  './lower-dvina-trace-ordinary-stage-b-eval-fixture.js';

const profileUrl = new URL('../../../data/world-catalogs/novgorod/'
  + 'lower-dvina-trace-v1/phase-m7-content/'
  + 'ordinary-materialization-profile.json', import.meta.url);

test('O1 wire omits duplicate WK prose only when the full structured slice is present', () => {
  const knowledge = { schema: 'world_knowledge_slice_v1', context_text: 'duplicate factual prose',
    facts: [{ fact_id: 'wood', claim: 'Древесина доступна.', qualifiers: ['при наличии основания'] }],
    coverage: [{ topic: 'wood', status: 'covered' }], hard_constraints: ['no hidden truth'],
    disputes: [{ topic: 'origin' }], gaps: [{ topic: 'quantity' }] };
  const request = { ...presenceRequest('жердь'), world_knowledge: knowledge };
  const before = structuredClone(request);
  const wire = JSON.parse(buildOrdinaryMaterializationMessages(request)[1].content);
  const { context_text, ...structured } = knowledge;
  assert.deepEqual(wire.world_knowledge, structured);
  assert.deepEqual(request, before);
  const incomplete = { ...knowledge }; delete incomplete.gaps;
  assert.deepEqual(JSON.parse(buildOrdinaryMaterializationMessages({ ...request,
    world_knowledge: incomplete })[1].content).world_knowledge, incomplete);
});

async function evalContract() {
  const profile = JSON.parse(await readFile(profileUrl, 'utf8'));
  return profile.stage_b_classification_eval;
}

test('custom O1 role uses its qualified exact identity without gameplay eval',
  async () => {
    const contract = await evalContract();
    let runner;
    const settings = createLlmSettingsOwner({ qualifyCustom: async (candidate) =>
      runner.describe({ scope: 'turn_runtime', role_id: 'ordinary_materialization',
        overrides: { temperature: 0, maxTokens: 20_000 }, provider_snapshot: candidate }) });
    runner = createLlmRoleRunnerAdapter({ settings, execute: async (input) => {
      const request = JSON.parse(input.messages[1].content);
      const identity = runner.describe({ scope: input.scope, role_id: input.roleId,
        tier_id: input.tierId, overrides: input.overrides });
      return { status: 'ok', parsed_json: { ...absentPlan(request),
        semantic_materialization_kind: 'standalone_item',
        semantic_admission_class: 'common_mundane' },
        provider: identity.provider, model: identity.model, scope: input.scope,
        role_id: input.roleId, tier_id: input.tierId, durationMs: 1,
        config_hash: identity.config_hash };
    } });
    await settings.apply({ mode: 'custom', base_url: 'http://127.0.0.1:11434/v1',
      model: 'local-model', api_key: null });
    const approval = await loadLowerDvinaTraceOrdinaryStageBApproval();
    const model = createOrdinaryMaterializationModel({ roleRunner: runner,
      stageBApprovalReceipt: approval,
      qualifiedO1Identity: () => settings.ordinaryMaterializationIdentity() });
    await model.verifyStageBCutover({ eval_contract: contract });
    assert.deepEqual(await model(presenceRequest('ложка'), { repair: null }),
      absentPlan(presenceRequest('ложка')));
    await settings.apply({ mode: 'custom', base_url: 'http://127.0.0.1:11434/v1',
      model: 'other-local-model', api_key: null });
    assert.deepEqual(await model(presenceRequest('ковш'), { repair: null }),
      absentPlan(presenceRequest('ковш')));
  });

test('custom O1 call keeps its approved identity snapshot while it is in flight',
  async () => {
    const approval = await loadLowerDvinaTraceOrdinaryStageBApproval();
    const oldIdentity = { provider: 'openai_compatible', model: 'old-model',
      scope: 'turn_runtime', role_id: 'ordinary_materialization', config_hash: 'old' };
    const newIdentity = { ...oldIdentity, model: 'new-model', config_hash: 'new' };
    let current = oldIdentity;
    const pending = [];
    const model = createOrdinaryMaterializationModel({ stageBApprovalReceipt: approval,
      qualifiedO1Identity: () => current,
      roleRunner: { isCustomProvider() { return true; }, run(input) {
        return new Promise((resolve) => pending.push({ input, resolve }));
      } } });
    const firstRequest = presenceRequest('ложка');
    const first = model(firstRequest, { repair: null });
    current = newIdentity;
    pending.shift().resolve({ output: { ...absentPlan(firstRequest),
      semantic_materialization_kind: 'standalone_item',
      semantic_admission_class: 'common_mundane' }, provider_record: oldIdentity });
    assert.deepEqual(await first, absentPlan(firstRequest));
    const secondRequest = presenceRequest('ковш');
    const second = model(secondRequest, { repair: null });
    pending.shift().resolve({ output: { ...absentPlan(secondRequest),
      semantic_materialization_kind: 'standalone_item',
      semantic_admission_class: 'common_mundane' }, provider_record: newIdentity });
    assert.deepEqual(await second, absentPlan(secondRequest));
  });

for (const semanticType of ['cordage', null, undefined]) test(`custom Stage B qualification validates semantic type (${semanticType})`, async () => {
  const contract = await evalContract();
  const calls = [];
  let activeCalls = 0; let maxActiveCalls = 0;
  const candidate = { mode: 'custom', compatibility: 'openai_compatible',
    baseUrl: 'http://127.0.0.1:11434/v1', model: 'candidate', apiKey: null };
  const identity = { provider: 'openai_compatible', model: 'candidate',
    scope: 'turn_runtime', role_id: 'ordinary_materialization',
    config_hash: 'candidate-config' };
  const nonItems = ['boot-print-trace', 'puddle-surface',
    'smoke-condition', 'shadow-observation'];
  const roleRunner = {
      describe(input) {
        assert.deepEqual(input.provider_snapshot, candidate);
        return identity;
      },
      async run(input) {
        activeCalls += 1;
        maxActiveCalls = Math.max(maxActiveCalls, activeCalls);
        await Promise.resolve();
        activeCalls -= 1;
        calls.push(input);
        const request = JSON.parse(input.messages[1].content);
        const positive = request.request_id.endsWith('common-mundane-positive');
        return { output: positive ? {
          resolution: 'materialize',
          semantic_materialization_kind: 'standalone_item',
          semantic_admission_class: 'common_mundane', reason_code: 'ordinary_present',
          entities: [{ ...(semanticType === undefined ? {} : {
            semantic_type: semanticType }), name: 'верёвка',
          presence_expectation: 'routine',
          mechanics_proposal: { mass_grams: 350, external_hand_cost: 0,
            carry_form: 'compact', packing_slot_cost: 1,
            quantity: { value: 1, unit: 'item' }, container: null } }]
        } : { ...absentPlan(request),
          semantic_materialization_kind: nonItems.some((id) =>
            request.request_id.includes(id)) ? 'non_item_detail' : 'standalone_item',
          semantic_admission_class: 'common_mundane' }, provider_record: identity };
      }
    };
  const qualifier = createOrdinaryMaterializationStageBQualifier({ evalContract: contract, roleRunner });
  const owner = createLlmSettingsOwner({ qualifyCustom: qualifier });
  if (semanticType !== 'cordage') {
    await assert.rejects(owner.probe({ mode: 'custom', base_url: candidate.baseUrl,
      model: candidate.model, api_key: null }), { code: 'LLM_SETTINGS_ORDINARY_STAGE_B_QUALIFICATION_FAILED' });
    assert.equal(calls.length, contract.cases.length + 6);
    assert.equal(calls.filter(({ repair }) => repair).length, 1);
    return;
  }
  await owner.probe({ mode: 'custom', base_url: candidate.baseUrl,
    model: candidate.model, api_key: null });
  assert.equal(owner.read().mode, 'local');
  assert.equal(calls.length, contract.cases.length + 5);
  assert.equal(maxActiveCalls, 1);
  assert.ok(calls.every((call) => call.overrides.requestTimeoutMs === 120000));
  assert.ok(calls.every((call) => call.provider_snapshot.model === 'candidate'));
  const requests = calls.map((call) => JSON.parse(call.messages[1].content));
  assert.equal(new Set(requests.map(({ request_id }) => request_id)).size,
    contract.cases.length + 5);
  assert.equal(new Set(requests.map(({ candidate_query }) =>
    candidate_query.candidate_key)).size, contract.cases.length + 5);
  assert.equal(new Set(requests.map(({ candidate_query }) =>
    candidate_query.coverage_key)).size, contract.cases.length + 5);
  for (const call of calls) {
    const request = JSON.parse(call.messages[1].content);
    assert.deepEqual(call.messages, buildOrdinaryMaterializationMessages(request,
      { mechanicsPolicy: { policy_ref: 'stage-b', max_mass_grams: 20_000,
        allowed_external_hand_costs: [0, 1, 2],
        allowed_carry_forms: ['compact', 'regular', 'long', 'bulky'],
        max_packing_slot_cost: 16, max_quantity: 1 } }));
    assert.deepEqual(request.authority_envelope.candidate, {
      semantic_type: 'ordinary_object_candidate', functional_bucket: 'other_ordinary',
      admission_class: 'common_mundane', availability_class: 'common',
      coverage_kind: 'visible_surface', coverage_ref: `stage-b:${request.request_id
        .replace('llm-settings:ordinary-stage-b:', '')}`
    });
    assert.equal(request.authority_envelope.selected_supporting_basis_ref, 'stage-b');
  }
  await owner.apply({ mode: 'custom', base_url: candidate.baseUrl,
    model: candidate.model, api_key: null });
  assert.deepEqual(owner.ordinaryMaterializationIdentity(), identity);
  const result = await runOrdinaryMaterializationStageBQualification({ roleRunner, evalContract: contract, candidate });
  assert.equal(result.report.pass, true);
  assert.equal(result.outputs.find(({ id }) => id === 'common-mundane-positive')
    .entities[0].semantic_descriptor.semantic_type, semanticType);
  assert.equal(calls.some(({ repair }) => repair), false);
});
