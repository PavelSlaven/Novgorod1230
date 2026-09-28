import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { validateM2cNpcWaveApproval } from '../../tools/spatial-v3/m2c-npc-wave-approval.mjs';

const VALID = {
  schema_version: 'rus.m2c_npc_wave_approval.v1',
  verdict: 'approve_with_limits',
  source_commit: '3ab1c890c1caee2c1247ee144bf66bd35de705ec',
  authored_by: 'cursor composer-2.5 (executor)',
  checked_by: 'claude-opus-5.5 (reviewer)',
  checked_at: '2026-09-28',
  source_paths: [
    'data/world-catalogs/novgorod/game-base-v1/places-binding/places/place_families.csv',
    'data/world-catalogs/novgorod/game-base-v1/places-binding/places/node_binding.csv',
    'data/world-catalogs/novgorod/game-base-v1/places-binding/presence/presence_rules.csv',
    'data/world-catalogs/novgorod/game-base-v1/households-psychology-speech/households_kinship/relationship_rules.csv',
    'data/world-catalogs/novgorod/game-base-v1/households-psychology-speech/speech_address/address_forms.csv',
    'data/world-catalogs/novgorod/game-base-v1/households-psychology-speech/households_kinship/household_composition_profiles.csv',
    'data/world-catalogs/novgorod/game-base-v1/places-binding/slots/slot_instance_variants.json',
    'data/world-catalogs/novgorod/game-base-v1/nature-materials-weather/weather_climate/water_profiles.csv',
    'data/world-catalogs/novgorod/game-base-v1/fauna-fish-invertebrates-livestock/fauna/phase_activity.csv',
    'data/world-catalogs/novgorod/game-base-v1/fauna-mammals-birds/fauna/phase_activity.csv',
  ],
  references: {
    game_base_status: 'data/world-catalogs/novgorod/game-base-v1/STATUS.md',
    places_binding: 'data/world-catalogs/novgorod/game-base-v1/places-binding/VERIFICATION.md',
    households_psychology_speech: 'data/world-catalogs/novgorod/game-base-v1/households-psychology-speech/VERIFICATION.md',
    nature_materials_weather: 'data/world-catalogs/novgorod/game-base-v1/nature-materials-weather/VERIFICATION.md',
    fauna_fish_invertebrates_livestock: 'data/world-catalogs/novgorod/game-base-v1/fauna-fish-invertebrates-livestock/VERIFICATION.md',
    fauna_mammals_birds: 'data/world-catalogs/novgorod/game-base-v1/fauna-mammals-birds/VERIFICATION.md',
  },
};

async function withApproval(overrides, fn) {
  const dir = await mkdtemp(join(tmpdir(), 'm2c-approval-'));
  const path = join(dir, 'approval.json');
  await writeFile(path, JSON.stringify({ ...VALID, ...overrides }));
  try {
    return await fn(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('m2c-npc-wave approval accepts reviewer-signed record', async () => {
  const result = await validateM2cNpcWaveApproval({ root: process.cwd() });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
});

test('M2C_WAVE_APPROVAL_AUTHORED_BY_MISSING', async () => {
  await withApproval({ authored_by: '' }, async (path) => {
    const result = await validateM2cNpcWaveApproval({ root: process.cwd(), approvalPath: path });
    assert.ok(result.errors.some((error) => error.code === 'M2C_WAVE_APPROVAL_AUTHORED_BY_MISSING'));
  });
});

test('M2C_WAVE_APPROVAL_AUTHORED_BY_FORMAT_INVALID', async () => {
  await withApproval({ authored_by: 'codex-gpt-6-luna (reviewer)' }, async (path) => {
    const result = await validateM2cNpcWaveApproval({ root: process.cwd(), approvalPath: path });
    assert.ok(result.errors.some((error) => error.code === 'M2C_WAVE_APPROVAL_AUTHORED_BY_FORMAT_INVALID'));
  });
});

test('M2C_WAVE_APPROVAL_CHECKED_BY_FORMAT_INVALID', async () => {
  await withApproval({ checked_by: 'executor_draft_2026' }, async (path) => {
    const result = await validateM2cNpcWaveApproval({ root: process.cwd(), approvalPath: path });
    assert.ok(result.errors.some((error) => error.code === 'M2C_WAVE_APPROVAL_CHECKED_BY_FORMAT_INVALID'));
  });
});

test('M2C_WAVE_APPROVAL_CHECKED_BY_EQUALS_AUTHORED', async () => {
  await withApproval({
    authored_by: 'same person (reviewer)',
    checked_by: 'same person (reviewer)',
  }, async (path) => {
    const result = await validateM2cNpcWaveApproval({ root: process.cwd(), approvalPath: path });
    assert.ok(result.errors.some((error) => error.code === 'M2C_WAVE_APPROVAL_CHECKED_BY_EQUALS_AUTHORED'));
  });
});

test('M2C_WAVE_APPROVAL_CHECKED_AT_INVALID', async () => {
  await withApproval({ checked_at: 'not-a-date' }, async (path) => {
    const result = await validateM2cNpcWaveApproval({ root: process.cwd(), approvalPath: path });
    assert.ok(result.errors.some((error) => error.code === 'M2C_WAVE_APPROVAL_CHECKED_AT_INVALID'));
  });
});
