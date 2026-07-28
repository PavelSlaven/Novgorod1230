import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

const source = resolve('data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0b');
const spatialSource = resolve('data/world-catalogs/novgorod/spatial-v3');
const playerProfileSource = resolve('data/world-catalogs/novgorod/lower-dvina-trace-v1');
const playerProfileFiles = ['player-profile-set.json', 'player-profile.json', 'approved-policy.json'];
const socialCatalogFiles = [
  'data/novgorod-region/novgorod_social_roles_v1.tsv',
  'data/novgorod-region/novgorod_occupations_v1.tsv'
];
const checker = resolve('tools/world-catalog-workflow/src/lower-dvina-trace-phase-0b-check.mjs');
const dataFiles = ['definition.json', 'participant-profile-set.json', 'location-topology-set.json'];
const spatialFiles = [
  'manifest.json',
  'datasets/spatial_v3_world_revisions.json',
  'datasets/spatial_v3_nodes.json',
  'datasets/spatial_v3_node_parents.json',
  'datasets/spatial_v3_g1_grid_cells.json'
];
const spatialDatasetFiles = Object.freeze({
  spatial_v3_world_revisions: 'datasets/spatial_v3_world_revisions.json',
  spatial_v3_nodes: 'datasets/spatial_v3_nodes.json',
  spatial_v3_node_parents: 'datasets/spatial_v3_node_parents.json',
  spatial_v3_g1_grid_cells: 'datasets/spatial_v3_g1_grid_cells.json'
});
const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const readJson = (directory, name) => JSON.parse(readFileSync(resolve(directory, name), 'utf8'));
const writeJson = (directory, name, value) => writeFileSync(resolve(directory, name), `${JSON.stringify(value, null, 2)}\n`);

const refreshDigests = (directory) => {
  const definition = readJson(directory, 'definition.json');
  definition.participant_profile_set_ref.digest = digest(resolve(directory, 'participant-profile-set.json'));
  definition.location_topology_set_ref.digest = digest(resolve(directory, 'location-topology-set.json'));
  writeJson(directory, 'definition.json', definition);

  const manifest = readJson(directory, 'manifest.json');
  manifest.files = Object.fromEntries(dataFiles.map((name) => [name, digest(resolve(directory, name))]));
  writeJson(directory, 'manifest.json', manifest);
};

const copySpatialFixture = (directory) => {
  for (const name of spatialFiles) {
    const target = resolve(directory, name);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(resolve(spatialSource, name), target);
  }
};

const copySocialCatalogFixture = (directory) => {
  for (const name of socialCatalogFiles) {
    const target = resolve(directory, name);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(resolve(name), target);
  }
};

const copyPlayerProfileFixture = (directory) => {
  for (const name of playerProfileFiles) {
    cpSync(resolve(playerProfileSource, name), resolve(directory, name));
  }
};

const repinPlayerProfileChain = (directory, playerProfileDirectory) => {
  const playerProfile = readJson(playerProfileDirectory, 'player-profile.json');
  const playerProfileDigest = digest(resolve(playerProfileDirectory, 'player-profile.json'));

  const approvedPolicy = readJson(playerProfileDirectory, 'approved-policy.json');
  approvedPolicy.profile_ref = {
    id: playerProfile.profile_id,
    revision: playerProfile.revision,
    digest: playerProfileDigest
  };
  writeJson(playerProfileDirectory, 'approved-policy.json', approvedPolicy);

  const playerProfileSet = readJson(playerProfileDirectory, 'player-profile-set.json');
  playerProfileSet.profile_candidates[0] = {
    id: playerProfile.profile_id,
    revision: playerProfile.revision,
    digest: playerProfileDigest
  };
  playerProfileSet.approved_policy_ref.digest = digest(resolve(playerProfileDirectory, 'approved-policy.json'));
  writeJson(playerProfileDirectory, 'player-profile-set.json', playerProfileSet);

  const definition = readJson(directory, 'definition.json');
  definition.player_profile_set_ref.digest = digest(resolve(playerProfileDirectory, 'player-profile-set.json'));
  writeJson(directory, 'definition.json', definition);

  const participants = readJson(directory, 'participant-profile-set.json');
  const playerCandidateSet = participants.candidate_sets.find((candidateSet) => candidateSet.slot === 'player_clerk');
  playerCandidateSet.candidates[0] = {
    profile_id: playerProfile.profile_id,
    revision: playerProfile.revision,
    digest: playerProfileDigest
  };
  writeJson(directory, 'participant-profile-set.json', participants);
  refreshDigests(directory);
};

