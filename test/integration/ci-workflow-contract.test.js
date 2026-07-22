import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('GitHub Actions clean-clone workflow keeps all required gates in order', async () => {
  const workflow = await readFile(resolve(process.cwd(), '.github/workflows/test.yml'), 'utf8');
  const requiredFragments = [
    'ref: ${{ github.event.pull_request.head.sha || github.sha }}',
    'name: Determine required check profile',
    'git show HEAD^:tools/spatial-v3/p28-ci-profile.mjs',
    'echo "profile=full"',
    'name: Normalize lockfile registry',
    'packages.applied-caas-gateway1.internal.api.openai.org/artifactory/api/npm/npm-public/',
    'https://registry.npmjs.org/',
    'name: Install dependencies',
    'npm ci',
    'name: Install pinned Graphify',
    'graphifyy==0.9.17',
    'name: Validate canonical world_base schema',
    'npm run world-db:schema-check',
    'npm run world-db:schema-doc-check',
    'name: Start PostgreSQL for full profile',
    '--publish 5432:5432 postgres:16',
    'name: Execute world_base DDL in PostgreSQL',
    'if pg_isready --dbname postgres',
    'createdb',
    'ON_ERROR_STOP=1',
    '-f infra/world-base/schema.sql',
    'information_schema.tables',
    'pg_roles',
    'has_schema_privilege',
    'information_schema.role_table_grants',
    'name: Execute Stage 3B-1 supplemental PostgreSQL integration',
    'npm run world-db:import:stage3b1:integration',
    'name: Validate canonical knowledge corpus',
    'npm run knowledge:check-corpus',
    'name: Generate deterministic documentation and knowledge artifacts',
    'npm run docs:generate',
    'name: Verify generated files are reproducible',
    'git diff --exit-code -- MODULE_INDEX.md generated/ infra/world-base/SCHEMA_REFERENCE.md',
    'git status --porcelain --untracked-files=all -- MODULE_INDEX.md generated/ infra/world-base/SCHEMA_REFERENCE.md',
    'name: Build and verify Repository Graph for current HEAD',
    'npm run repo-intel:build',
    'npm run repo-intel:status',
    'npm run test:repository-intelligence',
    'name: Run full test suite',
    'npm test',
    'name: Run evidence-only checks',
    'npm run spatial-v3:p28-local-evidence'
  ];

  let previousIndex = -1;
  for (const fragment of requiredFragments) {
    const index = workflow.indexOf(fragment);
    assert.notEqual(index, -1, `workflow is missing required fragment: ${fragment}`);
    assert.ok(index > previousIndex, `workflow fragment is out of order: ${fragment}`);
    previousIndex = index;
  }
});

test('world_base PostgreSQL gate tracks the 186-table schema and grants every table read-only', async () => {
  const workflow = await readFile(resolve(process.cwd(), '.github/workflows/test.yml'), 'utf8');

  assert.doesNotMatch(workflow, /test "\$table_count" -eq 62/u);
  assert.match(workflow, /test "\$table_count" -eq 186/u);
  assert.doesNotMatch(workflow, /test "\$select_grants" -eq 62/u);
  assert.match(workflow, /test "\$select_grants" -eq "\$table_count"/u);
  assert.match(workflow, /test "\$write_grants" -eq 0/u);
});
