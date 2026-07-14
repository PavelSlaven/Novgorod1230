import { resolve } from 'node:path';
import { loadLocalEnv } from '../src/env.js';
import {
  checkNovgorodG1G4ImportSourceFiles,
  checkPartyDbSeed,
  checkWorldBaseImportedData,
  resolvePartyDatabaseConfig,
  validateNewGameEnvironment
} from '../src/world/new-game-prerequisites.js';

await loadLocalEnv();

const repoRoot = resolve(import.meta.dirname, '..');
const json = process.argv.includes('--json');
const envResult = validateNewGameEnvironment(process.env);
const sourceResult = await checkNovgorodG1G4ImportSourceFiles(repoRoot, process.env);
const results = {
  environment: envResult,
  novgorodG1G4SourceFiles: sourceResult
};

if (envResult.checks.find((check) => check.id === 'database-url')?.ok) {
  results.worldBase = await captureCheck('world-base-db-connect', () => checkWorldBaseImportedData(process.env.DATABASE_URL));
}

const partyConfig = resolvePartyDatabaseConfig(process.env);
if (partyConfig.url) {
  results.partyDb = await captureCheck('party-db-connect', () => checkPartyDbSeed(partyConfig.url));
  results.partyDb.connection = {
    source: partyConfig.source,
    usesFallback: partyConfig.usesFallback
  };
}

const ok = Object.values(results).every((result) => result.ok);

if (json) {
  console.log(JSON.stringify({ ok, results }, null, 2));
} else {
  printResult('Environment', results.environment);
  printResult('Novgorod G1-G4 source files', results.novgorodG1G4SourceFiles);
  if (results.worldBase) printResult('Imported world_base data', results.worldBase);
  if (results.partyDb) printResult('Party DB seed alignment', results.partyDb);
}

if (!ok) process.exit(1);

function printResult(title, result) {
  console.log(`\n${result.ok ? 'OK' : 'FAIL'} ${title}`);
  for (const check of result.checks) {
    console.log(`  ${check.ok ? 'OK' : 'FAIL'} ${check.id}`);
    if (!check.ok) console.log(`    ${check.message}`);
  }
}

async function captureCheck(id, fn) {
  try {
    return await fn();
  } catch (error) {
    const message = error?.message ?? String(error);
    return {
      ok: false,
      errors: [message],
      checks: [{
        id,
        ok: false,
        message
      }]
    };
  }
}
