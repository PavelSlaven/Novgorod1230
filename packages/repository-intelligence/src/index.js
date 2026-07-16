import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import {
  createFileSystemKnowledgeSourceStorage,
  createKnowledgeRagReader
} from '@rus/knowledge-source';

export const GRAPHIFY_VERSION = '0.9.17';

export class RepositoryIntelligenceError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

const failure = (code, message, details = {}) => ({ code, message, details });
const graphRecovery = 'Run npm run repo-intel:build.';

export function createRepositoryIntelligenceService({
  root = '.',
  run = runCommand,
  knowledgeLane,
  graphPath,
  manifestPath
} = {}) {
  const base = resolve(root);
  const graph = graphPath ?? resolve(base, 'graphify-out/graph.json');
  const manifest = manifestPath ?? resolve(base, 'generated/repository-intelligence/manifest.json');
  const knowledge = knowledgeLane ?? createDefaultKnowledgeLane(base);

  const gitHead = async () => (await run('git', ['rev-parse', 'HEAD'], base)).stdout.trim();

  async function status() {
    const [knowledgeSource, graphify, headResult, manifestResult, graphResult] = await Promise.all([
      getKnowledgeReadiness(),
      getGraphifyStatus(),
      settle(gitHead()),
      readJson(manifest),
      readJson(graph)
    ]);
    const errors = [];

    if (!graphify.ok) errors.push(graphify.error);
    if (!headResult.ok) errors.push(commandFailure(headResult.error, 'Unable to read the current Git commit.'));
    if (!manifestResult.ok) {
      errors.push(failure('REPOSITORY_GRAPH_MISSING', `Repository graph manifest is missing or invalid. ${graphRecovery}`));
    }
    if (!graphResult.ok) {
      errors.push(failure('REPOSITORY_GRAPH_MISSING', `graphify-out/graph.json is missing or invalid. ${graphRecovery}`));
    }
    if (manifestResult.ok && headResult.ok && manifestResult.value.source_commit !== headResult.value) {
      errors.push(failure('REPOSITORY_GRAPH_STALE', `Graph was built for another Git commit. ${graphRecovery}`, {
        graph_commit: manifestResult.value.source_commit,
        current_commit: headResult.value
      }));
    }
    if (manifestResult.ok && manifestResult.value.graphify_version !== GRAPHIFY_VERSION) {
      errors.push(failure('REPOSITORY_GRAPH_STALE', `Graph was built with another Graphify version. ${graphRecovery}`, {
        graphify_version: manifestResult.value.graphify_version ?? null,
        expected_graphify_version: GRAPHIFY_VERSION
      }));
    }

    const graphErrors = errors;
    const graphInvalidOutput = !graphify.ok && graphify.error.code === 'INVALID_OUTPUT';
    const repositoryGraph = {
      status: graphify.ok && graphResult.ok && manifestResult.ok && !graphInvalidOutput && graphErrors.length === 0 ? 'ready' : 'unavailable',
      ok: graphify.ok,
      version: graphify.version,
      source_commit: manifestResult.value?.source_commit
    };
    return {
      ok: errors.length === 0,
      knowledge_source: knowledgeSource.public,
      repository_graph: repositoryGraph,
      graphify: repositoryGraph,
      warnings: knowledgeSource.warning ? [knowledgeSource.warning] : [],
      errors
    };
  }

  async function query(input = {}) {
    const queryText = typeof input.query === 'string' ? input.query.trim() : '';
    if (!queryText) throw new RepositoryIntelligenceError('INVALID_ARGUMENT', '--query is required.');

    const readiness = await status();
    const knowledgeReadinessError = readiness.knowledge_source.status === 'unavailable'
      ? readiness.knowledge_source.error ?? failure('KNOWLEDGE_SOURCE_UNAVAILABLE', 'Knowledge source is unavailable.')
      : null;
    const graphReadinessError = readiness.graphify.status === 'ready'
      ? null
      : readiness.errors.find((item) => item !== knowledgeReadinessError)
        ?? failure('REPOSITORY_GRAPH_MISSING', `Repository graph is unavailable. ${graphRecovery}`);
    const [knowledgeResult, graphResult] = await Promise.all([
      knowledgeReadinessError
        ? Promise.resolve({ ok: false, error: knowledgeReadinessError })
        : settle(knowledge.searchKnowledge({ query: queryText })).then(toKnowledgeResult),
      graphReadinessError
        ? Promise.resolve({ ok: false, error: graphReadinessError })
        : settle(run('graphify', ['query', queryText, '--graph', graph], base)).then(toGraphResult)
    ]);

    return {
      ok: knowledgeResult.ok || graphResult.ok,
      partial: !knowledgeResult.ok || !graphResult.ok,
      query: queryText,
      knowledge_source: knowledgeResult,
      graphify: graphResult,
      warnings: readiness.warnings,
      readiness_errors: readiness.errors
    };
  }

  async function build() {
    const graphify = await getGraphifyStatus();
    if (!graphify.ok) throw new RepositoryIntelligenceError(graphify.error.code, graphify.error.message, graphify.error.details);

    await run('graphify', ['extract', base, '--code-only', '--no-cluster', '--force'], base);
    const graphResult = await readJson(graph);
    if (!graphResult.ok) {
      throw new RepositoryIntelligenceError('REPOSITORY_GRAPH_MISSING', `Graphify did not create a valid graph. ${graphRecovery}`);
    }
    const sourceCommit = await gitHead();
    await mkdir(resolve(base, 'generated/repository-intelligence'), { recursive: true });
    await writeFile(manifest, `${JSON.stringify({
      schema_version: 'rus.repository_graph_manifest.v1',
      source_commit: sourceCommit,
      graphify_version: GRAPHIFY_VERSION,
      graph_path: 'graphify-out/graph.json'
    }, null, 2)}\n`);
    return { ok: true, source_commit: sourceCommit, graphify_version: GRAPHIFY_VERSION };
  }

  async function ensure() {
    const readiness = await status();
    if (readiness.repository_graph.status === 'ready') {
      return { ok: true, rebuilt: false, source_commit: readiness.repository_graph.source_commit, graphify_version: readiness.repository_graph.version };
    }
    const result = await build();
    return { ...result, rebuilt: true };
  }

  async function getKnowledgeReadiness() {
    try {
      const value = await knowledge.getReadinessStatus();
      if (!value || typeof value.status !== 'string') {
        return unavailableKnowledge(failure('INVALID_OUTPUT', 'Knowledge source returned an invalid readiness response.'));
      }
      if (value.status === 'ready') return { ok: true, public: { status: 'ready' } };
      if (value.status === 'degraded') {
        const warning = failure('KNOWLEDGE_SOURCE_DEGRADED', 'Knowledge source contains semantic coverage gaps. Semantic search may be incomplete.');
        return { ok: true, public: { status: 'degraded' }, warning };
      }
      return unavailableKnowledge(failure('KNOWLEDGE_SOURCE_UNAVAILABLE', `Knowledge source status is ${value.status}.`));
    } catch (error) {
      return unavailableKnowledge(failure('KNOWLEDGE_SOURCE_UNAVAILABLE', String(error?.message ?? error)));
    }
  }

  async function getGraphifyStatus() {
    try {
      const output = await run('graphify', ['--version'], base);
      const version = `${output.stdout ?? ''}\n${output.stderr ?? ''}`.match(/\d+\.\d+\.\d+/)?.[0];
      if (!version) return { ok: false, error: failure('INVALID_OUTPUT', 'Graphify returned an invalid version response.') };
      if (version !== GRAPHIFY_VERSION) {
        return { ok: false, error: failure('GRAPHIFY_VERSION_MISMATCH', `Expected Graphify ${GRAPHIFY_VERSION}, received ${version}.`, { expected: GRAPHIFY_VERSION, actual: version }) };
      }
      return { ok: true, version };
    } catch (error) {
      return {
        ok: false,
        error: failure(error?.code === 'ENOENT' ? 'GRAPHIFY_NOT_INSTALLED' : 'COMMAND_FAILED', String(error?.message ?? error))
      };
    }
  }

  return Object.freeze({ status, query, build, ensure });
}

