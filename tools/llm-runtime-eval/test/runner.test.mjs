import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { classifyPlannerEvalFailure, runFrozenRoleEval } from '../src/runner.mjs';
import { createLowerDvinaTraceWorldProcessStepModel } from
  '../../../apps/game-server/src/runtime/lower-dvina-trace-world-process-llm.js';

const corpus = JSON.parse(await readFile(new URL('../../../data/model-evals/llm-runtime/frozen-role-requests-v1.json', import.meta.url), 'utf8'));

function providerOutput(fixture) {
  const output = fixture.expected_output;
  if (!fixture.role_id.startsWith('npc_autonomous_decider')) return output;
  const semantic = { interpretation: output.interpretation,
    resolution: output.resolution, reason_code: output.reason_code,
    reason: output.reason };
  if (output.resolution === 'domain_request') return { ...semantic,
    operation_choice: `${output.operations[0].op}:0` };
  if (output.resolution === 'generic_check') return { ...semantic,
    activity: { duration_class: output.activity.duration_class,
      effort: output.activity.effort }, check: output.check };
  return { ...semantic, goal_result: output.goal_result,
    activity: { duration_class: output.activity.duration_class,
      effort: output.activity.effort }, operations: output.operations };
}

test('frozen corpus runs through runtime override and reports deterministic aggregates', async () => {
  assert.equal(corpus.corpus_version, 20);
  const outputs = corpus.fixtures.map(providerOutput);
  const server = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    const output = outputs.shift();
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 2, completion_tokens: 3 } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const report = await runFrozenRoleEval({ corpus, runtimeProviderOverride: { compatibility: 'openai_compatible', baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fixture-model' }, metadata: {
      git: { checkout_sha: 'fixture-sha', dirty: false },
      corpus: { path: 'data/model-evals/llm-runtime/frozen-role-requests-v1.json', version: 19 }
    } });
    assert.equal(report.fixture_count, 28);
    assert.equal(report.aggregates.total.passed, 28);
    assert.equal(report.aggregates.total.errors, 0);
    assert.equal(report.aggregates.total.scored, 28);
    assert.equal(report.aggregates.total.unscored, 0);
    assert.equal(report.aggregates.total.automated_passed, 28);
    assert.equal(report.aggregates.total.quality_denominator, 28);
    assert.equal(report.aggregates.total.repairs, 8);
    assert.equal(report.aggregates.total.input_tokens, 56);
    assert.equal(report.aggregates.total.output_tokens, 84);
    assert.ok(report.aggregates.total.p95_ms >= report.aggregates.total.p50_ms);
    assert.deepEqual(report.metadata.execution, { passes: 1, concurrency: 1 });
    assert.deepEqual(report.metadata.git, { checkout_sha: 'fixture-sha', dirty: false });
    assert.deepEqual(report.metadata.corpus, {
      path: 'data/model-evals/llm-runtime/frozen-role-requests-v1.json', version: 19
    });
    assert.deepEqual(report.metadata.role_config_policy.find(({ role_id }) => role_id === 'turn_step_planner'), {
      scope: 'turn_runtime', role_id: 'turn_step_planner', provider: 'openai_compatible', model: 'fixture-model',
      config_hash: report.results.find(({ role_id }) => role_id === 'turn_step_planner').config_hash,
      request_timeout_ms: 10000, thinking: 'disabled', reasoning_effort: null, max_tokens: 8000,
      context_budget: { targetInputTokens: 100000, comfortableInputTokens: 220000,
        hardInputLimitTokens: 600000, reserveOutputTokens: 8000, reserveRepairTokens: 30000 }
    });
    assert.equal(report.results.every(({ config_hash }) => typeof config_hash === 'string' && config_hash.length > 0), true);
    for (const roleId of ['gameplay_narrator', 'gameplay_narrator_format_repair',
      'gameplay_narrator_auditor', 'gameplay_narrator_semantic_repair']) {
      const policy = report.metadata.role_config_policy.find((entry) => entry.role_id === roleId);
      assert.deepEqual([policy.thinking, policy.reasoning_effort], ['disabled', null], roleId);
    }
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('autonomous eval scores the production-assembled plan, not the provider fragment', async () => {
  const fixture = corpus.fixtures.find(({ id }) =>
    id === 'npc-autonomous-world-process');
  const semanticChoice = {
    interpretation: { npc_goal: 'разжечь огонь',
      grounded_attempt: 'использовать топливо и кресало', adaptation: 'literal' },
    resolution: 'domain_request',
    operation_choice: 'request_world_process:0',
    reason_code: 'local_fire_needed', reason: 'Нужен огонь.'
  };
  const server = createServer(async (request, response) => {
    for await (const _ of request) {}
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: {
      content: JSON.stringify(semanticChoice)
    } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const report = await runFrozenRoleEval({ corpus: { ...corpus,
      fixtures: [fixture] }, runtimeProviderOverride: {
      compatibility: 'openai_compatible',
      baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fixture-model'
    } });
    assert.equal(report.results[0].pass, true);
    assert.equal(report.results[0].valid, true);
    assert.equal(report.results[0].llm_calls, 1);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('autonomous eval records its single bounded production repair', async () => {
  const fixture = corpus.fixtures.find(({ id }) =>
    id === 'npc-autonomous-world-process');
  const outputs = [{}, {
    interpretation: { npc_goal: 'разжечь огонь',
      grounded_attempt: 'использовать топливо и кресало', adaptation: 'literal' },
    resolution: 'domain_request',
    operation_choice: 'request_world_process:0',
    reason_code: 'local_fire_needed', reason: 'Нужен огонь.'
  }];
  let calls = 0;
  const server = createServer(async (request, response) => {
    for await (const _ of request) {}
    calls += 1;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: {
      content: JSON.stringify(outputs.shift())
    } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const report = await runFrozenRoleEval({ corpus: { ...corpus,
      fixtures: [fixture] }, runtimeProviderOverride: {
      compatibility: 'openai_compatible',
      baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fixture-model'
    } });
    assert.equal(calls, 2);
    assert.equal(report.results[0].pass, true);
    assert.equal(report.results[0].repair_calls, 1);
    assert.equal(report.aggregates.total.repairs, 1);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('autonomous eval fails after one invalid semantic repair', async () => {
  const fixture = corpus.fixtures.find(({ id }) =>
    id === 'npc-autonomous-world-process');
  let calls = 0;
  const server = createServer(async (request, response) => {
    for await (const _ of request) {}
    calls += 1;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { content: '{}' } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const report = await runFrozenRoleEval({ corpus: { ...corpus,
      fixtures: [fixture] }, runtimeProviderOverride: {
      compatibility: 'openai_compatible',
      baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fixture-model'
    } });
    assert.equal(calls, 2);
    assert.equal(report.results[0].pass, false);
    assert.equal(report.results[0].repair_calls, 1);
    assert.ok(report.results[0].errors.includes('validator:npc_step_plan'));
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('combat eval records its single bounded production repair', async () => {
  const fixture = corpus.fixtures.find(({ id }) => id === 'npc-combat-engage');
  const outputs = [{}, fixture.expected_output];
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: {
      content: JSON.stringify(outputs.shift())
    } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const report = await runFrozenRoleEval({ corpus: { ...corpus,
      fixtures: [fixture] }, runtimeProviderOverride: {
      compatibility: 'openai_compatible',
      baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fixture-model'
    } });
    assert.equal(requests.length, 2);
    assert.equal(requests.every(({ max_tokens }) => max_tokens === 4000), true);
    assert.equal(report.results[0].pass, true);
    assert.equal(report.results[0].valid, true);
    assert.equal(report.results[0].llm_calls, 2);
    assert.equal(report.results[0].repair_calls, 1);
    assert.equal(report.aggregates.total.repairs, 1);
    assert.equal(report.metadata.role_config_policy.find(({ role_id }) =>
      role_id === 'npc_combat_decider').max_tokens, 4000);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('combat eval fails after one invalid production repair', async () => {
  const fixture = corpus.fixtures.find(({ id }) => id === 'npc-combat-engage');
  let calls = 0;
  const server = createServer(async (request, response) => {
    for await (const _ of request) {}
    calls += 1;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { content: '{}' } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const report = await runFrozenRoleEval({ corpus: { ...corpus,
      fixtures: [fixture] }, runtimeProviderOverride: {
      compatibility: 'openai_compatible',
      baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fixture-model'
    } });
    assert.equal(calls, 2);
    assert.equal(report.results[0].pass, false);
    assert.equal(report.results[0].valid, false);
    assert.equal(report.results[0].llm_calls, 2);
    assert.equal(report.results[0].repair_calls, 1);
    assert.ok(report.results[0].errors.includes('validator:npc_combat_plan'));
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('provider-ok invalid plan counts as validator failure and error in role/model aggregates', async () => {
  const fixture = corpus.fixtures.find(({ validator }) =>
    validator === 'turn_step_plan');
  const evalCorpus = { ...corpus, fixtures: [fixture, { ...fixture, id: 'planner-invalid', repair: true },
    { ...fixture, id: 'planner-rubric' }, { ...fixture, id: 'planner-schema' }] };
  const outputs = [fixture.expected_output, {}, { ...fixture.expected_output, reason: 'bird_eye' }, []];
  const server = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(outputs.shift()) } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const report = await runFrozenRoleEval({ corpus: evalCorpus,
      runtimeProviderOverride: { compatibility: 'openai_compatible', baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fixture-model' } });
    const summary = report.aggregates.by_role.turn_step_planner;
    assert.equal(report.results[1].status, 'ok');
    assert.ok(report.results[1].errors.includes('validator:turn_step_plan'));
    assert.equal(summary.errors, 3);
    assert.equal(summary.error_rate, .75);
    assert.equal(summary.schema_failures, 1);
    assert.equal(summary.schema_failure_rate, .25);
    assert.equal(summary.validator_failures, 1);
    assert.equal(summary.validator_failure_rate, .25);
    assert.equal(summary.rubric_failures, 1);
    assert.equal(summary.rubric_failure_rate, .25);
    assert.equal(report.aggregates.by_model['fixture-model'].errors, 3);
    assert.equal(report.aggregates.by_role_model.turn_step_planner['fixture-model'].validator_failures, 1);
    assert.equal(report.aggregates.by_repair.repair.errors, 1);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('planner fixture uses one production repair only after production validation rejects primary', async () => {
  const fixture = corpus.fixtures.find(({ id }) => id === 'planner-reality-limited');
  const invalidPrimary = structuredClone(fixture.expected_output);
  invalidPrimary.continuation = {
    remaining_intent: 'осмотреть окрестности',
    depends_on_refs: ['unknown-ref']
  };
  const outputs = [invalidPrimary, fixture.expected_output];
  let calls = 0;
  const server = createServer(async (request, response) => {
    for await (const _ of request) {}
    calls += 1;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: {
      content: JSON.stringify(outputs.shift())
    } }], usage: { prompt_tokens: 2, completion_tokens: 3 } }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const report = await runFrozenRoleEval({ corpus: { ...corpus,
      fixtures: [fixture] }, runtimeProviderOverride: {
      compatibility: 'openai_compatible',
      baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fixture-model'
    } });
    const result = report.results[0];
    assert.equal(calls, 2);
    assert.equal(result.pass, true);
    assert.equal(result.workflow.primary.valid, false);
    assert.equal(result.workflow.repair_needed, true);
    assert.equal(result.workflow.repair.role_id, 'turn_step_planner_repair');
    assert.equal(result.workflow.repair.valid, true);
    assert.deepEqual(result.workflow.final, {
      source: 'repair', status: 'ok', valid: true,
      rubric_pass: true,
      quality_status: 'automated_passed', pass: true
    });
    assert.equal(report.aggregates.total.calls, 2);
    assert.equal(report.aggregates.total.fixtures, 1);
    assert.equal(report.aggregates.total.repairs, 1);
    assert.equal(report.aggregates.total.input_tokens, 4);
    assert.equal(report.aggregates.total.output_tokens, 6);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('planner fixture repairs a structurally valid plan rejected by domain-owner preflight', async () => {
  const fixture = corpus.fixtures.find(({ id }) => id === 'planner-reality-limited');
  const invalidPrimary = structuredClone(fixture.expected_output);
  invalidPrimary.resolution = 'domain_request';
  invalidPrimary.goal_result = 'pending';
  invalidPrimary.activity = { owner: 'domain', duration_class: null, effort: null };
  invalidPrimary.operations = [{ op: 'request_activity', actor_ref: 'actor_mikula',
    activity_kind: 'wait', target_refs: [], description: 'Ждать.' }];
  const outputs = [invalidPrimary, fixture.expected_output];
  let calls = 0;
  const server = createServer(async (request, response) => {
    for await (const _ of request) {}
    calls += 1;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: {
      content: JSON.stringify(outputs.shift())
    } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const report = await runFrozenRoleEval({ corpus: { ...corpus,
      fixtures: [fixture] }, runtimeProviderOverride: {
      compatibility: 'openai_compatible',
      baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fixture-model'
    } });
    const result = report.results[0];
    assert.equal(calls, 2);
    assert.equal(result.workflow.primary.valid, false);
    assert.equal(result.workflow.repair_needed, true);
    assert.equal(result.workflow.repair.valid, true);
    assert.equal(result.pass, true);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('semantic-invalid structurally-valid repair fails the planner workflow verdict', async () => {
  const fixture = corpus.fixtures.find(({ id }) =>
    id === 'planner-general-look-spatial-grounding');
  const invalid = structuredClone(fixture.expected_output);
  invalid.operations[0].target_refs.push('actor_mikula');
  let calls = 0;
  const server = createServer(async (request, response) => {
    for await (const _ of request) {}
    calls += 1;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: {
      content: JSON.stringify(invalid)
    } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const report = await runFrozenRoleEval({ corpus: { ...corpus,
      fixtures: [fixture] }, runtimeProviderOverride: {
      compatibility: 'openai_compatible',
      baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fixture-model'
    } });
    const result = report.results[0];
    assert.equal(calls, 2);
    assert.equal(result.workflow.repair.valid, false);
    assert.equal(result.workflow.error_code, 'TURN_STEP_PLAN_INVALID');
    assert.equal(result.pass, false);
    assert.equal(result.valid, false);
    assert.equal(result.quality_status, 'automated_failed');
    assert.equal(result.failure_classification,
      'A_production_validation_rejected');
    calls = 0;
    const unscoredReport = await runFrozenRoleEval({ corpus: { ...corpus,
      fixtures: [{ ...fixture, expected: {} }] }, runtimeProviderOverride: {
      compatibility: 'openai_compatible',
      baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fixture-model'
    } });
    assert.equal(calls, 2);
    assert.equal(unscoredReport.aggregates.total.automated_failed, 1);
    assert.equal(unscoredReport.aggregates.total.quality_denominator, 1);
    assert.equal(unscoredReport.aggregates.total.error_rate, 1);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('planner rubric-only failure does not invoke repair', async () => {
  const fixture = corpus.fixtures.find(({ id }) => id === 'planner-reality-limited');
  const output = structuredClone(fixture.expected_output);
  output.activity.effort = 'heavy';
  let calls = 0;
  const server = createServer(async (request, response) => {
    for await (const _ of request) {}
    calls += 1;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: {
      content: JSON.stringify(output)
    } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const report = await runFrozenRoleEval({ corpus: { ...corpus,
      fixtures: [fixture] }, runtimeProviderOverride: {
      compatibility: 'openai_compatible',
      baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fixture-model'
    } });
    const result = report.results[0];
    assert.equal(calls, 1);
    assert.equal(result.workflow.primary.valid, true);
    assert.equal(result.workflow.repair_needed, false);
    assert.equal(result.pass, false);
    assert.equal(result.failure_classification, 'B_rubric_only');
    assert.ok(result.errors.includes('disallowed_value:activity.effort'));
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('prepared-effect chain suppresses planner repair like production', async () => {
  const fixture = corpus.fixtures.find(({ id }) => id === 'planner-reality-limited');
  const invalidPrimary = structuredClone(fixture.expected_output);
  invalidPrimary.continuation = {
    remaining_intent: 'осмотреть окрестности',
    depends_on_refs: ['unknown-ref']
  };
  let calls = 0;
  const server = createServer(async (request, response) => {
    for await (const _ of request) {}
    calls += 1;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: {
      content: JSON.stringify(invalidPrimary)
    } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const report = await runFrozenRoleEval({ corpus: { ...corpus,
      fixtures: [{ ...fixture,
        prepared_chain_context: { prior_effect_count: 1 } }] },
    runtimeProviderOverride: {
      compatibility: 'openai_compatible',
      baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fixture-model'
    } });
    const result = report.results[0];
    assert.equal(calls, 1);
    assert.equal(result.workflow.repair_needed, false);
    assert.equal(result.workflow.error_code, 'TURN_STEP_PLAN_INVALID');
    assert.equal(result.workflow.repair_suppressed,
      'prepared_effect_chain_active');
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('planner primary prompt must match its frozen fixture before provider call', async () => {
  const fixture = corpus.fixtures.find(({ id }) => id === 'planner-reality-limited');
  const drifted = structuredClone(fixture);
  drifted.messages[0].content += ' drift';
  let calls = 0;
  const server = createServer(async (request, response) => {
    for await (const _ of request) {}
    calls += 1;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const report = await runFrozenRoleEval({ corpus: { ...corpus,
      fixtures: [drifted] }, runtimeProviderOverride: {
      compatibility: 'openai_compatible',
      baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fixture-model'
    } });
    assert.equal(calls, 0);
    assert.equal(report.results[0].workflow.error_code,
      'FROZEN_PLANNER_PROMPT_DRIFT');
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('saved 26/27 planner failure is classified as branch A without a new API call', () => {
  const saved = {
    checkout_sha: '37c63c483b20bd1c0940bf7fc010b74226968493',
    corpus_version: 15,
    fixture_id: 'planner-reality-limited',
    status: 'ok',
    errors: ['validator:turn_step_plan', 'unexpected_value:continuation']
  };
  assert.equal(saved.status, 'ok');
  assert.equal(classifyPlannerEvalFailure(saved.errors),
    'A_production_validation_rejected');
});

test('planner invalid repair fails after exactly two calls', async () => {
  const fixture = corpus.fixtures.find(({ id }) => id === 'planner-reality-limited');
  let calls = 0;
  const server = createServer(async (request, response) => {
    for await (const _ of request) {}
    calls += 1;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { content: '{}' } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const report = await runFrozenRoleEval({ corpus: { ...corpus,
      fixtures: [fixture] }, runtimeProviderOverride: {
      compatibility: 'openai_compatible',
      baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fixture-model'
    } });
    assert.equal(calls, 2);
    assert.equal(report.results[0].pass, false);
    assert.equal(report.results[0].workflow.repair_needed, true);
    assert.equal(report.results[0].workflow.repair.valid, false);
    assert.equal(report.results[0].workflow.error_code, 'TURN_STEP_PLAN_INVALID');
    assert.equal(report.aggregates.total.repairs, 1);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('world-process semantic mismatch fails even when owner validator accepts plan', async () => {
  const fixture = structuredClone(corpus.fixtures.find(({ id }) =>
    id === 'world-process-water-affect'));
  const request = JSON.parse(fixture.messages.at(-1).content);
  request.outcome_contract.push({ process_outcome: 'no_effect',
    reason_code: 'water_unaffected',
    applicability: 'the supplied water does not reach the fire' });
  let invocation;
  await createLowerDvinaTraceWorldProcessStepModel({ roleRunner: {
    async run(call) { invocation = call; return { output: {} }; }
  } })(request);
  fixture.messages = invocation.messages;
  const output = { ...fixture.expected_output, outcome_choice: 'outcome_2' };
  const server = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const report = await runFrozenRoleEval({ corpus: { ...corpus, fixtures: [fixture] },
      runtimeProviderOverride: { compatibility: 'openai_compatible', baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fixture-model' } });
    assert.equal(report.results[0].pass, false);
    assert.ok(report.results[0].errors.includes('unexpected_value:process_outcome'));
    assert.equal(report.aggregates.total.semantic_failures, 1);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('negative narration audit fixture rejects an unsupported visible claim', () => {
  const fixture = corpus.fixtures.find(({ id }) =>
    id === 'gameplay-narrator-auditor-unsupported-fact');
  assert.deepEqual(fixture?.expected?.required_values, {
    pass: false, 'concerns.0.segment_id': 's1',
    'concerns.0.kind': 'unsupported_sensory'
  });
});

test('narration semantic repair accepts grounded equivalent prose', async () => {
  const fixture = corpus.fixtures.find(({ id }) =>
    id === 'gameplay-narrator-semantic-repair-localized');
  const output = structuredClone(fixture.expected_output);
  output.replacements[0].prose = 'У ворот видна телега.';
  const server = createServer(async (request, response) => {
    for await (const _ of request) {}
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: {
      content: JSON.stringify(output) } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const report = await runFrozenRoleEval({ corpus: { ...corpus,
      fixtures: [fixture] }, runtimeProviderOverride: {
      compatibility: 'openai_compatible',
      baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fixture-model'
    } });
    assert.equal(report.results[0].pass, true);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('narration semantic repair rejects unchanged unsupported prose', async () => {
  const fixture = corpus.fixtures.find(({ id }) =>
    id === 'gameplay-narrator-semantic-repair-localized');
  const output = structuredClone(fixture.expected_output);
  output.replacements[0].prose = 'Телега скрипит у ворот.';
  const server = createServer(async (request, response) => {
    for await (const _ of request) {}
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: {
      content: JSON.stringify(output) } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const report = await runFrozenRoleEval({ corpus: { ...corpus,
      fixtures: [fixture] }, runtimeProviderOverride: {
      compatibility: 'openai_compatible',
      baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fixture-model'
    } });
    assert.equal(report.results[0].pass, false);
    assert.ok(report.results[0].errors.includes('forbidden_text:скрип'));
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('conversation eval assembles against the exact provider-facing request', async () => {
  const fixture = structuredClone(corpus.fixtures.find(({ id }) =>
    id === 'npc-conversation-check-required'));
  const output = structuredClone(fixture.expected_output);
  const player = { entity_kind: 'player_character', entity_id: 'player' };
  output.primary_addressee_ref = player;
  output.intended_addressee_refs = [player];
  output.resolution = 'automatic';
  output.supporting_operations = [];
  output.check = { purpose: output.check.purpose };
  const server = createServer(async (request, response) => {
    for await (const _ of request) {}
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: {
      content: JSON.stringify(output) } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const report = await runFrozenRoleEval({ corpus: { ...corpus,
      fixtures: [fixture] }, runtimeProviderOverride: {
      compatibility: 'openai_compatible',
      baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fixture-model'
    } });
    assert.equal(report.results[0].pass, true,
      JSON.stringify(report.results[0].errors));
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('planner, ordinary and NPC conversation semantic mismatches fail after owner validation', async () => {
  const planner = corpus.fixtures.find(({ id }) => id === 'planner-reality-limited');
  const ordinary = corpus.fixtures.find(({ id }) => id === 'ordinary-stage-b-common-cordage');
  const conversation = structuredClone(corpus.fixtures.find(({ id }) => id === 'npc-conversation-check-required'));
  conversation.expected.required_values['speech.dominant_act'] = 'inform';
  const plannerOutput = structuredClone(planner.expected_output);
  plannerOutput.activity.effort = 'heavy';
  const ordinaryOutput = structuredClone(ordinary.expected_output);
  ordinaryOutput.entities[0].semantic_descriptor.semantic_type = 'other_ordinary';
  const conversationOutput = structuredClone(conversation.expected_output);
  conversationOutput.speech.dominant_act = 'question';
  const outputs = [plannerOutput, ordinaryOutput, conversationOutput];
  const server = createServer(async (request, response) => {
    for await (const _ of request) {}
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(outputs.shift()) } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const report = await runFrozenRoleEval({ corpus: { ...corpus, fixtures: [planner, ordinary, conversation] },
      runtimeProviderOverride: { compatibility: 'openai_compatible', baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fixture-model' } });
    for (const result of report.results) {
      assert.equal(result.errors.some((error) => error.startsWith('validator:')), false);
      assert.equal(result.pass, false);
      assert.ok(result.errors.some((error) => /^(unexpected|disallowed)_value:/.test(error)));
    }
  } finally { await new Promise((resolve) => server.close(resolve)); }
});

test('unscored and manual fixtures are not automated quality passes', async () => {
  const fixture = corpus.fixtures.find(({ validator }) => validator === 'turn_step_plan');
  const evalCorpus = { ...corpus, fixtures: [
    { ...fixture, id: 'unscored', expected: {} },
    { ...fixture, id: 'manual', expected: { manual_rubric: true } },
    { ...fixture, id: 'scored', expected: { required_values: { resolution: 'direct' } } }
  ] };
  const server = createServer(async (request, response) => {
    for await (const _ of request) {}
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(fixture.expected_output) } }] }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const report = await runFrozenRoleEval({ corpus: evalCorpus,
      runtimeProviderOverride: { compatibility: 'openai_compatible', baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fixture-model' } });
    assert.equal(report.results[0].quality_status, 'unscored');
    assert.equal(report.results[0].pass, false);
    assert.equal(report.results[1].quality_status, 'manual');
    assert.equal(report.results[1].pass, false);
    assert.equal(report.results[2].quality_status, 'automated_passed');
    assert.equal(report.aggregates.total.automated_passed, 1);
    assert.equal(report.aggregates.total.automated_failed, 0);
    assert.equal(report.aggregates.total.quality_denominator, 1);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
