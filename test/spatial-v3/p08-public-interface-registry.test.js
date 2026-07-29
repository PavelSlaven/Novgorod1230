import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const checker = resolve('tools/spatial-v3/check-p08.mjs');
const registryPath = resolve('docs/migration/spatial-v3/p08-public-interface-registry.json');
const inverseEntrypoint = {
  owner: '@rus/time-events-history',
  entry: '@rus/time-events-history/calendar',
  factory: 'resolveGameTimestampFromCalendarDate',
  method: 'call'
};
const runChecker = (...arguments_) => spawnSync(process.execPath, [checker, ...arguments_], { encoding: 'utf8' });

test('P08 registry exposes the exact inverse calendar owner API and versioned contract', () => {
  const result = runChecker();
  assert.equal(result.status, 0, result.stderr);
  const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
  assert.equal(
    registry.interfaces.some((entry) => JSON.stringify(entry) === JSON.stringify(inverseEntrypoint)),
    true
  );
  assert.deepEqual(registry.owner_contract_refs, [{
    owner: '@rus/time-events-history',
    registry_id: 'rus.time_events_history.declarative_content_contracts.v2',
    revision: 2,
    path: 'packages/time-events-history/src/declarative-content-contracts.v2.json',
    digest: '6e72f137be19f77afa34aa853d9f12c0c8f3d7ce28e11c41c83ecc8ee6369a10'
  }]);
});

test('P08 checker fails closed when the registered inverse owner API is removed', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'p08-registry-'));
  const fixturePath = resolve(directory, 'registry.json');
  try {
    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
    registry.interfaces = registry.interfaces.filter(
      (entry) => JSON.stringify(entry) !== JSON.stringify(inverseEntrypoint)
    );
    writeFileSync(fixturePath, `${JSON.stringify(registry, null, 2)}\n`);
    const result = runChecker('--validation-only', '--registry', fixturePath);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(`${result.stderr}\n${result.stdout}`, /missing @rus\/time-events-history\/calendar:resolveGameTimestampFromCalendarDate\.call/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('P08 checker fails closed when the owner contract digest is desynchronized', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'p08-registry-'));
  const fixturePath = resolve(directory, 'registry.json');
  try {
    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
    registry.owner_contract_refs[0].digest = '0'.repeat(64);
    writeFileSync(fixturePath, `${JSON.stringify(registry, null, 2)}\n`);
    const result = runChecker('--validation-only', '--registry', fixturePath);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(`${result.stderr}\n${result.stdout}`, /owner contract ref set is incomplete or changed/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
