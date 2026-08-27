import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  evaluateLowerDvinaTraceOrdinaryStageBModelOutputs,
  validateLowerDvinaTraceOrdinaryStageBEval
} from '../src/internal/lower-dvina-trace-ordinary-stage-b-eval.js';
import { createOrdinaryMaterializationModel } from
  '../src/runtime/ordinary-materialization-llm.js';
import { loadLowerDvinaTraceOrdinaryStageBApproval } from
  '../src/internal/lower-dvina-trace-ordinary-stage-b-approval.js';
import { buildOrdinaryMaterializationPresenceRequest } from
  '../src/runtime/ordinary-materialization-seed-request.js';
import { describeRoleLlmCall } from '@rus/llm-runtime';
import { createLlmRoleRunnerAdapter } from '../src/adapters/llm-role-runner.js';
import { createLlmSettingsOwner } from '../src/runtime/llm-settings.js';

const profileUrl = new URL('../../../data/world-catalogs/novgorod/'
  + 'lower-dvina-trace-v1/phase-m7-content/'
  + 'ordinary-materialization-profile.json', import.meta.url);

async function evalContract() {
  const profile = JSON.parse(await readFile(profileUrl, 'utf8'));
  return profile.stage_b_classification_eval;
}

test('active O1 cutover pins the complete adversarial Stage B corpus', async () => {
  const contract = await evalContract();
  assert.equal(validateLowerDvinaTraceOrdinaryStageBEval(contract), true);
  assert.deepEqual(contract.cases.map(({ id }) => id).sort(), [
    'anachronism', 'evidence-clue', 'letter-document',
    'misleading-common-name', 'significant-hidden', 'silver-currency',
    'sword-weapon'
  ]);
  const outputs = contract.cases.map(({ id, allowed_resolutions }) => ({
    id, resolution: allowed_resolutions[0], entities: []
  }));
  assert.deepEqual(evaluateLowerDvinaTraceOrdinaryStageBModelOutputs({
    eval_contract: contract, outputs
  }), { pass: true, failed_case_ids: [] });
  const approval = await loadLowerDvinaTraceOrdinaryStageBApproval();
  assert.deepEqual(approval.model_identity, describeRoleLlmCall({
    scope: 'turn_runtime', roleId: 'ordinary_materialization',
    env: { DEEPSEEK_API_KEY: 'identity-only' },
    overrides: { temperature: 0, maxTokens: 6000 }
  }));
});

test('Stage B eval catches sensitive materialization hidden behind common fields', async () => {
  const contract = await evalContract();
  for (const probe of contract.cases) {
    const outputs = contract.cases.map(({ id, allowed_resolutions }) => ({
      id, resolution: allowed_resolutions[0], entities: []
    }));
    const output = outputs.find(({ id }) => id === probe.id);
    output.resolution = 'materialize';
    output.entities = [{ authority_class: 'ordinary',
      admission_class: 'common_mundane', functional_bucket: 'household',
      semantic_descriptor: { name: probe.query } }];
    const report = evaluateLowerDvinaTraceOrdinaryStageBModelOutputs({
      eval_contract: contract, outputs
    });
    assert.equal(report.pass, false, probe.id);
    assert.deepEqual(report.failed_case_ids, [probe.id]);
  }
});

test('Stage B eval boundary rejects accessors without reading them', async () => {
  const contract = await evalContract();
  let reads = 0;
  const hostile = {};
  Object.defineProperty(hostile, 'eval_contract', { enumerable: true,
    get() { reads += 1; return contract; } });
  Object.defineProperty(hostile, 'outputs', { enumerable: true, value: [] });
  const report = evaluateLowerDvinaTraceOrdinaryStageBModelOutputs(hostile);
  assert.equal(report.pass, false);
  assert.equal(reads, 0);
});

test('production O1 model verifies the activation receipt without live probes',
  async () => {
    const contract = await evalContract();
    const approval = await loadLowerDvinaTraceOrdinaryStageBApproval();
    const calls = [];
    const roleRunner = { describe() { return modelIdentity(); }, async run(input) {
      calls.push(input);
      const request = JSON.parse(input.messages[1].content);
      return { output: absentPlan(request), provider_record: modelIdentity() };
    } };
    const model = createOrdinaryMaterializationModel({ roleRunner,
      stageBApprovalReceipt: approval });
    const receipt = await model.verifyStageBCutover({
      eval_contract: contract });
    assert.equal(receipt.schema,
      'rus.ordinary_materialization_stage_b_approval_receipt.v1');
    assert.equal(receipt.model_identity.config_hash, modelIdentity().config_hash);
    assert.equal(calls.length, 0, 'gameplay cutover performs no eval calls');
    const request = presenceRequest('ложка');
    await model(request, { repair: null });
    await model(request, { repair: { schema:
      'ordinary_materialization_repair_context_v1', original_output: null,
    validation_errors: [{ path: 'resolution', keyword: 'enum' }] } });
    assert.equal(calls.length, 2, 'one normal call and one structural repair');
    assert.match(calls[1].messages[0].content, /single structural repair/u);
    await assert.rejects(model(request, { repair: { schema:
      'ordinary_materialization_repair_context_v1', original_output: null,
    validation_errors: [{ path: 'resolution', keyword: 'enum' }] } }), {
      code: 'TRACE_ORDINARY_MODEL_CALL_SEQUENCE_INVALID'
    });
    assert.equal(calls.length, 2, 'a repeated direct repair never reaches the LLM');
  });

