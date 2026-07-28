import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const directoryArgument = process.argv.indexOf('--directory');
const directory = directoryArgument === -1
  ? resolve(root, 'data/world-catalogs/novgorod/lower-dvina-trace-v1')
  : resolve(process.argv[directoryArgument + 1]);
const expectedDigests = Object.freeze({
  'definition.json': '3ed251d4ef1c7538da754b70f319bb213e4422b1d5e4e1dcd20c02753995c03b',
  'player-profile.json': '158c4248736e9d424608ccac4394be119a05626ba5f718fad3ccaf8dfd157a2e',
  'approved-policy.json': 'c73c636abf7b1e3728b8f929b61904ce292841786c8f01aac3265c047c114a36',
  'player-profile-set.json': '2a25fd04f0e9b71f1ab2805cd3d68620d9ea2d1646e0671e128e886eb54ee865'
});
const readJson = (name) => JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
const digest = (name) => createHash('sha256').update(readFileSync(resolve(directory, name))).digest('hex');
const fail = (message) => { throw new Error(`lower-dvina trace phase 0A: ${message}`); };
const digestValue = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const attributes = ['strength', 'dexterity', 'endurance', 'reason', 'attention', 'influence'];
const skills = ['athletics', 'stealth', 'melee', 'ranged_combat', 'craft', 'household', 'survival', 'riding', 'healing', 'observation', 'communication', 'custom_and_law'];
const unresolvedRequirements = Object.freeze({
  participant_profile_set: ['@rus/new-game', 'rus.trace_participant_profile_set.v1', '0B'],
  location_topology_set: ['@rus/movement-routes', 'rus.trace_location_topology_set.v1', '0B'],
  item_container_set: ['@rus/items-property', 'rus.trace_item_container_set.v1', '0C'],
  hidden_truth_candidate_set: ['code-driven-world-materialization', 'rus.trace_hidden_truth_candidate_set.v1', '0C'],
  clue_evidence_graph_set: ['@rus/visibility-knowledge-memory', 'rus.trace_clue_evidence_graph_set.v1', '0C'],
  knowledge_lie_memory_rules: ['@rus/visibility-knowledge-memory', 'rus.trace_knowledge_lie_memory_rules.v1', '0C'],
  activity_check_consequence_profiles: ['@rus/turn', 'rus.trace_activity_check_consequence_profiles.v1', '0D'],
  npc_decision_schedule_policies: ['@rus/npc-runtime', 'rus.trace_npc_decision_schedule_policies.v1', '0D'],
  movement_bindings: ['@rus/movement-routes', 'rus.trace_movement_bindings.v1', '0D'],
  body_environment_profiles: ['@rus/body-state', 'rus.trace_body_environment_profiles.v1', '0D'],
  promise_policy: ['@rus/social-law', 'rus.trace_promise_policy.v1', '0D'],
  completion_rules: ['@rus/visibility-knowledge-memory', 'rus.trace_completion_rules.v1', '0D'],
  epilogue_rules: ['@rus/presentation', 'rus.trace_epilogue_rules.v1', '0D']
});
const unresolvedKeys = ['category', 'expected_owner', 'expected_schema', 'planned_phase', 'required_status', 'resolution_status'];
const candidateIds = (items) => Array.isArray(items) ? items.map((item) => item?.id) : [];
const uniqueNonEmpty = (ids) => ids.length > 0 && ids.every((id) => typeof id === 'string' && id.length > 0) && new Set(ids).size === ids.length;

const definition = readJson('definition.json');
const profile = readJson('player-profile.json');
const policy = readJson('approved-policy.json');
const profileSet = readJson('player-profile-set.json');
const manifest = readJson('manifest.json');
const publicCatalogSource = readFileSync(resolve(root, 'apps/game-server/src/runtime/first-playable/setup.js'), 'utf8');

if (definition.schema !== 'rus.trace_scenario_definition.v1' || definition.scenario_id !== 'lower_dvina_trace_v1' || definition.revision !== 1 || definition.publication_status !== 'unpublished') fail('definition identity is invalid.');
if (definition.applicability?.schema !== 'rus.trace_scenario_applicability.v1'
  || definition.applicability?.version !== 1
  || definition.applicability?.region_ref?.node_id !== 'gn_nov_g1_xp017_yp026'
  || definition.applicability?.region_ref?.node_level !== 'g1'
  || definition.applicability?.season_id !== 'late_summer') fail('definition applicability is invalid.');
if (definition.readiness?.schema !== 'rus.trace_scenario_readiness.v1'
  || definition.readiness?.version !== 1
  || definition.readiness?.phase_status !== 'phase_0_incomplete'
  || definition.readiness?.materialization_status !== 'not_materializable'
  || definition.readiness?.publication_status !== 'not_publishable') fail('definition readiness is invalid.');
