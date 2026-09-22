import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import pg from 'pg';

import { loadActorBaseAttributesImportApproval } from
  '../data/world-catalogs/novgorod/procedural-scene-v2/actor-base-attributes-v1/runtime-import-v1/validate-import-approval.mjs';
import { activateActorBaseAttributes } from
  '../tools/runtime-catalog-activation/src/actor-base-attributes-activation.js';

const ROOT = 'data/world-catalogs/novgorod/procedural-scene-v2/'
  + 'actor-base-attributes-v1';
const REQUEST = `${ROOT}/runtime-activation-v1/request.json`;
const ATTESTATION = `${ROOT}/runtime-activation-v1/`
  + 'runtime-activation-approval-attestation.json';
const IMPORT_RESULT = `${ROOT}/runtime-import-v1/import-readback-result.json`;
const RESULT = `${ROOT}/runtime-activation-v1/activation-readback-result.json`;

export async function runActorBaseAttributesRuntimeActivation({ databaseUrl,
  resultPath = null }) {
  if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) {
    throw Object.assign(new Error('Actor activation database URL required.'),
      { code: 'ACTOR_BASE_ATTRIBUTES_DATABASE_URL_REQUIRED' });
  }
  const [request, attestation, importResult, importApproval] =
    await Promise.all([readJson(REQUEST), readJson(ATTESTATION),
      readJson(IMPORT_RESULT), loadActorBaseAttributesImportApproval()]);
  const readPool = new pg.Pool({ connectionString: roleUrl(databaseUrl,
    'runtime_catalog_importer'), max: 1 });
  const activationPool = new pg.Pool({ connectionString: roleUrl(databaseUrl,
    'runtime_catalog_activator'), max: 1 });
  try {
    const result = await activateActorBaseAttributes({ readPool,
      activationPool, request, attestation, importApproval, importResult });
    if (resultPath) await writeFile(resolve(resultPath),
      `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    return result;
  } finally {
    await Promise.all([readPool.end(), activationPool.end()]);
  }
}

function roleUrl(databaseUrl, role) {
  const url = new URL(databaseUrl);
  url.searchParams.set('options', `-c role=${role}`);
  return url.toString();
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

async function main(argv) {
  const { values } = parseArgs({ args: argv, options: {
    'database-url': { type: 'string' },
    'write-result': { type: 'string' }
  } });
  const result = await runActorBaseAttributesRuntimeActivation({
    databaseUrl: values['database-url']
      ?? process.env.ACTOR_BASE_ATTRIBUTES_DATABASE_URL,
    resultPath: values['write-result'] === 'canonical'
      ? RESULT : values['write-result'] ?? null
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] === new URL(import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/u, '$1').replaceAll('/', '\\')) {
  await main(process.argv.slice(2));
}
