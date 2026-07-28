import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const directoryArgument = process.argv.indexOf('--directory');
const directory = directoryArgument === -1
  ? resolve(root, 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0b')
  : resolve(process.argv[directoryArgument + 1]);
const validationOnly = process.argv.includes('--validation-only');
const spatialDirectoryArgument = process.argv.indexOf('--spatial-directory');
const spatialDirectory = spatialDirectoryArgument === -1
  ? resolve(root, 'data/world-catalogs/novgorod/spatial-v3')
  : resolve(process.argv[spatialDirectoryArgument + 1]);
if (spatialDirectoryArgument !== -1 && !validationOnly) {
  throw new Error('lower-dvina trace phase 0B: spatial source override is allowed only for validation fixtures');
}
const socialCatalogRootArgument = process.argv.indexOf('--social-catalog-root');
const socialCatalogRoot = socialCatalogRootArgument === -1
  ? root
  : resolve(process.argv[socialCatalogRootArgument + 1]);
if (socialCatalogRootArgument !== -1 && !validationOnly) {
  throw new Error('lower-dvina trace phase 0B: social catalog source override is allowed only for validation fixtures');
}
const playerProfileDirectoryArgument = process.argv.indexOf('--player-profile-directory');
const playerProfileDirectory = playerProfileDirectoryArgument === -1
  ? resolve(root, 'data/world-catalogs/novgorod/lower-dvina-trace-v1')
  : resolve(process.argv[playerProfileDirectoryArgument + 1]);
if (playerProfileDirectoryArgument !== -1 && !validationOnly) {
  throw new Error('lower-dvina trace phase 0B: player profile source override is allowed only for validation fixtures');
}
const files = ['definition.json', 'participant-profile-set.json', 'location-topology-set.json'];
const trustedDigests = Object.freeze({
  'definition.json': '3b19de63027c1aa989f23e37c953bdb6559f569e5357c160de2ccd89905f3182',
  'participant-profile-set.json': '33e45b8b8b57f98debb254e5e76c881cf3ffe10985042811ed85390e38f588ce',
  'location-topology-set.json': '3410d8652aa87d76a2be37cf6f21b9179ac3dd61c88ea84b94486b19765342ce'
});

const readJson = (name) => JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
const digest = (name) => createHash('sha256').update(readFileSync(resolve(directory, name))).digest('hex');
const fail = (message) => { throw new Error(`lower-dvina trace phase 0B: ${message}`); };
const exactKeys = (value, expected) => JSON.stringify(Object.keys(value ?? {}).sort()) === JSON.stringify([...expected].sort());
const exactArray = (value, expected) => Array.isArray(value)
  && value.length === expected.length
  && value.every((entry, index) => entry === expected[index]);
const exactSet = (value, expected) => Array.isArray(value)
  && value.length === expected.length
  && new Set(value).size === value.length
  && expected.every((entry) => value.includes(entry));
const digestValue = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const fileDigest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

const parseTsv = (path) => {
  const [headerLine, ...lines] = readFileSync(path, 'utf8').replace(/^\uFEFF/u, '').trimEnd().split(/\r?\n/u);
  const headers = headerLine.split('\t');
  return lines.map((line) => Object.fromEntries(line.split('\t').map((value, index) => [headers[index], value])));
};

const definition = readJson('definition.json');
const participants = readJson('participant-profile-set.json');
const locations = readJson('location-topology-set.json');
const manifest = readJson('manifest.json');

if (manifest.schema !== 'rus.trace_phase_0b_manifest.v1'
  || manifest.package_id !== 'lower_dvina_trace_phase_0b_v1'
  || manifest.revision !== 1
  || manifest.publication_status !== 'unpublished'
  || !exactKeys(manifest.files, files)) {
  fail('manifest identity or file set is invalid');
}
for (const name of files) {
  const actual = digest(name);
  if (!digestValue(manifest.files[name]) || manifest.files[name] !== actual) fail(`manifest digest mismatch: ${name}`);
  if (!validationOnly && actual !== trustedDigests[name]) fail(`trusted digest mismatch: ${name}`);
}

const unresolvedRequirements = Object.freeze({
  item_container_set: ['@rus/items-property', 'rus.trace_item_container_set.v1', '0C'],
  hidden_truth_candidate_set: ['code-driven-world-materialization', 'rus.trace_hidden_truth_candidate_set.v1', '0C'],
  clue_evidence_graph_set: ['@rus/visibility-knowledge-memory', 'rus.trace_clue_evidence_graph_set.v1', '0C'],
  knowledge_lie_memory_rules: ['@rus/visibility-knowledge-memory', 'rus.trace_knowledge_lie_memory_rules.v1', '0C'],
  activity_check_consequence_profiles: ['@rus/turn', 'rus.trace_activity_check_consequence_profiles.v1', '0D'],
  npc_decision_schedule_policies: ['@rus/npc-runtime', 'rus.trace_npc_decision_schedule_policies.v1', '0D'],
  movement_bindings: ['@rus/movement-routes', 'rus.trace_movement_bindings.v1', '0D'],
  location_access_policies: ['@rus/movement-routes', 'rus.trace_scene_access_policy_set.v1', '0D'],
  location_capacity_contracts: ['@rus/party-store', 'rus.trace_scene_capacity_contract_set.v1', '0D'],
  body_environment_profiles: ['@rus/body-state', 'rus.trace_body_environment_profiles.v1', '0D'],
  promise_policy: ['@rus/social-law', 'rus.trace_promise_policy.v1', '0D'],
  completion_rules: ['@rus/visibility-knowledge-memory', 'rus.trace_completion_rules.v1', '0D'],
  epilogue_rules: ['@rus/presentation', 'rus.trace_epilogue_rules.v1', '0D']
});
if (definition.schema !== 'rus.trace_scenario_definition.v1'
  || definition.scenario_id !== 'lower_dvina_trace_v1'
  || definition.revision !== 2
  || definition.publication_status !== 'unpublished'
  || !exactKeys(definition, [
    'schema',
    'scenario_id',
    'revision',
    'publication_status',
    'supersedes_definition_ref',
    'applicability',
    'readiness',
    'player_profile_set_ref',
    'social_catalog_source_ref',
    'spatial_source_ref',
    'participant_profile_set_ref',
    'location_topology_set_ref',
    'required_unresolved_refs',
    'scope',
    'excludes'
  ])) {
  fail('definition identity is invalid');
}
if (definition.supersedes_definition_ref?.id !== 'lower_dvina_trace_v1'
  || definition.supersedes_definition_ref?.revision !== 1
  || definition.supersedes_definition_ref?.digest !== '3ed251d4ef1c7538da754b70f319bb213e4422b1d5e4e1dcd20c02753995c03b') {
  fail('definition does not exactly supersede immutable revision 1');
}
if (definition.applicability?.schema !== 'rus.trace_scenario_applicability.v1'
  || definition.applicability?.version !== 1
  || definition.applicability?.region_ref?.node_id !== 'gn_nov_g1_xp017_yp026'
  || definition.applicability?.region_ref?.node_level !== 'g1'
  || definition.applicability?.season_id !== 'late_summer') {
  fail('definition applicability is invalid');
}
if (definition.readiness?.schema !== 'rus.trace_scenario_readiness.v1'
  || definition.readiness?.version !== 1
  || definition.readiness?.phase_status !== 'phase_0_incomplete'
  || definition.readiness?.materialization_status !== 'not_materializable'
  || definition.readiness?.publication_status !== 'not_publishable') {
  fail('definition readiness is invalid');
}
const playerProfileSetPath = resolve(playerProfileDirectory, 'player-profile-set.json');
const playerProfilePath = resolve(playerProfileDirectory, 'player-profile.json');
const approvedPolicyPath = resolve(playerProfileDirectory, 'approved-policy.json');
const playerProfileSet = JSON.parse(readFileSync(playerProfileSetPath, 'utf8'));
const playerProfile = JSON.parse(readFileSync(playerProfilePath, 'utf8'));
const approvedPolicy = JSON.parse(readFileSync(approvedPolicyPath, 'utf8'));
const playerProfileSetDigest = fileDigest(playerProfileSetPath);
const playerProfileDigest = fileDigest(playerProfilePath);
const approvedPolicyDigest = fileDigest(approvedPolicyPath);
if (definition.player_profile_set_ref?.id !== 'lower_dvina_trace_player_profile_set_v1'
  || definition.player_profile_set_ref?.revision !== 1
  || definition.player_profile_set_ref?.digest !== playerProfileSetDigest
  || (!validationOnly && playerProfileSetDigest !== '2a25fd04f0e9b71f1ab2805cd3d68620d9ea2d1646e0671e128e886eb54ee865')) {
  fail('approved player profile-set ref is invalid');
}
const playerProfileCandidate = playerProfileSet.profile_candidates?.[0];
if (playerProfileSet.schema !== 'rus.trace_player_profile_set.v1'
  || playerProfileSet.profile_set_id !== definition.player_profile_set_ref.id
  || playerProfileSet.revision !== definition.player_profile_set_ref.revision
  || playerProfileSet.publication_status !== 'unpublished'
  || playerProfileSet.profile_candidates?.length !== 1
  || playerProfileCandidate?.id !== playerProfile.profile_id
  || playerProfileCandidate?.revision !== playerProfile.revision
  || playerProfileCandidate?.digest !== playerProfileDigest
  || playerProfileSet.approved_policy_ref?.id !== approvedPolicy.policy_id
  || playerProfileSet.approved_policy_ref?.revision !== approvedPolicy.revision
  || playerProfileSet.approved_policy_ref?.digest !== approvedPolicyDigest) {
  fail('player profile-set chain is invalid');
}
if (playerProfile.schema !== 'rus.trace_player_profile.v1'
  || playerProfile.profile_id !== 'lower_dvina_trace_player_profile_mikula_v1'
  || playerProfile.revision !== 1
  || typeof playerProfile.role?.id !== 'string'
  || typeof playerProfile.occupation_id !== 'string'
  || approvedPolicy.schema !== 'rus.trace_player_profile_policy.v1'
  || approvedPolicy.revision !== 1
  || approvedPolicy.publication_status !== 'unpublished'
  || approvedPolicy.policy_id !== 'lower_dvina_trace_player_profile_v1'
  || approvedPolicy.profile_ref?.id !== playerProfile.profile_id
  || approvedPolicy.profile_ref?.revision !== playerProfile.revision
  || approvedPolicy.profile_ref?.digest !== playerProfileDigest
  || approvedPolicy.occupation_id !== playerProfile.occupation_id) {
  fail('player profile and approved policy are inconsistent');
}
if (definition.participant_profile_set_ref?.id !== participants.profile_set_id
  || definition.participant_profile_set_ref?.revision !== participants.revision
  || definition.participant_profile_set_ref?.digest !== digest('participant-profile-set.json')) {
  fail('participant profile-set ref is not exact');
}
if (definition.location_topology_set_ref?.id !== locations.topology_set_id
  || definition.location_topology_set_ref?.revision !== locations.revision
  || definition.location_topology_set_ref?.digest !== digest('location-topology-set.json')) {
  fail('location topology-set ref is not exact');
}
if (!Array.isArray(definition.required_unresolved_refs)
  || definition.required_unresolved_refs.length !== Object.keys(unresolvedRequirements).length) {
  fail('required 0C/0D gap descriptors are incomplete');
}
for (const ref of definition.required_unresolved_refs) {
  const expected = unresolvedRequirements[ref?.category];
  if (!expected
    || !exactKeys(ref, ['category', 'expected_owner', 'expected_schema', 'required_status', 'resolution_status', 'planned_phase'])
    || ref.expected_owner !== expected[0]
    || ref.expected_schema !== expected[1]
    || ref.planned_phase !== expected[2]
    || ref.required_status !== 'unresolved_required'
    || ref.resolution_status !== 'unresolved') {
    fail(`invalid unresolved descriptor: ${ref?.category ?? 'unknown'}`);
  }
}
if (!exactSet(definition.scope, ['phase_0_definition', 'player_definition', 'player_profile', 'participant_profile_set', 'location_topology_set'])
  || !exactSet(definition.excludes, ['party_instance', 'runtime_handlers', 'api_publication'])) {
  fail('definition scope boundary is invalid');
}

const slots = [
  'player_clerk',
  'onisim_boatman',
  'eremey_fisher',
  'ratsha_storehouse_helper',
  'zhdanko_storehouse_controller',
  'background_fisher_1',
  'background_fisher_2'
];
if (participants.schema !== 'rus.trace_participant_profile_set.v1'
  || participants.profile_set_id !== 'trace_ld_v1_participant_profile_set'
  || participants.revision !== 1
  || participants.publication_status !== 'unpublished'
  || participants.fallback_policy !== 'forbidden'
  || !exactArray(participants.participant_slots, slots)
  || !exactKeys(participants, [
    'schema',
    'profile_set_id',
    'revision',
    'publication_status',
    'fallback_policy',
    'social_catalog_source_ref',
    'participant_slots',
    'profiles',
    'candidate_sets',
    'knowledge_scope_profiles',
    'knowledge_seed_records',
    'perception_records',
    'memory_records',
    'lie_records',
    'hypothesis_records',
    'rumor_records',
    'initial_placements',
    'hidden_truth',
    'relation_types',
    'relations'
  ])) {
  fail('participant profile-set identity or required slots are invalid');
}
if (JSON.stringify(participants).includes('fisherman')) fail('unknown fisherman alias is forbidden');

const socialCatalogSourceKeys = [
  'schema',
  'version',
  'source_ref_id',
  'role_catalog',
  'occupation_catalog'
];
const socialCatalogKeys = ['catalog_id', 'path', 'format', 'format_version', 'sha256'];
const expectedSocialCatalogSource = Object.freeze({
  schema: 'rus.trace_social_catalog_source_ref.v1',
  version: 1,
  source_ref_id: 'novgorod_region_social_catalogs_v1',
  role_catalog: Object.freeze({
    catalog_id: 'novgorod_social_roles_v1',
    path: 'data/novgorod-region/novgorod_social_roles_v1.tsv',
    format: 'tsv',
    format_version: 1,
    sha256: '6cdb747d48fa511fdb34c18831c9c79003c7c75805fdf60b1c2fa1cda6b45e5b'
  }),
  occupation_catalog: Object.freeze({
    catalog_id: 'novgorod_occupations_v1',
    path: 'data/novgorod-region/novgorod_occupations_v1.tsv',
    format: 'tsv',
    format_version: 1,
    sha256: '6273ccdeed19b1afbf22975587492e3a2754ed295879ae5b616b213ade99ab0f'
  })
});
const exactSocialCatalogSource = (source) => exactKeys(source, socialCatalogSourceKeys)
  && exactKeys(source?.role_catalog, socialCatalogKeys)
  && exactKeys(source?.occupation_catalog, socialCatalogKeys)
  && JSON.stringify(source) === JSON.stringify(expectedSocialCatalogSource);
if (!exactSocialCatalogSource(definition.social_catalog_source_ref)
  || !exactSocialCatalogSource(participants.social_catalog_source_ref)
  || JSON.stringify(definition.social_catalog_source_ref) !== JSON.stringify(participants.social_catalog_source_ref)) {
  fail('social catalog source ref is unknown, unpinned, or inconsistent');
}
const roleCatalogPath = resolve(socialCatalogRoot, expectedSocialCatalogSource.role_catalog.path);
const occupationCatalogPath = resolve(socialCatalogRoot, expectedSocialCatalogSource.occupation_catalog.path);
if (fileDigest(roleCatalogPath) !== definition.social_catalog_source_ref.role_catalog.sha256) {
  fail('social role catalog digest mismatch');
}
if (fileDigest(occupationCatalogPath) !== definition.social_catalog_source_ref.occupation_catalog.sha256) {
  fail('occupation catalog digest mismatch');
}

const profilesById = new Map((participants.profiles ?? []).map((profile) => [profile.profile_id, profile]));
const expectedProfiles = Object.freeze({
  trace_ld_v1_onisim_hired_boatman_v1: [
    'onisim_boatman',
    'nov_role_boatman',
    'nov_occ_boatman',
    'trace_ld_v1_knowledge_scope_hired_boatman_v1'
  ],
  trace_ld_v1_eremey_local_fisher_v1: [
    'eremey_fisher',
    'nov_role_fisher',
    'nov_occ_fisher',
    'trace_ld_v1_knowledge_scope_local_fisher_v1'
  ],
  trace_ld_v1_ratsha_storehouse_helper_v1: [
    'ratsha_storehouse_helper',
    'nov_role_servant',
    'nov_occ_storehouse_keeper',
    'trace_ld_v1_knowledge_scope_storehouse_helper_v1'
  ],
  trace_ld_v1_zhdanko_storehouse_controller_v1: [
    'zhdanko_storehouse_controller',
    'nov_role_merchant_clerk',
    'nov_occ_storehouse_keeper',
    'trace_ld_v1_knowledge_scope_storehouse_controller_v1'
  ],
  trace_ld_v1_background_fisher_v1: [
    'background_fisher',
    'nov_role_fisher',
    'nov_occ_fisher',
    'trace_ld_v1_knowledge_scope_background_fisher_v1'
  ]
});
if (!Array.isArray(participants.profiles)
  || participants.profiles.length !== Object.keys(expectedProfiles).length
  || profilesById.size !== participants.profiles.length) {
  fail('participant profile set is incomplete or duplicated');
}

const roles = new Map(parseTsv(roleCatalogPath).map((row) => [row.role_id, row]));
const occupations = new Map(parseTsv(occupationCatalogPath).map((row) => [row.occupation_id, row]));
const playerRole = roles.get(playerProfile.role.id);
const playerOccupation = occupations.get(playerProfile.occupation_id);
if (!playerRole || !['approved', 'usable_with_caution'].includes(playerRole.status)
  || playerProfile.role.applicability !== playerRole.status) {
  fail(`unknown or unusable player social role: ${playerProfile.role.id}`);
}
if (!playerOccupation || !['approved', 'usable_with_caution'].includes(playerOccupation.status)) {
  fail(`unknown or unusable player occupation: ${playerProfile.occupation_id}`);
}
if (!playerOccupation.allowed_social_role_ids.split(/;\s*/u).includes(playerProfile.role.id)) {
  fail('player occupation is incompatible with player social role');
}
for (const [profileId, [slot, roleId, occupationId, knowledgeScopeId]] of Object.entries(expectedProfiles)) {
  const profile = profilesById.get(profileId);
  if (!profile || profile.revision !== 1 || profile.slot !== slot
    || profile.social_role_id !== roleId || profile.occupation_id !== occupationId
    || profile.knowledge_scope_ref !== knowledgeScopeId
    || typeof profile.causal_basis !== 'string' || profile.causal_basis.length === 0) {
    fail(`participant profile is invalid: ${profileId}`);
  }
  const role = roles.get(profile.social_role_id);
  const occupation = occupations.get(profile.occupation_id);
  if (!role || !['approved', 'usable_with_caution'].includes(role.status)) fail(`unknown or unusable social role: ${profile.social_role_id}`);
  if (!occupation || occupation.status !== 'approved') fail(`unknown or unapproved occupation: ${profile.occupation_id}`);
  const allowedRoles = occupation.allowed_social_role_ids.split(/;\s*/u);
  if (!allowedRoles.includes(profile.social_role_id)) fail(`occupation is incompatible with social role: ${profileId}`);
}
const zhdanko = profilesById.get('trace_ld_v1_zhdanko_storehouse_controller_v1');
const zhdankoRestrictions = [
  'not_merchant_or_goods_owner',
  'no_automatic_literacy',
  'no_judicial_or_political_authority',
  'role_does_not_imply_criminal_motive',
  'not_player_profile_substitute',
  'item_rights_deferred_to_0c'
];
if (roles.get('nov_role_merchant_clerk')?.status !== 'usable_with_caution'
  || !exactSet(zhdanko?.constraints, zhdankoRestrictions)) {
  fail('merchant-clerk caution is not fully constrained');
}

const candidateSets = participants.candidate_sets;
if (!Array.isArray(candidateSets) || candidateSets.length !== 6) fail('candidate-set collection is invalid');
const coveredSlots = [];
for (const candidateSet of candidateSets) {
  const setSlots = candidateSet.slot ? [candidateSet.slot] : candidateSet.slots;
  if (!Array.isArray(setSlots) || setSlots.length === 0
    || !Array.isArray(candidateSet.candidates) || candidateSet.candidates.length === 0) {
    fail(`empty or unbound candidate set: ${candidateSet.candidate_set_id}`);
  }
  coveredSlots.push(...setSlots);
  for (const candidate of candidateSet.candidates) {
    if (candidateSet.slot === 'player_clerk') {
      if (candidate.profile_id !== playerProfile.profile_id
        || candidate.revision !== playerProfile.revision
        || candidate.digest !== playerProfileDigest) {
        fail('player candidate ref is invalid');
      }
    } else {
      const profile = profilesById.get(candidate.profile_id);
      if (!profile || candidate.revision !== profile.revision) fail(`unknown participant profile ref: ${candidate.profile_id}`);
    }
  }
}
if (!exactSet(coveredSlots, slots)) fail('every required participant slot must have exactly one candidate set');
const backgroundSet = candidateSets.find((candidateSet) => candidateSet.candidate_set_id === 'trace_ld_v1_background_fisher_profile_set');
if (!backgroundSet
  || !exactArray(backgroundSet.slots, ['background_fisher_1', 'background_fisher_2'])
  || backgroundSet.required_distinct_instances !== 2
  || backgroundSet.candidates.length !== 1
  || backgroundSet.candidates[0].profile_id !== 'trace_ld_v1_background_fisher_v1') {
  fail('background fishers must materialize as two distinct instances');
}

const baseKnowledge = [
  'own_identity',
  'own_social_role',
  'own_occupation',
  'own_formal_relations',
  'own_workplace_familiarity',
  'ordinary_local_route_familiarity',
  'directly_visible_current_scene',
  'directly_received_public_message'
];
const conditionalKnowledge = [
  'incident_fact',
  'culprit_identity',
  'executor_identity',
  'hidden_motive',
  'hidden_event_sequence',
  'clue_identity',
  'clue_interpretation',
  'private_item_state',
  'lie_content',
  'memory_content',
  'hypothesis_content',
  'rumor_content',
  'confession_content',
  'future_schedule',
  'future_decision',
  'received_instruction_content',
  'observed_item_possession'
];
const knowledgeCategories = [...baseKnowledge, ...conditionalKnowledge];
const expectedKnowledgeScopes = Object.freeze({
  trace_ld_v1_knowledge_scope_hired_boatman_v1: {
    allowed: [
      ...baseKnowledge,
      'incident_fact',
      'culprit_identity',
      'executor_identity',
      'clue_identity',
      'clue_interpretation',
      'lie_content',
      'memory_content',
      'hypothesis_content',
      'rumor_content',
      'confession_content'
    ],
    required: ['incident_fact', 'executor_identity', 'clue_identity', 'memory_content'],
    sources: [
      'approved_profile_binding',
      'direct_perception',
      'received_message',
      'prior_admitted_perception_or_message',
      'derived_from_admitted_knowledge'
    ],
    requiredOrigins: {
      incident_fact: ['direct_perception'],
      executor_identity: ['direct_perception'],
      clue_identity: ['direct_perception'],
      memory_content: ['prior_admitted_perception_or_message']
    }
  },
  trace_ld_v1_knowledge_scope_local_fisher_v1: {
    allowed: [
      ...baseKnowledge,
      'incident_fact',
      'culprit_identity',
      'executor_identity',
      'hidden_event_sequence',
      'clue_identity',
      'clue_interpretation',
      'lie_content',
      'memory_content',
      'hypothesis_content',
      'rumor_content',
      'confession_content',
      'observed_item_possession'
    ],
    required: [
      'incident_fact',
      'executor_identity',
      'clue_identity',
      'observed_item_possession',
      'lie_content',
      'memory_content'
    ],
    sources: [
      'approved_profile_binding',
      'direct_perception',
      'received_message',
      'own_statement',
      'prior_admitted_perception_or_message',
      'derived_from_admitted_knowledge'
    ],
    requiredOrigins: {
      incident_fact: ['direct_perception'],
      executor_identity: ['direct_perception'],
      clue_identity: ['direct_perception'],
      observed_item_possession: ['direct_perception'],
      lie_content: ['own_statement'],
      memory_content: ['prior_admitted_perception_or_message']
    }
  },
  trace_ld_v1_knowledge_scope_storehouse_helper_v1: {
    allowed: [...knowledgeCategories.filter(
      (category) => !['hidden_motive', 'future_schedule', 'observed_item_possession'].includes(category)
    )],
    required: [
      'incident_fact',
      'culprit_identity',
      'executor_identity',
      'hidden_event_sequence',
      'received_instruction_content',
      'memory_content',
      'confession_content'
    ],
    sources: [
      'approved_profile_binding',
      'direct_perception',
      'received_message',
      'received_instruction',
      'own_action',
      'own_statement',
      'prior_admitted_perception_or_message',
      'derived_from_admitted_knowledge',
      'approved_own_decision_binding'
    ],
    requiredOrigins: {
      incident_fact: ['own_action'],
      culprit_identity: ['received_instruction'],
      executor_identity: ['own_action'],
      hidden_event_sequence: ['own_action', 'received_instruction'],
      received_instruction_content: ['received_instruction'],
      memory_content: ['prior_admitted_perception_or_message'],
      confession_content: ['own_statement']
    }
  },
  trace_ld_v1_knowledge_scope_storehouse_controller_v1: {
    allowed: [...knowledgeCategories.filter(
      (category) => !['received_instruction_content', 'observed_item_possession'].includes(category)
    )],
    required: [
      'incident_fact',
      'culprit_identity',
      'executor_identity',
      'hidden_motive',
      'hidden_event_sequence',
      'private_item_state',
      'memory_content',
      'future_schedule',
      'future_decision'
    ],
    sources: [
      'approved_profile_binding',
      'direct_perception',
      'received_message',
      'own_action',
      'own_instruction',
      'own_intention',
      'own_statement',
      'prior_admitted_perception_or_message',
      'derived_from_admitted_knowledge',
      'approved_own_schedule_binding',
      'approved_own_decision_binding'
    ],
    requiredOrigins: {
      incident_fact: ['own_action'],
      culprit_identity: ['own_action'],
      executor_identity: ['own_instruction'],
      hidden_motive: ['own_intention'],
      hidden_event_sequence: ['own_instruction'],
      private_item_state: ['own_action'],
      memory_content: ['prior_admitted_perception_or_message'],
      future_schedule: ['approved_own_schedule_binding'],
      future_decision: ['approved_own_decision_binding']
    }
  },
  trace_ld_v1_knowledge_scope_background_fisher_v1: {
    allowed: [
      ...baseKnowledge,
      'incident_fact',
      'culprit_identity',
      'executor_identity',
      'clue_identity',
      'clue_interpretation',
      'lie_content',
      'memory_content',
      'hypothesis_content',
      'rumor_content',
      'confession_content'
    ],
    required: ['incident_fact', 'memory_content'],
    sources: [
      'approved_profile_binding',
      'direct_perception',
      'received_message',
      'prior_admitted_perception_or_message',
      'derived_from_admitted_knowledge'
    ],
    requiredOrigins: {
      incident_fact: ['direct_perception'],
      memory_content: ['prior_admitted_perception_or_message']
    }
  }
});
const admittedSourceTypes = new Set([
  'approved_profile_binding',
  'direct_perception',
  'received_message',
  'received_instruction',
  'own_action',
  'own_instruction',
  'own_intention',
  'own_statement',
  'prior_admitted_perception_or_message',
  'derived_from_admitted_knowledge',
  'approved_own_schedule_binding',
  'approved_own_decision_binding'
]);
const allowedTargetBindings = Object.freeze({
  own_identity: ['approved_profile_record'],
  own_social_role: ['approved_profile_record'],
  own_occupation: ['approved_profile_record'],
  own_formal_relations: ['approved_profile_record'],
  own_workplace_familiarity: ['approved_profile_or_location_record'],
  ordinary_local_route_familiarity: ['approved_profile_or_location_record'],
  directly_visible_current_scene: ['perception_result'],
  directly_received_public_message: ['message_record'],
  incident_fact: ['factual_event_record'],
  culprit_identity: ['approved_hidden_truth_fact', 'perception_or_message_record'],
  executor_identity: ['approved_hidden_truth_fact', 'perception_or_message_record', 'instruction_record'],
  hidden_motive: ['approved_hidden_truth_fact'],
  hidden_event_sequence: ['approved_hidden_truth_fact', 'perception_or_message_record', 'admitted_event_knowledge_record'],
  clue_identity: ['factual_clue_record'],
  clue_interpretation: ['admitted_knowledge_record'],
  private_item_state: ['approved_hidden_truth_fact'],
  lie_content: ['statement_record'],
  memory_content: ['admitted_perception_or_message_record'],
  hypothesis_content: ['admitted_knowledge_record'],
  rumor_content: ['message_record'],
  confession_content: ['statement_record'],
  future_schedule: ['approved_schedule_profile'],
  future_decision: ['approved_decision_profile'],
  received_instruction_content: ['message_record'],
  observed_item_possession: ['perception_result']
});
const objectiveHiddenFactSources = new Set(['own_action', 'own_intention']);
const knowledgeScopeIds = new Set(participants.knowledge_scope_profiles?.map((scope) => scope.profile_id));
if (!Array.isArray(participants.knowledge_scope_profiles)
  || participants.knowledge_scope_profiles.length !== 5
  || knowledgeScopeIds.size !== participants.knowledge_scope_profiles.length
  || !exactSet([...knowledgeScopeIds], Object.keys(expectedKnowledgeScopes))) {
  fail('knowledge-scope profile set is incomplete or duplicated');
}
for (const scope of participants.knowledge_scope_profiles) {
  const expected = expectedKnowledgeScopes[scope.profile_id];
  const expectedForbidden = knowledgeCategories.filter((category) => !expected.allowed.includes(category));
  if (!exactKeys(scope, [
    'profile_id',
    'allowed_categories',
    'forbidden_categories',
    'required_future_categories',
    'admitted_source_types',
    'admission_rules'
  ])
    || !exactArray(scope.allowed_categories, expected.allowed)
    || !exactArray(scope.forbidden_categories, expectedForbidden)
    || !exactArray(scope.required_future_categories, expected.required)
    || !exactArray(scope.admitted_source_types, expected.sources)
    || !exactSet([...scope.allowed_categories, ...scope.forbidden_categories], knowledgeCategories)
    || scope.required_future_categories.some((category) => !scope.allowed_categories.includes(category))
    || !Array.isArray(scope.admission_rules)
    || scope.admission_rules.length === 0) {
    fail(`knowledge scope is not the approved profile-specific contract: ${scope.profile_id}`);
  }
  const rulesByCategory = new Map();
  for (const rule of scope.admission_rules) {
    if (!exactKeys(rule, ['categories', 'allowed_source_types', 'required_target_binding'])
      || !Array.isArray(rule.categories)
      || rule.categories.length === 0
      || new Set(rule.categories).size !== rule.categories.length
      || !Array.isArray(rule.allowed_source_types)
      || rule.allowed_source_types.length === 0
      || new Set(rule.allowed_source_types).size !== rule.allowed_source_types.length
      || rule.allowed_source_types.some((source) => !admittedSourceTypes.has(source)
        || !scope.admitted_source_types.includes(source))) {
      fail(`knowledge admission rule is invalid: ${scope.profile_id}`);
    }
    for (const category of rule.categories) {
      if (!scope.allowed_categories.includes(category)
        || rulesByCategory.has(category)
        || !allowedTargetBindings[category]?.includes(rule.required_target_binding)
        || (rule.required_target_binding === 'approved_hidden_truth_fact'
          && rule.allowed_source_types.some((source) => !objectiveHiddenFactSources.has(source)))) {
        fail(`knowledge admission category or target binding is invalid: ${scope.profile_id}/${category}`);
      }
      rulesByCategory.set(category, rule);
    }
  }
  if (!exactSet([...rulesByCategory.keys()], scope.allowed_categories)) {
    fail(`knowledge admission rules do not cover the exact allowed categories: ${scope.profile_id}`);
  }
  for (const [category, requiredOrigins] of Object.entries(expected.requiredOrigins)) {
    const rule = rulesByCategory.get(category);
    if (!rule || requiredOrigins.some((origin) => !rule.allowed_source_types.includes(origin))) {
      fail(`future knowledge category lacks approved causal origin: ${scope.profile_id}/${category}`);
    }
  }
}
for (const profile of participants.profiles) {
  if (!knowledgeScopeIds.has(profile.knowledge_scope_ref)) fail(`unknown knowledge scope ref: ${profile.profile_id}`);
}
for (const collection of ['knowledge_seed_records', 'perception_records', 'memory_records', 'lie_records', 'hypothesis_records', 'rumor_records']) {
  if (!Array.isArray(participants[collection]) || participants[collection].length !== 0) fail(`0B must not contain ${collection}`);
}
if (!Array.isArray(participants.initial_placements) || participants.initial_placements.length !== 0) fail('0B must not contain concrete initial placement');
if (participants.hidden_truth !== null) fail('0B must not contain hidden truth');

const relationTypes = new Map((participants.relation_types ?? []).map((type) => [type.relation_type_id, type]));
if (!Array.isArray(participants.relation_types)
  || participants.relation_types.length !== 9
  || relationTypes.size !== participants.relation_types.length) {
  fail('relation-type contract is incomplete or duplicated');
}
for (const type of relationTypes.values()) {
  if (type.directionality === 'directed') {
    const inverse = relationTypes.get(type.inverse_relation_type_id);
    if (!inverse || inverse.directionality !== 'directed' || inverse.inverse_relation_type_id !== type.relation_type_id) {
      fail(`directed relation has no valid inverse type: ${type.relation_type_id}`);
    }
  } else if (type.directionality !== 'symmetric' || type.inverse_relation_type_id !== undefined) {
    fail(`invalid relation directionality: ${type.relation_type_id}`);
  }
}
const relationKey = (relation) => `${relation.source}|${relation.relation_type_id}|${relation.target}`;
const expectedRelationKeys = [
  'ratsha_storehouse_helper|kinship_nephew_of|zhdanko_storehouse_controller',
  'zhdanko_storehouse_controller|kinship_uncle_of|ratsha_storehouse_helper',
  'ratsha_storehouse_helper|work_assistant_to|zhdanko_storehouse_controller',
  'zhdanko_storehouse_controller|work_supervisor_of|ratsha_storehouse_helper',
  'onisim_boatman|contracted_transport_provider_for|player_clerk',
  'player_clerk|transport_service_client_of|onisim_boatman',
  'eremey_fisher|work_access_dependent_on|zhdanko_storehouse_controller',
  'background_fisher_1|work_access_dependent_on|zhdanko_storehouse_controller',
  'background_fisher_2|work_access_dependent_on|zhdanko_storehouse_controller',
  'zhdanko_storehouse_controller|controls_work_access_of|eremey_fisher',
  'zhdanko_storehouse_controller|controls_work_access_of|background_fisher_1',
  'zhdanko_storehouse_controller|controls_work_access_of|background_fisher_2',
  'eremey_fisher|work_artel_peer_of|background_fisher_1',
  'eremey_fisher|work_artel_peer_of|background_fisher_2',
  'background_fisher_1|work_artel_peer_of|background_fisher_2'
];
const relationKeys = participants.relations?.map(relationKey) ?? [];
if (!Array.isArray(participants.relations)
  || participants.relations.length !== expectedRelationKeys.length
  || !exactSet(relationKeys, expectedRelationKeys)) {
  fail('approved relation graph is incomplete or expanded');
}
for (const relation of participants.relations) {
  const type = relationTypes.get(relation.relation_type_id);
  if (!slots.includes(relation.source) || !slots.includes(relation.target) || relation.source === relation.target || !type) {
    fail(`relation has unknown or invalid endpoint: ${relationKey(relation)}`);
  }
  if (type.directionality === 'directed') {
    if (relation.inverse_relation_type_id !== type.inverse_relation_type_id
      || !relationKeys.includes(`${relation.target}|${type.inverse_relation_type_id}|${relation.source}`)) {
      fail(`directed relation record has no inverse: ${relationKey(relation)}`);
    }
  } else {
    if (relation.symmetric !== true
      || relationKeys.includes(`${relation.target}|${relation.relation_type_id}|${relation.source}`)) {
      fail(`symmetric relation has conflicting directions: ${relationKey(relation)}`);
    }
  }
}

const locationIds = [
  'trace_ld_v1_loc_wreck_shore',
  'trace_ld_v1_loc_fishing_camp',
  'trace_ld_v1_loc_old_drying_shed',
  'trace_ld_v1_loc_zhdanko_storehouse'
];
const expectedSpatialSource = Object.freeze({
  manifest_path: 'data/world-catalogs/novgorod/spatial-v3/manifest.json',
  manifest_schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v1',
  bundle_id: 'novgorod-spatial-v3-p12-approved-target-001',
  world_revision_id: 'novgorod_spatial_v3_target_contract_approval_001',
  world_revision_catalog_digest: '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e',
  required_status: 'approved',
  manifest_digest: '4056b93acc2a3c7ed4c76c18182d74b7ef5b9f5fc9c31f206670f11a6283192e'
});
const spatialSourceKeys = Object.keys(expectedSpatialSource);
if (!exactKeys(definition.spatial_source_ref, spatialSourceKeys)
  || !exactKeys(locations.spatial_source_ref, spatialSourceKeys)
  || spatialSourceKeys.some((key) => definition.spatial_source_ref[key] !== locations.spatial_source_ref[key])
  || (!validationOnly && spatialSourceKeys.some((key) => definition.spatial_source_ref[key] !== expectedSpatialSource[key]))) {
  fail('spatial source ref is incomplete, inconsistent, or not trusted');
}

const spatialManifestPath = resolve(spatialDirectory, 'manifest.json');
if (fileDigest(spatialManifestPath) !== definition.spatial_source_ref.manifest_digest) {
  fail('spatial manifest digest mismatch');
}
const spatialManifest = JSON.parse(readFileSync(spatialManifestPath, 'utf8'));
if (spatialManifest.schema_version !== definition.spatial_source_ref.manifest_schema_version
  || spatialManifest.bundle_id !== definition.spatial_source_ref.bundle_id
  || spatialManifest.world_revision_id !== definition.spatial_source_ref.world_revision_id
  || spatialManifest.status !== definition.spatial_source_ref.required_status
  || !Array.isArray(spatialManifest.datasets)
  || spatialManifest.data_gaps?.length !== 0) {
  fail('spatial manifest identity, status, or readiness is invalid');
}

const requiredSpatialDatasets = Object.freeze({
  spatial_v3_world_revisions: 'datasets/spatial_v3_world_revisions.json',
  spatial_v3_nodes: 'datasets/spatial_v3_nodes.json',
  spatial_v3_node_parents: 'datasets/spatial_v3_node_parents.json',
  spatial_v3_g1_grid_cells: 'datasets/spatial_v3_g1_grid_cells.json'
});
const spatialDatasetRows = new Map(spatialManifest.datasets.map((row) => [row.table, row]));
const spatialData = {};
for (const [table, expectedFile] of Object.entries(requiredSpatialDatasets)) {
  const row = spatialDatasetRows.get(table);
  if (!row || row.file !== expectedFile || row.status !== 'approved' || !digestValue(row.sha256)) {
    fail(`required spatial dataset is missing or unapproved: ${table}`);
  }
  const path = resolve(spatialDirectory, row.file);
  if (fileDigest(path) !== row.sha256) fail(`spatial dataset digest mismatch: ${table}`);
  spatialData[table] = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(spatialData[table])) fail(`spatial dataset must be an array: ${table}`);
}

