import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('GitHub Actions clean-clone workflow keeps all required gates in order', async () => {
  const workflow = await readFile(resolve(process.cwd(), '.github/workflows/test.yml'), 'utf8');
  const requiredFragments = [
    'name: Normalize lockfile registry',
    'packages.applied-caas-gateway1.internal.api.openai.org/artifactory/api/npm/npm-public/',
    'https://registry.npmjs.org/',
    'name: Install dependencies',
    'run: npm ci',
    'name: Validate canonical world_base schema',
    'run: npm run world-db:schema-check',
    'name: Validate canonical knowledge corpus',
    'run: npm run knowledge:check-corpus',
    'name: Generate deterministic documentation and knowledge artifacts',
    'run: npm run docs:generate',
    'name: Verify generated files are reproducible',
    'git diff --exit-code -- MODULE_INDEX.md generated/',
    'name: Run full test suite',
    'run: npm test'
  ];

  let previousIndex = -1;
  for (const fragment of requiredFragments) {
    const index = workflow.indexOf(fragment);
    assert.notEqual(index, -1, `workflow is missing required fragment: ${fragment}`);
    assert.ok(index > previousIndex, `workflow fragment is out of order: ${fragment}`);
    previousIndex = index;
  }
});
