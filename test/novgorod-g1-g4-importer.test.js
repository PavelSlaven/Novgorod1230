import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  GRAPH_EDGES_FILE,
  GRAPH_NODES_FILE,
  REFERENCE_NODE_FILES,
  buildSql,
  loadNovgorodG1G4GraphRecords,
  parseTsvText,
  summarizeRecords
} from '../scripts/import-novgorod-g1-g4-graph.js';

test('TSV parser handles quoted tabs and JSON arrays', () => {
  const rows = parseTsvText('id\ttitle\tsources\nn1\t"Title\twith tab"\t"[""src_a"", ""src_b""]"\n');

  assert.deepEqual(rows, [{
    id: 'n1',
    title: 'Title\twith tab',
    sources: '["src_a", "src_b"]'
  }]);
});

test('dry-run summary reports G1-G4 node and edge counts', async () => {
  const dir = await writeFixture();
  try {
    const records = loadNovgorodG1G4GraphRecords(dir);
    const summary = summarizeRecords(records);

    assert.equal(summary.counts.graph_nodes, 4);
    assert.equal(summary.counts.graph_edges, 4);
    assert.deepEqual(summary.byScale.graph_nodes, { G1: 1, G2: 1, G3: 1, G4: 1 });
    assert.deepEqual(summary.byScale.graph_edges, { G1: 1, G2: 1, G3: 1, G4: 1 });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('SQL builder targets only world_base graph tables', async () => {
  const dir = await writeFixture();
  try {
    const sql = buildSql(loadNovgorodG1G4GraphRecords(dir));

    assert.match(sql, /INSERT INTO world_base\."graph_nodes"/u);
    assert.match(sql, /INSERT INTO world_base\."graph_edges"/u);
    assert.doesNotMatch(sql, /party\./u);
    assert.doesNotMatch(sql, /party_graph_/u);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('importer maps only graph TSV rows as world records', async () => {
  const dir = await writeFixture();
  try {
    const records = loadNovgorodG1G4GraphRecords(dir);
    const ids = records.map(({ row }) => row.id).sort();

    assert.deepEqual(ids, [
      'edge_g1',
      'edge_g2',
      'edge_g3',
      'edge_g4',
      'node_g1',
      'node_g2',
      'node_g3',
      'node_g4'
    ]);
    assert.ok(records.every(({ table }) => table === 'graph_nodes' || table === 'graph_edges'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function writeFixture() {
  const dir = await mkdtemp(join(tmpdir(), 'novgorod-g1-g4-importer-'));
  await writeFile(join(dir, GRAPH_NODES_FILE), [
    'id\tscale_level\tnode_type\ttitle\tparent_node_id\tregion_cell_code\tg1_type\tplace_template_id\tevidence_status\tstatus\tconfidence',
    'node_g1\tG1\tregion_cell\tG1 cell\t\tcell_00_00\twild\t\tregional_typological\tusable_with_caution\tmedium_low',
    'node_g2\tG2\tcell_subgraph\tG2 zone\tnode_g1\tcell_00_00\twild\t\tregional_typological\tusable_with_caution\tmedium_low',
    'node_g3\tG3\tplace\tG3 place\tnode_g2\tcell_00_00\twild\tpt_hamlet\thistorically_plausible_construct\tdraft\tmedium_low',
    'node_g4\tG4\tlocation\tG4 location\tnode_g3\tcell_00_00\twild\tpt_hamlet\thistorically_plausible_required_detail\tdraft\tmedium_low',
    ''
  ].join('\n'));
  await writeFile(join(dir, GRAPH_EDGES_FILE), [
    'id\treverse_edge_id\tfrom_node_id\tto_node_id\tscale_level\tedge_type\troute_template_id\twater_body_template_id\tlandscape_template_id\tbase_gu\tbase_distance_km\tbase_time_hours\tshared_corridors\trisk_level\tstatus\tconfidence\tsources\taudit_notes\tedge_scope\tbase_time_minutes\tseasonal_rule\taccess_rule\tknown_to_commoners\tknown_to_traders\trequires_guide\trequires_boat\trequires_orientation_check\tmovement_risk_profile\tfailure_consequences',
    'edge_g1\t\tnode_g1\tnode_g1\tG1\toffroad_crossing\t\t\tlt_wet_lowland_forest\t1\t4\t1\t[]\tlow\tdraft\tmedium_low\t[]\taudit\tG1\t\t\t\t\t\tfalse\tfalse\tfalse\t[]\t[]',
    'edge_g2\t\tnode_g1\tnode_g2\tG2\toffroad_crossing\t\t\tlt_wet_lowland_forest\t1\t4\t1\t[]\tlow\tdraft\tmedium_low\t[]\taudit\tG2\t\t\t\t\t\tfalse\tfalse\tfalse\t[]\t[]',
    'edge_g3\t\tnode_g2\tnode_g3\tG3\tpath\trt_path\t\tlt_wet_lowland_forest\t1\t1\t0.25\t[]\tlow\tdraft\tmedium_low\t[]\taudit\tG3\t15\t\t\t\t\tfalse\tfalse\tfalse\t[]\t[]',
    'edge_g4\t\tnode_g3\tnode_g4\tG4\tyard_passage\t\t\t\t1\t0.1\t0.05\t[]\tlow\tdraft\tmedium_low\t[]\taudit\tG4\t3\t\t\t\t\tfalse\tfalse\tfalse\t[]\t[]',
    ''
  ].join('\n'));
  await writeFile(join(dir, REFERENCE_NODE_FILES[0]), [
    'id\tregion_cell_code\ttitle\tg1_type\tgrid_x\tgrid_y\tregion_id\tnode_type\tscale_level\tcell_size_km\tcrossing_base_gu\tcrossing_base_time_hours\tprimary_landscape_template_id\tsecondary_landscape_template_ids\tprimary_water_body_template_id\tsecondary_water_body_template_ids\tland_use_template_ids\tplace_template_ids_allowed\troute_template_ids_guidance\tsettlement_density\tknown_landmarks\tcanonical_corridors\tmacro_zone\tevidence_status\tstatus\tconfidence\tsources\taudit_notes',
    'node_g1\tcell_00_00\tG1 cell\twild\t0\t0\tregion_novgorod_land\tregion_cell\tG1\t32\t8\t8\tlt_wet_lowland_forest\t[]\twb_brook\t[]\t[]\t[]\t[]\tlow\t[]\t[]\tzone\tregional_typological\tusable_with_caution\tmedium_low\t[]\taudit',
    ''
  ].join('\n'));
  await writeFile(join(dir, REFERENCE_NODE_FILES[1]), 'id\tregion_id\tprimary_landscape_template_id\tland_use_template_ids\nnode_g2\tregion_novgorod_land\tlt_wet_lowland_forest\t[]\n');
  await writeFile(join(dir, REFERENCE_NODE_FILES[2]), 'id\tregion_id\tprimary_landscape_template_id\tplace_template_id\tland_use_template_ids\nnode_g3\tregion_novgorod_land\tlt_wet_lowland_forest\tpt_hamlet\t[]\n');
  await writeFile(join(dir, REFERENCE_NODE_FILES[3]), 'id\tregion_id\tknown_to_player_default\tknown_to_character_default\nnode_g4\tregion_novgorod_land\tfalse\tfalse\n');
  return dir;
}
