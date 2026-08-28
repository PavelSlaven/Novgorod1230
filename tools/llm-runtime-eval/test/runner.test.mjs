import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { runFrozenRoleEval } from '../src/runner.mjs';

const corpus = JSON.parse(await readFile(new URL('../../../data/model-evals/llm-runtime/frozen-role-requests-v1.json', import.meta.url), 'utf8'));

test('frozen corpus runs through runtime override and reports deterministic aggregates', async () => {
  const outputs = corpus.fixtures.map(({ expected_output }) => expected_output);
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
      corpus: { path: 'data/model-evals/llm-runtime/frozen-role-requests-v1.json', version: 11 }
    } });
    assert.equal(report.fixture_count, 21);
    assert.equal(report.aggregates.total.passed, 21);
    assert.equal(report.aggregates.total.errors, 0);
    assert.equal(report.aggregates.total.scored, 21);
    assert.equal(report.aggregates.total.unscored, 0);
    assert.equal(report.aggregates.total.automated_passed, 21);
    assert.equal(report.aggregates.total.quality_denominator, 21);
    assert.equal(report.aggregates.total.repairs, 5);
    assert.equal(report.aggregates.total.input_tokens, 42);
    assert.equal(report.aggregates.total.output_tokens, 63);
    assert.ok(report.aggregates.total.p95_ms >= report.aggregates.total.p50_ms);
    assert.deepEqual(report.metadata.execution, { passes: 1, concurrency: 1 });
    assert.deepEqual(report.metadata.git, { checkout_sha: 'fixture-sha', dirty: false });
    assert.deepEqual(report.metadata.corpus, {
      path: 'data/model-evals/llm-runtime/frozen-role-requests-v1.json', version: 11
    });
    assert.deepEqual(report.metadata.role_config_policy.find(({ role_id }) => role_id === 'turn_step_planner'), {
      scope: 'turn_runtime', role_id: 'turn_step_planner', provider: 'openai_compatible', model: 'fixture-model',
      config_hash: report.results.find(({ role_id }) => role_id === 'turn_step_planner').config_hash,
      request_timeout_ms: 10000, thinking: 'disabled', reasoning_effort: null, max_tokens: 8000,
      context_budget: { targetInputTokens: 100000, comfortableInputTokens: 220000,
        hardInputLimitTokens: 600000, reserveOutputTokens: 8000, reserveRepairTokens: 30000 }
    });
    assert.equal(report.results.every(({ config_hash }) => typeof config_hash === 'string' && config_hash.length > 0), true);
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

test('world-process semantic mismatch fails even when owner validator accepts plan', async () => {
  const fixture = corpus.fixtures.find(({ id }) => id === 'world-process-water-affect');
  const output = { ...fixture.expected_output, process_outcome: 'no_effect', reason_code: 'water_unaffected' };
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

test('planner, ordinary and NPC conversation semantic mismatches fail after owner validation', async () => {
  const planner = corpus.fixtures.find(({ id }) => id === 'planner-reality-limited');
  const ordinary = corpus.fixtures.find(({ id }) => id === 'ordinary-stage-b-common-cordage');
  const conversation = structuredClone(corpus.fixtures.find(({ id }) => id === 'npc-conversation-check-required'));
  conversation.expected.required_values['speech.dominant_act'] = 'inform';
  const plannerOutput = structuredClone(planner.expected_output);
  plannerOutput.activity.effort = 'light';
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