const worldRevisionMatches = spatialData.spatial_v3_world_revisions.filter(
  (row) => row.id === definition.spatial_source_ref.world_revision_id
);
if (worldRevisionMatches.length !== 1
  || worldRevisionMatches[0].status !== definition.spatial_source_ref.required_status
  || worldRevisionMatches[0].catalog_digest !== definition.spatial_source_ref.world_revision_catalog_digest) {
  fail('pinned spatial world revision is missing, unapproved, or has a different catalog digest');
}
const spatialNodeKey = (id, version) => `${id}@${version}`;
const spatialNodes = new Map();
for (const node of spatialData.spatial_v3_nodes) {
  const key = spatialNodeKey(node.id, node.version);
  if (spatialNodes.has(key)) fail(`duplicate canonical spatial node: ${key}`);
  spatialNodes.set(key, node);
}
const spatialParents = new Map();
for (const parent of spatialData.spatial_v3_node_parents) {
  const key = spatialNodeKey(parent.child_id, parent.child_version);
  if (spatialParents.has(key)) fail(`duplicate canonical spatial parent: ${key}`);
  spatialParents.set(key, parent);
}
const targetG1Key = spatialNodeKey(locations.region_ref, 1);
const targetG1Node = spatialNodes.get(targetG1Key);
const targetG1GridRows = spatialData.spatial_v3_g1_grid_cells.filter(
  (row) => row.node_id === locations.region_ref && row.node_version === 1
);
if (!targetG1Node
  || targetG1Node.spatial_level !== 'G1'
  || targetG1Node.status !== 'approved'
  || targetG1Node.world_revision_id !== definition.spatial_source_ref.world_revision_id
  || targetG1GridRows.length !== 1
  || targetG1GridRows[0].world_revision_id !== definition.spatial_source_ref.world_revision_id) {
  fail('target G1 is missing or not approved in the pinned spatial revision');
}
const hasAncestor = (node, ancestorId) => {
  const visited = new Set();
  let current = node;
  while (current) {
    const key = spatialNodeKey(current.id, current.version);
    if (visited.has(key)) fail(`cycle in canonical spatial ancestry: ${key}`);
    visited.add(key);
    const parent = spatialParents.get(key);
    if (!parent) return false;
    if (parent.world_revision_id !== definition.spatial_source_ref.world_revision_id) return false;
    if (parent.parent_id === ancestorId) return true;
    current = spatialNodes.get(spatialNodeKey(parent.parent_id, parent.parent_version));
  }
  return false;
};
if (locations.schema !== 'rus.trace_location_topology_set.v1'
  || locations.topology_set_id !== 'trace_ld_v1_location_topology_set'
  || locations.revision !== 1
  || locations.publication_status !== 'unpublished'
  || locations.region_ref !== 'gn_nov_g1_xp017_yp026'
  || locations.fallback_policy !== 'forbidden'
  || !exactKeys(locations, [
    'schema',
    'topology_set_id',
    'revision',
    'publication_status',
    'region_ref',
    'fallback_policy',
    'spatial_source_ref',
    'location_profiles',
    'required_policy_gaps',
    'endpoints',
    'topology_templates',
    'edges',
    'causal_availability_records',
    'compatibility',
    'initial_placements',
    'hidden_truth',
    'excludes'
  ])) {
  fail('location topology-set identity is invalid');
}
const locationProfiles = new Map((locations.location_profiles ?? []).map((profile) => [profile.location_profile_id, profile]));
if (!Array.isArray(locations.location_profiles)
  || locations.location_profiles.length !== 4
  || locationProfiles.size !== locations.location_profiles.length
  || !exactSet([...locationProfiles.keys()], locationIds)) {
  fail('exactly four unique approved location profiles are required');
}
const expectedPolicyGaps = Object.freeze({
  trace_ld_v1_gap_authorized_local_path_source_v1: [
    'causal_source_rule',
    '@rus/movement-routes',
    'rus.trace_authorized_path_source_rule.v1',
    [
      'causal_availability:trace_ld_v1_avail_drying_shed_after_disclosure',
      'causal_availability:trace_ld_v1_avail_storehouse_after_disclosure'
    ]
  ],
  trace_ld_v1_gap_zhdanko_external_location_access_v1: [
    'location_compatibility_condition',
    '@rus/movement-routes',
    'rus.trace_location_compatibility_condition.v1',
    [
      'compatibility:zhdanko_storehouse_controller:trace_ld_v1_loc_wreck_shore',
      'compatibility:zhdanko_storehouse_controller:trace_ld_v1_loc_fishing_camp'
    ]
  ],
  trace_ld_v1_gap_access_wreck_shore_v1: [
    'scene_access_contract',
    '@rus/movement-routes',
    'rus.trace_scene_access_contract.v1',
    ['location:trace_ld_v1_loc_wreck_shore']
  ],
  trace_ld_v1_gap_access_fishing_camp_v1: [
    'scene_access_contract',
    '@rus/movement-routes',
    'rus.trace_scene_access_contract.v1',
    ['location:trace_ld_v1_loc_fishing_camp']
  ],
  trace_ld_v1_gap_access_old_drying_shed_v1: [
    'scene_access_contract',
    '@rus/movement-routes',
    'rus.trace_scene_access_contract.v1',
    ['location:trace_ld_v1_loc_old_drying_shed']
  ],
  trace_ld_v1_gap_access_zhdanko_storehouse_v1: [
    'scene_access_contract',
    '@rus/movement-routes',
    'rus.trace_scene_access_contract.v1',
    ['location:trace_ld_v1_loc_zhdanko_storehouse']
  ],
  trace_ld_v1_gap_capacity_wreck_shore_v1: [
    'scene_capacity_contract',
    '@rus/party-store',
    'rus.trace_scene_capacity_contract.v1',
    ['location:trace_ld_v1_loc_wreck_shore']
  ],
  trace_ld_v1_gap_capacity_fishing_camp_v1: [
    'scene_capacity_contract',
    '@rus/party-store',
    'rus.trace_scene_capacity_contract.v1',
    ['location:trace_ld_v1_loc_fishing_camp']
  ],
  trace_ld_v1_gap_capacity_old_drying_shed_v1: [
    'scene_capacity_contract',
    '@rus/party-store',
    'rus.trace_scene_capacity_contract.v1',
    ['location:trace_ld_v1_loc_old_drying_shed']
  ],
  trace_ld_v1_gap_capacity_zhdanko_storehouse_v1: [
    'scene_capacity_contract',
    '@rus/party-store',
    'rus.trace_scene_capacity_contract.v1',
    ['location:trace_ld_v1_loc_zhdanko_storehouse']
  ]
});
const policyGaps = new Map((locations.required_policy_gaps ?? []).map((gap) => [gap.gap_id, gap]));
if (!Array.isArray(locations.required_policy_gaps)
  || locations.required_policy_gaps.length !== Object.keys(expectedPolicyGaps).length
  || policyGaps.size !== locations.required_policy_gaps.length
  || !exactSet([...policyGaps.keys()], Object.keys(expectedPolicyGaps))) {
  fail('required access/capacity policy-gap set is incomplete or duplicated');
}
for (const [gapId, [category, owner, schema, appliesToRefs]] of Object.entries(expectedPolicyGaps)) {
  const gap = policyGaps.get(gapId);
  if (!exactKeys(gap, [
    'gap_id',
    'category',
    'expected_owner',
    'expected_schema',
    'expected_version',
    'required_status',
    'resolution_status',
    'planned_phase',
    'applies_to_refs'
  ])
    || gap.category !== category
    || gap.expected_owner !== owner
    || gap.expected_schema !== schema
    || gap.expected_version !== 1
    || gap.required_status !== 'unresolved_required'
    || gap.resolution_status !== 'unresolved'
    || gap.planned_phase !== '0D'
    || !exactArray(gap.applies_to_refs, appliesToRefs)) {
    fail(`access/capacity policy gap is invalid: ${gapId}`);
  }
}
const unresolvedPolicyRef = (value, gapId) => exactKeys(value, ['gap_id', 'required_resolution_status'])
  && value.gap_id === gapId
  && value.required_resolution_status === 'resolved_before_materialization'
  && policyGaps.has(gapId);
