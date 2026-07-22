import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { canonicalJsonBytes } from './p12-canonical-manifest.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const directory = 'data/world-catalogs/novgorod/spatial-v3/target-materialization-approval';
const v1 = join(ROOT, directory, 'P12_TARGET_MATERIALIZATION_APPROVAL_V1.zip');
const v11 = join(ROOT, directory, 'P12_TARGET_MATERIALIZATION_APPROVAL_V1_1.zip');
const reportPath = join(ROOT, directory, 'P12_TARGET_MATERIALIZATION_APPROVAL_V1_1_EQUIVALENCE.json');
const run = promisify(execFile);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const selected = (path) => path.startsWith('target/') || path === 'data/version-pins.json' || path === 'data/version-pins.csv' || path === 'data/approved-connection-profiles.json' || path.startsWith('data/approved-world-route') || path === 'data/approved-direct-route-source-bindings.json' || path === 'data/approved-scene-profiles.json';

async function extract(zip, root) {
  await run('python', ['-c', String.raw`import sys,zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])`, zip, root], { windowsHide: true });
  return join(root, (await readdir(root))[0]);
}
async function list(root, folder = '') {
  const result = [];
  for (const entry of await readdir(join(root, folder), { withFileTypes: true })) {
    const path = folder ? `${folder}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await list(root, path));
    else if (selected(path)) result.push(path);
  }
  return result.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
}
const temporary = await mkdtemp(join(tmpdir(), 'p12-equivalence-'));
try {
  const [left, right] = await Promise.all([extract(v1, join(temporary, 'v1')), extract(v11, join(temporary, 'v11'))]);
  const [leftPaths, rightPaths] = await Promise.all([list(left), list(right)]);
  const paths = [...new Set([...leftPaths, ...rightPaths])].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  const rows = await Promise.all(paths.map(async (path) => {
    const [oldBytes, newBytes] = await Promise.all([readFile(join(left, path)), readFile(join(right, path))]);
    return { path, v1_sha256: digest(oldBytes), v1_1_sha256: digest(newBytes), unchanged: oldBytes.equals(newBytes) };
  }));
  const report = { schema_version: 'rus.spatial-v3.p12-v1_1-equivalence.v1', compared_packages: ['P12_TARGET_MATERIALIZATION_APPROVAL_V1', 'P12_TARGET_MATERIALIZATION_APPROVAL_V1_1'], scope: 'approved target semantic rows, version pins, profiles and routes', row_count: rows.length, unchanged: rows.every((row) => row.unchanged), rows };
  await writeFile(reportPath, canonicalJsonBytes(report));
  process.stdout.write(`${JSON.stringify({ report_path: reportPath, ...report })}\n`);
  if (!report.unchanged) process.exitCode = 1;
} finally { await rm(temporary, { recursive: true, force: true }); }
