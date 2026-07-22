import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { inspectWorldBaseSchema } from '../../scripts/check-world-base-schema.mjs';

const root = resolve(import.meta.dirname, '../..');
const ddl = await readFile(resolve(root, 'infra/world-base/schema/14.sql'), 'utf8');
const tables = ['terminal_policies','continuation_length_rules','continuation_length_candidates','g4_expansion_profiles','g5_generation_templates','expansion_profile_template_limits','expansion_slots','expansion_slot_templates','scene_templates','scene_materialization_profiles','scene_materialization_candidates','g6_template_slots','scene_position_templates','scene_endpoint_slots','portal_templates','stable_structure_templates','g5_successor_frontier_rules','scene_movement_edge_templates','visibility_link_templates','acoustic_edge_templates'];
const errors = tables.filter((name) => !ddl.includes(`spatial_v3_${name}`)).map((name) => `missing P11 table ${name}`);
for (const invariant of ['scene_endpoint_slot_missing','portal_state_behavior_incomplete','controlled_vocabulary_gap','default_clear','deterministic_weighted','spatial_v3_g5_template_scene_profile_fk','successor applicability missing or ambiguous','disconnected scene graph']) if (!ddl.includes(invariant)) errors.push(`missing P11 invariant ${invariant}`);
if (!ddl.includes('UNIQUE(g5_template_id,g5_template_version,source_expansion_slot_id,source_expansion_slot_version,successor_kind)')) errors.push('P11 must enforce one successor per template/source-slot/context');
if (/\bname\s*(?:=|ILIKE)|\btitle\s*(?:=|ILIKE)|\bslug\s*(?:=|ILIKE)/iu.test(ddl)) errors.push('P11 must not perform name-based mapping');
const schema = await inspectWorldBaseSchema({ root });
if (!schema.part_files.includes('infra/world-base/schema/14.sql')) errors.push('schema entrypoint does not include 14.sql');
if (errors.length) throw new Error(errors.join('\n'));
console.log(`P11 expansion/scene static check: OK (${tables.length} target tables; ${schema.table_count} total world_base tables)`);