const expectedLocations = Object.freeze({
  trace_ld_v1_loc_wreck_shore: [
    'берег крушения',
    'trace_ld_v1_tpl_wreck_shore',
    'trace_ld_v1_spatial_wreck_shore_v1',
    'gn_nov_g3_xp017_yp026_r2_sheltered_landing_terrace',
    'spatial.g3.route_site',
    'g4v3__gn_nov_g3_xp017_yp026_r2_sheltered_landing_terrace',
    'trace_ld_v1_gap_access_wreck_shore_v1',
    'trace_ld_v1_gap_capacity_wreck_shore_v1'
  ],
  trace_ld_v1_loc_fishing_camp: [
    'рыбацкий стан',
    'trace_ld_v1_tpl_fishing_camp',
    'trace_ld_v1_spatial_fishing_camp_v1',
    'gn_nov_g3_xp017_yp026_r2_vikhtuy_river_approach',
    'spatial.g3.route_site',
    'g4v3__gn_nov_g3_xp017_yp026_r2_vikhtuy_river_approach',
    'trace_ld_v1_gap_access_fishing_camp_v1',
    'trace_ld_v1_gap_capacity_fishing_camp_v1'
  ],
  trace_ld_v1_loc_old_drying_shed: [
    'старая сушильня',
    'trace_ld_v1_tpl_old_drying_shed',
    'trace_ld_v1_spatial_old_drying_shed_v1',
    'gn_nov_g3_xp017_yp026_r2_vikhtuy_resource_edge',
    'spatial.g3.resource_site',
    'g4v3__gn_nov_g3_xp017_yp026_r2_vikhtuy_resource_edge',
    'trace_ld_v1_gap_access_old_drying_shed_v1',
    'trace_ld_v1_gap_capacity_old_drying_shed_v1'
  ],
  trace_ld_v1_loc_zhdanko_storehouse: [
    'клеть Жданко',
    'trace_ld_v1_tpl_zhdanko_storehouse',
    'trace_ld_v1_spatial_zhdanko_storehouse_v1',
    'gn_nov_g3_xp017_yp026_r2_vikhtuy_locality',
    'spatial.g3.recurrent_site',
    'g4v3__gn_nov_g3_xp017_yp026_r2_vikhtuy_locality',
    'trace_ld_v1_gap_access_zhdanko_storehouse_v1',
    'trace_ld_v1_gap_capacity_zhdanko_storehouse_v1'
  ]
});
for (const [
  id,
  [displayName, templateId, candidateSetId, g3Id, g3ClassId, g4Id, accessGapId, capacityGapId]
] of Object.entries(expectedLocations)) {
  const profile = locationProfiles.get(id);
  if (!profile || profile.region_ref !== 'gn_nov_g1_xp017_yp026'
    || profile.display_name !== displayName || profile.scene_template_ref !== templateId
    || !exactKeys(profile, [
      'location_profile_id',
      'display_name',
      'scene_template_ref',
      'region_ref',
      'spatial_candidate_set',
      'landscape_basis',
      'economic_basis',
      'access_contract_ref',
      'capacity_contract_ref'
    ])
    || typeof profile.landscape_basis !== 'string'
    || typeof profile.economic_basis !== 'string'
    || !unresolvedPolicyRef(profile.access_contract_ref, accessGapId)
    || policyGaps.get(accessGapId)?.category !== 'scene_access_contract'
    || !unresolvedPolicyRef(profile.capacity_contract_ref, capacityGapId)
    || policyGaps.get(capacityGapId)?.category !== 'scene_capacity_contract') {
    fail(`location profile is invalid: ${id}`);
  }
  const candidateSet = profile.spatial_candidate_set;
  if (!exactKeys(candidateSet, ['candidate_set_id', 'selection_policy', 'required_count', 'candidates'])
    || candidateSet.candidate_set_id !== candidateSetId
    || candidateSet.selection_policy !== 'singleton_approved'
    || candidateSet.required_count !== 1
    || !Array.isArray(candidateSet.candidates)
    || candidateSet.candidates.length !== 1) {
    fail(`spatial candidate set is invalid or ambiguous: ${id}`);
  }
  const candidate = candidateSet.candidates[0];
  if (!exactKeys(candidate, ['g3_node_ref', 'g4_node_ref'])
    || !exactKeys(candidate.g3_node_ref, ['id', 'version', 'canonical_digest'])
    || !exactKeys(candidate.g4_node_ref, ['id', 'version', 'canonical_digest'])
    || candidate.g3_node_ref.id !== g3Id
    || candidate.g4_node_ref.id !== g4Id
    || candidate.g3_node_ref.version !== 1
    || candidate.g4_node_ref.version !== 1) {
    fail(`spatial candidate refs are invalid: ${id}`);
  }
  const g3Node = spatialNodes.get(spatialNodeKey(candidate.g3_node_ref.id, candidate.g3_node_ref.version));
  const g4Node = spatialNodes.get(spatialNodeKey(candidate.g4_node_ref.id, candidate.g4_node_ref.version));
  if (!g3Node || !g4Node) fail(`unknown canonical spatial node ref: ${id}`);
  if (g3Node.world_revision_id !== definition.spatial_source_ref.world_revision_id
    || g4Node.world_revision_id !== definition.spatial_source_ref.world_revision_id
    || g3Node.status !== 'approved'
    || g4Node.status !== 'approved') {
    fail(`spatial node is from another revision or has an unapproved status: ${id}`);
  }
  if (g3Node.spatial_level !== 'G3'
    || g3Node.primary_class_id !== g3ClassId
    || g4Node.spatial_level !== 'G4'
    || g4Node.primary_class_id !== 'spatial.g4.sector') {
    fail(`spatial node level or class is incompatible: ${id}`);
  }
  if (g3Node.canonical_digest !== candidate.g3_node_ref.canonical_digest
    || g4Node.canonical_digest !== candidate.g4_node_ref.canonical_digest) {
    fail(`spatial node canonical digest mismatch: ${id}`);
  }
  const g3Parent = spatialParents.get(spatialNodeKey(g3Node.id, g3Node.version));
  const g3ParentNode = g3Parent && spatialNodes.get(spatialNodeKey(g3Parent.parent_id, g3Parent.parent_version));
  const g4Parent = spatialParents.get(spatialNodeKey(g4Node.id, g4Node.version));
  if (!g3Parent || !g3ParentNode
    || g3Parent.world_revision_id !== definition.spatial_source_ref.world_revision_id
    || g3ParentNode.spatial_level !== 'G2'
    || g3ParentNode.status !== 'approved'
    || g3ParentNode.world_revision_id !== definition.spatial_source_ref.world_revision_id
    || !g4Parent
    || g4Parent.parent_id !== g3Node.id
    || g4Parent.parent_version !== g3Node.version
    || g4Parent.world_revision_id !== definition.spatial_source_ref.world_revision_id) {
    fail(`G3/G4 parent binding is incompatible: ${id}`);
  }
  if (!hasAncestor(g3Node, locations.region_ref) || !hasAncestor(g4Node, locations.region_ref)) {
    fail(`spatial candidate is outside target G1 ancestry: ${id}`);
  }
}

