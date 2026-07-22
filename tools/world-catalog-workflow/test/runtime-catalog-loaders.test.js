import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

import { materializeG5Scene, materializeItemPlacement } from '@rus/materialization';
import { normalizeStage13MaterializationPolicy, runStage13G5MaterializationBlock } from '@rus/new-game/stages/stage-13';
import { buildStage14G5SceneCodePrecheck, normalizeStage14AuditPolicy, STAGE14_INPUT_SCHEMA } from '@rus/new-game/stages/stage-14';
import { buildStage16ItemPlacementCodePrecheck, normalizeStage16ItemPlacementPolicy } from '@rus/new-game/stages/stage-16';
import { retrieveApprovedItemProfileCandidates } from '@rus/new-game/stages/stage-8';
import { buildAllowedG5TemplateSet, buildApprovedItemCatalogSnapshot } from '../src/index.js';

const root = resolve(import.meta.dirname, '../../..');
const candidateRoot = resolve(root, 'data/knowledge-source/imports/item-container-120-v5/candidate');
const requestPath = resolve(root, 'docs/implementation/item-container-120-approval-audit/evidence/G4_DEPENDENCY_APPROVAL_REQUEST.json');
const worldRevisionId = 'world_revision_novgorod_1230_item_catalogue_001';

test('approved PR17 catalog feeds deterministic Stage 8, Stage 13 and Stage 16 materialization', async () => {
  const { manifest, records, mappings } = loadApprovedCandidate();
  const snapshot = buildApprovedItemCatalogSnapshot({ records_by_table: records, world_revision_id: worldRevisionId, catalog_digest: runtimeDigest(records) });

  assert.equal(snapshot.item_profile_candidates.length, 102);
  assert.equal(snapshot.container_profile_candidates.length, 18);
  assert.equal(snapshot.quantity_requirements.length, 120);
  assert.equal(snapshot.equipment_candidates.length, 1);
  assert.ok(snapshot.property_rule_candidates.length > 0);

  const stage8 = await retrieveApprovedItemProfileCandidates(stage8Input(snapshot));
  assert.equal(stage8.selection_status, 'ready');
  assert.equal(stage8.item_profile_candidates.length, 102);
  assert.equal(stage8.container_profile_candidates.length, 18);

  const mapping = mappings.find((record) => record.context_domain === 'craft_work');
  const allowed = buildAllowedG5TemplateSet({ records_by_table: records, graph_node_id: mapping.graph_node_id, world_revision_id: worldRevisionId, selected_g4_type_id: mapping.node_type, source_catalog_digest: runtimeDigest(records) });
  const allowedSlots = allowed.allowed_g5_templates[0].slot_rules;
  const itemSlot = allowedSlots.find((slot) => slot.slot_domain === 'item');
  const containerSlot = allowedSlots.find((slot) => slot.slot_domain === 'container');
  assert.equal(itemSlot.candidate_ids.length, 15);
  assert.equal(containerSlot.candidate_ids.length, 1);
  assert.ok(itemSlot.candidate_ids.every((id) => stage8.item_profile_candidates.some((candidate) => candidate.item_profile_candidate_id === id && candidate.item_profile_id === 'profile_craft_work_v3')));
  assert.ok(itemSlot.candidate_ids.every((id) => !stage8.item_profile_candidates.some((candidate) => candidate.item_profile_candidate_id === id && candidate.item_profile_id === 'profile_military_v3')));

  const selectedStartNode = selectedNode(mapping);
  const stage13Input = {
    version: 1,
    schema: 'g5_materialization_input',
    request_id: 'pr17-runtime-integration',
    selected_start_node: selectedStartNode,
    normalized_request: {},
    historical_frame: { region_id: 'region_novgorod_land', calendar: { year: 1230, season: 'spring' } },
    weather_state: { version: 1, schema: 'weather_state', request_id: 'pr17-runtime-integration', condition: 'clear' },
    regional_context_package: { region_id: 'region_novgorod_land' },
    start_place_audit: { pass: true },
    player_character: { schema: 'player_character_game_profile' },
    player_character_audit: { pass: true },
    npc_candidate_set: {},
    item_profile_candidate_set: stage8,
    materialization_context: {
      party_id: 'party_pr17_runtime_test',
      g1_id: 'gn_nov_g1_03_04',
      world_revision_id: worldRevisionId,
      region_id: 'region_novgorod_land',
      year: 1230,
      season: 'spring',
      trigger: 'new_game',
      occurrence: 0,
      materializer_version: 'code_materializer_v2',
      rng_version: 'mulberry32_v1'
    },
    materialization_policy: normalizeStage13MaterializationPolicy(),
    allowed_g5_template_set: allowed
  };
  const stage13 = await runStage13G5MaterializationBlock({ input: stage13Input });
  assert.equal(stage13.pass, true, JSON.stringify(stage13.concerns));
  const scene = stage13.output;
  assert.deepEqual(scene, materializeG5Scene(stage13Input));
  assert.equal(scene.item_materialization_slots.filter((slot) => slot.slot_domain === 'item').length, 1);
  assert.equal(scene.item_materialization_slots.filter((slot) => slot.slot_domain === 'container').length, 1);

  const stage16Input = {
    version: 1,
    schema: 'item_placement_input',
    request_id: 'pr17-runtime-integration',
    historical_frame: stage8.frame,
    selected_start_node: selectedStartNode,
    start_place_audit: { pass: true },
    player_character: { schema: 'player_character_game_profile' },
    player_character_audit: { pass: true },
    g5_scene_graph: scene,
    g5_scene_audit: { version: 1, schema: 'g5_scene_audit', pass: true, commit_permission: { can_continue_to_item_placement: true } },
    initial_npc_placement: { version: 1, schema: 'initial_npc_placement_draft', placement_status: 'empty_allowed', npc_instances: [] },
    npc_placement_audit: { version: 1, schema: 'initial_npc_placement_audit', pass: true, commit_permission: { can_continue_to_item_placement: true } },
    item_profile_candidate_set: stage8,
    item_placement_policy: normalizeStage16ItemPlacementPolicy(),
    eligible_item_profile_candidates: stage8.item_profile_candidates,
    eligible_container_profile_candidates: stage8.container_profile_candidates,
    eligible_property_rule_candidates: stage8.property_rule_candidates,
    eligible_g5_item_anchors: scene.g5_anchors.filter((anchor) => anchor.supports.can_hold_item),
    eligible_g5_container_anchors: scene.g5_anchors.filter((anchor) => anchor.supports.can_hold_container)
  };
  const placement = materializeItemPlacement(stage16Input);
  assert.deepEqual(placement, materializeItemPlacement(stage16Input));
  assert.equal(placement.item_instances.length, 1);
  assert.equal(placement.container_instances.length, 1);
  assert.equal(placement.property_bindings.length, 2);
  assert.ok(placement.item_instances[0].quantity > 0);
  assert.ok(placement.item_instances[0].physical_state.total_mass_grams > 0);
  assert.ok(Array.isArray(placement.container_instances[0].content_state.compatibility_relations));
  const stage14Precheck = buildStage14G5SceneCodePrecheck({
    version: 1,
    schema: STAGE14_INPUT_SCHEMA,
    request_id: 'pr17-runtime-integration',
    historical_frame: stage13Input.historical_frame,
    weather_state: stage13Input.weather_state,
    selected_start_node: selectedStartNode,
    start_place_audit: { pass: true },
    player_character: { schema: 'player_character_game_profile' },
    player_character_audit: { pass: true },
    allowed_g5_template_set: allowed,
    g5_scene_graph_draft: scene,
    npc_candidate_set: {},
    item_profile_candidate_set: stage8,
    audit_policy: normalizeStage14AuditPolicy()
  });
  assert.equal(stage14Precheck.pass, true, JSON.stringify(stage14Precheck.concerns));
  const stage16Precheck = buildStage16ItemPlacementCodePrecheck(placement, stage16Input);
  assert.equal(stage16Precheck.pass, true, JSON.stringify(stage16Precheck.concerns));
});

