import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const releaseDir = resolve(root, 'dist', 'release');
const zipPath = resolve(root, 'dist', 'release.zip');

if (!existsSync(releaseDir)) {
  console.error('release dir missing — run npm run release:build first');
  process.exit(1);
}

mkdirSync(resolve(root, 'dist'), { recursive: true });
if (existsSync(zipPath)) rmSync(zipPath, { force: true });

if (process.platform === 'win32') {
  const escapedZip = zipPath.replace(/'/g, "''");
  const escapedDir = releaseDir.replace(/'/g, "''");
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${escapedDir}\\*' -DestinationPath '${escapedZip}' -Force"`,
    { stdio: 'inherit' }
  );
} else {
  execSync(`zip -r "${zipPath}" .`, { cwd: releaseDir, stdio: 'inherit' });
}

console.log(`release zip at ${zipPath}`);
