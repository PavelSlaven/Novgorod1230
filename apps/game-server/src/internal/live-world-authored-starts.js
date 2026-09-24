import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalDigest } from '@rus/materialization';
import { loadLowerDvinaTracePhase1BPublication } from
  './lower-dvina-trace-phase-1b-publication.js';

const ROOT = 'data/world-catalogs/novgorod/live-world-runtime-v1';

/** Load independently approved target authoring. Operational activation remains the release owner's gate. */
export async function loadTargetAuthoredStartProfile({ rootDir = process.cwd(),
  worldBaseReferenceSnapshot, domainCatalog, artifacts = null } = {}) {
  const target = 'data/world-catalogs/novgorod/live-world-runtime-v17';
  const approval = artifacts == null
    ? await readJson(rootDir, 'data/world-catalogs/novgorod/m2c-expansion-repin-data-approval.json')
    : JSON.parse(await readPinnedArtifact(rootDir, artifacts.approval));
  const definitions = [
    [artifacts?.start, 'target-start-candidate.json', 'target_start_proposal_approval'],
    [artifacts?.transfer, 'player-transfer-candidate.json', 'target_player_transfer_approval'],
    [artifacts?.basis, 'player-basis-candidate.json', 'target_player_basis_approval']
  ];
  const loaded = await Promise.all(definitions.map(async ([artifact, file, scope]) => {
    const bytes = artifact == null ? await readFile(resolve(rootDir, target, file))
      : await readPinnedArtifact(rootDir, artifact);
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (approval.decision !== 'APPROVE_DATA_ONLY'
      || approval[scope]?.candidate_sha256 !== digest) fail('SPATIAL_V3_TARGET_START_APPROVAL_REQUIRED');
    return { value: JSON.parse(bytes), digest };
  }));
  const [start, transfer, basis] = loaded.map(({ value }) => value);
  const pin = domainCatalog?.pin;
  if (domainCatalog?.schema !== 'rus.verified_item_catalog.v2' || domainCatalog.verified !== true
    || pin?.catalog_revision_id !== start.new_game_stage_bindings.item_catalog_revision_id
    || pin.compatible_world_revision_id !== start.world_pin.world_revision_id
    || pin.compatible_world_catalog_digest !== start.world_pin.world_catalog_digest
    || transfer.target_start.sha256 !== loaded[0].digest
    || basis.target_start.sha256 !== loaded[0].digest
    || basis.target_start.player_transfer_sha256 !== loaded[1].digest) {
    fail('SPATIAL_V3_TARGET_START_RUNTIME_PIN_REQUIRED');
  }
  const p = start.initial_placement;
  const closure = worldBaseReferenceSnapshot?.scene_template_closures?.find(({ header }) =>
    header.id === p.scene_template_ref.id && header.version === p.scene_template_ref.version);
  const position = closure?.position_slots?.find((row) => row.position_slot_key === p.position_slot_key);
  if (!position || closure.header.canonical_digest !== start.initial_perception_rule.scene_template_ref.canonical_digest) {
    fail('SPATIAL_V3_TARGET_START_SCENE_REQUIRED');
  }
  const actorCatalog = await loadActorCatalog(rootDir, { version: 1, region_id: 'region_novgorod_land',
    roles: { path: start.source_catalogs[0].path, digest: start.source_catalogs[0].sha256 },
    occupations: { path: start.source_catalogs[1].path, digest: start.source_catalogs[1].sha256 } });
  const role = actorCatalog.roles.find((row) => row.role_id === start.player_inputs.role_ref);
  if (!role) fail('LIVE_WORLD_ACTOR_CATALOG_INVALID');
  const resources = transfer.clothing_transfer.equipment_entries.map((entry, index) => {
    const template = domainCatalog.records_by_table.item_templates.find((row) => row.id === entry.item_template_ref);
    if (template?.status !== 'approved') fail('SPATIAL_V3_TARGET_START_RUNTIME_PIN_REQUIRED');
    return { resource_key: `player_clothing_${index}`, item_template_id: entry.item_template_ref,
      inventory_profile_id: entry.inventory_profile_ref, quantity_profile_id: entry.quantity_profile_ref,
      category_id: template.category_id, quantity: 1, holder: 'player' };
  });
  const policies = loaded.map(({ value, digest }) => ({ key: value.candidate_id, revision: value.version, digest }));
  policies.push({ key: start.initial_perception_rule.id, revision: start.initial_perception_rule.version,
    digest: loaded[0].digest });
  const definition = { schema: 'rus.live_world_runtime.canonical_start_profile.v1',
    scenario_id: start.scenario_id, status: 'approved', policy_profile_pins: policies };
  return freezeDeep({ schema: 'rus.live_world_runtime.canonical_start_profile.v1', status: 'approved',
    definition, manifest_digest: canonicalDigest(definition),
    scenario_id: start.scenario_id, public_metadata: structuredClone(start.public_metadata),
    player: { name: start.player_inputs.name.display_name, role_id: start.player_inputs.role_ref,
      occupation_id: start.player_inputs.occupation_ref, role_label: role.role_title, known_fact_refs: [] },
    actor_catalog: actorCatalog, approved_player_known_facts: [], people: [], resources,
    geometry: { start: { g4_id: p.g4_ref.id, canonical_g5_id: p.canonical_g5_ref.id,
      canonical_g5_version: p.canonical_g5_ref.version, node_template_id: p.scene_template_ref.id,
      node_template_version: p.scene_template_ref.version, location_profile_id: p.scene_materialization_profile_ref.id,
      slot_key: 'canonical_initial', anchor_slot_key: p.position_slot_key, anchor_template_id: position.position_type_id,
      capacities: { npc: Number(position.capacity), item: Number(position.capacity), container: Number(position.capacity) } },
    other_places: [] },
    canonical_start: { approved: true, start, player_transfer: transfer, player_basis: basis,
      policy_profile_pins: policies } });
}

