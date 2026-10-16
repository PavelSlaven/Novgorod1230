import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const compilerUrl = new URL('../scripts/compile-novgorod.mjs', import.meta.url);
const nodeFile = 'novgorod_graph_nodes_g1_g4_full_v6.tsv';
const edgeFile = 'novgorod_graph_edges_g1_g4_full_v6.tsv';

async function dataset(root) {
  const source = path.join(root, 'source_tsv');
  await mkdir(source, { recursive: true });
  await writeFile(path.join(source, nodeFile), 'id\tscale_level\tparent_node_id\ttitle\tnode_type\n');
  await writeFile(path.join(source, edgeFile), 'id\tfrom_node_id\tto_node_id\tedge_type\n');
  return source;
}

async function withCorpus(fn) {
  const root = await mkdtemp(path.join(tmpdir(), 'novgorod-discovery-'));
  const repositoryRoot = path.join(root, 'repository');
  const corpusRoot = path.join(repositoryRoot, 'corpus');
  await mkdir(corpusRoot, { recursive: true });
  try {
    return await fn({ root, repositoryRoot, corpusRoot });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function discovery() {
  // The old script runs the CLI on import. Check the approved export seam before
  // importing it, so this red test cannot compile the real repository's data.
  const source = await readFile(compilerUrl, 'utf8');
  assert.match(source, /\bexport\b[\s\S]*\bdiscoverDefaultSource\b/,
    'compile-novgorod must export discoverDefaultSource for isolated discovery tests');
  return withCorpus(async (context) => {
    // If an incomplete export refactor still runs the CLI, confine that run to
    // disposable fixtures and reject it instead of touching real catalog data.
    const input = await dataset(path.join(context.corpusRoot, 'import-fixture'));
    const output = path.join(context.root, 'unexpected-cli-output');
    const originalArgv = process.argv;
    let module;
    try {
      process.argv = [process.execPath, compilerUrl.pathname,
        `--source=${input}`, `--output=${output}`, '--fast'];
      module = await import(compilerUrl.href);
    } finally {
      process.argv = originalArgv;
    }
    await assert.rejects(access(output), { code: 'ENOENT' }, 'import must not execute compilation');
    assert.equal(typeof module.discoverDefaultSource, 'function');
    return module.discoverDefaultSource;
  });
}

// The internal authoring seam takes { corpusRoot, repositoryRoot }; importing
// it must not execute the CLI or require the layout engine.
test('default TSV discovery supports in-repository symlinks and rejects ambiguity', async (t) => {
  const discoverDefaultSource = await discovery();
  await t.test('one ordinary dataset', () => withCorpus(async (context) => {
    const source = await dataset(path.join(context.corpusRoot, 'ordinary'));
    assert.equal(await discoverDefaultSource(context), source);
  }));
  await t.test('one linked dataset inside the repository', () => withCorpus(async (context) => {
    const target = path.join(context.repositoryRoot, 'targets', 'linked-dataset');
    await dataset(target);
    const entry = path.join(context.corpusRoot, 'linked');
    await symlink(target, entry, 'dir');
    assert.equal(await discoverDefaultSource(context), path.join(entry, 'source_tsv'));
  }));
  await t.test('ordinary and linked names of the same dataset are ambiguous', () => withCorpus(async (context) => {
    const ordinary = path.join(context.corpusRoot, 'ordinary');
    await dataset(ordinary);
    await symlink(ordinary, path.join(context.corpusRoot, 'linked'), 'dir');
    await assert.rejects(discoverDefaultSource(context), /found 2/);
  }));
  await t.test('two linked names of the same dataset are ambiguous', () => withCorpus(async (context) => {
    const target = path.join(context.repositoryRoot, 'targets', 'shared');
    await dataset(target);
    await symlink(target, path.join(context.corpusRoot, 'first'), 'dir');
    await symlink(target, path.join(context.corpusRoot, 'second'), 'dir');
    await assert.rejects(discoverDefaultSource(context), /found 2/);
  }));
  await t.test('linked dataset outside the repository is explicitly rejected', () => withCorpus(async (context) => {
    // A prefix-only containment check would incorrectly admit this sibling.
    const outside = `${context.repositoryRoot}-outside`;
    await dataset(outside);
    await symlink(outside, path.join(context.corpusRoot, 'outside-entry'), 'dir');
    await assert.rejects(discoverDefaultSource(context), (error) => {
      assert.match(error.message, /outside-entry/);
      assert.match(error.message.replaceAll('outside-entry', ''), /outside|external|escape|вне|за пределами/i);
      assert.doesNotMatch(error.message, /found 0/);
      return true;
    });
  }));
  await t.test('broken and file links do not hide one valid dataset', () => withCorpus(async (context) => {
    const source = await dataset(path.join(context.corpusRoot, 'ordinary'));
    const file = path.join(context.repositoryRoot, 'plain-file');
    await writeFile(file, 'not a dataset');
    await symlink(file, path.join(context.corpusRoot, 'file-link'));
    await symlink(path.join(context.repositoryRoot, 'missing'), path.join(context.corpusRoot, 'broken-link'), 'dir');
    assert.equal(await discoverDefaultSource(context), source);
  }));
});