test('runtime loader refuses an unapproved selected G4', () => {
  const { manifest, records, mappings } = loadApprovedCandidate();
  const mapping = mappings[0];
  records.graph_nodes.find((record) => record.id === mapping.graph_node_id).status = 'draft';
  assert.throws(
    () => buildAllowedG5TemplateSet({ records_by_table: records, graph_node_id: mapping.graph_node_id, world_revision_id: worldRevisionId, source_catalog_digest: runtimeDigest(records) }),
    (error) => error.code === 'RUNTIME_G4_NOT_APPROVED'
  );
});

test('Stage 8 catalog snapshot refuses draft G4 dependencies directly', () => {
  const { manifest, records, mappings } = loadApprovedCandidate();
  const mapping = mappings[0];
  records.graph_nodes.find((record) => record.id === mapping.graph_node_id).status = 'draft';
  assert.throws(
    () => buildApprovedItemCatalogSnapshot({ records_by_table: records, world_revision_id: worldRevisionId, catalog_digest: runtimeDigest(records) }),
    (error) => error.code === 'RUNTIME_ITEM_CONTEXT_NOT_APPROVED' || error.code === 'RUNTIME_CONTAINER_DEPENDENCY_NOT_APPROVED'
  );
});

test('Stage 8 catalog snapshot refuses approved records from another revision', () => {
  const { manifest, records } = loadApprovedCandidate();
  records.item_templates[0].world_revision_id = 'world_revision_other';
  assert.throws(
    () => buildApprovedItemCatalogSnapshot({ records_by_table: records, world_revision_id: worldRevisionId, catalog_digest: runtimeDigest(records) }),
    (error) => error.code === 'RUNTIME_ITEM_DEPENDENCY_NOT_APPROVED'
  );
});

