import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { createWorldKnowledgeCore,
  createWorldKnowledgeFlatVectorIndex } from '@rus/world-knowledge';

const run = promisify(execFile);
const ENCODER = fileURLToPath(new URL('./giga-embeddings.py', import.meta.url));

export function buildWorldKnowledgeEmbeddingEntries(bundle, profile) {
  validateInputs(bundle, profile);
  const concepts = new Map(bundle.concepts.map((entry) =>
    [entry.concept_ref, entry]));
  const entries = [];
  for (const concept of bundle.concepts) for (const locale of
    bundle.manifest.supported_locales) {
    const text = concept.localizations[locale];
    entries.push(entry(concept.concept_ref, concept.domain, locale,
      [...text.labels, text.short_definition, ...text.search_aliases]));
  }
  for (const claim of bundle.claims) for (const locale of
    bundle.manifest.supported_locales) {
    const concept = concepts.get(claim.subject_ref).localizations[locale];
    const text = claim.localizations[locale];
    entries.push(entry(claim.claim_ref, claim.domain, locale,
      [...concept.labels, concept.short_definition, text.runtime_text,
        ...concept.search_aliases, ...text.search_aliases]));
  }
  return entries.sort((a, b) => a.entry_ref.localeCompare(b.entry_ref));
}

export async function buildWorldKnowledgeVectorIndex({ bundlePath,
  profilePath, metadataOut, vectorsOut, python = 'python' }) {
  const [bundle, profile] = await Promise.all([readJson(bundlePath),
    readJson(profilePath)]);
  const entries = buildWorldKnowledgeEmbeddingEntries(bundle, profile);
  const metrics = await encode({ entries, profilePath, output: vectorsOut,
    mode: 'document', python });
  const metadata = {
    schema: 'world_knowledge_vector_index_v1',
    pack_ref: bundle.manifest.pack_ref,
    pack_revision: bundle.manifest.revision_id,
    embedding_profile_ref: profile.embedding_profile_ref,
    model_id: profile.model_id,
    model_revision: profile.model_revision,
    dimension: profile.dimension,
    normalization: profile.normalization,
    pooling: profile.pooling,
    entries
  };
  await writeJson(metadataOut, metadata);
  return { metadata, metrics };
}

