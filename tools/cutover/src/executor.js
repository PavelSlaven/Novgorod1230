import { spawn } from 'node:child_process';

export function runCommand({ root, command, args = [], env = {}, label = command } = {}) {
  const started = Date.now();
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, { cwd: root, env: { ...process.env, NODE_ENV: 'test', ...env }, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => resolvePromise({ label, status: 'failed', exit_code: 1, duration_ms: Date.now() - started, stdout: '', stderr: error.message }));
    child.on('close', (code) => resolvePromise({ label, status: code === 0 ? 'passed' : 'failed', exit_code: code ?? 1, duration_ms: Date.now() - started, stdout_tail: stdout.slice(-4000), stderr_tail: stderr.slice(-4000) }));
  });
}
