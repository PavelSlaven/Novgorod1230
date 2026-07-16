import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRepositoryIntelligenceService, RepositoryIntelligenceError } from '../src/index.js';

async function fixture({ knowledgeStatus = 'ready', head = 'a'.repeat(40), manifestCommit = head, graph = true, version = '0.9.17', search } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'rus-repository-intelligence-'));
  const graphPath = resolve(root, 'graphify-out/graph.json');
  const manifestPath = resolve(root, 'generated/repository-intelligence/manifest.json');
  await mkdir(resolve(root, 'generated/repository-intelligence'), { recursive: true });
  if (graph) {
    await mkdir(resolve(root, 'graphify-out'), { recursive: true });
    await writeFile(graphPath, '{"nodes":[],"edges":[]}');
  }
  if (manifestCommit !== null) await writeFile(manifestPath, JSON.stringify({ source_commit: manifestCommit }));
  const calls = [];
  const run = async (command, args) => {
    calls.push({ command, args: [...args] });
    if (command === 'git') return { stdout: `${head}\n`, stderr: '' };
    if (command === 'graphify' && args[0] === '--version') return { stdout: `graphify ${version}\n`, stderr: '' };
    if (command === 'graphify' && args[0] === 'query') return { stdout: 'repository graph result\n', stderr: '' };
    if (command === 'graphify' && args[0] === 'extract') return { stdout: '', stderr: '' };
    throw new Error(`Unexpected command ${command}.`);
  };
  const knowledgeLane = {
    getReadinessStatus: async () => ({ status: knowledgeStatus }),
    searchKnowledge: search ?? (async ({ query }) => ({ results: [{ document_id: 'norm', query }] }))
  };
  return { root, graphPath, manifestPath, calls, run, knowledgeLane, service: createRepositoryIntelligenceService({ root, run, knowledgeLane, graphPath, manifestPath }) };
}

test('status is ready with matching Graphify, graph and commit', async () => {
  const { service } = await fixture();
  const result = await service.status();
  assert.equal(result.ok, true);
  assert.equal(result.graphify.version, '0.9.17');
  assert.deepEqual(result.warnings, []);
});

test('degraded knowledge source is visible warning and navigation remains available', async () => {
  const { service } = await fixture({ knowledgeStatus: 'degraded' });
  const result = await service.status();
  assert.equal(result.ok, true);
  assert.equal(result.warnings[0].code, 'KNOWLEDGE_SOURCE_DEGRADED');
});

test('unavailable knowledge source blocks status', async () => {
  const { service } = await fixture({ knowledgeStatus: 'blocked' });
  const result = await service.status();
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((item) => item.code === 'KNOWLEDGE_SOURCE_UNAVAILABLE'), true);
});

test('missing Graphify executable has a typed failure', async () => {
  const { root, knowledgeLane } = await fixture();
  const service = createRepositoryIntelligenceService({
    root,
    knowledgeLane,
    run: async (command) => {
      if (command === 'graphify') throw Object.assign(new Error('not found'), { code: 'ENOENT' });
      return { stdout: 'a'.repeat(40), stderr: '' };
    }
  });
  const result = await service.status();
  assert.equal(result.errors.some((item) => item.code === 'GRAPHIFY_NOT_INSTALLED'), true);
});

test('wrong Graphify version has a typed failure', async () => {
  const { service } = await fixture({ version: '0.8.49' });
  const result = await service.status();
  assert.equal(result.errors.some((item) => item.code === 'GRAPHIFY_VERSION_MISMATCH'), true);
});

test('manifest for another commit is stale', async () => {
  const { service } = await fixture({ manifestCommit: 'b'.repeat(40) });
  const result = await service.status();
  assert.equal(result.errors.some((item) => item.code === 'REPOSITORY_GRAPH_STALE'), true);
});

test('hybrid query keeps lane results separate and does not mutate input', async () => {
  const { service, calls } = await fixture();
  const input = Object.freeze({ query: 'правила G0–G4' });
  const result = await service.query(input);
  assert.equal(result.ok, true);
  assert.equal(result.partial, false);
  assert.equal(result.knowledge_source.results[0].query, input.query);
  assert.equal(result.graphify.results, 'repository graph result');
  assert.equal(calls.filter((call) => call.command === 'graphify' && call.args[0] === 'query').length, 1);
});

