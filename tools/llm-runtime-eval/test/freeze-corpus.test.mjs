import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { frozenRoleCorpusJson, rebuildFrozenRoleCorpus } from
  '../src/freeze-corpus.mjs';

const corpusPath = new URL('../../../data/model-evals/llm-runtime/frozen-role-requests-v1.json', import.meta.url);

test('frozen role regeneration is byte-stable and preserves fixture data', async () => {
  const source = await readFile(corpusPath, 'utf8');
  const corpus = JSON.parse(source);
  const first = frozenRoleCorpusJson(await rebuildFrozenRoleCorpus(corpus));
  const second = frozenRoleCorpusJson(await rebuildFrozenRoleCorpus(corpus));
  assert.equal(first, second);
  assert.equal(first, source, 'checked-in frozen corpus must match production builders');

  const generated = JSON.parse(first);
  assert.equal(generated.fixtures.length, corpus.fixtures.length);
  for (let i = 0; i < corpus.fixtures.length; i += 1) {
    const { messages: _oldMessages, ...original } = corpus.fixtures[i];
    const { messages: _newMessages, ...rebuilt } = generated.fixtures[i];
    assert.deepEqual(rebuilt, original, corpus.fixtures[i].id);
  }
});