test('runtime catalog loaders refuse a draft world revision', () => {
  const { records } = loadApprovedCandidate();
  const digest = runtimeDigest(records);
  records.world_revisions[0].status = 'draft';
  assert.throws(
    () => buildApprovedItemCatalogSnapshot({ records_by_table: records, world_revision_id: worldRevisionId, catalog_digest: digest }),
    (error) => error.code === 'RUNTIME_WORLD_REVISION_NOT_APPROVED'
  );
});

test('runtime catalog loaders refuse a missing world revision', () => {
  const { records } = loadApprovedCandidate();
  const digest = runtimeDigest(records);
  records.world_revisions = [];
  assert.throws(
    () => buildApprovedItemCatalogSnapshot({ records_by_table: records, world_revision_id: worldRevisionId, catalog_digest: digest }),
    (error) => error.code === 'RUNTIME_WORLD_REVISION_NOT_APPROVED'
  );
});

test('runtime catalog loaders refuse a catalog digest that is not pinned to the revision', () => {
  const { records } = loadApprovedCandidate();
  assert.throws(
    () => buildApprovedItemCatalogSnapshot({ records_by_table: records, world_revision_id: worldRevisionId, catalog_digest: 'f'.repeat(64) }),
    (error) => error.code === 'RUNTIME_SOURCE_CATALOG_DIGEST_MISMATCH'
  );
});

test('G5 template loader refuses a layout from another revision', () => {
  const { manifest, records, mappings } = loadApprovedCandidate();
  const mapping = mappings[0];
  const profile = records.g4_materialization_profiles.find((record) => record.id === `g4_profile_${mapping.context_domain}_v1`);
  records.building_layout_templates.find((record) => record.id === profile.layout_template_id).world_revision_id = 'world_revision_other';
  assert.throws(
    () => buildAllowedG5TemplateSet({ records_by_table: records, graph_node_id: mapping.graph_node_id, world_revision_id: worldRevisionId, source_catalog_digest: runtimeDigest(records) }),
    (error) => error.code === 'RUNTIME_G4_PROFILE_NOT_APPROVED'
  );
});