async function readPinnedArtifact(rootDir, artifact) {
  if (typeof artifact?.path !== 'string' || !artifact.path.startsWith('data/')
    || artifact.path.includes('..') || !/^[a-f0-9]{64}$/u.test(artifact.sha256)) {
    fail('SPATIAL_V3_TARGET_START_APPROVAL_REQUIRED');
  }
  const bytes = await readFile(resolve(rootDir, artifact.path));
  if (createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) {
    fail('SPATIAL_V3_TARGET_START_APPROVAL_REQUIRED');
  }
  return bytes;
}

export async function loadLiveWorldAuthoredStartCatalog({
  rootDir = process.cwd(),
  phase1AManifestDigest = null,
  scenarioDefinitionRevision = null,
  externalPublicationLoader = loadLowerDvinaTracePhase1BPublication
} = {}) {
  const [manifest, starts] = await Promise.all([
    readJson(rootDir, `${ROOT}/manifest.json`),
    readJson(rootDir, `${ROOT}/authored-starts.json`)
  ]);
  assertCatalog(manifest, starts);
  const turnProfileRef = manifest.profile_sets?.find(({ profile_set_id: id }) =>
    id === 'novgorod_live_world_turn_step_owner_profiles_v1');
  const ordinaryProfileRef = manifest.profile_sets?.find(
    ({ profile_set_id: id }) =>
      id === 'novgorod_live_world_ordinary_profiles_v1');
  const [turnProfile, ordinaryProfiles] = await Promise.all([
    readJson(rootDir, turnProfileRef?.path),
    readJson(rootDir, ordinaryProfileRef?.path)
  ]);
  if (turnProfileRef?.status !== 'approved'
    || turnProfile?.schema !== 'rus.live_world_runtime.turn_step_owner_profiles.v1'
    || turnProfile.profile_set_id !== turnProfileRef.profile_set_id
    || turnProfile.status !== 'approved'
    || ordinaryProfileRef?.status !== 'approved'
    || !validOrdinaryProfiles(ordinaryProfiles,
      ordinaryProfileRef.profile_set_id)) {
    fail('LIVE_WORLD_AUTHORED_START_CATALOG_INVALID');
  }
  ordinaryProfiles.n1 = { ...ordinaryProfiles.n1,
    participant_binding_kind: 'persisted_profile_revision' };
  const actorCatalog = await loadActorCatalog(rootDir, starts.actor_catalog);
  const facts = new Map(starts.player_known_facts.map((fact) => [
    fact.fact_id, freezeDeep(structuredClone(fact))
  ]));
  const profiles = new Map();
  const publications = new Map();
  for (const profile of starts.starts) {
    assertProfile(profile, facts);
    const approvedProfile = freezeDeep({
      ...structuredClone(profile),
      actor_catalog: actorCatalogForProfile(actorCatalog, profile),
      approved_player_known_facts: [...facts.values()].map((fact) =>
        structuredClone(fact)),
      ordinary_profiles: structuredClone(ordinaryProfiles)
    });
    profiles.set(profile.scenario_id, approvedProfile);
  }
  const externalStarts = new Map(starts.external_starts.map((entry) => [
    entry.scenario_id, freezeDeep(structuredClone(entry))
  ]));
  const runtimeBindings = new Map(starts.bindings.map((binding) => [
    `${starts.catalog_id}@${binding.revision}`,
    freezeDeep({ catalog_id: starts.catalog_id,
      ...structuredClone(binding) })
  ]));
  const currentBinding = runtimeBindings.get(
    `${starts.catalog_id}@${starts.current_binding_revision}`
  );
  if (currentBinding?.status !== 'approved') fail(
    'LIVE_WORLD_AUTHORED_START_CATALOG_INVALID'
  );
  for (const profile of profiles.values()) publications.set(
    profile.scenario_id, authoredPublication({ manifest, profile, starts,
      binding: currentBinding }));
  return Object.freeze({
    actor_catalog: freezeDeep(structuredClone(actorCatalog)),
    turn_profile: freezeDeep({ profile: structuredClone(turnProfile),
      pin: { artifact_id: turnProfile.profile_set_id,
        revision: turnProfile.revision,
        digest: canonicalDigest(turnProfile) } }),
    ordinary_profiles: freezeDeep(structuredClone(ordinaryProfiles)),
    runtime_binding: freezeDeep({ catalog_id: starts.catalog_id,
      revision: starts.current_binding_revision }),
    listPublic: () => [
      ...externalStarts.values(), ...profiles.values()
    ].map((entry) => ({ scenario_id: entry.scenario_id,
      ...structuredClone(entry.public_metadata) })),
    hasScenario: (scenarioId) => externalStarts.has(scenarioId)
      || publications.has(scenarioId),
    loadPublication: async (scenarioId, { bindingRevision = null } = {}) => {
      const profile = profiles.get(scenarioId);
      if (profile) {
        const binding = runtimeBindings.get(
          `${starts.catalog_id}@${bindingRevision}`) ?? currentBinding;
        if (binding.scenario_id !== scenarioId) return null;
        return binding === currentBinding ? publications.get(scenarioId)
          : authoredPublication({ manifest, profile, starts, binding });
      }
      if (!externalStarts.has(scenarioId)) return null;
      return externalPublicationLoader({ rootDir, phase1AManifestDigest,
        scenarioDefinitionRevision });
    },
    resolveProfile: (scenarioId) => profiles.get(scenarioId) ?? null,
    resolveRuntimeBinding: ({ catalog_id: catalogId, revision } = {}) =>
      runtimeBindings.get(`${catalogId}@${revision}`) ?? null
  });
}

