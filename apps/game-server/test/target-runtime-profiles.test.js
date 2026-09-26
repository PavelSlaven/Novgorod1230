import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTargetRuntimeProfiles, loadTargetFiniteFirstEntryProfile } from '../src/internal/target-runtime-profiles.js';
import { createTargetFiniteFirstEntryPorts } from '../src/infrastructure/postgres/ordinary-materialization-first-entry-provisioning.js';
import { targetFiniteProfileCatalogFixture } from '../../../test/spatial-v3/target-finite-profile-fixture.js';
import { createLowerDvinaTraceA1ProductionResolverFactory } from '../src/runtime/releases/lower-dvina-trace-a1-production.js';
import { validNeutralActionProductionProfile } from '../src/internal/lower-dvina-trace-a1-bundle.js';
import { createLowerDvinaTraceTurnStepGenericOwners } from '../src/runtime/lower-dvina-trace-turn-step-generic-owners.js';
import { loadLiveWorldAuthoredStartCatalog } from '../src/internal/live-world-authored-starts.js';
import { validateLowerDvinaTraceOrdinaryStageBApproval } from
  '../src/internal/lower-dvina-trace-ordinary-stage-b-approval.js';
import { readApprovedNaturalFirstEntryAuthoring } from
  '../src/infrastructure/postgres/ordinary-materialization-first-entry-natural.js';
import { deriveApprovedGeneratedSceneV2Bindings } from
  '../src/infrastructure/postgres/approved-generated-scene-v2-bindings.js';

const worldRevisionId = 'novgorod_spatial_v3_target_contract_approval_001';

test('historical v16 authored turn owners retain their approved revision without a target pin', async () => {
  const { turn_profile: loaded } = await loadLiveWorldAuthoredStartCatalog();
  assert.equal(loaded.profile.profile_set_id, 'novgorod_live_world_turn_step_owner_profiles_v1');
  assert.equal(loaded.profile.revision, 2);
  const owners = createLowerDvinaTraceTurnStepGenericOwners({ profiles: loaded.profile, artifactPin: loaded.pin });
  assert.equal(owners.semanticActivityScheduleOwner.resolve({ activity: {
    duration_class: 'moment', effort: 'none' } }).duration_minutes, 1);
});

test('target turn owners require the exact release-selected approved profile pin', async () => {
  const { turn_profile: loaded } = await loadTargetRuntimeProfiles({ worldRevisionId });
  const input = { profiles: loaded.profile, artifactPin: loaded.pin,
    selectedProfilePin: loaded.selected_profile_pin };
  const owners = createLowerDvinaTraceTurnStepGenericOwners(input);
  assert.equal(owners.semanticActivityScheduleOwner.resolve({ activity: {
    duration_class: 'moment', effort: 'none' } }).duration_minutes, 1);
  const invalid = [undefined, null, {}, ...['artifact_id', 'revision', 'digest'].map((key) => ({
    ...loaded.selected_profile_pin, [key]: key === 'revision' ? 999 : 'wrong' }))];
  for (const selectedProfilePin of invalid) assert.throws(() =>
    createLowerDvinaTraceTurnStepGenericOwners({ ...input, selectedProfilePin }),
  { code: 'TRACE_TURN_STEP_OWNER_PROFILES_INVALID' });
  const changed = structuredClone(input);
  changed.profiles.semantic_duration_profiles[0].duration_minutes += 1;
  assert.throws(() => createLowerDvinaTraceTurnStepGenericOwners(changed),
    { code: 'TRACE_TURN_STEP_OWNER_PROFILES_INVALID' });
  assert.throws(() => createLowerDvinaTraceTurnStepGenericOwners({ ...input,
    artifactPin: { ...loaded.pin, digest: '0'.repeat(64) } }),
  { code: 'TRACE_TURN_STEP_OWNER_PROFILES_INVALID' });
});

