import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildStage12CodePrecheck } from '../src/stages/stage-12-player-character-audit/precheck.js';
import { TRACE_DEFINITION_REF, validateTracePlayerProfilePolicy } from '../src/stages/stage-11-player-character/trace-policy.js';
import { validateStage11PlayerCharacterOutput } from '../src/stages/stage-11-player-character/validation.js';
import { normalizeCharacterGenerationPolicy } from '../src/stages/stage-11-player-character/contract.js';
import { normalizeStage12AuditPolicy } from '../src/stages/stage-12-player-character-audit/input.js';

const root = process.cwd();
const read = (name) => JSON.parse(readFileSync(resolve(root, 'data/world-catalogs/novgorod/lower-dvina-trace-v1', name), 'utf8'));
const profile = read('player-profile.json');
const policy = read('approved-policy.json');
const refs = {
  social_role_id: profile.role.id,
  occupation_id: profile.occupation_id,
  name_candidate_id: profile.name_candidates[0].id,
  trace_definition_ref: TRACE_DEFINITION_REF,
  trace_player_profile_ref: policy.profile_ref
};
const dossier = () => ({
  schema: 'player_character_dossier', version: 1,
  social_status: { social_role_id: profile.role.id, occupation_id: profile.occupation_id },
  attributes: structuredClone(profile.attributes), skills: structuredClone(profile.skills), selected_candidate_refs: structuredClone(refs)
});
const codes = (value) => new Set(value.map((item) => item.code));
const activePolicy = { trace_player_profile_policy: policy };

test('trace policy accepts the exact approved profile and rejects each fail-closed boundary', () => {
  assert.deepEqual(validateTracePlayerProfilePolicy(dossier(), activePolicy), []);
  const cases = [
    ['missing skill', (value) => delete value.skills.riding, 'TRACE_PLAYER_PROFILE_SKILLS_NOT_EXACT'],
    ['unknown skill', (value) => { value.skills.unknown = value.skills.riding; }, 'TRACE_PLAYER_PROFILE_SKILLS_NOT_EXACT'],
    ['duplicate skill id', (value) => { value.skills.riding.skill_id = 'athletics'; }, 'TRACE_PLAYER_PROFILE_SKILLS_NOT_EXACT'],
    ['missing attribute', (value) => delete value.attributes.influence, 'TRACE_PLAYER_PROFILE_ATTRIBUTES_NOT_EXACT'],
    ['extra attribute', (value) => { value.attributes.extra = { value: 10, bonus: 0 }; }, 'TRACE_PLAYER_PROFILE_ATTRIBUTES_NOT_EXACT'],
    ['wrong bonus', (value) => { value.skills.athletics.bonus = 2; }, 'TRACE_PLAYER_PROFILE_SKILL_MISMATCH'],
    ['wrong attribute bonus', (value) => { value.attributes.reason.bonus = 1; }, 'TRACE_PLAYER_PROFILE_ATTRIBUTE_MISMATCH'],
    ['missing basis', (value) => delete value.skills.athletics.basis, 'TRACE_PLAYER_PROFILE_SKILL_BASIS_MISSING'],
    ['missing absence basis', (value) => delete value.skills.healing.absence_basis, 'TRACE_PLAYER_PROFILE_ABSENCE_BASIS_MISSING'],
    ['role mismatch', (value) => { value.selected_candidate_refs.social_role_id = 'nov_role_boatman'; }, 'TRACE_PLAYER_PROFILE_ROLE_MISMATCH'],
    ['selected occupation mismatch', (value) => { value.selected_candidate_refs.occupation_id = 'nov_occ_boatman'; }, 'TRACE_PLAYER_PROFILE_OCCUPATION_MISMATCH'],
    ['social status occupation mismatch', (value) => { value.social_status.occupation_id = 'nov_occ_boatman'; }, 'TRACE_PLAYER_PROFILE_OCCUPATION_MISMATCH'],
    ['forged basis', (value) => { value.skills.athletics.basis = 'Произвольное основание.'; }, 'TRACE_PLAYER_PROFILE_SKILL_BASIS_MISMATCH'],
    ['forged absence basis', (value) => { value.skills.healing.absence_basis = 'Произвольное отсутствие опыта.'; }, 'TRACE_PLAYER_PROFILE_ABSENCE_BASIS_MISMATCH'],
    ['basis instead of absence basis', (value) => { value.skills.healing.basis = value.skills.healing.absence_basis; delete value.skills.healing.absence_basis; }, 'TRACE_PLAYER_PROFILE_BASIS_FIELD_INVALID'],
    ['absence basis instead of basis', (value) => { value.skills.athletics.absence_basis = value.skills.athletics.basis; delete value.skills.athletics.basis; }, 'TRACE_PLAYER_PROFILE_BASIS_FIELD_INVALID'],
    ['profile digest mismatch', (value) => { value.selected_candidate_refs.trace_player_profile_ref.digest = '0'.repeat(64); }, 'TRACE_PLAYER_PROFILE_REF_MISMATCH'],
    ['definition revision mismatch', (value) => { value.selected_candidate_refs.trace_definition_ref.revision = 2; }, 'TRACE_PLAYER_PROFILE_DEFINITION_REF_MISMATCH']
  ];
  for (const [name, mutate, expected] of cases) {
    const value = dossier();
    mutate(value);
    assert.ok(codes(validateTracePlayerProfilePolicy(value, activePolicy)).has(expected), name);
  }
  assert.ok(codes(validateTracePlayerProfilePolicy(dossier(), { trace_player_profile_policy: { ...policy, name_candidate_ids: [] } })).has('TRACE_PLAYER_PROFILE_POLICY_INVALID'));
});

