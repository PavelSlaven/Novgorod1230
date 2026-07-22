import { appendFile } from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const execFile = promisify(execFileCallback);
const MANIFEST_PATH = 'docs/migration/spatial-v3/release-evidence.v1.json';
const SCOPE_PATH = 'docs/migration/spatial-v3/p28-evidence-scope.v1.json';

export function classifyP28CiProfile(changedPaths, allowedEvidenceChildPaths) {
  if (!Array.isArray(changedPaths) || !Array.isArray(allowedEvidenceChildPaths)) return 'full';
  const changed = [...new Set(changedPaths.filter(Boolean))];
  const allowed = new Set([MANIFEST_PATH, ...allowedEvidenceChildPaths]);
  return changed.length > 0 && changed.includes(MANIFEST_PATH) && changed.every((path) => allowed.has(path))
    ? 'evidence_only'
    : 'full';
}

async function gitText(args) {
  const { stdout } = await execFile('git', args, { cwd: process.cwd(), windowsHide: true, encoding: 'utf8' });
  return stdout.trim();
}

async function main() {
  let profile = 'full';
  try {
    const scope = JSON.parse(await gitText(['show', `HEAD^:${SCOPE_PATH}`]));
    const changed = (await gitText(['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'])).split(/\r?\n/u).filter(Boolean);
    if (scope?.schema === 'rus.spatial-v3.p28-evidence-scope.v1' && scope?.version === 1) {
      profile = classifyP28CiProfile(changed, scope.allowed_evidence_child_paths);
    }
  } catch {
    profile = 'full';
  }
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `profile=${profile}\n`, 'utf8');
  console.log(profile);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
