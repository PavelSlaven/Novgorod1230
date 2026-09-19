import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('architecture file-size guidelines warn without becoming violations', async () => {
  const source = await readFile(new URL('../../tools/architecture/check-boundaries.mjs',
    import.meta.url), 'utf8');
  const sizeChecks = source.split('\n').filter((line) =>
    /split\('\\n'\)\.length|Buffer\.byteLength|size > hardBytes/u.test(line));
  assert.ok(sizeChecks.length > 0);
  assert.equal(sizeChecks.some((line) => line.includes('violations.push')), false);
  assert.match(source, /Architecture warnings/u);
});