export async function benchmarkWorldKnowledgeVectors({ bundlePath,
  profilePath, metadataPath, vectorsPath, benchmarkPath, reportOut,
  python = 'python' }) {
  const [bundle, profile, metadata, benchmark, vectorBytes] =
    await Promise.all([readJson(bundlePath), readJson(profilePath),
      readJson(metadataPath), readJson(benchmarkPath), readFile(vectorsPath)]);
  if (benchmark?.schema !== 'world_knowledge_retrieval_benchmark_v1'
      || !Number.isInteger(benchmark.vector_candidate_limit)
      || benchmark.vector_candidate_limit < 1
      || !Array.isArray(benchmark.cases) || benchmark.cases.length === 0) {
    throw new TypeError('World Knowledge benchmark is invalid');
  }
  const queryEntries = benchmark.cases.map(({ query_text }) => ({
    retrieval_text: query_text
  }));
  const temporary = await mkdtemp(join(tmpdir(), 'novgorod-wk-benchmark-'));
  try {
    const queryVectorsPath = join(temporary, 'queries.f32');
    const encoding = await encode({ entries: queryEntries, profilePath,
      output: queryVectorsPath, mode: 'query', python, temporary });
    const queryBytes = Uint8Array.from(await readFile(queryVectorsPath));
    const queryVectors = new Float32Array(queryBytes.buffer);
    const index = createWorldKnowledgeFlatVectorIndex(metadata, vectorBytes);
    const core = createWorldKnowledgeCore(bundle);
    const results = [];
    for (let indexOfCase = 0; indexOfCase < benchmark.cases.length;
      indexOfCase += 1) {
      const item = benchmark.cases[indexOfCase];
      const vector = queryVectors.subarray(indexOfCase * profile.dimension,
        (indexOfCase + 1) * profile.dimension);
      const scanStarted = performance.now();
      const vectorScores = index.search(vector, { locale: item.locale,
        domains: item.domains, limit: benchmark.vector_candidate_limit });
      const vectorScanMs = performance.now() - scanStarted;
      const lexical10 = refs(core.resolveWorldKnowledge(
        queryOf(bundle, item, 10)));
      const hybrid10 = refs(core.resolveWorldKnowledge(
        queryOf(bundle, item, 10), { vectorScores }));
      const lexical20 = refs(core.resolveWorldKnowledge(
        queryOf(bundle, item, 20)));
      const hybrid20 = refs(core.resolveWorldKnowledge(
        queryOf(bundle, item, 20), { vectorScores }));
      const inapplicable20 = item.inapplicable_context == null ? []
        : refs(core.resolveWorldKnowledge(queryOf(bundle, {
            ...item, context: item.inapplicable_context,
            focus_refs: item.inapplicable_claim_refs
          }, 20), { vectorScores }));
      results.push({ case_id: item.case_id, vector_scan_ms: vectorScanMs,
        lexical_at_10: lexical10, hybrid_at_10: hybrid10,
        lexical_at_20: lexical20, hybrid_at_20: hybrid20,
        inapplicable_at_20: inapplicable20 });
    }
    const metrics = compare(benchmark, results, encoding, bundle, vectorBytes);
    const report = { schema: 'world_knowledge_retrieval_benchmark_report_v1',
      pack_ref: bundle.manifest.pack_ref,
      pack_revision: bundle.manifest.revision_id,
      embedding_profile_ref: profile.embedding_profile_ref,
      benchmark_ref: benchmark.benchmark_ref,
      gate: benchmark.gate, metrics, decision: gateDecision(benchmark.gate,
        metrics), cases: results };
    await writeJson(reportOut, report);
    return report;
  } finally {
    const root = resolve(tmpdir()) + sep;
    if (resolve(temporary).startsWith(root)) {
      await rm(temporary, { recursive: true, force: true });
    }
  }
}

function queryOf(bundle, item, limit) {
  return { schema: 'world_knowledge_query_v1',
    pack_ref: bundle.manifest.pack_ref,
    pack_revision: bundle.manifest.revision_id,
    purpose: item.purpose, query_locale: item.locale,
    domains: item.domains, focus_refs: item.focus_refs ?? [],
    requested_predicates: [],
    search_hints: [item.query_text], context: item.context,
    budget: { max_facts: limit, max_candidates: limit,
      max_context_chars: 100_000 } };
}

function refs(slice) {
  return [...slice.hard_constraints, ...slice.facts,
    ...slice.disputes.flatMap(({ claims }) => claims)]
    .map(({ claim_ref }) => claim_ref);
}

function compare(benchmark, results, encoding, bundle, vectorBytes) {
  const recall = (field) => average(results.map((result, index) => {
    const expected = benchmark.cases[index].relevant_claim_refs;
    return expected.filter((ref) => result[field].includes(ref)).length
      / expected.length;
  }));
  const hardRecall = (field) => {
    const cases = results.flatMap((result, index) =>
      benchmark.cases[index].expected_hard_constraint_refs.map((ref) =>
        result[field].includes(ref) ? 1 : 0));
    return cases.length === 0 ? 1 : average(cases);
  };
  const noise = (field) => average(results.map((result, index) => {
    const relevant = new Set(benchmark.cases[index].relevant_claim_refs);
    return result[field].length === 0 ? 0 : result[field]
      .filter((ref) => !relevant.has(ref)).length / result[field].length;
  }));
  const applicability = results.flatMap((result, index) =>
    (benchmark.cases[index].inapplicable_claim_refs ?? []).map((ref) =>
      result.inapplicable_at_20.includes(ref) ? 0 : 1));
  return { case_count: results.length,
    lexical_recall_at_10: recall('lexical_at_10'),
    hybrid_recall_at_10: recall('hybrid_at_10'),
    lexical_recall_at_20: recall('lexical_at_20'),
    hybrid_recall_at_20: recall('hybrid_at_20'),
    lexical_hard_constraint_recall: hardRecall('lexical_at_20'),
    hybrid_hard_constraint_recall: hardRecall('hybrid_at_20'),
    lexical_noise_at_10: noise('lexical_at_10'),
    hybrid_noise_at_10: noise('hybrid_at_10'),
    applicability_precision: applicability.length === 0
      ? 1 : average(applicability),
    query_embedding_mean_ms: encoding.encoding_ms / results.length,
    vector_scan_mean_ms: average(results.map((item) => item.vector_scan_ms)),
    runtime_bundle_bytes: Buffer.byteLength(JSON.stringify(bundle)),
    vector_bundle_bytes: vectorBytes.byteLength,
    encoder_model_load_ms: encoding.model_load_ms,
    peak_process_rss_bytes: encoding.peak_process_rss_bytes,
    cuda_peak_allocated_bytes: encoding.cuda_peak_allocated_bytes };
}

