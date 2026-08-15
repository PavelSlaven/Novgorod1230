import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildApprovedActorProfileSnapshot } from '@rus/world-catalog-workflow';
import { buildStage7NpcCandidatesInput } from
  '@rus/new-game/stages/stage-7/compat';
import { retrieveNpcCandidates, validateNpcCandidateSet } from '../src/world/new-game-pipeline/index.js';
import { buildRegionalContextFixtureOutput, buildStage4FakeQueryable } from './fixtures/new-game-pipeline-stage4.js';
import { buildStartCandidateFixtureOutput } from './fixtures/new-game-pipeline-stage5.js';
import { buildCandidatePlaceTemplateFixtureOutput } from './fixtures/new-game-pipeline-stage6.js';
import { buildStage7LoadInput } from './fixtures/new-game-pipeline-stage7.js';

const root = new URL('../data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v4/', import.meta.url);

test('Stage 7 snapshots the pinned closed actor component sets for every new NPC candidate', async () => {
  const requestId = 'req_stage7_actor_profiles';
  const snapshot = await actorSnapshot();
  const regionalContext = await buildRegionalContextFixtureOutput(requestId);
  const startCandidates = await buildStartCandidateFixtureOutput(requestId, { regional_context_package: regionalContext });
  const placeTemplates = await buildCandidatePlaceTemplateFixtureOutput(requestId, {
    regional_context_package: regionalContext,
    start_candidate_set: startCandidates
  });
  const input = buildStage7LoadInput(requestId, {
    regional_context_package: regionalContext,
    start_candidate_set: startCandidates,
    candidate_place_template_set: placeTemplates,
    world_revision_id: snapshot.world_revision_id,
    approved_actor_profile_snapshot: snapshot
  });

  const first = await retrieveNpcCandidates(input, { queryable: buildStage4FakeQueryable() });
  const second = await retrieveNpcCandidates(input, { queryable: buildStage4FakeQueryable() });
  assert.deepEqual(first, second);
  assert.equal(validateNpcCandidateSet(first, { policy: input.npc_candidate_policy }).pass, true);
  assert.equal(first.world_revision_id, snapshot.world_revision_id);
  assert.deepEqual(first.actor_profile_snapshot, snapshot);
  for (const candidate of first.npc_candidates) {
    assert.equal(candidate.require_complete_actor_appearance, true);
    assert.equal(candidate.appearance_contract_version, 'actor_base_appearance_v1');
    assert.equal(candidate.actor_profile_snapshot.world_revision_id, snapshot.world_revision_id);
    assert.deepEqual(new Set([
      ...candidate.demographic_profile_entries,
      ...candidate.appearance_profile_entries
    ].map((entry) => entry.facet)), new Set([
      'sex_category', 'age_category', 'build', 'skin_tone', 'face_shape',
      'hair_color', 'hair_length', 'hair_style', 'facial_hair', 'eye_color'
    ]));
  }
});

test('Stage 7 returns a typed hard block when a required actor facet has no approved entry', async () => {
  const requestId = 'req_stage7_actor_gap';
  const snapshot = structuredClone(await actorSnapshot());
  snapshot.appearance_profiles[0].entries = snapshot.appearance_profiles[0].entries
    .filter((entry) => entry.facet !== 'eye_color');
  const regionalContext = await buildRegionalContextFixtureOutput(requestId);
  const startCandidates = await buildStartCandidateFixtureOutput(requestId, { regional_context_package: regionalContext });
  const placeTemplates = await buildCandidatePlaceTemplateFixtureOutput(requestId, {
    regional_context_package: regionalContext,
    start_candidate_set: startCandidates
  });
  const output = await retrieveNpcCandidates(buildStage7LoadInput(requestId, {
    regional_context_package: regionalContext,
    start_candidate_set: startCandidates,
    candidate_place_template_set: placeTemplates,
    world_revision_id: snapshot.world_revision_id,
    approved_actor_profile_snapshot: snapshot
  }), { queryable: buildStage4FakeQueryable() });
  assert.equal(output.selection_status, 'blocked');
  assert.ok(output.audit.concerns.some((item) => item.code === 'NPC_ACTOR_PROFILE_REQUIRED_FACET_EMPTY'));
});

