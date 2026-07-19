import { readFile } from 'node:fs/promises';
const [tool, test] = await Promise.all([readFile('tools/spatial-v3/p24-migration.mjs', 'utf8'), readFile('test/spatial-v3/p24-migration.test.js', 'utf8')]);
for (const symbol of ['buildSpatialV3SourceExtract', 'readV2WorldSource', 'readV2PartySource', 'V2_WORLD_SOURCE_TABLES', 'V2_PARTY_SOURCE_TABLES', 'requireInventorySourceBindings', 'WORLD_CHAIN', 'PARTY_CHAIN', 'buildSpatialV3MigrationInventory', 'classifyV2PartyG5', 'classifyV2Journey', 'adaptV2PartyEntities', 'constructP14JourneyRows', 'validateSpatialV3MigrationAcceptance', 'applySpatialV3WorldMigration', 'applySpatialV3PartyMigration']) if (!tool.includes(symbol)) throw new Error(`P24 missing ${symbol}`);
for (const code of ['migration_hard_gap', 'migration_g5_hard_gap', 'journey_migration_gap', 'migration_source_inventory_coverage_gap']) if (!tool.includes(code) || !test.includes(code)) throw new Error(`P24 untested typed gap ${code}`);
if (tool.includes('nearest') || tool.includes('midpoint')) throw new Error('P24 may not infer a journey endpoint');
if (tool.includes('/^spatial/')) throw new Error('P24 may not admit an unbounded spatial table prefix');
console.log('P24 migration contract: OK');
