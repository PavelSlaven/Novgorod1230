import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

// Owner decision 2026-09-29 (AI §16, MODULE_RULES item 7): there is no file-size threshold.
test('architecture check has no file-size findings and does not fail on file size', async () => {
  const source = await readFile(new URL('../../tools/architecture/check-boundaries.mjs',
    import.meta.url), 'utf8');
  assert.doesNotMatch(source,
    /split\('\\n'\)\.length|Buffer\.byteLength|hardBytes|Architecture warnings/u);
  const run = spawnSync(process.execPath, ['tools/architecture/check-boundaries.mjs'], {
    encoding: 'utf8'
  });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.doesNotMatch(run.stdout + run.stderr, /warning|lines|bytes|size/iu);
});
