import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { bootstrapV17PresenceE2e } from '../../../test/spatial-v3/presence-rules-production-e2e-fixture.js';
import { loadSpatialV3TargetProductionRelease } from '../src/composition/production-spatial-v3-release-v17.js';

const speechRegisterPath = [
  'world-catalogs', 'novgorod', 'game-base-v1', 'households-psychology-speech',
  'speech_address', 'speech_registers.csv',
];
const expectedRegisterRows = 139;

test('issue #548 speech-register startup rejects missing or mismatched catalog', {
  timeout: 1_800_000,
}, async (t) => {
  const env = await bootstrapV17PresenceE2e(t);
  const loadRelease = (rootDir) => loadSpatialV3TargetProductionRelease({
    worldPool: env.worldPool,
    itemApproval: env.approvals.itemApproval,
    actorApproval: env.approvals.actorApproval,
    ...(rootDir == null ? {} : { rootDir }),
  });

  await t.test('green: штатный root загружает pinned CSV', async () => {
    const context = await loadRelease(env.rootDir);
    assertSpeechRegistersLoaded(context);
  });

  await t.test('green: sparse root сохраняет данные и читает CSV при чужом cwd', async (tCase) => {
    const sparseRoot = await createSparseDataRoot(env.rootDir, 'valid');
    tCase.after(() => rm(sparseRoot, { recursive: true, force: true }));
    const previousCwd = process.cwd();
    try {
      process.chdir(env.dataRoot);
      const context = await loadRelease(sparseRoot);
      assertSpeechRegistersLoaded(context);
    } finally {
      process.chdir(previousCwd);
    }
  });

  await t.test('ожидаемо красный, issue #548: missing CSV fails startup', async (tCase) => {
    const sparseRoot = await createSparseDataRoot(env.rootDir, 'missing');
    tCase.after(() => rm(sparseRoot, { recursive: true, force: true }));
    const outcome = await captureReleaseOutcome(() => loadRelease(sparseRoot));
    await assertStartupRejectsSpeechCatalog(outcome, tCase, 'unavailable');
  });

  await t.test('ожидаемо красный, issue #548: mismatched CSV pin fails startup', async (tCase) => {
    const sparseRoot = await createSparseDataRoot(env.rootDir, 'mismatch');
    tCase.after(() => rm(sparseRoot, { recursive: true, force: true }));
    const outcome = await captureReleaseOutcome(() => loadRelease(sparseRoot));
    await assertStartupRejectsSpeechCatalog(outcome, tCase, 'pin_mismatch');
  });
});

function assertSpeechRegistersLoaded(context) {
  const starts = context.runtime.starts?.length ? context.runtime.starts : [context.runtime];
  assert.ok(starts.length > 0, 'target release must load at least one authored start');
  for (const start of starts) {
    assert.equal(start.materialization_inputs.npc_speech_registers.length,
      expectedRegisterRows);
  }
}

async function createSparseDataRoot(rootDir, registerMode) {
  const sparseRoot = await mkdtemp(join(tmpdir(), 'army-548-speech-register-'));
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
        continue;
      }
      if (registerMode === 'missing') continue;
      if (registerMode === 'mismatch') {
        const original = await readFile(source);
        await writeFile(target, Buffer.concat([original, Buffer.from('\n')]));
        continue;
      }
      await symlink(source, target, 'file');
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

async function captureReleaseOutcome(load) {
  const diagnostics = [];
  const previousError = console.error;
  console.error = (...args) => {
    if (args[0] === '[game-server] NPC speech register catalog unavailable') {
      diagnostics.push({ reason: args[1]?.reason });
      return;
    }
    previousError(...args);
  };
  try {
    return { status: 'fulfilled', value: await load(), diagnostics };
  } catch (error) {
    return { status: 'rejected', error, diagnostics };
  } finally {
    console.error = previousError;
  }
}

async function assertStartupRejectsSpeechCatalog(outcome, tCase, expectedDiagnosticReason) {
  if (outcome.diagnostics.length > 0) {
    tCase.diagnostic(`speech-register diagnostic count=${outcome.diagnostics.length}, reason=${
      outcome.diagnostics.map(({ reason }) => reason).join(',')}`);
  }
  if (outcome.status === 'rejected' && !isSpeechRegisterStartupError(outcome.error)) {
    throw outcome.error;
  }
  if (outcome.status === 'fulfilled') {
    const starts = outcome.value.runtime.starts?.length
      ? outcome.value.runtime.starts : [outcome.value.runtime];
    assert.ok(starts.length > 0, 'target release must load at least one authored start');
    for (const start of starts) {
      assert.deepEqual(start.materialization_inputs.npc_speech_registers, [],
        'fail-soft startup currently drops registers for every loaded start');
    }
    assert.equal(outcome.diagnostics.length, 1);
    assert.equal(outcome.diagnostics[0].reason, expectedDiagnosticReason);
  }
  await assert.rejects(
    outcome.status === 'rejected' ? Promise.reject(outcome.error) : Promise.resolve(outcome.value),
    isSpeechRegisterStartupError,
    'startup must reject when the pinned speech-register catalog is unavailable',
  );
}

function isSpeechRegisterStartupError(error) {
  const text = `${error?.code ?? ''} ${error?.message ?? ''}`;
  return /speech|реч/iu.test(text) && /register|регистр/iu.test(text);
}
