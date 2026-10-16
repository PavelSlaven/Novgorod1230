import { spawnSync } from 'node:child_process';
import { readlinkSync } from 'node:fs';

// GS §26.1: a test killed mid-run (agent timeout, Ctrl+C) never reaches t.after, so its container keeps running.
// Every test `docker run` is labelled with its PID namespace and process pid; dead owners in this namespace are
// removed before the next test container starts. Unlabelled or unreadable labels are never touched.
export const TEST_OWNER_LABEL = 'com.pavelslaven.novgorod1230.test-owner-pid';
export const TEST_OWNER_PID_NAMESPACE = (() => {
  if (process.platform !== 'linux') return `host-${process.platform}`;
  try { return readlinkSync('/proc/self/ns/pid', 'utf8'); }
  catch { return null; }
})();

export function reapOrphanTestContainers() {
  const listed = spawnSync('docker', ['ps', '-a', '--filter', `label=${TEST_OWNER_LABEL}`,
    '--format', `{{.ID}} {{.Label "${TEST_OWNER_LABEL}"}}`], { encoding: 'utf8', timeout: 30_000 });
  for (const line of (listed.stdout ?? '').split('\n')) {
    const [id, owner] = line.trim().split(' ');
    if (id && !ownerAlive(owner)) spawnSync('docker', ['rm', '-fv', id], { timeout: 30_000 });
  }
}

function ownerAlive(owner) {
  const separator = owner?.lastIndexOf(':') ?? -1;
  if (!TEST_OWNER_PID_NAMESPACE || separator < 0 || owner.slice(0, separator) !== TEST_OWNER_PID_NAMESPACE) return true;
  const pid = owner.slice(separator + 1);
  if (!/^[1-9]\d*$/u.test(pid ?? '')) return true; // unreadable owner is never reaped
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH'; // EPERM: process exists but belongs to someone else
  }
}

// Opt-in for hosts whose AppArmor docker-default profile blocks PostgreSQL unix sockets
// (Debian 13, AppArmor 4.1 + Docker 26.1): only throwaway test containers, never set in CI.
const apparmorUnconfined = () => (process.env.NOVGOROD_TEST_DOCKER_APPARMOR_UNCONFINED === '1'
  ? ['--security-opt', 'apparmor=unconfined'] : []);

let reaped = false;

// Spread into `docker run` args: `docker(['run', ...testContainerLabel(), '-d', ...])`.
export function testContainerLabel() {
  if (!reaped) {
    reaped = true;
    reapOrphanTestContainers();
  }
  return ['--label', `${TEST_OWNER_LABEL}=${TEST_OWNER_PID_NAMESPACE ?? 'unavailable'}:${process.pid}`, ...apparmorUnconfined()];
}