function validOrdinaryProfiles(value, id) {
  const s1 = value?.s1, n1 = value?.n1;
  return value?.schema === 'rus.live_world_runtime.ordinary_profiles.v1'
    && value.profile_set_id === id && value.revision === 1
    && value.status === 'approved'
    && s1?.schema === 'rus.live_world_runtime.s1_loaded_profile.v1'
    && s1.profile?.schema === 'rus.live_world_runtime.s1_profile.v1'
    && s1.profile.status === 'approved'
    && Array.isArray(s1.profile.envelopes) && s1.profile.envelopes.length === 1
    && s1.profile.envelopes.every((entry) => text(entry.opening_resolution?.name)
      && text(entry.opening_resolution?.description)
      && Array.isArray(entry.opening_resolution?.semantic_requirements))
    && n1?.schema === 'rus.live_world_runtime.n1_loaded_profile.v1'
    && n1.profile?.schema === 'rus.live_world_runtime.n1_profile.v1'
    && n1.profile.status === 'approved'
    && Array.isArray(n1.profile.eligible_participant_profiles)
    && n1.profile.eligible_participant_profiles.length > 0;
}

function authoredPublication({ manifest, profile, starts, binding: selected }) {
  const runtimeBinding = {
    catalog_id: starts.catalog_id,
    revision: selected.revision
  };
  const binding = {
    schema: 'rus.live_world_runtime.authored_start_binding.v1',
    binding_id: `${profile.scenario_id}@${selected.revision}`,
    revision: selected.revision,
    status: selected.status,
    scenario_id: profile.scenario_id,
    publication_availability: 'public',
    fallback_policy: 'forbidden',
    public_metadata: structuredClone(profile.public_metadata),
    materializer_binding_id: selected.materializer_binding_id,
    phase_1a_manifest_ref: {
      digest: canonicalDigest({ catalog_id: starts.catalog_id,
        revision: selected.revision })
    },
    scenario_definition_ref: {
      revision: selected.revision,
      digest: canonicalDigest({ catalog_id: starts.catalog_id,
        revision: selected.revision,
        scenario_id: profile.scenario_id })
    },
    execution_identity: {
      ...structuredClone(starts.execution_contract),
      materializer_version: selected.materializer_version,
      seed_context:
        `authored_start:${profile.scenario_id}:v${selected.revision}`,
      trigger: 'new_game',
      occurrence: 0
    },
    world_compatibility: structuredClone(starts.world_compatibility),
    runtime_binding: runtimeBinding
  };
  const openingProjection = {
    version: 1,
    schema: 'first_game_screen',
    visible_field_allowlist: ['party_id', 'player.name', 'player.social_status',
      'position', 'timestamp', 'body', 'environment'],
    place_label: profile.opening.place_label,
    calendar_label: profile.opening.calendar_label,
    opening_prose: profile.opening.opening_prose
  };
  return freezeDeep({
    manifest_digest: canonicalDigest(manifest),
    binding,
    binding_digest: canonicalDigest(binding),
    public_projection: { scenario_id: profile.scenario_id,
      public_metadata: structuredClone(profile.public_metadata),
      opening_projection: openingProjection },
    materialization_profile: structuredClone(profile)
  });
}