test('trace admission is opt-in and leaves ordinary Stage 12 policy unchanged', () => {
  for (const auditPolicy of [{}, { trace_player_profile_policy: null }]) {
    const precheck = buildStage12CodePrecheck({ player_character_dossier: dossier(), audit_policy: auditPolicy, start_place_audit: { pass: true }, regional_context_package: {}, item_profile_candidate_set: {}, npc_candidate_set: {} });
    assert.equal(Object.hasOwn(precheck.checks, 'trace_player_profile_valid'), false);
    assert.ok(!codes(precheck.concerns).has('TRACE_PLAYER_PROFILE_POLICY_INVALID'));
  }
  assert.deepEqual(validateTracePlayerProfilePolicy(dossier(), {}), []);
  assert.deepEqual(validateTracePlayerProfilePolicy(dossier(), { trace_player_profile_policy: null }), []);
  assert.equal(Object.hasOwn(normalizeCharacterGenerationPolicy({}), 'trace_player_profile_policy'), false);
  assert.equal(Object.hasOwn(normalizeStage12AuditPolicy({}), 'trace_player_profile_policy'), false);
  assert.deepEqual(normalizeCharacterGenerationPolicy({ trace_player_profile_policy: policy }).trace_player_profile_policy, policy);
  assert.deepEqual(normalizeStage12AuditPolicy({ trace_player_profile_policy: policy }).trace_player_profile_policy, policy);
});

test('explicit malformed or wrong-version trace policy fails closed', () => {
  assert.ok(codes(validateTracePlayerProfilePolicy(dossier(), { trace_player_profile_policy: 'invalid' })).has('TRACE_PLAYER_PROFILE_POLICY_INVALID'));
  assert.ok(codes(validateTracePlayerProfilePolicy(dossier(), { trace_player_profile_policy: { ...policy, schema: 'wrong' } })).has('TRACE_PLAYER_PROFILE_POLICY_INVALID'));
  assert.ok(codes(validateTracePlayerProfilePolicy(dossier(), { trace_player_profile_policy: { ...policy, revision: 2 } })).has('TRACE_PLAYER_PROFILE_POLICY_INVALID'));
  const forged = structuredClone(policy);
  forged.attributes.strength = { value: 18, bonus: 4 };
  forged.skills.athletics = { level: 'skilled', bonus: 2 };
  assert.ok(codes(validateTracePlayerProfilePolicy(dossier(), { trace_player_profile_policy: forged })).has('TRACE_PLAYER_PROFILE_POLICY_INVALID'));
});

test('Stage 12 precheck applies the explicit trace policy', () => {
  const value = dossier();
  value.selected_candidate_refs.trace_definition_ref.digest = '0'.repeat(64);
  const precheck = buildStage12CodePrecheck({ player_character_dossier: value, audit_policy: activePolicy, start_place_audit: { pass: true }, regional_context_package: {}, item_profile_candidate_set: {}, npc_candidate_set: {} });
  assert.equal(precheck.checks.trace_player_profile_valid, false);
  assert.ok(codes(precheck.concerns).has('TRACE_PLAYER_PROFILE_DEFINITION_REF_MISMATCH'));
  const forged = structuredClone(policy);
  forged.skills.athletics = { level: 'skilled', bonus: 2 };
  const forgedPrecheck = buildStage12CodePrecheck({ player_character_dossier: dossier(), audit_policy: { trace_player_profile_policy: forged }, start_place_audit: { pass: true }, regional_context_package: {}, item_profile_candidate_set: {}, npc_candidate_set: {} });
  assert.ok(codes(forgedPrecheck.concerns).has('TRACE_PLAYER_PROFILE_POLICY_INVALID'));
});

test('Stage 11 applies the same explicit trace policy', () => {
  const value = dossier();
  value.selected_candidate_refs.trace_player_profile_ref.digest = '0'.repeat(64);
  const input = {
    version: 1, schema: 'player_character_generator_input',
    normalized_request: {}, historical_frame: {}, regional_context_package: {}, selected_start_node: {}, start_place_audit: { pass: true }, npc_candidate_set: {}, item_profile_candidate_set: {},
    character_generation_policy: activePolicy
  };
  assert.ok(codes(validateStage11PlayerCharacterOutput(value, input)).has('TRACE_PLAYER_PROFILE_REF_MISMATCH'));
  input.character_generation_policy = { trace_player_profile_policy: 'invalid' };
  assert.ok(codes(validateStage11PlayerCharacterOutput(dossier(), input)).has('TRACE_PLAYER_PROFILE_POLICY_INVALID'));
  const forged = structuredClone(policy);
  forged.attributes.strength = { value: 18, bonus: 4 };
  input.character_generation_policy = { trace_player_profile_policy: forged };
  assert.ok(codes(validateStage11PlayerCharacterOutput(dossier(), input)).has('TRACE_PLAYER_PROFILE_POLICY_INVALID'));
});