const unresolvedRefs = definition.required_unresolved_refs;
if (!Array.isArray(unresolvedRefs) || unresolvedRefs.length !== Object.keys(unresolvedRequirements).length) fail('required unresolved ref set must be complete and non-empty.');
const unresolvedCategories = unresolvedRefs.map((ref) => ref?.category);
if (new Set(unresolvedCategories).size !== unresolvedCategories.length) fail('required unresolved ref categories must be unique.');
for (const ref of unresolvedRefs) {
  const expected = unresolvedRequirements[ref?.category];
  if (!expected) fail(`unknown required unresolved ref category ${ref?.category}.`);
  if (JSON.stringify(Object.keys(ref).sort()) !== JSON.stringify(unresolvedKeys)) fail(`required unresolved ref ${ref.category} has an invalid shape.`);
  if (ref.expected_owner !== expected[0] || ref.expected_schema !== expected[1] || ref.planned_phase !== expected[2]) fail(`required unresolved ref ${ref.category} has an invalid owner, schema, or phase.`);
  if (ref.required_status !== 'unresolved_required' || ref.resolution_status !== 'unresolved') fail(`required unresolved ref ${ref.category} must remain unresolved.`);
}
if (!Object.keys(unresolvedRequirements).every((category) => unresolvedCategories.includes(category))) fail('required unresolved ref category is missing.');
if (profile.schema !== 'rus.trace_player_profile.v1' || profile.profile_id !== 'lower_dvina_trace_player_profile_mikula_v1' || profile.revision !== 1) fail('profile identity is invalid.');
if (policy.schema !== 'rus.trace_player_profile_policy.v1' || policy.policy_id !== 'lower_dvina_trace_player_profile_v1' || policy.revision !== 1 || policy.publication_status !== 'unpublished') fail('policy identity is invalid.');
if (profileSet.schema !== 'rus.trace_player_profile_set.v1' || profileSet.profile_set_id !== 'lower_dvina_trace_player_profile_set_v1' || profileSet.revision !== 1 || profileSet.publication_status !== 'unpublished') fail('profile-set identity is invalid.');
if (manifest.schema !== 'rus.trace_phase_0a_manifest.v1' || manifest.package_id !== 'lower_dvina_trace_phase_0a_v1' || manifest.revision !== 1 || manifest.publication_status !== 'unpublished') fail('manifest identity is invalid.');
if (publicCatalogSource.includes(definition.scenario_id)) fail('unpublished trace scenario must not be in the public catalog.');
for (const [name, expected] of Object.entries(expectedDigests)) {
  if (!digestValue(manifest.files?.[name]) || manifest.files[name] !== expected || digest(name) !== expected) fail(`trusted digest mismatch for ${name}.`);
}
const refMatches = (ref, id, revision, value) => ref?.id === id && ref?.revision === revision && ref?.digest === value && digestValue(ref?.digest);
if (!refMatches(definition.player_profile_set_ref, profileSet.profile_set_id, 1, expectedDigests['player-profile-set.json'])) fail('definition profile-set ref is invalid.');
if (!refMatches(profileSet.approved_policy_ref, policy.policy_id, 1, expectedDigests['approved-policy.json'])) fail('profile-set policy ref is invalid.');
if (!Array.isArray(profileSet.profile_candidates) || profileSet.profile_candidates.length !== 1 || !refMatches(profileSet.profile_candidates[0], profile.profile_id, 1, expectedDigests['player-profile.json'])) fail('profile-set profile ref is invalid.');
if (!refMatches(policy.profile_ref, profile.profile_id, 1, expectedDigests['player-profile.json'])) fail('policy profile ref is invalid.');
const profileNames = candidateIds(profile.name_candidates);
const setNames = candidateIds(profileSet.name_candidates);
if (!uniqueNonEmpty(profileNames) || !uniqueNonEmpty(setNames) || !uniqueNonEmpty(policy.name_candidate_ids) || JSON.stringify(profileNames) !== JSON.stringify(setNames) || JSON.stringify(profileNames) !== JSON.stringify(policy.name_candidate_ids)) fail('name candidates must be non-empty, unique, and exactly agreed.');
if (profile.role?.id !== 'nov_role_merchant_clerk' || profile.role?.applicability !== 'usable_with_caution') fail('profile must bind the approved merchant-clerk role.');
if (profile.occupation_id !== 'nov_occ_merchant_clerk' || policy.occupation_id !== profile.occupation_id) fail('policy and profile must bind the exact approved occupation.');
if (Object.keys(profile.attributes ?? {}).length !== 6 || !attributes.every((id) => profile.attributes[id]?.value !== undefined && profile.attributes[id]?.bonus !== undefined)) fail('attributes must be exact six with values and bonuses.');
if (Object.keys(profile.skills ?? {}).length !== 12 || !skills.every((id) => profile.skills[id])) fail('skills must be exact canonical twelve.');
for (const id of skills) {
  const skill = profile.skills[id];
  const expectedBonus = { no_experience: 0, familiar: 1, skilled: 2 }[skill.level];
  if (expectedBonus === undefined || skill.bonus !== expectedBonus) fail(`invalid skill level or bonus for ${id}.`);
  if (skill.level === 'no_experience') {
    if (Object.hasOwn(skill, 'basis') || !skill.absence_basis) fail(`invalid approved absence basis shape for ${id}.`);
  } else if (Object.hasOwn(skill, 'absence_basis') || !skill.basis) {
    fail(`invalid approved basis shape for ${id}.`);
  }
  const policySkill = policy.skills?.[id];
  if (policySkill?.level !== skill.level || policySkill?.bonus !== skill.bonus) fail(`policy mismatch for ${id}.`);
  if (skill.level === 'no_experience') {
    if (Object.hasOwn(policySkill ?? {}, 'basis') || policySkill?.absence_basis !== skill.absence_basis) fail(`policy absence_basis mismatch for ${id}.`);
  } else if (Object.hasOwn(policySkill ?? {}, 'absence_basis') || policySkill?.basis !== skill.basis) {
    fail(`policy basis mismatch for ${id}.`);
  }
}
console.log(JSON.stringify({ package_id: manifest.package_id, manifest_digest: createHash('sha256').update(readFileSync(resolve(directory, 'manifest.json'))).digest('hex') }));
