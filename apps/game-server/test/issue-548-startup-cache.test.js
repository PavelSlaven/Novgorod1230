import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { bootstrapV17PresenceE2e } from '../../../test/spatial-v3/presence-rules-production-e2e-fixture.js';
import { loadNpcSpeechRegisters } from '@rus/runtime-catalog';
import { loadSpatialV3TargetProductionRelease } from
  '../src/composition/production-spatial-v3-release-v17.js';

const speechRegisterPath = [
  'world-catalogs', 'novgorod', 'game-base-v1', 'households-psychology-speech',
  'speech_address', 'speech_registers.csv',
];

test('issue #548 v17 startup rejects a cached unavailable speech catalog every time', {
  timeout: 1_800_000,
}, async (t) => {
  const env = await bootstrapV17PresenceE2e(t);
  for (const mode of ['missing', 'mismatch']) {
    await t.test(`${mode} catalog remains a startup error after cache warm-up`, async (tCase) => {
      const rootDir = await createSparseDataRoot(env.rootDir, mode);
      tCase.after(() => rm(rootDir, { recursive: true, force: true }));
      const diagnostics = [];
      const cached = await loadNpcSpeechRegisters({
        rootDir,
        onDiagnostic: ({ reason }) => diagnostics.push(reason),
      });
      assert.deepEqual(cached, []);
      assert.equal(diagnostics.length, 1);
      assert.equal(diagnostics[0], mode === 'missing' ? 'unavailable' : 'pin_mismatch');

      const loadStartup = () => loadSpatialV3TargetProductionRelease({
        worldPool: env.worldPool,
        itemApproval: env.approvals.itemApproval,
        actorApproval: env.approvals.actorApproval,
        rootDir,
      });
      for (let attempt = 0; attempt < 2; attempt += 1) {
        await assert.rejects(loadStartup(), (error) => {
          assert.equal(error.code, 'SPATIAL_V3_TARGET_NPC_SPEECH_REGISTERS_REQUIRED');
          assert.equal(error.status, 503);
          return true;
        }, `startup attempt ${attempt + 1} must reject the cached empty catalog`);
        assert.strictEqual(await loadNpcSpeechRegisters({ rootDir }), cached,
          'failed startup must leave the cached empty result unchanged');
        assert.equal(diagnostics.length, 1,
          'cached failures must retain the single diagnostic emitted at warm-up');
      }
    });
  }
});

async function createSparseDataRoot(rootDir, registerMode) {
  const sparseRoot = await mkdtemp(join(tmpdir(), 'issue-548-startup-cache-'));
  const sourceData = resolve(rootDir, 'data');
  const targetData = join(sparseRoot, 'data');

  async function mirrorDirectory(sourceDir, targetDir, remainingPath) {
    await mkdir(targetDir, { recursive: true });
    const entries = await readdir(sourceDir, { withFileTypes: true });
    const nextName = remainingPath[0];
    let foundNextPath = false;
    for (const entry of entries) {
      const source = join(sourceDir, entry.name);
      const target = join(targetDir, entry.name);
      if (entry.name !== nextName) {
        await symlink(source, target, entry.isDirectory() ? 'dir' : 'file');
        continue;
      }
      foundNextPath = true;
      if (remainingPath.length > 1) {
        assert.ok(entry.isDirectory(), `expected directory at ${source}`);
        await mirrorDirectory(source, target, remainingPath.slice(1));
      } else if (registerMode === 'missing') {
        continue;
      } else {
        const original = await readFile(source);
        await writeFile(target, Buffer.concat([original, Buffer.from('\n')]));
      }
    }
    assert.ok(foundNextPath, `expected data path at ${join(sourceDir, nextName)}`);
  }

  try {
    await mirrorDirectory(sourceData, targetData, speechRegisterPath);
    return sparseRoot;
  } catch (error) {
    await rm(sparseRoot, { recursive: true, force: true });
    throw error;
  }
}
