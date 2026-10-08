import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadNpcSpeechRegisters, NPC_SPEECH_REGISTERS_PIN } from '@rus/runtime-catalog';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

test('ожидаемо красный, issue #548: default speech-register loader resolves from process.cwd()', {
  concurrency: false
}, async (t) => {
  const originalCwd = process.cwd();
  let foreignCwd;
  try {
    process.chdir(repositoryRoot);
    const baselineDiagnostics = [];
    const baseline = await loadNpcSpeechRegisters({
      onDiagnostic: (diagnostic) => baselineDiagnostics.push(diagnostic.reason)
    });
    t.diagnostic(`approved baseline rows=${baseline.length}; diagnostics=${baselineDiagnostics.join(',') || 'none'}`);
    assert.ok(baseline.length > 0, 'module-derived repository root must load the approved pinned CSV');

    foreignCwd = await mkdtemp(join(tmpdir(), 'issue-548-speech-register-cwd-'));
    process.chdir(foreignCwd);

    const explicitRootDiagnostics = [];
    const explicitRoot = await loadNpcSpeechRegisters({
      rootDir: repositoryRoot,
      onDiagnostic: (diagnostic) => explicitRootDiagnostics.push(diagnostic.reason)
    });
    t.diagnostic(`explicit rootDir rows=${explicitRoot.length}; diagnostics=${explicitRootDiagnostics.join(',') || 'none'}`);
    assert.deepEqual(explicitRoot, baseline,
      'explicit repository root must load the same approved rows from a foreign cwd');
    assert.deepEqual(explicitRootDiagnostics, []);

    const foreignDiagnostics = [];
    const fromForeignCwd = await loadNpcSpeechRegisters({
      onDiagnostic: (diagnostic) => foreignDiagnostics.push(diagnostic.reason)
    });
    t.diagnostic(`default foreign cwd rows=${fromForeignCwd.length}; diagnostics=${foreignDiagnostics.join(',') || 'none'}; pinned path=${NPC_SPEECH_REGISTERS_PIN.path}`);
    assert.deepEqual(fromForeignCwd, baseline,
      'default loader from a foreign cwd must retain the approved speech registers (issue #548)');
  } finally {
    process.chdir(originalCwd);
    if (foreignCwd) await rm(foreignCwd, { recursive: true, force: true });
  }
});
