#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadProductionWorldKnowledge } from
  '../../../apps/game-server/src/internal/world-knowledge-production.js';
import { loadLowerDvinaTraceMaterializationBundle } from
  '../../../apps/game-server/src/internal/lower-dvina-trace-phase-1a-bundle.js';
import { createProductionWorldKnowledgeGrounder, worldKnowledgeFactualClosure } from
  '../../../apps/game-server/src/runtime/world-knowledge-grounding.js';
import { createProductionLlmRoleRunner } from
  '../../../apps/game-server/src/infrastructure/provider/deepseek.js';

if (process.argv[1] != null
    && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}

async function main() {
  const rootDir = process.cwd();
  const benchmarkPath = resolve(process.argv[2] ?? 'data/world-catalogs/novgorod/world-knowledge/benchmarks/pipeline-v1.json');
  const reportPath = resolve(process.argv[3] ?? 'data/world-catalogs/novgorod/world-knowledge/benchmarks/pipeline-v1-report.json');
  const benchmark = JSON.parse(await readFile(benchmarkPath, 'utf8'));
  validateBenchmark(benchmark);
  let loaded;
  let activeCase = null;
  let plannerOutputs = [];
  const runs = [];
  try {
    const [worldKnowledgeBundle, scenario] = await Promise.all([
      loadProductionWorldKnowledge({ rootDir,
        python: process.env.RUS_WORLD_KNOWLEDGE_PYTHON ?? 'python' }),
      loadLowerDvinaTraceMaterializationBundle({ rootDir,
        scenarioDefinitionRevision: 32 })
    ]);
    loaded = worldKnowledgeBundle;
    const productionRoleRunner = createProductionLlmRoleRunner();
    const roleRunner = { async run(request) {
      const response = await productionRoleRunner.run(request);
      if (request.role_id.startsWith('world_knowledge_query_')) {
        plannerOutputs.push({ role_id: request.role_id, output: response.output });
      }
      return response;
    } };
    let knowledgeQuery = null;
    const worldKnowledge = Object.freeze({ ...loaded,
      core: { resolveWorldKnowledge(query, options) {
        knowledgeQuery = {
          query_locale: query.query_locale, domains: query.domains,
          focus_refs: query.focus_refs,
          requested_predicates: query.requested_predicates,
          search_hints: query.search_hints
        };
        return loaded.core.resolveWorldKnowledge(query, options);
      } },
      calendar_profile: scenario.calendar_profile });
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
        activeCase = { mode, case_id: item.case_id };
        plannerOutputs = [];
        knowledgeQuery = null;
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
        const output = readSemanticOutput(response.output);
        const available = new Set(grounded.world_knowledge == null ? []
          : [...grounded.world_knowledge.hard_constraints,
            ...grounded.world_knowledge.facts].map(({ claim_ref }) => claim_ref));
        runs.push({ mode, case_id: item.case_id,
          accepted_answer_classes: item.accepted_answer_classes,
          answer_class: output.answer_class,
          answer_text: output.answer_text,
          ...(output.answer_class === 'invalid'
            ? { invalid_output: output.invalid_output } : {}),
          answer_correct: item.accepted_answer_classes
            .includes(output.answer_class),
          relevant_claim_refs: item.relevant_claim_refs,
          production_acceptance: item.production_acceptance === true,
          expected_factual_premise_ref_groups:
            item.expected_factual_premise_ref_groups ?? [],
          forbidden_factual_premise_refs:
            item.forbidden_factual_premise_refs ?? [],
          available_claim_refs: [...available],
          factual_premise_refs: output.factual_premise_refs,
          unsupported_premise_refs: output.factual_premise_refs.filter((ref) =>
            !available.has(ref)),
          knowledge_query: knowledgeQuery,
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
    const productionGate = evaluateProductionGate(runs);
    const report = { schema: 'world_knowledge_pipeline_benchmark_report_v1',
      benchmark_ref: benchmark.benchmark_ref,
      pack_ref: loaded.bundle.manifest.pack_ref,
      pack_revision: loaded.bundle.manifest.revision_id,
      embedding_profile_ref: loaded.embedding_profile.embedding_profile_ref,
      backend: providerOf(runs),
      correctness_measurement: 'Automatic gate checks answer class and cited evidence refs. Answer prose is retained for independent grounding review; these metrics alone do not prove factual correctness of every sentence.',
      cost_measurement: { unit: 'provider_reported_tokens',
        monetary_estimate_usd: null,
        reason: 'The configured deepseek-v4-flash alias has no project-owned immutable price schedule; token usage is retained without inventing a rate.' },
      modes: Object.fromEntries(['without_wk', 'structured_lexical', 'hybrid']
        .map((mode) => [mode, metrics(runs.filter((run) => run.mode === mode))])),
      decision: { ...productionGate, production_mode: 'hybrid',
        basis: 'Only hybrid gates production: every hybrid answer must be accepted, cite relevant evidence, use no unsupported claim refs, and satisfy every expected evidence group on designated acceptance cases. Baselines remain measurements.' },
      runs };
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(`${JSON.stringify(report.modes)}\n`);
    if (productionGate.status !== 'pass') process.exitCode = 1;
  } catch (error) {
    const report = pipelineFailureReport({ benchmark, activeCase,
      plannerOutputs, runs, error });
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    throw error;
  } finally {
    await loaded?.encoder.close();
  }
}

export function pipelineFailureReport({ benchmark, activeCase, plannerOutputs, runs, error }) {
  return { schema: 'world_knowledge_pipeline_benchmark_report_v1',
    benchmark_ref: benchmark.benchmark_ref, completed: false,
    decision: { status: 'fail', failures: [{ case_id: activeCase?.case_id ?? null,
      reason: 'PIPELINE_EXECUTION_FAILED' }] },
    failed_case: activeCase,
    failure: { code: error?.code ?? null, message: String(error?.message ?? error),
      details: error?.details ?? null, planner_outputs: plannerOutputs },
    runs };
}

function validateBenchmark(benchmark) {
  if (benchmark?.schema !== 'world_knowledge_pipeline_benchmark_v1'
      || !Array.isArray(benchmark.cases) || benchmark.cases.length === 0
      || benchmark.cases.some((item) => !Array.isArray(item.relevant_claim_refs)
        || item.relevant_claim_refs.length === 0
        || item.relevant_claim_refs.some((ref) => typeof ref !== 'string')
        || !Array.isArray(item.accepted_answer_classes)
        || (item.production_acceptance === true
          && (!validRefGroups(item.expected_factual_premise_ref_groups)
            || !Array.isArray(item.forbidden_factual_premise_refs)
            || item.forbidden_factual_premise_refs.some((ref) =>
              typeof ref !== 'string'))))) {
    throw new TypeError('World Knowledge pipeline benchmark is invalid');
  }
}

function validRefGroups(value) {
  return Array.isArray(value) && value.length > 0 && value.every((group) =>
    Array.isArray(group) && group.length > 0
      && group.every((ref) => typeof ref === 'string'));
}

export function evaluateProductionGate(runs) {
  const hybridRuns = runs.filter(({ mode }) => mode === 'hybrid');
  if (hybridRuns.length === 0) {
    return { status: 'fail', failures: [{ case_id: null,
      reason: 'HYBRID_RUNS_MISSING' }] };
  }
  const failures = hybridRuns.flatMap((run) => {
    const reasons = [];
    if (!run.answer_correct) reasons.push('ANSWER_INCORRECT');
    if (run.unsupported_premise_refs.length > 0) reasons.push('UNSUPPORTED_PREMISE_REF');
    if (!run.relevant_claim_refs.some((ref) =>
      run.factual_premise_refs.includes(ref))) reasons.push('RELEVANT_EVIDENCE_MISSING');
    if (run.production_acceptance) {
      if (run.expected_factual_premise_ref_groups.some((group) =>
        !group.some((ref) => run.factual_premise_refs.includes(ref)))) {
        reasons.push('EXPECTED_EVIDENCE_MISSING');
      }
      if (run.forbidden_factual_premise_refs.some((ref) =>
        run.factual_premise_refs.includes(ref))) reasons.push('FORBIDDEN_EVIDENCE_USED');
    }
    return reasons.map((reason) => ({ case_id: run.case_id, reason }));
  });
  return { status: failures.length === 0 ? 'pass' : 'fail', failures };
}

export function semanticMessages(item, slice) {
  const grounded = slice == null
    ? 'No World Knowledge slice is supplied; answer from the backend baseline and return no factual_premise_refs.'
    : [...worldKnowledgeFactualClosure({ world_knowledge: slice }),
      'Return every actually used claim_ref in factual_premise_refs.'].join(' ');
  return [{ role: 'system', content: [
    'Evaluation only. Return exactly one JSON object with exactly answer_class, answer_text, and factual_premise_refs.',
    'Do not echo question, world_knowledge, or any other input field in the output.',
    'answer_text must be a nonempty concise answer to the whole question, using only the cited claims when World Knowledge is supplied. Include material qualifiers.',
    'answer_class must be yes, no, explain, or uncertain. factual_premise_refs must be an array of strings.',
    'For a yes/no question, answer_class must be yes, no, or uncertain even when answer_text explains the answer. For a what/how/why/which question, use explain when the supplied facts answer it; use uncertain when needed evidence is missing or disputed. Named examples at the end do not turn a what/how/which request into a yes/no confirmation.',
    'Historical compatibility and general physical relations are not proof of a particular person, item, stock or event in the current scene. A qualifier denying present-instance proof does not negate supported general compatibility. Preserve all qualifiers.',
    'For a multi-part question, address each independently requested relationship in answer_text: give its supplied factual answer and cite the premises, or state the specific evidence gap. Do not collapse requested categories into a confirmation of examples. Do not omit a requested part, cite unused facts, or guess absent evidence.', grounded
  ].join(' ') }, { role: 'user', content: JSON.stringify({
    question: item.query_text, world_knowledge: slice
  }) }];
}

export function validOutput(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === 'answer_class,answer_text,factual_premise_refs'
    && ['yes', 'no', 'explain', 'uncertain'].includes(value.answer_class)
    && typeof value.answer_text === 'string' && value.answer_text.trim().length > 0
    && Array.isArray(value.factual_premise_refs)
    && value.factual_premise_refs.every((ref) => typeof ref === 'string');
}

export function readSemanticOutput(value) {
  return validOutput(value) ? value : { answer_class: 'invalid', answer_text: '',
    factual_premise_refs: [], invalid_output: value ?? null };
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
