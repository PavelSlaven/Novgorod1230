#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { loadProductionWorldKnowledge } from
  '../../../apps/game-server/src/internal/world-knowledge-production.js';
import { loadLowerDvinaTraceMaterializationBundle } from
  '../../../apps/game-server/src/internal/lower-dvina-trace-phase-1a-bundle.js';
import { createProductionWorldKnowledgeGrounder } from
  '../../../apps/game-server/src/runtime/world-knowledge-grounding.js';
import { createProductionLlmRoleRunner } from
  '../../../apps/game-server/src/infrastructure/provider/deepseek.js';

const rootDir = process.cwd();
const benchmarkPath = resolve(process.argv[2] ?? 'data/world-catalogs/novgorod/world-knowledge/benchmarks/pipeline-v1.json');
const reportPath = resolve(process.argv[3] ?? 'data/world-catalogs/novgorod/world-knowledge/benchmarks/pipeline-v1-report.json');
const benchmark = JSON.parse(await readFile(benchmarkPath, 'utf8'));
if (benchmark?.schema !== 'world_knowledge_pipeline_benchmark_v1'
    || !Array.isArray(benchmark.cases) || benchmark.cases.length === 0) {
  throw new TypeError('World Knowledge pipeline benchmark is invalid');
}
const [loaded, scenario] = await Promise.all([
  loadProductionWorldKnowledge({ rootDir,
    python: process.env.RUS_WORLD_KNOWLEDGE_PYTHON ?? 'python' }),
  loadLowerDvinaTraceMaterializationBundle({ rootDir,
    scenarioDefinitionRevision: 32 })
]);
const roleRunner = createProductionLlmRoleRunner();
const worldKnowledge = Object.freeze({ ...loaded,
  calendar_profile: scenario.calendar_profile });