test('Stage 7 hard-blocks an activated appearance contract without its approved snapshot', async () => {
  const requestId = 'req_stage7_actor_snapshot_gap';
  const regionalContext = await buildRegionalContextFixtureOutput(requestId);
  const startCandidates = await buildStartCandidateFixtureOutput(requestId, {
    regional_context_package: regionalContext
  });
  const placeTemplates = await buildCandidatePlaceTemplateFixtureOutput(requestId, {
    regional_context_package: regionalContext,
    start_candidate_set: startCandidates
  });
  const output = await retrieveNpcCandidates(buildStage7LoadInput(requestId, {
    regional_context_package: regionalContext,
    start_candidate_set: startCandidates,
    candidate_place_template_set: placeTemplates,
    world_revision_id: 'novgorod_spatial_v3_production_v4_candidate_001',
    approved_actor_profile_snapshot: null,
    npc_candidate_policy: { require_actor_base_appearance: true }
  }), { queryable: buildStage4FakeQueryable() });

  assert.equal(output.selection_status, 'blocked');
  assert.ok(output.audit.concerns.some((item) =>
    item.code === 'NPC_ACTOR_PROFILE_SNAPSHOT_REQUIRED'));
});

test('Stage 7 preserves the historical optional appearance contract', async () => {
  const requestId = 'req_stage7_historical_actor';
  const regionalContext = await buildRegionalContextFixtureOutput(requestId);
  const startCandidates = await buildStartCandidateFixtureOutput(requestId, {
    regional_context_package: regionalContext
  });
  const placeTemplates = await buildCandidatePlaceTemplateFixtureOutput(requestId, {
    regional_context_package: regionalContext,
    start_candidate_set: startCandidates
  });
  const output = await retrieveNpcCandidates(buildStage7LoadInput(requestId, {
    regional_context_package: regionalContext,
    start_candidate_set: startCandidates,
    candidate_place_template_set: placeTemplates,
    approved_actor_profile_snapshot: null
  }), { queryable: buildStage4FakeQueryable() });

  assert.equal(output.selection_status, 'ready');
  assert.equal(output.require_complete_actor_appearance, undefined);
  assert.equal(output.npc_candidates.some((candidate) =>
    candidate.require_complete_actor_appearance === true), false);
});

test('Stage 7 input activates appearance by the snapshot contract marker, not catalog presence', async () => {
  const current = await actorSnapshot();
  const active = buildStage7NpcCandidatesInput(stageContext(), {
    historicalFrame: { region_id: current.region_id },
    approvedActorProfileSnapshot: current
  });
  assert.equal(current.appearance_contract_version,
    'actor_base_appearance_v1');
  assert.equal(active.npc_candidate_policy.require_actor_base_appearance,
    true);

  const digest = 'b'.repeat(64);
  const historical = buildStage7NpcCandidatesInput(stageContext({
    world_pin: {
      world_revision_id: 'historical-world',
      world_catalog_digest: digest
    },
    actor_profile_catalog: {
      records_by_table: {
        world_revisions: [{
          id: 'historical-world', catalog_digest: digest, status: 'approved'
        }],
        universal_categories: [], region_category_options: [],
        region_demographic_profiles: [],
        region_demographic_profile_entries: [],
        region_appearance_profiles: [],
        region_appearance_profile_entries: []
      }
    },
    applicable_catalog: { records_by_table: {} }
  }), {
    historicalFrame: { region_id: 'historical-region' }
  });
  assert.equal(
    historical.approved_actor_profile_snapshot.appearance_contract_version,
    undefined
  );
  assert.equal(
    historical.npc_candidate_policy.require_actor_base_appearance,
    undefined
  );
});

function stageContext(runtimeCatalogContext = null) {
  return {
    runtimeCatalogContext,
    getStageOutput() { return null; }
  };
}

async function actorSnapshot() {
  const manifest = await json('manifest.json');
  const records = {};
  for (const table of [
    'world_revisions', 'universal_categories', 'region_category_options',
    'region_demographic_profiles', 'region_demographic_profile_entries',
    'region_appearance_profiles', 'region_appearance_profile_entries'
  ]) records[table] = await json(`datasets/${table}.json`);
  records.region_equipment_profiles = [{
    id: 'equipment_stage7_test', region_id: 'region_novgorod_land',
    social_role_id: 'role_merchant', occupation_id: 'occ_merchant', status: 'approved'
  }];
  records.region_equipment_profile_entries = [{
    id: 'equipment_stage7_test_base', equipment_profile_id: 'equipment_stage7_test',
    item_template_id: 'item_tpl_test', item_category_id: null, slot_key: 'base_garment',
    required: true, weight: 1
  }];
  return buildApprovedActorProfileSnapshot({
    records_by_table: records,
    world_revision_id: manifest.world_revision_id,
    region_id: 'region_novgorod_land',
    catalog_digest: manifest.catalog_digest
  });
}

async function json(path) {
  return JSON.parse(await readFile(new URL(path, root), 'utf8'));
}
