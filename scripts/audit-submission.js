import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const releaseZip = resolve(root, 'dist', 'release.zip');

function run(command) {
  execSync(command, { cwd: root, stdio: 'inherit' });
}

const zipArgIndex = process.argv.indexOf('--zip');
if (zipArgIndex >= 0) {
  const zipPath = process.argv[zipArgIndex + 1];
  if (!zipPath) {
    console.error('audit:submission --zip requires a path');
    process.exit(1);
  }
  run(`node scripts/release-guard.js --zip "${zipPath}"`);
  console.log('audit:submission ok');
  process.exit(0);
}

run('node scripts/release-guard.js');
if (!existsSync(releaseZip)) {
  run('npm run release:build');
  run('node scripts/zip-release.js');
}
run('npm run release:verify');
run(`node scripts/release-guard.js --zip "${releaseZip}"`);
console.log('audit:submission ok');