const endpointExpectations = Object.freeze({
  trace_ld_v1_ep_wreck_path_to_camp: ['trace_ld_v1_loc_wreck_shore', 'trace_ld_v1_avail_start_path_visible'],
  trace_ld_v1_ep_camp_path_to_wreck: ['trace_ld_v1_loc_fishing_camp', 'trace_ld_v1_avail_reverse_after_traversal'],
  trace_ld_v1_ep_camp_ridge_to_drying_shed: ['trace_ld_v1_loc_fishing_camp', 'trace_ld_v1_avail_drying_shed_after_disclosure'],
  trace_ld_v1_ep_drying_shed_ridge_to_camp: ['trace_ld_v1_loc_old_drying_shed', 'trace_ld_v1_avail_reverse_after_traversal'],
  trace_ld_v1_ep_camp_work_path_to_storehouse: ['trace_ld_v1_loc_fishing_camp', 'trace_ld_v1_avail_storehouse_after_disclosure'],
  trace_ld_v1_ep_storehouse_work_path_to_camp: ['trace_ld_v1_loc_zhdanko_storehouse', 'trace_ld_v1_avail_reverse_after_traversal']
});
const endpoints = new Map((locations.endpoints ?? []).map((endpoint) => [endpoint.endpoint_id, endpoint]));
if (!Array.isArray(locations.endpoints)
  || locations.endpoints.length !== 6
  || endpoints.size !== locations.endpoints.length
  || !exactSet([...endpoints.keys()], Object.keys(endpointExpectations))) {
  fail('endpoint set is incomplete or duplicated');
}
for (const [endpointId, [locationId, availabilityId]] of Object.entries(endpointExpectations)) {
  const endpoint = endpoints.get(endpointId);
  if (endpoint?.location_profile_id !== locationId || endpoint?.causal_availability_id !== availabilityId) {
    fail(`endpoint binding is invalid: ${endpointId}`);
  }
}
const topologyTemplates = new Map((locations.topology_templates ?? []).map((template) => [template.template_id, template]));
if (!Array.isArray(locations.topology_templates)
  || locations.topology_templates.length !== 4
  || topologyTemplates.size !== locations.topology_templates.length) {
  fail('topology template set is invalid or duplicated');
}
for (const profile of locationProfiles.values()) {
  const template = topologyTemplates.get(profile.scene_template_ref);
  if (!template || !Array.isArray(template.endpoint_ids) || template.endpoint_ids.length === 0
    || template.endpoint_ids.some((endpointId) => endpoints.get(endpointId)?.location_profile_id !== profile.location_profile_id)) {
    fail(`topology template endpoint ownership is invalid: ${profile.scene_template_ref}`);
  }
}
const edgeKey = (edge) => [...edge].sort().join('|');
const expectedEdges = [
  ['trace_ld_v1_ep_wreck_path_to_camp', 'trace_ld_v1_ep_camp_path_to_wreck'],
  ['trace_ld_v1_ep_camp_ridge_to_drying_shed', 'trace_ld_v1_ep_drying_shed_ridge_to_camp'],
  ['trace_ld_v1_ep_camp_work_path_to_storehouse', 'trace_ld_v1_ep_storehouse_work_path_to_camp']
].map(edgeKey);
if (!Array.isArray(locations.edges)
  || locations.edges.some((edge) => !Array.isArray(edge) || edge.length !== 2 || edge[0] === edge[1])
  || !exactSet(locations.edges.map(edgeKey), expectedEdges)) {
  fail('topology contains a missing, unknown, or forbidden direct connection');
}

