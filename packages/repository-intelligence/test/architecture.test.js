import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('repository intelligence source has no game runtime, database, provider, or network dependency', async () => {
  const sourceDirectory = resolve('packages/repository-intelligence/src');
  const source = (await Promise.all(
    (await readdir(sourceDirectory)).filter((name) => name.endsWith('.js')).map((name) => readFile(resolve(sourceDirectory, name), 'utf8'))
  )).join('\n');
  const forbidden = ['DATABASE_URL', 'PARTY_DATABASE_URL', 'WORLD_DB_ADMIN_URL', 'world-base', 'party-store', 'postgres', 'pg', 'fetch(', 'http:', 'https:', 'deepseek', 'openai', 'SELECT ', 'INSERT '];
  for (const token of forbidden) assert.equal(source.includes(token), false, token);
});
