import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const outDir = resolve(root, 'dist', 'audit-pack');
const excludes = [
  '.env',
  '.env.local',
  '.git',
  'data',
  'tmp',
  'dist',
  'node_modules'
];

const excludeArgs = excludes.flatMap((item) => ['-xr!', item]).join(' ');

if (!existsSync(resolve(root, 'dist'))) {
  mkdirSync(resolve(root, 'dist'), { recursive: true });
}

const archive = resolve(outDir, 'audit-pack.zip');
const command = `tar -a -c -f "${archive}" ${excludeArgs} -C "${root}" .`;

execSync(command, { stdio: 'inherit' });
writeFileSync(resolve(outDir, 'README.txt'), 'Audit pack excludes secrets, git metadata, runtime data and dist artifacts.\n', 'utf8');
console.log(`audit pack created at ${archive}`);
