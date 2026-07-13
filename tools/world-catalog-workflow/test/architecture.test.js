import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const src = new URL('../src/', import.meta.url);

test('pure modules have no hidden filesystem, network, time or randomness dependencies', async () => {
  const dir = src.pathname;
  for (const file of await readdir(dir)) {
    if (!file.endsWith('.js') || file === 'cli.js') continue;
    const text = await readFile(join(dir, file), 'utf8');
    assert.doesNotMatch(text, /node:fs|node:http|node:https|fetch\s*\(|Date\.now\s*\(|new Date\s*\(|Math\.random\s*\(/u, file);
  }
});

test('legacy projector does not assign canonical semantic defaults', async () => {
  const text = await readFile(new URL('../src/g1-mask.js', import.meta.url), 'utf8');
  assert.doesNotMatch(text, /control_status:\s*['"][a-z_]+['"]/u);
  assert.doesNotMatch(text, /playability_status:\s*['"][a-z_]+['"]/u);
  assert.doesNotMatch(text, /subregion_id:\s*['"][^'"]+['"]/u);
  assert.match(text, /control_status:\s*null/u);
  assert.match(text, /evidence_status:\s*null/u);
  assert.match(text, /playability_status:\s*null/u);
});