function assertCatalog(manifest, starts) {
  if (manifest?.schema !== 'rus.live_world_runtime.catalog_manifest.v1'
    || manifest.status !== 'integration_candidate'
    || manifest.activation !== 'not_active'
    || manifest.authored_starts?.status !== 'approved'
    || starts?.schema !== 'rus.live_world_runtime.authored_starts.v2'
    || starts.status !== 'approved'
    || starts.catalog_id !== manifest.catalog_id
    || starts.revision !== manifest.revision
    || !Number.isInteger(starts.current_binding_revision)
    || !Number.isInteger(starts.actor_catalog?.version)
    || !text(starts.actor_catalog?.region_id)
    || !text(starts.actor_catalog?.roles?.path)
    || !text(starts.actor_catalog?.roles?.digest)
    || !text(starts.actor_catalog?.occupations?.path)
    || !text(starts.actor_catalog?.occupations?.digest)
    || !text(starts.execution_contract?.materializer_version)
    || !text(starts.execution_contract?.rng_algorithm_id)
    || !text(starts.world_compatibility?.production_world_revision_id)
    || !text(starts.world_compatibility?.production_world_catalog_digest)
    || !Array.isArray(starts.external_starts)
    || !Array.isArray(starts.bindings) || starts.bindings.length === 0
    || new Set(starts.bindings.map(({ revision }) => revision)).size
      !== starts.bindings.length
    || starts.bindings.some((binding) => !Number.isInteger(binding.revision)
      || binding.status !== 'approved'
      || !text(binding.binding_id) || !text(binding.scenario_id)
      || binding.revision >= 3 && (!text(binding.materializer_binding_id)
        || !text(binding.materializer_version) || !text(binding.snapshot_schema))
      || binding.revision === 3 && !validTurnCompatibility(
        binding.turn_compatibility)
      || binding.turn_compatibility != null
        && !validTurnCompatibility(binding.turn_compatibility))
    || !starts.bindings.some((binding) =>
      binding.revision === starts.current_binding_revision
      && binding.status === 'approved')
    || !Array.isArray(starts.player_known_facts)
    || !Array.isArray(starts.starts) || starts.starts.length === 0) {
    fail('LIVE_WORLD_AUTHORED_START_CATALOG_INVALID');
  }
}

