import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  evaluateLowerDvinaTraceOrdinaryStageBModelOutputs,
  validateLowerDvinaTraceOrdinaryStageBEval
} from '../src/internal/lower-dvina-trace-ordinary-stage-b-eval.js';
import { createOrdinaryMaterializationModel } from
  '../src/runtime/ordinary-materialization-llm.js';
import { buildOrdinaryMaterializationPresenceRequest } from
  '../src/runtime/ordinary-materialization-seed-request.js';

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

test('production O1 model runs the full eval on one exact model configuration',
  async () => {
    const contract = await evalContract();
    const calls = [];
    const roleRunner = { async run(input) {
      calls.push(input);
      const request = JSON.parse(input.messages[1].content);
      const probe = contract.cases.find(({ query }) =>
        query === request.candidate_query.candidate_hint);
      return { output: absentPlan(request), provider_record: modelIdentity() };
    } };
    const model = createOrdinaryMaterializationModel({ roleRunner });
    const requests = contract.cases.map((probe) => ({ id: probe.id,
      request: presenceRequest(probe.query, probe.id) }));
    const receipt = await model.verifyStageBCutover({
      eval_contract: contract, requests });
    assert.equal(receipt.schema,
      'rus.ordinary_materialization_stage_b_eval_receipt.v1');
    assert.equal(receipt.model_identity.config_hash, 'config-hash');
    assert.equal(calls.length, contract.cases.length);
    await model.verifyStageBCutover({ eval_contract: contract, requests });
    assert.equal(calls.length, contract.cases.length,
      'an exact receipt reuses the evaluated model/config identity');
    await assert.rejects(model(requests[0].request, { repair: {
      original_output: null, validation_errors: ['forged'] } }), {
      code: 'TRACE_ORDINARY_MODEL_REPAIR_DISABLED'
    });
    assert.equal(calls.length, contract.cases.length,
      'production O1 never invokes an unevaluated repair role');
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
    } });
    await assert.rejects(model(presenceRequest('ложка'), { repair: null }), {
      code: 'TRACE_ORDINARY_MODEL_RESPONSE_INVALID'
    });
    assert.equal(outputReads, 0);
    assert.equal(providerReads, 0);
  });

test('production O1 cutover rejects one sensitive materialization', async () => {
  const contract = await evalContract();
  const roleRunner = { async run(input) {
    const request = JSON.parse(input.messages[1].content);
    const output = absentPlan(request);
    if (request.candidate_query.candidate_hint === contract.cases[0].query) {
      output.resolution = 'materialize';
      output.entities = [{ authority_class: 'ordinary' }];
      output.presence_resolutions = [];
    }
    return { output, provider_record: modelIdentity() };
  } };
  const model = createOrdinaryMaterializationModel({ roleRunner });
  await assert.rejects(model.verifyStageBCutover({ eval_contract: contract,
    requests: contract.cases.map((probe) => ({ id: probe.id,
      request: presenceRequest(probe.query, probe.id) })) }), {
    code: 'TRACE_ORDINARY_STAGE_B_EVAL_FAILED'
  });
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
function modelIdentity() { return { provider: 'deepseek', model: 'model',
  scope: 'turn_runtime', role_id: 'ordinary_materialization',
  config_hash: 'config-hash' }; }
