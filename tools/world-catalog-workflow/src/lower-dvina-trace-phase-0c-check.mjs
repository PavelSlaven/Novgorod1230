import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

class TracePhase0CValidationError extends Error {
  constructor(code, message) {
    super(`lower-dvina trace phase 0C [${code}]: ${message}`);
    this.name = 'TracePhase0CValidationError';
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
  throw new TracePhase0CValidationError(
    'TRACE_0C_SOURCE_OVERRIDE_FORBIDDEN',
    'directory override is allowed only for validation fixtures'
  );
}
const directory = directoryArgument
  ? resolve(directoryArgument)
  : resolve(root, 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0c');

const files = Object.freeze([
  'definition.json',
  'item-container-set.json',
  'hidden-truth-candidate-set.json',
  'clue-evidence-graph-set.json',
  'knowledge-lie-memory-rules.json'
]);
const trustedDigests = Object.freeze({
  'definition.json': '23e4600585abe27557ab1acdcadde1fee041cf55e05f096a21ac025c96f26c24',
  'item-container-set.json': '182fb92641c8c053027718f52eed3467ce9ed79971e7168f4bc8727e1a169a3f',
  'hidden-truth-candidate-set.json': 'b4601339813dd253a7a280cd68ad0925202c989998c6cae5bca9e820f1a7b616',
  'clue-evidence-graph-set.json': '7ad621e00550ddf4b1a714c4effc9c678ed7c3c2e421ce0e4128bf998b0b8222',
  'knowledge-lie-memory-rules.json': '6c296a6ebe096633ae58c9ff45dc4a44f92ce56d7843e10bc3133718e6155046'
});

const fail = (code, message) => { throw new TracePhase0CValidationError(code, message); };
const requireCondition = (condition, code, message) => { if (!condition) fail(code, message); };
const readJsonPath = (path) => JSON.parse(readFileSync(path, 'utf8'));
const readJson = (name) => readJsonPath(resolve(directory, name));
const sha256Path = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const sha256 = (name) => sha256Path(resolve(directory, name));
const digestValue = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const unique = (values) => Array.isArray(values) && new Set(values).size === values.length;
const exactSet = (values, expected) => unique(values)
  && values.length === expected.length
  && expected.every((value) => values.includes(value));
const exactArray = (values, expected) => Array.isArray(values)
  && values.length === expected.length
  && values.every((value, index) => value === expected[index]);
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const mapUnique = (values, key, code) => {
  requireCondition(Array.isArray(values), code, `${key} collection is required`);
  const result = new Map();
  for (const value of values) {
    requireCondition(text(value?.[key]) && !result.has(value[key]), code, `${key} is missing or duplicated`);
    result.set(value[key], value);
  }
  return result;
};
const assertForbiddenPolicies = (value, label) => {
  for (const key of ['fallback_policy', 'normalization_policy', 'alias_policy']) {
    requireCondition(value?.[key] === 'forbidden', 'TRACE_0C_SEMANTIC_FALLBACK', `${label} ${key} must be forbidden`);
  }
};

const definition = readJson('definition.json');
const items = readJson('item-container-set.json');
const hidden = readJson('hidden-truth-candidate-set.json');
const evidence = readJson('clue-evidence-graph-set.json');
const knowledge = readJson('knowledge-lie-memory-rules.json');
const manifest = readJson('manifest.json');

requireCondition(
  manifest.schema === 'rus.trace_phase_0c_manifest.v1'
    && manifest.package_id === 'lower_dvina_trace_phase_0c_v1'
    && manifest.revision === 1
    && manifest.publication_status === 'unpublished',
  'TRACE_0C_MANIFEST_IDENTITY',
  'manifest identity is invalid'
);
assertForbiddenPolicies(manifest, 'manifest');
requireCondition(
  exactSet(Object.keys(manifest.files ?? {}), files),
  'TRACE_0C_MANIFEST_FILES',
  'manifest file set is incomplete or contains an unknown artifact'
);
for (const name of files) {
  const actual = sha256(name);
  requireCondition(
    digestValue(manifest.files[name]) && manifest.files[name] === actual,
    'TRACE_0C_DIGEST_MISMATCH',
    `manifest digest mismatch: ${name}`
  );
  requireCondition(
    validationOnly || actual === trustedDigests[name],
    'TRACE_0C_TRUSTED_DIGEST_MISMATCH',
    `trusted digest mismatch: ${name}`
  );
}

const expectedDependencyPaths = Object.freeze({
  phase_0a_player_profile_set:
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/player-profile-set.json',
  phase_0b_participant_profile_set:
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0b/participant-profile-set.json',
  phase_0b_location_topology_set:
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0b/location-topology-set.json'
});
const expectedDependencies = Object.freeze({
  phase_0a_player_profile_set: [
    'lower_dvina_trace_player_profile_set_v1',
    1,
    '2a25fd04f0e9b71f1ab2805cd3d68620d9ea2d1646e0671e128e886eb54ee865'
  ],
  phase_0b_participant_profile_set: [
    'trace_ld_v1_participant_profile_set',
    1,
    '33e45b8b8b57f98debb254e5e76c881cf3ffe10985042811ed85390e38f588ce'
  ],
  phase_0b_location_topology_set: [
    'trace_ld_v1_location_topology_set',
    1,
    '3410d8652aa87d76a2be37cf6f21b9179ac3dd61c88ea84b94486b19765342ce'
  ]
});
requireCondition(
  exactSet(
    Object.keys(manifest.immutable_dependency_refs ?? {}),
    Object.keys(expectedDependencies)
  ),
  'TRACE_0C_IMMUTABLE_DEPENDENCY',
  'immutable dependency set is incomplete or contains an unknown ref'
);
const dependencyPaths = {};
for (const [key, [id, revision, digest]] of Object.entries(expectedDependencies)) {
  const ref = manifest.immutable_dependency_refs?.[key];
  const expectedPath = expectedDependencyPaths[key];
  const declaredPath = resolve(root, ref?.path ?? '');
  requireCondition(
    ref?.id === id
      && ref?.revision === revision
      && ref?.path === expectedPath
      && ref?.digest === digest
      && sha256Path(declaredPath) === digest,
    'TRACE_0C_IMMUTABLE_DEPENDENCY',
    `immutable 0A/0B dependency changed or is not exact: ${key}`
  );
  dependencyPaths[key] = declaredPath;
}
const expectedRevision2Path =
  'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0b/definition.json';
const revision2Path = resolve(root, manifest.superseded_definition_ref?.path ?? '');
requireCondition(
  manifest.superseded_definition_ref?.id === 'lower_dvina_trace_v1'
    && manifest.superseded_definition_ref?.revision === 2
    && manifest.superseded_definition_ref?.path === expectedRevision2Path
    && manifest.superseded_definition_ref?.digest === '3b19de63027c1aa989f23e37c953bdb6559f569e5357c160de2ccd89905f3182'
    && sha256Path(revision2Path) === manifest.superseded_definition_ref.digest,
  'TRACE_0C_SUPERSEDES',
  'revision 2 definition ref or digest is invalid'
);

const phase0bDefinition = readJsonPath(revision2Path);
const participants = readJsonPath(dependencyPaths.phase_0b_participant_profile_set);
const locations = readJsonPath(dependencyPaths.phase_0b_location_topology_set);
const participantRefs = new Set(participants.participant_slots);
const locationRefs = new Set(locations.location_profiles.map(({ location_profile_id }) => location_profile_id));
const knowledgeScopes = new Map(participants.knowledge_scope_profiles.map((profile) => [profile.profile_id, profile]));
const knowledgeScopeRefs = new Set(knowledgeScopes.keys());
const placementSlotRefs = new Set(items.placement_slots?.map(({ placement_slot_id }) => placement_slot_id));

requireCondition(
  definition.schema === 'rus.trace_scenario_definition.v1'
    && definition.scenario_id === 'lower_dvina_trace_v1'
    && definition.revision === 3
    && definition.publication_status === 'unpublished',
  'TRACE_0C_DEFINITION_IDENTITY',
  'revision 3 identity is invalid'
);
requireCondition(
  definition.supersedes_definition_ref?.id === 'lower_dvina_trace_v1'
    && definition.supersedes_definition_ref?.revision === 2
    && definition.supersedes_definition_ref?.digest === sha256Path(revision2Path),
  'TRACE_0C_SUPERSEDES',
  'revision 3 does not exact-supersede immutable revision 2'
);
requireCondition(
  sameJson(definition.applicability, phase0bDefinition.applicability)
    && sameJson(definition.player_profile_set_ref, phase0bDefinition.player_profile_set_ref)
    && sameJson(definition.social_catalog_source_ref, phase0bDefinition.social_catalog_source_ref)
    && sameJson(definition.spatial_source_ref, phase0bDefinition.spatial_source_ref)
    && sameJson(definition.participant_profile_set_ref, phase0bDefinition.participant_profile_set_ref)
    && sameJson(definition.location_topology_set_ref, phase0bDefinition.location_topology_set_ref),
  'TRACE_0C_IMMUTABLE_CHAIN',
  'revision 3 changed an immutable 0A/0B ref'
);
requireCondition(
  definition.readiness?.phase_status === 'phase_0_incomplete'
    && definition.readiness?.materialization_status === 'not_materializable'
    && definition.readiness?.publication_status === 'not_publishable',
  'TRACE_0C_READINESS',
  'scenario must remain incomplete, non-materializable, and non-publishable'
);
requireCondition(
  exactSet(definition.excludes, ['party_instance', 'runtime_handlers', 'api_publication']),
  'TRACE_0C_SCOPE',
  'revision 3 scope must exclude party, runtime, and API publication'
);

const contentIdentity = Object.freeze({
  definition: ['rus.trace_scenario_definition.v1', 'lower_dvina_trace_v1', 3, 'definition.json'],
  item_container_set: ['rus.trace_item_container_set.v1', 'trace_ld_v1_item_container_set', 1, 'item-container-set.json'],
  hidden_truth_candidate_set: ['rus.trace_hidden_truth_candidate_set.v1', 'trace_ld_v1_hidden_truth_candidate_set', 1, 'hidden-truth-candidate-set.json'],
  clue_evidence_graph_set: ['rus.trace_clue_evidence_graph_set.v1', 'trace_ld_v1_clue_evidence_graph_set', 1, 'clue-evidence-graph-set.json'],
  knowledge_lie_memory_rules: ['rus.trace_knowledge_lie_memory_rules.v1', 'trace_ld_v1_knowledge_lie_memory_rules', 1, 'knowledge-lie-memory-rules.json']
});
for (const [key, [schema, id, revision, path]] of Object.entries(contentIdentity)) {
  const ref = manifest.content_refs?.[key];
  requireCondition(
    ref?.schema === schema
      && ref?.id === id
      && ref?.revision === revision
      && ref?.path === path
      && ref?.digest === sha256(path)
      && manifest.files[path] === ref.digest,
    'TRACE_0C_CONTENT_REF',
    `content ref is incomplete or inconsistent: ${key}`
  );
}
const definitionContentRefs = Object.freeze({
  item_container_set_ref: contentIdentity.item_container_set,
  hidden_truth_candidate_set_ref: contentIdentity.hidden_truth_candidate_set,
  clue_evidence_graph_set_ref: contentIdentity.clue_evidence_graph_set,
  knowledge_lie_memory_rules_ref: contentIdentity.knowledge_lie_memory_rules
});
for (const [key, [, id, revision, path]] of Object.entries(definitionContentRefs)) {
  const ref = definition[key];
  requireCondition(
    ref?.id === id && ref?.revision === revision && ref?.digest === sha256(path),
    'TRACE_0C_CONTENT_REF',
    `revision 3 has an invalid 0C ref: ${key}`
  );
}

const unresolved0D = Object.freeze({
  activity_check_consequence_profiles: ['@rus/turn', 'rus.trace_activity_check_consequence_profiles.v1'],
  npc_decision_schedule_policies: ['@rus/npc-runtime', 'rus.trace_npc_decision_schedule_policies.v1'],
  movement_bindings: ['@rus/movement-routes', 'rus.trace_movement_bindings.v1'],
  location_access_policies: ['@rus/movement-routes', 'rus.trace_scene_access_policy_set.v1'],
  location_capacity_contracts: ['@rus/party-store', 'rus.trace_scene_capacity_contract_set.v1'],
  body_environment_profiles: ['@rus/body-state', 'rus.trace_body_environment_profiles.v1'],
  promise_policy: ['@rus/social-law', 'rus.trace_promise_policy.v1'],
  completion_rules: ['@rus/visibility-knowledge-memory', 'rus.trace_completion_rules.v1'],
  epilogue_rules: ['@rus/presentation', 'rus.trace_epilogue_rules.v1']
});
const unresolved = mapUnique(definition.required_unresolved_refs, 'category', 'TRACE_0C_REQUIRED_GAPS');
requireCondition(
  exactSet([...unresolved.keys()], Object.keys(unresolved0D))
    && exactArray(manifest.remaining_unresolved_refs, Object.keys(unresolved0D)),
  'TRACE_0C_REQUIRED_GAPS',
  'revision 3 must close only the four 0C gaps and retain every 0D gap'
);
for (const [category, [owner, schema]] of Object.entries(unresolved0D)) {
  const gap = unresolved.get(category);
  requireCondition(
    gap.expected_owner === owner
      && gap.expected_schema === schema
      && gap.required_status === 'unresolved_required'
      && gap.resolution_status === 'unresolved'
      && gap.planned_phase === '0D',
    'TRACE_0C_REQUIRED_GAP_RESOLVED',
    `0D gap is missing, changed, or incorrectly resolved: ${category}`
  );
}
const activityCheckGap = unresolved.get('activity_check_consequence_profiles');
requireCondition(
  exactArray(activityCheckGap.required_contracts, [
    'check_outcome_to_admitted_evidence_bundle',
    'failed_check_bundle_to_approved_full_or_partial_outcome'
  ])
    && [...unresolved.values()]
      .filter(({ category }) =>
        !['activity_check_consequence_profiles', 'completion_rules'].includes(category))
      .every(({ required_contracts }) => required_contracts === undefined),
  'TRACE_0C_CHECK_LEVEL_RESILIENCE_GAP',
  'check-level evidence-bundle mapping and resilience must remain required for phase 0D'
);
const completionRulesGap = unresolved.get('completion_rules');
requireCondition(
  exactArray(completionRulesGap.required_contracts, [
    'evidence_resolution_outcome_to_completion_state'
  ]),
  'TRACE_0C_COMPLETION_BOUNDARY',
  'completion rules must map neutral evidence resolution outcomes in phase 0D'
);

for (const [label, value, schema, idKey, id] of [
  ['item set', items, 'rus.trace_item_container_set.v1', 'item_container_set_id', 'trace_ld_v1_item_container_set'],
  ['hidden truth set', hidden, 'rus.trace_hidden_truth_candidate_set.v1', 'hidden_truth_candidate_set_id', 'trace_ld_v1_hidden_truth_candidate_set'],
  ['evidence graph', evidence, 'rus.trace_clue_evidence_graph_set.v1', 'clue_evidence_graph_set_id', 'trace_ld_v1_clue_evidence_graph_set'],
  ['knowledge rules', knowledge, 'rus.trace_knowledge_lie_memory_rules.v1', 'knowledge_lie_memory_rules_id', 'trace_ld_v1_knowledge_lie_memory_rules']
]) {
  requireCondition(
    value.schema === schema
      && value[idKey] === id
      && value.revision === 1
      && value.publication_status === 'unpublished',
    'TRACE_0C_PACKAGE_IDENTITY',
    `${label} identity is invalid`
  );
  assertForbiddenPolicies(value, label);
}

const verifyRef = (ref, id, path, code, label) => requireCondition(
  ref?.id === id && ref?.revision === 1 && ref?.digest === sha256(path),
  code,
  `${label} ref is invalid`
);
for (const value of [items, hidden, evidence, knowledge]) {
  requireCondition(
    value.participant_profile_set_ref?.id === 'trace_ld_v1_participant_profile_set'
      && value.participant_profile_set_ref?.revision === 1
      && value.participant_profile_set_ref?.digest === sha256Path(dependencyPaths.phase_0b_participant_profile_set),
    'TRACE_0C_PARTICIPANT_REF',
    'package participant profile-set ref is invalid'
  );
}
for (const value of [items, hidden, evidence]) {
  requireCondition(
    value.location_topology_set_ref?.id === 'trace_ld_v1_location_topology_set'
      && value.location_topology_set_ref?.revision === 1
      && value.location_topology_set_ref?.digest === sha256Path(dependencyPaths.phase_0b_location_topology_set),
    'TRACE_0C_LOCATION_REF',
    'package location topology-set ref is invalid'
  );
}
verifyRef(hidden.item_container_set_ref, 'trace_ld_v1_item_container_set', 'item-container-set.json', 'TRACE_0C_ITEM_REF', 'hidden truth item set');
verifyRef(evidence.item_container_set_ref, 'trace_ld_v1_item_container_set', 'item-container-set.json', 'TRACE_0C_ITEM_REF', 'evidence item set');
verifyRef(evidence.hidden_truth_candidate_set_ref, 'trace_ld_v1_hidden_truth_candidate_set', 'hidden-truth-candidate-set.json', 'TRACE_0C_HIDDEN_REF', 'evidence hidden truth');
verifyRef(knowledge.hidden_truth_candidate_set_ref, 'trace_ld_v1_hidden_truth_candidate_set', 'hidden-truth-candidate-set.json', 'TRACE_0C_HIDDEN_REF', 'knowledge hidden truth');
verifyRef(knowledge.clue_evidence_graph_set_ref, 'trace_ld_v1_clue_evidence_graph_set', 'clue-evidence-graph-set.json', 'TRACE_0C_EVIDENCE_REF', 'knowledge evidence');

const catalogSource = items.canonical_item_catalog_source_ref;
requireCondition(
  catalogSource?.schema === 'rus.trace_item_catalog_source_ref.v1'
    && catalogSource.version === 1
    && catalogSource.promoted_world_revision_id === 'world_revision_novgorod_1230_item_container_approved_001',
  'TRACE_0C_ITEM_CATALOG_PIN',
  'canonical item catalog source ref is invalid'
);
const pinnedSourceFiles = [
  catalogSource.candidate_manifest,
  catalogSource.approval_attestation,
  ...Object.values(catalogSource.datasets ?? {})
];
for (const ref of pinnedSourceFiles) {
  const path = resolve(root, ref.path);
  requireCondition(
    text(ref.path) && digestValue(ref.sha256) && sha256Path(path) === ref.sha256,
    'TRACE_0C_ITEM_CATALOG_DIGEST',
    `canonical item catalog source digest mismatch: ${ref.path ?? '<missing>'}`
  );
}
const candidateManifest = readJsonPath(resolve(root, catalogSource.candidate_manifest.path));
const approvalAttestation = readJsonPath(resolve(root, catalogSource.approval_attestation.path));
requireCondition(
  candidateManifest.schema_version === catalogSource.candidate_manifest.schema_version
    && candidateManifest.candidate_digest === catalogSource.candidate_manifest.candidate_digest
    && approvalAttestation.schema_version === catalogSource.approval_attestation.schema_version
    && approvalAttestation.decision === 'approve_all_120'
    && approvalAttestation.candidate_digest === candidateManifest.candidate_digest,
  'TRACE_0C_ITEM_CATALOG_APPROVAL',
  'canonical item/container candidate promotion is not exactly approved'
);
const catalogItemTemplates = new Map(readJsonPath(resolve(root, catalogSource.datasets.item_templates.path)).map((row) => [row.id, row]));
const catalogItemInventory = new Map(readJsonPath(resolve(root, catalogSource.datasets.item_inventory_profiles.path)).map((row) => [row.id, row]));
const catalogContainers = new Map(readJsonPath(resolve(root, catalogSource.datasets.container_templates.path)).map((row) => [row.id, row]));
const catalogContainerInventory = new Map(readJsonPath(resolve(root, catalogSource.datasets.container_inventory_profiles.path)).map((row) => [row.id, row]));

const semanticCategories = new Set(items.semantic_categories);
requireCondition(
  unique(items.semantic_categories) && items.semantic_categories.length === 21,
  'TRACE_0C_SEMANTIC_CATEGORY',
  'semantic category vocabulary is empty, duplicated, or incomplete'
);
const containerTemplates = mapUnique(items.container_templates, 'container_template_id', 'TRACE_0C_CONTAINER_ID');
const itemTemplates = mapUnique(items.item_templates, 'item_template_id', 'TRACE_0C_ITEM_ID');
requireCondition(itemTemplates.size === 21 && containerTemplates.size === 2, 'TRACE_0C_ITEM_SET_EMPTY', 'required item/container template set is incomplete');
const itemCandidateSets = mapUnique(
  items.item_candidate_sets,
  'candidate_set_id',
  'TRACE_0C_ITEM_CANDIDATE_SET'
);
const containerCandidateSets = mapUnique(
  items.container_candidate_sets,
  'candidate_set_id',
  'TRACE_0C_CONTAINER_CANDIDATE_SET'
);
for (const candidateSet of [...itemCandidateSets.values(), ...containerCandidateSets.values()]) {
  requireCondition(
    candidateSet.required === true
      && Array.isArray(candidateSet.candidate_ids)
      && candidateSet.candidate_ids.length > 0
      && unique(candidateSet.candidate_ids),
    'TRACE_0C_ITEM_SET_EMPTY',
    `required candidate set is empty or duplicated: ${candidateSet.candidate_set_id}`
  );
}
const requiredItemSet = itemCandidateSets.get('trace_ld_v1_required_item_templates');
requireCondition(
  itemCandidateSets.size === 1
    && requiredItemSet?.selection_policy === 'all_approved_templates'
    && exactSet(requiredItemSet.candidate_ids, [...itemTemplates.keys()]),
  'TRACE_0C_ITEM_CANDIDATE_SET',
  'required item candidate set must be the exact approved template set'
);
const roadBagCandidateSet = containerCandidateSets.get('trace_ld_v1_road_bag_candidates');
const debrisContainerSet = containerCandidateSets.get('trace_ld_v1_required_debris_container_templates');
requireCondition(
  containerCandidateSets.size === 2
    && roadBagCandidateSet?.selection_policy === 'singleton_approved'
    && roadBagCandidateSet.required_count === 1
    && roadBagCandidateSet.slot_binding_ref === 'container_slot:trace_ld_v1_entrusted_road_bag'
    && exactArray(roadBagCandidateSet.candidate_ids, ['trace_ld_v1_container_road_bag'])
    && debrisContainerSet?.selection_policy === 'all_approved_templates'
    && debrisContainerSet.materialization_semantics === 'required_template_set'
    && exactArray(debrisContainerSet.candidate_ids, ['trace_ld_v1_container_empty_birch_bark'])
    && exactSet(
      [...roadBagCandidateSet.candidate_ids, ...debrisContainerSet.candidate_ids],
      [...containerTemplates.keys()]
    ),
  'TRACE_0C_CONTAINER_CANDIDATE_SET',
  'road-bag selection and required debris-container templates must be disjoint and explicit'
);
const externalOwners = new Set(items.external_property_principals.map(({ principal_ref }) => principal_ref));
requireCondition(
  externalOwners.size === 1 && externalOwners.has('trace_ld_v1_external_owner_savva_tverdich'),
  'TRACE_0C_PROPERTY_REF',
  'approved external owner set is invalid'
);
const validOwner = (value) => value === null || participantRefs.has(value) || externalOwners.has(value);
const validHolderController = (value) => value === null || participantRefs.has(value);
const validateProperty = (state, id) => {
  requireCondition(
    state && validOwner(state.owner_ref)
      && validHolderController(state.holder_ref)
      && validHolderController(state.controller_ref),
    'TRACE_0C_PROPERTY_REF',
    `owner, holder, or controller is outside approved refs: ${id}`
  );
};
for (const item of itemTemplates.values()) {
  requireCondition(
    semanticCategories.has(item.semantic_category) && item.status === 'approved',
    'TRACE_0C_SEMANTIC_CATEGORY',
    `unknown semantic category or status: ${item.item_template_id}`
  );
  if (item.property_state_template) validateProperty(item.property_state_template, item.item_template_id);
  if (item.initial_container_refs !== undefined) {
    requireCondition(
      Array.isArray(item.initial_container_refs)
        && unique(item.initial_container_refs)
        && item.initial_container_refs.length <= 1
        && item.initial_container_refs.every((ref) => containerTemplates.has(ref)),
      'TRACE_0C_MULTIPLE_CONTAINERS',
      `item template is assigned to multiple or unknown containers: ${item.item_template_id}`
    );
  }
  if (item.weapon_contract) {
    validateProperty(item.weapon_contract, item.item_template_id);
    requireCondition(
      text(item.weapon_contract.accessibility),
      'TRACE_0C_WEAPON_CONTRACT',
      `weapon lacks accessibility contract: ${item.item_template_id}`
    );
  }
  if (item.base_catalog_ref?.template_id) {
    const baseItem = catalogItemTemplates.get(item.base_catalog_ref.template_id);
    const baseContainer = catalogContainers.get(item.base_catalog_ref.template_id);
    requireCondition(baseItem || baseContainer, 'TRACE_0C_ITEM_CATALOG_REF', `unknown canonical base template: ${item.base_catalog_ref.template_id}`);
    if (item.base_catalog_ref.inventory_profile_id) {
      const profile = catalogItemInventory.get(item.base_catalog_ref.inventory_profile_id)
        ?? catalogContainerInventory.get(item.base_catalog_ref.inventory_profile_id);
      requireCondition(
        profile && (profile.item_template_id === item.base_catalog_ref.template_id
          || profile.container_template_id === item.base_catalog_ref.template_id),
        'TRACE_0C_ITEM_CATALOG_REF',
        `unknown or incompatible canonical inventory profile: ${item.base_catalog_ref.inventory_profile_id}`
      );
    }
  }
  if (item.semantic_category.endsWith('_clue')) {
    requireCondition(
      placementSlotRefs.has(item.placement_slot_ref),
      'TRACE_0C_CLUE_PLACEMENT',
      `clue item has no approved placement slot: ${item.item_template_id}`
    );
  }
}
for (const container of containerTemplates.values()) {
  requireCondition(
    semanticCategories.has(container.semantic_category)
      && container.status === 'approved'
      && Number.isInteger(container.mass_grams)
      && container.mass_grams >= 0
      && Number.isInteger(container.capacity_contract?.capacity)
      && container.capacity_contract.capacity > 0,
    'TRACE_0C_CONTAINER_CONTRACT',
    `container mass/capacity contract is invalid: ${container.container_template_id}`
  );
  validateProperty(container.property_state_template, container.container_template_id);
  if (container.placement_slot_ref !== undefined) {
    requireCondition(
      placementSlotRefs.has(container.placement_slot_ref),
      'TRACE_0C_CLUE_PLACEMENT',
      `container has no approved placement slot: ${container.container_template_id}`
    );
  }
  const base = catalogContainers.get(container.base_catalog_ref?.template_id);
  const inventory = catalogContainerInventory.get(container.base_catalog_ref?.inventory_profile_id);
  requireCondition(
    base
      && inventory?.container_template_id === base.id
      && base.capacity === container.capacity_contract.capacity
      && inventory.mass_grams === container.mass_grams,
    'TRACE_0C_ITEM_CATALOG_REF',
    `container does not match pinned canonical mass/capacity source: ${container.container_template_id}`
  );
}
const placementSlots = mapUnique(items.placement_slots, 'placement_slot_id', 'TRACE_0C_CLUE_PLACEMENT');
for (const slot of placementSlots.values()) {
  requireCondition(
    locationRefs.has(slot.location_ref) && slot.materialization_status === 'template_only',
    'TRACE_0C_LOCATION_REF',
    `placement slot references unknown location or is materialized: ${slot.placement_slot_id}`
  );
}
const relationsByItem = new Map();
const relationsByContainer = new Map();
for (const relation of items.container_relation_templates) {
  requireCondition(
    itemTemplates.has(relation.item_template_ref)
      && containerTemplates.has(relation.container_template_ref)
      && relation.relation === 'allowed_initial_content',
    'TRACE_0C_CONTAINER_REF',
    'unknown or incompatible item/container relation'
  );
  const targets = relationsByItem.get(relation.item_template_ref) ?? [];
  targets.push(relation.container_template_ref);
  relationsByItem.set(relation.item_template_ref, targets);
  const contents = relationsByContainer.get(relation.container_template_ref) ?? [];
  contents.push(relation.item_template_ref);
  relationsByContainer.set(relation.container_template_ref, contents);
}
for (const [itemId, targets] of relationsByItem) {
  requireCondition(
    unique(targets) && targets.length <= 1,
    'TRACE_0C_MULTIPLE_CONTAINERS',
    `item template is assigned to multiple containers: ${itemId}`
  );
}
for (const item of itemTemplates.values()) {
  const relationTargets = relationsByItem.get(item.item_template_id);
  if (relationTargets === undefined) {
    requireCondition(
      item.container_contract === undefined,
      'TRACE_0C_CONTAINER_CONTRACT',
      `item without a relation declares a container contract: ${item.item_template_id}`
    );
    continue;
  }
  requireCondition(
    item.container_contract?.maximum_simultaneous_containers === 1
      && exactSet(
        item.container_contract.allowed_container_refs,
        relationTargets
      ),
    'TRACE_0C_CONTAINER_CONTRACT',
    `item container contract disagrees with relation target: ${item.item_template_id}`
  );
}
for (const container of containerTemplates.values()) {
  requireCondition(
    exactSet(
      container.capacity_contract.exact_allowed_item_template_ids,
      relationsByContainer.get(container.container_template_id) ?? []
    ),
    'TRACE_0C_CONTAINER_CONTRACT',
    `container allowed contents disagree with relation templates: ${container.container_template_id}`
  );
}
const roadBag = containerTemplates.get('trace_ld_v1_container_road_bag');
requireCondition(
  roadBag.physical_condition?.strap_state === 'cut'
    && roadBag.physical_condition?.leather_patch_state === 'present',
  'TRACE_0C_CONTAINER_CONTRACT',
  'road bag content/condition contract is invalid'
);
const packet = itemTemplates.get('trace_ld_v1_item_sealed_packet');
requireCondition(
  packet.seal_contract?.state_candidates?.length > 0
    && packet.seal_contract?.seal_state_separate_from_contents_state === true
    && packet.contents_contract?.player_knowledge_at_start === 'forbidden'
    && packet.contents_contract?.opening_right === 'absent',
  'TRACE_0C_SEAL_STATE',
  'sealed packet lacks an independent approved seal/content contract'
);
for (const item of itemTemplates.values()) {
  const containerRef = item.parent_container_ref;
  if (!containerRef) continue;
  requireCondition(containerTemplates.has(containerRef), 'TRACE_0C_CONTAINER_REF', `unknown parent container: ${containerRef}`);
}
for (const container of containerTemplates.values()) {
  const visited = new Set([container.container_template_id]);
  let parent = container.parent_container_ref;
  while (parent) {
    requireCondition(containerTemplates.has(parent), 'TRACE_0C_CONTAINER_REF', `unknown parent container: ${parent}`);
    requireCondition(!visited.has(parent), 'TRACE_0C_CONTAINER_CYCLE', 'cyclic container nesting is forbidden');
    visited.add(parent);
    parent = containerTemplates.get(parent).parent_container_ref;
  }
}
const transitions = mapUnique(items.transition_templates, 'transition_template_id', 'TRACE_0C_TRANSITION');
const roadBagTheft = transitions.get('trace_ld_v1_transition_road_bag_pre_game_transfer');
const packetTheft = transitions.get('trace_ld_v1_transition_packet_pre_game_transfer');
requireCondition(
  roadBagTheft?.container_template_ref === roadBag.container_template_id
    && exactArray(roadBagTheft.holder_sequence, ['player_clerk', 'ratsha_storehouse_helper', 'zhdanko_storehouse_controller'])
    && exactArray(roadBagTheft.controller_sequence, ['player_clerk', 'ratsha_storehouse_helper', 'zhdanko_storehouse_controller'])
    && roadBagTheft.owner_sequence.length === 3
    && new Set(roadBagTheft.owner_sequence).size === 1
    && roadBagTheft.owner_sequence[0] === 'trace_ld_v1_external_owner_savva_tverdich'
    && packetTheft?.item_template_ref === packet.item_template_id
    && packetTheft.parent_container_ref === roadBag.container_template_id
    && packetTheft.movement_basis === 'inherit_parent_container_transfer'
    && exactArray(packetTheft.holder_sequence, roadBagTheft.holder_sequence)
    && exactArray(packetTheft.controller_sequence, roadBagTheft.controller_sequence)
    && exactArray(packetTheft.owner_sequence, roadBagTheft.owner_sequence)
    && exactArray(packetTheft.seal_state_sequence, ['intact', 'intact', 'intact']),
  'TRACE_0C_THEFT_OWNER_CHANGE',
  'pre-game bag/packet theft transitions change owner, seal, or approved holder/controller sequence'
);
for (const transition of transitions.values()) {
  const hasItemRef = text(transition.item_template_ref);
  const hasContainerRef = text(transition.container_template_ref);
  requireCondition(
    hasItemRef !== hasContainerRef
      && (!hasItemRef || itemTemplates.has(transition.item_template_ref))
      && (!hasContainerRef || containerTemplates.has(transition.container_template_ref)),
    'TRACE_0C_UNKNOWN_ITEM',
    `transition must reference exactly one approved item or container: ${transition.transition_template_id}`
  );
  if (transition.kind === 'weapon_disarm') {
    requireCondition(
      transition.owner_change === 'forbidden'
        && exactSet(transition.changes, ['holder', 'controller', 'accessibility'])
        && transition.use_requires_current_holder_and_accessibility === true,
      'TRACE_0C_WEAPON_CONTRACT',
      `weapon disarm contract is invalid: ${transition.transition_template_id}`
    );
  }
}
const openingState = items.pre_game_opening_state_contract;
requireCondition(
  openingState?.contract_id === 'trace_ld_v1_opening_state_stolen_road_bag'
    && openingState.derived_from_hidden_event_ref === 'trace_ld_v1_hidden_event_11_bag_delivered'
    && exactSet(openingState.derived_from_transition_refs, [
      roadBagTheft?.transition_template_id,
      packetTheft?.transition_template_id
    ])
    && openingState.container_ref === roadBag.container_template_id
    && openingState.container_opening_state?.owner_ref === 'trace_ld_v1_external_owner_savva_tverdich'
    && openingState.container_opening_state?.holder_ref === 'zhdanko_storehouse_controller'
    && openingState.container_opening_state?.controller_ref === 'zhdanko_storehouse_controller'
    && openingState.container_opening_state?.placement_location_ref === 'trace_ld_v1_loc_zhdanko_storehouse'
    && exactSet(openingState.exact_content_item_refs, [
      'trace_ld_v1_item_sealed_packet',
      'trace_ld_v1_item_wet_cloak',
      'trace_ld_v1_item_writing_tablet'
    ])
    && exactSet(
      openingState.exact_content_item_refs,
      relationsByContainer.get(roadBag.container_template_id) ?? []
    )
    && exactSet(openingState.exact_content_item_refs, roadBag.capacity_contract.exact_allowed_item_template_ids)
    && openingState.content_physical_parent_contract?.parent_container_ref === roadBag.container_template_id
    && openingState.content_physical_parent_contract?.physical_placement_derivation === 'inherit_parent_container_path'
    && openingState.content_physical_parent_contract?.holder_derivation === 'inherit_parent_container_holder'
    && openingState.content_physical_parent_contract?.controller_derivation === 'inherit_parent_container_controller'
    && openingState.content_physical_parent_contract?.owner_derivation === 'preserve_item_owner'
    && openingState.sealed_packet_opening_state?.item_ref === packet.item_template_id
    && openingState.sealed_packet_opening_state?.parent_container_ref === roadBag.container_template_id
    && openingState.sealed_packet_opening_state?.seal_state === 'intact'
    && openingState.application_status === 'template_only',
  'TRACE_0C_OPENING_ITEM_STATE',
  'pre-game road bag opening state or contained-item inheritance is ambiguous'
);
const ratshaBindingRope = itemTemplates.get('trace_ld_v1_item_ratsha_binding_rope');
const zhdankoRope = itemTemplates.get('trace_ld_v1_item_zhdanko_rope');
const ropePreGameUse = transitions.get('trace_ld_v1_transition_ratsha_binding_rope_pre_game_use');
const ropeOpeningState = items.pre_game_binding_rope_opening_state_contract;
const ropeLateSceneState = items.late_scene_rope_availability_contract;
requireCondition(
  ratshaBindingRope?.property_state_template?.owner_ref === null
    && ratshaBindingRope.property_state_template.holder_ref === 'ratsha_storehouse_helper'
    && ratshaBindingRope.property_state_template.controller_ref === 'ratsha_storehouse_helper'
    && ropePreGameUse?.item_template_ref === ratshaBindingRope.item_template_id
    && exactArray(ropePreGameUse.holder_sequence, [
      'ratsha_storehouse_helper',
      'onisim_boatman'
    ])
    && exactArray(ropePreGameUse.controller_sequence, [
      'ratsha_storehouse_helper',
      'ratsha_storehouse_helper'
    ])
    && exactArray(ropePreGameUse.owner_sequence, [null, null])
    && exactArray(ropePreGameUse.placement_location_sequence, [
      'trace_ld_v1_loc_wreck_shore',
      'trace_ld_v1_loc_old_drying_shed'
    ])
    && ropePreGameUse.use_event_ref === 'trace_ld_v1_hidden_event_10_onisim_bound_and_moved'
    && ropePreGameUse.application_status === 'template_only'
    && ropeOpeningState?.derived_from_transition_ref === ropePreGameUse.transition_template_id
    && ropeOpeningState.derived_from_hidden_event_ref === ropePreGameUse.use_event_ref
    && ropeOpeningState.item_ref === ratshaBindingRope.item_template_id
    && ropeOpeningState.owner_ref === null
    && ropeOpeningState.holder_ref === 'onisim_boatman'
    && ropeOpeningState.controller_ref === 'ratsha_storehouse_helper'
    && ropeOpeningState.placement_location_ref === 'trace_ld_v1_loc_old_drying_shed'
    && ropeOpeningState.use_state === 'binding_onisim'
    && ropeOpeningState.application_status === 'template_only',
  'TRACE_0C_CONTROLLED_ITEM_USE',
  'Onisim binding rope lacks a separate exact pre-game holder/controller/use transition and opening state'
);
requireCondition(
  zhdankoRope?.property_state_template?.owner_ref === 'zhdanko_storehouse_controller'
    && zhdankoRope.property_state_template.holder_ref === 'zhdanko_storehouse_controller'
    && zhdankoRope.property_state_template.controller_ref === 'zhdanko_storehouse_controller'
    && [...transitions.values()].every(
      ({ item_template_ref }) => item_template_ref !== zhdankoRope.item_template_id
    )
    && ropeLateSceneState?.state_basis === 'approved_storehouse_resource_property_state'
    && ropeLateSceneState.item_ref === zhdankoRope.item_template_id
    && ropeLateSceneState.owner_ref === 'zhdanko_storehouse_controller'
    && ropeLateSceneState.holder_ref === 'zhdanko_storehouse_controller'
    && ropeLateSceneState.controller_ref === 'zhdanko_storehouse_controller'
    && ropeLateSceneState.placement_location_ref === 'trace_ld_v1_loc_zhdanko_storehouse'
    && ropeLateSceneState.future_use_scope === 'zhdanko_restraint_requires_late_activity_consequence'
    && ropeLateSceneState.automatic_transport_from_onisim_scene === false
    && ropeLateSceneState.runtime_status === 'not_implemented'
    && ropeLateSceneState.application_status === 'template_only',
  'TRACE_0C_CONTROLLED_ITEM_USE',
  'Zhdanko rope must remain at the storehouse without an invented cross-scene transport path'
);

const motiveCandidates = mapUnique(hidden.motive_candidates, 'motive_id', 'TRACE_0C_HIDDEN_MOTIVE');
const sequenceCandidates = mapUnique(hidden.sequence_candidates, 'hidden_sequence_candidate_id', 'TRACE_0C_HIDDEN_EMPTY');
requireCondition(
  hidden.selection_policy === 'singleton_approved_candidate'
    && hidden.required_candidate_count === 1
    && motiveCandidates.size === 1
    && sequenceCandidates.size === 1
    && motiveCandidates.has('conceal_entrusted_goods_shortage'),
  'TRACE_0C_HIDDEN_EMPTY',
  'hidden truth candidate set must contain the singleton approved motive and sequence'
);
const sequence = sequenceCandidates.get('trace_ld_v1_hidden_sequence_canonical_v1');
requireCondition(
  sequence?.motive_ref === 'conceal_entrusted_goods_shortage'
    && sequence.actor_bindings?.principal === 'zhdanko_storehouse_controller'
    && sequence.actor_bindings?.executor === 'ratsha_storehouse_helper'
    && sequence.actor_bindings.principal !== sequence.actor_bindings.executor
    && sequence.actor_bindings?.victim_boatman === 'onisim_boatman'
    && sequence.actor_bindings?.player === 'player_clerk',
  'TRACE_0C_HIDDEN_PRINCIPAL',
  'hidden sequence principal/executor/victim/player binding is invalid'
);
for (const actorRef of Object.values(sequence.actor_bindings)) {
  requireCondition(participantRefs.has(actorRef), 'TRACE_0C_PARTICIPANT_REF', `unknown hidden actor ref: ${actorRef}`);
}
const hiddenEvents = mapUnique(sequence.event_templates, 'event_template_id', 'TRACE_0C_HIDDEN_EVENT');
requireCondition(hiddenEvents.size === 15, 'TRACE_0C_HIDDEN_EVENT', 'approved hidden sequence must contain fifteen events');
const orderValues = sequence.event_templates.map(({ order }) => order);
requireCondition(
  unique(orderValues) && exactSet(orderValues, Array.from({ length: 15 }, (_, index) => index + 1)),
  'TRACE_0C_HIDDEN_ORDER',
  'hidden event order is incomplete or duplicated'
);
for (const event of hiddenEvents.values()) {
  requireCondition(text(event.causal_basis), 'TRACE_0C_HIDDEN_CAUSAL_BASIS', `hidden event lacks causal basis: ${event.event_template_id}`);
  requireCondition(
    event.actor_refs.every((ref) => participantRefs.has(ref)),
    'TRACE_0C_PARTICIPANT_REF',
    `hidden event has unknown participant ref: ${event.event_template_id}`
  );
  requireCondition(
    event.location_refs.every((ref) => locationRefs.has(ref)),
    'TRACE_0C_LOCATION_REF',
    `hidden event has unknown location ref: ${event.event_template_id}`
  );
  requireCondition(
    event.item_refs.every((ref) => itemTemplates.has(ref) || containerTemplates.has(ref)),
    'TRACE_0C_UNKNOWN_ITEM',
    `hidden event has unknown item ref: ${event.event_template_id}`
  );
  requireCondition(
    event.predecessor_refs.every((ref) => hiddenEvents.has(ref)),
    'TRACE_0C_HIDDEN_DANGLING',
    `hidden event has dangling predecessor: ${event.event_template_id}`
  );
  requireCondition(
    event.predecessor_refs.every((ref) => hiddenEvents.get(ref).order < event.order),
    'TRACE_0C_HIDDEN_ORDER',
    `hidden event depends on a predecessor with the same or later order: ${event.event_template_id}`
  );
  if (event.transfer) {
    const hasActorTransfer = text(event.transfer.source_actor_ref) && text(event.transfer.target_actor_ref);
    const hasLocationTransfer = text(event.transfer.source_location_ref) && text(event.transfer.target_location_ref);
    requireCondition(hasActorTransfer || hasLocationTransfer, 'TRACE_0C_HIDDEN_TRANSFER', `transfer lacks source/target: ${event.event_template_id}`);
    if (event.transfer.owner_before_ref !== undefined || event.transfer.owner_after_ref !== undefined) {
      requireCondition(
        event.transfer.owner_before_ref === event.transfer.owner_after_ref,
        'TRACE_0C_THEFT_OWNER_CHANGE',
        `hidden transfer changes owner: ${event.event_template_id}`
      );
    }
  }
}
const visiting = new Set();
const visited = new Set();
const visitEvent = (eventId) => {
  if (visited.has(eventId)) return;
  requireCondition(!visiting.has(eventId), 'TRACE_0C_HIDDEN_CYCLE', 'hidden event dependency graph contains a cycle');
  visiting.add(eventId);
  for (const predecessor of hiddenEvents.get(eventId).predecessor_refs) visitEvent(predecessor);
  visiting.delete(eventId);
  visited.add(eventId);
};
for (const eventId of hiddenEvents.keys()) visitEvent(eventId);
const ratshaRecruitment = hiddenEvents.get('trace_ld_v1_hidden_event_02_ratsha_recruited');
const audibleCommand = hiddenEvents.get('trace_ld_v1_hidden_event_04_zhdanko_audible_command');
const onisimBinding = hiddenEvents.get('trace_ld_v1_hidden_event_10_onisim_bound_and_moved');
requireCondition(
  !ratshaRecruitment?.item_refs.includes(zhdankoRope.item_template_id)
    && !Object.hasOwn(ratshaRecruitment, 'item_transfer')
    && sequence.event_templates.every(({ item_refs }) => !item_refs.includes(zhdankoRope.item_template_id))
    && onisimBinding?.item_refs.includes(ratshaBindingRope.item_template_id)
    && onisimBinding.controlled_item_use?.item_ref === ratshaBindingRope.item_template_id
    && onisimBinding.controlled_item_use.required_holder_ref === 'ratsha_storehouse_helper'
    && onisimBinding.controlled_item_use.required_controller_ref === 'ratsha_storehouse_helper'
    && onisimBinding.controlled_item_use.transition_template_ref === ropePreGameUse.transition_template_id
    && onisimBinding.controlled_item_use.resulting_holder_ref === ropeOpeningState.holder_ref
    && onisimBinding.controlled_item_use.resulting_controller_ref === ropeOpeningState.controller_ref
    && onisimBinding.controlled_item_use.resulting_placement_location_ref === ropeOpeningState.placement_location_ref
    && onisimBinding.controlled_item_use.owner_change === 'forbidden',
  'TRACE_0C_CONTROLLED_ITEM_USE',
  'Onisim binding must use its separate approved rope and must not move Zhdanko rope'
);
requireCondition(
  audibleCommand?.order === 4
    && audibleCommand.event_type === 'audible_command_across_boats'
    && exactSet(audibleCommand.actor_refs, [
      'zhdanko_storehouse_controller',
      'ratsha_storehouse_helper',
      'onisim_boatman'
    ])
    && exactArray(audibleCommand.location_refs, ['trace_ld_v1_loc_wreck_shore'])
    && exactSet(audibleCommand.item_refs, [
      'trace_ld_v1_item_onisim_boat',
      'trace_ld_v1_item_second_small_boat'
    ])
    && audibleCommand.audible_action_contract?.speaker_ref === 'zhdanko_storehouse_controller'
    && audibleCommand.audible_action_contract?.utterance_kind === 'attack_coordination_command'
    && audibleCommand.audible_action_contract?.content_scope
      === 'command_to_ratsha_without_inventing_verbatim_words'
    && exactArray(audibleCommand.audible_action_contract?.audible_to_refs, ['onisim_boatman'])
    && exactArray(
      audibleCommand.audible_action_contract?.speaker_identity_perceived_by_refs,
      ['onisim_boatman']
    )
    && audibleCommand.audible_action_contract?.perception_template_ref
      === 'trace_ld_v1_perception_onisim_hears_zhdanko_command'
    && exactArray(audibleCommand.predecessor_refs, [
      'trace_ld_v1_hidden_event_03_second_boat_departure'
    ])
    && hiddenEvents.get('trace_ld_v1_hidden_event_04_onisim_boat_hooked')
      ?.predecessor_refs.includes(audibleCommand.event_template_id),
  'TRACE_0C_ONISIM_VOICE_SOURCE',
  'Onisim voice testimony lacks an approved audible hidden event and direct perception source'
);
const bagDelivery = hiddenEvents.get('trace_ld_v1_hidden_event_11_bag_delivered');
requireCondition(
  bagDelivery?.transfer?.subject_ref === roadBag.container_template_id
    && bagDelivery.transfer.source_actor_ref === 'ratsha_storehouse_helper'
    && bagDelivery.transfer.target_actor_ref === 'zhdanko_storehouse_controller'
    && bagDelivery.transfer.owner_before_ref === 'trace_ld_v1_external_owner_savva_tverdich'
    && bagDelivery.transfer.owner_after_ref === bagDelivery.transfer.owner_before_ref
    && bagDelivery.transfer.holder_controller_change_only === true
    && exactSet(bagDelivery.transfer.transition_template_refs, openingState.derived_from_transition_refs)
    && exactSet(bagDelivery.transfer.contained_item_refs, openingState.exact_content_item_refs)
    && bagDelivery.transfer.content_physical_state_derivation === 'inherit_parent_container_path',
  'TRACE_0C_OPENING_ITEM_STATE',
  'hidden bag delivery does not resolve to the approved container/content opening state'
);
const crash = hiddenEvents.get('trace_ld_v1_hidden_event_07_onisim_boat_wrecked');
requireCondition(
  exactSet(crash.crash_cause_refs, [
    'trace_ld_v1_hidden_event_06_boats_collide',
    'trace_ld_v1_item_hidden_trunk_trace'
  ])
    && crash.excluded_sole_cause_refs.includes('trace_ld_v1_item_cut_bag_fastening'),
  'TRACE_0C_CRASH_CAUSALITY',
  'crash must require collision and hidden trunk; cut fastening cannot be its sole cause'
);
requireCondition(
  hiddenEvents.get('trace_ld_v1_hidden_event_08_player_unconscious')?.effect_template?.until_event_ref
    === 'trace_ld_v1_hidden_event_14_player_wakes'
    && hiddenEvents.get('trace_ld_v1_hidden_event_14_player_wakes')?.exact_local_time_marker === '07:00',
  'TRACE_0C_OPENING_BOUNDARY',
  'player unconscious/wake boundary is invalid'
);

const perceptionSourceTemplates = mapUnique(
  knowledge.perception_source_templates,
  'perception_template_id',
  'TRACE_0C_ONISIM_VOICE_SOURCE'
);
const onisimVoicePerception = perceptionSourceTemplates.get(
  'trace_ld_v1_perception_onisim_hears_zhdanko_command'
);
const onisimKnowledgeScope = knowledgeScopes.get('trace_ld_v1_knowledge_scope_hired_boatman_v1');
requireCondition(
  perceptionSourceTemplates.size === 1
    && onisimVoicePerception?.record_type === 'perception_source_template'
    && onisimVoicePerception.perceiver_ref === 'onisim_boatman'
    && onisimVoicePerception.source_hidden_event_ref === audibleCommand.event_template_id
    && onisimVoicePerception.source_type === 'direct_perception'
    && onisimVoicePerception.modality === 'auditory'
    && onisimVoicePerception.perceived_actor_ref === 'zhdanko_storehouse_controller'
    && onisimVoicePerception.content_scope
      === 'recognized_zhdanko_voice_and_attack_command_without_verbatim_words'
    && exactSet(onisimVoicePerception.admitted_knowledge_categories, [
      'incident_fact',
      'executor_identity',
      'memory_content'
    ])
    && onisimVoicePerception.admitted_knowledge_categories.every(
      (category) => onisimKnowledgeScope.allowed_categories.includes(category)
    )
    && onisimKnowledgeScope.admitted_source_types.includes(onisimVoicePerception.source_type)
    && onisimVoicePerception.memory_source_type === 'prior_admitted_perception_or_message'
    && onisimKnowledgeScope.admitted_source_types.includes(onisimVoicePerception.memory_source_type)
    && exactArray(onisimVoicePerception.admitted_statement_template_refs, [
      'trace_ld_v1_statement_onisim_testimony'
    ])
    && onisimVoicePerception.creates_objective_fact === false
    && onisimVoicePerception.application_status === 'template_only',
  'TRACE_0C_ONISIM_VOICE_SOURCE',
  'Onisim auditory perception template is missing or exceeds the approved knowledge scope'
);

const evidenceRecords = mapUnique(evidence.evidence_records, 'evidence_id', 'TRACE_0C_EVIDENCE_ID');
requireCondition(evidenceRecords.size === 12, 'TRACE_0C_EVIDENCE_ID', 'exactly twelve evidence records are required');
const conclusions = new Set(evidence.conclusions);
requireCondition(
  exactSet([...conclusions], [
    'intentional_bag_removal',
    'side_collision_occurred',
    'second_boat_present',
    'onisim_survived_and_reached_shore_injured',
    'another_person_present',
    'blue_wool_found_on_route',
    'blue_wool_matches_ratsha_caftan',
    'ratsha_possessed_foreign_bag',
    'physical_attack_pattern',
    'ratsha_participated_blue_wool_route',
    'ratsha_participated',
    'zhdanko_voice_connected_to_attack',
    'stolen_bag_at_zhdanko',
    'packet_seal_intact',
    'zhdanko_resisted_transfer',
    'principal_zhdanko_physical_line',
    'principal_zhdanko_testimonial_line',
    'principal_zhdanko_documentary_line',
    'principal_zhdanko',
    'conceal_entrusted_goods_shortage'
  ]),
  'TRACE_0C_EVIDENCE_CONCLUSION_SET',
  'evidence conclusion vocabulary is incomplete or contains an unapproved conclusion'
);
const statementSlotRefs = new Set([
  'trace_ld_v1_statement_eremey_disclosure',
  'trace_ld_v1_statement_ratsha_confession',
  'trace_ld_v1_statement_onisim_testimony'
]);
const reservedDiscoverySlots = new Set([
  ...placementSlotRefs,
  ...statementSlotRefs,
  'trace_ld_v1_slot_storehouse_bag_observation',
  'trace_ld_v1_slot_storehouse_packet_seal',
  'trace_ld_v1_future_zhdanko_armed_resistance'
]);
for (const record of evidenceRecords.values()) {
  requireCondition(
    evidence.evidence_kinds.includes(record.evidence_kind)
      && Array.isArray(record.source_fact_refs)
      && record.source_fact_refs.length > 0
      && record.allowed_location_refs.every((ref) => locationRefs.has(ref))
      && record.allowed_actor_refs.every((ref) => participantRefs.has(ref))
      && record.allowed_item_refs.every((ref) => itemTemplates.has(ref) || containerTemplates.has(ref))
      && reservedDiscoverySlots.has(record.discovery_slot_ref)
      && text(record.visibility_precondition)
      && text(record.basis?.kind)
      && record.supports.every((ref) => conclusions.has(ref))
      && Array.isArray(record.does_not_prove)
      && record.does_not_prove.length > 0
      && record.compatible_hidden_sequence_ref === sequence.hidden_sequence_candidate_id
      && text(record.causal_basis),
    'TRACE_0C_EVIDENCE_DANGLING',
    `evidence record is incomplete or has dangling refs: ${record.evidence_id}`
  );
  requireCondition(
    !record.supports.includes('principal_zhdanko'),
    'TRACE_0C_SINGLE_EVIDENCE_PRINCIPAL',
    `single evidence directly establishes principal: ${record.evidence_id}`
  );
  for (const sourceRef of record.source_fact_refs) {
    const [kind, ref] = sourceRef.split(':');
    const valid = (kind === 'hidden_event' && hiddenEvents.has(ref))
      || (kind === 'item' && (itemTemplates.has(ref) || containerTemplates.has(ref)))
      || (kind === 'statement_slot' && statementSlotRefs.has(ref))
      || (kind === 'perception_template' && perceptionSourceTemplates.has(ref))
      || (kind === 'future_event_slot' && ref === 'trace_ld_v1_future_zhdanko_armed_resistance');
    requireCondition(valid, 'TRACE_0C_EVIDENCE_DANGLING', `unknown evidence source fact ref: ${sourceRef}`);
  }
}
const onisimTestimonyEvidence = evidenceRecords.get('trace_ld_v1_evidence_onisim_testimony');
requireCondition(
  exactSet(onisimTestimonyEvidence.source_fact_refs, [
    `hidden_event:${audibleCommand.event_template_id}`,
    `perception_template:${onisimVoicePerception.perception_template_id}`,
    'statement_slot:trace_ld_v1_statement_onisim_testimony'
  ])
    && onisimTestimonyEvidence.basis?.speaker_ref === 'onisim_boatman'
    && onisimTestimonyEvidence.basis?.source_knowledge_scope_ref
      === 'trace_ld_v1_knowledge_scope_hired_boatman_v1'
    && onisimTestimonyEvidence.supports.includes('zhdanko_voice_connected_to_attack'),
  'TRACE_0C_ONISIM_VOICE_SOURCE',
  'Onisim voice evidence must resolve through the approved event, perception, and testimony source'
);
const identityBindingSlots = mapUnique(
  evidence.identity_binding_evidence_slots,
  'binding_slot_id',
  'TRACE_0C_EVIDENCE_IDENTITY_BINDING'
);
requireCondition(
  exactSet([...identityBindingSlots.keys()], [
    'trace_ld_v1_binding_blue_wool_to_ratsha_caftan'
  ]),
  'TRACE_0C_EVIDENCE_IDENTITY_BINDING',
  'Ratsha identity must use only the approved blue-wool comparison slot'
);
const blueWoolBinding = identityBindingSlots.get('trace_ld_v1_binding_blue_wool_to_ratsha_caftan');
requireCondition(
  blueWoolBinding.binding_kind === 'physical_comparison'
    && blueWoolBinding.source_evidence_ref === 'trace_ld_v1_evidence_blue_wool'
    && blueWoolBinding.comparison_item_ref === 'trace_ld_v1_item_ratsha_caftan'
    && itemTemplates.has(blueWoolBinding.comparison_item_ref)
    && blueWoolBinding.comparison_actor_ref === 'ratsha_storehouse_helper'
    && participantRefs.has(blueWoolBinding.comparison_actor_ref)
    && exactSet(blueWoolBinding.discovery_preconditions, [
      'blue_wool_discovered',
      'ratsha_caftan_available_for_comparison'
    ])
    && blueWoolBinding.supports === 'blue_wool_matches_ratsha_caftan'
    && blueWoolBinding.does_not_prove.includes('principal_zhdanko')
    && blueWoolBinding.application_status === 'template_only',
  'TRACE_0C_EVIDENCE_IDENTITY_BINDING',
  'blue-wool comparison slot is incomplete or identifies Ratsha without comparison'
);
const blueWoolEvidence = evidenceRecords.get('trace_ld_v1_evidence_blue_wool');
requireCondition(
  exactSet(blueWoolEvidence.supports, ['blue_wool_found_on_route'])
    && exactSet(blueWoolEvidence.source_fact_refs, ['item:trace_ld_v1_item_blue_wool_fragment'])
    && blueWoolEvidence.allowed_actor_refs.length === 0
    && exactSet(blueWoolEvidence.allowed_item_refs, ['trace_ld_v1_item_blue_wool_fragment'])
    && blueWoolEvidence.does_not_prove.includes('ratsha_identity_without_comparison_or_testimony'),
  'TRACE_0C_EVIDENCE_IDENTITY_BINDING',
  'discovered blue wool must remain anonymous until an admitted comparison or testimony'
);
const identityBindingSlotRefs = new Set(
  [...identityBindingSlots.keys()].map((slotId) => `binding_slot:${slotId}`)
);
const requiredChains = Object.freeze({
  trace_ld_v1_chain_physical_to_ratsha_to_bag: ['physical', 'principal_zhdanko_physical_line'],
  trace_ld_v1_chain_witnesses_confession_voice: ['testimonial', 'principal_zhdanko_testimonial_line'],
  trace_ld_v1_chain_document_reconciliation_motive: ['documentary', 'principal_zhdanko_documentary_line']
});
const chains = mapUnique(evidence.evidence_chains, 'chain_id', 'TRACE_0C_EVIDENCE_CHAIN');
requireCondition(
  exactSet([...chains.keys()], Object.keys(requiredChains)),
  'TRACE_0C_EVIDENCE_CHAIN',
  'one or more required evidence chains are missing'
);
const terminalSlots = mapUnique(
  evidence.terminal_evidence_slots,
  'terminal_slot_id',
  'TRACE_0C_EVIDENCE_TERMINAL_INPUT'
);
const terminalSlotRefs = new Set(
  [...terminalSlots.keys()].map((terminalSlotId) => `terminal_slot:${terminalSlotId}`)
);
const reconciliationSlot = terminalSlots.get('trace_ld_v1_future_goods_reconciliation');
requireCondition(
  terminalSlots.size === 1
    && reconciliationSlot?.kind === 'future_goods_reconciliation'
    && reconciliationSlot?.owner === '@rus/visibility-knowledge-memory'
    && reconciliationSlot?.input_mode === 'external_committed_input_only'
    && reconciliationSlot?.commitment_status_required === 'committed'
    && reconciliationSlot?.may_be_inferred === false
    && exactArray(reconciliationSlot?.required_prerequisite_refs, [
      'conclusion:stolen_bag_at_zhdanko',
      'conclusion:packet_seal_intact'
    ])
    && reconciliationSlot?.absence_policy === 'fail_closed_no_motive_conclusion'
    && reconciliationSlot?.runtime_status === 'not_implemented'
    && reconciliationSlot?.planned_phase === 'later_completion_phase',
  'TRACE_0C_EVIDENCE_TERMINAL_INPUT',
  'goods reconciliation must be an external committed fail-closed terminal input'
);
const allowedEvidenceKindsByClass = Object.freeze({
  physical: new Set(['physical_item', 'physical_trace', 'observed_possession']),
  testimonial: new Set(['testimonial_statement', 'confession_statement']),
  documentary: new Set(['physical_item', 'observed_possession'])
});
const chainEvaluators = new Map();
for (const [chainId, [independenceClass, expectedTerminal]] of Object.entries(requiredChains)) {
  const chain = chains.get(chainId);
  requireCondition(
    chain.required === true
      && chain.independence_class === independenceClass
      && Array.isArray(chain.leaf_evidence_refs)
      && chain.leaf_evidence_refs.length > 0
      && unique(chain.leaf_evidence_refs)
      && Array.isArray(chain.admitted_binding_slot_refs)
      && unique(chain.admitted_binding_slot_refs)
      && Array.isArray(chain.admitted_terminal_slot_refs)
      && unique(chain.admitted_terminal_slot_refs)
      && Array.isArray(chain.node_refs)
      && chain.node_refs.length > 0
      && unique(chain.node_refs)
      && Array.isArray(chain.inference_nodes)
      && chain.inference_nodes.length > 0
      && Array.isArray(chain.edge_pairs)
      && chain.edge_pairs.length > 0
      && chain.terminal_conclusion === expectedTerminal
      && text(chain.failure_policy),
    'TRACE_0C_EVIDENCE_CHAIN',
    `required evidence chain is empty or invalid: ${chainId}`
  );
  for (const nodeRef of chain.node_refs) {
    const valid = evidenceRecords.has(nodeRef)
      || (nodeRef.startsWith('conclusion:') && conclusions.has(nodeRef.slice('conclusion:'.length)))
      || terminalSlotRefs.has(nodeRef)
      || identityBindingSlotRefs.has(nodeRef);
    requireCondition(valid, 'TRACE_0C_EVIDENCE_DANGLING', `unknown evidence chain node: ${nodeRef}`);
  }
  requireCondition(
    exactSet(
      chain.leaf_evidence_refs,
      chain.node_refs.filter((nodeRef) => evidenceRecords.has(nodeRef))
    )
      && chain.leaf_evidence_refs.every((evidenceRef) =>
        allowedEvidenceKindsByClass[independenceClass].has(evidenceRecords.get(evidenceRef).evidence_kind))
      && exactSet(
        chain.admitted_binding_slot_refs,
        chain.node_refs.filter((nodeRef) => identityBindingSlotRefs.has(nodeRef))
      )
      && exactSet(
        chain.admitted_terminal_slot_refs,
        chain.node_refs.filter((nodeRef) => terminalSlotRefs.has(nodeRef))
      ),
    'TRACE_0C_EVIDENCE_INDEPENDENCE',
    `evidence leaves do not match the chain provenance class: ${chainId}`
  );
  const inferenceNodes = mapUnique(chain.inference_nodes, 'node_ref', 'TRACE_0C_EVIDENCE_AGGREGATION');
  const expectedEdges = [];
  for (const inference of inferenceNodes.values()) {
    requireCondition(
      chain.node_refs.includes(inference.node_ref)
        && !terminalSlotRefs.has(inference.node_ref)
        && Array.isArray(inference.input_refs)
        && inference.input_refs.length > 0
        && unique(inference.input_refs)
        && inference.input_refs.every((ref) => chain.node_refs.includes(ref))
        && ['all_of', 'min_count', 'any_of'].includes(inference.operator)
        && (inference.operator !== 'min_count'
          || (Number.isInteger(inference.min_count)
            && inference.min_count >= 2
            && inference.min_count <= inference.input_refs.length))
        && (inference.operator !== 'any_of' || inference.input_refs.length >= 2),
      'TRACE_0C_EVIDENCE_AGGREGATION',
      `invalid conjunctive inference node: ${chainId}/${inference.node_ref}`
    );
    for (const inputRef of inference.input_refs) {
      expectedEdges.push([inputRef, inference.node_ref]);
      if (evidenceRecords.has(inputRef) && inference.node_ref.startsWith('conclusion:')) {
        requireCondition(
          evidenceRecords.get(inputRef).supports.includes(inference.node_ref.slice('conclusion:'.length)),
          'TRACE_0C_EVIDENCE_TERMINAL',
          `evidence inference bypasses its declared supported conclusions: ${inputRef}`
        );
      }
      if (identityBindingSlotRefs.has(inputRef) && inference.node_ref.startsWith('conclusion:')) {
        const bindingSlot = identityBindingSlots.get(inputRef.slice('binding_slot:'.length));
        requireCondition(
          bindingSlot.supports === inference.node_ref.slice('conclusion:'.length),
          'TRACE_0C_EVIDENCE_IDENTITY_BINDING',
          `identity binding slot supports an incompatible conclusion: ${inputRef}`
        );
      }
      if (terminalSlotRefs.has(inputRef)) {
        requireCondition(
          chain.admitted_terminal_slot_refs.includes(inputRef),
          'TRACE_0C_EVIDENCE_TERMINAL_INPUT',
          `inference consumes an unadmitted external terminal input: ${inputRef}`
        );
      }
    }
  }
  requireCondition(
    inferenceNodes.size === chain.node_refs.filter(
      (ref) => !evidenceRecords.has(ref)
        && !identityBindingSlotRefs.has(ref)
        && !terminalSlotRefs.has(ref)
    ).length
      && exactSet(
        chain.edge_pairs.map((edge) => JSON.stringify(edge)),
        expectedEdges.map((edge) => JSON.stringify(edge))
      ),
    'TRACE_0C_EVIDENCE_AGGREGATION',
    `edge list must exactly mirror typed inference prerequisites: ${chainId}`
  );
  const edgeGraph = new Map(chain.node_refs.map((ref) => [ref, []]));
  const incoming = new Map(chain.node_refs.map((ref) => [ref, 0]));
  for (const edge of chain.edge_pairs) {
    requireCondition(
      Array.isArray(edge) && edge.length === 2 && edgeGraph.has(edge[0]) && edgeGraph.has(edge[1]),
      'TRACE_0C_EVIDENCE_DANGLING',
      `evidence chain has a dangling edge: ${chainId}`
    );
    edgeGraph.get(edge[0]).push(edge[1]);
    incoming.set(edge[1], incoming.get(edge[1]) + 1);
  }
  const gray = new Set();
  const black = new Set();
  const visitNode = (node) => {
    if (black.has(node)) return;
    requireCondition(!gray.has(node), 'TRACE_0C_EVIDENCE_CYCLE', `evidence chain contains a cycle: ${chainId}`);
    gray.add(node);
    for (const next of edgeGraph.get(node)) visitNode(next);
    gray.delete(node);
    black.add(node);
  };
  for (const node of edgeGraph.keys()) visitNode(node);
  const terminalNode = `conclusion:${chain.terminal_conclusion}`;
  requireCondition(
    edgeGraph.has(terminalNode) && incoming.get(terminalNode) > 0,
    'TRACE_0C_EVIDENCE_TERMINAL',
    `evidence chain does not reach its declared terminal conclusion: ${chainId}`
  );
  const derive = (availableEvidenceRefs) => {
    const derived = new Set(availableEvidenceRefs);
    let changed = true;
    while (changed) {
      changed = false;
      for (const inference of inferenceNodes.values()) {
        if (derived.has(inference.node_ref)) continue;
        const matchingCount = inference.input_refs.filter((ref) => derived.has(ref)).length;
        const satisfied = inference.operator === 'all_of'
          ? matchingCount === inference.input_refs.length
          : inference.operator === 'any_of'
            ? matchingCount >= 1
            : matchingCount >= inference.min_count;
        if (satisfied) {
          derived.add(inference.node_ref);
          changed = true;
        }
      }
    }
    return derived;
  };
  requireCondition(
    derive([
      ...chain.leaf_evidence_refs,
      ...chain.admitted_binding_slot_refs,
      ...chain.admitted_terminal_slot_refs
    ]).has(terminalNode),
    'TRACE_0C_EVIDENCE_TERMINAL',
    `approved evidence collection cannot satisfy the terminal inference: ${chainId}`
  );
  chainEvaluators.set(chainId, derive);
}
const documentaryChain = chains.get('trace_ld_v1_chain_document_reconciliation_motive');
const documentaryDerive = chainEvaluators.get(documentaryChain.chain_id);
const documentaryPhysicalInputs = [
  'trace_ld_v1_evidence_bag_at_zhdanko',
  'trace_ld_v1_evidence_intact_seal'
];
const documentaryWithoutReconciliation = documentaryDerive(documentaryPhysicalInputs);
requireCondition(
  !documentaryWithoutReconciliation.has('terminal_slot:trace_ld_v1_future_goods_reconciliation')
    && !documentaryWithoutReconciliation.has('conclusion:conceal_entrusted_goods_shortage'),
  'TRACE_0C_EVIDENCE_TERMINAL_INPUT',
  'bag possession and intact seal must not create reconciliation or establish motive'
);
requireCondition(
  documentaryDerive([
    ...documentaryPhysicalInputs,
    'terminal_slot:trace_ld_v1_future_goods_reconciliation'
  ]).has('conclusion:principal_zhdanko_documentary_line'),
  'TRACE_0C_EVIDENCE_TERMINAL_INPUT',
  'documentary principal line must require an explicitly admitted committed reconciliation result'
);
const weakEvidenceRefs = [
  'trace_ld_v1_evidence_cut_fastening',
  'trace_ld_v1_evidence_side_dent',
  'trace_ld_v1_evidence_second_boat_trace',
  'trace_ld_v1_evidence_blue_wool',
  'trace_ld_v1_evidence_bag_at_zhdanko',
  'trace_ld_v1_evidence_ratsha_confession'
];
for (const evidenceRef of weakEvidenceRefs) {
  for (const [chainId, derive] of chainEvaluators) {
    const derived = derive([evidenceRef]);
    requireCondition(
      !derived.has('conclusion:ratsha_participated')
        && !derived.has('conclusion:principal_zhdanko_physical_line')
        && !derived.has('conclusion:principal_zhdanko_testimonial_line')
        && !derived.has('conclusion:principal_zhdanko'),
      'TRACE_0C_EVIDENCE_SHORTCUT',
      `single evidence creates a forbidden identity/principal shortcut: ${evidenceRef}/${chainId}`
    );
  }
}
const anonymousBlueWoolAttackSet = [
  'trace_ld_v1_evidence_blue_wool',
  'trace_ld_v1_evidence_cut_fastening',
  'trace_ld_v1_evidence_side_dent'
];
for (const [chainId, derive] of chainEvaluators) {
  requireCondition(
    !derive(anonymousBlueWoolAttackSet).has('conclusion:ratsha_participated'),
    'TRACE_0C_EVIDENCE_IDENTITY_BINDING',
    `anonymous blue wool identifies Ratsha without comparison or testimony: ${chainId}`
  );
}
const principalPolicy = evidence.principal_inference_policy;
const assertNoCompletionSemantics = (value, path = 'evidence') => {
  requireCondition(
    !['partial_completion', 'full_completion'].includes(value),
    'TRACE_0C_COMPLETION_BOUNDARY',
    `0C evidence graph contains a premature completion value: ${path}`
  );
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoCompletionSemantics(entry, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    requireCondition(
      !key.includes('completion'),
      'TRACE_0C_COMPLETION_BOUNDARY',
      `0C evidence graph contains premature completion semantics: ${path}.${key}`
    );
    assertNoCompletionSemantics(child, `${path}.${key}`);
  }
};
assertNoCompletionSemantics(evidence);
requireCondition(
  exactSet(evidence.excludes, [
    'investigation_runtime',
    'check_resolution',
    'completion_evaluator',
    'epilogue_evaluator'
  ]),
  'TRACE_0C_COMPLETION_BOUNDARY',
  '0C evidence graph must explicitly exclude completion evaluation'
);
const principalLineInputs = principalPolicy?.cross_chain_inference?.input_chain_terminal_refs;
requireCondition(
  principalPolicy?.conclusion === 'principal_zhdanko'
    && principalPolicy?.minimum_independent_chain_count === 2
    && principalPolicy?.cross_chain_inference?.operator === 'approved_combinations'
    && principalPolicy?.cross_chain_inference?.requires_distinct_independence_classes === true
    && exactSet(
      principalLineInputs?.map(({ chain_ref }) => chain_ref),
      Object.keys(requiredChains)
    )
    && principalLineInputs.every(
      ({ chain_ref, terminal_conclusion, independence_class }) => {
        const chain = chains.get(chain_ref);
        return chain?.terminal_conclusion === terminal_conclusion
          && chain?.independence_class === independence_class;
      }
    )
    && principalPolicy?.single_evidence_sufficient === false
    && principalPolicy?.confession_sufficient_alone === false
    && principalPolicy?.player_hypothesis_changes_truth === false
    && principalPolicy?.accusation_changes_culprit === false,
  'TRACE_0C_CONFESSION_ONLY',
  'principal inference must use exact approved independent-line combinations'
);
const partialOutcomes = mapUnique(
  principalPolicy.partial_outcomes,
  'partial_outcome_id',
  'TRACE_0C_PARTIAL_OUTCOME'
);
const noDirectVoiceOutcome = partialOutcomes.get('trace_ld_v1_principal_without_direct_voice');
requireCondition(
  partialOutcomes.size === 1
    && exactSet(Object.keys(noDirectVoiceOutcome), [
      'partial_outcome_id',
      'resolution_status',
      'establishes',
      'does_not_establish',
      'resolution_scope'
    ])
    && noDirectVoiceOutcome?.resolution_status === 'partial_evidence_resolution'
    && exactSet(noDirectVoiceOutcome.establishes, [
      'ratsha_participated',
      'stolen_bag_at_zhdanko',
      'conceal_entrusted_goods_shortage'
    ])
    && exactSet(noDirectVoiceOutcome.does_not_establish, [
      'direct_zhdanko_voice_connection',
      'full_principal_zhdanko'
    ])
    && noDirectVoiceOutcome.resolution_scope === 'evidence_strength_only_no_completion_state',
  'TRACE_0C_PARTIAL_OUTCOME',
  'partial evidence outcome without direct voice is missing or overstates resolution semantics'
);
const expectedPrincipalCombinations = Object.freeze({
  trace_ld_v1_principal_physical_testimonial_full: {
    chainRefs: [
      'trace_ld_v1_chain_physical_to_ratsha_to_bag',
      'trace_ld_v1_chain_witnesses_confession_voice'
    ],
    outcomeKind: 'full_principal_established',
    outcomeRef: 'conclusion:principal_zhdanko',
    disjoint: true
  },
  trace_ld_v1_principal_testimonial_documentary_full: {
    chainRefs: [
      'trace_ld_v1_chain_witnesses_confession_voice',
      'trace_ld_v1_chain_document_reconciliation_motive'
    ],
    outcomeKind: 'full_principal_established',
    outcomeRef: 'conclusion:principal_zhdanko',
    disjoint: true
  },
  trace_ld_v1_principal_physical_documentary_partial: {
    chainRefs: [
      'trace_ld_v1_chain_physical_to_ratsha_to_bag',
      'trace_ld_v1_chain_document_reconciliation_motive'
    ],
    outcomeKind: 'partial_principal_corroborated',
    outcomeRef: 'partial_outcome:trace_ld_v1_principal_without_direct_voice',
    disjoint: false,
    sharedLeafRefs: ['trace_ld_v1_evidence_bag_at_zhdanko']
  }
});
const principalCombinations = mapUnique(
  principalPolicy.cross_chain_inference.approved_combinations,
  'combination_id',
  'TRACE_0C_PRINCIPAL_COMBINATION'
);
requireCondition(
  exactSet([...principalCombinations.keys()], Object.keys(expectedPrincipalCombinations)),
  'TRACE_0C_PRINCIPAL_COMBINATION',
  'approved principal combination set is incomplete or contains an unknown combination'
);
for (const [combinationId, expected] of Object.entries(expectedPrincipalCombinations)) {
  const combination = principalCombinations.get(combinationId);
  const independenceClasses = combination.chain_refs.map(
    (chainRef) => chains.get(chainRef)?.independence_class
  );
  const [leftLeaves, rightLeaves] = combination.chain_refs.map(
    (chainRef) => new Set(chains.get(chainRef)?.leaf_evidence_refs)
  );
  const sharedLeafRefs = [...leftLeaves].filter((evidenceRef) => rightLeaves.has(evidenceRef));
  requireCondition(
    exactSet(combination.chain_refs, expected.chainRefs)
      && combination.chain_refs.length === principalPolicy.minimum_independent_chain_count
      && unique(independenceClasses)
      && combination.outcome_kind === expected.outcomeKind
      && combination.outcome_ref === expected.outcomeRef
      && combination.requires_disjoint_leaf_evidence === expected.disjoint
      && (expected.disjoint
        ? sharedLeafRefs.length === 0 && combination.shared_leaf_evidence_refs === undefined
        : exactSet(combination.shared_leaf_evidence_refs, expected.sharedLeafRefs)
          && exactSet(sharedLeafRefs, expected.sharedLeafRefs)),
    'TRACE_0C_EVIDENCE_INDEPENDENCE',
    `principal combination has invalid provenance or outcome: ${combinationId}`
  );
}
const principalSatisfiedBy = (evidenceRefs) => new Set(
  principalLineInputs
    .filter(({ chain_ref, terminal_conclusion }) =>
      chainEvaluators.get(chain_ref)(evidenceRefs).has(`conclusion:${terminal_conclusion}`))
    .map(({ chain_ref }) => chain_ref)
);
const evaluatePrincipalOutcome = (evidenceRefs) => {
  const satisfiedChains = principalSatisfiedBy(evidenceRefs);
  const admitted = [...principalCombinations.values()].filter((combination) =>
    combination.chain_refs.every((chainRef) => satisfiedChains.has(chainRef)));
  const selected = admitted.find(({ outcome_kind }) => outcome_kind === 'full_principal_established')
    ?? admitted.find(({ outcome_kind }) => outcome_kind === 'partial_principal_corroborated');
  return selected
    ? {
        combination_ref: selected.combination_id,
        outcome_kind: selected.outcome_kind,
        outcome_ref: selected.outcome_ref
      }
    : null;
};
const allEvidenceRefs = [
  ...evidenceRecords.keys(),
  ...identityBindingSlotRefs,
  ...terminalSlotRefs
];
requireCondition(
  evaluatePrincipalOutcome(allEvidenceRefs)?.outcome_kind === 'full_principal_established',
  'TRACE_0C_EVIDENCE_TERMINAL',
  'approved evidence cannot satisfy an approved full principal combination'
);
for (const { chain_ref } of principalLineInputs) {
  const onlyThisChainEvidence = [
    ...chains.get(chain_ref).leaf_evidence_refs,
    ...chains.get(chain_ref).admitted_binding_slot_refs,
    ...chains.get(chain_ref).admitted_terminal_slot_refs
  ];
  requireCondition(
    evaluatePrincipalOutcome(onlyThisChainEvidence) === null,
    'TRACE_0C_EVIDENCE_SHORTCUT',
    `one evidence line alone establishes a principal outcome: ${chain_ref}`
  );
}
const expectedEvidenceLossOutcomes = Object.freeze({
  blue_wool_or_binding_unavailable: {
    excludedRefs: [
      'trace_ld_v1_evidence_blue_wool',
      'binding_slot:trace_ld_v1_binding_blue_wool_to_ratsha_caftan'
    ],
    outcomeKind: 'full_principal_established',
    combinationRef: 'trace_ld_v1_principal_testimonial_documentary_full'
  },
  eremey_disclosure_unavailable: {
    excludedRefs: ['trace_ld_v1_evidence_eremey_words'],
    outcomeKind: 'full_principal_established',
    combinationRef: 'trace_ld_v1_principal_physical_testimonial_full'
  },
  ratsha_confession_unavailable: {
    excludedRefs: ['trace_ld_v1_evidence_ratsha_confession'],
    outcomeKind: 'full_principal_established',
    combinationRef: 'trace_ld_v1_principal_physical_testimonial_full'
  },
  onisim_testimony_unavailable: {
    excludedRefs: ['trace_ld_v1_evidence_onisim_testimony'],
    outcomeKind: 'partial_principal_corroborated',
    combinationRef: 'trace_ld_v1_principal_physical_documentary_partial',
    partialOutcomeRef: 'trace_ld_v1_principal_without_direct_voice'
  }
});
const evidenceLossOutcomeContracts = mapUnique(
  evidence.scoped_evidence_loss_outcome_contracts,
  'failure_case',
  'TRACE_0C_SCOPED_EVIDENCE_LOSS'
);
requireCondition(
  exactSet([...evidenceLossOutcomeContracts.keys()], Object.keys(expectedEvidenceLossOutcomes)),
  'TRACE_0C_SCOPED_EVIDENCE_LOSS',
  'scoped evidence-loss outcome contract set is incomplete or contains an unknown case'
);
for (const [failureCase, expected] of Object.entries(expectedEvidenceLossOutcomes)) {
  const contract = evidenceLossOutcomeContracts.get(failureCase);
  const outcome = evaluatePrincipalOutcome(
    allEvidenceRefs.filter((ref) => !expected.excludedRefs.includes(ref))
  );
  requireCondition(
    exactSet(contract.excluded_refs, expected.excludedRefs)
      && contract.required_outcome_kind === expected.outcomeKind
      && contract.required_combination_ref === expected.combinationRef
      && contract.required_partial_outcome_ref === expected.partialOutcomeRef
      && outcome?.outcome_kind === expected.outcomeKind
      && outcome?.combination_ref === expected.combinationRef
      && (expected.partialOutcomeRef === undefined
        ? outcome?.outcome_ref === 'conclusion:principal_zhdanko'
        : outcome?.outcome_ref === `partial_outcome:${expected.partialOutcomeRef}`),
    'TRACE_0C_SCOPED_EVIDENCE_LOSS',
    `declared evidence loss lacks its approved full or partial outcome: ${failureCase}`
  );
}
const checkLevelResilience = evidence.discovery_lifecycle_policy?.check_level_resilience;
requireCondition(
  evidence.discovery_lifecycle_policy?.clue_exists_before_discovery === true
    && evidence.discovery_lifecycle_policy?.repeat_discovery_creates_duplicate === false
    && evidence.discovery_lifecycle_policy?.single_failed_check_makes_graph_unsolvable === undefined
    && evidence.discovery_lifecycle_policy?.evidence_loss_contract_scope
      === 'declared_evidence_ref_exclusions_only'
    && checkLevelResilience?.status === 'unresolved_required'
    && checkLevelResilience?.planned_phase === '0D'
    && checkLevelResilience?.owner === '@rus/turn'
    && checkLevelResilience?.profile_category === 'activity_check_consequence_profiles'
    && checkLevelResilience?.required_mapping === 'check_outcome_to_admitted_evidence_bundle'
    && checkLevelResilience?.required_validation
      === 'evaluate_each_failed_check_bundle_against_approved_full_or_partial_outcomes'
    && evidenceLossOutcomeContracts.size === 4,
  'TRACE_0C_CHECK_LEVEL_RESILIENCE_GAP',
  '0C must scope evidence-loss checks and leave check-level resilience unresolved for 0D'
);

const requiredRecordTypes = [
  'fact',
  'perception',
  'knowledge',
  'hypothesis',
  'rumor',
  'false_assertion',
  'memory',
  'player_facing_text'
];
requireCondition(
  exactArray(knowledge.record_types, requiredRecordTypes),
  'TRACE_0C_KNOWLEDGE_TYPES',
  'knowledge record types are incomplete or merged'
);
const typeRules = mapUnique(knowledge.type_rules, 'record_type', 'TRACE_0C_KNOWLEDGE_TYPES');
requireCondition(
  exactSet([...typeRules.keys()], requiredRecordTypes),
  'TRACE_0C_KNOWLEDGE_TYPES',
  'each knowledge record type requires a separate rule'
);
requireCondition(
  typeRules.get('fact').invariant === 'fact_exists_independently_of_discovery'
    && typeRules.get('hypothesis').invariant === 'hypothesis_cannot_change_or_be_reclassified_as_fact'
    && typeRules.get('rumor').invariant === 'rumor_does_not_become_knowledge_without_confirmation'
    && typeRules.get('false_assertion').invariant === 'false_assertion_cannot_change_fact'
    && typeRules.get('memory').invariant === 'memory_requires_prior_occurred_or_perceived_event'
    && typeRules.get('player_facing_text').forbidden_source_classes.includes('hidden_truth')
    && typeRules.get('player_facing_text').forbidden_source_classes.includes('candidate_id')
    && typeRules.get('player_facing_text').forbidden_source_classes.includes('future_event'),
  'TRACE_0C_KNOWLEDGE_BOUNDARY',
  'fact/perception/knowledge/hypothesis/lie/player-facing boundaries are invalid'
);
const participantBindings = mapUnique(knowledge.participant_knowledge_bindings, 'participant_ref', 'TRACE_0C_KNOWLEDGE_SCOPE');
requireCondition(
  exactSet([...participantBindings.keys()], [...participantRefs]),
  'TRACE_0C_KNOWLEDGE_SCOPE',
  'knowledge rules must bind exactly the approved participant slots'
);
for (const binding of participantBindings.values()) {
  const validScope = binding.participant_ref === 'player_clerk'
    ? binding.knowledge_scope_ref === 'lower_dvina_trace_player_profile_mikula_v1'
    : knowledgeScopeRefs.has(binding.knowledge_scope_ref);
  requireCondition(validScope, 'TRACE_0C_KNOWLEDGE_SCOPE', `unknown knowledge scope ref: ${binding.knowledge_scope_ref}`);
}
requireCondition(
  participantBindings.get('player_clerk').initially_forbidden_categories.includes('culprit_identity')
    && participantBindings.get('player_clerk').initially_forbidden_categories.includes('hidden_event_sequence')
    && participantBindings.get('eremey_fisher').admitted_initial_basis.includes('saw_wet_ratsha_with_foreign_bag')
    && participantBindings.get('eremey_fisher').forbidden_inference.includes('bag_contents')
    && participantBindings.get('eremey_fisher').forbidden_inference.includes('zhdanko_real_motive')
    && participantBindings.get('ratsha_storehouse_helper').admitted_initial_basis.includes('received_instruction')
    && participantBindings.get('ratsha_storehouse_helper').forbidden_inference.includes('received_instruction_proves_principal_real_motive')
    && participantBindings.get('onisim_boatman').forbidden_inference.includes('packet_location_without_perception_or_message'),
  'TRACE_0C_KNOWLEDGE_BOUNDARY',
  '0C knowledge rules exceed or contradict approved 0B knowledge scopes'
);
const statements = mapUnique(knowledge.statement_templates, 'statement_template_id', 'TRACE_0C_STATEMENT');
const audienceSlots = mapUnique(
  knowledge.audience_candidate_slots,
  'candidate_slot_id',
  'TRACE_0C_AUDIENCE_BINDING'
);
requireCondition(
  audienceSlots.size === 1
    && audienceSlots.has('trace_ld_v1_audience_slot_participating_fisher'),
  'TRACE_0C_AUDIENCE_BINDING',
  'the participating-fisher audience slot is missing or duplicated'
);
const participatingFisherAudienceSlot = audienceSlots.get('trace_ld_v1_audience_slot_participating_fisher');
requireCondition(
  exactSet(participatingFisherAudienceSlot.candidate_participant_refs, [
    'background_fisher_1',
    'background_fisher_2'
  ])
    && participatingFisherAudienceSlot.selection_cardinality?.minimum === 1
    && participatingFisherAudienceSlot.selection_cardinality?.maximum === 1
    && participatingFisherAudienceSlot.selection_status === 'unbound_template'
    && participatingFisherAudienceSlot.binding_owner === 'code_driven_materializer'
    && participatingFisherAudienceSlot.binding_phase === 'phase_1a_before_first_screen'
    && participatingFisherAudienceSlot.selected_candidate_requires_scene_presence === true
    && participatingFisherAudienceSlot.selected_candidate_requires_perception_capability === true
    && participatingFisherAudienceSlot.unselected_candidates_receive_statement_perception === false
    && text(participatingFisherAudienceSlot.causal_basis),
  'TRACE_0C_AUDIENCE_BINDING',
  'participating-fisher audience selection or perception boundary is invalid'
);
requireCondition(
  exactSet(knowledge.testimony_contract?.required_fields, [
    'speaker_ref',
    'required_audience_refs',
    'audience_candidate_slot_refs',
    'source_knowledge_refs',
    'statement_ref',
    'message_completeness',
    'truth_classification',
    'assertion'
  ]),
  'TRACE_0C_STATEMENT',
  'testimony contract required fields are incomplete'
);
for (const statement of statements.values()) {
  requireCondition(
    knowledge.testimony_contract.required_fields.every((key) => Object.hasOwn(statement, key))
      && participantRefs.has(statement.speaker_ref)
      && unique(statement.required_audience_refs)
      && statement.required_audience_refs.length > 0
      && statement.required_audience_refs.every((ref) => participantRefs.has(ref))
      && unique(statement.audience_candidate_slot_refs)
      && statement.audience_candidate_slot_refs.every((ref) => audienceSlots.has(ref))
      && unique(statement.source_knowledge_refs)
      && statement.source_knowledge_refs.length > 0
      && statement.statement_ref === `statement_template:${statement.statement_template_id}`
      && knowledge.testimony_contract.message_completeness_values.includes(statement.message_completeness)
      && knowledge.testimony_contract.truth_classification_values.includes(statement.truth_classification)
      && text(statement.assertion?.assertion_id)
      && statement.assertion?.record_type === 'statement_assertion_template'
      && text(statement.assertion?.content_scope)
      && statement.application_status === 'template_only',
    'TRACE_0C_STATEMENT',
    `statement template does not satisfy testimony contract: ${statement.statement_template_id}`
  );
  for (const sourceRef of statement.source_knowledge_refs) {
    const match = /^knowledge_scope:([^#]+)#(.+)$/u.exec(sourceRef);
    const speakerScopeRef = participantBindings.get(statement.speaker_ref)?.knowledge_scope_ref;
    requireCondition(
      match
        && match[1] === speakerScopeRef
        && knowledgeScopes.has(match[1])
        && knowledgeScopes.get(match[1]).allowed_categories.includes(match[2])
        && statement.source_knowledge_categories.includes(match[2]),
      'TRACE_0C_STATEMENT',
      `statement source knowledge ref is unknown or incompatible: ${sourceRef}`
    );
  }
}
const onisimTestimonyStatement = statements.get('trace_ld_v1_statement_onisim_testimony');
requireCondition(
  exactArray(onisimTestimonyStatement?.source_perception_template_refs, [
    onisimVoicePerception.perception_template_id
  ])
    && onisimVoicePerception.admitted_statement_template_refs.includes(
      onisimTestimonyStatement.statement_template_id
    )
    && exactSet(onisimTestimonyStatement.source_knowledge_categories, [
      'incident_fact',
      'executor_identity',
      'memory_content'
    ])
    && onisimVoicePerception.admitted_knowledge_categories.every(
      (category) => onisimTestimonyStatement.source_knowledge_categories.includes(category)
    )
    && onisimTestimonyStatement.assertion?.content_scope === 'perceived_voice_and_ratsha_actions'
    && onisimTestimonyStatement.permitted_content_boundary === 'perceived_voice_and_ratsha_actions_only',
  'TRACE_0C_ONISIM_VOICE_SOURCE',
  'Onisim testimony does not resolve to its approved auditory perception and memory source'
);
requireCondition(
  statements.get('trace_ld_v1_statement_eremey_first_answer')?.classification === 'withholding'
    && statements.get('trace_ld_v1_statement_zhdanko_denial')?.classification === 'false_assertion'
    && statements.get('trace_ld_v1_statement_zhdanko_denial')?.fact_mutation === 'forbidden'
    && statements.get('trace_ld_v1_statement_ratsha_confession')?.requires_independent_confirmation === true,
  'TRACE_0C_FALSE_ASSERTION',
  'withholding, false assertion, or confession boundary is invalid'
);
requireCondition(
  knowledge.testimony_contract?.withholding_is_false_assertion === false
    && knowledge.testimony_contract?.reload_mutates_committed_statement === false
    && exactSet(knowledge.testimony_contract?.audience_knowledge_creation_requires, [
      'statement_committed',
      'participant_bound_to_required_audience_or_candidate_slot',
      'participant_present_at_statement',
      'participant_perception_capable'
    ])
    && knowledge.testimony_contract?.unselected_candidates_receive_knowledge === false
    && knowledge.testimony_contract?.absent_participants_receive_knowledge === false,
  'TRACE_0C_STATEMENT',
  'testimony persistence or withholding classification is invalid'
);
const participatingFisherSlotRef = 'trace_ld_v1_audience_slot_participating_fisher';
requireCondition(
  exactSet(
    statements.get('trace_ld_v1_statement_ratsha_confession')?.required_audience_refs,
    ['player_clerk', 'eremey_fisher']
  )
    && exactSet(
      statements.get('trace_ld_v1_statement_ratsha_confession')?.audience_candidate_slot_refs,
      [participatingFisherSlotRef]
    )
    && exactSet(
      statements.get('trace_ld_v1_statement_zhdanko_denial')?.required_audience_refs,
      ['player_clerk', 'eremey_fisher', 'ratsha_storehouse_helper']
    )
    && exactSet(
      statements.get('trace_ld_v1_statement_zhdanko_denial')?.audience_candidate_slot_refs,
      [participatingFisherSlotRef]
    ),
  'TRACE_0C_AUDIENCE_BINDING',
  'confession or denial does not bind all required listeners and the participating-fisher slot'
);
requireCondition(
  knowledge.hypothesis_templates?.length === 1
    && knowledge.hypothesis_templates[0].record_type === 'hypothesis'
    && knowledge.hypothesis_templates[0].truth_mutation === 'forbidden',
  'TRACE_0C_HYPOTHESIS_AS_FACT',
  'wrong-culprit player hypothesis must remain a hypothesis and cannot change truth'
);
requireCondition(
  knowledge.promise_memory_compatibility_slot?.runtime_status === 'not_active'
    && knowledge.promise_memory_compatibility_slot?.promisor_ref === 'player_clerk'
    && knowledge.promise_memory_compatibility_slot?.beneficiary_ref === 'ratsha_storehouse_helper'
    && exactSet(knowledge.promise_memory_compatibility_slot?.witness_refs, ['eremey_fisher'])
    && knowledge.promise_memory_compatibility_slot?.participating_fisher_witness_slot_ref
      === participatingFisherSlotRef
    && !Object.hasOwn(
      knowledge.promise_memory_compatibility_slot,
      'participating_fisher_witness_candidate_refs'
    )
    && knowledge.promise_memory_compatibility_slot?.witness_binding_inheritance
      ?.participant_binding === 'inherit_selected_candidate'
    && knowledge.promise_memory_compatibility_slot?.witness_binding_inheritance
      ?.presence_requirement === 'inherit_selected_candidate_requires_scene_presence'
    && knowledge.promise_memory_compatibility_slot?.witness_binding_inheritance
      ?.perception_requirement === 'inherit_selected_candidate_requires_perception_capability'
    && knowledge.promise_memory_compatibility_slot?.witness_binding_inheritance
      ?.unselected_candidate_memory === 'forbidden',
  'TRACE_0C_PROMISE_SLOT',
  'future promise memory must inherit the bound participating-fisher audience slot'
);

const mustRemainEmpty = [
  [items, ['item_instances', 'container_instances', 'materialized_placements']],
  [hidden, ['event_instances', 'item_instances', 'actor_instances', 'materialized_placements']],
  [evidence, ['discovered_evidence_instances', 'player_hypotheses', 'accusations']],
  [knowledge, [
    'fact_records',
    'perception_records',
    'knowledge_records',
    'hypothesis_records',
    'rumor_records',
    'false_assertion_records',
    'memory_records',
    'player_facing_text_records',
    'committed_statements',
    'active_promises'
  ]]
];
for (const [value, keys] of mustRemainEmpty) {
  for (const key of keys) {
    requireCondition(Array.isArray(value[key]) && value[key].length === 0, 'TRACE_0C_CONCRETE_INSTANCE', `${key} must remain empty in definition package`);
  }
}
requireCondition(
  !Object.hasOwn(hidden, 'party_selection')
    && !Object.hasOwn(hidden, 'party_id')
    && !Object.hasOwn(hidden, 'seed'),
  'TRACE_0C_PARTY_SELECTION',
  'definition package contains a concrete party selection, ID, or seed'
);
const scanConcreteRuntimeData = (value, path = []) => {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanConcreteRuntimeData(entry, [...path, index]));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    const isSemanticPolicy = ['fallback_policy', 'normalization_policy', 'alias_policy'].includes(normalizedKey);
    if (isSemanticPolicy) {
      requireCondition(
        path.length === 0 && child === 'forbidden',
        'TRACE_0C_SEMANTIC_FALLBACK',
        `semantic fallback policy is nested or enabled at ${[...path, key].join('.')}`
      );
    } else if (/alias|normaliz|fallback/iu.test(normalizedKey)) {
      fail(
        'TRACE_0C_SEMANTIC_FALLBACK',
        `alias, normalization, or fallback mapping is forbidden at ${[...path, key].join('.')}`
      );
    }
    if ([
      'party_instance',
      'party_instances',
      'materialized_party',
      'materialized_party_instance',
      'party_materialization',
      'party_selection'
    ].includes(normalizedKey)) {
      fail(
        'TRACE_0C_CONCRETE_INSTANCE',
        `party materialization or selection is forbidden at ${[...path, key].join('.')}`
      );
    }
    if ((key === 'party_id' || key === 'seed' || key === 'instance_id') && child !== null && child !== undefined) {
      fail('TRACE_0C_CONCRETE_INSTANCE', `concrete runtime identity is forbidden at ${[...path, key].join('.')}`);
    }
    if (/runtime_binding|api_binding|scenario_publication_binding/iu.test(key)) {
      fail('TRACE_0C_RUNTIME_BINDING', `runtime/API binding is forbidden at ${[...path, key].join('.')}`);
    }
    scanConcreteRuntimeData(child, [...path, key]);
  }
};
for (const value of [definition, items, hidden, evidence, knowledge, manifest]) scanConcreteRuntimeData(value);

console.log(JSON.stringify({
  package_id: manifest.package_id,
  revision: definition.revision,
  content_digest: sha256Path(resolve(directory, 'manifest.json')),
  unresolved_0d_count: unresolved.size
}));