test('target mapped approval admits generic mechanics and preserves explicit missing owners', async () => {
  const loaded = await loadTargetRuntimeProfiles({ worldRevisionId });
  assert.equal(loaded.turn_profile.profile.status, 'approved');
  assert.equal(loaded.applicability.length, 33);
  assert.equal(loaded.ordinary_profiles.s1, null);
  assert.equal(loaded.materialization_profiles.ordinaryMaterializationProfile, null);
  assert.equal(loaded.materialization_profiles.localFireProfile, null);
  const action = loaded.materialization_profiles.actionProductionProfile;
  assert.ok(validNeutralActionProductionProfile(action.profile));
  const factory = createLowerDvinaTraceA1ProductionResolverFactory({ loadedProfile: action,
    pool: { query: async () => { throw new Error('construction must not query'); } } });
  assert.equal(typeof factory, 'function');
  const changed = structuredClone(action);
  changed.profile.max_new_entities = 99;
  assert.throws(() => createLowerDvinaTraceA1ProductionResolverFactory({ loadedProfile: changed,
    pool: { query: async () => ({ rows: [] }) } }), /Exact loaded A1 profile/u);
  await assert.rejects(loadTargetRuntimeProfiles({ worldRevisionId: 'historical-world' }),
    { code: 'SPATIAL_V3_TARGET_RUNTIME_PROFILE_APPROVAL_REQUIRED' });
});

test('finite-only profile selects exactly approved Stage B without ambient', async () => {
  const verifiedCatalog = await targetFiniteProfileCatalogFixture();
  const loaded = await loadTargetFiniteFirstEntryProfile({ worldRevisionId, verifiedCatalog });
  assert.equal(loaded.candidate_sha256, 'fcd2b47ff318b79031dc309193c159afd71909418beab1f77e9a455c4160bacd');
  assert.deepEqual(loaded.profile.execution.allowed_disclosure_policy_refs, []);
  assert.equal(loaded.profile.stage_b_classification_eval.version, 2);
  assert.equal(loaded.profile.stage_b_classification_eval.cases.length, 13);
  assert.equal(loaded.stage_b_approval.model_identity.model,
    'qwen3.8-27b-uncensored-w4a16-tp2');
  assert.equal(validateLowerDvinaTraceOrdinaryStageBApproval(loaded.stage_b_approval,
    loaded.profile.stage_b_classification_eval), true);
  const items = readApprovedNaturalFirstEntryAuthoring(loaded.naturalSourceAuthoring);
  const property = deriveApprovedGeneratedSceneV2Bindings(
    JSON.parse(loaded.propertySourceAuthoring.candidateBytes), loaded.propertySourceAuthoring);
  for (const family of items.family_profiles) {
    for (const ref of family.exact_match.scene_template_refs.filter((value) => value.endsWith('@1'))) {
      assert.ok(family.exact_match.scene_template_refs.includes(`${ref.slice(0, -1)}2`));
    }
  }
  for (const family of property.family_bindings) {
    for (const ref of family.scene_template_refs.filter((value) => value.endsWith('@1'))) {
      assert.ok(family.scene_template_refs.includes(`${ref.slice(0, -1)}2`));
    }
  }
  assert.throws(() => readApprovedNaturalFirstEntryAuthoring({ ...loaded.naturalSourceAuthoring,
    sceneTemplateBytes: `${loaded.naturalSourceAuthoring.sceneTemplateBytes} ` }),
  /Exact approved scene v2 source/);
  assert.equal(validateLowerDvinaTraceOrdinaryStageBApproval({ ...loaded.stage_b_approval,
    model_identity: { ...loaded.stage_b_approval.model_identity, model: 'another-model' } },
  loaded.profile.stage_b_classification_eval), false);
  assert.equal(Object.hasOwn(loaded.profile, 'o2a_ambient'), false);
  assert.equal(typeof createTargetFiniteFirstEntryPorts(loaded).prepareFirstEntry, 'function');
  for (const key of ['naturalSourceAuthoring', 'propertySourceAuthoring']) {
    const changed = structuredClone(loaded);
    changed[key].candidateBytes += ' ';
    assert.throws(() => createTargetFiniteFirstEntryPorts(changed));
  }
  await assert.rejects(loadTargetFiniteFirstEntryProfile({ worldRevisionId: 'historical-world' }),
    { code: 'SPATIAL_V3_TARGET_FINITE_PROFILE_APPROVAL_REQUIRED' });
  for (const catalog of [null, { ...verifiedCatalog, records_by_table: { procedural_scene_compiled_records: [] } },
    { ...verifiedCatalog, verified: false }]) {
    await assert.rejects(loadTargetFiniteFirstEntryProfile({ worldRevisionId, verifiedCatalog: catalog }),
      { code: 'SPATIAL_V3_TARGET_FINITE_PROFILE_APPROVAL_REQUIRED' });
  }
});
