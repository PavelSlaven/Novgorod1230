// Deterministic syntax check for changed files: `node --check` for JS, JSON.parse for JSON.
// Usage: node scripts/check-syntax.mjs [--base <ref>] [file ...]
// Without files it checks tracked and untracked files changed against the merge-base with --base (default origin/main).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const baseIndex = args.indexOf('--base');
const base = baseIndex === -1 ? 'origin/main' : args[baseIndex + 1];
const explicit = args.filter((arg, index) => index !== baseIndex && index !== baseIndex + 1);

const git = (...gitArgs) => execFileSync('git', gitArgs, { encoding: 'utf8' }).split('\n').filter(Boolean);
const files = explicit.length > 0 ? explicit : [...new Set([
  ...git('diff', '--name-only', '--diff-filter=ACMR', git('merge-base', base, 'HEAD')[0]),
  ...git('ls-files', '--others', '--exclude-standard')
])];

const failures = [];
let checked = 0;
for (const file of files.filter((path) => /\.(?:c?js|mjs|json)$/u.test(path) && existsSync(path))) {
  checked += 1;
  if (file.endsWith('.json')) {
    try {
      JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
      failures.push(`${file}: ${error.message}`);
    }
    continue;
  }
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${file}: ${result.stderr.trim()}`);
}

for (const failure of failures) console.error(failure);
console.log(`check:syntax: ${checked} file(s), ${failures.length} failure(s)`);
process.exit(failures.length === 0 ? 0 : 1);