function validTurnCompatibility(value) {
  const profiles = value?.item_inventory_profiles;
  return value?.schema === 'rus.live_world_runtime.m2a_turn_compatibility.v1'
    && value.player_attributes?.strength?.value > 0
    && value.player_skills && typeof value.player_skills === 'object'
    && Array.isArray(profiles) && profiles.length > 0
    && new Set(profiles.map(({ template_id: id }) => id)).size
      === profiles.length
    && profiles.every((profile) => text(profile.template_id)
      && Number.isSafeInteger(profile.mass_grams) && profile.mass_grams > 0
      && text(profile.carry_form)
      && Number.isSafeInteger(profile.external_hand_cost)
      && Number.isSafeInteger(profile.packing_slot_cost)
      && profile.packing_slot_cost > 0
      && Number.isSafeInteger(profile.packing_bundle_size)
      && profile.packing_bundle_size > 0 && text(profile.size_band));
}

function actorCatalogForProfile(catalog, profile) {
  const actors = [profile.player, ...profile.people];
  const roleIds = new Set(actors.map(({ role_id: id }) => id));
  const occupationIds = new Set(actors.map(({ occupation_id: id }) => id));
  return freezeDeep({
    ...structuredClone(catalog),
    roles: catalog.roles.filter(({ role_id: id }) => roleIds.has(id))
      .map((record) => structuredClone(record)),
    occupations: catalog.occupations.filter(({ occupation_id: id }) =>
      occupationIds.has(id)).map((record) => structuredClone(record))
  });
}

async function loadActorCatalog(rootDir, specification) {
  const [roles, occupations] = await Promise.all([
    readPinnedTsv(rootDir, specification.roles, 'role_id'),
    readPinnedTsv(rootDir, specification.occupations, 'occupation_id')
  ]);
  const applicable = (record) => record.region_id === specification.region_id
    && record.status === 'approved';
  return freezeDeep({
    schema: 'rus.live_world_runtime.approved_actor_catalog.v1',
    version: specification.version,
    region_id: specification.region_id,
    sources: {
      roles: structuredClone(specification.roles),
      occupations: structuredClone(specification.occupations)
    },
    roles: roles.filter(applicable),
    occupations: occupations.filter(applicable)
  });
}

async function readPinnedTsv(rootDir, reference, idField) {
  try {
    const raw = await readFile(resolve(rootDir, reference.path));
    const digest = createHash('sha256').update(raw).digest('hex');
    if (digest !== reference.digest) throw new Error('digest mismatch');
    const [headerLine, ...lines] = raw.toString('utf8').replace(/^\uFEFF/u, '')
      .split(/\r?\n/u);
    const headers = headerLine.split('\t');
    const rows = lines.filter(Boolean).map((line) => Object.fromEntries(
      line.split('\t').map((value, index) => [headers[index], value])
    ));
    if (!headers.includes(idField)
      || new Set(rows.map((row) => row[idField])).size !== rows.length) {
      throw new Error('invalid actor catalog rows');
    }
    return rows;
  } catch (error) {
    throw Object.assign(new Error('Pinned actor catalog is unavailable or invalid.'), {
      code: 'LIVE_WORLD_ACTOR_CATALOG_INVALID', status: 409, cause: error
    });
  }
}

