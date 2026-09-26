import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const stage24 = new URL('../src/stages/stage-24-party-db-write-plan/code/', import.meta.url);

test('Stage 24 remains write-plan serializer, not item materializer', async () => {
  const source = await readFile(new URL('build-lower-dvina-trace-phase-1a-plan.js',
    stage24), 'utf8');
  assert.doesNotMatch(source, /@rus\/items-property|allocationItemId|materialize.*item/iu);
  await assert.rejects(readFile(new URL('procedural-actor-allocation.js', stage24)),
    { code: 'ENOENT' });
  const stage16 = await readFile(new URL('../src/stages/stage-16-item-placement/'
    + 'finalize-procedural-actor-equipment.js', import.meta.url), 'utf8');
  assert.match(stage16, /@rus\/items-property/u);
  assert.match(stage16, /base_attributes/u);
});