const refreshSpatialManifest = (directory) => {
  const manifest = readJson(directory, 'manifest.json');
  for (const row of manifest.datasets) {
    const file = spatialDatasetFiles[row.table];
    if (file) row.sha256 = digest(resolve(directory, file));
  }
  writeJson(directory, 'manifest.json', manifest);
};

const pinSpatialManifest = (directory, spatialDirectory) => {
  const manifestDigest = digest(resolve(spatialDirectory, 'manifest.json'));
  const definition = readJson(directory, 'definition.json');
  const locations = readJson(directory, 'location-topology-set.json');
  definition.spatial_source_ref.manifest_digest = manifestDigest;
  locations.spatial_source_ref.manifest_digest = manifestDigest;
  writeJson(directory, 'definition.json', definition);
  writeJson(directory, 'location-topology-set.json', locations);
  refreshDigests(directory);
};

const runChecker = (
  directory,
  validationOnly = false,
  spatialDirectory,
  socialCatalogRoot,
  playerProfileDirectory
) => spawnSync(
  process.execPath,
  [
    checker,
    '--directory',
    directory,
    ...(validationOnly ? ['--validation-only'] : []),
    ...(spatialDirectory ? ['--spatial-directory', spatialDirectory] : []),
    ...(socialCatalogRoot ? ['--social-catalog-root', socialCatalogRoot] : []),
    ...(playerProfileDirectory ? ['--player-profile-directory', playerProfileDirectory] : [])
  ],
  { encoding: 'utf8' }
);

const expectSemanticFailure = (mutate, expectedMessage) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'lower-dvina-trace-0b-'));
  cpSync(source, directory, { recursive: true });
  try {
    mutate(directory);
    refreshDigests(directory);
    const result = runChecker(directory, true);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, expectedMessage);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const expectPlayerProfileFailure = (mutate, expectedMessage) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'lower-dvina-trace-0b-'));
  const playerProfileDirectory = mkdtempSync(resolve(tmpdir(), 'lower-dvina-player-profile-'));
  cpSync(source, directory, { recursive: true });
  copyPlayerProfileFixture(playerProfileDirectory);
  try {
    mutate(playerProfileDirectory);
    repinPlayerProfileChain(directory, playerProfileDirectory);
    const result = runChecker(directory, true, undefined, undefined, playerProfileDirectory);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, expectedMessage);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(playerProfileDirectory, { recursive: true, force: true });
  }
};

const expectSocialCatalogFailure = (mutate, expectedMessage) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'lower-dvina-trace-0b-'));
  const socialCatalogRoot = mkdtempSync(resolve(tmpdir(), 'lower-dvina-social-catalogs-'));
  cpSync(source, directory, { recursive: true });
  copySocialCatalogFixture(socialCatalogRoot);
  try {
    mutate(socialCatalogRoot);
    const result = runChecker(directory, true, undefined, socialCatalogRoot);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, expectedMessage);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(socialCatalogRoot, { recursive: true, force: true });
  }
};

