import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { inspectWorldBaseSchema } from '../../scripts/check-world-base-schema.mjs';

const root = resolve(import.meta.dirname, '../..');
const ddl = await readFile(resolve(root, 'infra/world-base/schema/12.sql'), 'utf8');
const requiredTables = [
  'spatial_v3_world_revisions', 'spatial_v3_authoring_versions', 'spatial_v3_nodes',
  'spatial_v3_node_parents', 'spatial_v3_node_classes', 'spatial_v3_node_facets',
  'spatial_v3_g1_grid_cells', 'spatial_v3_controlled_vocabulary_bindings',
  'spatial_v3_authoring_dependency_edges', 'spatial_v3_graph_node_migration_inventory'
];
const errors = [];
for (const table of requiredTables) if (!new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?world_base\\.${table}\\b`, 'u').test(ddl)) errors.push(`missing P09 table ${table}`);
if (/\bname\s*(?:=|ILIKE)|\btitle\s*(?:=|ILIKE)|\bslug\s*(?:=|ILIKE)/iu.test(ddl)) errors.push('P09 DDL must not contain name/title/slug mapping logic');
for (const invariant of ['FOREIGN KEY (entity_kind, id, version, world_revision_id)', 'UNIQUE (source_entity_kind, source_entity_id, source_version, dependency_role, canonical_ordinal)', "mapping_status IN ('reviewed', 'gap', 'ambiguous', 'not_applicable')"]) if (!ddl.includes(invariant)) errors.push(`missing invariant: ${invariant}`);
const schema = await inspectWorldBaseSchema({ root });
if (!schema.part_files.includes('infra/world-base/schema/12.sql')) errors.push('schema entrypoint does not include 12.sql');
if (errors.length) throw new Error(errors.join('\n'));
console.log(`P09 spatial core static check: OK (${requiredTables.length} target tables; ${schema.table_count} total world_base tables)`);
