import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('GitHub Actions clean-clone workflow keeps all required gates in order', async () => {
  const workflow = await readFile(resolve(process.cwd(), '.github/workflows/test.yml'), 'utf8');
  const requiredFragments = [
    'name: Install dependencies',
    'npm_config_registry: https://registry.npmjs.org/',
    'npm_config_replace_registry_host: always',