function createDefaultKnowledgeLane(root) {
  const storage = createFileSystemKnowledgeSourceStorage({
    sourceRoot: resolve(root, 'data/knowledge-source'),
    generatedRoot: resolve(root, 'generated/knowledge-source')
  });
  return createKnowledgeRagReader({ storage });
}

function unavailableKnowledge(error) {
  return { ok: false, public: { status: 'unavailable', error }, error };
}

function toKnowledgeResult(result) {
  if (!result.ok) return { ok: false, error: failure('KNOWLEDGE_SOURCE_UNAVAILABLE', String(result.error?.message ?? result.error)) };
  return { ok: true, results: result.value.results ?? [] };
}

function toGraphResult(result) {
  if (!result.ok) return { ok: false, error: commandFailure(result.error, 'Graphify query failed.') };
  return { ok: true, results: result.value.stdout.trim() };
}

function commandFailure(error, fallbackMessage) {
  return failure(error?.code === 'ENOENT' ? 'GRAPHIFY_NOT_INSTALLED' : (error?.code ?? 'COMMAND_FAILED'), String(error?.message ?? fallbackMessage));
}

async function readJson(path) {
  try {
    return { ok: true, value: JSON.parse(await readFile(path, 'utf8')) };
  } catch {
    return { ok: false };
  }
}

async function settle(promise) {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error };
  }
}

function runCommand(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, shell: false, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else reject(Object.assign(new Error(stderr.trim() || `Command failed with exit code ${code}.`), { code: 'COMMAND_FAILED' }));
    });
  });
}
