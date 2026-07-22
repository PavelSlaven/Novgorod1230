import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { inspectWorldBaseSchema } from '../../scripts/check-world-base-schema.mjs';

const root = resolve(import.meta.dirname, '../..');
const ddl = await readFile(resolve(root, 'infra/world-base/schema/13.sql'), 'utf8');
const requiredTables = [
  'spatial_v3_orientation_reference_frames', 'spatial_v3_movement_orientation_profiles',
  'spatial_v3_movement_orientation_profile_points', 'spatial_v3_relative_orientations',
  'spatial_v3_g4_directional_exits', 'spatial_v3_world_routes', 'spatial_v3_world_route_points',
  'spatial_v3_world_route_segments', 'spatial_v3_world_route_endpoint_bindings',
  'spatial_v3_world_route_segment_spatial_contexts', 'spatial_v3_boundary_crossing_contracts',
  'spatial_v3_transition_environment_profiles', 'spatial_v3_movement_method_cost_profiles',
  'spatial_v3_movement_method_cost_options', 'spatial_v3_dynamic_recheck_policies',
  'spatial_v3_dynamic_recheck_policy_points', 'spatial_v3_activity_contracts', 'spatial_v3_action_contracts', 'spatial_v3_spatial_transition_allowed_route_kinds',
  'spatial_v3_movement_mode_transition_contracts', 'spatial_v3_recovery_transition_templates',
  'spatial_v3_spatial_transition_contracts'
];
const errors = [];
for (const table of requiredTables) if (!new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?world_base\\.${table}\\b`, 'u').test(ddl)) errors.push(`missing P10 table ${table}`);
for (const invariant of ['orientation_frame_cycle', 'orientation_profile_invalid', 'route_chain_discontinuous', 'route_cycle_or_branch', 'boundary_crossing_contract_gap', 'CHECK (base_minutes > 0)', "CHECK (directionality = 'directed')"]) if (!ddl.includes(invariant)) errors.push(`missing P10 invariant: ${invariant}`);
if (/\bname\s*(?:=|ILIKE)|\btitle\s*(?:=|ILIKE)|\bslug\s*(?:=|ILIKE)/iu.test(ddl)) errors.push('P10 DDL must not contain name/title/slug mapping logic');
const schema = await inspectWorldBaseSchema({ root });
if (!schema.part_files.includes('infra/world-base/schema/13.sql')) errors.push('schema entrypoint does not include 13.sql');
if (errors.length) throw new Error(errors.join('\n'));
console.log(`P10 route/orientation static check: OK (${requiredTables.length} target tables; ${schema.table_count} total world_base tables)`);
