import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const isWindows = process.platform === 'win32';
if (isWindows) {
  const launcherTest = spawnSync('pwsh.exe', ['-NoProfile', '-File',
    path.join(root, 'tools/cataclysm-prototype/test_dev_launcher_windows.ps1')],
  { cwd: root, stdio: 'inherit' });
  if (launcherTest.error || launcherTest.status !== 0) {
    if (launcherTest.error) console.error(`pwsh.exe could not run: ${launcherTest.error.message}`);
    process.exit(launcherTest.status ?? 1);
  }
}
const command = isWindows ? 'wsl.exe' : 'python3';
const args = isWindows
  ? ['--exec', 'bash', '-lc', `cd "$(wslpath -a '${root.replaceAll("'", "'\\''")}')" && python3 -m unittest discover -s tools/cataclysm-prototype -p 'test_*.py'`]
  : ['-m', 'unittest', 'discover', '-s', 'tools/cataclysm-prototype', '-p', 'test_*.py'];
const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
if (result.error) {
  console.error(`${command} could not run: ${result.error.message}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