test('custom O1 role requires its exact approved Stage B receipt identity',
  async () => {
    const contract = await evalContract();
    const settings = createLlmSettingsOwner();
    settings.apply({ mode: 'custom', base_url: 'http://127.0.0.1:11434/v1',
      model: 'local-model', api_key: null });
    let runner;
    runner = createLlmRoleRunnerAdapter({ settings, execute: async (input) => {
      const request = JSON.parse(input.messages[1].content);
      const identity = runner.describe({ scope: input.scope, role_id: input.roleId,
        tier_id: input.tierId, overrides: input.overrides });
      return { status: 'ok', parsed_json: absentPlan(request),
        provider: identity.provider, model: identity.model, scope: input.scope,
        role_id: input.roleId, tier_id: input.tierId, durationMs: 1,
        config_hash: identity.config_hash };
    } });
    const defaultReceipt = await loadLowerDvinaTraceOrdinaryStageBApproval();
    const rejected = createOrdinaryMaterializationModel({ roleRunner: runner,
      stageBApprovalReceipt: defaultReceipt });
    await assert.rejects(rejected.verifyStageBCutover({ eval_contract: contract }), {
      code: 'TRACE_ORDINARY_MODEL_CONFIG_DRIFT' });
    const approval = structuredClone(defaultReceipt);
    approval.model_identity = runner.describe({ scope: 'turn_runtime',
      role_id: 'ordinary_materialization', overrides: { temperature: 0, maxTokens: 6000 } });
    const model = createOrdinaryMaterializationModel({ roleRunner: runner,
      stageBApprovalReceipt: approval });
    await model.verifyStageBCutover({ eval_contract: contract });
    assert.deepEqual(await model(presenceRequest('ложка'), { repair: null }),
      absentPlan(presenceRequest('ложка')));
    settings.apply({ mode: 'custom', base_url: 'http://127.0.0.1:11434/v1',
      model: 'other-local-model', api_key: null });
    await assert.rejects(model(presenceRequest('ковш'), { repair: null }), {
      code: 'TRACE_ORDINARY_MODEL_CONFIG_DRIFT' });
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

function presenceRequest(query) {
  const scope_ref = { entity_kind: 'g6', entity_id: 'scope' };
  return buildOrdinaryMaterializationPresenceRequest({ objective_context: {
    request_id: 'turn:eval:ordinary:presence', scope_ref: { ...scope_ref },
    context_refs: { period_ref: 'period', region_ref: 'region',
      function_refs: [], environment_refs: [], occupation_household_refs: [],
      economic_context_ref: 'economy', occupancy_state_ref: 'occupied',
      material_culture_refs: [], property_context_ref: 'property' },
    policy_refs: { authority_policy_ref: 'authority',
      density_policy_ref: 'density', ordinary_presence_policy_ref: 'presence',
      runtime_item_mechanics_policy_ref: 'mechanics',
      allowed_admission_classes: ['common_mundane'],
      context_bound_permission_refs: [], allowed_supporting_bases: [] },
    ordinary_state: { seeded: true, density_band: 'ordinary',
      remaining_identity_budget: 1, background_groups: [],
      presence_resolutions: [], closed_observation_scopes: [] },
    technical_limits: { max_new_entities: 1, max_new_background_groups: 1,
      max_resolution_records: 4 }, ordinary_state_version: 1,
    property_placement_context: { scope_ref: { ...scope_ref }, item_kind: 'man_made',
      property_catalog_version_ref: 'property-v1',
      placement_catalog_version_ref: 'placement-v1', personal_communal_refs: [],
      occupied_site_refs: ['house'], unowned_cause_refs: [],
      placement_context_refs: ['scene'], property_catalog: [{
        property_basis_ref: 'property', state: 'committed',
        scope_ref: { ...scope_ref },
        basis_class: 'occupied_site_default', source_ref: 'house',
        unowned_cause_ref: null }], placement_catalog: [{ position_ref: 'bench',
        state: 'committed', scope_ref: { ...scope_ref },
        g6_ref: 'scope', containment_depth: 1,
        placement_context_ref: 'scene' }] }
  }, candidate_context: { normalized_candidate_ref: 'ordinary-household',
    normalizer_version: 'normalizer-v1', semantic_type: 'household_tool',
    candidate_hint: query, functional_bucket: 'household',
    admission_class: 'common_mundane', availability_class: 'common',
    coverage_kind: 'visible_surface', coverage_ref: 'surface',
    policy_version: 'presence' } }).request;
}
function absentPlan(request) { return {
  schema: 'ordinary_materialization_plan_v1', request_id: request.request_id,
  resolution: 'absent', density_band_proposal: null, background_groups: [],
  entities: [], presence_resolutions: [{
    candidate_key: request.candidate_query.candidate_key,
    coverage_key: request.candidate_query.coverage_key,
    resolution: 'absent' }], reason_code: 'eval_absent' };
}
function modelIdentity() { return { provider: 'deepseek', model: 'deepseek-v4-flash',
  scope: 'turn_runtime', role_id: 'ordinary_materialization',
  config_hash: 'af6b22db5449f13e' }; }
