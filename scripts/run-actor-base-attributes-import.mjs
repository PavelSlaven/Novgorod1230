import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import pg from 'pg';

import { loadActorBaseAttributesImportApproval } from
  '../data/world-catalogs/novgorod/procedural-scene-v2/actor-base-attributes-v1/runtime-import-v1/validate-import-approval.mjs';
import { importApprovedActorBaseAttributes } from
  '../tools/runtime-catalog-activation/src/actor-base-attributes-import.js';

const DEFAULT_RESULT = 'data/world-catalogs/novgorod/procedural-scene-v2/'
  + 'actor-base-attributes-v1/runtime-import-v1/import-readback-result.json';

export async function runActorBaseAttributesImport({ databaseUrl,
  resultPath = null, approval = null }) {
  if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) {
    throw Object.assign(new Error('Actor base-attribute database URL required.'),
      { code: 'ACTOR_BASE_ATTRIBUTES_DATABASE_URL_REQUIRED' });
  }
  const { request, attestation } =
    approval ?? await loadActorBaseAttributesImportApproval();
  if (request.schema === 'rus.actor_base_attributes_import_request.v2'
      && resultPath && resolve(resultPath) === resolve(DEFAULT_RESULT)) {
    throw new Error('ACTOR_SUCCESSOR_HISTORICAL_RESULT_PATH_FORBIDDEN');
  }
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const result = await importApprovedActorBaseAttributes({ pool, request,
      attestation });
    if (resultPath) {
      await writeFile(resolve(resultPath),
        `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    }
    return result;
  } finally {
    await pool.end();
  }
}

async function main(argv) {
  const { values } = parseArgs({ args: argv, options: {
    'database-url': { type: 'string' },
    input: { type: 'string' },
    'write-result': { type: 'string' }
  } });
  const result = await runActorBaseAttributesImport({
    approval: values.input ? JSON.parse(await readFile(values.input, 'utf8')) : null,
    databaseUrl: values['database-url']
      ?? process.env.ACTOR_BASE_ATTRIBUTES_DATABASE_URL,
    resultPath: values['write-result'] === 'canonical'
      ? DEFAULT_RESULT : values['write-result'] ?? null
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] === new URL(import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/u, '$1').replaceAll('/', '\\')) {
  await main(process.argv.slice(2));
}
