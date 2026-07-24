import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const outputPath = resolve(root, 'docs/work/temporal-world-v4/normative-freeze.json');
const sourcePaths = [
  '.github/AGENTS.md',
  'AGENTS.md',
  'README.md',
  'data/knowledge-source/corpus/DOCUMENTS/base_turn_orchestration.txt',
  'data/knowledge-source/corpus/DOCUMENTS/character_parameters.txt',
  'data/knowledge-source/corpus/DOCUMENTS/formulas.md',
  'data/knowledge-source/corpus/DOCUMENTS/historical_events_and_figures.txt',
  'data/knowledge-source/corpus/DOCUMENTS/information_sources_llm_prompts.md',
  'data/knowledge-source/corpus/DOCUMENTS/interface_ux.md',
  'data/knowledge-source/corpus/DOCUMENTS/llm_agent_prompt_templates.md',
  'data/knowledge-source/corpus/DOCUMENTS/llm_documentation_navigation.md',
  'data/knowledge-source/corpus/DOCUMENTS/movement_locations_regions.txt',
  'data/knowledge-source/corpus/DOCUMENTS/npc_generation_profiles.txt',
  'data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md',
  'data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_code_driven_world_materialization_architecture.md',
  'data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_read_only_database_and_graph_architecture.md',
  'data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_world_base_materialization_table_requirements.md',
  'data/knowledge-source/corpus/DOCUMENTS/temporal_world_and_interruptible_activities.md',
  'data/knowledge-source/corpus/DOCUMENTS/time_system.txt',
  'data/knowledge-source/corpus/DOCUMENTS/world_generation_and_turns.txt',
  'docs/adr/ADR-002-temporal-world-v4.md',
  'docs/adr/ADR-003-temporal-npc-runtime-owner.md',
  'docs/adr/ADR-004-temporal-place-access-owner.md',
  'docs/adr/ADR-005-temporal-environment-owner.md',
  'docs/adr/ADR-006-temporal-world-process-owner.md'
].sort();

const sourceDigests = {};
for (const sourcePath of sourcePaths) {
  sourceDigests[sourcePath] = sha256(await readFile(resolve(root, sourcePath)));
}

const freeze = {
  schema_version: 'rus.temporal_world.normative_freeze.v1',
  status: 'active_after_final_acceptance',
  base_commit_sha: '520c0ea8cc366fc16c949a874c710f3547a322f6',
  approved_external_inputs: {
    implementation_plan_sha256: 'd8464cbb91708379c3a4cf288b1842ee41676199fb8a0acaf51b79bcb0623016',
    mechanic_specification_sha256: 'f97e71536c08a3b5cc0414fe25460bf70b2d95ee94ff861f785b0a3d9fbfb26e'
  },
  contract: {
    amendment: 'temporal-world-v1',
    spatial_target_version: '4.3.0-target.1'
  },
  activation_boundary: {
    before_p28: 'production_v2_only',
    after_successful_p28: 'spatial_v3_only',
    forbidden: ['dual_write', 'mixed_authoritative_read', 'fallback', 'partial_temporal_cutover']
  },
  source_digests: sourceDigests
};

const rendered = `${JSON.stringify(freeze, null, 2)}\n`;
if (process.argv.includes('--check')) {
  const current = await readFile(outputPath, 'utf8');
  if (current !== rendered) throw new Error('Temporal normative freeze is stale; run npm run temporal-v4:freeze');
  console.log('Temporal normative freeze is reproducible.');
} else {
  await writeFile(outputPath, rendered, 'utf8');
  console.log('Wrote docs/work/temporal-world-v4/normative-freeze.json.');
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
