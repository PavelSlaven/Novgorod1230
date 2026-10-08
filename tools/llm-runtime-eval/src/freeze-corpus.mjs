import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildFrozenRoleMessages } from './frozen-role-messages.mjs';

export async function rebuildFrozenRoleCorpus(corpus) {
  return { ...corpus, fixtures: await Promise.all(corpus.fixtures.map(async (fixture) => ({
    ...fixture,
    messages: await buildFrozenRoleMessages(fixture)
  }))) };
}

export function frozenRoleCorpusJson(corpus) {
  return `${JSON.stringify(corpus, null, 2)}\n`;
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, '../../..');
  const pathArg = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
  const path = resolve(root, pathArg ?? 'data/model-evals/llm-runtime/frozen-role-requests-v1.json');
  const check = process.argv.includes('--check');
  const source = await readFile(path, 'utf8');
  const generated = frozenRoleCorpusJson(await rebuildFrozenRoleCorpus(JSON.parse(source)));
  if (check) {
    if (generated !== source) {
      console.error(`Frozen role corpus is stale: ${path}`);
      process.exitCode = 1;
    } else console.log(`Frozen role corpus is current: ${path}`);
  } else {
    await writeFile(path, generated);
    console.log(`Regenerated frozen role corpus: ${path}`);
  }
}