const availabilityExpectations = Object.freeze({
  trace_ld_v1_avail_start_path_visible: [['trace_ld_v1_ep_wreck_path_to_camp'], 'visible_at_scenario_start', undefined],
  trace_ld_v1_avail_reverse_after_traversal: [['trace_ld_v1_ep_camp_path_to_wreck', 'trace_ld_v1_ep_drying_shed_ridge_to_camp', 'trace_ld_v1_ep_storehouse_work_path_to_camp'], 'route_known_after_successful_traversal', undefined],
  trace_ld_v1_avail_drying_shed_after_disclosure: [
    ['trace_ld_v1_ep_camp_ridge_to_drying_shed'],
    'location_disclosed_by_authorized_source',
    'trace_ld_v1_gap_authorized_local_path_source_v1'
  ],
  trace_ld_v1_avail_storehouse_after_disclosure: [
    ['trace_ld_v1_ep_camp_work_path_to_storehouse'],
    'location_disclosed_by_authorized_source',
    'trace_ld_v1_gap_authorized_local_path_source_v1'
  ]
});
const availability = new Map((locations.causal_availability_records ?? []).map((record) => [record.causal_availability_id, record]));
if (!Array.isArray(locations.causal_availability_records)
  || locations.causal_availability_records.length !== 4
  || availability.size !== locations.causal_availability_records.length) {
  fail('causal availability set is incomplete or duplicated');
}
for (const [id, [endpointIds, gateType, sourceRuleGapId]] of Object.entries(availabilityExpectations)) {
  const record = availability.get(id);
  const expectedKeys = sourceRuleGapId
    ? ['causal_availability_id', 'applies_to_endpoint_ids', 'authorized_source_rule_ref', 'gate_type']
    : ['causal_availability_id', 'applies_to_endpoint_ids', 'gate_type'];
  if (!record
    || !exactKeys(record, expectedKeys)
    || !exactArray(record.applies_to_endpoint_ids, endpointIds)
    || record.gate_type !== gateType
    || (sourceRuleGapId
      ? !unresolvedPolicyRef(record.authorized_source_rule_ref, sourceRuleGapId)
      : record.authorized_source_rule_ref !== undefined)
    || endpointIds.some((endpointId) => !endpoints.has(endpointId))) {
    fail(`causal availability binding is invalid: ${id}`);
  }
}
for (const endpoint of endpoints.values()) {
  if (!availability.get(endpoint.causal_availability_id)?.applies_to_endpoint_ids.includes(endpoint.endpoint_id)) {
    fail(`endpoint has no reciprocal causal availability record: ${endpoint.endpoint_id}`);
  }
}