const expectSpatialFailure = (mutate, expectedMessage, { repin = true } = {}) => {
  const directory = mkdtempSync(resolve(tmpdir(), 'lower-dvina-trace-0b-'));
  const spatialDirectory = mkdtempSync(resolve(tmpdir(), 'lower-dvina-spatial-v3-'));
  cpSync(source, directory, { recursive: true });
  copySpatialFixture(spatialDirectory);
  try {
    mutate(spatialDirectory);
    if (repin) {
      refreshSpatialManifest(spatialDirectory);
      pinSpatialManifest(directory, spatialDirectory);
    }
    const result = runChecker(directory, true, spatialDirectory);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, expectedMessage);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    rmSync(spatialDirectory, { recursive: true, force: true });
  }
};

test('0B package is trusted, reproducible, and uses canonical fisher refs', () => {
  const first = runChecker(source);
  const second = runChecker(source);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  assert.equal(first.stdout, second.stdout);

  const serialized = readFileSync(resolve(source, 'participant-profile-set.json'), 'utf8');
  assert.match(serialized, /nov_role_fisher/u);
  assert.match(serialized, /nov_occ_fisher/u);
  assert.doesNotMatch(serialized, /nov_(?:role|occ)_fisherman/u);
});

test('trusted mode rejects a self-consistent rewrite of the immutable package', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'lower-dvina-trace-0b-trust-'));
  cpSync(source, directory, { recursive: true });
  try {
    const participants = readJson(directory, 'participant-profile-set.json');
    participants.profiles[0].causal_basis = 'forged';
    writeJson(directory, 'participant-profile-set.json', participants);
    refreshDigests(directory);
    const result = runChecker(directory);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /trusted digest mismatch/u);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('definition and candidate sets fail closed', () => {
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    participants.clue_records = [{ clue_id: 'forbidden_0c_record' }];
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /identity or required slots are invalid/u);
  expectSemanticFailure((directory) => {
    const definition = readJson(directory, 'definition.json');
    definition.required_unresolved_refs.pop();
    writeJson(directory, 'definition.json', definition);
  }, /gap descriptors are incomplete/u);
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    participants.participant_slots.pop();
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /required slots are invalid/u);
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    participants.candidate_sets[0].candidates = [];
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /empty or unbound candidate set/u);
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    participants.candidate_sets[1].candidates[0].profile_id = 'unknown_profile';
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /unknown participant profile ref/u);
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    participants.candidate_sets.at(-1).slots = ['background_fisher_1'];
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /required participant slot|distinct instances/u);
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    participants.profiles.push(structuredClone(participants.profiles[0]));
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /profile set is incomplete or duplicated/u);
});

test('catalog-backed role and occupation validation fails closed without aliases', () => {
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    participants.social_catalog_source_ref.role_catalog.path = 'data/novgorod-region/unknown_roles.tsv';
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /social catalog source ref is unknown, unpinned, or inconsistent/u);
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    participants.profiles[1].social_role_id = 'nov_role_fisherman';
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /participant profile is invalid|fisherman alias/u);
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    participants.profiles[1].occupation_id = 'nov_occ_unknown';
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /participant profile is invalid|unknown or unapproved occupation/u);
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    participants.profiles[0].social_role_id = 'nov_role_servant';
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /participant profile is invalid|incompatible/u);
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    participants.profiles.find((profile) => profile.profile_id.includes('zhdanko')).constraints.pop();
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /merchant-clerk caution/u);
});

test('pinned social catalogs reject role and occupation dataset changes before ID resolution', () => {
  expectSocialCatalogFailure((socialCatalogRoot) => {
    const path = resolve(socialCatalogRoot, socialCatalogFiles[0]);
    const content = readFileSync(path, 'utf8');
    writeFileSync(path, content.replace('nov_role_fisher\tрыбак', 'nov_role_fisher\tрыболов'));
  }, /social role catalog digest mismatch/u);
  expectSocialCatalogFailure((socialCatalogRoot) => {
    const path = resolve(socialCatalogRoot, socialCatalogFiles[1]);
    const content = readFileSync(path, 'utf8');
    writeFileSync(path, content.replace('nov_occ_fisher\tрыбак', 'nov_occ_fisher\tрыболов'));
  }, /occupation catalog digest mismatch/u);
});

