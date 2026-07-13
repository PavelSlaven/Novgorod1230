import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  REQUIRED_NOVGOROD_G1_G4_TSV,
  checkNovgorodG1G4ImportSourceFiles,
  resolvePartyDatabaseConfig,
  validateNewGameEnvironment
} from '../src/world/new-game-prerequisites.js';

test('new-game environment requires postgres world_base runtime source', () => {
  const result = validateNewGameEnvironment({
    WORLD_DATA_SOURCE: 'fs',
    DATABASE_URL: 'postgresql://world',
    DEEPSEEK_API_KEY: 'key',
    PARTY_DATABASE_URL: 'postgresql://party'
  });

  assert.equal(result.ok, false);
  assert.match(result.errors[0], /WORLD_DATA_SOURCE/u);
});

test('party DB resolver matches documented seed fallback order', () => {
  assert.deepEqual(resolvePartyDatabaseConfig({
    PARTY_DATABASE_URL: 'postgresql://party'
  }), { url: 'postgresql://party', source: 'PARTY_DATABASE_URL', usesFallback: false });

  assert.deepEqual(resolvePartyDatabaseConfig({
    WORLD_DB_ADMIN_URL: 'postgresql://admin',
    DATABASE_URL: 'postgresql://world'
  }), { url: 'postgresql://admin', source: 'WORLD_DB_ADMIN_URL', usesFallback: true });

  assert.deepEqual(resolvePartyDatabaseConfig({
    DATABASE_URL: 'postgresql://world'
  }), { url: 'postgresql://world', source: 'DATABASE_URL', usesFallback: true });
});

test('Novgorod G1-G4 source file check reports missing TSV files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'novgorod-g1-g4-'));
  try {
    await writeFile(join(dir, REQUIRED_NOVGOROD_G1_G4_TSV[0]), 'id\n');
    const result = await checkNovgorodG1G4ImportSourceFiles(process.cwd(), {
      RUS13_NOVGOROD_G1_G4_TSV_ROOT: dir
    });

    assert.equal(result.ok, false);
    assert.equal(result.missing.length, REQUIRED_NOVGOROD_G1_G4_TSV.length - 1);
    assert.ok(!result.missing.includes(REQUIRED_NOVGOROD_G1_G4_TSV[0]));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
