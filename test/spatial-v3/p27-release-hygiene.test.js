import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const checker = join(process.cwd(), 'tools', 'release', 'check-release-hygiene.mjs');

test('P27 release hygiene scans the Git release scope and preserves historical archives/examples', async (t) => {
  const repository = await fixture(t, {
    'package.json': '{"name":"fixture","private":true}',
    'apps/server/index.js': 'export const example = "DATABASE_URL=postgresql://user:pass@localhost:5432/db";\n',
    'data/world-base-sources/history.tar.gz': 'historical archive',
    'DOCUMENTS/history/example.zip': 'documented archive',
    'node_modules/not-scanned.js': 'OPENAI_API_KEY=sk-live-should-not-be-read',
  });

  const result = await runChecker(repository);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Release hygiene: OK/u);
});

test('P27 release hygiene rejects tracked and new release-source secrets but ignores local non-release files', async (t) => {
  const repository = await fixture(t, {
    'package.json': '{"name":"fixture","private":true}',
    'packages/domain/source.js': 'export const key = "OPENAI_API_KEY=sk-live-secret";\n',
    '.tmp/local-note.txt': 'DATABASE_URL=postgresql://admin:live@remote.example.test:5432/prod',
  });

  const result = await runChecker(repository);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /packages\/domain\/source\.js: possible live secret assignment/u);
  assert.doesNotMatch(result.stderr, /\.tmp\/local-note/u);
});

async function fixture(t, files) {
  const repository = await mkdtemp(join(tmpdir(), 'p27-release-hygiene-'));
  t.after(() => rm(repository, { recursive: true, force: true }));
  for (const [relativePath, content] of Object.entries(files)) {
    const file = join(repository, relativePath);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  await execFile('git', ['init', '--quiet', repository]);
  await writeFile(join(repository, '.gitignore'), 'node_modules/\n.tmp/\n');
  await execFile('git', ['-C', repository, 'add', '-A']);
  return repository;
}

async function runChecker(repository) {
  try {
    const { stdout, stderr } = await execFile(process.execPath, [checker, repository], { encoding: 'utf8' });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}
