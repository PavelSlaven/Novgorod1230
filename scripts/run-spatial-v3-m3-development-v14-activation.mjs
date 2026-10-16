import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import pg from 'pg';
import { activateSpatialV3M3DevelopmentV14 } from
  '../tools/runtime-catalog-activation/src/spatial-v3-m3-development-v14-activation.js';

const RESULT = 'data/world-catalogs/novgorod/runtime-catalog/'
  + 'spatial-v3-m3-current-schema-development-v1/'
  + 'activation-readback-result.json';

export async function runSpatialV3M3DevelopmentV14Activation({ databaseUrl,
  partyDatabaseUrl = databaseUrl, resultPath = null }) {
  if (!databaseUrl || !partyDatabaseUrl) {
    throw Object.assign(new Error('Exact world and party database URLs required.'),
      { code: 'SPATIAL_V3_M3_DATABASE_URL_REQUIRED' });
  }
  const worldPool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  const partyPool = partyDatabaseUrl === databaseUrl ? worldPool
    : new pg.Pool({ connectionString: partyDatabaseUrl, max: 1 });
  try {
    const result = await activateSpatialV3M3DevelopmentV14({ worldPool,
      partyPool, repositoryRoot: process.cwd() });
    if (resultPath) await writeFile(resolve(resultPath),
      `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    return result;
  } finally {
    await worldPool.end();
    if (partyPool !== worldPool) await partyPool.end();
  }
}

async function main(argv) {
  const { values } = parseArgs({ args: argv, options: {
    'database-url': { type: 'string' },
    'party-database-url': { type: 'string' },
    'write-result': { type: 'string' }
  } });
  const result = await runSpatialV3M3DevelopmentV14Activation({
    databaseUrl: values['database-url']
      ?? process.env.SPATIAL_V3_M3_DATABASE_URL,
    partyDatabaseUrl: values['party-database-url']
      ?? process.env.SPATIAL_V3_M3_PARTY_DATABASE_URL
      ?? values['database-url']
      ?? process.env.SPATIAL_V3_M3_DATABASE_URL,
    resultPath: values['write-result'] === 'canonical'
      ? RESULT : values['write-result'] ?? null
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] === new URL(import.meta.url).pathname
  .replace(/^\/([A-Za-z]:)/u, '$1').replaceAll('/', '\\')) {
  await main(process.argv.slice(2));
}
