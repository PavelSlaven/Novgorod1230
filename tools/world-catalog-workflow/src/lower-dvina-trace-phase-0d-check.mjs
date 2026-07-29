import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import * as itemsProperty from '@rus/items-property';
import * as combatHealth from '@rus/combat-health';
import * as visibilityKnowledgeMemory from '@rus/visibility-knowledge-memory';

class TracePhase0DValidationError extends Error {
  constructor(code, message) {
    super(`lower-dvina trace phase 0D [${code}]: ${message}`);
    this.name = 'TracePhase0DValidationError';
    this.code = code;
  }
}

const root = process.cwd();
const argumentValue = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
};
const validationOnly = process.argv.includes('--validation-only');
const directoryArgument = argumentValue('--directory');
if (directoryArgument && !validationOnly) {
  throw new TracePhase0DValidationError(
    'TRACE_0D_SOURCE_OVERRIDE_FORBIDDEN',
    'directory override is allowed only for validation fixtures'
  );
}
const directory = directoryArgument
  ? resolve(directoryArgument)
  : resolve(root, 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d');
const fail = (code, message) => { throw new TracePhase0DValidationError(code, message); };
const requireCondition = (condition, code, message) => { if (!condition) fail(code, message); };
const readJsonPath = (path) => JSON.parse(readFileSync(path, 'utf8'));
const readJson = (name) => readJsonPath(resolve(directory, name));
const sha256Path = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const sha256 = (name) => sha256Path(resolve(directory, name));
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const digestValue = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const unique = (values) => Array.isArray(values) && new Set(values).size === values.length;
const exactSet = (values, expected) => unique(values)
  && values.length === expected.length
  && expected.every((value) => values.includes(value));
const mapUnique = (values, key, code) => {
  requireCondition(Array.isArray(values), code, `${key} collection is required`);
  const result = new Map();
  for (const value of values) {
    requireCondition(text(value?.[key]) && !result.has(value[key]), code, `${key} is missing or duplicated`);
    result.set(value[key], value);
  }
  return result;
};
const forbiddenPolicies = (value, label) => {
  for (const key of ['fallback_policy', 'normalization_policy', 'alias_policy']) {
    requireCondition(value?.[key] === 'forbidden', 'TRACE_0D_SEMANTIC_FALLBACK', `${label} ${key} must be forbidden`);
  }
};

for (const phase of ['0a', '0b', '0c']) {
  const checker = resolve(root, `tools/world-catalog-workflow/src/lower-dvina-trace-phase-${phase}-check.mjs`);
  const result = spawnSync(process.execPath, [checker], { cwd: root, encoding: 'utf8' });
  requireCondition(
    result.status === 0,
    'TRACE_0D_DEPENDENCY_CHECK_FAILED',
    `phase ${phase.toUpperCase()} checker failed: ${(result.stderr || result.stdout).trim()}`
  );
}

const files = Object.freeze([
  'definition.json',
  'activity-check-consequence-profiles.json',
  'npc-decision-schedule-policies.json',
  'movement-bindings.json',
  'location-access-policies.json',
  'location-capacity-contracts.json',
  'body-environment-profiles.json',
  'promise-policy.json',
  'completion-rules.json',
  'epilogue-rules.json'
]);
const trustedDigests = Object.freeze({
  'definition.json': '76576704c1fbc73635ad89ced4a91598cdd5fffd583e4b3f96add36f0c0c20ba',
  'activity-check-consequence-profiles.json': '5eefc71c6a73c1604f606d1f84862cf5f6d7a774a957f10ad9ead7e950717654',
  'npc-decision-schedule-policies.json': 'd37ba0f3c22b248304ce108e20067f39e9c5bfd8bdae1b03350e270d51ad50ca',
  'movement-bindings.json': 'dcad38f997150d7cdab887db02ac51862b405284835bbefbd83c809810e34a29',
  'location-access-policies.json': '68e11b8c85f860674a5d9990b6a8ec72527aab9574c291f199b06fccf4fc2257',
  'location-capacity-contracts.json': '8e7698a72f3925f76b6dc7a09485d1d4be7ea1f0a109cd0fe0fccbc2b77af4b6',
  'body-environment-profiles.json': '31f1b404868ac919e589acbc0d5c4bf7d5c04caa146b9201c065ee2a54f9757d',
  'promise-policy.json': '9b6c4096886782151bf49f80f2bfdb8a1062576824fbcafde92143859f69574b',
  'completion-rules.json': '497e6ed12d4393f890e47e38e61a52a2f103a6ad0546793ec587b329364fc614',
  'epilogue-rules.json': '959f42e52147d9e19f5ac945e336b0280090f2d7025e79c01159f341a2ed36c3'
});
const contentKeys = Object.freeze({
  'definition.json': 'definition',
  'activity-check-consequence-profiles.json': 'activity_check_consequence_profiles',
  'npc-decision-schedule-policies.json': 'npc_decision_schedule_policies',
  'movement-bindings.json': 'movement_bindings',
  'location-access-policies.json': 'location_access_policies',
  'location-capacity-contracts.json': 'location_capacity_contracts',
  'body-environment-profiles.json': 'body_environment_profiles',
  'promise-policy.json': 'promise_policy',
  'completion-rules.json': 'completion_rules',
  'epilogue-rules.json': 'epilogue_rules'
});
const values = Object.fromEntries(files.map((name) => [name, readJson(name)]));
const manifest = readJson('manifest.json');
requireCondition(
  exactSet(
    readdirSync(directory).filter((name) => name.endsWith('.json')),
    [...files, 'manifest.json']
  ),
  'TRACE_0D_EXTRA_ARTIFACT',
  'phase 0D directory contains an unknown JSON artifact'
);
const definition = values['definition.json'];
const activities = values['activity-check-consequence-profiles.json'];
const npc = values['npc-decision-schedule-policies.json'];
const movement = values['movement-bindings.json'];
const access = values['location-access-policies.json'];
const capacity = values['location-capacity-contracts.json'];
const body = values['body-environment-profiles.json'];
const promise = values['promise-policy.json'];
const completion = values['completion-rules.json'];
const epilogue = values['epilogue-rules.json'];

requireCondition(
  manifest.schema === 'rus.trace_phase_0d_manifest.v1'
    && manifest.package_id === 'lower_dvina_trace_phase_0d_v1'
    && manifest.revision === 1
    && manifest.scenario_definition_revision === 4
    && manifest.publication_status === 'unpublished',
  'TRACE_0D_MANIFEST_IDENTITY',
  'manifest identity is invalid'
);
forbiddenPolicies(manifest, 'manifest');
requireCondition(exactSet(Object.keys(manifest.files ?? {}), files), 'TRACE_0D_MANIFEST_FILES', 'manifest file set is incomplete or contains an unknown artifact');
requireCondition(exactSet(Object.keys(manifest.content_refs ?? {}), Object.values(contentKeys)), 'TRACE_0D_CONTENT_REFS', 'content ref set is incomplete or contains an unknown category');
for (const name of files) {
  const actual = sha256(name);
  const ref = manifest.content_refs[contentKeys[name]];
  requireCondition(manifest.files[name] === actual && ref?.digest === actual, 'TRACE_0D_DIGEST_MISMATCH', `digest mismatch: ${name}`);
  requireCondition(ref?.path === name && ref?.schema === values[name].schema && ref?.revision === values[name].revision, 'TRACE_0D_CONTENT_REF', `content ref mismatch: ${name}`);
  requireCondition(validationOnly || actual === trustedDigests[name], 'TRACE_0D_TRUSTED_DIGEST_MISMATCH', `trusted digest mismatch: ${name}`);
}
const digestText = Object.entries(manifest.files)
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([name, digest]) => `${name}:${digest}`)
  .join('\n') + '\n';
requireCondition(
  manifest.content_digest_algorithm === 'sha256_sorted_filename_colon_digest_lf_v1'
    && manifest.content_digest === createHash('sha256').update(digestText).digest('hex'),
  'TRACE_0D_CONTENT_DIGEST',
  'aggregate content digest is invalid'
);
requireCondition(Array.isArray(manifest.remaining_unresolved_refs) && manifest.remaining_unresolved_refs.length === 0, 'TRACE_0D_UNRESOLVED', 'manifest contains unresolved refs');