test('canonical player profile chain fails closed on unknown or incompatible social refs', () => {
  expectPlayerProfileFailure((playerProfileDirectory) => {
    const playerProfile = readJson(playerProfileDirectory, 'player-profile.json');
    playerProfile.role = {
      id: 'nov_role_unknown',
      display_name: 'неизвестная роль',
      applicability: 'approved'
    };
    writeJson(playerProfileDirectory, 'player-profile.json', playerProfile);
  }, /unknown or unusable player social role/u);
  expectPlayerProfileFailure((playerProfileDirectory) => {
    const playerProfile = readJson(playerProfileDirectory, 'player-profile.json');
    playerProfile.role = {
      id: 'nov_role_fisher',
      display_name: 'рыбак',
      applicability: 'approved'
    };
    writeJson(playerProfileDirectory, 'player-profile.json', playerProfile);
  }, /player occupation is incompatible with player social role/u);
});

test('relation graph validates endpoints, inverses, and symmetric uniqueness', () => {
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    participants.relations.splice(1, 1);
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /relation graph is incomplete|no inverse/u);
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    participants.relations[0].source = 'unknown_slot';
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /relation graph is incomplete|unknown or invalid endpoint/u);
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    participants.relations.push({
      source: 'background_fisher_1',
      relation_type_id: 'work_artel_peer_of',
      target: 'eremey_fisher',
      symmetric: true
    });
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /relation graph is incomplete|conflicting directions/u);
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    participants.relation_types.find((type) => type.relation_type_id === 'kinship_nephew_of').inverse_relation_type_id = 'unknown_inverse';
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /no valid inverse type/u);
});

