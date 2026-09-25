import { spawnSync } from 'node:child_process';

// GS §26.1: a test killed mid-run (agent timeout, Ctrl+C) never reaches t.after, so its container keeps running.
// Every test `docker run` is labelled with the owning process pid; containers of dead owners are removed
// before the next test container starts. Unlabelled containers (compose projects, local play) are never touched.
export const TEST_OWNER_LABEL = 'com.pavelslaven.novgorod1230.test-owner-pid';

export function reapOrphanTestContainers() {
  const listed = spawnSync('docker', ['ps', '-a', '--filter', `label=${TEST_OWNER_LABEL}`,
    '--format', `{{.ID}} {{.Label "${TEST_OWNER_LABEL}"}}`], { encoding: 'utf8', timeout: 30_000 });
  for (const line of (listed.stdout ?? '').split('\n')) {
    const [id, pid] = line.trim().split(' ');
    if (id && !ownerAlive(pid)) spawnSync('docker', ['rm', '-fv', id], { timeout: 30_000 });
  }
}

function ownerAlive(pid) {
  if (!/^[1-9]\d*$/u.test(pid ?? '')) return true; // unreadable owner is never reaped
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH'; // EPERM: process exists but belongs to someone else
  }
}

let reaped = false;

// Spread into `docker run` args: `docker(['run', ...testContainerLabel(), '-d', ...])`.
export function testContainerLabel() {
  if (!reaped) {
    reaped = true;
    reapOrphanTestContainers();
  }
  return ['--label', `${TEST_OWNER_LABEL}=${process.pid}`];
}