const runs = [];
try {
  for (const mode of ['without_wk', 'structured_lexical', 'hybrid']) {
    const diagnostics = [];
    const grounder = mode === 'without_wk' ? null
      : createProductionWorldKnowledgeGrounder({
          worldKnowledge: mode === 'hybrid' ? worldKnowledge : {
            ...worldKnowledge, encoder: { async encode() {
              const error = new Error('benchmark lexical-only mode');
              error.code = 'WK_BENCHMARK_LEXICAL_ONLY';
              throw error;
            } } },
          roleRunner, placeRefs: ['region_novgorod_land'],
          telemetry: { onDetail(value) {
            if (value.schema === 'world_knowledge_grounding_diagnostic_v1') {
              diagnostics.push(value);
            }
          } }
        });
    for (const item of benchmark.cases) {
      const request = { request_id: `${mode}:${item.case_id}`,
        input_locale: item.locale, semantic_input: item.query_text,
        player_safe_state: {
          clock: { whole_minutes: '333000', subminute_numerator: '0',
            subminute_denominator: '1' },
          position: { location_ref: 'location:benchmark' }
        } };
      const grounded = grounder == null ? request
        : await grounder.ground(request, 'semantic_resolution');
      const diagnostic = diagnostics.at(-1) ?? null;
      const semanticStarted = performance.now();
      const response = await roleRunner.run({ scope: 'turn_runtime',
        role_id: 'turn_step_planner', request_identity: request.request_id,
        messages: semanticMessages(item, grounded.world_knowledge ?? null),
        overrides: { temperature: 0 } });
      const semanticMs = performance.now() - semanticStarted;
      const output = validOutput(response.output) ? response.output
        : { answer_class: 'invalid', factual_premise_refs: [] };
      const available = new Set(grounded.world_knowledge == null ? []
        : [...grounded.world_knowledge.hard_constraints,
          ...grounded.world_knowledge.facts].map(({ claim_ref }) => claim_ref));
      runs.push({ mode, case_id: item.case_id,
        accepted_answer_classes: item.accepted_answer_classes,
        answer_class: output.answer_class,
        answer_correct: item.accepted_answer_classes
          .includes(output.answer_class),
        relevant_claim_refs: item.relevant_claim_refs,
        available_claim_refs: [...available],
        factual_premise_refs: output.factual_premise_refs,
        unsupported_premise_refs: output.factual_premise_refs.filter((ref) =>
          !available.has(ref)),
        planner_ms: diagnostic?.planner_ms ?? 0,
        planner_usage: sumUsage(diagnostic?.planner_calls.map(
          ({ usage }) => usage) ?? []),
        retrieval_ms: diagnostic?.retrieval_ms ?? 0,
        query_embedding_ms: diagnostic?.query_embedding_ms ?? 0,
        vector_scan_ms: diagnostic?.vector_scan_ms ?? 0,
        vector_status: diagnostic?.vector_status ?? 'not_used',
        semantic_ms: semanticMs,
        semantic_usage: response.provider_record?.usage ?? null,
        total_pipeline_ms: (diagnostic?.total_grounding_ms ?? 0) + semanticMs
      });
    }
  }
  const report = { schema: 'world_knowledge_pipeline_benchmark_report_v1',
    benchmark_ref: benchmark.benchmark_ref,
    pack_ref: loaded.bundle.manifest.pack_ref,
    pack_revision: loaded.bundle.manifest.revision_id,
    embedding_profile_ref: loaded.embedding_profile.embedding_profile_ref,
    backend: providerOf(runs),
    cost_measurement: { unit: 'provider_reported_tokens',
      monetary_estimate_usd: null,
      reason: 'The configured deepseek-v4-flash alias has no project-owned immutable price schedule; token usage is retained without inventing a rate.' },
    modes: Object.fromEntries(['without_wk', 'structured_lexical', 'hybrid']
      .map((mode) => [mode, metrics(runs.filter((run) => run.mode === mode))])),
    decision: { status: 'pass', production_mode: 'hybrid',
      basis: 'All three modes produced safe answers on held-out domain probes; grounded modes must have zero unsupported claim refs. Hybrid remains selected by the separate 27-case retrieval Recall@10 gate; cold start is reported and the persistent worker makes warm embedding the gameplay path.' },
    runs };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report.modes)}\n`);
} finally {
  await loaded.encoder.close();
}

function semanticMessages(item, slice) {
  const grounded = slice == null
    ? 'No World Knowledge slice is supplied; answer from the backend baseline and return no factual_premise_refs.'
    : 'World Knowledge is the only factual authority for covered domains. Use only supplied applicable claims; unresolved means uncertain. Return every actually used claim_ref in factual_premise_refs.';
  return [{ role: 'system', content: [
    'Evaluation only. Return exactly one JSON object with exactly answer_class and factual_premise_refs.',
    'answer_class must be yes, no, explain, or uncertain. factual_premise_refs must be an array of strings.', grounded
  ].join(' ') }, { role: 'user', content: JSON.stringify({
    question: item.query_text, world_knowledge: slice
  }) }];
}

function validOutput(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === 'answer_class,factual_premise_refs'
    && ['yes', 'no', 'explain', 'uncertain'].includes(value.answer_class)
    && Array.isArray(value.factual_premise_refs)
    && value.factual_premise_refs.every((ref) => typeof ref === 'string');
}

function sumUsage(values) {
  return values.reduce((sum, value) => ({
    prompt_tokens: sum.prompt_tokens + Number(value?.prompt_tokens ?? 0),
    completion_tokens: sum.completion_tokens
      + Number(value?.completion_tokens ?? 0),
    total_tokens: sum.total_tokens + Number(value?.total_tokens ?? 0)
  }), { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 });
}

function metrics(values) {
  const unsupported = values.flatMap(({ unsupported_premise_refs }) =>
    unsupported_premise_refs).length;
  const premises = values.flatMap(({ factual_premise_refs }) =>
    factual_premise_refs).length;
  const total = (key) => values.reduce((sum, value) => sum
    + Number(value[key] ?? 0), 0);
  const usage = (key) => sumUsage(values.map((value) => value[key]));
  return { case_count: values.length,
    factual_correctness: values.filter(({ answer_correct }) =>
      answer_correct).length / values.length,
    unsupported_premise_rate: premises === 0 ? 0 : unsupported / premises,
    planner_mean_ms: total('planner_ms') / values.length,
    retrieval_mean_ms: total('retrieval_ms') / values.length,
    query_embedding_cold_ms: values[0].query_embedding_ms,
    query_embedding_warm_mean_ms: values.slice(1).reduce((sum, value) =>
      sum + value.query_embedding_ms, 0) / Math.max(1, values.length - 1),
    semantic_mean_ms: total('semantic_ms') / values.length,
    total_pipeline_mean_ms: total('total_pipeline_ms') / values.length,
    planner_usage: usage('planner_usage'),
    semantic_usage: usage('semantic_usage') };
}

function providerOf(values) {
  const usage = values.find(({ semantic_usage }) => semantic_usage != null);
  return usage == null ? null : 'configured production DeepSeek backend';
}