const expectedCompatibility = Object.freeze({
  player_clerk: ['allowed', 'allowed', 'allowed', 'allowed'],
  onisim_boatman: ['allowed', 'allowed', 'allowed', 'forbidden'],
  eremey_fisher: ['allowed', 'allowed', 'allowed', 'allowed'],
  ratsha_storehouse_helper: ['allowed', 'allowed', 'allowed', 'allowed'],
  zhdanko_storehouse_controller: ['conditional', 'conditional', 'forbidden', 'allowed'],
  background_fisher_1: ['allowed', 'allowed', 'allowed', 'allowed'],
  background_fisher_2: ['allowed', 'allowed', 'allowed', 'allowed']
});
if (!exactKeys(locations.compatibility, slots)) fail('compatibility matrix participant coverage is invalid');
for (const [slot, values] of Object.entries(expectedCompatibility)) {
  const matrixRow = locations.compatibility[slot];
  if (!exactKeys(matrixRow, locationIds)) {
    fail(`compatibility matrix is incomplete or invalid: ${slot}`);
  }
  for (const [index, locationId] of locationIds.entries()) {
    const expected = values[index];
    const actual = matrixRow[locationId];
    if (expected === 'conditional') {
      if (!exactKeys(actual, ['status', 'condition_policy_ref'])
        || actual.status !== 'conditional'
        || !unresolvedPolicyRef(
          actual.condition_policy_ref,
          'trace_ld_v1_gap_zhdanko_external_location_access_v1'
        )) {
        fail(`conditional compatibility has no exact policy ref: ${slot}/${locationId}`);
      }
    } else if (actual !== expected) {
      fail(`compatibility matrix is incomplete or invalid: ${slot}`);
    }
  }
}
if (!Array.isArray(locations.initial_placements) || locations.initial_placements.length !== 0) {
  const forbiddenPlacement = locations.initial_placements?.find((placement) => locations.compatibility?.[placement.slot]?.[placement.location_profile_id] === 'forbidden');
  if (forbiddenPlacement) fail(`forbidden placement is rejected: ${forbiddenPlacement.slot}`);
  fail('0B must not contain concrete initial placement');
}
if (locations.hidden_truth !== null) fail('0B must not contain hidden truth');
if (!exactSet(locations.excludes, ['movement_runtime', 'route_time_profiles', 'party_placement', 'clue_placement'])) {
  fail('location package scope boundary is invalid');
}

console.log(JSON.stringify({
  package_id: manifest.package_id,
  manifest_digest: createHash('sha256').update(readFileSync(resolve(directory, 'manifest.json'))).digest('hex')
}));