function assertProfile(profile, facts) {
  const people = profile?.people;
  const resources = profile?.resources;
  const places = profile?.geometry?.other_places;
  const personKeys = people?.map(({ person_key }) => person_key) ?? [];
  const known = new Set(['player', ...personKeys]);
  if (profile?.status !== 'approved' || !text(profile.scenario_id)
    || !text(profile.public_metadata?.title)
    || profile.public_metadata?.available !== true
    || !text(profile.opening?.opening_prose)
    || !text(profile.player?.name)
    || !Array.isArray(profile.player?.known_fact_refs)
    || profile.player.known_fact_refs.some((ref) => !facts.has(ref))
    || !text(profile.opening?.scene_context?.foreground)
    || !text(profile.opening?.scene_context?.uncertainty)
    || !Array.isArray(profile.opening?.scene_context?.far_orientation)
    || profile.opening.scene_context.far_orientation.length === 0
    || profile.opening.scene_context.far_orientation.some((entry) =>
      !text(entry.place_key) || !text(entry.text))
    || !text(profile.opening?.scene_context?.local_structure?.topology_slot_key)
    || !text(profile.opening?.scene_context?.local_structure?.name)
    || !text(profile.opening?.scene_context?.local_structure?.description)
    || Object.hasOwn(profile.player, 'unconfirmed_known_facts')
    || !Array.isArray(people) || people.length === 0
    || new Set(personKeys).size !== personKeys.length
    || people.some((person) => !text(person.person_key) || !text(person.name)
      || !Array.isArray(person.relationships)
      || person.relationships.some(({ to }) => !known.has(to))
      || person.profile_level === 'background'
        && (!Number.isInteger(person.profile_revision)
          || !text(person.routine_profile_id)
          || !text(person.routine_time_band)
          || !text(person.ordinary_activity)))
    || !Array.isArray(resources) || resources.length === 0
    || resources.some((resource) => !text(resource.resource_key)
      || !text(resource.item_template_id)
      || !text(resource.inventory_profile_id)
      || !text(resource.quantity_profile_id) || !text(resource.category_id)
      || !Number.isInteger(resource.quantity) || resource.quantity <= 0
      || !known.has(resource.holder))
    || !validPlace(profile.geometry?.start)
    || !Array.isArray(places) || places.some((place) => !validPlace(place))
    || !text(profile.environment?.profile_id)
    || !Array.isArray(profile.environment.facts)) {
    fail('LIVE_WORLD_AUTHORED_START_PROFILE_INVALID');
  }
}

function validPlace(place) {
  return text(place?.canonical_g5_id)
    && Number.isInteger(place.canonical_g5_version)
    && text(place.g4_id) && text(place.location_profile_id)
    && text(place.node_template_id)
    && Number.isInteger(place.node_template_version)
    && text(place.slot_key) && text(place.anchor_template_id)
    && text(place.anchor_slot_key)
    && ['npc', 'item', 'container'].every((key) =>
      Number.isInteger(place.capacities?.[key]) && place.capacities[key] >= 0);
}

async function readJson(rootDir, path) {
  try {
    return JSON.parse(await readFile(resolve(rootDir, path), 'utf8'));
  } catch (error) {
    throw Object.assign(new Error(`Live-world authored start data is unavailable: ${path}`), {
      code: 'LIVE_WORLD_AUTHORED_START_CATALOG_INVALID',
      cause: error
    });
  }
}

function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function fail(code) { throw Object.assign(new Error(code), { code, status: 409 }); }
function freezeDeep(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) freezeDeep(nested);
  return Object.freeze(value);
}
