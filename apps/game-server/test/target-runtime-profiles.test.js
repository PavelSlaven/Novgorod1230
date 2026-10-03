import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadTargetRuntimeProfiles, loadTargetFiniteFirstEntryProfile,
  isUniqueTargetO1Applicability, readApprovedPostActionPerceptionProfile } from
  '../src/internal/target-runtime-profiles.js';
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
  assert.equal(loaded.post_action_perception_profile, null);
  const candidate = JSON.parse(await readFile(
    'data/world-catalogs/novgorod/live-world-runtime-v17/post-action-perception-profile.json',
    'utf8'));
  assert.equal(candidate.status, 'candidate');
  assert.deepEqual(candidate.approval, {});
  assert.equal(readApprovedPostActionPerceptionProfile(candidate, worldRevisionId),
    null);
  assert.equal(loaded.ordinary_profiles.s1, null);
  const o1Profile = loaded.materialization_profiles.ordinaryMaterializationProfile;
  assert.equal(o1Profile.schema, 'rus.live_world_runtime.ordinary_materialization_profile.v1');
  assert.equal(o1Profile.fallback_policy, 'forbidden');
  assert.equal(o1Profile.o1_presence.selector.applicability.rule_refs.length, 75);
  assert.equal(o1Profile.o1_presence.selector.applicability.selectors.length, 4);
  assert.ok(o1Profile.o1_presence.approval.limits.length > 0);
  assert.equal(o1Profile.o2a_ambient, null);
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

test('target O1 profile fails startup when any approved artifact or F01 source pin is missing or stale', async () => {
  const { TARGET_O1_PROFILE_ARTIFACT_PINS } = await import('../src/internal/target-o1-profile-pins.js');
  const cases = [
    ['missing profile', (pins) => { pins.profile.path += '.missing'; }],
    ['stale profile', (pins) => { pins.profile.sha256 = '0'.repeat(64); }],
    ['missing selector', (pins) => { pins.selector.path += '.missing'; }],
    ['stale selector', (pins) => { pins.selector.sha256 = '0'.repeat(64); }],
    ['missing approval', (pins) => { pins.approval.path += '.missing'; }],
    ['stale approval', (pins) => { pins.approval.sha256 = '0'.repeat(64); }],
    ['missing F01 source 1', (pins) => { pins.sources[0].path += '.missing'; }],
    ['stale F01 source 1', (pins) => { pins.sources[0].sha256 = '0'.repeat(64); }],
    ['missing F01 source 2', (pins) => { pins.sources[1].path += '.missing'; }],
    ['stale F01 source 2', (pins) => { pins.sources[1].sha256 = '0'.repeat(64); }],
  ];
  for (const [name, mutate] of cases) {
    const pins = structuredClone(TARGET_O1_PROFILE_ARTIFACT_PINS);
    mutate(pins);
    await assert.rejects(loadTargetRuntimeProfiles({ worldRevisionId, o1ArtifactPins: pins }), {
      code: 'SPATIAL_V3_TARGET_O1_PROFILE_APPROVAL_REQUIRED',
    }, name);
  }
  await assert.rejects(loadTargetRuntimeProfiles({ worldRevisionId,
    o1ArtifactPins: { ...structuredClone(TARGET_O1_PROFILE_ARTIFACT_PINS), sources: [] } }),
  { code: 'SPATIAL_V3_TARGET_O1_PROFILE_APPROVAL_REQUIRED' }, 'broken F01 source set');
});

test('target O1 applicability rejects duplicate rules, duplicate tuples and ambiguous site selectors', async () => {
  const { materialization_profiles: profiles } = await loadTargetRuntimeProfiles({ worldRevisionId });
  const applicability = profiles.ordinaryMaterializationProfile.o1_presence.selector.applicability;
  assert.equal(isUniqueTargetO1Applicability(applicability), true);

  const duplicateRule = structuredClone(applicability);
  duplicateRule.rule_refs[1] = structuredClone(duplicateRule.rule_refs[0]);
  assert.equal(isUniqueTargetO1Applicability(duplicateRule), false);

  const duplicateTuple = structuredClone(applicability);
  duplicateTuple.selectors[1] = structuredClone(duplicateTuple.selectors[0]);
  assert.equal(isUniqueTargetO1Applicability(duplicateTuple), false);

  const ambiguousSite = structuredClone(applicability);
  ambiguousSite.selectors[1] = { ...ambiguousSite.selectors[1],
    g4_ref: ambiguousSite.selectors[0].g4_ref,
    canonical_g5_ref: ambiguousSite.selectors[0].canonical_g5_ref };
  assert.equal(isUniqueTargetO1Applicability(ambiguousSite), false);
});

test('target post-action perception requires matching independent approval fields', async () => {
  const candidate = JSON.parse(await readFile(
    'data/world-catalogs/novgorod/live-world-runtime-v17/post-action-perception-profile.json',
    'utf8'));
  const approved = { ...candidate, status: 'approved', approval: {
    approved_by: 'reviewer', approved_on: '2026-10-01',
    approved_path: 'answers.md#REVIEW-d66-perception-2',
    approved_commit: 'review-commit'
  } };

  assert.equal(readApprovedPostActionPerceptionProfile(null, worldRevisionId), null);
  assert.equal(readApprovedPostActionPerceptionProfile(approved,
    'another-world-revision'), null);
  for (const field of Object.keys(approved.approval)) {
    const missing = structuredClone(approved);
    delete missing.approval[field];
    assert.equal(readApprovedPostActionPerceptionProfile(missing,
      worldRevisionId), null, field);
  }
  assert.deepEqual(readApprovedPostActionPerceptionProfile(approved,
    worldRevisionId), approved);

  const invalidSchema = structuredClone(approved);
  invalidSchema.profile_id = 'wrong-profile';
  assert.throws(() => readApprovedPostActionPerceptionProfile(invalidSchema,
    worldRevisionId), {
      code: 'SPATIAL_V3_TARGET_POST_ACTION_PERCEPTION_PROFILE_INVALID'
    });
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