test('all nine approved G4 contexts preserve item and container candidate isolation', async () => {
  const { manifest, records, mappings } = loadApprovedCandidate();
  const snapshot = buildApprovedItemCatalogSnapshot({ records_by_table: records, world_revision_id: worldRevisionId, catalog_digest: runtimeDigest(records) });
  const stage8 = await retrieveApprovedItemProfileCandidates(stage8Input(snapshot));

  for (const mapping of mappings) {
    const allowed = buildAllowedG5TemplateSet({ records_by_table: records, graph_node_id: mapping.graph_node_id, world_revision_id: worldRevisionId, selected_g4_type_id: mapping.node_type, source_catalog_digest: runtimeDigest(records) });
    const slots = allowed.allowed_g5_templates[0].slot_rules;
    const itemSlot = slots.find((slot) => slot.slot_domain === 'item');
    const containerSlot = slots.find((slot) => slot.slot_domain === 'container');
    assert.ok(itemSlot.candidate_ids.length > 0, mapping.context_domain);
    assert.ok(itemSlot.candidate_ids.every((id) => stage8.item_profile_candidates.some((candidate) => candidate.item_profile_candidate_id === id && candidate.item_profile_id === mapping.profile_id && candidate.context_graph_node_ids.includes(mapping.graph_node_id))), mapping.context_domain);
    if (containerSlot) assert.ok(containerSlot.candidate_ids.every((id) => stage8.container_profile_candidates.some((candidate) => candidate.container_profile_candidate_id === id && candidate.context_graph_node_ids.includes(mapping.graph_node_id))), mapping.context_domain);

    const selectedStartNode = selectedNode(mapping);
    const scene = materializeG5Scene({
      version: 1,
      schema: 'g5_materialization_input',
      request_id: `pr17-runtime-${mapping.context_domain}`,
      selected_start_node: selectedStartNode,
      weather_state: { condition: 'clear' },
      materialization_context: {
        party_id: `party_pr17_${mapping.context_domain}`,
        g1_id: 'gn_nov_g1_03_04',
        world_revision_id: worldRevisionId,
        region_id: 'region_novgorod_land',
        year: 1230,
        season: 'spring',
        trigger: 'new_game',
        occurrence: 0,
        materializer_version: 'code_materializer_v2',
        rng_version: 'mulberry32_v1'
      },
      allowed_g5_template_set: allowed
    });
    const placement = materializeItemPlacement({
      version: 1,
      schema: 'item_placement_input',
      request_id: `pr17-runtime-${mapping.context_domain}`,
      historical_frame: stage8.frame,
      selected_start_node: selectedStartNode,
      g5_scene_graph: scene,
      item_profile_candidate_set: stage8,
      eligible_item_profile_candidates: stage8.item_profile_candidates,
      eligible_container_profile_candidates: stage8.container_profile_candidates,
      eligible_property_rule_candidates: stage8.property_rule_candidates,
      eligible_g5_item_anchors: scene.g5_anchors.filter((anchor) => anchor.supports.can_hold_item),
      eligible_g5_container_anchors: scene.g5_anchors.filter((anchor) => anchor.supports.can_hold_container)
    });
    assert.equal(placement.item_instances.length, 1, mapping.context_domain);
    assert.equal(placement.item_instances[0].item_profile_id, mapping.profile_id, mapping.context_domain);
    assert.equal(placement.container_instances.length, containerSlot ? 1 : 0, mapping.context_domain);
  }
});

function loadApprovedCandidate() {
  const manifest = readJson(resolve(candidateRoot, 'manifest.json'));
  const records = Object.fromEntries(manifest.datasets.map((dataset) => [dataset.table, promote(readJson(resolve(candidateRoot, dataset.path)))]));
  const mappings = readJson(requestPath).profile_mappings;
  records.graph_nodes = mappings.map((mapping) => ({
    id: mapping.graph_node_id,
    title: mapping.graph_node_title,
    node_type: mapping.node_type,
    scale_level: 'G4',
    place_template_id: mapping.place_template_id,
    building_template_id: mapping.building_template_id ?? null,
    region_id: 'region_novgorod_land',
    status: 'approved'
  }));
  return { manifest, records, mappings };
}

function promote(rows) {
  return rows.map((row) => row.status === 'draft' ? { ...row, status: 'approved' } : row);
}

function runtimeDigest(records) {
  return records.world_revisions.find((record) => record.id === worldRevisionId).catalog_digest;
}

function stage8Input(snapshot) {
  return {
    version: 1,
    schema: 'item_profile_retriever_input',
    request_id: 'pr17-runtime-integration',
    normalized_request: {},
    historical_frame: { region_id: 'region_novgorod_land', year: 1230, season: 'spring' },
    regional_context_package: {},
    candidate_place_template_set: {},
    npc_candidate_set: {},
    world_revision_id: worldRevisionId,
    approved_catalog_snapshot: snapshot
  };
}

function selectedNode(mapping) {
  return {
    selected: {
      selected_g4_type_id: mapping.node_type,
      selected_scale_level: 'G4',
      selected_place_template_id: mapping.place_template_id
    },
    selected_node_chain: {
      g1_node_id: 'gn_nov_g1_03_04',
      g2_node_id: 'gn_nov_g1_03_04_g2_test',
      g3_node_id: 'gn_nov_g1_03_04_g3_test',
      g4_node_id: mapping.graph_node_id
    }
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
