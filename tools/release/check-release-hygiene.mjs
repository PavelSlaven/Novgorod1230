import { execFile as execFileCallback } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const root = resolve(process.argv[2] ?? '.');
const violations = [];
const forbiddenNames = new Set(['.env', '.env.local', '.env.production', '.env.development']);
const secretPattern = /(?:OPENAI_API_KEY|DEEPSEEK_API_KEY|DATABASE_URL)\s*=\s*[^\s#]+/gu;
const privateKeyPattern = /\.(?:pem|key)$/iu;
const seedSpreadsheetPattern = /\.(?:xlsx?|ods)$/iu;
const sourceRoots = new Set(['apps', 'packages', 'src', 'tools', 'infra', 'scripts', 'config']);
const sourceExtensions = /\.(?:[cm]?js|jsx|tsx?|json|ya?ml|toml|ini|conf|env|sh|ps1)$/iu;
const rootReleaseFiles = new Set([
  'package.json', 'package-lock.json', 'npm-shrinkwrap.json', '.npmrc', '.yarnrc', '.yarnrc.yml',
  'Dockerfile', 'docker-compose.yml', 'docker-compose.yaml',
]);

for (const file of await releaseFiles(root)) {
  const rel = relative(root, file).replaceAll('\\', '/');
  const name = basename(file);
  if (forbiddenNames.has(name)) {
    violations.push(`${rel}: secret-bearing environment file is forbidden in release`);
    continue;
  }
  if (isReleaseScoped(rel) && privateKeyPattern.test(name)) {
    violations.push(`${rel}: private key material is forbidden in release`);
    continue;
  }
  if (rel.startsWith('data/seeds/') && seedSpreadsheetPattern.test(name)) {
    violations.push(`${rel}: spreadsheet intermediate is forbidden in seed source`);
  }
  if (rel.startsWith('data/seeds/') && /(?:^|[-_.])(final|fixed|v2)(?:[-_.]|$)/u.test(name.toLowerCase())) {
    violations.push(`${rel}: ambiguous intermediate seed filename is forbidden`);
  }
  const info = await stat(file);
  if (isReleaseScoped(rel) && name.endsWith('.sql') && info.size > 100 * 1024 * 1024) {
    violations.push(`${rel}: SQL dump over 100 MB must be stored as artifact/release, not source`);
  }
  if (isSecretScanCandidate(rel, name, info.size)) {
    const text = await readFile(file, 'utf8').catch(() => '');
    for (const match of text.matchAll(secretPattern)) {
      if (!isDocumentedExample(match[0])) {
        violations.push(`${rel}: possible live secret assignment`);
        break;
      }
    }
  }
}

if (violations.length) {
  console.error('Release hygiene violations:\n' + violations.map((item) => `- ${item}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log('Release hygiene: OK');
}

/**
 * The release scanner intentionally follows Git's release set instead of walking
 * the checkout.  This excludes .git, dependency installs and local work areas,
 * while still including non-ignored newly created source files before staging.
 */
async function releaseFiles(repositoryRoot) {
  let stdout;
  try {
    ({ stdout } = await execFile('git', ['-C', repositoryRoot, 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      encoding: 'buffer',
      maxBuffer: 16 * 1024 * 1024,
    }));
  } catch {
    throw new Error(`release hygiene requires a Git worktree: ${repositoryRoot}`);
  }
  return stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((path) => resolve(repositoryRoot, path));
}

function isReleaseScoped(rel) {
  const [first] = rel.split('/');
  return rootReleaseFiles.has(rel) || sourceRoots.has(first);
}

function isSecretScanCandidate(rel, name, size) {
  if (size > 1024 * 1024 || !isReleaseScoped(rel)) return false;
  if (name === '.env.example') return true;
  return sourceExtensions.test(name);
}

function isDocumentedExample(assignment) {
  const value = assignment.slice(assignment.indexOf('=') + 1).trim().replace(/^['"]|['";,)]+$/gu, '');
  return /(?:^|[/:@])(?:example|user:pass|your[_-]?(?:key|token|secret)|change[-_]?me)(?:$|[/?#:@])/iu.test(value)
    || value.includes('…')
    || /<[^>]+>/u.test(value);
}
