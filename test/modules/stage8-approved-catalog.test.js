import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeStage8ItemProfilePolicy, retrieveApprovedItemProfileCandidates, validateItemProfileCandidateSet, validateStage8ItemProfileRetrieverInput } from '../../packages/new-game/src/stages/stage-8-item-profile-candidates/approved-catalog.js';

const revision = 'rev_approved';
const base = {
  version: 1, schema: 'item_profile_retriever_input', request_id: 'r1', world_revision_id: revision,
  historical_frame: { region: { region_id: 'nov' }, year: { value: 1230 }, calendar: { season: 'winter' } },
  regional_context_package: {}, candidate_place_template_set: {}, npc_candidate_set: {},
  item_profile_policy: normalizeStage8ItemProfilePolicy(),
  approved_catalog_snapshot: { version: 1, schema: 'approved_item_catalog_snapshot', world_revision_id: revision, catalog_digest: 'a'.repeat(64),
    item_profile_candidates: [], container_profile_candidates: [], equipment_candidates: [], quantity_requirements: [], property_rule_candidates: [] }
};

test('Stage 8 hard-blocks each empty required approved domain with typed data gaps', async () => {
  assert.equal(validateStage8ItemProfileRetrieverInput(base).pass, true);
  const output = await retrieveApprovedItemProfileCandidates(base);
  assert.equal(output.selection_status, 'blocked');
  assert.equal(output.data_gaps.length, 5);
  assert.equal(output.data_gaps.every((gap) => gap.code === 'REQUIRED_APPROVED_CANDIDATE_SET_EMPTY'), true);
  assert.equal(validateItemProfileCandidateSet(output, { input: base, policy: base.item_profile_policy }).pass, true);
});

test('Stage 8 excludes draft, wrong-revision and out-of-period candidates', async () => {
  const input = structuredClone(base);
  input.item_profile_policy.required_candidate_domains = ['item_profiles'];
  input.approved_catalog_snapshot.item_profile_candidates = [
    { id: 'draft', status: 'draft', world_revision_id: revision, region_id: 'nov' },
    { id: 'wrong', status: 'approved', world_revision_id: 'other', region_id: 'nov' },
    { id: 'late', status: 'approved', world_revision_id: revision, region_id: 'nov', valid_from_year: 1300 },
    { id: 'ok', status: 'approved', world_revision_id: revision, region_id: 'nov', valid_from_year: 1200, valid_to_year: 1250, allowed_seasons: ['winter'] }
  ];
  const output = await retrieveApprovedItemProfileCandidates(input);
  assert.deepEqual(output.item_profile_candidates.map((row) => row.id), ['ok']);
  assert.equal(output.rejected_candidates.length, 3);
});
