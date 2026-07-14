import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '.');
const violations = [];
const forbiddenDirs = new Set(['node_modules', '.git', 'tmp', 'dist']);
const forbiddenNames = new Set(['.env', '.env.local', '.env.production', '.env.development']);
const secretPattern = /(OPENAI_API_KEY|DEEPSEEK_API_KEY|DATABASE_URL)\s*=\s*[^\s#]+/u;
const forbiddenDirectoryPaths = [];
const releaseFiles = await walk(root);

for (const file of releaseFiles) {
  const rel = relative(root, file).replaceAll('\\', '/');
  const name = basename(file);
  if (forbiddenNames.has(name)) violations.push(`${rel}: secret-bearing environment file is forbidden in release`);
  if (name.endsWith('.pem') || name.endsWith('.key')) violations.push(`${rel}: private key material is forbidden in release`);
  if (/\.(?:zip|7z|tar|tgz|gz)$/u.test(name)) violations.push(`${rel}: nested archive is forbidden in source release`);
  if (rel.startsWith('data/seeds/') && /\.(?:xlsx?|ods)$/u.test(name.toLowerCase())) violations.push(`${rel}: spreadsheet intermediate is forbidden in seed source`);
  if (rel.startsWith('data/seeds/') && /(?:^|[-_.])(final|fixed|v2)(?:[-_.]|$)/u.test(name.toLowerCase())) violations.push(`${rel}: ambiguous intermediate seed filename is forbidden`);
  const info = await stat(file);
  if (name.endsWith('.sql') && info.size > 100 * 1024 * 1024) violations.push(`${rel}: SQL dump over 100 MB must be stored as artifact/release, not source`);
  const isTestFixture = rel.startsWith('test/') || rel.includes('/test/') || rel.includes('/fixtures/');
  if (!isTestFixture && info.size <= 1024 * 1024 && isTextCandidate(name)) {
    const text = await readFile(file, 'utf8').catch(() => '');
    if (secretPattern.test(text) && name !== '.env.example') violations.push(`${rel}: possible live secret assignment`);
  }
}
for (const dir of forbiddenDirectoryPaths) violations.push(`${dir}: forbidden directory is present in release`);

if (violations.length) {
  console.error('Release hygiene violations:\n' + violations.map((item) => `- ${item}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Release hygiene: OK');
}

async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory() && forbiddenDirs.has(entry.name)) {
      forbiddenDirectoryPaths.push(relative(root, path).replaceAll('\\', '/'));
      continue;
    }
    if (entry.isDirectory()) result.push(...await walk(path));
    else result.push(path);
  }
  return result;
}

function isTextCandidate(name) {
  return /\.(?:js|mjs|cjs|json|md|txt|yml|yaml|env|example)$/u.test(name) || name.startsWith('.env');
}