test('profile-specific knowledge scopes admit required future categories without seeding records', () => {
  const participants = readJson(source, 'participant-profile-set.json');
  const requiredByScope = Object.freeze({
    trace_ld_v1_knowledge_scope_hired_boatman_v1: [
      'incident_fact',
      'executor_identity',
      'clue_identity',
      'memory_content'
    ],
    trace_ld_v1_knowledge_scope_local_fisher_v1: [
      'incident_fact',
      'executor_identity',
      'clue_identity',
      'observed_item_possession',
      'lie_content',
      'memory_content'
    ],
    trace_ld_v1_knowledge_scope_storehouse_helper_v1: [
      'incident_fact',
      'culprit_identity',
      'executor_identity',
      'hidden_event_sequence',
      'received_instruction_content',
      'memory_content',
      'confession_content'
    ],
    trace_ld_v1_knowledge_scope_storehouse_controller_v1: [
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
    trace_ld_v1_knowledge_scope_background_fisher_v1: [
      'incident_fact',
      'memory_content'
    ]
  });

  for (const scope of participants.knowledge_scope_profiles) {
    assert.deepEqual(scope.required_future_categories, requiredByScope[scope.profile_id]);
    assert.ok(scope.required_future_categories.every((category) => scope.allowed_categories.includes(category)));
    assert.ok(scope.required_future_categories.every((category) => !scope.forbidden_categories.includes(category)));
  }
  const eremeyScope = participants.knowledge_scope_profiles.find(
    (scope) => scope.profile_id === 'trace_ld_v1_knowledge_scope_local_fisher_v1'
  );
  const ratshaScope = participants.knowledge_scope_profiles.find(
    (scope) => scope.profile_id === 'trace_ld_v1_knowledge_scope_storehouse_helper_v1'
  );
  assert.equal(eremeyScope.allowed_categories.includes('private_item_state'), false);
  assert.equal(eremeyScope.allowed_categories.includes('observed_item_possession'), true);
  assert.equal(ratshaScope.required_future_categories.includes('hidden_motive'), false);
  assert.equal(ratshaScope.required_future_categories.includes('received_instruction_content'), true);
  for (const collection of [
    'knowledge_seed_records',
    'perception_records',
    'memory_records',
    'lie_records',
    'hypothesis_records',
    'rumor_records'
  ]) {
    assert.deepEqual(participants[collection], []);
  }
  assert.equal(participants.hidden_truth, null);
  assert.equal(Object.hasOwn(participants, 'confession_records'), false);
});

test('knowledge boundary rejects concrete records and invalid profile admission contracts', () => {
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    participants.knowledge_seed_records.push({ fact_id: 'forbidden' });
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /must not contain knowledge_seed_records/u);
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    participants.memory_records.push({ memory_id: 'forbidden' });
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /must not contain memory_records/u);
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    participants.knowledge_scope_profiles[0].allowed_categories =
      participants.knowledge_scope_profiles[0].allowed_categories.filter((category) => category !== 'incident_fact');
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /approved profile-specific contract/u);
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    const scope = participants.knowledge_scope_profiles[1];
    scope.admitted_source_types = scope.admitted_source_types.filter((source) => source !== 'own_statement');
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /approved profile-specific contract/u);
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    const scope = participants.knowledge_scope_profiles[2];
    const confessionRule = scope.admission_rules.find((rule) => rule.categories.includes('confession_content'));
    confessionRule.allowed_source_types = confessionRule.allowed_source_types.filter((source) => source !== 'own_statement');
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /lacks approved causal origin/u);
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    const scope = participants.knowledge_scope_profiles[3];
    const scheduleRule = scope.admission_rules.find((rule) => rule.categories.includes('future_schedule'));
    scheduleRule.required_target_binding = 'unbounded_schedule_guess';
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /target binding is invalid/u);
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    const scope = participants.knowledge_scope_profiles[2];
    const instructionRule = scope.admission_rules.find(
      (rule) => rule.categories.includes('received_instruction_content')
    );
    instructionRule.required_target_binding = 'approved_hidden_truth_fact';
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /target binding is invalid/u);
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    const scope = participants.knowledge_scope_profiles[1];
    const possessionRule = scope.admission_rules.find((rule) => rule.categories.includes('observed_item_possession'));
    possessionRule.required_target_binding = 'approved_hidden_truth_fact';
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /target binding is invalid/u);
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    participants.profiles[0].knowledge_scope_ref = 'unknown_scope';
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /participant profile is invalid/u);
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    participants.confession_records = [{ confession_id: 'forbidden_0c_record' }];
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /identity or required slots are invalid/u);
});

