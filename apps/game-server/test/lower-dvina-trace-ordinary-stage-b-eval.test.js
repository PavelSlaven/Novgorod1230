import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  evaluateLowerDvinaTraceOrdinaryStageBModelOutputs,
  validateLowerDvinaTraceOrdinaryStageBEval
} from '../src/internal/lower-dvina-trace-ordinary-stage-b-eval.js';
import { bindOrdinaryMaterializationPlan,
  createOrdinaryMaterializationModel } from
  '../src/runtime/ordinary-materialization-llm.js';
import { buildOrdinaryMaterializationMessages } from
  '../src/runtime/ordinary-materialization-llm.js';
import { loadLowerDvinaTraceOrdinaryStageBApproval } from
  '../src/internal/lower-dvina-trace-ordinary-stage-b-approval.js';
import { buildOrdinaryMaterializationPresenceRequest } from
  '../src/runtime/ordinary-materialization-seed-request.js';
import { describeRoleLlmCall } from '@rus/llm-runtime';
import { createLlmRoleRunnerAdapter } from '../src/adapters/llm-role-runner.js';
import { createLlmSettingsOwner } from '../src/runtime/llm-settings.js';
import { createOrdinaryMaterializationStageBQualifier } from
  '../src/runtime/ordinary-materialization-stage-b-qualification.js';
import { validateOrdinaryMaterializationPlanV1 } from '@rus/contracts';

const profileUrl = new URL('../../../data/world-catalogs/novgorod/'
  + 'lower-dvina-trace-v1/phase-m7-content/'
  + 'ordinary-materialization-profile.json', import.meta.url);
const frozenRoleRequestsUrl = new URL('../../../data/model-evals/llm-runtime/'
  + 'frozen-role-requests-v1.json', import.meta.url);

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
  const { request_timeout_ms, ...identity } = describeRoleLlmCall({
    scope: 'turn_runtime', roleId: 'ordinary_materialization',
    env: { DEEPSEEK_API_KEY: 'identity-only' },
    overrides: { temperature: 0, maxTokens: 6000 }
  });
  assert.deepEqual(approval.model_identity, identity);
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

test('ordinary materialization prompt keeps a supported free candidate materializable', () => {
  const request = presenceRequest('ложка');
  const prompt = buildOrdinaryMaterializationMessages(request)[0].content;
  assert.match(prompt, /seed_scope permits only seeded or no_change/u);
  assert.match(prompt, /resolve_presence permits materialize, absent, no_change, or authority_required/u);
  assert.match(prompt, /Decide only whether and how the supplied ordinary candidate is semantically realized/u);
  assert.match(prompt, /Lack of a pre-supplied descriptor alone is not a reason for absent/u);
  assert.match(prompt, /derive it only from candidate_query\.candidate_hint/u);
  assert.match(prompt, /general question about people, current activity, or the situation is not an ordinary item candidate/u);
  assert.match(prompt, /never turn a person, event, place, or question into an item name or item fact/u);
  assert.match(prompt, /server assembles/u);
  assert.match(prompt, /availability_class is common or context_bound/u);
  assert.match(prompt, /authority_envelope/u);
  assert.doesNotMatch(prompt, /простая верёвка|cordage/u);
  assert.doesNotMatch(prompt, /Schema-valid fallback skeleton/u);
});

test('ordinary materialization prompt exposes exact code-owned mechanics bounds', () => {
  const prompt = buildOrdinaryMaterializationMessages(presenceRequest('обломок доски'), {
    mechanicsPolicy: { policy_ref: 'mechanics', max_mass_grams: 20_000,
      allowed_external_hand_costs: [0, 1, 2],
      allowed_carry_forms: ['compact', 'regular', 'long', 'bulky'],
      max_packing_slot_cost: 16, max_quantity: 1 }
  })[0].content;
  assert.match(prompt, /mass_grams is an integer from 1 to 20000/u);
  assert.match(prompt, /external_hand_cost is exactly one of \[0,1,2\]/u);
  assert.match(prompt,
    /carry_form is exactly one of \["compact","regular","long","bulky"\]/u);
  assert.match(prompt, /packing_slot_cost is an integer from 0 to 16/u);
  assert.match(prompt, /quantity\.value is an integer from 1 to 1/u);
  assert.match(prompt, /Never invent another carry_form/u);
});

