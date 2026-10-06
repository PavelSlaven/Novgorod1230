import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const taskRoot = '/srv/novgorod-work/worktrees/turn-scene-fix';
const captureScript = '/srv/novgorod-work/fleet/tasks/turn-scene-fix/out/bench/scene-refresh/capture.mjs';
const baseRoot = '/tmp/turn-scene-base-a32';
const baseHead = 'a32c0c6eeaf67fb40c17da0461089871af95abc4';

test('capture production provider payloads before and after turn scene changes',
  { timeout: 90 * 60 * 1000 }, async () => {
    for (const [checkout, head] of [[baseRoot, baseHead], [taskRoot, null]]) {
      const args = [captureScript, checkout, ...(head == null ? [] : [head])];
      const env = { ...process.env };
      delete env.NODE_TEST_CONTEXT;
      const result = spawnSync(process.execPath, args, {
        cwd: taskRoot,
        encoding: 'utf8',
        timeout: 40 * 60 * 1000,
        maxBuffer: 64 * 1024 * 1024,
        env
      });
      assert.equal(result.error, undefined, result.error?.message);
      assert.equal(result.status, 0,
        `${resolve(captureScript)} failed for ${checkout}:\n${result.stderr}\n${result.stdout}`);
      const captureResult = JSON.parse(result.stdout.trim().split(/\r?\n/u).at(-1));
      const capture = JSON.parse(await readFile(captureResult.capture_file, 'utf8'));
      assert.equal(capture.test_status, 'passed');
      assert.equal(capture.test_exit_code, 0);
      assert.equal(capture.response_stubbed, true);
      assert.equal(capture.provider_payloads.filter(({ role_id }) =>
        role_id === 'gameplay_narrator').length, 4);
      assert.equal(JSON.stringify(capture.provider_payloads)
        .includes('destination_site_origin'), false,
      'transient destination origin must not enter narrator provider payloads');
    }
  });