const expectedDependencies = Object.freeze({
  phase_0a_player_profile_set: ['lower_dvina_trace_player_profile_set_v1', 1, 'data/world-catalogs/novgorod/lower-dvina-trace-v1/player-profile-set.json', '2a25fd04f0e9b71f1ab2805cd3d68620d9ea2d1646e0671e128e886eb54ee865'],
  phase_0b_participant_profile_set: ['trace_ld_v1_participant_profile_set', 1, 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0b/participant-profile-set.json', '33e45b8b8b57f98debb254e5e76c881cf3ffe10985042811ed85390e38f588ce'],
  phase_0b_location_topology_set: ['trace_ld_v1_location_topology_set', 1, 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0b/location-topology-set.json', '3410d8652aa87d76a2be37cf6f21b9179ac3dd61c88ea84b94486b19765342ce'],
  phase_0c_manifest: ['lower_dvina_trace_phase_0c_v1', 1, 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0c/manifest.json', 'e14ec250fde3af1dc72e533d03983377f8ffabb607c5c33417ba926041be6429'],
  phase_0c_item_container_set: ['trace_ld_v1_item_container_set', 1, 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0c/item-container-set.json', '182fb92641c8c053027718f52eed3467ce9ed79971e7168f4bc8727e1a169a3f'],
  phase_0c_hidden_truth_candidate_set: ['trace_ld_v1_hidden_truth_candidate_set', 1, 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0c/hidden-truth-candidate-set.json', 'b4601339813dd253a7a280cd68ad0925202c989998c6cae5bca9e820f1a7b616'],
  phase_0c_clue_evidence_graph_set: ['trace_ld_v1_clue_evidence_graph_set', 1, 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0c/clue-evidence-graph-set.json', '7ad621e00550ddf4b1a714c4effc9c678ed7c3c2e421ce0e4128bf998b0b8222'],
  phase_0c_knowledge_lie_memory_rules: ['trace_ld_v1_knowledge_lie_memory_rules', 1, 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0c/knowledge-lie-memory-rules.json', '6c296a6ebe096633ae58c9ff45dc4a44f92ce56d7843e10bc3133718e6155046'],
  temporal_calendar_approval: ['record:calendar_daylight_light_profiles:novgorod_1230_1233_v2', 1, 'data/world-catalogs/novgorod/temporal-v4/approvals/calendar_daylight_light_profiles.json', 'ca020d053986a9796e7d5b4e747c33e7d8105bff366d36c11386812a7d145ea1'],
  temporal_calendar_dataset: ['record:calendar_daylight_light_profiles:novgorod_1230_1233_v2', 1, 'data/world-catalogs/novgorod/temporal-v4/datasets/calendar_daylight_light_profiles.json', 'e861c4136307507880451532a76e8729a874d459650a905383b70661776fe86e'],
  turn_declarative_contracts: ['rus.turn.declarative_content_contracts.v1', 1, 'packages/turn/src/declarative-content-contracts.v1.json', 'aa4dd295998f5fde3d64cf1718e532671f524c994f6742d0c5bddb176d2e7ed7'],
  npc_runtime_declarative_contracts: ['rus.npc_runtime.declarative_content_contracts.v1', 1, 'packages/npc-runtime/src/declarative-content-contracts.v1.json', '2b11ebd5733869c4b9d24769f87ae36a6ffda313cb402e9de3768ea96c0ff009'],
  movement_routes_declarative_contracts: ['rus.movement_routes.declarative_content_contracts.v1', 1, 'packages/movement-routes/src/declarative-content-contracts.v1.json', '8d56dd92ba5a5681b76518fba4c7fab979ba5fce6d40addcc68b89ace0252175'],
  items_property_declarative_contracts: ['rus.items_property.declarative_content_contracts.v1', 1, 'packages/items-property/src/declarative-content-contracts.v1.json', '1b0d5c07b271eec3e5f3ab884a0f76c86c408cd3ae9b399d00a1f8a429e49e25'],
  combat_health_declarative_contracts: ['rus.combat_health.declarative_content_contracts.v1', 1, 'packages/combat-health/src/declarative-content-contracts.v1.json', '4511f5c0df0564e20dece80adea48b0e88b62572d492775ad01e0301394b2bed'],
  party_store_declarative_contracts: ['rus.party_store.declarative_content_contracts.v1', 1, 'packages/party-store/src/declarative-content-contracts.v1.json', '57573a9cec29d48971f15d84a7091c8281b7e1b11b4c61774ce39d05996c5c8e'],
  body_state_declarative_contracts: ['rus.body_state.declarative_content_contracts.v1', 1, 'packages/body-state/src/declarative-content-contracts.v1.json', '221d58d9e4f282afef739f1187a9936a1596480d0cb11eb58b6e8511b51fbadd'],
  social_law_declarative_contracts: ['rus.social_law.declarative_content_contracts.v1', 1, 'packages/social-law/src/declarative-content-contracts.v1.json', 'ab8de85822bdb778c280ba9fa4d20250addd02c058784d79dd69d05de8c7358e'],
  visibility_knowledge_memory_declarative_contracts: ['rus.visibility_knowledge_memory.declarative_content_contracts.v1', 1, 'packages/visibility-knowledge-memory/src/declarative-content-contracts.v1.json', '5c0a3ce0953867ce2f913a6b5149d108ca85708fef38396be3ebb59357ed2a96'],
  presentation_declarative_contracts: ['rus.presentation.declarative_content_contracts.v1', 1, 'packages/presentation/src/declarative-content-contracts.v1.json', 'fd2056d48f74ea912d465575dd2d2ff5e6947b0a49c10fce727bd16d52ff91e4'],
  checks_rng_declarative_contracts: ['rus.checks_rng.declarative_content_contracts.v1', 1, 'packages/checks-rng/src/declarative-content-contracts.v1.json', '4e7741bcea90d6264a643b8c55dbdb9b28d1975c1736c094e6096701ea2481ca'],
  time_events_history_declarative_contracts: ['rus.time_events_history.declarative_content_contracts.v1', 1, 'packages/time-events-history/src/declarative-content-contracts.v1.json', 'cdc4571c07e2c592cbfb469a7028c31791d82deadbc9b37a97f44ee58597a471'],
  narration_declarative_contracts: ['rus.narration.declarative_content_contracts.v1', 1, 'packages/narration/src/declarative-content-contracts.v1.json', '0c24c3ccf8d3b6b2e0838e825f73c9050c886204e6e0c5a5215937b0cc18f64f']
});
requireCondition(exactSet(Object.keys(manifest.immutable_dependency_refs ?? {}), Object.keys(expectedDependencies)), 'TRACE_0D_DEPENDENCY_SET', 'immutable dependency set is incomplete or unknown');
for (const [key, [id, revision, path, digest]] of Object.entries(expectedDependencies)) {
  const ref = manifest.immutable_dependency_refs[key];
  requireCondition(ref?.id === id && ref?.revision === revision && ref?.path === path && ref?.digest === digest, 'TRACE_0D_DEPENDENCY_REF', `dependency ref mismatch: ${key}`);
  requireCondition(sha256Path(resolve(root, path)) === digest, 'TRACE_0D_DEPENDENCY_DIGEST', `dependency source digest mismatch: ${key}`);
}
requireCondition(
  manifest.superseded_definition_ref?.id === 'lower_dvina_trace_v1'
    && manifest.superseded_definition_ref?.revision === 3
    && manifest.superseded_definition_ref?.path === 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0c/definition.json'
    && manifest.superseded_definition_ref?.digest === '23e4600585abe27557ab1acdcadde1fee041cf55e05f096a21ac025c96f26c24',
  'TRACE_0D_SUPERSEDED_REF',
  'superseded definition ref is not exact'
);
for (const ref of Object.values(manifest.legacy_boatman_regression_refs ?? {})) {
  requireCondition(text(ref.path) && digestValue(ref.digest) && sha256Path(resolve(root, ref.path)) === ref.digest, 'TRACE_0D_BOATMAN_REGRESSION', 'boatman artifact changed or ref is invalid');
}
requireCondition(manifest.legacy_boatman_regression_refs?.scenario?.scenario_id === 'lower_dvina_late_summer_open_water_v1', 'TRACE_0D_BOATMAN_REGRESSION', 'legacy boatman scenario ID changed');

requireCondition(
  definition.schema === 'rus.trace_scenario_definition.v1'
    && definition.scenario_id === 'lower_dvina_trace_v1'
    && definition.revision === 4
    && definition.publication_status === 'unpublished',
  'TRACE_0D_DEFINITION_IDENTITY',
  'definition identity is invalid'
);
requireCondition(
  definition.supersedes_definition_ref?.revision === 3
    && definition.supersedes_definition_ref?.id === 'lower_dvina_trace_v1'
    && definition.supersedes_definition_ref?.path === manifest.superseded_definition_ref.path
    && definition.supersedes_definition_ref?.digest === manifest.superseded_definition_ref.digest,
  'TRACE_0D_DEFINITION_CHAIN',
  'revision 4 does not exact-supersede revision 3'
);
requireCondition(
  definition.readiness?.phase_status === 'phase_0_complete'
    && definition.readiness?.materialization_status === 'definition_accepted_for_later_materialization'
    && definition.readiness?.publication_status === 'not_publishable',
  'TRACE_0D_READINESS',
  'definition is not complete for later materialization while unpublished'
);
requireCondition(Array.isArray(definition.required_unresolved_refs) && definition.required_unresolved_refs.length === 0, 'TRACE_0D_UNRESOLVED', 'definition contains unresolved refs');

const expectedPolicies = Object.freeze({
  activity_check_consequence_profiles: ['@rus/turn', 'rus.trace_activity_check_consequence_profiles.v1', 'trace_ld_v1_activity_check_consequence_profiles', 'activity-check-consequence-profiles.json'],
  npc_decision_schedule_policies: ['@rus/npc-runtime', 'rus.trace_npc_decision_schedule_policies.v1', 'trace_ld_v1_npc_decision_schedule_policies', 'npc-decision-schedule-policies.json'],
  movement_bindings: ['@rus/movement-routes', 'rus.trace_movement_bindings.v1', 'trace_ld_v1_movement_bindings', 'movement-bindings.json'],
  location_access_policies: ['@rus/movement-routes', 'rus.trace_scene_access_policy_set.v1', 'trace_ld_v1_location_access_policies', 'location-access-policies.json'],
  location_capacity_contracts: ['@rus/party-store', 'rus.trace_scene_capacity_contract_set.v1', 'trace_ld_v1_location_capacity_contracts', 'location-capacity-contracts.json'],
  body_environment_profiles: ['@rus/body-state', 'rus.trace_body_environment_profiles.v1', 'trace_ld_v1_body_environment_profiles', 'body-environment-profiles.json'],
  promise_policy: ['@rus/social-law', 'rus.trace_promise_policy.v1', 'trace_ld_v1_promise_no_summary_killing', 'promise-policy.json'],
  completion_rules: ['@rus/visibility-knowledge-memory', 'rus.trace_completion_rules.v1', 'trace_ld_v1_completion_rules', 'completion-rules.json'],
  epilogue_rules: ['@rus/presentation', 'rus.trace_epilogue_rules.v1', 'trace_ld_v1_epilogue_rules', 'epilogue-rules.json']
});
const expectedOwnerRegistries = Object.freeze({
  activity_check_consequence_profiles: ['packages/turn/src/declarative-content-contracts.v1.json', 'aa4dd295998f5fde3d64cf1718e532671f524c994f6742d0c5bddb176d2e7ed7', 'rus.turn.declarative_content_contracts.v1'],
  npc_decision_schedule_policies: ['packages/npc-runtime/src/declarative-content-contracts.v1.json', '2b11ebd5733869c4b9d24769f87ae36a6ffda313cb402e9de3768ea96c0ff009', 'rus.npc_runtime.declarative_content_contracts.v1'],
  movement_bindings: ['packages/movement-routes/src/declarative-content-contracts.v1.json', '8d56dd92ba5a5681b76518fba4c7fab979ba5fce6d40addcc68b89ace0252175', 'rus.movement_routes.declarative_content_contracts.v1'],
  location_access_policies: ['packages/movement-routes/src/declarative-content-contracts.v1.json', '8d56dd92ba5a5681b76518fba4c7fab979ba5fce6d40addcc68b89ace0252175', 'rus.movement_routes.declarative_content_contracts.v1'],
  location_capacity_contracts: ['packages/party-store/src/declarative-content-contracts.v1.json', '57573a9cec29d48971f15d84a7091c8281b7e1b11b4c61774ce39d05996c5c8e', 'rus.party_store.declarative_content_contracts.v1'],
  body_environment_profiles: ['packages/body-state/src/declarative-content-contracts.v1.json', '221d58d9e4f282afef739f1187a9936a1596480d0cb11eb58b6e8511b51fbadd', 'rus.body_state.declarative_content_contracts.v1'],
  promise_policy: ['packages/social-law/src/declarative-content-contracts.v1.json', 'ab8de85822bdb778c280ba9fa4d20250addd02c058784d79dd69d05de8c7358e', 'rus.social_law.declarative_content_contracts.v1'],
  completion_rules: ['packages/visibility-knowledge-memory/src/declarative-content-contracts.v1.json', '5c0a3ce0953867ce2f913a6b5149d108ca85708fef38396be3ebb59357ed2a96', 'rus.visibility_knowledge_memory.declarative_content_contracts.v1'],
  epilogue_rules: ['packages/presentation/src/declarative-content-contracts.v1.json', 'fd2056d48f74ea912d465575dd2d2ff5e6947b0a49c10fce727bd16d52ff91e4', 'rus.presentation.declarative_content_contracts.v1']
});
requireCondition(exactSet(Object.keys(definition.resolved_policy_refs ?? {}), Object.keys(expectedPolicies)), 'TRACE_0D_POLICY_SET', 'nine resolved policy categories are required exactly');
for (const [category, [owner, schema, id, file]] of Object.entries(expectedPolicies)) {
  const ref = definition.resolved_policy_refs[category];
  const value = values[file];
  const actualId = value.set_id ?? value.policy_id;
  requireCondition(ref?.owner === owner && ref?.schema === schema && ref?.id === id && ref?.revision === 1 && ref?.digest === sha256(file), 'TRACE_0D_POLICY_REF', `definition policy ref is invalid: ${category}`);
  requireCondition(value.schema === schema && value.owner === owner && actualId === id && value.revision === 1 && value.publication_status === 'unpublished', 'TRACE_0D_POLICY_IDENTITY', `policy identity is invalid: ${category}`);
  forbiddenPolicies(value, category);
  const [path, digest, registryId] = expectedOwnerRegistries[category];
  const schemaRef = value.owner_schema_ref;
  requireCondition(schemaRef?.path === path && schemaRef?.digest === digest && schemaRef?.registry_id === registryId && schemaRef?.schema_id === schema && schemaRef?.schema_version === 1, 'TRACE_0D_OWNER_SCHEMA_REF', `owner schema ref is invalid: ${category}`);
  requireCondition(sha256Path(resolve(root, path)) === digest, 'TRACE_0D_OWNER_SCHEMA_DIGEST', `owner schema digest mismatch: ${category}`);
  const registry = readJsonPath(resolve(root, path));
  requireCondition(registry.schema === 'rus.declarative_content_contract_registry.v1' && registry.registry_id === registryId && registry.revision === 1 && registry.owner === owner && registry.status === 'approved' && registry.scenario_specific_ids_or_counts === 'forbidden', 'TRACE_0D_OWNER_SCHEMA_REGISTRY', `owner schema registry invalid: ${category}`);
  const contract = registry.contracts?.find((entry) => entry.schema_id === schema && entry.schema_version === 1);
  requireCondition(contract && contract.required_top_level_fields.every((field) => Object.hasOwn(value, field)) && contract.forbidden_capabilities.length > 0 && contract.required_invariants.length > 0, 'TRACE_0D_OWNER_SCHEMA_CONTRACT', `owner schema contract incomplete or not satisfied: ${category}`);
  requireCondition(!JSON.stringify(registry).includes('trace_ld_v1') && !JSON.stringify(registry).includes('lower_dvina_trace'), 'TRACE_0D_GENERIC_SCHEMA_POLLUTION', `owner schema contains scenario-specific IDs: ${category}`);
}

const expectedCoOwnerContracts = Object.freeze({
  checks_rng: {
    path: 'packages/checks-rng/src/declarative-content-contracts.v1.json',
    digest: '4e7741bcea90d6264a643b8c55dbdb9b28d1975c1736c094e6096701ea2481ca',
    registryId: 'rus.checks_rng.declarative_content_contracts.v1',
    owner: '@rus/checks-rng',
    packageVersion: '0.13.0',
    schemaId: 'rus.checks_rng.execute_check.v1',
    entrypoints: ['@rus/checks-rng:executeCheck']
  },
  exact_time: {
    path: 'packages/time-events-history/src/declarative-content-contracts.v1.json',
    digest: 'cdc4571c07e2c592cbfb469a7028c31791d82deadbc9b37a97f44ee58597a471',
    registryId: 'rus.time_events_history.declarative_content_contracts.v1',
    owner: '@rus/time-events-history',
    packageVersion: '0.13.0',
    schemaId: 'rus.time_events_history.game_timestamp_and_elapsed.v1',
    entrypoints: [
      '@rus/time-events-history:normalizeGameTimestamp',
      '@rus/time-events-history:addElapsedTime',
      '@rus/time-events-history:compareGameTimestamp',
      '@rus/time-events-history:computeTemporalDigest'
    ]
  },
  property_transition_profile: {
    path: 'packages/items-property/src/declarative-content-contracts.v1.json',
    digest: '1b0d5c07b271eec3e5f3ab884a0f76c86c408cd3ae9b399d00a1f8a429e49e25',
    registryId: 'rus.items_property.declarative_content_contracts.v1',
    owner: '@rus/items-property',
    packageVersion: '0.13.0',
    schemaId: 'rus.items_property.approved_transition_profile.v1',
    referenceKind: 'declarative_support',
    deferredExecutionField: 'runtime_transition_execution',
    entrypoints: [
      '@rus/items-property:validateInventoryTopology',
      '@rus/items-property:resolveInventoryAccess',
      '@rus/items-property:validatePropertyRelation',
      '@rus/items-property:planInventoryTransfer'
    ]
  },
  atomic_conflict_resolution: {
    path: 'packages/combat-health/src/declarative-content-contracts.v1.json',
    digest: '4511f5c0df0564e20dece80adea48b0e88b62572d492775ad01e0301394b2bed',
    registryId: 'rus.combat_health.declarative_content_contracts.v1',
    owner: '@rus/combat-health',
    packageVersion: '0.13.0',
    schemaId: 'rus.combat_health.atomic_conflict_resolution_profile.v1',
    referenceKind: 'declarative_support',
    deferredExecutionField: 'runtime_resolution_execution',
    entrypoints: [
      '@rus/combat-health:buildAttackRequest',
      '@rus/combat-health:buildHarmPackage',
      '@rus/combat-health:applyHarmPackage',
      '@rus/combat-health:validateCombatState'
    ]
  },
  scene_observation_projection: {
    path: 'packages/visibility-knowledge-memory/src/declarative-content-contracts.v1.json',
    digest: '5c0a3ce0953867ce2f913a6b5149d108ca85708fef38396be3ebb59357ed2a96',
    registryId: 'rus.visibility_knowledge_memory.declarative_content_contracts.v1',
    owner: '@rus/visibility-knowledge-memory',
    packageVersion: '0.13.0',
    schemaId: 'rus.visibility_knowledge_memory.committed_scene_observation.v1',
    referenceKind: 'declarative_support',
    deferredExecutionField: 'runtime_observation_execution',
    entrypoints: [
      '@rus/visibility-knowledge-memory:validateVisibleContext',
      '@rus/visibility-knowledge-memory:mergeKnowledgeFacts',
      '@rus/visibility-knowledge-memory:validateMemoryFact',
      '@rus/visibility-knowledge-memory:mergeValidatedKnowledgeMemory'
    ]
  },
  visible_only_narration: {
    path: 'packages/narration/src/declarative-content-contracts.v1.json',
    digest: '0c24c3ccf8d3b6b2e0838e825f73c9050c886204e6e0c5a5215937b0cc18f64f',
    registryId: 'rus.narration.declarative_content_contracts.v1',
    owner: '@rus/narration',
    packageVersion: '0.15.0',
    schemaId: 'rus.narration.visible_only_flow.v1',
    entrypoints: ['@rus/narration:runNarrationFlow']
  }
});
const validateCoOwnerContracts = (value, requiredKeys, label) => {
  requireCondition(exactSet(Object.keys(value.co_owner_contract_refs ?? {}), requiredKeys), 'TRACE_0D_CO_OWNER_REF_SET', `${label} co-owner ref set is incomplete or unknown`);
  for (const key of requiredKeys) {
    const expected = expectedCoOwnerContracts[key];
    const ref = value.co_owner_contract_refs[key];
    requireCondition(
      ref?.path === expected.path
        && ref?.digest === expected.digest
        && ref?.registry_id === expected.registryId
        && ref?.registry_revision === 1
        && ref?.schema_id === expected.schemaId
        && ref?.schema_version === 1
        && exactSet(
          expected.referenceKind === 'declarative_support'
            ? ref?.existing_support_entrypoints
            : ref?.public_entrypoints,
          expected.entrypoints
        )
        && (expected.referenceKind !== 'declarative_support'
          || (
            ref?.[expected.deferredExecutionField] === 'deferred_to_first_use_integration'
              && !Object.hasOwn(ref, 'public_entrypoints')
              && !Object.hasOwn(ref, 'runtime_entrypoint')
              && !JSON.stringify(ref).includes('createSpatialV3DomainMutationService')
          )),
      'TRACE_0D_CO_OWNER_REF',
      `${label} co-owner ref is invalid: ${key}`
    );
    requireCondition(sha256Path(resolve(root, expected.path)) === expected.digest, 'TRACE_0D_CO_OWNER_DIGEST', `${label} co-owner digest mismatch: ${key}`);
    const registry = readJsonPath(resolve(root, expected.path));
    requireCondition(
      registry.schema === 'rus.declarative_content_contract_registry.v1'
        && registry.registry_id === expected.registryId
        && registry.revision === 1
        && registry.owner === expected.owner
        && registry.package_version === expected.packageVersion
        && registry.status === 'approved'
        && registry.scenario_specific_ids_or_counts === 'forbidden',
      'TRACE_0D_CO_OWNER_REGISTRY',
      `${label} co-owner registry is incompatible: ${key}`
    );
    const contract = registry.contracts?.find((entry) => entry.schema_id === expected.schemaId && entry.schema_version === 1);
    requireCondition(
      contract
        && exactSet(
          expected.referenceKind === 'declarative_support'
            ? contract.existing_support_entrypoints
            : contract.public_entrypoints,
          expected.entrypoints
        )
        && (expected.referenceKind !== 'declarative_support'
          || contract[expected.deferredExecutionField] === 'deferred_to_first_use_integration')
        && (expected.referenceKind === 'declarative_support'
          ? contract.future_runtime_integration_inputs?.length > 0
            && contract.future_runtime_integration_outputs?.length > 0
          : contract.required_inputs?.length > 0
            && contract.required_outputs?.length > 0)
        && contract.required_invariants?.length > 0
        && contract.forbidden_capabilities?.length > 0,
      'TRACE_0D_CO_OWNER_CONTRACT',
      `${label} co-owner contract is incomplete: ${key}`
    );
    if (expected.referenceKind === 'declarative_support') {
      for (const entrypoint of expected.entrypoints) {
        const exportName = entrypoint.slice(entrypoint.lastIndexOf(':') + 1);
        const ownerModule = key === 'atomic_conflict_resolution'
          ? combatHealth
          : key === 'scene_observation_projection'
            ? visibilityKnowledgeMemory
            : itemsProperty;
        requireCondition(
          typeof ownerModule[exportName] === 'function',
          'TRACE_0D_CO_OWNER_ENTRYPOINT',
          `${label} references missing declarative support entrypoint: ${exportName}`
        );
      }
      requireCondition(
        !JSON.stringify(contract).includes('createSpatialV3DomainMutationService')
          && contract.forbidden_capabilities.includes('runtime_handler')
          && contract.forbidden_capabilities.includes('persistence'),
        'TRACE_0D_PROPERTY_RUNTIME_CLAIM',
        `${label} property schema falsely claims runtime or persistence execution`
      );
    }
    requireCondition(!JSON.stringify(registry).includes('trace_ld_v1') && !JSON.stringify(registry).includes('lower_dvina_trace'), 'TRACE_0D_GENERIC_SCHEMA_POLLUTION', `${label} co-owner registry contains scenario-specific IDs: ${key}`);
  }
  for (const entry of value.owner_contracts ?? []) {
    requireCondition(!/^@rus\/(?:checks-rng|time-events-history|items-property|combat-health|visibility-knowledge-memory|narration):/u.test(entry), 'TRACE_0D_CO_OWNER_STRING_REF', `${label} retains an unpinned co-owner string`);
  }
};
validateCoOwnerContracts(activities, ['checks_rng', 'exact_time', 'property_transition_profile', 'atomic_conflict_resolution', 'scene_observation_projection'], 'activity/check/consequence');
validateCoOwnerContracts(npc, ['exact_time', 'property_transition_profile'], 'NPC decision/schedule');
validateCoOwnerContracts(movement, ['exact_time'], 'movement');
validateCoOwnerContracts(body, ['exact_time'], 'body/environment');
validateCoOwnerContracts(epilogue, ['visible_only_narration'], 'epilogue');

const participantSource = readJsonPath(resolve(root, expectedDependencies.phase_0b_participant_profile_set[2]));
const topologySource = readJsonPath(resolve(root, expectedDependencies.phase_0b_location_topology_set[2]));
const itemSource = readJsonPath(resolve(root, expectedDependencies.phase_0c_item_container_set[2]));
const evidenceSource = readJsonPath(resolve(root, expectedDependencies.phase_0c_clue_evidence_graph_set[2]));
const knowledgeSource = readJsonPath(resolve(root, expectedDependencies.phase_0c_knowledge_lie_memory_rules[2]));
const participants = new Set(['player_clerk', 'onisim_boatman', 'eremey_fisher', 'ratsha_storehouse_helper', 'zhdanko_storehouse_controller', 'background_fisher_1', 'background_fisher_2', 'trace_ld_v1_audience_slot_participating_fisher']);
requireCondition(JSON.stringify(participantSource).includes('trace_ld_v1_audience_slot_participating_fisher') === false, 'TRACE_0D_PARTICIPANT_SOURCE', '0B unexpectedly materializes the future audience slot');
const topologyText = JSON.stringify(topologySource);
const locationIds = new Set(['trace_ld_v1_loc_wreck_shore', 'trace_ld_v1_loc_fishing_camp', 'trace_ld_v1_loc_old_drying_shed', 'trace_ld_v1_loc_zhdanko_storehouse']);
const endpointIds = new Set(['trace_ld_v1_ep_wreck_path_to_camp', 'trace_ld_v1_ep_camp_path_to_wreck', 'trace_ld_v1_ep_camp_ridge_to_drying_shed', 'trace_ld_v1_ep_drying_shed_ridge_to_camp', 'trace_ld_v1_ep_camp_work_path_to_storehouse', 'trace_ld_v1_ep_storehouse_work_path_to_camp']);
for (const id of [...locationIds, ...endpointIds]) requireCondition(topologyText.includes(id), 'TRACE_0D_TOPOLOGY_REF', `topology ref is absent: ${id}`);
const itemText = JSON.stringify(itemSource);
const approvedExternalPropertyOwnerRefs = new Set(
  (itemSource.external_property_principals ?? [])
    .filter(({ allowed_relation }) => allowed_relation === 'owner_only')
    .map(({ principal_ref }) => principal_ref)
);
const knowledgeText = JSON.stringify(knowledgeSource);
const evidenceIds = new Set((evidenceSource.evidence_records ?? []).map(({ evidence_id }) => evidence_id));

requireCondition(activities.clock_owner === '@rus/time-events-history' && npc.clock_owner === '@rus/time-events-history' && movement.clock_owner === '@rus/time-events-history' && body.clock_owner === '@rus/time-events-history' && activities.rng_owner === '@rus/checks-rng', 'TRACE_0D_TIME_RNG_OWNER', 'clock/RNG owner is invalid');
requireCondition(
  Object.keys(activities).filter((key) => /clock_owner/u.test(key)).length === 1,
  'TRACE_0D_CLOCK_OWNER',
  'activity package must declare exactly one clock owner'
);
requireCondition(exactSet(activities.llm_authority?.allowed, ['select_exact_semantic_option_id_from_closed_set']), 'TRACE_0D_LLM_BOUNDARY', 'LLM authority is not a closed semantic option selection');
requireCondition(exactSet(activities.llm_authority?.forbidden, ['roll', 'dc', 'modifier', 'elapsed', 'consequence', 'write_target', 'factual_outcome']), 'TRACE_0D_LLM_BOUNDARY', 'LLM forbidden authority is incomplete');
const activityMap = mapUnique(activities.activity_profiles, 'profile_id', 'TRACE_0D_ACTIVITY');
const timeProfileMap = mapUnique(activities.time_profiles, 'time_profile_id', 'TRACE_0D_TIME_PROFILE');
requireCondition(
  exactSet(
    [...timeProfileMap.keys()],
    ['trace_ld_v1_time_1m', 'trace_ld_v1_time_2m', 'trace_ld_v1_time_3m', 'trace_ld_v1_time_5m', 'trace_ld_v1_time_8m', 'trace_ld_v1_time_10m', 'trace_ld_v1_time_12m', 'trace_ld_v1_time_15m', 'trace_ld_v1_time_20m', 'trace_ld_v1_time_25m', 'trace_ld_v1_time_30m']
  ),
  'TRACE_0D_TIME_PROFILE',
  'exact elapsed profile set is incomplete or unknown'
);
for (const profile of timeProfileMap.values()) {
  requireCondition(
    profile.schema === 'rus.trace_exact_elapsed_profile.v1'
      && profile.version === 1
      && profile.clock_owner === '@rus/time-events-history'
      && Number.isInteger(profile.duration_minutes)
      && profile.duration_minutes > 0
      && profile.exact_elapsed?.schema === 'rational_minutes'
      && profile.exact_elapsed?.numerator === profile.duration_minutes
      && profile.exact_elapsed?.denominator === 1
      && profile.boundary_policy === 'advance_exact_interval_with_earliest_boundary_split',
    'TRACE_0D_TIME_PROFILE',
    `${profile.time_profile_id} is invalid`
  );
}
const requiredActivities = [
  'trace_ld_v1_activity_detailed_wreck_inspection',
  'trace_ld_v1_activity_pack_evidence',
  'trace_ld_v1_activity_route_to_camp',
  'trace_ld_v1_activity_first_eremey_talk',
  'trace_ld_v1_activity_eremey_with_evidence',
  'trace_ld_v1_activity_route_to_drying_shed',
  'trace_ld_v1_activity_ratsha_negotiation',
  'trace_ld_v1_activity_first_aid_onisim',
  'trace_ld_v1_activity_make_stretcher_and_carry',
  'trace_ld_v1_activity_fire_rest',
  'trace_ld_v1_activity_route_to_storehouse',
  'trace_ld_v1_activity_accuse_zhdanko',
  'trace_ld_v1_activity_danger_resolution',
  'trace_ld_v1_activity_check_bag_and_seal',
  'trace_ld_v1_activity_return_to_camp',
  'trace_ld_v1_activity_temporary_decision',
  'trace_ld_v1_activity_zhdanko_wait',
  'trace_ld_v1_activity_zhdanko_check_ratsha_return',
  'trace_ld_v1_activity_zhdanko_move_bag',
  'trace_ld_v1_activity_zhdanko_prepare_boat',
  'trace_ld_v1_activity_zhdanko_attempt_departure',
  'trace_ld_v1_activity_zhdanko_hide_property',
  'trace_ld_v1_activity_zhdanko_attempt_document_destruction',
  'trace_ld_v1_activity_zhdanko_respond_to_arriving_group',
  'trace_ld_v1_activity_ratsha_attack_and_escape_attempt',
  'trace_ld_v1_activity_zhdanko_resist_with_axe'
];
requireCondition(exactSet([...activityMap.keys()], requiredActivities), 'TRACE_0D_ACTIVITY_COVERAGE', 'technical trace activity coverage is incomplete or unknown');
const expectedActivityOptions = Object.freeze({
  trace_ld_v1_activity_detailed_wreck_inspection: ['inspect_wreck_in_detail'],
  trace_ld_v1_activity_pack_evidence: ['pack_discovered_evidence'],
  trace_ld_v1_activity_route_to_camp: ['follow_path_to_fishing_camp'],
  trace_ld_v1_activity_first_eremey_talk: ['ask_eremey_about_wreck'],
  trace_ld_v1_activity_eremey_with_evidence: ['show_clue_and_seek_eremey_cooperation'],
  trace_ld_v1_activity_route_to_drying_shed: ['follow_known_route_to_drying_shed'],
  trace_ld_v1_activity_ratsha_negotiation: ['offer_conditional_protection_and_seek_surrender'],
  trace_ld_v1_activity_first_aid_onisim: ['attempt_risky_first_aid_onisim'],
  trace_ld_v1_activity_make_stretcher_and_carry: ['make_stretcher_and_carry_onisim_to_camp'],
  trace_ld_v1_activity_fire_rest: ['rest_by_fire_and_dry_clothing'],
  trace_ld_v1_activity_route_to_storehouse: ['follow_known_route_to_zhdanko_storehouse'],
  trace_ld_v1_activity_accuse_zhdanko: ['present_committed_case_to_zhdanko'],
  trace_ld_v1_activity_danger_resolution: ['retreat_from_threat', 'coordinate_bounded_group_response'],
  trace_ld_v1_activity_check_bag_and_seal: ['recover_bag_and_verify_known_seal'],
  trace_ld_v1_activity_return_to_camp: ['return_to_camp_with_group'],
  trace_ld_v1_activity_temporary_decision: [
    'hold_ratsha_and_zhdanko_for_authorized_handover',
    'hold_ratsha_zhdanko_absent',
    'hold_zhdanko_ratsha_absent',
    'hold_zhdanko_ratsha_present_not_held',
    'preserve_open_case_without_custody'
  ],
  trace_ld_v1_activity_zhdanko_wait: ['wait'],
  trace_ld_v1_activity_zhdanko_check_ratsha_return: ['check_ratsha_return'],
  trace_ld_v1_activity_zhdanko_move_bag: ['move_bag'],
  trace_ld_v1_activity_zhdanko_prepare_boat: ['prepare_boat'],
  trace_ld_v1_activity_zhdanko_attempt_departure: ['attempt_departure', 'flee_without_weapon'],
  trace_ld_v1_activity_zhdanko_hide_property: ['hide_property'],
  trace_ld_v1_activity_zhdanko_attempt_document_destruction: ['attempt_document_destruction'],
  trace_ld_v1_activity_zhdanko_respond_to_arriving_group: ['respond_to_arriving_group'],
  trace_ld_v1_activity_ratsha_attack_and_escape_attempt: ['attack_and_escape'],
  trace_ld_v1_activity_zhdanko_resist_with_axe: ['resist_with_axe']
});
const checkMap = mapUnique(activities.check_profiles, 'check_id', 'TRACE_0D_CHECK');
const consequenceMap = mapUnique(activities.consequence_profiles, 'consequence_id', 'TRACE_0D_CONSEQUENCE');
const controlledResourceRefs = new Set([
  'discovered_evidence_only',
  'committed_discovered_evidence',
  'lit_fire',
  'drying_place',
  'committed_evidence_resolution',
  'sufficient_light',
  'committed_case_facts',
  'held_items_only',
  'held_or_carried_items',
  'physical_item_access_is_distinct_from_holder_and_controller',
  'stretcher_entry_requires_capacity_zone',
  'recovered_items_remain_with_committed_holder_controller',
  'trace_ld_v1_promise_no_summary_killing'
]);
requireCondition(exactSet([...checkMap.keys()], ['trace_ld_v1_check_detailed_wreck_inspection', 'trace_ld_v1_check_eremey_cooperation', 'trace_ld_v1_check_ratsha_surrender_attempt', 'trace_ld_v1_check_risky_first_aid']), 'TRACE_0D_CHECK_SET', 'required uncertain check set is invalid');
let resolvedSemanticExecutionBranchCount = 0;
for (const activity of activityMap.values()) {
  requireCondition(activity.schema === 'rus.trace_activity_profile.v1' && activity.version === 1, 'TRACE_0D_ACTIVITY_SCHEMA', `${activity.profile_id} schema/version invalid`);
  requireCondition(exactSet(activity.semantic_option_ids, expectedActivityOptions[activity.profile_id]), 'TRACE_0D_ACTIVITY_OPTIONS', `${activity.profile_id} option set empty, duplicated, or unknown`);
  if (activity.semantic_execution_branches) {
    const executionBranches = mapUnique(
      activity.semantic_execution_branches,
      'branch_id',
      'TRACE_0D_ACTIVITY_EXECUTION_BRANCH'
    );
    requireCondition(
      executionBranches.size === activity.semantic_option_ids.length
        && activity.semantic_option_ids.every((optionId) => (
          [...executionBranches.values()].filter(({ semantic_option_id }) => semantic_option_id === optionId).length === 1
        ))
        && [...executionBranches.values()].every(({ semantic_option_id }) => activity.semantic_option_ids.includes(semantic_option_id)),
      'TRACE_0D_ACTIVITY_EXECUTION_BRANCH',
      `${activity.profile_id} must resolve every semantic option through exactly one execution branch`
    );
    resolvedSemanticExecutionBranchCount += executionBranches.size;
  } else if (activity.semantic_option_ids.length > 1) {
    const externalOptionIds = activity.profile_id === 'trace_ld_v1_activity_temporary_decision'
      ? activities.temporary_disposition_contracts?.[0]?.custody_options?.map(({ option_id }) => option_id) ?? []
      : [
          ...(npc.schedule_execution_bindings ?? [])
            .filter(({ activity_profile_ref }) => activity_profile_ref === activity.profile_id)
            .map(({ schedule_option_id }) => schedule_option_id),
          ...(npc.decision_execution_bindings ?? [])
            .filter(({ activity_profile_refs }) => activity_profile_refs?.includes(activity.profile_id))
            .map(({ option_id }) => option_id)
        ].filter((optionId) => activity.semantic_option_ids.includes(optionId));
    requireCondition(
      externalOptionIds.length === activity.semantic_option_ids.length
        && activity.semantic_option_ids.every((optionId) => externalOptionIds.filter((value) => value === optionId).length === 1),
      'TRACE_0D_ACTIVITY_EXECUTION_BRANCH',
      `${activity.profile_id} must resolve every semantic option through exactly one execution branch`
    );
    resolvedSemanticExecutionBranchCount += externalOptionIds.length;
  } else {
    resolvedSemanticExecutionBranchCount += 1;
  }
  if (activity.execution_variant_contract) {
    requireCondition(
      activity.profile_id === 'trace_ld_v1_activity_check_bag_and_seal'
        && !Object.hasOwn(activity, 'duration_minutes')
        && !Object.hasOwn(activity, 'time_profile_ref')
        && Array.isArray(activity.execution_variant_contract.closed_variants)
        && activity.execution_variant_contract.closed_variants.length > 0,
      'TRACE_0D_ACTIVITY_TIME',
      `${activity.profile_id} has an unapproved variable elapsed contract`
    );
    for (const variant of activity.execution_variant_contract.closed_variants) {
      const variantTimeProfile = timeProfileMap.get(variant.time_profile_ref);
      requireCondition(
        Number.isInteger(variant.duration_minutes)
          && variant.duration_minutes > 0
          && variantTimeProfile?.duration_minutes === variant.duration_minutes
          && Array.isArray(variant.ordered_transition_stages)
          && variant.ordered_transition_stages.reduce((sum, stage) => sum + stage.duration_minutes, 0) === variant.duration_minutes,
        'TRACE_0D_ACTIVITY_TIME',
        `${activity.profile_id}.${variant.variant_id} lacks matching positive elapsed/time stages`
      );
    }
  } else if (activity.semantic_execution_branches) {
    requireCondition(
      !Object.hasOwn(activity, 'duration_minutes') && !Object.hasOwn(activity, 'time_profile_ref'),
      'TRACE_0D_ACTIVITY_TIME',
      `${activity.profile_id} must delegate elapsed to its selected execution branch`
    );
    for (const branch of activity.semantic_execution_branches) {
      const branchTime = branch.time_contract;
      const timeProfile = timeProfileMap.get(branchTime?.root_time_profile_ref);
      requireCondition(
        Number.isInteger(branchTime?.duration_minutes)
          && branchTime.duration_minutes > 0
          && timeProfile?.duration_minutes === branchTime.duration_minutes,
        'TRACE_0D_ACTIVITY_TIME',
        `${activity.profile_id}.${branch.branch_id} lacks matching positive elapsed/time profile`
      );
    }
  } else {
    const timeProfile = timeProfileMap.get(activity.time_profile_ref);
    requireCondition(Number.isInteger(activity.duration_minutes) && activity.duration_minutes > 0 && timeProfile?.duration_minutes === activity.duration_minutes, 'TRACE_0D_ACTIVITY_TIME', `${activity.profile_id} lacks matching positive elapsed/time profile`);
  }
  for (const slot of [...(activity.participant_slots?.required ?? []), ...(activity.participant_slots?.optional ?? [])]) requireCondition(participants.has(slot), 'TRACE_0D_ACTIVITY_SLOT', `${activity.profile_id} has unknown participant ${slot}`);
  requireCondition(locationIds.has(activity.preconditions?.location_ref), 'TRACE_0D_ACTIVITY_LOCATION', `${activity.profile_id} has unknown location`);
  requireCondition(text(activity.preconditions?.access_policy_ref), 'TRACE_0D_ACTIVITY_ACCESS', `${activity.profile_id} lacks access policy`);
  requireCondition(text(activity.interruptibility) && text(activity.progress_policy) && text(activity.nearest_temporal_boundary_rule) && text(activity.completion_boundary), 'TRACE_0D_ACTIVITY_BOUNDARY', `${activity.profile_id} boundary contract incomplete`);
  requireCondition(unique(activity.write_target_classes) && unique(activity.forbidden_write_targets), 'TRACE_0D_ACTIVITY_WRITES', `${activity.profile_id} write contract invalid`);
  requireCondition(Boolean(activity.check_ref) !== Boolean(activity.no_check_required), 'TRACE_0D_ACTIVITY_CHECK', `${activity.profile_id} must have exactly check_ref or no_check_required`);
  if (activity.check_ref) requireCondition(checkMap.has(activity.check_ref), 'TRACE_0D_ACTIVITY_CHECK', `${activity.profile_id} has unknown check`);
  for (const ref of activity.consequence_refs) requireCondition(consequenceMap.has(ref), 'TRACE_0D_ACTIVITY_CONSEQUENCE', `${activity.profile_id} has unknown consequence`);
  for (const ref of [...activity.resource_refs, ...activity.preconditions.item_refs]) requireCondition(itemText.includes(ref) || controlledResourceRefs.has(ref), 'TRACE_0D_ACTIVITY_RESOURCE', `${activity.profile_id} has unresolved resource ${ref}`);
}
requireCondition(
  definition.readiness?.phase_status !== 'phase_0_complete'
    || resolvedSemanticExecutionBranchCount === [...activityMap.values()]
      .reduce((count, activity) => count + activity.semantic_option_ids.length, 0),
  'TRACE_0D_PHASE_EXECUTION_COMPLETENESS',
  'phase_0_complete requires exactly one resolved execution branch for every semantic option'
);
requireCondition(activityMap.get('trace_ld_v1_activity_check_bag_and_seal').no_check_required === true, 'TRACE_0D_DETERMINISTIC_CHECK', 'familiar seal inspection must not receive arbitrary d20');
const dangerActivity = activityMap.get('trace_ld_v1_activity_danger_resolution');
requireCondition(dangerActivity.no_check_required === true && dangerActivity.activity_type === 'composite_npc_resolution', 'TRACE_0D_DANGER_RESOLUTION', 'danger resolution must be composite, not one player roll');
const dangerBranchMap = mapUnique(
  dangerActivity.semantic_execution_branches,
  'semantic_option_id',
  'TRACE_0D_ACTIVITY_EXECUTION_BRANCH'
);
const dangerGroupBranch = dangerBranchMap.get('coordinate_bounded_group_response');
const dangerRetreatBranch = dangerBranchMap.get('retreat_from_threat');
const dangerExecution = dangerGroupBranch?.outcome_contract;
const atomicResolutionMap = mapUnique(activities.atomic_resolution_profiles, 'profile_id', 'TRACE_0D_ATOMIC_RESOLUTION');
const dangerAtomicResolution = atomicResolutionMap.get('trace_ld_v1_atomic_group_danger_resolution');
const ratshaAttackAtomicResolution = atomicResolutionMap.get('trace_ld_v1_atomic_ratsha_attack_resolution');
const dangerAtomicStages = mapUnique(dangerAtomicResolution?.ordered_atomic_stages, 'stage_id', 'TRACE_0D_ATOMIC_RESOLUTION');
const dangerThreatConsequence = consequenceMap.get('trace_ld_v1_consequence_zhdanko_resistance_threat_committed');
const dangerRetreatOptionConsequence = consequenceMap.get('trace_ld_v1_consequence_danger_retreat_option_committed');
const dangerGroupOptionConsequence = consequenceMap.get('trace_ld_v1_consequence_danger_group_response_option_committed');
const dangerRetreatConsequence = consequenceMap.get('trace_ld_v1_consequence_player_retreated_from_zhdanko_threat_to_yard');
const dangerAccessPolicy = access.access_policies.find(({ policy_id }) => policy_id === 'trace_ld_v1_access_zhdanko_storehouse');
const dangerCapacityContract = capacity.capacity_contracts.find(({ contract_id }) => contract_id === 'trace_ld_v1_capacity_zhdanko_storehouse');
const dangerCapacityZones = new Set((dangerCapacityContract?.zones ?? []).map(({ zone_id }) => zone_id));
requireCondition(
  dangerGroupBranch?.execution_kind === 'atomic_conflict_resolution'
    && exactSet(dangerGroupBranch?.required_committed_facts, ['zhdanko_resistance_threat_committed', 'danger_group_response_option_committed'])
    && dangerGroupBranch?.option_commit_consequence_ref === dangerGroupOptionConsequence?.consequence_id
    && dangerGroupBranch?.atomic_resolution_profile_ref === dangerAtomicResolution?.profile_id
    && dangerExecution?.selection_owner === '@rus/combat-health'
    && dangerExecution?.selection_owner_contract_ref === 'atomic_conflict_resolution'
    && dangerExecution?.unbound_outcome_effects === 'forbidden'
    && exactSet(dangerExecution?.success?.requires_committed_atomic_effects, ['axe_control_removed_from_zhdanko', 'temporary_restraint_applied'])
    && dangerExecution?.success?.consequence_ref === 'trace_ld_v1_consequence_bounded_group_disarm_committed'
    && exactSet(dangerExecution?.success?.property_transition_refs, ['trace_ld_v1_property_zhdanko_axe_disarmed_to_eremey'])
    && dangerExecution?.success?.body_effect_ref === 'trace_ld_v1_body_danger_2m'
    && exactSet(dangerExecution?.incomplete?.requires_absence_of_committed_atomic_effects, ['temporary_restraint_applied'])
    && dangerExecution?.incomplete?.consequence_ref === 'trace_ld_v1_consequence_bounded_group_response_incomplete'
    && exactSet(dangerExecution?.incomplete?.property_transition_refs, [])
    && dangerExecution?.incomplete?.body_effect_ref === 'trace_ld_v1_body_danger_2m'
    && dangerGroupBranch?.time_contract?.root_execution_ref === dangerGroupBranch.branch_id
    && dangerGroupBranch?.time_contract?.root_time_profile_ref === 'trace_ld_v1_time_2m'
    && dangerGroupBranch?.time_contract?.duration_minutes === 2
    && dangerGroupBranch?.time_contract?.clock_owner === '@rus/time-events-history'
    && dangerGroupBranch?.time_contract?.clock_write === 'single_if_branch_admitted_and_completed'
    && dangerGroupBranch?.time_contract?.clock_write_target === 'elapsed_game_time'
    && dangerGroupBranch?.time_contract?.child_clock_write === 'forbidden'
    && dangerGroupBranch?.time_contract?.duplicate_clock_write_failure === 'typed_duplicate_elapsed_commit',
  'TRACE_0D_DANGER_EXECUTION',
  'danger resolution lacks exact disarm/restraint and incomplete outcome bindings'
);
requireCondition(
  exactSet(dangerThreatConsequence?.committed_fact_outputs, ['zhdanko_resistance_threat_committed'])
    && dangerRetreatOptionConsequence?.required_activity_profile_ref === dangerActivity.profile_id
    && dangerRetreatOptionConsequence?.required_semantic_option_id === 'retreat_from_threat'
    && exactSet(dangerRetreatOptionConsequence?.committed_fact_outputs, ['danger_retreat_option_committed'])
    && dangerGroupOptionConsequence?.required_activity_profile_ref === dangerActivity.profile_id
    && dangerGroupOptionConsequence?.required_semantic_option_id === 'coordinate_bounded_group_response'
    && exactSet(dangerGroupOptionConsequence?.committed_fact_outputs, ['danger_group_response_option_committed']),
  'TRACE_0D_DANGER_OPTION_PRODUCER',
  'danger threat or exact player option lacks one committed producer'
);
const dangerRetreatPosition = dangerRetreatBranch?.position_transition;
requireCondition(
  dangerRetreatBranch?.execution_kind === 'committed_local_zone_retreat'
    && !Object.hasOwn(dangerRetreatBranch ?? {}, 'atomic_resolution_profile_ref')
    && exactSet(dangerRetreatBranch?.required_committed_facts, ['zhdanko_resistance_threat_committed', 'danger_retreat_option_committed'])
    && dangerRetreatBranch?.option_commit_consequence_ref === dangerRetreatOptionConsequence?.consequence_id
    && dangerRetreatBranch?.required_actor_position?.actor_slot === 'player_clerk'
    && dangerRetreatBranch?.required_actor_position?.location_ref === 'trace_ld_v1_loc_zhdanko_storehouse'
    && dangerRetreatBranch?.required_actor_position?.zone_ref === 'narrow_threshold',
  'TRACE_0D_DANGER_RETREAT_EXECUTION',
  'retreat must be a separate branch from group atomic resolution with exact committed inputs'
);
requireCondition(
  dangerRetreatPosition?.actor_slot === 'player_clerk'
    && dangerRetreatPosition?.location_ref === 'trace_ld_v1_loc_zhdanko_storehouse'
    && dangerRetreatPosition?.source_zone_ref === 'narrow_threshold'
    && dangerRetreatPosition?.destination_zone_ref === 'yard'
    && dangerRetreatPosition.source_zone_ref !== dangerRetreatPosition.destination_zone_ref
    && dangerCapacityZones.has(dangerRetreatPosition.source_zone_ref)
    && dangerCapacityZones.has(dangerRetreatPosition.destination_zone_ref),
  'TRACE_0D_DANGER_RETREAT_POSITION',
  'retreat lacks one exact admitted source-to-safe-zone position transition'
);
requireCondition(
  dangerRetreatPosition?.access_policy_ref === dangerAccessPolicy?.policy_id
    && dangerAccessPolicy?.location_ref === dangerRetreatPosition.location_ref
    && dangerAccessPolicy?.threat_conditions?.includes('player_retreat_remains_available')
    && dangerRetreatPosition?.capacity_contract_ref === dangerCapacityContract?.contract_id
    && dangerCapacityContract?.location_ref === dangerRetreatPosition.location_ref
    && dangerCapacityContract?.decision_anchor === dangerRetreatPosition.destination_zone_ref
    && dangerRetreatPosition?.position_write_owner === '@rus/party-store'
    && dangerRetreatPosition?.position_write_owner_contract_ref === '@rus/party-store:logical_write_plan'
    && capacity.owner_contracts?.includes(dangerRetreatPosition.position_write_owner_contract_ref),
  'TRACE_0D_DANGER_RETREAT_ACCESS',
  'retreat position transition lacks exact access, capacity, or position-write owner refs'
);
requireCondition(
  dangerRetreatBranch?.time_contract?.root_execution_ref === dangerRetreatBranch.branch_id
    && dangerRetreatBranch?.time_contract?.root_time_profile_ref === 'trace_ld_v1_time_1m'
    && dangerRetreatBranch?.time_contract?.duration_minutes === 1
    && dangerRetreatBranch?.time_contract?.clock_owner === '@rus/time-events-history'
    && dangerRetreatBranch?.time_contract?.clock_write === 'single_if_branch_admitted_and_completed'
    && dangerRetreatBranch?.time_contract?.clock_write_target === 'elapsed_game_time'
    && dangerRetreatBranch?.time_contract?.child_clock_write === 'forbidden'
    && dangerRetreatBranch?.time_contract?.duplicate_clock_write_failure === 'typed_duplicate_elapsed_commit'
    && dangerRetreatPosition?.clock_write === 'forbidden'
    && dangerRetreatConsequence?.clock_write === 'forbidden',
  'TRACE_0D_DANGER_RETREAT_TIME',
  'retreat must have one root elapsed commit and no child or duplicate clock write'
);
requireCondition(
  dangerRetreatBranch?.consequence_ref === dangerRetreatConsequence?.consequence_id
    && exactSet(dangerRetreatConsequence?.committed_fact_outputs, ['player_retreated_from_zhdanko_threat_to_yard'])
    && dangerRetreatConsequence?.required_activity_profile_ref === dangerActivity.profile_id
    && dangerRetreatConsequence?.required_semantic_option_id === 'retreat_from_threat'
    && JSON.stringify(dangerRetreatConsequence?.required_position_transition) === JSON.stringify({
      actor_slot: 'player_clerk',
      location_ref: 'trace_ld_v1_loc_zhdanko_storehouse',
      source_zone_ref: 'narrow_threshold',
      destination_zone_ref: 'yard'
    }),
  'TRACE_0D_DANGER_RETREAT_CONSEQUENCE',
  'retreat lacks one exact committed position consequence'
);
requireCondition(
  exactSet(dangerRetreatBranch?.preserved_property_state, [
    'trace_ld_v1_item_zhdanko_axe:holder=zhdanko_storehouse_controller',
    'trace_ld_v1_item_zhdanko_axe:controller=zhdanko_storehouse_controller'
  ])
    && !Object.hasOwn(dangerRetreatBranch ?? {}, 'automatic_effect_classes')
    && !Object.hasOwn(dangerRetreatBranch ?? {}, 'body_effect_ref')
    && !Object.hasOwn(dangerRetreatBranch ?? {}, 'property_transition_refs')
    && exactSet(dangerRetreatBranch?.forbidden_effect_classes, [
      'body_harm',
      'item_disarm',
      'temporary_restraint',
      'item_control_transition',
      'completion_state',
      'world_stop'
    ])
    && dangerRetreatConsequence?.forbidden_write_targets?.includes('automatic_harm')
    && dangerRetreatConsequence?.forbidden_write_targets?.includes('automatic_disarm')
    && dangerRetreatConsequence?.forbidden_write_targets?.includes('automatic_restraint'),
  'TRACE_0D_DANGER_RETREAT_EFFECT',
  'retreat must preserve axe control and forbid automatic harm, disarm, restraint, completion, or world stop'
);
requireCondition(
  dangerRetreatBranch?.next_meaningful_boundary?.kind === 'npc_decision_recompute'
    && dangerRetreatBranch?.next_meaningful_boundary?.required_committed_fact === 'player_retreated_from_zhdanko_threat_to_yard'
    && dangerRetreatBranch?.next_meaningful_boundary?.decision_owner === '@rus/npc-runtime'
    && dangerRetreatBranch?.next_meaningful_boundary?.npc_policy_ref === 'trace_ld_v1_npc_zhdanko_decisions'
    && dangerRetreatBranch?.next_meaningful_boundary?.same_command_npc_execution === 'forbidden'
    && dangerRetreatBranch?.next_meaningful_boundary?.world_continues === true
    && npc.decision_policies.some(({ policy_id }) => policy_id === dangerRetreatBranch.next_meaningful_boundary.npc_policy_ref)
    && exactSet(dangerRetreatBranch?.typed_failures, [
      'typed_danger_retreat_stale_source_position',
      'typed_danger_retreat_destination_access_denied',
      'typed_danger_retreat_destination_capacity_exceeded',
      'typed_danger_retreat_incompatible_committed_state',
      'typed_duplicate_elapsed_commit'
    ]),
  'TRACE_0D_DANGER_RETREAT_BOUNDARY',
  'retreat lacks typed failures or the next committed NPC decision boundary'
);
requireCondition(
  atomicResolutionMap.size === 2
    && dangerAtomicResolution?.owner === '@rus/combat-health'
    && dangerAtomicResolution?.owner_contract_ref === 'atomic_conflict_resolution'
    && dangerAtomicResolution?.runtime_resolution_execution === 'deferred_to_first_use_integration'
    && dangerAtomicResolution?.required_committed_inputs?.required_player_option_fact === 'danger_group_response_option_committed'
    && dangerAtomicResolution?.required_committed_inputs?.required_threat_fact === 'zhdanko_resistance_threat_committed'
    && dangerAtomicResolution?.llm_outcome_selection === 'forbidden'
    && dangerAtomicResolution?.direct_clock_write === 'forbidden'
    && dangerAtomicResolution?.unbound_atomic_effect === 'forbidden'
    && exactSet([...dangerAtomicStages.keys()], [
      'optional_zhdanko_strike',
      'optional_ratsha_wound',
      'group_disarm_admission',
      'axe_control_transition',
      'temporary_restraint'
    ])
    && dangerAtomicResolution.ordered_atomic_stages.map(({ stage_id }) => stage_id).join('|')
      === 'optional_zhdanko_strike|optional_ratsha_wound|group_disarm_admission|axe_control_transition|temporary_restraint'
    && dangerAtomicStages.get('group_disarm_admission')?.producer_consequence_ref === 'trace_ld_v1_consequence_bounded_group_disarm_transition_admitted'
    && dangerAtomicStages.get('group_disarm_admission')?.committed_fact_output === 'bounded_group_disarm_transition_admitted'
    && dangerAtomicStages.get('axe_control_transition')?.producer_transition_ref === 'trace_ld_v1_property_zhdanko_axe_disarmed_to_eremey'
    && exactSet(dangerAtomicStages.get('axe_control_transition')?.requires_committed_facts, ['bounded_group_disarm_transition_admitted'])
    && dangerAtomicStages.get('axe_control_transition')?.committed_fact_output === 'axe_control_removed_from_zhdanko'
    && dangerAtomicStages.get('optional_zhdanko_strike')?.producer_consequence_ref === 'trace_ld_v1_consequence_zhdanko_axe_poll_strike_on_ratsha'
    && dangerAtomicStages.get('optional_zhdanko_strike')?.committed_fact_output === 'zhdanko_axe_poll_strike_on_ratsha_committed'
    && dangerAtomicStages.get('optional_ratsha_wound')?.producer_body_effect_ref === 'trace_ld_v1_body_danger_2m'
    && exactSet(dangerAtomicStages.get('optional_ratsha_wound')?.requires_committed_facts, ['zhdanko_axe_poll_strike_on_ratsha_committed'])
    && dangerAtomicStages.get('optional_ratsha_wound')?.committed_fact_output === 'ratsha_minor_head_wound_committed'
    && dangerAtomicStages.get('temporary_restraint')?.producer_consequence_ref === 'trace_ld_v1_consequence_bounded_group_restraint_applied'
    && exactSet(dangerAtomicStages.get('temporary_restraint')?.requires_committed_facts, ['axe_control_removed_from_zhdanko'])
    && dangerAtomicStages.get('temporary_restraint')?.committed_fact_output === 'temporary_restraint_applied',
  'TRACE_0D_ATOMIC_RESOLUTION',
  'danger atomic effects lack exact code-owned producer stages'
);
const ratshaAttackResolutionConsequence = consequenceMap.get('trace_ld_v1_consequence_ratsha_attack_outcome_resolved');
const ratshaAttackOutcomeMap = mapUnique(ratshaAttackAtomicResolution?.outcome_variants, 'outcome_id', 'TRACE_0D_RATSHA_ATTACK_RESOLUTION');
const ratshaResponseEffectMap = mapUnique(
  ratshaAttackAtomicResolution?.response_effect_bindings,
  'option_id',
  'TRACE_0D_RATSHA_RESPONSE_EFFECT'
);
requireCondition(
  ratshaAttackAtomicResolution?.owner === '@rus/combat-health'
    && ratshaAttackAtomicResolution?.owner_contract_ref === 'atomic_conflict_resolution'
    && ratshaAttackAtomicResolution?.runtime_resolution_execution === 'deferred_to_first_use_integration'
    && exactSet(ratshaAttackAtomicResolution?.required_committed_inputs?.required_facts, [
      'ratsha_attack_attempt_committed',
      'ratsha_attack_player_response_committed'
    ])
    && exactSet(ratshaAttackAtomicResolution?.required_committed_inputs?.required_controlled_item_any_of, [
      'trace_ld_v1_item_ratsha_knife',
      'trace_ld_v1_item_hooking_pole'
    ])
    && ratshaAttackAtomicResolution?.required_committed_inputs?.required_player_response_record?.schema === 'rus.trace_ratsha_attack_player_response.v1'
    && ratshaAttackAtomicResolution?.required_committed_inputs?.required_player_response_record?.contract_ref === 'trace_ld_v1_ratsha_attack_player_response_contract'
    && ratshaAttackAtomicResolution?.required_committed_inputs?.required_player_response_record?.option_id_source === 'exact_committed_closed_variant'
    && exactSet([...ratshaAttackOutcomeMap.keys()], [
      'ratsha_attack_interrupted_before_body_effect',
      'ratsha_attack_resolved_without_body_effect',
      'ratsha_attack_resolved_with_committed_harm_package'
    ])
    && ratshaAttackOutcomeMap.get('ratsha_attack_interrupted_before_body_effect')?.source_contract_result === 'validated_combat_state_attack_no_longer_admissible'
    && exactSet(ratshaAttackOutcomeMap.get('ratsha_attack_interrupted_before_body_effect')?.applied_effect_refs, [])
    && ratshaAttackOutcomeMap.get('ratsha_attack_resolved_without_body_effect')?.source_contract_result === 'validated_attack_request_no_harm_package'
    && exactSet(ratshaAttackOutcomeMap.get('ratsha_attack_resolved_without_body_effect')?.applied_effect_refs, [])
    && ratshaAttackOutcomeMap.get('ratsha_attack_resolved_with_committed_harm_package')?.source_contract_result === 'apply_harm_package_committed'
    && ratshaAttackOutcomeMap.get('ratsha_attack_resolved_with_committed_harm_package')?.applied_effect_ref_source === 'committed_harm_package_effect_refs'
    && ratshaAttackAtomicResolution?.result_producer?.producer_consequence_ref === ratshaAttackResolutionConsequence?.consequence_id
    && ratshaAttackAtomicResolution?.result_producer?.committed_fact_output === 'ratsha_attack_outcome_resolved'
    && ratshaAttackAtomicResolution?.result_producer?.result_record_required_before_fact_commit === true
    && exactSet(ratshaAttackResolutionConsequence?.committed_fact_outputs, ['ratsha_attack_outcome_resolved'])
    && ratshaAttackResolutionConsequence?.required_atomic_resolution_profile_ref === ratshaAttackAtomicResolution.profile_id
    && ratshaAttackResolutionConsequence?.required_result_record?.schema === 'rus.trace_ratsha_attack_resolution_result.v1'
    && exactSet(ratshaAttackResolutionConsequence?.required_result_record?.required_fields, [
      'outcome_id',
      'response_effect_result_id',
      'source_state_version',
      'applied_effect_refs',
      'post_response_committed_fact_refs'
    ])
    && ratshaAttackResolutionConsequence?.required_result_record?.outcome_id_closed_to_profile_variants === true
    && ratshaAttackResolutionConsequence?.required_result_record?.response_effect_result_id_closed_to_selected_response_binding === true
    && ratshaAttackAtomicResolution?.result_producer?.response_effect_result_required_before_fact_commit === true
    && ratshaAttackAtomicResolution?.next_boundary?.required_fact === 'ratsha_attack_outcome_resolved'
    && ratshaAttackAtomicResolution?.next_boundary?.next_npc_option_id === 'continue_escape_after_resolved_attack'
    && ratshaAttackAtomicResolution?.next_boundary?.escape_in_same_attack_or_response_command === 'forbidden'
    && ratshaAttackAtomicResolution?.harm_or_outcome_before_player_response_commit === 'forbidden'
    && ratshaAttackAtomicResolution?.llm_outcome_selection === 'forbidden'
    && ratshaAttackAtomicResolution?.direct_clock_write === 'forbidden',
  'TRACE_0D_RATSHA_ATTACK_RESOLUTION',
  'Ratsha attack outcome lacks one exact combat-owned producer and closed result record'
);
const expectedRatshaResponseEffectIds = [
  'defend_in_place_against_ratsha',
  'attempt_nonlethal_hold_of_ratsha',
  'break_contact_within_drying_shed'
];
requireCondition(
  exactSet([...ratshaResponseEffectMap.keys()], expectedRatshaResponseEffectIds)
    && ratshaAttackAtomicResolution?.response_effect_application_order === 'exact_response_effect_result_before_general_attack_outcome_fact',
  'TRACE_0D_RATSHA_RESPONSE_EFFECT',
  'Ratsha response effect set or commit order is incomplete'
);
const validateRatshaResponseEffectResult = (
  resultMap,
  resultId,
  consequenceId,
  committedFact,
  extra = () => true
) => {
  const result = resultMap.get(resultId);
  const consequence = consequenceMap.get(consequenceId);
  requireCondition(
    result?.producer_owner === '@rus/combat-health'
      && result?.producer_consequence_ref === consequence?.consequence_id
      && exactSet(result?.committed_fact_outputs, [committedFact])
      && exactSet(consequence?.committed_fact_outputs, [committedFact])
      && consequence?.required_atomic_resolution_profile_ref === ratshaAttackAtomicResolution.profile_id
      && consequence?.required_response_effect_result_id === resultId
      && extra(result, consequence),
    'TRACE_0D_RATSHA_RESPONSE_EFFECT',
    `${resultId} lacks one exact combat-owned producer and committed result`
  );
};
const defendEffect = ratshaResponseEffectMap.get('defend_in_place_against_ratsha');
const defendResults = mapUnique(defendEffect?.result_variants, 'result_id', 'TRACE_0D_RATSHA_RESPONSE_EFFECT');
requireCondition(
  exactSet(defendEffect?.eligibility?.required_actor_positions, [
    'player_clerk@trace_ld_v1_loc_old_drying_shed',
    'ratsha_storehouse_helper@trace_ld_v1_loc_old_drying_shed'
  ])
    && defendEffect?.eligibility?.required_position_relation === 'same_committed_attack_reach_zone'
    && exactSet([...defendResults.keys()], ['ratsha_defend_in_place_position_preserved'])
    && defendEffect?.unlisted_result === 'typed_ratsha_defend_response_result_unknown',
  'TRACE_0D_RATSHA_RESPONSE_EFFECT',
  'defend-in-place response eligibility or result space is incomplete'
);
validateRatshaResponseEffectResult(
  defendResults,
  'ratsha_defend_in_place_position_preserved',
  'trace_ld_v1_consequence_ratsha_defend_in_place_committed',
  'ratsha_defend_in_place_response_committed',
  (result, consequence) => (
    result.position_effect === 'preserve_committed_actor_zone_positions'
      && consequence.position_mutation === 'forbidden'
  )
);
const holdEffect = ratshaResponseEffectMap.get('attempt_nonlethal_hold_of_ratsha');
const holdResults = mapUnique(holdEffect?.result_variants, 'result_id', 'TRACE_0D_RATSHA_RESPONSE_EFFECT');
requireCondition(
  exactSet(holdEffect?.eligibility?.required_actor_positions, [
    'player_clerk@trace_ld_v1_loc_old_drying_shed',
    'ratsha_storehouse_helper@trace_ld_v1_loc_old_drying_shed'
  ])
    && holdEffect?.eligibility?.required_position_relation === 'same_committed_attack_reach_zone'
    && holdEffect?.eligibility?.required_actor_state === 'ratsha_storehouse_helper:not_temporarily_restrained'
    && exactSet([...holdResults.keys()], ['ratsha_nonlethal_hold_succeeded', 'ratsha_nonlethal_hold_failed'])
    && holdEffect?.unlisted_result === 'typed_ratsha_nonlethal_hold_result_unknown',
  'TRACE_0D_RATSHA_RESPONSE_EFFECT',
  'nonlethal-hold response eligibility or result space is incomplete'
);
validateRatshaResponseEffectResult(
  holdResults,
  'ratsha_nonlethal_hold_succeeded',
  'trace_ld_v1_consequence_ratsha_nonlethal_hold_succeeded',
  'ratsha_temporary_restraint_committed',
  (result, consequence) => (
    result.post_response_actor_state === 'ratsha_storehouse_helper:temporarily_restrained'
      && consequence.restraint_subject_ref === 'ratsha_storehouse_helper'
  )
);
validateRatshaResponseEffectResult(
  holdResults,
  'ratsha_nonlethal_hold_failed',
  'trace_ld_v1_consequence_ratsha_nonlethal_hold_failed',
  'ratsha_nonlethal_hold_failed_committed',
  (result, consequence) => (
    result.post_response_actor_state === 'ratsha_storehouse_helper:not_temporarily_restrained'
      && consequence.restraint_mutation === 'forbidden'
  )
);
const breakContactEffect = ratshaResponseEffectMap.get('break_contact_within_drying_shed');
const breakContactResults = mapUnique(
  breakContactEffect?.result_variants,
  'result_id',
  'TRACE_0D_RATSHA_RESPONSE_EFFECT'
);
const breakContactPositionTransition = {
  actor_ref: 'player_clerk',
  location_ref: 'trace_ld_v1_loc_old_drying_shed',
  source_zone_ref: 'shed_interior',
  destination_zone_ref: 'shed_approach',
  access_policy_ref: 'trace_ld_v1_access_old_drying_shed',
  capacity_contract_ref: 'trace_ld_v1_capacity_old_drying_shed',
  position_write_owner_contract_ref: '@rus/party-store:logical_write_plan'
};
requireCondition(
  breakContactEffect?.eligibility?.required_actor_position === 'player_clerk@trace_ld_v1_loc_old_drying_shed:shed_interior'
    && breakContactEffect?.eligibility?.access_policy_ref === breakContactPositionTransition.access_policy_ref
    && breakContactEffect?.eligibility?.capacity_contract_ref === breakContactPositionTransition.capacity_contract_ref
    && breakContactEffect?.eligibility?.destination_zone_ref === breakContactPositionTransition.destination_zone_ref
    && breakContactEffect?.eligibility?.requires_access_admission === true
    && breakContactEffect?.eligibility?.requires_capacity_admission === true
    && exactSet([...breakContactResults.keys()], [
      'player_break_contact_to_shed_approach_committed',
      'player_break_contact_not_admitted'
    ])
    && breakContactEffect?.unlisted_result === 'typed_ratsha_break_contact_result_unknown',
  'TRACE_0D_RATSHA_RESPONSE_EFFECT',
  'break-contact response eligibility or result space is incomplete'
);
validateRatshaResponseEffectResult(
  breakContactResults,
  'player_break_contact_to_shed_approach_committed',
  'trace_ld_v1_consequence_player_break_contact_zone_committed',
  'player_break_contact_to_shed_approach_committed',
  (result, consequence) => (
    JSON.stringify(result.position_transition) === JSON.stringify(breakContactPositionTransition)
      && JSON.stringify(consequence.required_position_transition) === JSON.stringify(breakContactPositionTransition)
  )
);
validateRatshaResponseEffectResult(
  breakContactResults,
  'player_break_contact_not_admitted',
  'trace_ld_v1_consequence_player_break_contact_not_admitted',
  'player_break_contact_position_unchanged_committed',
  (result, consequence) => (
    result.position_effect === 'preserve_committed_actor_zone_positions'
      && consequence.position_mutation === 'forbidden'
  )
);
const playerResponseContractMap = mapUnique(activities.player_response_contracts, 'contract_id', 'TRACE_0D_PLAYER_RESPONSE');
const ratshaPlayerResponse = playerResponseContractMap.get('trace_ld_v1_ratsha_attack_player_response_contract');
const ratshaPlayerResponseVariantMap = mapUnique(ratshaPlayerResponse?.response_variants, 'option_id', 'TRACE_0D_PLAYER_RESPONSE');
const ratshaPlayerResponseConsequence = consequenceMap.get('trace_ld_v1_consequence_ratsha_attack_player_response_committed');
requireCondition(
  playerResponseContractMap.size === 1
    && ratshaPlayerResponse?.owner === '@rus/turn'
    && ratshaPlayerResponse?.trigger_fact === 'ratsha_attack_player_response_required'
    && ratshaPlayerResponse?.required_prior_fact === 'ratsha_attack_attempt_committed'
    && ratshaPlayerResponse?.selection_source === 'full_closed_available_action_set_at_committed_boundary'
    && ratshaPlayerResponse?.semantic_resolver_input === 'raw_text_plus_all_closed_option_records'
    && ratshaPlayerResponse?.selection_result === 'exact_option_id_or_unknown'
    && exactSet([...ratshaPlayerResponseVariantMap.keys()], [
      'defend_in_place_against_ratsha',
      'attempt_nonlethal_hold_of_ratsha',
      'break_contact_within_drying_shed'
    ])
    && [...ratshaPlayerResponseVariantMap.values()].every((variant) => (
      variant.check_ref === null
      && variant.check_policy === 'combat_owner_resolves_from_committed_state_without_scenario_d20'
      && variant.combat_resolution_profile_ref === ratshaAttackAtomicResolution.profile_id
      && variant.response_effect_binding_ref === variant.option_id
      && ratshaResponseEffectMap.has(variant.response_effect_binding_ref)
      && unique(variant.permitted_effect_classes)
      && variant.permitted_effect_classes.length > 0
      && unique(variant.forbidden_effect_classes)
      && variant.forbidden_effect_classes.length > 0
    ))
    && exactSet(ratshaPlayerResponseVariantMap.get('defend_in_place_against_ratsha')?.permitted_effect_classes, [
      'committed_harm_package_or_no_body_effect',
      'position_unchanged'
    ])
    && exactSet(ratshaPlayerResponseVariantMap.get('defend_in_place_against_ratsha')?.forbidden_effect_classes, [
      'automatic_escape',
      'invented_harm',
      'direct_body_write'
    ])
    && exactSet(ratshaPlayerResponseVariantMap.get('attempt_nonlethal_hold_of_ratsha')?.permitted_effect_classes, [
      'committed_harm_package_or_no_body_effect',
      'temporary_restraint_proposal'
    ])
    && exactSet(ratshaPlayerResponseVariantMap.get('attempt_nonlethal_hold_of_ratsha')?.forbidden_effect_classes, [
      'summary_killing',
      'invented_restraint',
      'direct_body_write'
    ])
    && exactSet(ratshaPlayerResponseVariantMap.get('break_contact_within_drying_shed')?.permitted_effect_classes, [
      'committed_harm_package_or_no_body_effect',
      'committed_actor_zone_position_effect'
    ])
    && exactSet(ratshaPlayerResponseVariantMap.get('break_contact_within_drying_shed')?.forbidden_effect_classes, [
      'route_movement_inside_response',
      'automatic_escape',
      'direct_body_write'
    ])
    && ratshaPlayerResponseVariantMap.get('break_contact_within_drying_shed')?.conditional_movement_ref === null
    && ratshaPlayerResponseVariantMap.get('defend_in_place_against_ratsha')?.conditional_movement_ref === null
    && ratshaPlayerResponseVariantMap.get('attempt_nonlethal_hold_of_ratsha')?.conditional_movement_ref === null
    && ratshaPlayerResponse?.response_commit_consequence_ref === ratshaPlayerResponseConsequence?.consequence_id
    && ratshaPlayerResponse?.post_response_resolution_consequence_ref === ratshaAttackResolutionConsequence.consequence_id
    && exactSet(ratshaPlayerResponseConsequence?.committed_fact_outputs, ['ratsha_attack_player_response_committed'])
    && ratshaPlayerResponseConsequence?.required_player_response_contract_ref === ratshaPlayerResponse.contract_id
    && ratshaPlayerResponseConsequence?.required_result_record?.schema === 'rus.trace_ratsha_attack_player_response.v1'
    && exactSet(ratshaPlayerResponseConsequence?.required_result_record?.required_fields, [
      'option_id',
      'source_state_version',
      'combat_resolution_profile_ref'
    ])
    && ratshaPlayerResponseConsequence?.required_result_record?.option_id_closed_to_contract_variants === true
    && ratshaPlayerResponse?.ordered_commit_boundaries?.join('|') === [
      'ratsha_attack_attempt_committed',
      'exact_player_response_variant_committed',
      'ratsha_attack_outcome_resolved',
      'separate_ratsha_escape_decision'
    ].join('|')
    && ratshaPlayerResponse?.elapsed_time_write === 'forbidden'
    && ratshaPlayerResponse?.llm_factual_outcome === 'forbidden',
  'TRACE_0D_PLAYER_RESPONSE',
  'Ratsha attack must commit one exact closed player response before combat-owned resolution'
);
const sceneObservationMap = mapUnique(activities.scene_observation_profiles, 'profile_id', 'TRACE_0D_SCENE_OBSERVATION');
const onisimArrivalObservation = sceneObservationMap.get('trace_ld_v1_observation_onisim_alive_at_drying_shed');
const onisimArrivalConsequence = consequenceMap.get('trace_ld_v1_consequence_onisim_found_alive_observed');
const campToShedRoute = movement.route_bindings?.find(({ route_id }) => route_id === 'trace_ld_v1_route_camp_to_shed');
requireCondition(
  sceneObservationMap.size === 1
    && onisimArrivalObservation?.owner === '@rus/visibility-knowledge-memory'
    && onisimArrivalObservation?.owner_contract_ref === 'scene_observation_projection'
    && onisimArrivalObservation?.trigger?.route_terminal_commit_ref === campToShedRoute?.route_id
    && onisimArrivalObservation?.trigger?.observer_position === 'player_clerk@trace_ld_v1_loc_old_drying_shed'
    && onisimArrivalObservation?.trigger?.subject_position === 'onisim_boatman@trace_ld_v1_loc_old_drying_shed'
    && onisimArrivalObservation?.trigger?.subject_body_condition_ref === 'trace_ld_v1_condition_onisim_injury'
    && exactSet(onisimArrivalObservation?.trigger?.allowed_subject_states, ['injured_unable_to_walk', 'stabilized_unable_to_walk'])
    && onisimArrivalObservation?.trigger?.visibility_requirement === 'direct_visible_scene_observation'
    && onisimArrivalObservation?.producer_consequence_ref === onisimArrivalConsequence?.consequence_id
    && onisimArrivalObservation?.committed_fact_output === 'onisim_found_alive'
    && onisimArrivalObservation?.elapsed_minutes === 0
    && onisimArrivalObservation?.treatment_dependency === 'forbidden'
    && onisimArrivalObservation?.body_state_mutation === 'forbidden'
    && exactSet(campToShedRoute?.terminal_observation_profile_refs, [onisimArrivalObservation.profile_id])
    && exactSet(onisimArrivalConsequence?.committed_fact_outputs, ['onisim_found_alive'])
    && onisimArrivalConsequence?.required_scene_observation_profile_ref === onisimArrivalObservation.profile_id,
  'TRACE_0D_SCENE_OBSERVATION',
  'Onisim alive fact must be produced by direct arrival observation before treatment'
);
const temporaryDispositionMap = mapUnique(activities.temporary_disposition_contracts, 'contract_id', 'TRACE_0D_TEMPORARY_DISPOSITION');
const temporaryDisposition = temporaryDispositionMap.get('trace_ld_v1_temporary_disposition_contract');
const temporaryDispositionActivity = activityMap.get('trace_ld_v1_activity_temporary_decision');
const temporaryDispositionConsequence = consequenceMap.get('trace_ld_v1_consequence_temporary_disposition_committed');
const custodyOptionMap = mapUnique(temporaryDisposition?.custody_options, 'option_id', 'TRACE_0D_TEMPORARY_DISPOSITION');
const propertyOptionMap = mapUnique(temporaryDisposition?.property_options, 'option_id', 'TRACE_0D_TEMPORARY_DISPOSITION');
const promiseOptionMap = mapUnique(temporaryDisposition?.promise_options, 'option_id', 'TRACE_0D_TEMPORARY_DISPOSITION');
const ratshaAbsentCustody = custodyOptionMap.get('hold_zhdanko_ratsha_absent');
const ratshaPresentNotHeldCustody = custodyOptionMap.get('hold_zhdanko_ratsha_present_not_held');
requireCondition(
  temporaryDispositionMap.size === 1
    && temporaryDisposition?.owner === '@rus/turn'
    && temporaryDisposition?.selection_contract?.custody_cardinality === 'exactly_one'
    && temporaryDisposition?.selection_contract?.property_cardinality === 'exactly_one'
    && temporaryDisposition?.selection_contract?.promise_cardinality === 'exactly_one'
    && temporaryDisposition?.selection_contract?.eligibility_source_state === 'committed_world_state_only'
    && temporaryDisposition?.selection_contract?.selection_source === 'raw_intent_to_closed_exact_option_id_per_dimension'
    && temporaryDisposition?.selection_contract?.eligible_option_cardinality === 'one_or_more'
    && temporaryDisposition?.selection_contract?.selected_option_cardinality === 'exactly_one_per_dimension'
    && temporaryDisposition?.selection_contract?.unknown_combination === 'typed_temporary_disposition_not_admitted'
    && temporaryDisposition?.selection_contract?.multiple_selected_option_ids === 'typed_temporary_disposition_conflict'
    && temporaryDisposition?.selection_contract?.dimension_conflict_prevalidation === 'required_before_selection'
    && exactSet([...custodyOptionMap.keys()], temporaryDispositionActivity?.semantic_option_ids)
    && exactSet([...custodyOptionMap.keys()], [
      'hold_ratsha_and_zhdanko_for_authorized_handover',
      'hold_ratsha_zhdanko_absent',
      'hold_zhdanko_ratsha_absent',
      'hold_zhdanko_ratsha_present_not_held',
      'preserve_open_case_without_custody'
    ])
    && exactSet([...propertyOptionMap.keys()], [
      'preserve_recovered_property_for_savva_handover',
      'record_property_unavailable_without_invention',
      'leave_unresolved_property_state_unchanged'
    ])
    && exactSet(propertyOptionMap.get('preserve_recovered_property_for_savva_handover')?.required_committed_facts, ['sealed_packet_returned'])
    && exactSet(propertyOptionMap.get('preserve_recovered_property_for_savva_handover')?.none_of_committed_facts, ['packet_lost_or_destroyed'])
    && exactSet(propertyOptionMap.get('record_property_unavailable_without_invention')?.required_committed_facts, ['packet_lost_or_destroyed'])
    && exactSet(propertyOptionMap.get('record_property_unavailable_without_invention')?.none_of_committed_facts, ['sealed_packet_returned'])
    && exactSet([...promiseOptionMap.keys()], [
      'preserve_active_no_summary_killing_promise',
      'commit_scope_breach_for_active_promise',
      'record_no_active_promise'
    ])
    && exactSet(promiseOptionMap.get('preserve_active_no_summary_killing_promise')?.required_committed_facts, ['promise_current_active'])
    && exactSet(promiseOptionMap.get('commit_scope_breach_for_active_promise')?.required_committed_facts, ['promise_current_active'])
    && promiseOptionMap.get('commit_scope_breach_for_active_promise')?.committed_fact_output === 'temporary_promise_scope_breach_committed'
    && exactSet(promiseOptionMap.get('record_no_active_promise')?.none_of_committed_facts, [
      'promise_current_active',
      'promise_current_broken',
      'promise_current_fulfilled'
    ])
    && temporaryDisposition?.final_consequence_ref === temporaryDispositionConsequence?.consequence_id
    && temporaryDisposition?.committed_fact_output === 'temporary_disposition_outcome_committed'
    && exactSet(temporaryDispositionConsequence?.committed_fact_outputs, ['temporary_disposition_outcome_committed'])
    && temporaryDispositionConsequence?.required_temporary_disposition_contract_ref === temporaryDisposition.contract_id
    && temporaryDispositionActivity?.temporary_disposition_contract_ref === temporaryDisposition.contract_id
    && exactSet(temporaryDispositionActivity?.consequence_refs, [temporaryDispositionConsequence.consequence_id])
    && !Object.hasOwn(temporaryDispositionActivity, 'committed_fact_outputs')
    && temporaryDispositionActivity?.cancellation_committed_fact_output === 'temporary_disposition_missing'
    && exactSet(temporaryDisposition?.forbidden_semantics, ['pardon', 'innocence', 'release_from_responsibility', 'final_legal_judgment', 'summary_punishment'])
    && promiseOptionMap.get('preserve_active_no_summary_killing_promise')?.scope === 'no_summary_killing_after_surrender_and_no_further_harm'
    && exactSet(promiseOptionMap.get('preserve_active_no_summary_killing_promise')?.required_witness_slots, ['eremey_fisher', 'trace_ld_v1_audience_slot_participating_fisher'])
    && exactSet(ratshaAbsentCustody?.required_committed_actor_predicates, [
      'ratsha_storehouse_helper:outside_fishing_camp'
    ])
    && !Object.hasOwn(ratshaAbsentCustody ?? {}, 'required_committed_actor_predicates_any_of')
    && ratshaAbsentCustody?.committed_fact_output === 'temporary_custody_zhdanko_ratsha_absent'
    && ratshaAbsentCustody?.ratsha_presence_effect?.physical_presence === 'absent_from_fishing_camp'
    && ratshaAbsentCustody?.ratsha_presence_effect?.custody === 'not_applicable_in_current_location'
    && ratshaAbsentCustody?.ratsha_presence_effect?.capacity_counting === 'do_not_count_as_present_actor'
    && ratshaAbsentCustody?.ratsha_presence_effect?.npc_decision_status === 'continues_from_committed_out_of_camp_state'
    && ratshaAbsentCustody?.ratsha_presence_effect?.promise_scope === 'evaluate_current_promise_state_without_presence_inference'
    && ratshaAbsentCustody?.ratsha_presence_effect?.epilogue_projection === 'visible_absence_only_if_observed_or_committed'
    && exactSet(ratshaPresentNotHeldCustody?.required_committed_actor_predicates, [
      'ratsha_storehouse_helper:at_fishing_camp',
      'ratsha_storehouse_helper:not_in_temporary_custody'
    ])
    && ratshaPresentNotHeldCustody?.committed_fact_output === 'temporary_custody_zhdanko_ratsha_present_not_held'
    && ratshaPresentNotHeldCustody?.ratsha_presence_effect?.physical_presence === 'present_at_fishing_camp'
    && ratshaPresentNotHeldCustody?.ratsha_presence_effect?.custody === 'not_held'
    && ratshaPresentNotHeldCustody?.ratsha_presence_effect?.capacity_counting === 'count_as_present_actor'
    && ratshaPresentNotHeldCustody?.ratsha_presence_effect?.npc_decision_status === 'continues_from_committed_state'
    && ratshaPresentNotHeldCustody?.ratsha_presence_effect?.promise_scope === 'evaluate_current_promise_state_without_absence_inference'
    && ratshaPresentNotHeldCustody?.ratsha_presence_effect?.epilogue_projection === 'visible_present_not_held_only_if_observed'
    && exactSet(custodyOptionMap.get('preserve_open_case_without_custody')?.required_committed_actor_predicates_any_of, [
      'ratsha_storehouse_helper:outside_fishing_camp',
      'ratsha_storehouse_helper:not_in_temporary_custody'
    ]),
  'TRACE_0D_TEMPORARY_DISPOSITION',
  'temporary disposition must select closed custody/property/promise outcomes and forbid final judgment'
);
requireCondition(
  propertyOptionMap.get('preserve_recovered_property_for_savva_handover')?.owner_must_remain === 'trace_ld_v1_external_owner_savva_tverdich'
    && approvedExternalPropertyOwnerRefs.has('trace_ld_v1_external_owner_savva_tverdich'),
  'TRACE_0D_TEMPORARY_PROPERTY_OWNER',
  'temporary property disposition must preserve one exact approved external owner ref'
);
for (const option of [...custodyOptionMap.values(), ...propertyOptionMap.values(), ...promiseOptionMap.values()]) {
  requireCondition(text(option.committed_fact_output), 'TRACE_0D_TEMPORARY_DISPOSITION', `${option.option_id} lacks an exact committed output`);
}
requireCondition(
  !JSON.stringify(activities).includes('temporary_decision_committed'),
  'TRACE_0D_TEMPORARY_DISPOSITION',
  'generic temporary_decision_committed boolean is forbidden'
);
requireCondition(
  !JSON.stringify(temporaryDisposition).includes('ratsha_absent_or_not_surrendered'),
  'TRACE_0D_TEMPORARY_DISPOSITION',
  'temporary disposition must use committed actor predicates, not an unproduced summary fact'
);
for (const check of checkMap.values()) {
  requireCondition(check.schema === 'rus.trace_check_profile.v1' && check.version === 1 && Number.isInteger(check.dc), 'TRACE_0D_CHECK_SCHEMA', `${check.check_id} schema/DC invalid`);
  requireCondition(check.retry_policy === 'reuse_committed_roll_for_same_activity_attempt_id', 'TRACE_0D_CHECK_RETRY', `${check.check_id} permits a reroll on retry`);
  requireCondition(text(check.failure_continuation?.approved_route), 'TRACE_0D_CHECK_FAILURE_PATH', `${check.check_id} has no approved continuation`);
  for (const ref of Object.values(check.outcome_refs)) requireCondition(consequenceMap.has(ref), 'TRACE_0D_CHECK_CONSEQUENCE', `${check.check_id} has unknown consequence`);
  for (const refs of Object.values(check.admitted_evidence_by_outcome)) {
    for (const ref of refs) requireCondition(evidenceIds.has(ref), 'TRACE_0D_CHECK_EVIDENCE', `${check.check_id} admits unknown evidence`);
  }
  requireCondition(
    Array.isArray(check.admitted_evidence_by_outcome.failure)
      && check.admitted_evidence_by_outcome.failure.length === 0,
    'TRACE_0D_CHECK_EVIDENCE_DISCOVERY',
    `${check.check_id} failure invents evidence without discovery`
  );
  requireCondition(!Object.values(check.admitted_evidence_by_outcome).flat().includes('trace_ld_v1_evidence_ratsha_confession') || check.check_id !== 'trace_ld_v1_check_ratsha_surrender_attempt', 'TRACE_0D_CONFESSION_FROM_CHECK', 'surrender check invents confession');
}
const expectedCheckConsequences = Object.freeze({
  trace_ld_v1_check_detailed_wreck_inspection: ['trace_ld_v1_consequence_inspection_success', 'trace_ld_v1_consequence_inspection_failure'],
  trace_ld_v1_check_eremey_cooperation: ['trace_ld_v1_consequence_eremey_cooperation_enabled', 'trace_ld_v1_consequence_eremey_remains_guarded'],
  trace_ld_v1_check_ratsha_surrender_attempt: ['trace_ld_v1_consequence_ratsha_surrender_options_admitted', 'trace_ld_v1_consequence_ratsha_hostile_options_admitted'],
  trace_ld_v1_check_risky_first_aid: ['trace_ld_v1_consequence_onisim_stabilized', 'trace_ld_v1_consequence_onisim_not_worsened_by_invention']
});
for (const check of checkMap.values()) {
  requireCondition(exactSet(Object.values(check.outcome_refs), expectedCheckConsequences[check.check_id]), 'TRACE_0D_CHECK_CONSEQUENCE_MAPPING', `${check.check_id} outcome/consequence mapping invalid`);
}
for (const activity of activityMap.values()) {
  if (!activity.check_ref) continue;
  requireCondition(exactSet(activity.consequence_refs, Object.values(checkMap.get(activity.check_ref).outcome_refs)), 'TRACE_0D_CHECK_CONSEQUENCE_MAPPING', `${activity.profile_id} consequence refs do not match its check outcomes`);
}
for (const consequence of consequenceMap.values()) {
  requireCondition(consequence.write_target_classes.length > 0 && consequence.write_target_classes.every((target) => !['hidden_truth', 'completion_state'].includes(target)), 'TRACE_0D_CONSEQUENCE_WRITES', `${consequence.consequence_id} has unsafe write targets`);
}
const inspectionCheck = checkMap.get('trace_ld_v1_check_detailed_wreck_inspection');
requireCondition(
  exactSet(
    inspectionCheck.precheck_automatic_observation_refs,
    ['visible:wreck_present', 'trace_ld_v1_evidence_onisim_barefoot_tracks', 'trace_ld_v1_evidence_boot_track', 'visible:road_bag_missing']
  )
    && inspectionCheck.precheck_automatic_observation_refs
      .filter((ref) => !ref.startsWith('visible:'))
      .every((ref) => evidenceIds.has(ref)),
  'TRACE_0D_INSPECTION_BASELINE',
  'automatic pre-check observations are incomplete or unresolved'
);
const eremeyCheck = checkMap.get('trace_ld_v1_check_eremey_cooperation');
requireCondition(
  eremeyCheck.admitted_evidence_by_outcome.success.length === 0
    && exactSet(eremeyCheck.admitted_followup_option_ids?.success, ['bounded_disclosure', 'guide_group', 'assist_rescue_or_restraint'])
    && exactSet(eremeyCheck.admitted_followup_option_ids?.failure, ['evade_and_withhold']),
  'TRACE_0D_EREMEY_BOUNDARY',
  'Eremey check must admit bounded NPC options, not create testimony'
);
const ratshaCheck = checkMap.get('trace_ld_v1_check_ratsha_surrender_attempt');
requireCondition(
  exactSet(ratshaCheck.admitted_followup_option_ids?.success, ['surrender_without_confession', 'surrender_and_confess'])
    && exactSet(ratshaCheck.admitted_followup_option_ids?.failure, ['attack_and_escape', 'threaten_and_bargain']),
  'TRACE_0D_RATSHA_CHECK_OPTIONS',
  'Ratsha check option admission is invalid'
);

const npcMap = mapUnique(npc.decision_policies, 'policy_id', 'TRACE_0D_NPC_POLICY');
requireCondition(npcMap.size === 6, 'TRACE_0D_NPC_POLICY', 'six NPC decision policies are required');
requireCondition(exactSet([...npcMap.values()].map(({ actor_slot }) => actor_slot), ['onisim_boatman', 'eremey_fisher', 'ratsha_storehouse_helper', 'zhdanko_storehouse_controller', 'background_fisher_1', 'background_fisher_2']), 'TRACE_0D_NPC_SLOTS', 'NPC policy slots are incompatible');
for (const policy of npcMap.values()) {
  requireCondition(policy.schema === 'rus.trace_npc_decision_policy.v1' && policy.version === 1, 'TRACE_0D_NPC_SCHEMA', `${policy.policy_id} schema/version invalid`);
  const options = mapUnique(policy.option_set, 'option_id', 'TRACE_0D_NPC_OPTION');
  requireCondition(options.size > 0, 'TRACE_0D_NPC_OPTION', `${policy.policy_id} has empty options`);
  for (const option of options.values()) requireCondition(Array.isArray(option.preconditions) && option.preconditions.length > 0, 'TRACE_0D_NPC_PRECONDITION', `${option.option_id} lacks preconditions`);
  requireCondition(policy.no_valid_option_failure === 'typed_npc_no_valid_option', 'TRACE_0D_NPC_FAILURE', `${policy.policy_id} lacks typed no-option failure`);
  for (const ref of policy.available_resources) requireCondition(itemText.includes(ref), 'TRACE_0D_NPC_RESOURCE', `${policy.policy_id} has unresolved resource ${ref}`);
}
const expectedNpcOptions = Object.freeze({
  onisim_boatman: ['report_reliable_memory_fragment', 'defer_answer_due_to_injury', 'accept_first_aid'],
  eremey_fisher: ['evade_and_withhold', 'bounded_disclosure', 'guide_group', 'assist_rescue_or_restraint'],
  ratsha_storehouse_helper: ['attack_and_escape', 'continue_escape_after_resolved_attack', 'threaten_and_bargain', 'surrender_without_confession', 'surrender_and_confess'],
  zhdanko_storehouse_controller: ['deny_and_submit', 'deny_and_delay', 'bargain', 'flee_without_weapon', 'resist_with_axe'],
  background_fisher_1: ['observe', 'carry', 'guard_or_hold', 'escort'],
  background_fisher_2: ['observe', 'carry', 'guard_or_hold', 'escort']
});
for (const policy of npcMap.values()) requireCondition(exactSet(policy.option_set.map(({ option_id }) => option_id), expectedNpcOptions[policy.actor_slot]), 'TRACE_0D_NPC_OPTION', `${policy.actor_slot} option set contains an unknown or missing option`);
for (const optionId of [...eremeyCheck.admitted_followup_option_ids.success, ...eremeyCheck.admitted_followup_option_ids.failure]) requireCondition(expectedNpcOptions.eremey_fisher.includes(optionId), 'TRACE_0D_EREMEY_BOUNDARY', `Eremey check admits unknown option ${optionId}`);
for (const optionId of [...ratshaCheck.admitted_followup_option_ids.success, ...ratshaCheck.admitted_followup_option_ids.failure]) requireCondition(expectedNpcOptions.ratsha_storehouse_helper.includes(optionId), 'TRACE_0D_RATSHA_CHECK_OPTIONS', `Ratsha check admits unknown option ${optionId}`);
const statementEffectMap = mapUnique(npc.statement_effect_contracts, 'statement_effect_contract_id', 'TRACE_0D_STATEMENT_EFFECT');
const expectedStatementEffects = [
  'trace_ld_v1_statement_effect_onisim_memory_report',
  'trace_ld_v1_statement_effect_eremey_evasion',
  'trace_ld_v1_statement_effect_eremey_disclosure',
  'trace_ld_v1_statement_effect_ratsha_threat_or_bargain',
  'trace_ld_v1_statement_effect_ratsha_confession',
  'trace_ld_v1_statement_effect_zhdanko_denial',
  'trace_ld_v1_statement_effect_zhdanko_delay_or_bargain'
];
requireCondition(exactSet([...statementEffectMap.keys()], expectedStatementEffects), 'TRACE_0D_STATEMENT_EFFECT_SET', 'statement effect contract set is incomplete or unknown');
for (const contract of statementEffectMap.values()) {
  requireCondition(
    text(contract.source_rule)
      && text(contract.audience_rule)
      && unique(contract.write_targets)
      && contract.write_targets.length > 0
      && unique(contract.forbidden_write_targets)
      && contract.forbidden_write_targets.includes('objective_truth')
      && contract.forbidden_write_targets.includes('hidden_truth')
      && contract.forbidden_write_targets.includes('completion_state')
      && (contract.statement_template_ref === null || knowledgeText.includes(contract.statement_template_ref)),
    'TRACE_0D_STATEMENT_EFFECT',
    `${contract.statement_effect_contract_id} is incomplete or can write objective truth`
  );
}
const propertyTransitionMap = mapUnique(npc.property_transition_profiles, 'transition_profile_id', 'TRACE_0D_PROPERTY_TRANSITION');
const decisionExecutionMap = mapUnique(npc.decision_execution_bindings, 'execution_binding_id', 'TRACE_0D_DECISION_EXECUTION');
const expectedDecisionPairs = new Set();
for (const policy of npcMap.values()) {
  for (const option of policy.option_set) expectedDecisionPairs.add(`${policy.policy_id}:${option.option_id}`);
}
requireCondition(decisionExecutionMap.size === expectedDecisionPairs.size, 'TRACE_0D_DECISION_EXECUTION_SET', 'decision execution binding count does not match the closed NPC option set');
const seenDecisionPairs = new Set();
const decisionMovementRefs = new Set([
  ...(movement.route_bindings ?? []).map(({ route_id }) => route_id),
  ...(movement.local_transition_bindings ?? []).map(({ transition_id }) => transition_id),
  ...(movement.active_scope_exit_bindings ?? []).map(({ exit_binding_id }) => exit_binding_id)
]);
const bodyEffectRefs = new Set((body.effect_profiles ?? []).map(({ effect_profile_id }) => effect_profile_id));
const noAdditionalElapsedModes = new Set([
  'no_additional_elapsed_at_parent_conversation_boundary',
  'no_additional_elapsed_until_bound_activity_executes',
  'no_additional_elapsed_until_selected_route_activity_executes',
  'no_additional_elapsed_until_selected_group_activity_executes',
  'no_additional_elapsed_at_parent_negotiation_boundary',
  'no_additional_elapsed_at_parent_confrontation_boundary',
  'no_additional_elapsed_at_parent_scene_boundary',
  'no_additional_elapsed_until_bound_carry_activity_executes',
  'no_additional_elapsed_until_bound_danger_activity_executes'
]);
for (const binding of decisionExecutionMap.values()) {
  const pair = `${binding.policy_id}:${binding.option_id}`;
  requireCondition(expectedDecisionPairs.has(pair) && !seenDecisionPairs.has(pair), 'TRACE_0D_DECISION_EXECUTION_PAIR', `${binding.execution_binding_id} does not bind one exact NPC option`);
  seenDecisionPairs.add(pair);
  requireCondition(
    text(binding.execution_kind)
      && text(binding.time_contract?.mode)
      && Array.isArray(binding.activity_profile_refs)
      && Array.isArray(binding.movement_refs)
      && Array.isArray(binding.consequence_refs)
      && Array.isArray(binding.property_transition_refs)
      && Array.isArray(binding.body_effect_refs)
      && unique(binding.write_targets)
      && binding.write_targets.length > 0
      && unique(binding.forbidden_write_targets)
      && binding.forbidden_write_targets.includes('completion_state')
      && text(binding.typed_failure),
    'TRACE_0D_DECISION_EXECUTION',
    `${binding.execution_binding_id} lacks exact effect, time, write, or typed failure contracts`
  );
  for (const ref of binding.activity_profile_refs) requireCondition(activityMap.has(ref), 'TRACE_0D_DECISION_ACTIVITY_REF', `${binding.execution_binding_id} has unknown activity ${ref}`);
  for (const ref of binding.movement_refs) requireCondition(decisionMovementRefs.has(ref), 'TRACE_0D_DECISION_MOVEMENT_REF', `${binding.execution_binding_id} has unknown movement ${ref}`);
  for (const ref of binding.consequence_refs) requireCondition(consequenceMap.has(ref), 'TRACE_0D_DECISION_CONSEQUENCE_REF', `${binding.execution_binding_id} has unknown consequence ${ref}`);
  for (const ref of binding.property_transition_refs) requireCondition(propertyTransitionMap.has(ref), 'TRACE_0D_DECISION_PROPERTY_REF', `${binding.execution_binding_id} has unknown property transition ${ref}`);
  for (const ref of binding.body_effect_refs) requireCondition(bodyEffectRefs.has(ref), 'TRACE_0D_DECISION_BODY_REF', `${binding.execution_binding_id} has unknown body effect ${ref}`);
  requireCondition(
    binding.statement_effect_contract_ref === null || statementEffectMap.has(binding.statement_effect_contract_ref),
    'TRACE_0D_DECISION_STATEMENT_REF',
    `${binding.execution_binding_id} has unknown statement effect`
  );
  const timeRefs = [
    binding.time_contract?.time_profile_ref,
    ...(binding.time_contract?.roots ?? []).map(({ time_profile_ref }) => time_profile_ref)
  ].filter(Boolean);
  for (const ref of timeRefs) requireCondition(timeProfileMap.has(ref), 'TRACE_0D_DECISION_TIME_REF', `${binding.execution_binding_id} has unknown time profile ${ref}`);
  if (binding.time_contract.mode.startsWith('no_additional_elapsed')) {
    const parentRefs = binding.time_contract.parent_execution_refs;
    const policy = npcMap.get(binding.policy_id);
    const actorSlot = policy?.actor_slot;
    const actorAdmittedByParent = (parentRef) => {
      const parent = activityMap.get(parentRef);
      const participantSlots = [
        ...(parent?.participant_slots?.required ?? []),
        ...(parent?.participant_slots?.optional ?? [])
      ];
      return participantSlots.includes(actorSlot)
        || (actorSlot?.startsWith('background_fisher_')
          && participantSlots.includes('trace_ld_v1_audience_slot_participating_fisher'));
    };
    const deferredToSelectedActivity = binding.time_contract.mode.includes('until_');
    requireCondition(
      noAdditionalElapsedModes.has(binding.time_contract.mode)
        && unique(parentRefs)
        && parentRefs.length > 0
        && parentRefs.every((ref) => activityMap.has(ref) && actorAdmittedByParent(ref))
        && binding.time_contract.parent_selection_policy === (
          deferredToSelectedActivity
            ? 'one_selected_bound_activity_from_closed_refs'
            : 'one_current_committed_parent_activity_from_closed_refs'
        )
        && binding.time_contract.clock_write === 'forbidden'
        && !binding.write_targets.includes('elapsed_game_time')
        && (deferredToSelectedActivity
          ? exactSet(parentRefs, binding.activity_profile_refs)
          : binding.activity_profile_refs.length === 0),
      'TRACE_0D_DECISION_PARENT_TIME',
      `${binding.execution_binding_id} lacks a closed compatible parent elapsed owner`
    );
  }
  requireCondition(
    timeRefs.length > 0 || noAdditionalElapsedModes.has(binding.time_contract.mode),
    'TRACE_0D_DECISION_TIME_CONTRACT',
    `${binding.execution_binding_id} neither owns exact elapsed nor explicitly defers elapsed to its bound activity`
  );
}
requireCondition(exactSet([...seenDecisionPairs], [...expectedDecisionPairs]), 'TRACE_0D_DECISION_EXECUTION_PAIR', 'not every closed NPC option has one exact execution binding');
const ratshaAttackExecution = decisionExecutionMap.get('trace_ld_v1_decision_execution_ratsha_attack_escape');
const ratshaEscapeExecution = decisionExecutionMap.get('trace_ld_v1_decision_execution_ratsha_continue_escape');
const ratshaAttackActivity = activityMap.get('trace_ld_v1_activity_ratsha_attack_and_escape_attempt');
const ratshaEscapeOption = npcMap.get('trace_ld_v1_npc_ratsha_decisions')?.option_set?.find(
  ({ option_id }) => option_id === 'continue_escape_after_resolved_attack'
);
const ratshaEscapePostResponseFacts = [
  'ratsha_defend_in_place_response_committed',
  'ratsha_nonlethal_hold_failed_committed',
  'player_break_contact_to_shed_approach_committed',
  'player_break_contact_position_unchanged_committed'
];
requireCondition(
  exactSet(ratshaAttackExecution?.activity_profile_refs, ['trace_ld_v1_activity_ratsha_attack_and_escape_attempt'])
    && exactSet(ratshaAttackExecution?.movement_refs, [])
    && ratshaAttackExecution?.execution_kind === 'attack_attempt_then_mandatory_player_boundary'
    && ratshaAttackExecution?.time_contract?.mode === 'single_activity_root_then_stop'
    && ratshaAttackExecution.time_contract.roots?.[0]?.time_profile_ref === 'trace_ld_v1_time_2m'
    && ratshaAttackExecution.time_contract.roots?.length === 1
    && ratshaAttackExecution?.mandatory_stop_after_activity === 'ratsha_attack_player_response_required'
    && ratshaAttackExecution?.movement_before_attack_resolution_and_player_response === 'forbidden'
    && exactSet(ratshaAttackExecution?.consequence_refs, ['trace_ld_v1_consequence_ratsha_attack_escape_attempt'])
    && exactSet(consequenceMap.get('trace_ld_v1_consequence_ratsha_attack_escape_attempt')?.committed_fact_outputs, ['ratsha_attack_attempt_committed', 'ratsha_attack_player_response_required'])
    && exactSet(ratshaAttackActivity?.consequence_refs, ['trace_ld_v1_consequence_ratsha_attack_escape_attempt'])
    && ratshaAttackActivity?.completion_boundary === 'attack_attempt_committed_and_player_response_required'
    && ratshaAttackActivity?.followup_escape_admission?.same_command_route_admission === 'forbidden'
    && ratshaAttackActivity?.followup_escape_admission?.requires_committed_attack_resolution === 'ratsha_attack_outcome_resolved'
    && ratshaAttackActivity?.followup_escape_admission?.attack_resolution_owner_contract_ref === 'atomic_conflict_resolution'
    && ratshaAttackActivity?.followup_escape_admission?.requires_new_player_action_commit === 'ratsha_attack_player_response_committed'
    && ratshaAttackActivity?.followup_escape_admission?.requires_player_response_contract_ref === ratshaPlayerResponse.contract_id
    && ratshaAttackActivity?.followup_escape_admission?.required_order?.join('|') === [
      'ratsha_attack_attempt_committed',
      'ratsha_attack_player_response_committed',
      'ratsha_attack_outcome_resolved'
    ].join('|')
    && exactSet(
      ratshaAttackActivity?.followup_escape_admission?.requires_post_response_fact_any_of,
      ratshaEscapePostResponseFacts
    )
    && exactSet(
      ratshaAttackActivity?.followup_escape_admission?.forbidden_post_response_facts,
      ['ratsha_temporary_restraint_committed']
    )
    && ratshaAttackActivity?.followup_escape_admission?.player_decision_boundary_owner === '@rus/turn'
    && ratshaAttackActivity?.followup_escape_admission?.requires_new_npc_decision_option_id === 'continue_escape_after_resolved_attack'
    && ratshaAttackExecution?.forbidden_write_targets?.includes('automatic_harm')
    && ratshaAttackExecution?.forbidden_write_targets?.includes('automatic_escape')
    && exactSet(ratshaEscapeExecution?.activity_profile_refs, [])
    && exactSet(ratshaEscapeExecution?.movement_refs, ['trace_ld_v1_route_shed_to_camp'])
    && ratshaEscapeExecution?.execution_kind === 'post_player_boundary_route_attempt'
    && ratshaEscapeExecution?.time_contract?.mode === 'single_route_root_after_new_npc_decision'
    && ratshaEscapeExecution?.time_contract?.roots?.[0]?.time_profile_ref === 'trace_ld_v1_time_12m'
    && exactSet(ratshaEscapeExecution?.required_committed_facts, ['ratsha_attack_attempt_committed', 'ratsha_attack_outcome_resolved', 'ratsha_attack_player_response_committed'])
    && exactSet(ratshaEscapeExecution?.required_any_of_committed_facts, ratshaEscapePostResponseFacts)
    && exactSet(ratshaEscapeExecution?.none_of_committed_facts, ['ratsha_temporary_restraint_committed'])
    && exactSet(ratshaEscapeOption?.required_any_of_committed_facts, ratshaEscapePostResponseFacts)
    && exactSet(ratshaEscapeOption?.none_of_committed_facts, ['ratsha_temporary_restraint_committed'])
    && !ratshaEscapeOption?.preconditions?.includes('not_restrained'),
  'TRACE_0D_RATSHA_ATTACK_EXECUTION',
  'Ratsha attack must stop at a player boundary before a separate resolved escape decision'
);
for (const id of [
  'trace_ld_v1_decision_execution_ratsha_surrender_without_confession',
  'trace_ld_v1_decision_execution_ratsha_surrender_and_confess'
]) {
  const binding = decisionExecutionMap.get(id);
  requireCondition(
    exactSet(binding?.consequence_refs, ['trace_ld_v1_consequence_ratsha_surrender_committed'])
      && exactSet(binding?.property_transition_refs, ['trace_ld_v1_property_ratsha_knife_surrendered_to_participating_fisher'])
      && exactSet(
        consequenceMap.get('trace_ld_v1_consequence_ratsha_surrender_committed')?.committed_fact_outputs,
        ['ratsha_surrender_without_further_harm_committed']
      )
      && binding?.write_targets?.includes('surrender_fact')
      && binding?.write_targets?.includes('weapon_control_transition'),
    'TRACE_0D_RATSHA_SURRENDER_EXECUTION',
    `${id} lacks surrender and exact knife-control effects`
  );
}
const zhdankoFleeExecution = decisionExecutionMap.get('trace_ld_v1_decision_execution_zhdanko_flee_without_weapon');
requireCondition(
  exactSet(zhdankoFleeExecution?.activity_profile_refs, ['trace_ld_v1_activity_zhdanko_attempt_departure'])
    && exactSet(zhdankoFleeExecution?.movement_refs, ['trace_ld_v1_scope_exit_storehouse_by_small_boat'])
    && zhdankoFleeExecution?.time_contract?.root_ref === 'trace_ld_v1_scope_exit_storehouse_by_small_boat'
    && zhdankoFleeExecution?.time_contract?.time_profile_ref === 'trace_ld_v1_time_15m'
    && exactSet(zhdankoFleeExecution?.consequence_refs, ['trace_ld_v1_consequence_zhdanko_departed']),
  'TRACE_0D_ZHDANKO_FLEE_EXECUTION',
  'Zhdanko flee option lacks exact scope-exit execution semantics'
);
const zhdankoSubmitExecution = decisionExecutionMap.get('trace_ld_v1_decision_execution_zhdanko_deny_submit');
requireCondition(
  exactSet(zhdankoSubmitExecution?.consequence_refs, ['trace_ld_v1_consequence_zhdanko_submission_committed'])
    && exactSet(zhdankoSubmitExecution?.property_transition_refs, ['trace_ld_v1_property_zhdanko_axe_submitted_to_eremey'])
    && exactSet(
      consequenceMap.get('trace_ld_v1_consequence_zhdanko_submission_committed')?.committed_fact_outputs,
      ['zhdanko_submission_committed', 'zhdanko_voluntary_bag_handover_committed']
    )
    && zhdankoSubmitExecution?.statement_effect_contract_ref === 'trace_ld_v1_statement_effect_zhdanko_denial'
    && exactSet(
      zhdankoSubmitExecution?.ordered_atomic_effects,
      ['commit_denial_as_assertion_not_truth', 'commit_submission', 'commit_voluntary_bag_handover_admission', 'transfer_axe_control']
    )
    && zhdankoSubmitExecution?.write_targets?.includes('zhdanko_voluntary_bag_handover_committed')
    && zhdankoSubmitExecution?.write_targets?.includes('weapon_control_transition'),
  'TRACE_0D_ZHDANKO_SUBMIT_EXECUTION',
  'Zhdanko submission lacks exact denial, submission, voluntary bag handover admission, or axe-control effects'
);
const zhdankoResistExecution = decisionExecutionMap.get('trace_ld_v1_decision_execution_zhdanko_resist_with_axe');
requireCondition(
  exactSet(zhdankoResistExecution?.activity_profile_refs, ['trace_ld_v1_activity_zhdanko_resist_with_axe'])
    && zhdankoResistExecution?.time_contract?.time_profile_ref === 'trace_ld_v1_time_2m'
    && exactSet(zhdankoResistExecution?.consequence_refs, ['trace_ld_v1_consequence_zhdanko_resistance_threat_committed'])
    && zhdankoResistExecution?.forbidden_write_targets?.includes('automatic_harm')
    && zhdankoResistExecution?.forbidden_write_targets?.includes('automatic_disarm'),
  'TRACE_0D_ZHDANKO_RESIST_EXECUTION',
  'Zhdanko resistance must commit a threat and stop before player-owned danger resolution'
);
for (const fisherNumber of [1, 2]) {
  const prefix = `trace_ld_v1_decision_execution_fisher_${fisherNumber}`;
  requireCondition(
    decisionExecutionMap.get(`${prefix}_carry`)?.activity_profile_refs?.includes('trace_ld_v1_activity_make_stretcher_and_carry')
      && decisionExecutionMap.get(`${prefix}_carry`)?.movement_refs?.includes('trace_ld_v1_route_shed_to_camp_carry_onisim')
      && decisionExecutionMap.get(`${prefix}_guard_hold`)?.activity_profile_refs?.includes('trace_ld_v1_activity_danger_resolution')
      && exactSet(decisionExecutionMap.get(`${prefix}_guard_hold`)?.property_transition_refs, [])
      && exactSet(decisionExecutionMap.get(`${prefix}_guard_hold`)?.consequence_refs, [])
      && decisionExecutionMap.get(`${prefix}_escort`)?.movement_refs?.includes('trace_ld_v1_route_storehouse_to_camp_guarded_return'),
    'TRACE_0D_FISHER_EXECUTION',
    `background fisher ${fisherNumber} lacks exact carry, guard/hold, or escort bindings`
  );
}
const ratshaOptions = npcMap.get('trace_ld_v1_npc_ratsha_decisions').option_set.map(({ option_id }) => option_id);
requireCondition(exactSet(ratshaOptions, ['attack_and_escape', 'continue_escape_after_resolved_attack', 'threaten_and_bargain', 'surrender_without_confession', 'surrender_and_confess']), 'TRACE_0D_RATSHA_OPTIONS', 'Ratsha closed option set is invalid');
const zhdankoOptions = npcMap.get('trace_ld_v1_npc_zhdanko_decisions').option_set.map(({ option_id }) => option_id);
requireCondition(exactSet(zhdankoOptions, ['deny_and_submit', 'deny_and_delay', 'bargain', 'flee_without_weapon', 'resist_with_axe']), 'TRACE_0D_ZHDANKO_OPTIONS', 'Zhdanko closed option set is invalid');
const scheduleMap = mapUnique(npc.schedule_policies, 'schedule_policy_id', 'TRACE_0D_SCHEDULE');
const schedule = scheduleMap.get('trace_ld_v1_zhdanko_autonomous_schedule');
requireCondition(schedule?.may_leave_initial_location_without_player === true && schedule.option_set.length === 8, 'TRACE_0D_ZHDANKO_SCHEDULE', 'Zhdanko schedule is not autonomous/complete');
requireCondition(schedule.schema === 'rus.trace_npc_schedule_policy.v1' && schedule.version === 1 && schedule.actor_slot === 'zhdanko_storehouse_controller' && schedule.decision_inputs.length === 11 && schedule.boundary_policy === 'reconsider_at_earliest_time_body_route_or_perception_boundary' && schedule.no_valid_option_failure === 'typed_npc_no_valid_option', 'TRACE_0D_ZHDANKO_SCHEDULE', 'Zhdanko schedule contract incomplete');
requireCondition(exactSet(schedule.forbidden_inputs, ['scene_number', 'turn_number', 'player_progress_flag']), 'TRACE_0D_SCENE_TIMER', 'schedule does not explicitly reject scene/turn progression');
const expectedScheduleOptions = ['wait', 'check_ratsha_return', 'move_bag', 'prepare_boat', 'attempt_departure', 'hide_property', 'attempt_document_destruction', 'respond_to_arriving_group'];
requireCondition(exactSet(schedule.option_set.map(({ option_id }) => option_id), expectedScheduleOptions), 'TRACE_0D_SCHEDULE_OPTION_SET', 'schedule option set is incomplete or unknown');
const destructionScheduleOption = schedule.option_set.find(({ option_id }) => option_id === 'attempt_document_destruction');
requireCondition(
  exactSet(
    destructionScheduleOption?.preconditions,
    ['road_bag_controlled_and_openable', 'packet_contained_in_road_bag', 'destruction_means_available', 'no_interrupting_witness_prevents_action']
  ),
  'TRACE_0D_DOCUMENT_DESTRUCTION_PRECONDITION',
  'document destruction must begin from an openable tied bag, not assume packet accessibility'
);

const scheduleResourceMap = mapUnique(npc.schedule_resource_bindings, 'resource_binding_id', 'TRACE_0D_SCHEDULE_RESOURCE');
const expectedScheduleResources = Object.freeze({
  trace_ld_v1_schedule_resource_road_bag: 'trace_ld_v1_container_road_bag',
  trace_ld_v1_schedule_resource_sealed_packet: 'trace_ld_v1_item_sealed_packet',
  trace_ld_v1_schedule_resource_second_small_boat: 'trace_ld_v1_item_second_small_boat',
  trace_ld_v1_schedule_resource_document_destruction_means: 'trace_ld_v1_item_zhdanko_axe'
});
requireCondition(exactSet([...scheduleResourceMap.keys()], Object.keys(expectedScheduleResources)), 'TRACE_0D_SCHEDULE_RESOURCE_SET', 'schedule resource binding set is incomplete or unknown');
for (const [bindingId, itemRef] of Object.entries(expectedScheduleResources)) {
  const binding = scheduleResourceMap.get(bindingId);
  requireCondition(
    binding?.item_ref === itemRef
      && itemText.includes(itemRef)
      && binding?.opening_location_ref === 'trace_ld_v1_loc_zhdanko_storehouse'
      && text(binding?.opening_zone_ref)
      && binding?.materialized_instance_required === true,
    'TRACE_0D_SCHEDULE_RESOURCE',
    `${bindingId} is not exact or materialized`
  );
}
const roadBagResource = scheduleResourceMap.get('trace_ld_v1_schedule_resource_road_bag');
const packetResource = scheduleResourceMap.get('trace_ld_v1_schedule_resource_sealed_packet');
const boatResource = scheduleResourceMap.get('trace_ld_v1_schedule_resource_second_small_boat');
requireCondition(
  roadBagResource?.opening_state_source_ref === 'trace_ld_v1_opening_state_stolen_road_bag'
    && roadBagResource?.opening_zone_ref === 'storehouse_interior'
    && roadBagResource?.opening_closure_state === 'tied'
    && roadBagResource?.contents_require_open_container === true
    && exactSet(roadBagResource?.allowed_zone_refs, ['storehouse_interior', 'yard', 'river_access'])
    && roadBagResource?.owner_ref === 'trace_ld_v1_external_owner_savva_tverdich'
    && roadBagResource?.holder_ref === 'zhdanko_storehouse_controller'
    && roadBagResource?.controller_ref === 'zhdanko_storehouse_controller',
  'TRACE_0D_SCHEDULE_BAG_RESOURCE',
  'road bag opening property/zone binding is incomplete'
);
requireCondition(
  packetResource?.opening_state_source_ref === 'trace_ld_v1_opening_state_stolen_road_bag'
    && packetResource?.physical_parent_ref === 'trace_ld_v1_container_road_bag'
    && packetResource?.physical_position_rule === 'inherit_parent_container_position'
    && packetResource?.physical_access_rule === 'requires_committed_open_container_transition'
    && packetResource?.holder_rule === 'inherit_parent_container_holder'
    && packetResource?.controller_rule === 'inherit_parent_container_controller'
    && packetResource?.owner_rule === 'preserve_item_owner',
  'TRACE_0D_SCHEDULE_PACKET_RESOURCE',
  'sealed packet does not inherit the exact road bag physical/property state'
);
requireCondition(
  boatResource?.opening_zone_ref === 'river_access'
    && boatResource?.opening_operational_state === 'available'
    && exactSet(boatResource?.allowed_zone_refs, ['river_access'])
    && boatResource?.owner_ref === 'zhdanko_storehouse_controller'
    && boatResource?.holder_ref === 'zhdanko_storehouse_controller'
    && boatResource?.controller_ref === 'zhdanko_storehouse_controller',
  'TRACE_0D_SCHEDULE_BOAT_RESOURCE',
  'second boat opening state is incomplete'
);

const expectedPropertyTransitions = [
  'trace_ld_v1_property_bag_to_river_access',
  'trace_ld_v1_property_boat_prepared',
  'trace_ld_v1_property_zhdanko_depart_leaving_bag',
  'trace_ld_v1_property_zhdanko_depart_with_bag',
  'trace_ld_v1_property_bag_concealed_in_storehouse',
  'trace_ld_v1_property_ratsha_knife_surrendered_to_participating_fisher',
  'trace_ld_v1_property_zhdanko_axe_submitted_to_eremey',
  'trace_ld_v1_property_zhdanko_axe_disarmed_to_eremey',
  'trace_ld_v1_property_road_bag_recovered_to_player_control',
  'trace_ld_v1_property_road_bag_opened_for_access',
  'trace_ld_v1_property_packet_recovered_to_player',
  'trace_ld_v1_property_destroyed_packet_recovered_to_player',
  'trace_ld_v1_property_road_bag_assigned_to_participating_fisher',
  'trace_ld_v1_property_packet_destroyed'
];
requireCondition(exactSet([...propertyTransitionMap.keys()], expectedPropertyTransitions), 'TRACE_0D_PROPERTY_TRANSITION_SET', 'property transition set is incomplete or unknown');
for (const transition of propertyTransitionMap.values()) {
  requireCondition(
    transition.schema === 'rus.items_property.approved_transition_profile.v1'
      && transition.version === 1
      && transition.owner === '@rus/items-property'
      && transition.runtime_transition_execution === 'deferred_to_first_use_integration'
      && !Object.hasOwn(transition, 'runtime_handler_ref')
      && itemText.includes(transition.subject_ref)
      && transition.owner_change === 'forbidden'
      && text(transition.typed_failure)
      && unique(transition.write_targets)
      && (Object.keys(transition.requires ?? {}).length > 0
        || (Array.isArray(transition.admission_variants)
          && transition.admission_variants.length > 0
          && Object.keys(transition.requires_common ?? {}).length > 0))
      && Object.keys(transition.writes ?? {}).length > 0,
    'TRACE_0D_PROPERTY_TRANSITION',
    `${transition.transition_profile_id} is incomplete`
  );
}
const moveBagProperty = propertyTransitionMap.get('trace_ld_v1_property_bag_to_river_access');
const departWithoutBagProperty = propertyTransitionMap.get('trace_ld_v1_property_zhdanko_depart_leaving_bag');
const departWithBagProperty = propertyTransitionMap.get('trace_ld_v1_property_zhdanko_depart_with_bag');
const hideBagProperty = propertyTransitionMap.get('trace_ld_v1_property_bag_concealed_in_storehouse');
const ratshaKnifeSurrenderProperty = propertyTransitionMap.get('trace_ld_v1_property_ratsha_knife_surrendered_to_participating_fisher');
const zhdankoAxeSubmitProperty = propertyTransitionMap.get('trace_ld_v1_property_zhdanko_axe_submitted_to_eremey');
const zhdankoAxeDisarmProperty = propertyTransitionMap.get('trace_ld_v1_property_zhdanko_axe_disarmed_to_eremey');
const recoverBagProperty = propertyTransitionMap.get('trace_ld_v1_property_road_bag_recovered_to_player_control');
const openBagProperty = propertyTransitionMap.get('trace_ld_v1_property_road_bag_opened_for_access');
const recoverPacketProperty = propertyTransitionMap.get('trace_ld_v1_property_packet_recovered_to_player');
const recoverDestroyedPacketProperty = propertyTransitionMap.get('trace_ld_v1_property_destroyed_packet_recovered_to_player');
const assignBagToFisherProperty = propertyTransitionMap.get('trace_ld_v1_property_road_bag_assigned_to_participating_fisher');
const destroyPacketProperty = propertyTransitionMap.get('trace_ld_v1_property_packet_destroyed');
requireCondition(
  moveBagProperty?.requires?.zone_ref === 'storehouse_interior'
    && moveBagProperty?.writes?.zone_ref === 'river_access'
    && moveBagProperty?.contained_item_effect === 'inherit_parent_container_position_holder_and_controller',
  'TRACE_0D_BAG_MOVE_TRANSITION',
  'bag move does not place the container and its contents at river access'
);
requireCondition(
  exactSet(departWithoutBagProperty?.requires?.zone_ref_candidates, ['storehouse_interior', 'yard', 'river_access'])
    && departWithoutBagProperty?.writes?.position_transition === 'preserve_committed_location_and_zone'
    && departWithoutBagProperty?.writes?.holder_ref === null
    && departWithoutBagProperty?.writes?.controller_ref === null
    && departWithoutBagProperty?.writes?.committed_fact === 'road_bag_abandoned_at_committed_storehouse_zone'
    && departWithoutBagProperty?.write_targets?.includes('road_bag_abandoned_fact')
    && departWithoutBagProperty?.contained_item_effect === 'inherit_parent_container_position_holder_and_controller',
  'TRACE_0D_DEPART_WITHOUT_BAG',
  'departure without bag does not preserve bag position and release physical control'
);
requireCondition(
  departWithBagProperty?.requires?.zone_ref === 'river_access'
    && departWithBagProperty?.writes?.scope_state === 'outside_active_scenario_scope'
    && departWithBagProperty?.writes?.location_ref === null
    && departWithBagProperty?.contained_item_effect === 'inherit_parent_container_scope_position_holder_and_controller',
  'TRACE_0D_DEPART_WITH_BAG',
  'departure with bag does not move container contents into the same typed outside-scope state'
);
requireCondition(
  hideBagProperty?.writes?.visibility_state === 'concealed_requires_search'
    && hideBagProperty?.writes?.location_ref === 'trace_ld_v1_loc_zhdanko_storehouse'
    && hideBagProperty?.writes?.zone_ref === 'storehouse_interior',
  'TRACE_0D_HIDE_PROPERTY',
  'property concealment invents or omits its approved location/zone'
);
requireCondition(
  ratshaKnifeSurrenderProperty?.subject_ref === 'trace_ld_v1_item_ratsha_knife'
    && ratshaKnifeSurrenderProperty?.requires?.holder_ref === 'ratsha_storehouse_helper'
    && ratshaKnifeSurrenderProperty?.requires?.controller_ref === 'ratsha_storehouse_helper'
    && ratshaKnifeSurrenderProperty?.requires?.admission_fact === 'ratsha_surrender_without_further_harm_committed'
    && ratshaKnifeSurrenderProperty?.writes?.holder_ref === 'trace_ld_v1_audience_slot_participating_fisher'
    && ratshaKnifeSurrenderProperty?.writes?.controller_ref === 'trace_ld_v1_audience_slot_participating_fisher',
  'TRACE_0D_RATSHA_WEAPON_TRANSITION',
  'Ratsha surrender does not transfer knife control to the bound participating fisher'
);
requireCondition(
  zhdankoAxeSubmitProperty?.requires?.admission_fact === 'zhdanko_submission_committed'
    && zhdankoAxeSubmitProperty?.writes?.holder_ref === 'eremey_fisher'
    && zhdankoAxeSubmitProperty?.writes?.controller_ref === 'eremey_fisher'
    && zhdankoAxeDisarmProperty?.requires?.admission_fact === 'bounded_group_disarm_transition_admitted'
    && exactSet(zhdankoAxeDisarmProperty?.committed_fact_outputs, ['axe_control_removed_from_zhdanko'])
    && zhdankoAxeDisarmProperty?.writes?.holder_ref === 'eremey_fisher'
    && zhdankoAxeDisarmProperty?.writes?.controller_ref === 'eremey_fisher',
  'TRACE_0D_ZHDANKO_WEAPON_TRANSITION',
  'Zhdanko submit/disarm branches do not transfer axe control to Eremey'
);
const bagRecoveryVariantMap = mapUnique(recoverBagProperty?.admission_variants, 'variant_id', 'TRACE_0D_BAG_RECOVERY_VARIANT');
requireCondition(
  exactSet(
    [...bagRecoveryVariantMap.keys()],
    ['recovery_after_zhdanko_submission', 'recovery_after_zhdanko_disarm', 'voluntary_handover', 'bounded_group_recovery', 'recovery_after_departure_with_bag_left']
  )
    && recoverBagProperty?.subject_ref === 'trace_ld_v1_container_road_bag'
    && recoverBagProperty?.requires_common?.owner_ref === 'trace_ld_v1_external_owner_savva_tverdich'
    && recoverBagProperty?.requires_common?.location_ref === 'trace_ld_v1_loc_zhdanko_storehouse'
    && recoverBagProperty?.requires_common?.physical_access_rule === 'player_and_bag_share_committed_accessible_zone'
    && recoverBagProperty?.writes?.holder_ref === 'player_clerk'
    && recoverBagProperty?.writes?.controller_ref === 'player_clerk'
    && recoverBagProperty?.owner_change === 'forbidden'
    && recoverBagProperty?.contained_item_effect === 'inherit_parent_container_position_holder_and_controller_while_preserving_each_item_owner'
    && recoverBagProperty?.variant_selection_policy === 'select_exactly_one_variant_from_committed_facts_and_source_state'
    && recoverBagProperty?.typed_failure === 'typed_road_bag_recovery_precondition_failed',
  'TRACE_0D_BAG_RECOVERY_TRANSITION',
  'road bag recovery lacks exact source variants, Savva ownership, player control, inheritance, or typed failure'
);
requireCondition(
  bagRecoveryVariantMap.get('recovery_after_zhdanko_submission')?.requires_committed_fact === 'road_bag_recovery_after_zhdanko_submission_admitted'
    && bagRecoveryVariantMap.get('recovery_after_zhdanko_disarm')?.requires_committed_fact === 'road_bag_recovery_after_zhdanko_disarm_admitted'
    && bagRecoveryVariantMap.get('voluntary_handover')?.requires_committed_fact === 'road_bag_voluntary_handover_acceptance_admitted'
    && bagRecoveryVariantMap.get('bounded_group_recovery')?.requires_committed_fact === 'road_bag_bounded_group_recovery_admitted'
    && bagRecoveryVariantMap.get('recovery_after_departure_with_bag_left')?.requires_committed_fact === 'road_bag_recovery_after_zhdanko_departure_admitted'
    && ['recovery_after_zhdanko_submission', 'recovery_after_zhdanko_disarm', 'voluntary_handover', 'bounded_group_recovery'].every((variantId) => {
      const variant = bagRecoveryVariantMap.get(variantId);
      return variant?.source_holder_ref === 'zhdanko_storehouse_controller'
        && variant?.source_controller_ref === 'zhdanko_storehouse_controller';
    })
    && bagRecoveryVariantMap.get('recovery_after_departure_with_bag_left')?.source_holder_ref === null
    && bagRecoveryVariantMap.get('recovery_after_departure_with_bag_left')?.source_controller_ref === null,
  'TRACE_0D_BAG_RECOVERY_BASIS',
  'road bag recovery admission bases are incomplete or permit proximity-only recovery'
);
requireCondition(
  exactSet(openBagProperty?.bound_actor_slots, ['player_clerk', 'zhdanko_storehouse_controller'])
    && openBagProperty?.time_profile_ref === 'trace_ld_v1_time_2m'
    && openBagProperty?.duration_minutes === 2
    && openBagProperty?.elapsed_accounting?.role === 'included_child_interval'
    && openBagProperty?.elapsed_accounting?.clock_write === 'forbidden'
    && openBagProperty?.elapsed_accounting?.duration_accounting === 'included_in_parent_root_total_never_additive'
    && openBagProperty?.interruption_boundary === 'container_open_transition_boundary'
    && openBagProperty?.partial_progress_policy === 'no_content_access_before_open_transition_commit'
    && openBagProperty?.requires?.closure_state === 'tied'
    && openBagProperty?.requires?.contents_require_open_container === true
    && openBagProperty?.requires?.holder_ref_rule === 'bound_actor_is_committed_holder'
    && openBagProperty?.requires?.controller_ref_rule === 'bound_actor_is_committed_controller'
    && openBagProperty?.writes?.closure_state === 'open'
    && openBagProperty?.writes?.content_access_state === 'physically_accessible_to_bound_controller'
    && openBagProperty?.holder_change === 'forbidden'
    && openBagProperty?.controller_change === 'forbidden'
    && openBagProperty?.container_relation_change === 'forbidden'
    && openBagProperty?.contained_item_effect === 'preserve_parent_relation_position_owner_holder_and_controller',
  'TRACE_0D_BAG_OPEN_TRANSITION',
  'road bag lacks one approved open transition shared by player and NPC access paths'
);
const roadBagTemplate = itemSource.container_templates?.find(
  ({ container_template_id }) => container_template_id === 'trace_ld_v1_container_road_bag'
);
requireCondition(
  roadBagTemplate?.accessibility_contract?.closure_state === 'tied'
    && roadBagTemplate?.accessibility_contract?.contents_require_open_container === true,
  'TRACE_0D_BAG_OPENING_STATE',
  'phase 0C opening state does not require the approved road-bag open transition'
);
requireCondition(
  destroyPacketProperty?.requires?.physical_parent_ref === 'trace_ld_v1_container_road_bag'
    && destroyPacketProperty?.requires?.parent_closure_state === 'open'
    && destroyPacketProperty?.requires?.access_state === 'physically_accessible_to_bound_controller'
    && destroyPacketProperty?.requires?.access_transition_ref === 'trace_ld_v1_property_road_bag_opened_for_access'
    && destroyPacketProperty?.requires?.destruction_means_ref === 'trace_ld_v1_item_zhdanko_axe'
    && destroyPacketProperty?.writes?.seal_state === 'destroyed'
    && destroyPacketProperty?.writes?.document_condition === 'destroyed_unreadable'
    && destroyPacketProperty?.container_relation_change === 'forbidden',
  'TRACE_0D_DOCUMENT_DESTRUCTION',
  'document destruction lacks exact packet, means, seal, condition, or container contract'
);
const intactPacketReturnedConsequence = consequenceMap.get('trace_ld_v1_consequence_intact_packet_returned_and_seal_observed');
const documentDestroyedConsequence = consequenceMap.get('trace_ld_v1_consequence_zhdanko_document_destroyed');
const destroyedPacketObservationConsequence = consequenceMap.get('trace_ld_v1_consequence_destroyed_packet_state_observed');
requireCondition(
  intactPacketReturnedConsequence?.required_property_transition_ref === 'trace_ld_v1_property_packet_recovered_to_player'
    && intactPacketReturnedConsequence?.committed_property_state_projection?.source_transition_ref === 'trace_ld_v1_property_packet_recovered_to_player'
    && intactPacketReturnedConsequence?.committed_property_state_projection?.requires_committed_state?.physical_parent_ref === null
    && intactPacketReturnedConsequence?.committed_property_state_projection?.requires_committed_state?.holder_ref === 'player_clerk'
    && intactPacketReturnedConsequence?.committed_property_state_projection?.requires_committed_state?.controller_ref === 'player_clerk'
    && intactPacketReturnedConsequence?.committed_property_state_projection?.requires_committed_state?.seal_state === 'intact'
    && exactSet(intactPacketReturnedConsequence?.committed_property_state_projection?.committed_fact_outputs, ['sealed_packet_returned', 'seal_intact'])
    && exactSet(intactPacketReturnedConsequence?.committed_fact_outputs, ['sealed_packet_returned', 'seal_intact'])
    && intactPacketReturnedConsequence?.committed_property_state_projection?.commit_boundary === 'only_after_source_property_transition_and_player_observation_commit'
    && intactPacketReturnedConsequence?.committed_property_state_projection?.visibility_class === 'player_observed_committed_fact'
    && intactPacketReturnedConsequence?.committed_property_state_projection?.missing_or_mismatched_source_state === 'typed_property_state_projection_not_admitted',
  'TRACE_0D_INTACT_PACKET_PROJECTION',
  'intact packet recovery lacks exact returned/seal completion facts at the observed commit boundary'
);
requireCondition(
  documentDestroyedConsequence?.required_property_transition_ref === 'trace_ld_v1_property_packet_destroyed'
    && documentDestroyedConsequence?.committed_property_state_projection?.source_transition_ref === 'trace_ld_v1_property_packet_destroyed'
    && documentDestroyedConsequence?.committed_property_state_projection?.requires_committed_state?.seal_state === 'destroyed'
    && documentDestroyedConsequence?.committed_property_state_projection?.requires_committed_state?.document_condition === 'destroyed_unreadable'
    && documentDestroyedConsequence?.committed_property_state_projection?.requires_committed_state?.evidence_availability === 'destroyed'
    && exactSet(documentDestroyedConsequence?.committed_property_state_projection?.committed_fact_outputs, ['packet_lost_or_destroyed', 'seal_damaged'])
    && exactSet(documentDestroyedConsequence?.committed_fact_outputs, ['packet_lost_or_destroyed', 'seal_damaged'])
    && documentDestroyedConsequence?.committed_property_state_projection?.commit_boundary === 'only_after_source_property_transition_commit'
    && documentDestroyedConsequence?.committed_property_state_projection?.missing_or_mismatched_source_state === 'typed_property_state_projection_not_admitted'
    && destroyedPacketObservationConsequence?.required_property_transition_ref === 'trace_ld_v1_property_destroyed_packet_recovered_to_player'
    && exactSet(destroyedPacketObservationConsequence?.committed_fact_outputs, ['destroyed_packet_state_observed', 'destroyed_seal_state_observed']),
  'TRACE_0D_DESTROYED_PACKET_PROJECTION',
  'destroyed packet state lacks exact objective completion projection or later observation consequence'
);
const bagInspectionActivity = activityMap.get('trace_ld_v1_activity_check_bag_and_seal');
const bagRecoveryAdmission = bagInspectionActivity?.recovery_admission_contract;
const bagRecoveryMethodMap = mapUnique(
  bagRecoveryAdmission?.method_variants,
  'method_id',
  'TRACE_0D_BAG_RECOVERY_METHOD'
);
const bagExecutionVariantMap = mapUnique(
  bagInspectionActivity?.execution_variant_contract?.closed_variants,
  'variant_id',
  'TRACE_0D_PLAYER_BAG_STATE_VARIANT'
);
const intactBagInspectionVariant = bagExecutionVariantMap.get('tied_bag_intact_packet');
const destroyedBagInspectionVariant = bagExecutionVariantMap.get('open_bag_destroyed_packet');
const bagCarrierVariantMap = mapUnique(
  bagInspectionActivity?.post_inspection_carrier_contract?.closed_variants,
  'variant_id',
  'TRACE_0D_BAG_CARRIER_VARIANT'
);
requireCondition(
  bagInspectionActivity?.execution_variant_contract?.selector === 'exact_committed_container_and_packet_state'
    && bagInspectionActivity?.execution_variant_contract?.variant_selection_policy === 'select_exactly_one_matching_committed_state_variant_or_fail_closed'
    && bagInspectionActivity?.execution_variant_contract?.typed_failure === 'typed_bag_packet_state_variant_not_admitted'
    && exactSet([...bagExecutionVariantMap.keys()], ['tied_bag_intact_packet', 'open_bag_destroyed_packet'])
    && exactSet(Object.entries(intactBagInspectionVariant?.requires_committed_state ?? {}).map(([key, value]) => `${key}:${value}`), ['bag_closure_state:tied', 'packet_seal_state:intact'])
    && intactBagInspectionVariant?.duration_minutes === 5
    && intactBagInspectionVariant?.time_profile_ref === 'trace_ld_v1_time_5m'
    && intactBagInspectionVariant?.ordered_transition_stages?.length === 3
    && intactBagInspectionVariant.ordered_transition_stages[0]?.property_transition_ref === 'trace_ld_v1_property_road_bag_recovered_to_player_control'
    && intactBagInspectionVariant.ordered_transition_stages[0]?.duration_minutes === 2
    && intactBagInspectionVariant.ordered_transition_stages[1]?.property_transition_ref === 'trace_ld_v1_property_road_bag_opened_for_access'
    && intactBagInspectionVariant.ordered_transition_stages[1]?.requires_committed_stage_id === 'recover_road_bag_control'
    && intactBagInspectionVariant.ordered_transition_stages[1]?.duration_minutes === 2
    && intactBagInspectionVariant.ordered_transition_stages[2]?.requires_committed_stage_id === 'untie_and_open_road_bag'
    && intactBagInspectionVariant.ordered_transition_stages[2]?.duration_minutes === 1
    && intactBagInspectionVariant.ordered_transition_stages[2]?.property_transition_ref === 'trace_ld_v1_property_packet_recovered_to_player'
    && intactBagInspectionVariant.ordered_transition_stages[2]?.consequence_ref === 'trace_ld_v1_consequence_intact_packet_returned_and_seal_observed'
    && exactSet(Object.entries(destroyedBagInspectionVariant?.requires_committed_state ?? {}).map(([key, value]) => `${key}:${value}`), [
      'bag_closure_state:open',
      'packet_seal_state:destroyed',
      'packet_document_condition:destroyed_unreadable',
      'packet_evidence_availability:destroyed'
    ])
    && destroyedBagInspectionVariant?.duration_minutes === 3
    && destroyedBagInspectionVariant?.time_profile_ref === 'trace_ld_v1_time_3m'
    && destroyedBagInspectionVariant?.ordered_transition_stages?.length === 2
    && destroyedBagInspectionVariant.ordered_transition_stages[0]?.property_transition_ref === 'trace_ld_v1_property_road_bag_recovered_to_player_control'
    && destroyedBagInspectionVariant.ordered_transition_stages[0]?.duration_minutes === 2
    && destroyedBagInspectionVariant.ordered_transition_stages[1]?.requires_committed_stage_id === 'recover_open_road_bag_control'
    && destroyedBagInspectionVariant.ordered_transition_stages[1]?.duration_minutes === 1
    && destroyedBagInspectionVariant.ordered_transition_stages[1]?.property_transition_ref === 'trace_ld_v1_property_destroyed_packet_recovered_to_player'
    && destroyedBagInspectionVariant.ordered_transition_stages[1]?.consequence_ref === 'trace_ld_v1_consequence_destroyed_packet_state_observed'
    && bagInspectionActivity.preconditions?.recovery_admission_contract_required === true
    && bagInspectionActivity?.post_inspection_carrier_contract?.selection === 'optional_exact_variant_id'
    && bagInspectionActivity?.post_inspection_carrier_contract?.inspection_completion_independent_of_carrier_assignment === true
    && bagInspectionActivity?.post_inspection_carrier_contract?.no_selection_effect === 'retain_committed_player_holder_and_controller'
    && bagInspectionActivity?.post_inspection_carrier_contract?.elapsed_accounting?.role === 'optional_atomic_effect_at_final_inspection_boundary'
    && bagInspectionActivity?.post_inspection_carrier_contract?.elapsed_accounting?.clock_write === 'forbidden'
    && bagInspectionActivity?.post_inspection_carrier_contract?.elapsed_accounting?.duration_accounting === 'included_in_selected_inspection_variant_total_never_additive'
    && bagInspectionActivity?.post_inspection_carrier_contract?.selected_unavailable_variant === 'typed_bag_carrier_variant_not_admitted'
    && exactSet([...bagCarrierVariantMap.keys()], ['assign_to_bound_participating_fisher'])
    && bagCarrierVariantMap.get('assign_to_bound_participating_fisher')?.requires_materialized_slot === 'trace_ld_v1_audience_slot_participating_fisher'
    && bagCarrierVariantMap.get('assign_to_bound_participating_fisher')?.property_transition_ref === 'trace_ld_v1_property_road_bag_assigned_to_participating_fisher',
  'TRACE_0D_PLAYER_BAG_OPEN_PATH',
  'player bag inspection lacks closed intact/destroyed paths or makes optional carrier assignment mandatory'
);
requireCondition(
  bagRecoveryAdmission?.owner === '@rus/turn'
    && bagRecoveryAdmission?.method_selector === 'exact_requested_recovery_method_id'
    && bagRecoveryAdmission?.method_selection_policy === 'select_exactly_requested_admitted_method_or_fail_closed'
    && bagRecoveryAdmission?.physical_proximity_alone_is_insufficient === true
    && bagRecoveryAdmission?.write_target === 'road_bag_recovery_admission_fact'
    && bagRecoveryAdmission?.typed_failure === 'typed_road_bag_recovery_method_not_admitted'
    && exactSet(
      [...bagRecoveryMethodMap.keys()],
      ['recover_after_zhdanko_submission', 'recover_after_zhdanko_disarm', 'accept_voluntary_handover', 'bounded_group_recovery', 'recover_after_zhdanko_fled_leaving_bag']
    ),
  'TRACE_0D_BAG_RECOVERY_METHOD',
  'road bag recovery method admission contract is incomplete or open-ended'
);
const expectedBagRecoveryMethods = Object.freeze({
  recover_after_zhdanko_submission: {
    facts: ['zhdanko_submission_committed'],
    participants: [],
    output: 'road_bag_recovery_after_zhdanko_submission_admitted',
    source: 'zhdanko_storehouse_controller'
  },
  recover_after_zhdanko_disarm: {
    facts: ['zhdanko_disarmed_and_temporarily_restrained'],
    participants: [],
    output: 'road_bag_recovery_after_zhdanko_disarm_admitted',
    source: 'zhdanko_storehouse_controller'
  },
  accept_voluntary_handover: {
    facts: ['zhdanko_voluntary_bag_handover_committed'],
    participants: [],
    output: 'road_bag_voluntary_handover_acceptance_admitted',
    source: 'zhdanko_storehouse_controller'
  },
  bounded_group_recovery: {
    facts: ['bounded_group_disarm_atomic_effect_committed', 'zhdanko_disarmed_and_temporarily_restrained'],
    participants: ['player_clerk', 'eremey_fisher', 'trace_ld_v1_audience_slot_participating_fisher'],
    output: 'road_bag_bounded_group_recovery_admitted',
    source: 'zhdanko_storehouse_controller'
  },
  recover_after_zhdanko_fled_leaving_bag: {
    facts: ['zhdanko_fled', 'road_bag_abandoned_at_committed_storehouse_zone'],
    participants: [],
    output: 'road_bag_recovery_after_zhdanko_departure_admitted',
    source: null
  }
});
for (const [methodId, expected] of Object.entries(expectedBagRecoveryMethods)) {
  const method = bagRecoveryMethodMap.get(methodId);
  requireCondition(
    exactSet(method?.requires_all_committed_facts, expected.facts)
      && exactSet(method?.requires_participant_slots ?? [], expected.participants)
      && method?.commits_admission_fact === expected.output
      && method?.requires_source_holder_ref === expected.source
      && method?.requires_source_controller_ref === expected.source,
    'TRACE_0D_BAG_RECOVERY_METHOD',
    `${methodId} has incomplete or invented admission inputs`
  );
}
const boundedGroupRecoveryMethod = bagRecoveryMethodMap.get('bounded_group_recovery');
const boundedGroupPropertyPredicates = boundedGroupRecoveryMethod?.requires_committed_property_predicates ?? [];
const boundedGroupPropertyPredicate = boundedGroupPropertyPredicates[0];
requireCondition(
  exactSet(
    consequenceMap.get('trace_ld_v1_consequence_bounded_group_disarm_committed')?.committed_fact_outputs,
    boundedGroupRecoveryMethod?.requires_all_committed_facts
  )
    && boundedGroupPropertyPredicates.length === 1
    && boundedGroupPropertyPredicate?.subject_ref === 'trace_ld_v1_item_zhdanko_axe'
    && boundedGroupPropertyPredicate?.holder_ref === 'eremey_fisher'
    && boundedGroupPropertyPredicate?.controller_ref === 'eremey_fisher'
    && boundedGroupPropertyPredicate?.source_transition_ref === 'trace_ld_v1_property_zhdanko_axe_disarmed_to_eremey'
    && zhdankoAxeDisarmProperty?.requires?.admission_fact === 'bounded_group_disarm_transition_admitted'
    && exactSet(zhdankoAxeDisarmProperty?.committed_fact_outputs, ['axe_control_removed_from_zhdanko'])
    && zhdankoAxeDisarmProperty?.writes?.holder_ref === boundedGroupPropertyPredicate.holder_ref
    && zhdankoAxeDisarmProperty?.writes?.controller_ref === boundedGroupPropertyPredicate.controller_ref,
  'TRACE_0D_BAG_RECOVERY_REACHABILITY',
  'bounded group recovery is not causally reachable from committed disarm facts and axe control state'
);
requireCondition(
  recoverPacketProperty?.requires?.physical_parent_ref === 'trace_ld_v1_container_road_bag'
    && recoverPacketProperty?.requires?.parent_holder_ref === 'player_clerk'
    && recoverPacketProperty?.requires?.parent_controller_ref === 'player_clerk'
    && recoverPacketProperty?.writes?.physical_parent_ref === null
    && recoverPacketProperty?.writes?.holder_ref === 'player_clerk'
    && recoverPacketProperty?.writes?.controller_ref === 'player_clerk'
    && recoverPacketProperty?.writes?.seal_state === 'preserve_committed'
    && recoverPacketProperty?.owner_change === 'forbidden'
    && recoverDestroyedPacketProperty?.requires?.physical_parent_ref === 'trace_ld_v1_container_road_bag'
    && recoverDestroyedPacketProperty?.requires?.parent_holder_ref === 'player_clerk'
    && recoverDestroyedPacketProperty?.requires?.parent_controller_ref === 'player_clerk'
    && recoverDestroyedPacketProperty?.requires?.seal_state === 'destroyed'
    && recoverDestroyedPacketProperty?.requires?.document_condition === 'destroyed_unreadable'
    && recoverDestroyedPacketProperty?.requires?.evidence_availability === 'destroyed'
    && recoverDestroyedPacketProperty?.writes?.physical_parent_ref === null
    && recoverDestroyedPacketProperty?.writes?.holder_ref === 'player_clerk'
    && recoverDestroyedPacketProperty?.writes?.controller_ref === 'player_clerk'
    && recoverDestroyedPacketProperty?.writes?.seal_state === 'preserve_destroyed'
    && recoverDestroyedPacketProperty?.writes?.document_condition === 'preserve_destroyed_unreadable'
    && recoverDestroyedPacketProperty?.writes?.evidence_availability === 'preserve_destroyed'
    && recoverDestroyedPacketProperty?.owner_change === 'forbidden'
    && exactSet(assignBagToFisherProperty?.requires?.packet_removed_by_transition_ref_candidates, [
      'trace_ld_v1_property_packet_recovered_to_player',
      'trace_ld_v1_property_destroyed_packet_recovered_to_player'
    ])
    && assignBagToFisherProperty?.writes?.holder_ref === 'trace_ld_v1_audience_slot_participating_fisher'
    && assignBagToFisherProperty?.writes?.controller_ref === 'trace_ld_v1_audience_slot_participating_fisher'
    && assignBagToFisherProperty?.contained_item_effect === 'remaining_contents_inherit_parent_position_holder_and_controller_while_preserving_each_item_owner',
  'TRACE_0D_RECOVERED_PROPERTY_ALLOCATION',
  'intact/destroyed packet recovery or optional road-bag carrier allocation is incomplete'
);

const scheduleExecutionMap = mapUnique(npc.schedule_execution_bindings, 'execution_binding_id', 'TRACE_0D_SCHEDULE_EXECUTION');
requireCondition(scheduleExecutionMap.size === expectedScheduleOptions.length, 'TRACE_0D_SCHEDULE_EXECUTION_SET', 'schedule execution binding set is incomplete');
requireCondition(
  npc.schedule_elapsed_contract?.schema === 'rus.trace_schedule_elapsed_commit_contract.v1'
    && npc.schedule_elapsed_contract?.version === 1
    && npc.schedule_elapsed_contract?.root_selection === 'execution_elapsed_plan_root_ref'
    && exactSet(
      npc.schedule_elapsed_contract?.allowed_direct_owner_record_kinds,
      ['schedule_execution_binding', 'movement_binding']
    )
    && npc.schedule_elapsed_contract?.committed_elapsed_owner_mode === 'direct_party_clock'
    && npc.schedule_elapsed_contract?.clock_arithmetic_owner === '@rus/time-events-history'
    && npc.schedule_elapsed_contract?.clock_entrypoint_ref === '@rus/time-events-history:addElapsedTime'
    && npc.schedule_elapsed_contract?.clock_write_target === 'elapsed_game_time'
    && npc.schedule_elapsed_contract?.clock_write_count_per_completed_execution === 1
    && npc.schedule_elapsed_contract?.child_interval_accounting === 'included_in_root_total_never_additive'
    && npc.schedule_elapsed_contract?.movement_duration_role === 'included_child_interval_with_clock_write_forbidden'
    && npc.schedule_elapsed_contract?.duplicate_clock_write_failure === 'typed_duplicate_elapsed_commit',
  'TRACE_0D_SCHEDULE_ELAPSED_OWNER',
  'schedule lacks one exact committed elapsed owner and non-additive child interval policy'
);
const movementRootByScheduleOption = Object.freeze({
  move_bag: 'trace_ld_v1_local_transition_storehouse_to_river_access',
  attempt_departure: 'trace_ld_v1_scope_exit_storehouse_by_small_boat'
});
const executionByOption = new Map();
for (const binding of scheduleExecutionMap.values()) {
  requireCondition(expectedScheduleOptions.includes(binding.schedule_option_id) && !executionByOption.has(binding.schedule_option_id), 'TRACE_0D_SCHEDULE_EXECUTION_OPTION', `${binding.execution_binding_id} has unknown or duplicate schedule option`);
  executionByOption.set(binding.schedule_option_id, binding);
  requireCondition(
    activityMap.has(binding.activity_profile_ref)
      && timeProfileMap.has(binding.time_profile_ref)
      && consequenceMap.has(binding.consequence_ref)
      && unique(binding.write_targets)
      && text(binding.completion_boundary)
      && binding.typed_failure === 'typed_schedule_execution_precondition_failed',
    'TRACE_0D_SCHEDULE_EXECUTION',
    `${binding.execution_binding_id} does not resolve activity/time/consequence/write targets`
  );
  const activity = activityMap.get(binding.activity_profile_ref);
  const rootDuration = timeProfileMap.get(binding.time_profile_ref)?.duration_minutes;
  const elapsedPlan = binding.elapsed_plan;
  const expectedMovementRoot = movementRootByScheduleOption[binding.schedule_option_id] ?? null;
  const executionClockWriteCount = binding.write_targets.filter((target) => target === 'elapsed_game_time').length;
  const consequence = consequenceMap.get(binding.consequence_ref);
  const expectedSemanticOptionIds = binding.schedule_option_id === 'attempt_departure'
    ? ['attempt_departure', 'flee_without_weapon']
    : [binding.schedule_option_id];
  const variants = elapsedPlan?.closed_variants == null
    ? [{ total_minutes: rootDuration, stages: elapsedPlan?.stages }]
    : Object.values(elapsedPlan.closed_variants);
  requireCondition(
    exactSet(activity.semantic_option_ids, expectedSemanticOptionIds)
      && activity.time_profile_ref === binding.time_profile_ref
      && activity.consequence_refs.includes(binding.consequence_ref),
    'TRACE_0D_SCHEDULE_EXECUTION_CHAIN',
    `${binding.execution_binding_id} does not match its activity profile`
  );
  requireCondition(
    elapsedPlan?.root_time_profile_ref === binding.time_profile_ref
      && elapsedPlan?.root_ref === (expectedMovementRoot ?? 'self')
      && elapsedPlan?.clock_write === (expectedMovementRoot == null
        ? 'single_via_schedule_elapsed_contract'
        : 'delegated_to_root_movement_binding')
      && executionClockWriteCount === (expectedMovementRoot == null ? 1 : 0)
      && activity.elapsed_accounting?.role === 'definition_metadata_only'
      && activity.elapsed_accounting?.clock_write === 'forbidden'
      && activity.elapsed_accounting?.root_ref_source === (
        activity.profile_id === 'trace_ld_v1_activity_zhdanko_attempt_departure'
          ? 'schedule_or_decision_execution_binding_root_ref'
          : 'schedule_execution_binding.elapsed_plan.root_ref'
      )
      && !activity.write_target_classes.includes('elapsed_game_time')
      && !consequence.write_target_classes.includes('elapsed_game_time')
      && variants.length > 0
      && variants.every((variant) =>
        variant?.total_minutes === rootDuration
          && Array.isArray(variant.stages)
          && variant.stages.length > 0
          && variant.stages.every((stage) => Number.isInteger(stage.duration_minutes) && stage.duration_minutes > 0 && stage.child_clock_write === 'forbidden')
          && variant.stages.reduce((sum, stage) => sum + stage.duration_minutes, 0) === rootDuration),
    'TRACE_0D_SCHEDULE_ELAPSED_PLAN',
    `${binding.execution_binding_id} has additive, duplicated, or incomplete elapsed accounting`
  );
}
for (const option of schedule.option_set) {
  const execution = scheduleExecutionMap.get(option.execution_binding_ref);
  requireCondition(execution?.schedule_option_id === option.option_id, 'TRACE_0D_SCHEDULE_EXECUTION_REF', `${option.option_id} lacks its exact execution binding`);
}
const prepareBoatExecution = executionByOption.get('prepare_boat');
const moveBagExecution = executionByOption.get('move_bag');
const destroyDocumentExecution = executionByOption.get('attempt_document_destruction');
requireCondition(
  exactSet(moveBagExecution?.movement_subject_refs, ['zhdanko_storehouse_controller', 'trace_ld_v1_container_road_bag'])
    && moveBagExecution?.write_targets?.includes('actor_zone_position')
    && activityMap.get(moveBagExecution?.activity_profile_ref)?.write_target_classes?.includes('actor_zone_position'),
  'TRACE_0D_MOVE_BAG_SUBJECTS',
  'bag movement does not identify both moving actor/container or persist actor zone position'
);
requireCondition(
  prepareBoatExecution?.movement_selection?.source === 'committed_actor_zone'
    && exactSet(Object.keys(prepareBoatExecution?.movement_selection?.closed_variants ?? {}), ['storehouse_interior', 'yard', 'river_access'])
    && prepareBoatExecution?.movement_selection?.closed_variants?.storehouse_interior === 'trace_ld_v1_local_transition_storehouse_to_river_access'
    && prepareBoatExecution?.movement_selection?.closed_variants?.yard === 'trace_ld_v1_local_transition_storehouse_to_river_access'
    && prepareBoatExecution?.movement_selection?.closed_variants?.river_access === null
    && exactSet(prepareBoatExecution?.movement_subject_refs, ['zhdanko_storehouse_controller'])
    && prepareBoatExecution?.write_targets?.includes('actor_zone_position')
    && activityMap.get(prepareBoatExecution?.activity_profile_ref)?.write_target_classes?.includes('actor_zone_position'),
  'TRACE_0D_PREPARE_BOAT_MOVEMENT',
  'boat preparation cannot resolve both local arrival and already-at-river states'
);
requireCondition(
  prepareBoatExecution?.elapsed_plan?.variant_source === 'committed_actor_zone'
    && exactSet(Object.keys(prepareBoatExecution?.elapsed_plan?.closed_variants ?? {}), ['storehouse_interior', 'yard', 'river_access'])
    && prepareBoatExecution.elapsed_plan.closed_variants.storehouse_interior.stages[0]?.duration_minutes === 5
    && prepareBoatExecution.elapsed_plan.closed_variants.storehouse_interior.stages[1]?.duration_minutes === 5
    && prepareBoatExecution.elapsed_plan.closed_variants.yard.stages[0]?.duration_minutes === 5
    && prepareBoatExecution.elapsed_plan.closed_variants.yard.stages[1]?.duration_minutes === 5
    && prepareBoatExecution.elapsed_plan.closed_variants.river_access.stages[0]?.duration_minutes === 10,
  'TRACE_0D_PREPARE_BOAT_ELAPSED',
  'boat preparation does not define whether local movement is included in the ten-minute root interval'
);
requireCondition(
  exactSet(
    destroyDocumentExecution?.property_transition_refs,
    ['trace_ld_v1_property_road_bag_opened_for_access', 'trace_ld_v1_property_packet_destroyed']
  )
    && destroyDocumentExecution?.elapsed_plan?.stages?.length === 2
    && destroyDocumentExecution.elapsed_plan.stages[0]?.stage_id === 'untie_and_open_road_bag'
    && destroyDocumentExecution.elapsed_plan.stages[0]?.property_transition_refs?.includes('trace_ld_v1_property_road_bag_opened_for_access')
    && destroyDocumentExecution.elapsed_plan.stages[0]?.commit_boundary === 'container_open_and_packet_accessible'
    && destroyDocumentExecution.elapsed_plan.stages[1]?.requires_committed_stage_id === 'untie_and_open_road_bag'
    && destroyDocumentExecution.elapsed_plan.stages[1]?.property_transition_refs?.includes('trace_ld_v1_property_packet_destroyed'),
  'TRACE_0D_DOCUMENT_DESTRUCTION_REACHABILITY',
  'document destruction is not reachable from the tied 0C road-bag opening state'
);
const departureExecution = executionByOption.get('attempt_departure');
requireCondition(
  departureExecution?.property_transition_selection?.source === 'committed_bag_load_state'
    && exactSet(Object.keys(departureExecution?.property_transition_selection?.closed_variants ?? {}), ['bag_not_controlled', 'bag_controlled_not_loaded', 'bag_loaded'])
    && departureExecution?.property_transition_selection?.closed_variants?.bag_not_controlled === null
    && departureExecution?.property_transition_selection?.closed_variants?.bag_controlled_not_loaded === 'trace_ld_v1_property_zhdanko_depart_leaving_bag'
    && departureExecution?.property_transition_selection?.closed_variants?.bag_loaded === 'trace_ld_v1_property_zhdanko_depart_with_bag'
    && exactSet(departureExecution?.movement_subject_refs, ['zhdanko_storehouse_controller', 'trace_ld_v1_item_second_small_boat']),
  'TRACE_0D_DEPARTURE_PROPERTY_SELECTION',
  'departure does not resolve each committed bag state exactly'
);

const routeMap = mapUnique(movement.route_bindings, 'route_id', 'TRACE_0D_ROUTE');
requireCondition(routeMap.size === 8, 'TRACE_0D_ROUTE_SET', 'movement binding set is incomplete');
for (const route of routeMap.values()) {
  requireCondition(route.schema === 'rus.trace_movement_binding.v1' && route.version === 1, 'TRACE_0D_ROUTE_SCHEMA', `${route.route_id} schema/version invalid`);
  requireCondition(endpointIds.has(route.source_endpoint) && endpointIds.has(route.destination_endpoint) && route.source_endpoint !== route.destination_endpoint, 'TRACE_0D_ROUTE_ENDPOINT', `${route.route_id} endpoint invalid`);
  requireCondition(Number.isInteger(route.duration_minutes) && route.duration_minutes > 0 && text(route.time_profile_ref), 'TRACE_0D_ROUTE_TIME', `${route.route_id} duration/time profile invalid`);
  requireCondition(timeProfileMap.get(route.time_profile_ref)?.duration_minutes === route.duration_minutes, 'TRACE_0D_ROUTE_TIME', `${route.route_id} time profile does not match duration`);
  requireCondition(locationIds.has(route.terminal_position_outcome), 'TRACE_0D_ROUTE_TERMINAL', `${route.route_id} terminal position invalid`);
  if (route.reverse_route_ref) requireCondition(routeMap.has(route.reverse_route_ref), 'TRACE_0D_ROUTE_REVERSE', `${route.route_id} reverse route missing`);
  else requireCondition(text(route.asymmetry_basis), 'TRACE_0D_ROUTE_REVERSE', `${route.route_id} lacks reverse or asymmetry basis`);
}
const ratshaEscapeRoute = routeMap.get('trace_ld_v1_route_shed_to_camp');
requireCondition(
  exactSet(
    Object.keys(ratshaEscapeRoute?.elapsed_accounting?.parent_execution_roles ?? {}),
    ['trace_ld_v1_decision_execution_ratsha_continue_escape']
  )
    && ratshaEscapeRoute?.elapsed_accounting?.parent_execution_roles?.trace_ld_v1_decision_execution_ratsha_continue_escape?.role === 'independent_conditional_root_interval'
    && ratshaEscapeRoute?.elapsed_accounting?.parent_execution_roles?.trace_ld_v1_decision_execution_ratsha_continue_escape?.clock_owner_mode === 'direct_party_clock'
    && ratshaEscapeRoute?.elapsed_accounting?.parent_execution_roles?.trace_ld_v1_decision_execution_ratsha_continue_escape?.clock_write === 'single_if_route_admitted_and_completed'
    && ratshaEscapeRoute?.elapsed_accounting?.parent_execution_roles?.trace_ld_v1_decision_execution_ratsha_continue_escape?.clock_write_target === 'elapsed_game_time',
  'TRACE_0D_RATSHA_ESCAPE_ELAPSED',
  'Ratsha escape route lacks its one conditional committed elapsed owner'
);
const localTransitionMap = mapUnique(movement.local_transition_bindings, 'transition_id', 'TRACE_0D_LOCAL_TRANSITION');
requireCondition(exactSet([...localTransitionMap.keys()], ['trace_ld_v1_local_transition_storehouse_to_river_access']), 'TRACE_0D_LOCAL_TRANSITION_SET', 'local transition set is incomplete or unknown');
const storehouseToRiver = localTransitionMap.get('trace_ld_v1_local_transition_storehouse_to_river_access');
requireCondition(
  storehouseToRiver?.schema === 'rus.trace_local_zone_transition.v1'
    && storehouseToRiver?.version === 1
    && storehouseToRiver?.location_ref === 'trace_ld_v1_loc_zhdanko_storehouse'
    && storehouseToRiver?.source_g4_ref?.id === 'g4v3__gn_nov_g3_xp017_yp026_r2_vikhtuy_locality'
    && storehouseToRiver?.source_g4_ref?.version === 1
    && storehouseToRiver?.source_g4_ref?.canonical_digest === '4d97b4672c7bee146559f0e31a0ffdb80dd2d7507630a806a09af083ef421174'
    && exactSet(storehouseToRiver?.source_zone_candidates, ['storehouse_interior', 'yard'])
    && storehouseToRiver?.destination_zone_ref === 'river_access'
    && exactSet(storehouseToRiver?.admitted_subject_classes, ['actor', 'container', 'transport'])
    && storehouseToRiver?.duration_minutes === 5
    && timeProfileMap.get(storehouseToRiver?.time_profile_ref)?.duration_minutes === 5
    && exactSet(
      Object.keys(storehouseToRiver?.elapsed_accounting?.parent_execution_roles ?? {}),
      ['trace_ld_v1_schedule_execution_move_bag', 'trace_ld_v1_schedule_execution_prepare_boat']
    )
    && storehouseToRiver?.elapsed_accounting?.parent_execution_roles?.trace_ld_v1_schedule_execution_move_bag?.role === 'root_interval'
    && storehouseToRiver?.elapsed_accounting?.parent_execution_roles?.trace_ld_v1_schedule_execution_move_bag?.clock_owner_mode === 'direct_party_clock'
    && storehouseToRiver?.elapsed_accounting?.parent_execution_roles?.trace_ld_v1_schedule_execution_move_bag?.clock_write === 'single'
    && storehouseToRiver?.elapsed_accounting?.parent_execution_roles?.trace_ld_v1_schedule_execution_move_bag?.clock_write_target === 'elapsed_game_time'
    && storehouseToRiver?.elapsed_accounting?.parent_execution_roles?.trace_ld_v1_schedule_execution_prepare_boat?.role === 'included_child_interval'
    && storehouseToRiver?.elapsed_accounting?.parent_execution_roles?.trace_ld_v1_schedule_execution_prepare_boat?.clock_owner_mode === 'shared_root_transport_clock'
    && storehouseToRiver?.elapsed_accounting?.parent_execution_roles?.trace_ld_v1_schedule_execution_prepare_boat?.clock_write === 'forbidden'
    && storehouseToRiver?.elapsed_accounting?.parent_execution_roles?.trace_ld_v1_schedule_execution_prepare_boat?.duration_accounting === 'included_in_parent_root_total_never_additive'
    && storehouseToRiver?.capacity_contract_ref === 'trace_ld_v1_capacity_zhdanko_storehouse'
    && storehouseToRiver?.terminal_outcome === 'same_materialized_location_new_zone'
    && exactSet(storehouseToRiver?.forbidden_effects, ['new_location', 'new_g5', 'teleport', 'external_destination_invention']),
  'TRACE_0D_LOCAL_TRANSITION',
  'storehouse-to-river local transition is not exact'
);

const scopeExitMap = mapUnique(movement.active_scope_exit_bindings, 'exit_binding_id', 'TRACE_0D_SCOPE_EXIT');
requireCondition(exactSet([...scopeExitMap.keys()], ['trace_ld_v1_scope_exit_storehouse_by_small_boat']), 'TRACE_0D_SCOPE_EXIT_SET', 'active-scope exit set is incomplete or unknown');
const scopeExit = scopeExitMap.get('trace_ld_v1_scope_exit_storehouse_by_small_boat');
const exitVariantMap = mapUnique(scopeExit?.departure_load_variants, 'variant_id', 'TRACE_0D_SCOPE_EXIT_VARIANT');
requireCondition(
  scopeExit?.schema === 'rus.trace_active_scope_exit_binding.v1'
    && scopeExit?.version === 1
    && scopeExit?.actor_slot === 'zhdanko_storehouse_controller'
    && scopeExit?.source_location_ref === 'trace_ld_v1_loc_zhdanko_storehouse'
    && scopeExit?.source_zone_ref === 'river_access'
    && scopeExit?.source_g4_ref?.id === storehouseToRiver.source_g4_ref.id
    && scopeExit?.source_g4_ref?.version === storehouseToRiver.source_g4_ref.version
    && scopeExit?.source_g4_ref?.canonical_digest === storehouseToRiver.source_g4_ref.canonical_digest
    && scopeExit?.transport_item_ref === 'trace_ld_v1_item_second_small_boat'
    && scopeExit?.duration_minutes === 15
    && timeProfileMap.get(scopeExit?.time_profile_ref)?.duration_minutes === 15
    && exactSet(
      Object.keys(scopeExit?.elapsed_accounting?.parent_execution_roles ?? {}),
      ['trace_ld_v1_schedule_execution_attempt_departure', 'trace_ld_v1_decision_execution_zhdanko_flee_without_weapon']
    )
    && scopeExit?.elapsed_accounting?.parent_execution_roles?.trace_ld_v1_schedule_execution_attempt_departure?.role === 'root_interval'
    && scopeExit?.elapsed_accounting?.parent_execution_roles?.trace_ld_v1_schedule_execution_attempt_departure?.clock_owner_mode === 'direct_party_clock'
    && scopeExit?.elapsed_accounting?.parent_execution_roles?.trace_ld_v1_schedule_execution_attempt_departure?.clock_write === 'single'
    && scopeExit?.elapsed_accounting?.parent_execution_roles?.trace_ld_v1_schedule_execution_attempt_departure?.clock_write_target === 'elapsed_game_time'
    && scopeExit?.elapsed_accounting?.parent_execution_roles?.trace_ld_v1_decision_execution_zhdanko_flee_without_weapon?.role === 'root_interval'
    && scopeExit?.elapsed_accounting?.parent_execution_roles?.trace_ld_v1_decision_execution_zhdanko_flee_without_weapon?.clock_owner_mode === 'direct_party_clock'
    && scopeExit?.elapsed_accounting?.parent_execution_roles?.trace_ld_v1_decision_execution_zhdanko_flee_without_weapon?.clock_write === 'single'
    && scopeExit?.elapsed_accounting?.parent_execution_roles?.trace_ld_v1_decision_execution_zhdanko_flee_without_weapon?.clock_write_target === 'elapsed_game_time'
    && scopeExit?.variant_selection_policy === 'select_exact_closed_variant_from_committed_bag_load_state'
    && scopeExit?.destination_contract?.kind === 'outside_active_scenario_scope'
    && scopeExit?.destination_contract?.destination_location_ref === null
    && scopeExit?.destination_contract?.destination_instance_materialization === 'forbidden'
    && scopeExit?.destination_contract?.reentry_requires_separate_approved_world_route === true
    && scopeExit?.terminal_fact_timing === 'only_after_full_exit_interval_and_property_transition_commit'
    && exactSet(scopeExit?.terminal_commit_effects, ['active_scope_departure', 'zhdanko_fled', 'movement_history'])
    && exactSet(scopeExit?.forbidden_effects, ['new_location', 'new_g5', 'teleport', 'guessed_external_destination', 'zhdanko_fled_before_terminal_commit']),
  'TRACE_0D_SCOPE_EXIT',
  'Zhdanko active-scope exit is not exact or invents an external destination'
);
const executableMovementRefs = new Set([...localTransitionMap.keys(), ...scopeExitMap.keys()]);
for (const binding of scheduleExecutionMap.values()) {
  const elapsedVariants = binding.elapsed_plan?.closed_variants == null
    ? [{ stages: binding.elapsed_plan?.stages }]
    : Object.values(binding.elapsed_plan.closed_variants);
  for (const stage of elapsedVariants.flatMap(({ stages }) => stages ?? [])) {
    if (stage.movement_ref) {
      requireCondition(
        executableMovementRefs.has(stage.movement_ref),
        'TRACE_0D_SCHEDULE_ELAPSED_MOVEMENT_REF',
        `${binding.execution_binding_id} elapsed plan has unknown movement child`
      );
    }
    for (const ref of stage.property_transition_refs ?? []) {
      requireCondition(
        propertyTransitionMap.has(ref),
        'TRACE_0D_SCHEDULE_ELAPSED_PROPERTY_REF',
        `${binding.execution_binding_id} elapsed plan has unknown property child`
      );
    }
  }
}
requireCondition(exactSet([...exitVariantMap.keys()], ['depart_without_road_bag_uncontrolled', 'depart_leaving_controlled_road_bag', 'depart_with_road_bag']), 'TRACE_0D_SCOPE_EXIT_VARIANT', 'departure load variants are incomplete or unknown');
const exitWithoutBag = exitVariantMap.get('depart_without_road_bag_uncontrolled');
const exitLeavingBag = exitVariantMap.get('depart_leaving_controlled_road_bag');
const exitWithBag = exitVariantMap.get('depart_with_road_bag');
requireCondition(
  exitWithoutBag?.committed_load_state === 'bag_not_controlled'
    && exactSet(exitWithoutBag?.required_controlled_item_refs, ['trace_ld_v1_item_second_small_boat'])
    && exactSet(exitWithoutBag?.property_transition_refs, [])
    && exitWithoutBag?.road_bag_effect === 'preserve_committed_property_and_position_state'
    && exitLeavingBag?.committed_load_state === 'bag_controlled_not_loaded'
    && exactSet(exitLeavingBag?.required_controlled_item_refs, ['trace_ld_v1_item_second_small_boat'])
    && exactSet(exitLeavingBag?.property_transition_refs, ['trace_ld_v1_property_zhdanko_depart_leaving_bag'])
    && exitWithBag?.committed_load_state === 'bag_loaded'
    && exactSet(exitWithBag?.required_controlled_item_refs, ['trace_ld_v1_item_second_small_boat', 'trace_ld_v1_container_road_bag'])
    && exactSet(exitWithBag?.property_transition_refs, ['trace_ld_v1_property_zhdanko_depart_with_bag']),
  'TRACE_0D_SCOPE_EXIT_VARIANT',
  'departure variants do not map exact committed load state to exact property transitions'
);
for (const binding of scheduleExecutionMap.values()) {
  if (binding.movement_ref) requireCondition(routeMap.has(binding.movement_ref) || localTransitionMap.has(binding.movement_ref) || scopeExitMap.has(binding.movement_ref), 'TRACE_0D_SCHEDULE_MOVEMENT_REF', `${binding.execution_binding_id} has unknown movement ref`);
  for (const ref of Object.values(binding.movement_selection?.closed_variants ?? {}).filter(Boolean)) requireCondition(routeMap.has(ref) || localTransitionMap.has(ref) || scopeExitMap.has(ref), 'TRACE_0D_SCHEDULE_MOVEMENT_REF', `${binding.execution_binding_id} has unknown selected movement ref`);
  for (const ref of binding.property_transition_refs ?? []) requireCondition(propertyTransitionMap.has(ref), 'TRACE_0D_SCHEDULE_PROPERTY_REF', `${binding.execution_binding_id} has unknown property transition`);
  for (const ref of Object.values(binding.property_transition_selection?.closed_variants ?? {}).filter(Boolean)) requireCondition(propertyTransitionMap.has(ref), 'TRACE_0D_SCHEDULE_PROPERTY_REF', `${binding.execution_binding_id} has unknown selected property transition`);
}
const carryRoute = routeMap.get('trace_ld_v1_route_shed_to_camp_carry_onisim');
const carryActivity = activityMap.get('trace_ld_v1_activity_make_stretcher_and_carry');
const carryRules = carryRoute.carried_actor_rules;
const carrierCandidates = ['player_clerk', 'eremey_fisher', 'background_fisher_1', 'background_fisher_2'];
requireCondition(
  carryRules?.carried_slot === 'onisim_boatman'
    && carryRules?.single_root_clock === true
    && carryRules?.same_progress_for_whole_group === true
    && carryRules?.independent_movement === 'forbidden',
  'TRACE_0D_CARRY_TELEPORT',
  'carry contract permits desynchronized or independently moved Onisim'
);
requireCondition(
  carryRules?.minimum_carrier_count === 3
    && exactSet(carryRules?.carrier_candidate_slots, carrierCandidates)
    && exactSet(carryRules?.initial_carrier_binding, ['player_clerk', 'eremey_fisher', 'background_fisher_1'])
    && exactSet(Object.keys(carryRules?.carrier_eligibility_bindings ?? {}), carrierCandidates)
    && carryRules?.carrier_eligibility_bindings?.player_clerk === 'player_accepts_current_carry_activity'
    && carryRules?.carrier_eligibility_bindings?.eremey_fisher === 'assist_rescue_or_restraint'
    && carryRules?.carrier_eligibility_bindings?.background_fisher_1 === 'carry'
    && carryRules?.carrier_eligibility_bindings?.background_fisher_2 === 'carry',
  'TRACE_0D_CARRY_CONTRACT',
  'carry count, candidates, initial binding or synchronization is invalid'
);
requireCondition(
  exactSet(carryActivity?.participant_slots?.required, ['onisim_boatman'])
    && exactSet(carryActivity?.participant_slots?.optional, carrierCandidates)
    && carryActivity?.participant_slots?.minimum_bound_carriers === 3
    && carryActivity?.cancellation_or_substitution === 'attempt_approved_carrier_rebinding_at_committed_route_boundary_then_fail_closed',
  'TRACE_0D_CARRY_ACTIVITY',
  'carry activity hard-codes a replaceable carrier or lacks the minimum binding'
);
const rebinding = carryRules.carrier_rebinding;
requireCondition(
  rebinding?.decision_boundary === 'committed_synchronized_route_interval_boundary'
    && rebinding?.trigger === 'bound_carrier_unavailable_or_body_load_no_longer_admitted'
    && exactSet(rebinding?.eligible_replacement_rules, [
      'candidate_is_present_at_boundary',
      'candidate_is_not_already_bound_as_carrier',
      'candidate_body_state_admits_recalculated_load',
      'candidate_has_slot_specific_admitted_option_ref'
    ])
    && rebinding?.binding_update === 'replace_unavailable_carrier_slot_without_changing_carried_slot'
    && rebinding?.preserve_committed_elapsed === true
    && rebinding?.preserve_committed_route_progress === true
    && rebinding?.rewind_or_reroll === 'forbidden'
    && rebinding?.load_recalculation === 'recalculate_outgoing_incoming_and_remaining_carrier_load_from_committed_boundary_state'
    && rebinding?.body_effect_profile_ref === 'trace_ld_v1_body_carry_20m'
    && body.effect_profiles?.some(({ effect_profile_id }) => effect_profile_id === rebinding.body_effect_profile_ref)
    && rebinding?.canonical_replacement_path?.outgoing_slot === 'player_clerk'
    && rebinding?.canonical_replacement_path?.incoming_slot === 'background_fisher_2'
    && text(rebinding?.canonical_replacement_path?.basis)
    && rebinding?.no_valid_replacement_failure === 'typed_carry_rebinding_unavailable'
    && carryRules?.loss_of_carrier_or_resource === 'attempt_rebinding_at_committed_boundary_then_stop_without_rewind_if_minimum_count_or_resources_cannot_be_satisfied',
  'TRACE_0D_CARRY_REBINDING',
  'carrier rebinding does not preserve progress/time, recalculate load, or fail closed'
);
requireCondition(
  npcMap.get('trace_ld_v1_npc_eremey_decisions')?.option_set?.some(({ option_id }) => option_id === carryRules.carrier_eligibility_bindings.eremey_fisher)
    && npcMap.get('trace_ld_v1_npc_background_fisher_1_decisions')?.option_set?.some(({ option_id }) => option_id === carryRules.carrier_eligibility_bindings.background_fisher_1)
    && npcMap.get('trace_ld_v1_npc_background_fisher_2_decisions')?.option_set?.some(({ option_id }) => option_id === carryRules.carrier_eligibility_bindings.background_fisher_2),
  'TRACE_0D_CARRY_ELIGIBILITY',
  'carrier eligibility binding does not resolve to an approved NPC option'
);

const accessMap = mapUnique(access.access_policies, 'policy_id', 'TRACE_0D_ACCESS');
requireCondition(exactSet([...accessMap.values()].map(({ resolves_gap_id }) => resolves_gap_id), ['trace_ld_v1_gap_access_wreck_shore_v1', 'trace_ld_v1_gap_access_fishing_camp_v1', 'trace_ld_v1_gap_access_old_drying_shed_v1', 'trace_ld_v1_gap_access_zhdanko_storehouse_v1']), 'TRACE_0D_ACCESS_GAPS', 'access gaps are not closed exactly');
for (const policy of accessMap.values()) {
  requireCondition(policy.schema === 'rus.trace_location_access_policy.v1' && policy.version === 1 && locationIds.has(policy.location_ref), 'TRACE_0D_ACCESS_SCHEMA', `${policy.policy_id} invalid`);
  requireCondition(text(policy.physical_availability) && text(policy.route_knowledge) && text(policy.entrance_visibility) && text(policy.decision_boundary) && text(policy.materialization_conditions?.[0]) && policy.unmaterialized_access === 'forbidden', 'TRACE_0D_ACCESS_CONTRACT', `${policy.policy_id} access contract incomplete`);
}
for (const activity of activityMap.values()) requireCondition(accessMap.has(activity.preconditions.access_policy_ref), 'TRACE_0D_ACTIVITY_ACCESS', `${activity.profile_id} has unknown access policy`);
requireCondition(exactSet(access.causal_source_rules.map(({ resolves_gap_id }) => resolves_gap_id), ['trace_ld_v1_gap_authorized_local_path_source_v1', 'trace_ld_v1_gap_zhdanko_external_location_access_v1']), 'TRACE_0D_ACCESS_CAUSAL_GAPS', 'causal access gaps are not closed');
const capacityMap = mapUnique(capacity.capacity_contracts, 'contract_id', 'TRACE_0D_CAPACITY');
requireCondition(exactSet([...capacityMap.values()].map(({ resolves_gap_id }) => resolves_gap_id), ['trace_ld_v1_gap_capacity_wreck_shore_v1', 'trace_ld_v1_gap_capacity_fishing_camp_v1', 'trace_ld_v1_gap_capacity_old_drying_shed_v1', 'trace_ld_v1_gap_capacity_zhdanko_storehouse_v1']), 'TRACE_0D_CAPACITY_GAPS', 'capacity gaps are not closed exactly');
const dryingShedAccess = accessMap.get('trace_ld_v1_access_old_drying_shed');
const dryingShedCapacity = capacityMap.get('trace_ld_v1_capacity_old_drying_shed');
const dryingShedZones = new Set((dryingShedCapacity?.zones ?? []).map(({ zone_id }) => zone_id));
requireCondition(
  dryingShedAccess?.location_ref === breakContactPositionTransition.location_ref
    && dryingShedCapacity?.location_ref === breakContactPositionTransition.location_ref
    && dryingShedZones.has(breakContactPositionTransition.source_zone_ref)
    && dryingShedZones.has(breakContactPositionTransition.destination_zone_ref)
    && breakContactPositionTransition.source_zone_ref !== breakContactPositionTransition.destination_zone_ref
    && capacity.owner === '@rus/party-store'
    && capacity.owner_contracts?.includes(breakContactPositionTransition.position_write_owner_contract_ref),
  'TRACE_0D_RATSHA_RESPONSE_EFFECT',
  'break-contact position transition does not resolve to approved access, capacity, zones, and write owner'
);
const participantRoleRefs = Object.freeze({
  player_clerk: 'nov_role_merchant_clerk',
  onisim_boatman: 'nov_role_boatman',
  eremey_fisher: 'nov_role_fisher',
  ratsha_storehouse_helper: 'nov_role_servant',
  zhdanko_storehouse_controller: 'nov_role_merchant_clerk',
  background_fisher_1: 'nov_role_fisher',
  background_fisher_2: 'nov_role_fisher',
  trace_ld_v1_audience_slot_participating_fisher: 'nov_role_fisher'
});
const actionCategoryIds = new Set([...activityMap.values()].map(({ action_category }) => action_category));
const validateBounds = (bounds, code, label, minimumFloor = 0) => {
  requireCondition(
    Number.isInteger(bounds?.min)
      && Number.isInteger(bounds?.max)
      && bounds.min >= minimumFloor
      && bounds.max >= bounds.min,
    code,
    `${label} bounds are invalid`
  );
};
const validateBindingIdentityRules = (model, label) => {
  const containsAudienceSlot = model.allowed_participant_slots.includes('trace_ld_v1_audience_slot_participating_fisher');
  const rules = model.binding_identity_rules ?? [];
  if (!containsAudienceSlot) {
    requireCondition(rules.length === 0, 'TRACE_0D_CAPACITY_IDENTITY', `${label} has an identity rule for a disallowed slot`);
    return;
  }
  requireCondition(rules.length === 1, 'TRACE_0D_CAPACITY_IDENTITY', `${label} must define one audience-slot identity rule`);
  const rule = rules[0];
  requireCondition(
    rule.slot_ref === 'trace_ld_v1_audience_slot_participating_fisher'
      && exactSet(rule.must_bind_exactly_one_existing_slot_instance_from, ['background_fisher_1', 'background_fisher_2'])
      && rule.counts_as_additional_actor === false,
    'TRACE_0D_CAPACITY_IDENTITY',
    `${label} counts the bound audience slot as another actor or permits a different identity`
  );
};
const validateCapacityPredicate = (condition, zoneMap, model, label) => {
  requireCondition(text(condition?.predicate), 'TRACE_0D_CAPACITY_PREDICATE', `${label} predicate is missing`);
  switch (condition.predicate) {
    case 'carried_actor_bound':
    case 'held_actor_and_controlled_weapon_share_zone':
    case 'held_actor_present_without_bound_guard':
    case 'held_actor_controls_weapon':
      requireCondition(exactSet(Object.keys(condition), ['predicate']), 'TRACE_0D_CAPACITY_PREDICATE', `${label} predicate has unknown operands`);
      break;
    case 'participant_slot_in':
      requireCondition(
        exactSet(Object.keys(condition), ['predicate', 'slot_refs'])
          && unique(condition.slot_refs)
          && condition.slot_refs.length > 0
          && condition.slot_refs.every((slot) => model.allowed_participant_slots.includes(slot)),
        'TRACE_0D_CAPACITY_PREDICATE',
        `${label} participant-slot predicate is invalid`
      );
      break;
    case 'activity_category_in':
      requireCondition(
        exactSet(Object.keys(condition), ['predicate', 'category_refs'])
          && unique(condition.category_refs)
          && condition.category_refs.length > 0
          && condition.category_refs.every((category) => actionCategoryIds.has(category)),
        'TRACE_0D_CAPACITY_PREDICATE',
        `${label} activity-category predicate is invalid`
      );
      break;
    case 'access_policy_admitted':
      requireCondition(
        exactSet(Object.keys(condition), ['predicate', 'policy_ref', 'entry_class'])
          && accessMap.has(condition.policy_ref)
          && text(condition.entry_class),
        'TRACE_0D_CAPACITY_PREDICATE',
        `${label} access predicate is unresolved`
      );
      break;
    case 'participant_slot_is':
    case 'participant_slot_bound':
      requireCondition(
        exactSet(Object.keys(condition), ['predicate', 'slot_ref'])
          && model.allowed_participant_slots.includes(condition.slot_ref),
        'TRACE_0D_CAPACITY_PREDICATE',
        `${label} participant predicate is invalid`
      );
      break;
    case 'carried_actor_assigned_to_zone':
    case 'armed_threat_and_group_share_zone':
      requireCondition(
        exactSet(Object.keys(condition), ['predicate', 'zone_ref'])
          && zoneMap.has(condition.zone_ref),
        'TRACE_0D_CAPACITY_PREDICATE',
        `${label} zone predicate is invalid`
      );
      break;
    default:
      fail('TRACE_0D_CAPACITY_PREDICATE', `${label} has unknown predicate ${condition.predicate}`);
  }
};
const validateConstraintAdmission = (model, label, boundsKey) => {
  requireCondition(model?.kind === 'constraint_based' && !Object.hasOwn(model, 'supported_compositions'), 'TRACE_0D_CAPACITY_MODEL', `${label} is not constraint-based`);
  requireCondition(unique(model.allowed_participant_slots) && model.allowed_participant_slots.length > 0, 'TRACE_0D_CAPACITY_SLOT', `${label} allowed participant slots are invalid`);
  requireCondition(unique(model.allowed_social_role_refs) && model.allowed_social_role_refs.length > 0, 'TRACE_0D_CAPACITY_ROLE', `${label} allowed social roles are invalid`);
  requireCondition(model.slot_and_role_compatibility === 'both_required_for_bound_participant', 'TRACE_0D_CAPACITY_ROLE', `${label} does not require both slot and role compatibility`);
  for (const slot of model.allowed_participant_slots) {
    requireCondition(participants.has(slot), 'TRACE_0D_CAPACITY_SLOT', `${label} has unknown participant ${slot}`);
    requireCondition(model.allowed_social_role_refs.includes(participantRoleRefs[slot]), 'TRACE_0D_CAPACITY_ROLE', `${label} excludes the canonical role for ${slot}`);
  }
  for (const roleRef of model.allowed_social_role_refs) requireCondition(Object.values(participantRoleRefs).includes(roleRef), 'TRACE_0D_CAPACITY_ROLE', `${label} has unknown role ${roleRef}`);
  requireCondition(
    exactSet([...(model.required_bindings ?? []), ...(model.optional_bindings ?? [])], model.allowed_participant_slots),
    'TRACE_0D_CAPACITY_BINDINGS',
    `${label} required/optional bindings do not partition allowed participants`
  );
  validateBindingIdentityRules(model, label);
  validateBounds(model[boundsKey], 'TRACE_0D_CAPACITY_BOUNDS', label, boundsKey === 'entry_group_bounds' || boundsKey === 'actor_bounds' ? 1 : 0);
  requireCondition(unique(model.incompatible_combinations) && Array.isArray(model.incompatible_combinations), 'TRACE_0D_CAPACITY_INCOMPATIBLE', `${label} incompatible combinations are invalid`);
};
for (const contract of capacityMap.values()) {
  requireCondition(locationIds.has(contract.location_ref) && contract.zones.length > 0 && contract.overflow_failure === 'typed_location_capacity_exceeded', 'TRACE_0D_CAPACITY_CONTRACT', `${contract.contract_id} incomplete`);
  const zoneMap = mapUnique(contract.zones, 'zone_id', 'TRACE_0D_CAPACITY_ZONE');
  for (const zone of zoneMap.values()) {
    requireCondition(
      Number.isInteger(zone.max_actors)
        && zone.max_actors > 0
        && Number.isInteger(zone.max_carried_actors)
        && zone.max_carried_actors >= 0
        && unique(zone.item_classes),
      'TRACE_0D_CAPACITY_BOUNDS',
      `${contract.contract_id} zone capacity invalid`
    );
  }
  validateConstraintAdmission(contract.admission_model, contract.contract_id, 'location_actor_bounds');
  validateBounds(contract.admission_model.entry_group_bounds, 'TRACE_0D_CAPACITY_BOUNDS', `${contract.contract_id} entry group`, 1);
  requireCondition(contract.admission_model.location_actor_bounds.min === 0, 'TRACE_0D_CAPACITY_EMPTY_LOCATION', `${contract.contract_id} incorrectly requires a fixed scene cast`);
  requireCondition(
    contract.admission_model.carried_actor_limits
      && Number.isInteger(contract.admission_model.carried_actor_limits.max)
      && contract.admission_model.carried_actor_limits.max >= 0
      && unique(contract.admission_model.carried_actor_limits.allowed_slots)
      && contract.admission_model.carried_actor_limits.allowed_slots.every((slot) => contract.admission_model.allowed_participant_slots.includes(slot))
      && (contract.admission_model.carried_actor_limits.max > 0 || contract.admission_model.carried_actor_limits.allowed_slots.length === 0),
    'TRACE_0D_CAPACITY_CARRIED',
    `${contract.contract_id} carried actor limits are invalid`
  );
  const zoneAssignment = contract.admission_model.zone_assignment;
  requireCondition(zoneMap.has(zoneAssignment?.default_zone_ref) && text(zoneAssignment?.unassigned_failure) && Array.isArray(zoneAssignment?.rules), 'TRACE_0D_CAPACITY_ZONE_ASSIGNMENT', `${contract.contract_id} zone assignment is incomplete`);
  for (const rule of zoneAssignment.rules) {
    requireCondition(Object.keys(rule.when ?? {}).length > 0 && unique(rule.allowed_zone_refs) && rule.allowed_zone_refs.length > 0 && rule.allowed_zone_refs.every((ref) => zoneMap.has(ref)), 'TRACE_0D_CAPACITY_ZONE_ASSIGNMENT', `${contract.contract_id} has an invalid zone assignment rule`);
    validateCapacityPredicate(rule.when, zoneMap, contract.admission_model, `${contract.contract_id} zone assignment`);
  }
  for (const incompatible of contract.admission_model.incompatible_combinations) {
    requireCondition(text(incompatible.failure), 'TRACE_0D_CAPACITY_INCOMPATIBLE', `${contract.contract_id} has an untyped incompatible combination`);
    validateCapacityPredicate(incompatible.condition, zoneMap, contract.admission_model, `${contract.contract_id} incompatible combination`);
  }
}
const transitCapacityMap = mapUnique(capacity.transit_and_holding_contracts, 'contract_id', 'TRACE_0D_CAPACITY_TRANSIT');
requireCondition(exactSet([...transitCapacityMap.keys()], ['trace_ld_v1_capacity_return_path_group', 'trace_ld_v1_capacity_temporary_holding']), 'TRACE_0D_CAPACITY_TRANSIT', 'return-path and temporary-holding capacity contracts are required');
const returnCapacity = transitCapacityMap.get('trace_ld_v1_capacity_return_path_group');
requireCondition(returnCapacity?.route_ref === 'trace_ld_v1_route_storehouse_to_camp_guarded_return' && returnCapacity?.overflow_failure === 'typed_location_capacity_exceeded', 'TRACE_0D_CAPACITY_TRANSIT', 'return path capacity is not bound to movement');
validateConstraintAdmission(returnCapacity.admission_model, returnCapacity.contract_id, 'actor_bounds');
requireCondition(exactSet(returnCapacity.admission_model.required_bindings, ['player_clerk']), 'TRACE_0D_CAPACITY_TRANSIT', 'return path does not require the player binding');
const holdingCapacity = transitCapacityMap.get('trace_ld_v1_capacity_temporary_holding');
requireCondition(holdingCapacity?.dangerous_positioning === 'forbidden' && holdingCapacity?.overflow_failure === 'typed_location_capacity_exceeded', 'TRACE_0D_CAPACITY_TRANSIT', 'temporary holding permits dangerous positioning');
validateConstraintAdmission(holdingCapacity.admission_model, holdingCapacity.contract_id, 'held_actor_bounds');
requireCondition(
  exactSet(holdingCapacity.admission_model.held_actor_slots, ['ratsha_storehouse_helper', 'zhdanko_storehouse_controller'])
    && exactSet(holdingCapacity.admission_model.guard_candidate_slots, ['eremey_fisher', 'background_fisher_1', 'background_fisher_2'])
    && holdingCapacity.admission_model.guard_bounds_when_held_actor_present?.min === 1
    && holdingCapacity.admission_model.guard_bounds_when_held_actor_present?.max === 3,
  'TRACE_0D_CAPACITY_HOLDING',
  'temporary holding actor/guard constraints are incomplete'
);
for (const incompatible of holdingCapacity.admission_model.incompatible_combinations) {
  requireCondition(text(incompatible.failure), 'TRACE_0D_CAPACITY_INCOMPATIBLE', `${holdingCapacity.contract_id} has an untyped incompatible combination`);
  validateCapacityPredicate(incompatible.condition, new Map([['working_camp', {}]]), holdingCapacity.admission_model, `${holdingCapacity.contract_id} incompatible combination`);
}

requireCondition(body.temporal_source_ref?.record_status === 'approved' && body.temporal_source_ref?.calendar_version === '2', 'TRACE_0D_TEMPORAL_SOURCE', 'calendar source/status/version invalid');
for (const key of ['approval_path', 'dataset_path']) {
  const digestKey = key.replace('_path', '_sha256');
  requireCondition(sha256Path(resolve(root, body.temporal_source_ref[key])) === body.temporal_source_ref[digestKey], 'TRACE_0D_TEMPORAL_DIGEST', `${key} digest mismatch`);
}
const timestamp = body.start_timestamp_specification;
requireCondition(timestamp?.exact_local_minute_of_day === 420 && timestamp?.exact_local_time_label === '07:00' && timestamp?.calendar_date_candidate_contract?.calendar_system === 'Julian' && timestamp?.calendar_date_candidate_contract?.date_must_be_selected_and_committed_by_materializer === true, 'TRACE_0D_GAME_TIMESTAMP', 'start GameTimestamp specification is incomplete');
requireCondition(timestamp.materialized_game_timestamp === null && timestamp.materialized_environment_snapshot === null, 'TRACE_0D_PARTY_TIMESTAMP', 'phase 0D contains a materialized party clock/environment');
for (const [name, bounds] of Object.entries(body.value_bounds)) requireCondition(['health', 'satiety', 'energy'].includes(name) && bounds[0] === 0 && bounds[1] === 100, 'TRACE_0D_BODY_BOUNDS', `body bound invalid: ${name}`);
const envIds = new Set(body.environment_profiles.map(({ environment_profile_id }) => environment_profile_id));
const conditionMap = mapUnique(body.condition_profiles, 'condition_profile_id', 'TRACE_0D_BODY_CONDITION');
for (const required of ['trace_ld_v1_condition_wet_clothing', 'trace_ld_v1_condition_cold_shivering', 'trace_ld_v1_condition_headache', 'trace_ld_v1_condition_shoulder_bruise', 'trace_ld_v1_condition_cold_threshold', 'trace_ld_v1_condition_onisim_injury', 'trace_ld_v1_condition_onisim_leg_fixation', 'trace_ld_v1_condition_ratsha_minor_head_wound']) requireCondition(conditionMap.has(required), 'TRACE_0D_BODY_CONDITION', `body condition profile missing: ${required}`);
requireCondition(body.effect_profiles.length >= 8, 'TRACE_0D_BODY_PROFILE', 'body/environment profile coverage incomplete');
for (const effect of body.effect_profiles) {
  requireCondition(activityMap.has(effect.activity_ref) && timeProfileMap.get(effect.time_profile_ref)?.duration_minutes === effect.elapsed_minutes && Number.isInteger(effect.elapsed_minutes) && effect.elapsed_minutes > 0 && envIds.has(effect.environment_ref), 'TRACE_0D_BODY_PROFILE', `${effect.effect_profile_id} ref/time/environment invalid`);
  requireCondition(text(effect.activity_intensity) && text(effect.load_profile) && text(effect.body_profile_pin) && effect.condition_profile_refs.length > 0 && effect.condition_profile_refs.every((ref) => conditionMap.has(ref)), 'TRACE_0D_BODY_INPUT', `${effect.effect_profile_id} lacks intensity/load/body/condition pins`);
  for (const bounds of Object.values(effect.delta_bounds)) requireCondition(Array.isArray(bounds) && bounds.length === 2 && bounds[0] <= bounds[1] && bounds[0] >= -100 && bounds[1] <= 100, 'TRACE_0D_BODY_BOUNDS', `${effect.effect_profile_id} delta bounds invalid`);
}
const dangerBodyEffect = body.effect_profiles.find(({ effect_profile_id }) => effect_profile_id === 'trace_ld_v1_body_danger_2m');
requireCondition(
  dangerBodyEffect?.required_committed_atomic_effect === 'zhdanko_axe_poll_strike_on_ratsha_committed'
    && exactSet(dangerBodyEffect?.committed_fact_outputs, ['ratsha_minor_head_wound_committed'])
    && dangerBodyEffect?.forbidden_effects?.includes('injury_without_committed_atomic_effect'),
  'TRACE_0D_DANGER_BODY_EFFECT',
  'Ratsha wound lacks an exact committed strike producer'
);
const rest = body.effect_profiles.find(({ effect_profile_id }) => effect_profile_id === 'trace_ld_v1_body_fire_rest_30m');
requireCondition(rest?.elapsed_minutes === 30 && rest?.condition_transitions?.includes('wet_to_damp_only') && rest?.condition_transitions?.includes('headache_persists') && rest?.schedule_effect === 'npc_schedule_advances_for_same_elapsed_interval', 'TRACE_0D_FIRE_REST', 'fire rest semantics invalid');
const treatment = body.effect_profiles.find(({ effect_profile_id }) => effect_profile_id === 'trace_ld_v1_body_first_aid_onisim_25m');
requireCondition(
  treatment?.condition_transitions?.includes('onisim_may_be_stabilized')
    && treatment?.condition_transitions?.includes('onisim_remains_unable_to_walk')
    && treatment?.forbidden_effects?.includes('instant_recovery'),
  'TRACE_0D_TREATMENT_BOUNDARY',
  'first aid implies recovery or omits injured movement restriction'
);
for (const route of routeMap.values()) for (const environmentRef of route.environment_applicability) requireCondition(envIds.has(environmentRef), 'TRACE_0D_ROUTE_ENVIRONMENT', `${route.route_id} has unknown environment ${environmentRef}`);

requireCondition(promise.parties?.promisor_slot === 'player_clerk' && promise.parties?.beneficiary_slot === 'ratsha_storehouse_helper', 'TRACE_0D_PROMISE_PARTIES', 'promise parties invalid');
requireCondition(promise.promise_type === 'conditional_protection_from_summary_killing_or_revenge', 'TRACE_0D_PROMISE_SCOPE', 'promise type invalid');
requireCondition(exactSet(promise.witness_binding?.required_witness_slots, ['eremey_fisher', 'trace_ld_v1_audience_slot_participating_fisher']) && promise.witness_binding?.audience_slot_ref === 'trace_ld_v1_audience_slot_participating_fisher' && promise.witness_binding?.separate_fisher_witness_selection === 'forbidden', 'TRACE_0D_PROMISE_WITNESS', 'promise witness binding invalid');
requireCondition(promise.offer_timing?.must_precede_check_ref === 'trace_ld_v1_check_ratsha_surrender_attempt' && promise.offer_timing?.offer_is_active_fact === false, 'TRACE_0D_PROMISE_CAUSALITY', 'promise offer timing invalid');
requireCondition(
  promise.offer_timing?.offer_preconditions?.length > 0
    && exactSet(promise.offer_timing?.acceptance_preconditions, ['promise_current_offered', 'ratsha_surrender_without_further_harm_committed'])
    && promise.offer_timing?.surrender_condition === 'ratsha_surrender_without_further_harm_committed'
    && promise.offer_timing?.no_further_harm_condition === 'ratsha_surrender_without_further_harm_committed',
  'TRACE_0D_PROMISE_CAUSALITY',
  'promise acceptance must use the exact committed surrender-without-further-harm fact'
);
requireCondition(exactSet(promise.states, ['not_offered', 'offered', 'active', 'fulfilled', 'broken']), 'TRACE_0D_PROMISE_LIFECYCLE', 'promise lifecycle incomplete');
const promiseProjectionMap = mapUnique(promise.lifecycle_input_projections, 'projection_id', 'TRACE_0D_PROMISE_PROJECTION');
const activationProjection = promiseProjectionMap.get('trace_ld_v1_projection_surrender_to_promise_activation_basis');
const fulfillmentProjection = promiseProjectionMap.get('trace_ld_v1_projection_disposition_to_promise_fulfillment_basis');
const breachProjection = promiseProjectionMap.get('trace_ld_v1_projection_disposition_to_promise_breach_basis');
const surrenderConsequence = consequenceMap.get('trace_ld_v1_consequence_ratsha_surrender_committed');
requireCondition(
  promiseProjectionMap.size === 3
    && activationProjection?.owner === '@rus/social-law'
    && activationProjection?.source_producer_ref === surrenderConsequence?.consequence_id
    && exactSet(activationProjection?.source_committed_facts, ['ratsha_surrender_without_further_harm_committed'])
    && activationProjection?.source_committed_facts.every((fact) => surrenderConsequence?.committed_fact_outputs?.includes(fact))
    && activationProjection?.required_current_state_fact === 'promise_current_offered'
    && activationProjection?.projected_committed_fact === 'promise_activation_basis_committed'
    && fulfillmentProjection?.owner === '@rus/social-law'
    && fulfillmentProjection?.source_producer_ref === temporaryDisposition.contract_id
    && exactSet(fulfillmentProjection?.source_committed_facts, [
      'temporary_disposition_outcome_committed',
      'temporary_promise_obligation_preserved'
    ])
    && temporaryDispositionConsequence?.committed_fact_outputs?.includes('temporary_disposition_outcome_committed')
    && promiseOptionMap.get('preserve_active_no_summary_killing_promise')?.committed_fact_output === 'temporary_promise_obligation_preserved'
    && fulfillmentProjection?.required_current_state_fact === 'promise_current_active'
    && fulfillmentProjection?.projected_committed_fact === 'promise_fulfillment_basis_committed'
    && breachProjection?.owner === '@rus/social-law'
    && breachProjection?.source_producer_ref === temporaryDisposition.contract_id
    && exactSet(breachProjection?.source_committed_facts, [
      'temporary_disposition_outcome_committed',
      'temporary_promise_scope_breach_committed'
    ])
    && promiseOptionMap.get('commit_scope_breach_for_active_promise')?.committed_fact_output === 'temporary_promise_scope_breach_committed'
    && breachProjection?.required_current_state_fact === 'promise_current_active'
    && breachProjection?.projected_committed_fact === 'promise_breach_basis_committed',
  'TRACE_0D_PROMISE_PROJECTION',
  'promise lifecycle input lacks an exact owner-owned projection from committed source facts'
);
const offeredTransition = promise.transitions.find(({ to }) => to === 'offered');
const activeTransition = promise.transitions.find(({ to }) => to === 'active');
const fulfilledTransition = promise.transitions.find(({ to }) => to === 'fulfilled');
const brokenTransition = promise.transitions.find(({ to }) => to === 'broken');
const expectedPromiseTransitions = [
  [offeredTransition, 'not_offered', 'offered', 'promise_offered', 'promise_current_not_offered', 'promise_current_offered'],
  [activeTransition, 'offered', 'active', 'promise_activated', 'promise_current_offered', 'promise_current_active'],
  [fulfilledTransition, 'active', 'fulfilled', 'promise_fulfilled', 'promise_current_active', 'promise_current_fulfilled'],
  [brokenTransition, 'active', 'broken', 'promise_broken', 'promise_current_active', 'promise_current_broken']
];
requireCondition(
  promise.history_and_current_state_contract?.history_event_storage === 'append_only'
    && promise.history_and_current_state_contract?.current_state_slot === 'trace_ld_v1_promise_no_summary_killing_current_state'
    && promise.history_and_current_state_contract?.initial_current_state_fact === 'promise_current_not_offered'
    && promise.history_and_current_state_contract?.initialization_boundary === 'promise_instance_materialization'
    && promise.history_and_current_state_contract?.initialization_owner === '@rus/social-law'
    && promise.history_and_current_state_contract?.current_state_cardinality === 'exactly_one'
    && promise.history_and_current_state_contract?.current_state_projection_write === 'replace_previous_projection_atomically'
    && promise.history_and_current_state_contract?.history_events_as_current_state_or_completion_input === 'forbidden'
    && expectedPromiseTransitions.every(([transition, from, to, historyFact, previousFact, nextFact]) => (
      transition?.from === from
      && transition?.to === to
      && transition?.history_event_output === historyFact
      && transition?.current_state_projection?.state_slot === promise.history_and_current_state_contract.current_state_slot
      && transition?.current_state_projection?.expected_previous_fact === previousFact
      && transition?.current_state_projection?.next_fact === nextFact
      && transition?.current_state_projection?.replace_previous_projection === true
      && exactSet(transition?.current_state_projection?.superseded_current_facts, [previousFact])
      && historyFact !== nextFact
    ))
    && activeTransition?.from === 'offered'
    && exactSet(activeTransition.requires, ['promise_activation_basis_committed'])
    && fulfilledTransition?.from === 'active'
    && exactSet(fulfilledTransition?.requires, ['promise_fulfillment_basis_committed'])
    && brokenTransition?.from === 'active'
    && exactSet(brokenTransition?.requires, ['promise_breach_basis_committed'])
    && !promise.transitions.some((transition) => Object.hasOwn(transition, 'committed_fact_output')),
  'TRACE_0D_PROMISE_ACTIVATION',
  'promise lifecycle must keep append-only history separate from one replaceable current-state projection'
);
requireCondition(
  promise.completion_gate_projection?.owner === '@rus/social-law'
    && exactSet(promise.completion_gate_projection?.evaluation_after, [
      'factual_disposition_or_world_event_commit',
      'promise_current_state_transition'
    ])
    && exactSet(promise.completion_gate_projection?.allowed_current_state_facts, [
      'promise_current_not_offered',
      'promise_current_offered',
      'promise_current_fulfilled'
    ])
    && exactSet(promise.completion_gate_projection?.forbidden_current_state_facts, [
      'promise_current_active',
      'promise_current_broken'
    ])
    && promise.completion_gate_projection?.projected_committed_fact === 'promise_state_admitted_for_full_completion'
    && promise.completion_gate_projection?.missing_or_conflicting_current_state === 'typed_promise_completion_gate_conflict'
    && promise.lifecycle_evaluation_order?.join('|') === [
      'factual_disposition_or_world_event_commit',
      'lifecycle_input_projection',
      'promise_current_state_transition',
      'promise_completion_gate_projection',
      'completion_evaluation'
    ].join('|'),
  'TRACE_0D_PROMISE_COMPLETION_GATE',
  'promise lifecycle must transition after factual disposition and gate full completion on an allowed current state'
);
const promiseLifecycleInputFacts = [
  ...(promise.offer_timing?.acceptance_preconditions ?? []),
  promise.offer_timing?.surrender_condition,
  promise.offer_timing?.no_further_harm_condition,
  ...promise.transitions.flatMap(({ requires }) => requires ?? []),
  ...promise.lifecycle_input_projections.flatMap(({ source_committed_facts }) => source_committed_facts ?? [])
];
for (const forbiddenUnproducedFact of [
  'offer_accepted',
  'surrender_fact_committed',
  'no_further_harm_fact_committed',
  'no_summary_killing_or_revenge_committed',
  'promisor_action_or_omission_breaches_scope_committed'
]) {
  requireCondition(!promiseLifecycleInputFacts.includes(forbiddenUnproducedFact), 'TRACE_0D_PROMISE_PROJECTION', `promise retains unproduced input ${forbiddenUnproducedFact}`);
}
requireCondition(promise.forbidden_transitions?.length >= 5 && promise.relation_effects?.length > 0 && promise.memory_effects?.length > 0 && promise.testimony_effects?.length > 0 && promise.permitted_npc_decision_influence?.length > 0 && promise.write_target_allowlist?.includes('promise_transition_history') && promise.write_target_allowlist?.includes('promise_current_state_projection'), 'TRACE_0D_PROMISE_LIFECYCLE', 'promise lifecycle effects/write targets incomplete');
for (const forbidden of ['pardon', 'innocence', 'release', 'legal_judgment']) requireCondition(promise.forbidden_effects.includes(forbidden), 'TRACE_0D_PROMISE_SCOPE', `promise permits ${forbidden}`);
requireCondition(promise.selected_state === null && promise.materialized_promise === null, 'TRACE_0D_PROMISE_INSTANCE', 'promise is prematurely materialized');

const completionMap = mapUnique(completion.completion_states, 'completion_state_id', 'TRACE_0D_COMPLETION');
requireCondition(
  exactSet(completionMap.get('trace_ld_v1_completion_full')?.all_of_committed_facts, [
    'onisim_found_alive',
    'sealed_packet_returned',
    'seal_intact',
    'conclusion:physical_attack_pattern',
    'conclusion:ratsha_participated',
    'conclusion:principal_zhdanko',
    'temporary_disposition_outcome_committed',
    'promise_state_admitted_for_full_completion'
  ])
    && exactSet(completionMap.get('trace_ld_v1_completion_full')?.none_of_committed_facts, [
    'packet_lost_or_destroyed',
    'seal_damaged',
    'zhdanko_fled',
    'promise_current_broken',
    'partial_outcome:trace_ld_v1_principal_without_direct_voice'
    ]),
  'TRACE_0D_FULL_COMPLETION',
  'full completion lacks exact produced intact inputs or admits a committed partial-outcome dimension'
);
requireCondition(
  exactSet([...completionMap.keys()], ['trace_ld_v1_completion_full', 'trace_ld_v1_completion_partial', 'trace_ld_v1_completion_case_open'])
    && completionMap.get('trace_ld_v1_completion_partial')?.kind === 'partial_completion'
    && exactSet(completionMap.get('trace_ld_v1_completion_partial')?.all_of_committed_facts, ['temporary_disposition_outcome_committed'])
    && exactSet(completionMap.get('trace_ld_v1_completion_partial')?.none_of_completion_states, ['trace_ld_v1_completion_full'])
    && !Object.hasOwn(completionMap.get('trace_ld_v1_completion_partial'), 'any_of_committed_facts')
    && completionMap.get('trace_ld_v1_completion_case_open')?.kind === 'ongoing_open'
    && exactSet(completionMap.get('trace_ld_v1_completion_case_open')?.none_of_committed_facts, ['temporary_disposition_outcome_committed'])
    && !Object.hasOwn(completionMap.get('trace_ld_v1_completion_case_open'), 'any_of_committed_facts'),
  'TRACE_0D_COMPLETION_COVERAGE',
  'primary completion states are not an exhaustive full/open/partial partition'
);
const partialMapping = completion.evidence_resolution_outcome_to_completion_state.find(({ evidence_outcome }) => evidence_outcome === 'partial_outcome:trace_ld_v1_principal_without_direct_voice');
const fullMapping = completion.evidence_resolution_outcome_to_completion_state.find(({ evidence_outcome }) => evidence_outcome === 'conclusion:principal_zhdanko');
requireCondition(
  fullMapping?.admitted_completion_state === 'trace_ld_v1_completion_full'
    && exactSet(fullMapping?.additional_committed_facts_required, [
      'onisim_found_alive',
      'sealed_packet_returned',
      'seal_intact',
      'conclusion:physical_attack_pattern',
      'conclusion:ratsha_participated',
      'temporary_disposition_outcome_committed',
      'promise_state_admitted_for_full_completion'
    ])
    && partialMapping?.admitted_completion_state === 'trace_ld_v1_completion_partial'
    && partialMapping?.never_automatic === true
    && exactSet(partialMapping?.additional_committed_facts_required, ['temporary_disposition_outcome_committed']),
  'TRACE_0D_EVIDENCE_COMPLETION',
  'evidence mapping uses abstract aliases or turns partial evidence into automatic completion'
);
requireCondition(completion.separation_rules?.evidence_resolution_is_not_completion === true && completion.separation_rules?.completion_is_not_epilogue === true && completion.separation_rules?.confession_alone_is_insufficient === true && completion.separation_rules?.one_check_outcome_is_insufficient === true, 'TRACE_0D_COMPLETION_SEPARATION', 'evidence/completion/epilogue separation incomplete');
requireCondition(completion.documentary_requirement?.terminal_slot_ref === 'trace_ld_v1_future_goods_reconciliation' && completion.documentary_requirement?.required_state === 'externally_committed', 'TRACE_0D_DOCUMENTARY_INPUT', 'goods reconciliation is not an external committed input');
const intactPacketCompletionProjection = completion.committed_property_state_projection_inputs?.find(
  ({ projection_id }) => projection_id === 'trace_ld_v1_projection_intact_packet_to_completion_facts'
);
const destroyedPacketCompletionProjection = completion.committed_property_state_projection_inputs?.find(
  ({ projection_id }) => projection_id === 'trace_ld_v1_projection_destroyed_packet_to_completion_facts'
);
requireCondition(
  intactPacketCompletionProjection?.source_property_transition_ref === 'trace_ld_v1_property_packet_recovered_to_player'
    && intactPacketCompletionProjection?.source_consequence_ref === 'trace_ld_v1_consequence_intact_packet_returned_and_seal_observed'
    && intactPacketCompletionProjection?.requires_committed_state?.physical_parent_ref === null
    && intactPacketCompletionProjection?.requires_committed_state?.holder_ref === 'player_clerk'
    && intactPacketCompletionProjection?.requires_committed_state?.controller_ref === 'player_clerk'
    && intactPacketCompletionProjection?.requires_committed_state?.seal_state === 'intact'
    && exactSet(intactPacketCompletionProjection?.projected_committed_facts, ['sealed_packet_returned', 'seal_intact'])
    && intactPacketCompletionProjection?.projection_commit_boundary === 'after_source_property_transition_and_player_observation_commit'
    && intactPacketCompletionProjection?.direct_completion_state_write === 'forbidden'
    && exactSet(
      intactPacketCompletionProjection.projected_committed_facts,
      intactPacketReturnedConsequence?.committed_fact_outputs
    ),
  'TRACE_0D_INTACT_PACKET_COMPLETION_INPUT',
  'completion lacks an exact fail-closed projection from observed intact packet recovery'
);
requireCondition(
  destroyedPacketCompletionProjection?.source_property_transition_ref === 'trace_ld_v1_property_packet_destroyed'
    && destroyedPacketCompletionProjection?.source_consequence_ref === 'trace_ld_v1_consequence_zhdanko_document_destroyed'
    && destroyedPacketCompletionProjection?.requires_committed_state?.seal_state === 'destroyed'
    && destroyedPacketCompletionProjection?.requires_committed_state?.document_condition === 'destroyed_unreadable'
    && destroyedPacketCompletionProjection?.requires_committed_state?.evidence_availability === 'destroyed'
    && exactSet(destroyedPacketCompletionProjection?.projected_committed_facts, ['packet_lost_or_destroyed', 'seal_damaged'])
    && destroyedPacketCompletionProjection?.projection_commit_boundary === 'after_source_property_transition_commit'
    && destroyedPacketCompletionProjection?.direct_completion_state_write === 'forbidden'
    && exactSet(
      destroyedPacketCompletionProjection.projected_committed_facts,
      documentDestroyedConsequence?.committed_fact_outputs
    ),
  'TRACE_0D_DESTROYED_PACKET_COMPLETION_INPUT',
  'completion lacks an exact fail-closed projection from committed destroyed packet state'
);
requireCondition(
  completion.committed_property_state_projection_inputs?.length === 2,
  'TRACE_0D_COMPLETION_PROJECTION_SET',
  'completion property-state projection set must contain only the exact intact and destroyed packet projections'
);
const outcomeModel = completion.completion_outcome_model;
const dimensionMap = mapUnique(completion.completion_dimensions, 'dimension_id', 'TRACE_0D_COMPLETION_DIMENSION');
const expectedDimensions = ['onisim_fate', 'packet_state', 'seal_state', 'wreck_cause_resolution', 'ratsha_participation_resolution', 'principal_resolution', 'principal_presence', 'promise_state', 'temporary_disposition_state'];
const partitionPolicy = outcomeModel?.primary_state_partition_policy;
requireCondition(
  outcomeModel?.kind === 'primary_state_with_ordered_independent_dimensions'
    && exactSet(outcomeModel?.primary_state_precedence, [...completionMap.keys()])
    && outcomeModel.primary_state_precedence.join('|') === 'trace_ld_v1_completion_full|trace_ld_v1_completion_case_open|trace_ld_v1_completion_partial'
    && exactSet(outcomeModel?.evaluation_order, ['validate_dimension_conflicts', 'select_primary_state'])
    && outcomeModel.evaluation_order.join('|') === 'validate_dimension_conflicts|select_primary_state'
    && partitionPolicy?.full_state_ref === 'trace_ld_v1_completion_full'
    && partitionPolicy?.case_open_state_ref === 'trace_ld_v1_completion_case_open'
    && partitionPolicy?.case_open_when_fact_absent === 'temporary_disposition_outcome_committed'
    && partitionPolicy?.partial_state_ref === 'trace_ld_v1_completion_partial'
    && partitionPolicy?.partial_when_fact_present_and_full_not_selected === 'temporary_disposition_outcome_committed'
    && partitionPolicy?.unresolved_dimension_values_are_preserved === true
    && partitionPolicy?.negative_fact_inference_from_absence === 'forbidden'
    && partitionPolicy?.valid_terminal_snapshot_coverage === 'exactly_one_primary_state_after_dimension_conflict_validation'
    && exactSet(outcomeModel?.dimension_order, expectedDimensions)
    && outcomeModel.dimension_order.join('|') === expectedDimensions.join('|')
    && outcomeModel?.primary_state_cardinality === 'exactly_one_after_dimension_conflict_validation'
    && outcomeModel?.dimension_cardinality === 'exactly_one_value_per_dimension_or_typed_conflict'
    && outcomeModel?.cross_dimension_composition === 'allowed'
    && outcomeModel?.intra_dimension_conflict === 'typed_completion_dimension_conflict'
    && outcomeModel?.ordered_output === true
    && outcomeModel?.result_schema?.schema === 'rus.trace_composite_completion_outcome.v1'
    && exactSet(outcomeModel?.result_schema?.required, ['primary_completion_state', 'ordered_dimension_outcomes', 'source_commit_version'])
    && outcomeModel?.result_schema?.additional_dimensions === 'forbidden'
    && outcomeModel?.selected_completion_outcome === null
    && exactSet([...dimensionMap.keys()], expectedDimensions),
  'TRACE_0D_COMPLETION_COMPOSITION',
  'completion outcome is not a deterministic primary state with ordered independent dimensions'
);
for (const dimension of dimensionMap.values()) {
  const valuesById = mapUnique(dimension.values, 'value_id', 'TRACE_0D_COMPLETION_DIMENSION');
  const fallbackValues = [...valuesById.values()].filter(({ when_no_known_fact }) => when_no_known_fact === true);
  requireCondition(fallbackValues.length === 1, 'TRACE_0D_COMPLETION_DIMENSION', `${dimension.dimension_id} must have exactly one unresolved fallback`);
  const facts = new Set();
  for (const value of valuesById.values()) {
    if (value.when_no_known_fact === true) continue;
    requireCondition(Array.isArray(value.when_any_of_committed_facts) && value.when_any_of_committed_facts.length > 0, 'TRACE_0D_COMPLETION_DIMENSION', `${dimension.dimension_id}.${value.value_id} lacks committed fact inputs`);
    for (const fact of value.when_any_of_committed_facts) {
      requireCondition(!facts.has(fact), 'TRACE_0D_COMPLETION_DIMENSION', `${dimension.dimension_id} maps one fact to multiple values`);
      facts.add(fact);
    }
  }
}
const completionInputFacts = new Set();
for (const state of completionMap.values()) {
  for (const field of ['all_of_committed_facts', 'any_of_committed_facts', 'none_of_committed_facts']) {
    for (const fact of state[field] ?? []) completionInputFacts.add(fact);
  }
}
for (const dimension of dimensionMap.values()) {
  for (const value of dimension.values) {
    for (const fact of value.when_any_of_committed_facts ?? []) completionInputFacts.add(fact);
  }
}
const internalCompletionProducerGroups = completion.completion_fact_provenance?.internal_producers ?? [];
const externalCompletionSourceGroups = completion.completion_fact_provenance?.external_committed_sources ?? [];
requireCondition(
  completion.completion_fact_provenance?.undeclared_fact_policy === 'forbidden'
    && internalCompletionProducerGroups.length === 7
    && externalCompletionSourceGroups.length === 2,
  'TRACE_0D_COMPLETION_PROVENANCE',
  'completion fact provenance registry is incomplete or open-ended'
);
const provenanceFacts = new Set();
for (const group of [...internalCompletionProducerGroups, ...externalCompletionSourceGroups]) {
  requireCondition(unique(group.fact_ids) && group.fact_ids.length > 0, 'TRACE_0D_COMPLETION_PROVENANCE', 'completion provenance group has invalid facts');
  for (const fact of group.fact_ids) {
    requireCondition(!provenanceFacts.has(fact), 'TRACE_0D_COMPLETION_PROVENANCE', `completion fact has duplicate provenance: ${fact}`);
    provenanceFacts.add(fact);
  }
}
requireCondition(
  exactSet([...provenanceFacts], [...completionInputFacts]),
  'TRACE_0D_COMPLETION_PROVENANCE',
  'a completion input fact has no exact internal producer or typed external committed source'
);
const internalProducerMap = mapUnique(internalCompletionProducerGroups, 'producer_ref', 'TRACE_0D_COMPLETION_PROVENANCE');
for (const consequenceRef of [
  'trace_ld_v1_consequence_intact_packet_returned_and_seal_observed',
  'trace_ld_v1_consequence_zhdanko_document_destroyed'
]) {
  const group = internalProducerMap.get(consequenceRef);
  requireCondition(
    group?.producer_kind === 'consequence_profile'
      && exactSet(group?.fact_ids, consequenceMap.get(consequenceRef)?.committed_fact_outputs),
    'TRACE_0D_COMPLETION_PRODUCER',
    `${consequenceRef} does not produce its declared completion facts`
  );
}
for (const [consequenceRef, completionFacts] of [
  ['trace_ld_v1_consequence_zhdanko_submission_committed', ['zhdanko_submission_committed']],
  ['trace_ld_v1_consequence_bounded_group_disarm_committed', ['zhdanko_disarmed_and_temporarily_restrained']]
]) {
  const group = internalProducerMap.get(consequenceRef);
  const sourceOutputs = consequenceMap.get(consequenceRef)?.committed_fact_outputs;
  requireCondition(
    group?.producer_kind === 'consequence_profile'
      && exactSet(group?.source_output_fact_ids, sourceOutputs)
      && exactSet(group?.fact_ids, completionFacts)
      && completionFacts.every((fact) => sourceOutputs?.includes(fact)),
    'TRACE_0D_COMPLETION_PRODUCER',
    `${consequenceRef} does not expose the exact existing NPC committed fact consumed by completion`
  );
}
const exitProducer = internalProducerMap.get('trace_ld_v1_scope_exit_storehouse_by_small_boat');
const producerScopeExit = movement.active_scope_exit_bindings.find(({ exit_binding_id }) => exit_binding_id === exitProducer?.producer_ref);
requireCondition(
  exitProducer?.producer_kind === 'active_scope_exit_binding'
    && exactSet(exitProducer?.fact_ids, ['zhdanko_fled'])
    && producerScopeExit?.terminal_commit_effects?.includes('zhdanko_fled'),
  'TRACE_0D_COMPLETION_PRODUCER',
  'Zhdanko flight completion fact lacks the exact committed scope-exit producer'
);
const promiseProducer = internalProducerMap.get('trace_ld_v1_promise_no_summary_killing');
const promiseHistoryFacts = promise.transitions.map(({ history_event_output }) => history_event_output);
const promiseCurrentFacts = promise.transitions.map(({ current_state_projection }) => current_state_projection?.next_fact);
const promiseLifecycleProjectionFacts = promise.lifecycle_input_projections.map(({ projected_committed_fact }) => projected_committed_fact);
requireCondition(
  promiseProducer?.producer_kind === 'promise_policy_transition'
    && exactSet(promiseProducer?.source_history_event_fact_ids, promiseHistoryFacts)
    && exactSet(promiseProducer?.source_projection_fact_ids, promiseLifecycleProjectionFacts)
    && exactSet(promiseProducer?.fact_ids, [
      ...promiseCurrentFacts.filter((fact) => fact !== 'promise_current_offered'),
      promise.completion_gate_projection.projected_committed_fact
    ])
    && promiseProducer?.current_state_slot === promise.history_and_current_state_contract.current_state_slot
    && promiseProducer?.history_events_as_completion_inputs === 'forbidden'
    && promiseHistoryFacts.every((fact) => !completionInputFacts.has(fact))
    && promiseLifecycleProjectionFacts.every((fact) => !completionInputFacts.has(fact))
    && promiseCurrentFacts.filter((fact) => fact !== 'promise_current_offered').every((fact) => completionInputFacts.has(fact))
    && completionInputFacts.has(promise.completion_gate_projection.projected_committed_fact),
  'TRACE_0D_COMPLETION_PRODUCER',
  'promise completion facts must come only from the exact current-state projection, never transition history'
);
const temporaryDecisionProducer = internalProducerMap.get('trace_ld_v1_consequence_temporary_disposition_committed');
const temporaryDecisionActivity = activityMap.get('trace_ld_v1_activity_temporary_decision');
requireCondition(
  temporaryDecisionProducer?.producer_kind === 'typed_temporary_disposition_consequence_and_activity_cancellation'
    && temporaryDecisionProducer?.cancellation_activity_ref === temporaryDecisionActivity?.profile_id
    && exactSet(temporaryDecisionProducer?.fact_ids, [
      ...temporaryDispositionConsequence.committed_fact_outputs,
      temporaryDecisionActivity?.cancellation_committed_fact_output
    ]),
  'TRACE_0D_COMPLETION_PRODUCER',
  'temporary-decision completion facts lack exact completion/cancellation outputs'
);
const externalSourceMap = mapUnique(externalCompletionSourceGroups, 'source_ref', 'TRACE_0D_COMPLETION_PROVENANCE');
const evidenceOutputRefs = new Set([
  ...evidenceSource.conclusions.map((conclusionId) => `conclusion:${conclusionId}`),
  ...evidenceSource.principal_inference_policy.cross_chain_inference.approved_combinations.map(({ outcome_ref }) => outcome_ref),
  ...evidenceSource.principal_inference_policy.partial_outcomes.map(({ partial_outcome_id }) => `partial_outcome:${partial_outcome_id}`)
]);
const evidenceCompletionFacts = [
  'conclusion:physical_attack_pattern',
  'conclusion:ratsha_participated',
  'conclusion:principal_zhdanko',
  'partial_outcome:trace_ld_v1_principal_without_direct_voice'
];
const onisimProjection = externalSourceMap.get('trace_ld_v1_observation_onisim_alive_at_drying_shed');
const onisimCondition = conditionMap.get(onisimArrivalObservation?.trigger?.subject_body_condition_ref);
requireCondition(
  externalSourceMap.get('trace_ld_v1_clue_evidence_graph_set')?.source_kind === 'phase_0c_evidence_resolution'
    && evidenceSource.clue_evidence_graph_set_id === 'trace_ld_v1_clue_evidence_graph_set'
    && exactSet(externalSourceMap.get('trace_ld_v1_clue_evidence_graph_set')?.fact_ids, evidenceCompletionFacts)
    && evidenceCompletionFacts.every((fact) => evidenceOutputRefs.has(fact))
    && onisimProjection?.source_kind === 'committed_scene_observation_projection'
    && onisimProjection?.source_consequence_ref === onisimArrivalConsequence?.consequence_id
    && onisimProjection?.requires_route_terminal_commit_ref === campToShedRoute?.route_id
    && onisimCondition?.subject === 'onisim_boatman'
    && onisimCondition?.state === 'injured_unable_to_walk'
    && onisimCondition?.permitted_transitions?.includes('stabilized_unable_to_walk')
    && onisimProjection?.requires_source_subject === onisimCondition.subject
    && exactSet(onisimProjection?.requires_any_committed_source_state, [onisimCondition.state, 'stabilized_unable_to_walk'])
    && onisimProjection?.projection_commit_boundary === 'after_route_terminal_position_and_direct_scene_observation_commit'
    && onisimProjection?.treatment_dependency === 'forbidden'
    && onisimProjection?.unmapped_death_state_policy === 'fail_closed_no_dead_completion_value'
    && exactSet(onisimProjection?.fact_ids, ['onisim_found_alive'])
    && !completionInputFacts.has('onisim_dead'),
  'TRACE_0D_COMPLETION_EXTERNAL_SOURCE',
  'external completion input does not resolve to an actual 0C output or an exact observed body-state projection'
);
const stateMatches = (state, facts, selectedStates) => {
  const all = state.all_of_committed_facts ?? [];
  const any = state.any_of_committed_facts ?? [];
  const none = state.none_of_committed_facts ?? [];
  const noneStates = state.none_of_completion_states ?? [];
  return all.every((fact) => facts.has(fact))
    && (any.length === 0 || any.some((fact) => facts.has(fact)))
    && none.every((fact) => !facts.has(fact))
    && noneStates.every((stateId) => !selectedStates.has(stateId));
};
const hasDimensionConflict = (facts) => {
  for (const dimension of dimensionMap.values()) {
    const matchingValues = dimension.values.filter(
      ({ when_any_of_committed_facts: requiredFacts }) => requiredFacts?.some((fact) => facts.has(fact))
    );
    if (matchingValues.length > 1) return true;
  }
  return false;
};
const resolvePrimaryStateForValidation = (factValues) => {
  const facts = new Set(factValues);
  if (hasDimensionConflict(facts)) return { result: 'typed_completion_dimension_conflict', selected: [] };
  const selected = new Set();
  const matches = [];
  for (const stateId of outcomeModel.primary_state_precedence) {
    const state = completionMap.get(stateId);
    if (stateMatches(state, facts, selected)) {
      selected.add(stateId);
      matches.push(stateId);
    }
  }
  return {
    result: matches.length === 1 ? matches[0] : 'typed_no_or_ambiguous_completion_match',
    selected: matches
  };
};
const simultaneousPartialFacts = [
  'onisim_found_alive',
  'sealed_packet_returned',
  'seal_damaged',
  'conclusion:physical_attack_pattern',
  'conclusion:ratsha_participated',
  'conclusion:principal_zhdanko',
  'zhdanko_fled',
  'promise_current_broken',
  'temporary_disposition_outcome_committed'
];
requireCondition(
  resolvePrimaryStateForValidation(simultaneousPartialFacts).result === 'trace_ld_v1_completion_partial',
  'TRACE_0D_COMPLETION_COMPOSITION',
  'simultaneous damaged seal, broken promise, proved principal and flight do not resolve to one primary partial state'
);
const fullCompletionFacts = completionMap.get('trace_ld_v1_completion_full').all_of_committed_facts;
const completionCoverageMatrix = [
  {
    case_id: 'temporary_decision_principal_unresolved',
    facts: ['temporary_disposition_outcome_committed', 'onisim_found_alive', 'sealed_packet_returned', 'seal_intact', 'conclusion:physical_attack_pattern', 'conclusion:ratsha_participated'],
    expected: 'trace_ld_v1_completion_partial'
  },
  {
    case_id: 'temporary_decision_ratsha_unresolved',
    facts: ['temporary_disposition_outcome_committed', 'onisim_found_alive', 'sealed_packet_returned', 'seal_intact', 'conclusion:physical_attack_pattern', 'conclusion:principal_zhdanko'],
    expected: 'trace_ld_v1_completion_partial'
  },
  {
    case_id: 'temporary_decision_onisim_unresolved',
    facts: ['temporary_disposition_outcome_committed', 'sealed_packet_returned', 'seal_intact', 'conclusion:physical_attack_pattern', 'conclusion:ratsha_participated', 'conclusion:principal_zhdanko'],
    expected: 'trace_ld_v1_completion_partial'
  },
  {
    case_id: 'temporary_decision_intact_packet_incomplete_investigation',
    facts: ['temporary_disposition_outcome_committed', 'sealed_packet_returned', 'seal_intact', 'conclusion:physical_attack_pattern'],
    expected: 'trace_ld_v1_completion_partial'
  },
  {
    case_id: 'temporary_decision_only',
    facts: ['temporary_disposition_outcome_committed'],
    expected: 'trace_ld_v1_completion_partial'
  },
  {
    case_id: 'full_conjunction',
    facts: fullCompletionFacts,
    expected: 'trace_ld_v1_completion_full'
  },
  {
    case_id: 'temporary_decision_absent',
    facts: ['onisim_found_alive', 'sealed_packet_returned', 'seal_intact'],
    expected: 'trace_ld_v1_completion_case_open'
  }
];
for (const coverageCase of completionCoverageMatrix) {
  const resolution = resolvePrimaryStateForValidation(coverageCase.facts);
  requireCondition(
    resolution.result === coverageCase.expected && resolution.selected.length === 1,
    'TRACE_0D_COMPLETION_PARTITION',
    `${coverageCase.case_id} does not resolve to exactly one approved primary state`
  );
}
const conflictingDimensionResolution = resolvePrimaryStateForValidation([
  'temporary_disposition_outcome_committed',
  'sealed_packet_returned',
  'packet_lost_or_destroyed'
]);
requireCondition(
  conflictingDimensionResolution.result === 'typed_completion_dimension_conflict'
    && conflictingDimensionResolution.selected.length === 0,
  'TRACE_0D_COMPLETION_PARTITION',
  'a conflicting dimension reaches primary state selection instead of typed conflict'
);
requireCondition(completion.selected_completion_outcome === null && !Object.hasOwn(completion, 'selected_completion_state'), 'TRACE_0D_COMPLETION_INSTANCE', 'definition chooses a completion state/outcome or retains the ambiguous single-state slot');

requireCondition(epilogue.narration_factual_writes === 'forbidden' && epilogue.completion_change_after_narration === 'forbidden', 'TRACE_0D_NARRATION_WRITE', 'narration can write facts or change completion');
requireCondition(exactSet(epilogue.allowed_completion_states, [...completionMap.keys()]), 'TRACE_0D_EPILOGUE_COMPLETION', 'epilogue completion allowlist does not match completion states');
requireCondition(exactSet(epilogue.allowed_completion_dimensions, expectedDimensions), 'TRACE_0D_EPILOGUE_COMPLETION', 'epilogue completion dimension allowlist does not match the composite outcome');
const visibleOutcomeProjection = epilogue.objective_to_player_visible_projection;
const visibleDimensionRuleMap = mapUnique(visibleOutcomeProjection?.dimension_projection_rules, 'dimension_id', 'TRACE_0D_EPILOGUE_VISIBILITY');
const packetVisibilityRuleMap = mapUnique(visibleDimensionRuleMap.get('packet_state')?.objective_value_visibility, 'objective_value_id', 'TRACE_0D_EPILOGUE_VISIBILITY');
const sealVisibilityRuleMap = mapUnique(visibleDimensionRuleMap.get('seal_state')?.objective_value_visibility, 'objective_value_id', 'TRACE_0D_EPILOGUE_VISIBILITY');
requireCondition(
  visibleOutcomeProjection?.owner === '@rus/visibility-knowledge-memory'
    && visibleOutcomeProjection?.source === 'committed_composite_completion_outcome'
    && visibleOutcomeProjection?.visibility_source === 'visible_committed_facts'
    && visibleOutcomeProjection?.raw_objective_outcome_in_narration === 'forbidden'
    && visibleOutcomeProjection?.raw_objective_dimensions_in_narration === 'forbidden'
    && visibleOutcomeProjection?.visible_primary_state_policy === 'preserve_primary_state_without_hidden_reason_or_unobserved_dimension_values'
    && exactSet([...visibleDimensionRuleMap.keys()], ['packet_state', 'seal_state'])
    && packetVisibilityRuleMap.get('returned')?.requires_visible_committed_fact === 'sealed_packet_returned'
    && packetVisibilityRuleMap.get('returned')?.visible_value_id === 'returned'
    && packetVisibilityRuleMap.get('lost_or_destroyed')?.requires_visible_committed_fact === 'destroyed_packet_state_observed'
    && packetVisibilityRuleMap.get('lost_or_destroyed')?.visible_value_id === 'lost_or_destroyed'
    && visibleDimensionRuleMap.get('packet_state')?.unobserved_value_id === 'unresolved'
    && sealVisibilityRuleMap.get('intact')?.requires_visible_committed_fact === 'seal_intact'
    && sealVisibilityRuleMap.get('intact')?.visible_value_id === 'intact'
    && sealVisibilityRuleMap.get('damaged')?.requires_visible_committed_fact === 'destroyed_seal_state_observed'
    && sealVisibilityRuleMap.get('damaged')?.visible_value_id === 'damaged'
    && visibleDimensionRuleMap.get('seal_state')?.unobserved_value_id === 'unresolved'
    && visibleOutcomeProjection?.other_dimension_policy === 'project_only_from_matching_visible_committed_fact_else_unresolved'
    && visibleOutcomeProjection?.visible_property_projection?.source === 'committed_property_state'
    && visibleOutcomeProjection?.visible_property_projection?.raw_source_in_narration === 'forbidden'
    && visibleOutcomeProjection?.visible_property_projection?.include_field_only_with_supporting_visible_committed_fact === true
    && visibleOutcomeProjection?.visible_property_projection?.unobserved_fields === 'omit'
    && visibleOutcomeProjection?.typed_failure === 'typed_player_visible_epilogue_projection_incomplete',
  'TRACE_0D_EPILOGUE_VISIBILITY',
  'player-facing epilogue projection can expose unobserved objective completion or property state'
);
for (const hidden of epilogue.forbidden_hidden_fields) requireCondition(!epilogue.terminal_projection_allowlist.includes(hidden), 'TRACE_0D_HIDDEN_PROJECTION', `hidden field admitted: ${hidden}`);
requireCondition(
  exactSet(epilogue.terminal_projection_allowlist, [
    'visible_completion_state',
    'visible_completion_dimensions',
    'visible_onisim_fate',
    'visible_packet_state',
    'visible_seal_state',
    'visible_sealed_packet_holder',
    'visible_sealed_packet_controller',
    'visible_proved_conclusions',
    'visible_committed_witnesses',
    'visible_promise_state',
    'visible_committed_relationships',
    'visible_committed_injuries',
    'visible_committed_property_projection',
    'elapsed_game_time',
    'visible_temporary_disposition',
    'visible_committed_goods_reconciliation'
  ])
    && ['objective_completion_outcome', 'completion_dimensions', 'committed_property_state', 'unobserved_objective_facts'].every(
      (field) => epilogue.forbidden_hidden_fields.includes(field)
    ),
  'TRACE_0D_EPILOGUE_ALLOWLIST',
  'epilogue projection is not an exact visibility-filtered allowlist'
);
requireCondition(
  exactSet(epilogue.narration_input_schema?.required, ['visible_completion_state', 'visible_completion_dimensions', 'visible_committed_facts', 'elapsed_game_time']),
  'TRACE_0D_EPILOGUE_COMPLETION',
  'narration input does not require visibility-filtered completion dimensions'
);
for (const forbidden of ['guaranteed_onisim_recovery', 'punishment_without_committed_authority_and_policy', 'invent_goods_reconciliation']) requireCondition(epilogue.forbidden_claims.includes(forbidden), 'TRACE_0D_EPILOGUE_BOUNDARY', `epilogue does not forbid ${forbidden}`);
requireCondition(epilogue.selected_epilogue === null && epilogue.materialized_projection === null, 'TRACE_0D_EPILOGUE_INSTANCE', 'epilogue is prematurely selected/materialized');

const concrete = definition.concrete_party_selections;
requireCondition(concrete?.player_name === null && concrete?.player_profile === null && concrete?.party_truth === null && concrete?.game_timestamp === null && concrete?.environment_snapshot === null && concrete?.completion_state === null && concrete?.epilogue === null, 'TRACE_0D_PARTY_SELECTION', 'definition contains a concrete party selection');
for (const key of ['npc_decisions', 'item_placements', 'rolls']) requireCondition(Array.isArray(concrete[key]) && concrete[key].length === 0, 'TRACE_0D_PARTY_SELECTION', `definition contains concrete ${key}`);
for (const [value, keys] of [
  [activities, ['materialized_activity_attempts', 'committed_rolls', 'selected_outcomes']],
  [npc, ['selected_decisions', 'materialized_schedules']],
  [movement, ['selected_routes', 'materialized_traversals']],
  [access, ['selected_access_results']],
  [capacity, ['materialized_occupancy']],
  [body, ['applied_effects']]
]) {
  for (const key of keys) requireCondition(Array.isArray(value[key]) && value[key].length === 0, 'TRACE_0D_CONCRETE_INSTANCE', `${key} must remain empty`);
}

const scan = (value, path = []) => {
  if (typeof value === 'string') {
    if (/scene_number|turn_number|player_progress_flag/iu.test(value) && !path.includes('forbidden_inputs') && !path.includes('forbidden_sources')) fail('TRACE_0D_SCENE_TIMER', `scene/turn timer value forbidden at ${path.join('.')}`);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scan(entry, [...path, index]));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.toLowerCase();
    if (['fallback_policy', 'normalization_policy', 'alias_policy'].includes(normalized)) {
      requireCondition(path.length === 0 && child === 'forbidden', 'TRACE_0D_SEMANTIC_FALLBACK', `semantic policy is nested or enabled at ${[...path, key].join('.')}`);
    } else if (/alias|normaliz|fallback/iu.test(normalized)) {
      fail('TRACE_0D_SEMANTIC_FALLBACK', `alias, normalization, or fallback field is forbidden at ${[...path, key].join('.')}`);
    }
    if (/scene_number|turn_number/iu.test(normalized) && !path.includes('forbidden_inputs')) fail('TRACE_0D_SCENE_TIMER', `scene/turn timer field forbidden at ${[...path, key].join('.')}`);
    if (/runtime_handler|api_binding|scenario_publication_binding|persistence_binding|materializer_binding/iu.test(normalized)) fail('TRACE_0D_RUNTIME_BINDING', `runtime/API/persistence binding forbidden at ${[...path, key].join('.')}`);
    if (['quest_engine', 'universal_quest_engine', 'evaluator', 'api', 'ui', 'persistence', 'migrations'].includes(normalized)) fail('TRACE_0D_RUNTIME_BINDING', `universal engine/runtime capability forbidden at ${[...path, key].join('.')}`);
    if (['party_id', 'party_instance', 'materialized_party', 'selected_npc_decision'].includes(normalized) && child !== null && child !== undefined) fail('TRACE_0D_CONCRETE_INSTANCE', `concrete party/runtime value forbidden at ${[...path, key].join('.')}`);
    scan(child, [...path, key]);
  }
};
for (const value of [...Object.values(values), manifest]) scan(value);

console.log(JSON.stringify({
  package_id: manifest.package_id,
  scenario_revision: definition.revision,
  policy_category_count: Object.keys(definition.resolved_policy_refs).length,
  unresolved_count: definition.required_unresolved_refs.length,
  content_digest: manifest.content_digest
}));
