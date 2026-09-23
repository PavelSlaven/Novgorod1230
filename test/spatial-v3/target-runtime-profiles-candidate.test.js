import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildTargetRuntimeProfilesMapping } from '../../tools/runtime-catalog-activation/src/target-runtime-profiles-mapping.js';

const root = new URL('../../', import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root)));
const candidate = read('data/world-catalogs/novgorod/live-world-runtime-v17/target-runtime-profiles-candidate.json');
const sources = candidate.source_set.map(({ path }) => read(path));
const ref = ({ id, version }) => `${id}@${version}`;

test('target runtime authoring pins exact approved composition and NPC scope', () => {
  assert.equal(candidate.status, 'pending_independent_data_approval');
  assert.equal(candidate.approved, false);
  assert.equal(candidate.activation_authorized, false);
  for (const source of candidate.source_set) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(source.path, root)))
      .digest('hex'), source.sha256, source.path);
  }
  const rows = sources[3];
  assert.equal(candidate.applicability.length, 33);
  assert.equal(new Set(candidate.applicability.map((scope) => ref(scope.g4_ref))).size, 32);
  assert.equal(new Set(candidate.applicability.filter((scope) => scope.generation_template_ref)
    .map((scope) => ref(scope.generation_template_ref))).size, 25);
  for (const scope of candidate.applicability) {
    const row = rows.find((entry) => ref(entry) === ref(scope.npc_composition_ref));
    assert.equal(row.status, 'approved');
    assert.equal(row.world_revision_id, candidate.target.world_revision_id);
    assert.deepEqual(scope.g4_ref, { id: row.g4_id, version: row.g4_version });
    assert.equal(Boolean(scope.generation_template_ref) !== Boolean(scope.canonical_g5_ref), true);
    assert.deepEqual(scope.generation_template_ref ?? scope.canonical_g5_ref,
      row.generation_template_id ? { id: row.generation_template_id, version: row.generation_template_version }
        : { id: row.canonical_g5_id, version: row.canonical_g5_version });
    assert.deepEqual(scope.eligible_npc_binding_refs, row.payload.weighted_profile_refs.map((entry) => entry.profile_ref));
  }
  const bindings = sources[4].filter((row) => row.profile_kind === 'npc_binding');
  assert.equal(candidate.n1_binding_basis.length, bindings.length);
  for (const basis of candidate.n1_binding_basis) {
    const row = bindings.find((entry) => ref(entry) === ref(basis.binding_ref));
    assert.equal(row.status, 'approved');
    assert.equal(basis.profile_level, row.payload.profile_level);
    assert.equal(basis.profile_level, 'background');
    assert.equal(basis.participant_profile.profile_id, row.occupation_ref);
    assert.equal(basis.role_ref, row.role_ref);
    assert.deepEqual(basis.regional_context_refs,
      row.payload.regional_context_refs.map(({ id, version }) => ({ id, version })));
  }
});

test('target runtime authoring preserves mechanics and makes unsupported authority explicit', () => {
  const turn = structuredClone(candidate.profiles.turn_step);
  turn.profile_set_id = sources[1].profile_set_id;
  turn.revision = sources[1].revision;
  turn.status = 'approved';
  turn.neutral_conversation_profile.status = 'approved';
  turn.ordinary_result_policy.status = 'approved';
  assert.deepEqual(turn, sources[1]);
  const action = structuredClone(candidate.profiles.action_production);
  for (const key of ['schema', 'profile_id', 'status', 'context_ref', 'policy_ref']) action[key] = sources[2][key];
  assert.deepEqual(action, sources[2]);
  const n1 = structuredClone(candidate.profiles.n1);
  for (const key of ['profile_id', 'status', 'eligible_participant_profiles']) n1.profile[key] = sources[0].n1.profile[key];
  assert.deepEqual(n1, sources[0].n1);
  assert.equal(candidate.profiles.n1.profile.eligible_participant_profiles.length, 8);
  assert.equal(candidate.profiles.turn_step.ordinary_result_policy.candidates.length, 0);
  assert.equal(candidate.capability_gaps.length, 4);
  assert.equal(new Set(candidate.capability_gaps.map(({ code }) => code)).size, 4);
  for (const gap of candidate.capability_gaps) {
    assert.equal(gap.profile, null);
    assert.equal(gap.scope, 'all33_authored_scopes');
    assert.ok(gap.required_inputs.length > 0);
  }
  assert.equal(candidate.provenance.historical_claim, false);
  assert.equal(JSON.stringify(candidate.profiles).includes('trace_ld'), false);
  assert.equal(JSON.stringify(candidate.profiles).includes('fishing_camp'), false);
});

test('reviewable approved mapping reproduces frozen bytes and changes only explicit statuses', async () => {
  const mapping = await buildTargetRuntimeProfilesMapping({ repositoryRoot: fileURLToPath(root) });
  const base = 'data/world-catalogs/novgorod/live-world-runtime-v17/';
  assert.equal(readFileSync(new URL(`${base}target-runtime-profiles-manifest.json`, root), 'utf8'),
    `${JSON.stringify(mapping.manifest, null, 2)}\n`);
  const mappedBytes = readFileSync(new URL(`${base}${mapping.manifest.dataset.path}`, root));
  assert.equal(mappedBytes.toString(), `${JSON.stringify(mapping.dataset, null, 2)}\n`);
  assert.equal(createHash('sha256').update(mappedBytes).digest('hex'), mapping.manifest.dataset.sha256);
  const restored = structuredClone(mapping.dataset);
  assert.equal(restored.approved, true);
  restored.approved = false;
  for (const profile of [restored, restored.profiles.turn_step,
    restored.profiles.turn_step.neutral_conversation_profile,
    restored.profiles.turn_step.ordinary_result_policy,
    restored.profiles.n1.profile, restored.profiles.action_production]) {
    assert.equal(profile.status, 'approved');
    profile.status = 'pending_independent_data_approval';
  }
  assert.deepEqual(restored, candidate);
  assert.equal(mapping.dataset.import_authorized, false);
  assert.equal(mapping.dataset.activation_authorized, false);
  assert.equal(mapping.manifest.authority.exact_mapped_data_review_required, true);
});