function gateDecision(gate, metrics) {
  const passed = metrics.hybrid_recall_at_10 >= gate.min_recall_at_10
    && metrics.hybrid_recall_at_10 - metrics.lexical_recall_at_10
      >= gate.min_recall_improvement_at_10
    && metrics.hybrid_hard_constraint_recall
      >= gate.min_hard_constraint_recall
    && metrics.hybrid_noise_at_10 <= gate.max_noise_at_10
    && metrics.applicability_precision >= gate.min_applicability_precision
    && metrics.query_embedding_mean_ms <= gate.max_query_embedding_mean_ms
    && metrics.vector_scan_mean_ms <= gate.max_vector_scan_mean_ms;
  return { activate_hybrid_runtime: passed,
    status: passed ? 'pass' : 'keep_structured_lexical',
    failed_checks: passed ? [] : Object.entries({
      recall: metrics.hybrid_recall_at_10 >= gate.min_recall_at_10,
      improvement: metrics.hybrid_recall_at_10
        - metrics.lexical_recall_at_10 >= gate.min_recall_improvement_at_10,
      hard_constraints: metrics.hybrid_hard_constraint_recall
        >= gate.min_hard_constraint_recall,
      noise: metrics.hybrid_noise_at_10 <= gate.max_noise_at_10,
      applicability: metrics.applicability_precision
        >= gate.min_applicability_precision,
      query_latency: metrics.query_embedding_mean_ms
        <= gate.max_query_embedding_mean_ms,
      scan_latency: metrics.vector_scan_mean_ms <= gate.max_vector_scan_mean_ms
    }).filter(([, value]) => !value).map(([key]) => key) };
}

async function encode({ entries, profilePath, output, mode, python,
  temporary = null }) {
  const ownTemporary = temporary ?? await mkdtemp(join(tmpdir(),
    'novgorod-wk-embedding-'));
  try {
    const input = join(ownTemporary, `${mode}-input.json`);
    const metrics = join(ownTemporary, `${mode}-metrics.json`);
    await writeFile(input, JSON.stringify(entries), 'utf8');
    await mkdir(dirname(resolve(output)), { recursive: true });
    await run(python, [ENCODER, '--profile', resolve(profilePath), '--input',
      input, '--output', resolve(output), '--mode', mode, '--metrics-out',
      metrics], { windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
    return readJson(metrics);
  } finally {
    if (temporary == null) {
      const root = resolve(tmpdir()) + sep;
      if (resolve(ownTemporary).startsWith(root)) {
        await rm(ownTemporary, { recursive: true, force: true });
      }
    }
  }
}

function entry(target_ref, domain, locale, parts) {
  return { entry_ref: `wk-retrieval:${target_ref}:${locale}`,
    target_ref, domain, locale,
    retrieval_text: [...new Set(parts.filter((value) =>
      typeof value === 'string' && value.trim()).map((value) =>
      value.trim()))].join(' ') };
}

function validateInputs(bundle, profile) {
  if (bundle?.schema !== 'world_knowledge_runtime_bundle_v1'
      || profile?.schema !== 'world_knowledge_embedding_profile_v1'
      || bundle.manifest?.embedding_profile_ref
        !== profile.embedding_profile_ref || profile.status !== 'production') {
    throw new TypeError('World Knowledge embedding inputs are invalid');
  }
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

async function writeJson(path, value) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}
