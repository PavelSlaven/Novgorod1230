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
    const report = await runFrozenRoleEval({ corpus, runtimeProviderOverride: { compatibility: 'openai_compatible', baseUrl: `http://127.0.0.1:${port}/v1`, model: 'fixture-model' } });
    assert.equal(report.fixture_count, 21);
    assert.equal(report.aggregates.total.passed, 21);
    assert.equal(report.aggregates.total.errors, 0);
    assert.equal(report.aggregates.total.repairs, 5);
    assert.equal(report.aggregates.total.input_tokens, 42);
    assert.equal(report.aggregates.total.output_tokens, 63);
    assert.ok(report.aggregates.total.p95_ms >= report.aggregates.total.p50_ms);
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
    assert.deepEqual(report.results[1].errors, ['validator:turn_step_plan']);
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