test('partial query preserves graph result when knowledge lane is unavailable', async () => {
  const { service } = await fixture({ search: async () => { throw new Error('knowledge down'); } });
  const result = await service.query({ query: 'repository intelligence' });
  assert.equal(result.ok, true);
  assert.equal(result.partial, true);
  assert.equal(result.knowledge_source.error.code, 'KNOWLEDGE_SOURCE_UNAVAILABLE');
  assert.equal(result.graphify.ok, true);
});

test('query never invokes Graphify when the graph is stale', async () => {
  const { service, calls } = await fixture({ manifestCommit: 'b'.repeat(40) });
  const result = await service.query({ query: 'stale graph' });
  assert.equal(result.graphify.ok, false);
  assert.equal(result.graphify.error.code, 'REPOSITORY_GRAPH_STALE');
  assert.equal(calls.some((call) => call.command === 'graphify' && call.args[0] === 'query'), false);
});

test('build refuses to write a manifest when Graphify creates no graph', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rus-repository-intelligence-build-'));
  const service = createRepositoryIntelligenceService({
    root,
    knowledgeLane: { getReadinessStatus: async () => ({ status: 'ready' }), searchKnowledge: async () => ({ results: [] }) },
    run: async (command, args) => {
      if (command === 'graphify' && args[0] === '--version') return { stdout: 'graphify 0.9.17', stderr: '' };
      if (command === 'graphify' && args[0] === 'extract') return { stdout: '', stderr: '' };
      if (command === 'git') return { stdout: 'a'.repeat(40), stderr: '' };
      throw new Error('unexpected');
    }
  });
  await assert.rejects(() => service.build(), (error) => error.code === 'REPOSITORY_GRAPH_MISSING');
  await assert.rejects(() => readFile(resolve(root, 'generated/repository-intelligence/manifest.json')));
});

test('build writes the manifest after Graphify creates a graph', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rus-repository-intelligence-build-'));
  const graphPath = resolve(root, 'graphify-out/graph.json');
  const manifestPath = resolve(root, 'generated/repository-intelligence/manifest.json');
  const service = createRepositoryIntelligenceService({
    root,
    graphPath,
    manifestPath,
    knowledgeLane: { getReadinessStatus: async () => ({ status: 'ready' }), searchKnowledge: async () => ({ results: [] }) },
    run: async (command, args) => {
      if (command === 'graphify' && args[0] === '--version') return { stdout: 'graphify 0.9.17', stderr: '' };
      if (command === 'graphify' && args[0] === 'extract') {
        await mkdir(resolve(root, 'graphify-out'), { recursive: true });
        await writeFile(graphPath, '{"nodes":[],"edges":[]}');
        return { stdout: '', stderr: '' };
      }
      if (command === 'git') return { stdout: 'a'.repeat(40), stderr: '' };
      throw new Error('unexpected');
    }
  });
  const result = await service.build();
  assert.equal(result.ok, true);
  assert.equal(JSON.parse(await readFile(manifestPath, 'utf8')).source_commit, 'a'.repeat(40));
});

test('empty query fails before either lane runs', async () => {
  const { service } = await fixture();
  await assert.rejects(() => service.query({ query: '' }), (error) => error instanceof RepositoryIntelligenceError && error.code === 'INVALID_ARGUMENT');
});

test('CLI reports invalid commands as JSON on stderr with exit code 2', async () => {
  const child = spawn(process.execPath, ['packages/repository-intelligence/src/cli.js', 'not-a-command'], {
    cwd: process.cwd(),
    shell: false,
    windowsHide: true
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const code = await new Promise((resolveCode, reject) => {
    child.once('error', reject);
    child.once('close', resolveCode);
  });
  assert.equal(code, 2);
  assert.equal(stdout, '');
  assert.equal(JSON.parse(stderr).code, 'INVALID_ARGUMENT');
});
