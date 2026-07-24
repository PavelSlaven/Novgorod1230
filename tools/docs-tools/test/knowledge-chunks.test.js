import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCorpusChunks } from '../src/knowledge-chunks.js';

test('knowledge chunks omit explicitly archived retrieval-excluded ranges and preserve source lines', () => {
  const chunks = buildCorpusChunks({
    'DOCUMENTS/example.md': [
      '# Current rule',
      '',
      'visible-current',
      '',
      '<!-- knowledge-retrieval-exclude:start -->',
      '# Archived rule',
      '',
      'forbidden-legacy-text',
      '<!-- knowledge-retrieval-exclude:end -->',
      '',
      '# Current continuation',
      '',
      'visible-continuation'
    ].join('\n')
  });

  assert.equal(chunks.some(({ text }) => text.includes('forbidden-legacy-text')), false);
  assert.equal(chunks.some(({ text }) => text.includes('knowledge-retrieval-exclude')), false);
  const continuation = chunks.find(({ text }) => text.includes('visible-continuation'));
  assert.equal(continuation.line_start, 11);
  assert.equal(continuation.line_end, 13);
});

test('knowledge chunks reject unbalanced retrieval exclusion markers', () => {
  assert.throws(
    () => buildCorpusChunks({
      'DOCUMENTS/example.md': '# Current\n<!-- knowledge-retrieval-exclude:start -->\nlegacy'
    }),
    /unbalanced knowledge retrieval exclusion/u
  );
});