test('location profiles, endpoints, topology, and availability fail closed', () => {
  expectSemanticFailure((directory) => {
    const locations = readJson(directory, 'location-topology-set.json');
    locations.location_profiles.push(structuredClone(locations.location_profiles[0]));
    writeJson(directory, 'location-topology-set.json', locations);
  }, /four unique approved location profiles/u);
  expectSemanticFailure((directory) => {
    const locations = readJson(directory, 'location-topology-set.json');
    locations.location_profiles.pop();
    writeJson(directory, 'location-topology-set.json', locations);
  }, /four (?:unique )?approved location profiles/u);
  expectSemanticFailure((directory) => {
    const locations = readJson(directory, 'location-topology-set.json');
    locations.location_profiles[0].region_ref = 'unknown_region';
    writeJson(directory, 'location-topology-set.json', locations);
  }, /location profile is invalid/u);
  expectSemanticFailure((directory) => {
    const locations = readJson(directory, 'location-topology-set.json');
    locations.endpoints[0].location_profile_id = 'unknown_location';
    writeJson(directory, 'location-topology-set.json', locations);
  }, /endpoint binding is invalid/u);
  expectSemanticFailure((directory) => {
    const locations = readJson(directory, 'location-topology-set.json');
    locations.edges[0][1] = locations.edges[0][0];
    writeJson(directory, 'location-topology-set.json', locations);
  }, /topology contains/u);
  expectSemanticFailure((directory) => {
    const locations = readJson(directory, 'location-topology-set.json');
    locations.edges[0] = [
      'trace_ld_v1_ep_wreck_path_to_camp',
      'trace_ld_v1_ep_drying_shed_ridge_to_camp'
    ];
    writeJson(directory, 'location-topology-set.json', locations);
  }, /forbidden direct connection/u);
  expectSemanticFailure((directory) => {
    const locations = readJson(directory, 'location-topology-set.json');
    locations.causal_availability_records[0].applies_to_endpoint_ids = ['unknown_endpoint'];
    writeJson(directory, 'location-topology-set.json', locations);
  }, /causal availability binding/u);
  expectSemanticFailure((directory) => {
    const locations = readJson(directory, 'location-topology-set.json');
    locations.topology_templates[0].endpoint_ids = ['trace_ld_v1_ep_camp_path_to_wreck'];
    writeJson(directory, 'location-topology-set.json', locations);
  }, /endpoint ownership is invalid/u);
  expectSemanticFailure((directory) => {
    const locations = readJson(directory, 'location-topology-set.json');
    locations.causal_availability_records[2].authorized_source_rule_ref.gap_id = 'unknown_source_rule';
    writeJson(directory, 'location-topology-set.json', locations);
  }, /causal availability binding/u);
  expectSemanticFailure((directory) => {
    const locations = readJson(directory, 'location-topology-set.json');
    locations.compatibility.zhdanko_storehouse_controller.trace_ld_v1_loc_wreck_shore = 'conditional';
    writeJson(directory, 'location-topology-set.json', locations);
  }, /conditional compatibility has no exact policy ref/u);
  expectSemanticFailure((directory) => {
    const locations = readJson(directory, 'location-topology-set.json');
    delete locations.location_profiles[0].access_contract_ref;
    writeJson(directory, 'location-topology-set.json', locations);
  }, /location profile is invalid/u);
  expectSemanticFailure((directory) => {
    const locations = readJson(directory, 'location-topology-set.json');
    delete locations.location_profiles[0].capacity_contract_ref;
    writeJson(directory, 'location-topology-set.json', locations);
  }, /location profile is invalid/u);
  expectSemanticFailure((directory) => {
    const locations = readJson(directory, 'location-topology-set.json');
    locations.required_policy_gaps = locations.required_policy_gaps.filter(
      (gap) => gap.gap_id !== 'trace_ld_v1_gap_capacity_wreck_shore_v1'
    );
    writeJson(directory, 'location-topology-set.json', locations);
  }, /policy-gap set is incomplete/u);
  expectSemanticFailure((directory) => {
    const locations = readJson(directory, 'location-topology-set.json');
    locations.required_policy_gaps[0].expected_schema = 'unknown_policy_schema';
    writeJson(directory, 'location-topology-set.json', locations);
  }, /policy gap is invalid/u);
});