test('ordinary materialization absent prompt permits only its exact absent plan', () => {
  const source = presenceRequest('ложка');
  const request = { ...source, authority_envelope: { ...source.authority_envelope,
    selected_supporting_basis_ref: null } };
  const prompt = buildOrdinaryMaterializationMessages(request, { repair: {
    schema: 'ordinary_materialization_repair_context_v1', original_output: null,
    validation_errors: [{ path: 'resolution', keyword: 'enum' }]
  } })[0].content;
  assert.match(prompt, /Return exactly/u);
  assert.match(prompt, /"resolution":"absent"/u);
  assert.match(prompt, /Validation errors: \[\{"path":"resolution","keyword":"enum"\}\]/u);
  assert.doesNotMatch(prompt, /seed_scope|materialize|descriptor|mechanics|authority_required|no_change/u);
});

test('frozen ordinary probes carry code-owned Stage A and Stage B envelopes', async () => {
  const corpus = JSON.parse(await readFile(frozenRoleRequestsUrl, 'utf8'));
  const fixtures = corpus.fixtures.filter(({ role_id }) =>
    role_id === 'ordinary_materialization');
  for (const fixture of fixtures) {
    const request = fixture.repair ? fixture.request.request
      : JSON.parse(fixture.messages.at(-1).content);
    assert.equal(Object.hasOwn(request, 'authority_envelope'), true);
  }
  const common = fixtures.find(({ id }) => id === 'ordinary-stage-b-common-cordage');
  const commonRequest = JSON.parse(common.messages.at(-1).content);
  assert.deepEqual(commonRequest.authority_envelope.candidate, {
    semantic_type: 'cordage', functional_bucket: 'other_ordinary',
    admission_class: 'common_mundane', availability_class: 'common',
    coverage_kind: 'visible_surface', coverage_ref: 'bench'
  });
  for (const id of ['ordinary-stage-b-sword-absent',
    'ordinary-stage-b-silver-absent', 'ordinary-stage-b-letter-absent']) {
    const fixture = fixtures.find((candidate) => candidate.id === id);
    const request = JSON.parse(fixture.messages.at(-1).content);
    assert.notEqual(request.authority_envelope.candidate.admission_class,
      'common_mundane');
  }
});

test('ordinary materialization prompt maps Stage A to its candidate-free fallback', () => {
  const stageB = presenceRequest('ложка');
  const request = { ...stageB, mode: 'seed_scope', candidate_query: null,
    authority_envelope: { stage: 'seed_scope', density_bands: ['ordinary'],
      disclosure_policy_refs: ['disclosure'], group_bases: [{ basis_ref: 'basis',
        basis_state: 'committed', functional_buckets: ['other_ordinary'],
        allowed_admission_classes: ['common_mundane'], permission_refs: [] }] } };
  const prompt = buildOrdinaryMaterializationMessages(request)[0].content;
  assert.match(prompt, /seed_scope permits only seeded or no_change/u);
  assert.match(prompt, /"resolution":"seeded"/u);
  assert.match(prompt, /"descriptor":null/u);
  assert.match(prompt, /Never copy angle-bracket placeholders/u);
  assert.match(prompt, /natural Russian suitable for later player-facing prose/u);
  assert.match(prompt, /"basis_refs":\["basis"\]/u);
  assert.doesNotMatch(prompt, /ordinary_candidate_/u);
});

test('ordinary seed prompt receives a player-safe scene basis without reading refs', () => {
  const source = presenceRequest('ложка');
  const request = { ...source, mode: 'seed_scope', candidate_query: null,
    ordinary_state: { ...source.ordinary_state, seeded: false,
      density_band: null },
    authority_envelope: { stage: 'seed_scope', density_bands: ['ordinary'],
      disclosure_policy_refs: ['disclosure'], group_bases: [{
        basis_ref: 'basis', basis_state: 'committed',
        functional_buckets: ['other_ordinary'],
        allowed_admission_classes: ['common_mundane'], permission_refs: [] }] }
  };
  const prompt = buildOrdinaryMaterializationMessages(request, {
    semanticContext: { visible_scene: 'речной берег',
      sensory_details: ['У воды лежат обломки досок.'],
      visible_objects: [] }
  })[0].content;
  assert.match(prompt, /All refs and IDs are opaque/u);
  assert.match(prompt, /У воды лежат обломки досок/u);
  assert.match(prompt, /one to three concrete co-present mundane physical groups/u);
  assert.match(prompt, /Never answer with an abstract category/u);
  assert.match(prompt, /never invent a visit, owner, action, purpose, origin, or past event/u);
  assert.match(prompt, /propose one distinct new ordinary group/u);
  assert.match(prompt, /do not restate, paraphrase, combine, or summarize/u);
});

