import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const PINNED_GRAPHIFY_VERSION = '0.9.17';
const root = path.resolve(process.cwd());

function failure(code, message, details = {}) {
  return { code, message, details };
}

async function exists(relativePath) {
  try {
    await access(path.join(root, relativePath), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function graphifyVersion() {
  const result = spawnSync('graphify', ['--version'], {
    cwd: root,
    encoding: 'utf8',
    shell: false
  });

  if (result.error?.code === 'ENOENT') {
    return { ok: false, error: failure('GRAPHIFY_NOT_INSTALLED', 'The graphify executable is not available.') };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      error: failure('GRAPHIFY_VERSION_CHECK_FAILED', 'Unable to read Graphify version.', {
        status: result.status,
        stderr: String(result.stderr ?? '').trim()
      })
    };
  }

  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const match = output.match(/(?:graphify(?:y)?\s*)?v?(\d+\.\d+\.\d+)/iu);
  if (!match) {
    return { ok: false, error: failure('GRAPHIFY_VERSION_UNKNOWN', 'Graphify returned an unrecognized version string.', { output: output.trim() }) };
  }
  if (match[1] !== PINNED_GRAPHIFY_VERSION) {
    return {
      ok: false,
      error: failure('GRAPHIFY_VERSION_MISMATCH', 'Graphify version does not match the repository pin.', {
        expected: PINNED_GRAPHIFY_VERSION,
        actual: match[1]
      })
    };
  }
  return { ok: true, version: match[1] };
}

async function validateGraphFile() {
  const relativePath = 'graphify-out/graph.json';
  if (!(await exists(relativePath))) {
    return { ok: false, error: failure('REPOSITORY_GRAPH_MISSING', `${relativePath} is missing.`) };
  }

  try {
    const parsed = JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
    const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    const links = Array.isArray(parsed.links) ? parsed.links : Array.isArray(parsed.edges) ? parsed.edges : [];
    return { ok: true, node_count: nodes.length, edge_count: links.length };
  } catch (error) {
    return {
      ok: false,
      error: failure('REPOSITORY_GRAPH_INVALID', `${relativePath} is not valid JSON.`, { message: error.message })
    };
  }
}

async function main() {
  const checks = [];
  const graphify = graphifyVersion();
  checks.push({ check: 'graphify_version', ...graphify });

  const requiredPaths = [
    '.graphifyignore',
    'docs/architecture/REPOSITORY_INTELLIGENCE.md',
    'docs/setup/REPOSITORY_INTELLIGENCE_AGENT_SETUP.md'
  ];

  for (const relativePath of requiredPaths) {
    const ok = await exists(relativePath);
    checks.push({
      check: `path:${relativePath}`,
      ok,
      ...(ok ? {} : { error: failure('REQUIRED_PATH_MISSING', `${relativePath} is missing.`) })
    });
  }

  const graph = await validateGraphFile();
  checks.push({ check: 'repository_graph', ...graph });

  const ok = checks.every((item) => item.ok === true);
  const response = {
    schema_version: 'rus.repository_intelligence_prerequisites.v1',
    ok,
    root,
    graphify_version_pin: PINNED_GRAPHIFY_VERSION,
    checks
  };

  const stream = ok ? process.stdout : process.stderr;
  stream.write(`${JSON.stringify(response, null, 2)}\n`);
  process.exitCode = ok ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    schema_version: 'rus.repository_intelligence_prerequisites.v1',
    ok: false,
    errors: [failure('INTERNAL_ERROR', error.message)]
  }, null, 2)}\n`);
  process.exitCode = 1;
});