test('pinned spatial source fails closed on unknown refs, ancestry, parents, and status', () => {
  const selectedG3 = 'gn_nov_g3_xp017_yp026_r2_sheltered_landing_terrace';
  const selectedG4 = 'g4v3__gn_nov_g3_xp017_yp026_r2_sheltered_landing_terrace';

  expectSpatialFailure((spatialDirectory) => {
    const nodes = readJson(spatialDirectory, spatialDatasetFiles.spatial_v3_nodes);
    writeJson(
      spatialDirectory,
      spatialDatasetFiles.spatial_v3_nodes,
      nodes.filter((node) => node.id !== selectedG3)
    );
  }, /unknown canonical spatial node ref/u);

  expectSpatialFailure((spatialDirectory) => {
    const nodes = readJson(spatialDirectory, spatialDatasetFiles.spatial_v3_nodes);
    const parents = readJson(spatialDirectory, spatialDatasetFiles.spatial_v3_node_parents);
    const targetG1 = nodes.find((node) => node.id === 'gn_nov_g1_xp017_yp026');
    const selectedParent = parents.find((parent) => parent.child_id === selectedG3);
    const selectedG2Parent = parents.find((parent) => parent.child_id === selectedParent.parent_id);
    nodes.push({ ...targetG1, id: 'gn_test_other_g1' });
    selectedG2Parent.parent_id = 'gn_test_other_g1';
    writeJson(spatialDirectory, spatialDatasetFiles.spatial_v3_node_parents, parents);
    writeJson(spatialDirectory, spatialDatasetFiles.spatial_v3_nodes, nodes);
  }, /outside target G1 ancestry/u);

  expectSpatialFailure((spatialDirectory) => {
    const parents = readJson(spatialDirectory, spatialDatasetFiles.spatial_v3_node_parents);
    const selectedParent = parents.find((parent) => parent.child_id === selectedG4);
    selectedParent.parent_id = 'gn_nov_g3_xp017_yp026_r2_vikhtuy_locality';
    writeJson(spatialDirectory, spatialDatasetFiles.spatial_v3_node_parents, parents);
  }, /G3\/G4 parent binding is incompatible/u);

  expectSpatialFailure((spatialDirectory) => {
    const nodes = readJson(spatialDirectory, spatialDatasetFiles.spatial_v3_nodes);
    nodes.find((node) => node.id === selectedG3).status = 'deprecated';
    writeJson(spatialDirectory, spatialDatasetFiles.spatial_v3_nodes, nodes);
  }, /unapproved status/u);
});

test('pinned spatial manifest and dataset digests fail closed', () => {
  expectSpatialFailure((spatialDirectory) => {
    const manifestPath = resolve(spatialDirectory, 'manifest.json');
    writeFileSync(manifestPath, `${readFileSync(manifestPath, 'utf8')}\n`);
  }, /spatial manifest digest mismatch/u, { repin: false });

  expectSpatialFailure((spatialDirectory) => {
    const nodesPath = resolve(spatialDirectory, spatialDatasetFiles.spatial_v3_nodes);
    writeFileSync(nodesPath, `${readFileSync(nodesPath, 'utf8')}\n`);
  }, /spatial dataset digest mismatch/u, { repin: false });
});

test('compatibility, placement, and hidden-data boundaries fail closed', () => {
  expectSemanticFailure((directory) => {
    const locations = readJson(directory, 'location-topology-set.json');
    delete locations.compatibility.player_clerk.trace_ld_v1_loc_wreck_shore;
    writeJson(directory, 'location-topology-set.json', locations);
  }, /compatibility matrix is incomplete/u);
  expectSemanticFailure((directory) => {
    const locations = readJson(directory, 'location-topology-set.json');
    locations.compatibility.onisim_boatman.trace_ld_v1_loc_zhdanko_storehouse = 'allowed';
    writeJson(directory, 'location-topology-set.json', locations);
  }, /compatibility matrix is incomplete or invalid/u);
  expectSemanticFailure((directory) => {
    const locations = readJson(directory, 'location-topology-set.json');
    locations.initial_placements.push({
      slot: 'onisim_boatman',
      location_profile_id: 'trace_ld_v1_loc_zhdanko_storehouse'
    });
    writeJson(directory, 'location-topology-set.json', locations);
  }, /forbidden placement is rejected/u);
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    participants.initial_placements.push({
      slot: 'eremey_fisher',
      location_profile_id: 'trace_ld_v1_loc_fishing_camp'
    });
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /must not contain concrete initial placement/u);
  expectSemanticFailure((directory) => {
    const participants = readJson(directory, 'participant-profile-set.json');
    participants.hidden_truth = { culprit: 'forbidden' };
    writeJson(directory, 'participant-profile-set.json', participants);
  }, /must not contain hidden truth/u);
});