test('ordinary materialization prompt carries complete code-owned Stage B shapes', () => {
  const source = presenceRequest('любой предмет');
  const preparedBasis = 'ordinary_group_prepared';
  const request = { ...source, policy_refs: { ...source.policy_refs,
    allowed_supporting_bases: [{ basis_ref: 'generic_basis', basis_state: 'committed' },
      { basis_ref: preparedBasis, basis_state: 'prepared_seed' }] },
  ordinary_state: { ...source.ordinary_state, background_groups: [preparedBasis] },
  authority_envelope: { ...source.authority_envelope,
    allowed_supporting_bases: [{ basis_ref: 'generic_basis', basis_state: 'committed' },
      { basis_ref: preparedBasis, basis_state: 'prepared_seed' }],
    selected_supporting_basis_ref: preparedBasis } };
  const admitted = buildOrdinaryMaterializationMessages(request)[0].content;
  assert.match(admitted, /"resolution":"materialize"/u);
  assert.match(admitted, /"admission_class":"common_mundane"/u);
  assert.match(admitted, /"property_basis_ref":"property"/u);
  assert.match(admitted, /"position_ref":"bench"/u);
  assert.match(admitted, /"supporting_basis_ref":"ordinary_group_prepared"/u);
  assert.match(admitted, /"mass_grams":"<semantic_integer_mass_grams>"/u);
  assert.match(admitted, /"external_hand_cost":"<semantic_integer_external_hand_cost>"/u);
  assert.match(admitted, /"packing_slot_cost":"<semantic_integer_packing_slot_cost>"/u);
  assert.match(admitted,
    /never copy the player's intended use, action, goal, or hoped-for result/u);
  assert.doesNotMatch(admitted, /"mass_grams":1/u);
});

test('production O1 binds incomplete Flash output to its request envelope', async () => {
  const approval = await loadLowerDvinaTraceOrdinaryStageBApproval();
  const request = { ...presenceRequest('верёвка'), policy_refs: {
    ...presenceRequest('верёвка').policy_refs,
    allowed_supporting_bases: [{ basis_ref: 'stage-b', basis_state: 'committed' }]
  }, authority_envelope: { ...presenceRequest('верёвка').authority_envelope,
    allowed_supporting_bases: [{ basis_ref: 'stage-b', basis_state: 'committed' }],
    selected_supporting_basis_ref: 'stage-b'
  } };
  const roleRunner = { async run() { return { provider_record: modelIdentity(),
    output: { resolution: 'materialize', reason_code: 'found', entities: [{
      semantic_descriptor: { semantic_type: 'cordage', name: 'верёвка', facts: [] },
      presence_expectation: 'routine', supporting_basis_ref: 'stage-b',
      causal_basis: { basis_kind: 'ordinary_presence', basis_refs: ['stage-b'] },
      placement_proposal: { position_ref: 'bench' }, mechanics_proposal: {
        mass_grams: 350, external_hand_cost: 0, carry_form: 'compact',
        packing_slot_cost: 1, quantity: { value: 1, unit: 'item' }, container: null
      } }] } }; } };
  const output = await createOrdinaryMaterializationModel({ roleRunner,
    stageBApprovalReceipt: approval })(request, { repair: null });
  assert.equal(output.schema, 'ordinary_materialization_plan_v1');
  assert.equal(output.entities[0].admission_class, 'common_mundane');
  assert.equal(output.entities[0].property_basis_ref, 'property');
  assert.equal(output.entities[0].semantic_descriptor.name, 'верёвка');
});

test('ordinary assembly does not invent an omitted semantic reason', () => {
  const request = presenceRequest('верёвка');
  const plan = bindOrdinaryMaterializationPlan(request, {
    resolution: 'absent' });
  assert.equal(plan.reason_code, undefined);
  assert.notDeepEqual(validateOrdinaryMaterializationPlanV1(plan), []);
});

test('production O1 assembles a semantic Stage A no_change choice', async () => {
  const approval = await loadLowerDvinaTraceOrdinaryStageBApproval();
  const request = { ...presenceRequest('ложка'), mode: 'seed_scope',
    candidate_query: null };
  const output = await createOrdinaryMaterializationModel({
    stageBApprovalReceipt: approval, roleRunner: { async run() {
      return { provider_record: modelIdentity(), output: {
        resolution: 'no_change', reason_code: 'no_change' } };
    } }
  })(request, { repair: null });
  assert.deepEqual(output, { schema: 'ordinary_materialization_plan_v1',
    request_id: request.request_id, resolution: 'no_change',
    density_band_proposal: null, background_groups: [], entities: [],
    presence_resolutions: [], reason_code: 'no_change' });
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

test('custom O1 role uses its qualified exact identity without gameplay eval',
  async () => {
    const contract = await evalContract();
    let runner;
    const settings = createLlmSettingsOwner({ qualifyCustom: async (candidate) =>
      runner.describe({ scope: 'turn_runtime', role_id: 'ordinary_materialization',
        overrides: { temperature: 0, maxTokens: 6000 }, provider_snapshot: candidate }) });
    runner = createLlmRoleRunnerAdapter({ settings, execute: async (input) => {
      const request = JSON.parse(input.messages[1].content);
      const identity = runner.describe({ scope: input.scope, role_id: input.roleId,
        tier_id: input.tierId, overrides: input.overrides });
      return { status: 'ok', parsed_json: absentPlan(request),
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
    pending.shift().resolve({ output: absentPlan(firstRequest), provider_record: oldIdentity });
    assert.deepEqual(await first, absentPlan(firstRequest));
    const secondRequest = presenceRequest('ковш');
    const second = model(secondRequest, { repair: null });
    pending.shift().resolve({ output: absentPlan(secondRequest), provider_record: newIdentity });
    assert.deepEqual(await second, absentPlan(secondRequest));
  });

test('custom Stage B qualification uses production messages, unique case refs, and never applies settings', async () => {
  const contract = await evalContract();
  const calls = [];
  const candidate = { mode: 'custom', compatibility: 'openai_compatible',
    baseUrl: 'http://127.0.0.1:11434/v1', model: 'candidate', apiKey: null };
  const identity = { provider: 'openai_compatible', model: 'candidate',
    scope: 'turn_runtime', role_id: 'ordinary_materialization', config_hash: 'candidate-config' };
  const qualifier = createOrdinaryMaterializationStageBQualifier({
    evalContract: contract,
    roleRunner: { describe(input) { assert.deepEqual(input.provider_snapshot, candidate); return identity; },
      async run(input) { calls.push(input); const request = JSON.parse(input.messages[1].content);
        return { output: absentPlan(request), provider_record: identity }; } }
  });
  const owner = createLlmSettingsOwner({ qualifyCustom: qualifier });
  await owner.probe({ mode: 'custom', base_url: candidate.baseUrl, model: candidate.model,
    api_key: null });
  assert.equal(owner.read().mode, 'default');
  assert.equal(calls.length, contract.cases.length);
  assert.ok(calls.every((call) => call.overrides.requestTimeoutMs === 120000));
  assert.ok(calls.every((call) => call.provider_snapshot.model === 'candidate'));
  const requests = calls.map((call) => JSON.parse(call.messages[1].content));
  assert.equal(new Set(requests.map((request) => request.request_id)).size,
    contract.cases.length);
  assert.equal(new Set(requests.map((request) => request.candidate_query.candidate_key)).size,
    contract.cases.length);
  assert.equal(new Set(requests.map((request) => request.candidate_query.coverage_key)).size,
    contract.cases.length);
  for (const call of calls) {
    const request = JSON.parse(call.messages[1].content);
    assert.deepEqual(call.messages, buildOrdinaryMaterializationMessages(request));
  }
  await owner.apply({ mode: 'custom', base_url: candidate.baseUrl, model: candidate.model,
    api_key: null });
  assert.deepEqual(owner.ordinaryMaterializationIdentity(), identity);
});

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
      context_bound_permission_refs: [], allowed_supporting_bases: [{
        basis_ref: 'generic_basis', basis_state: 'committed' }] },
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
    policy_version: 'presence' }, selected_supporting_basis_ref: 'generic_basis' }).request;
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
  config_hash: 'c43b0590a85401c2' }; }
