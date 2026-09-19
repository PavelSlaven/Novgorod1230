import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalDigest } from '@rus/materialization';
import { loadLowerDvinaTracePhase1BPublication } from
  './lower-dvina-trace-phase-1b-publication.js';

const ROOT = 'data/world-catalogs/novgorod/live-world-runtime-v1';

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
  const turnProfile = await readJson(rootDir, turnProfileRef?.path);
  if (turnProfileRef?.status !== 'approved'
    || turnProfile?.schema !== 'rus.live_world_runtime.turn_step_owner_profiles.v1'
    || turnProfile.profile_set_id !== turnProfileRef.profile_set_id
    || turnProfile.status !== 'approved') {
    fail('LIVE_WORLD_AUTHORED_START_CATALOG_INVALID');
  }
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
        structuredClone(fact))
    });
    profiles.set(profile.scenario_id, approvedProfile);
    publications.set(profile.scenario_id, authoredPublication({
      manifest, profile: approvedProfile, starts
    }));
  }
  const externalStarts = new Map(starts.external_starts.map((entry) => [
    entry.scenario_id, freezeDeep(structuredClone(entry))
  ]));
  const runtimeBindings = new Map(starts.bindings.map((binding) => [
    `${starts.catalog_id}@${binding.revision}`,
    freezeDeep({ catalog_id: starts.catalog_id, revision: binding.revision,
      status: binding.status })
  ]));
  const currentBinding = runtimeBindings.get(
    `${starts.catalog_id}@${starts.current_binding_revision}`
  );
  if (currentBinding?.status !== 'approved') fail(
    'LIVE_WORLD_AUTHORED_START_CATALOG_INVALID'
  );
  return Object.freeze({
    turn_profile: freezeDeep({ profile: structuredClone(turnProfile),
      pin: { artifact_id: turnProfile.profile_set_id,
        revision: turnProfile.revision,
        digest: canonicalDigest(turnProfile) } }),
    runtime_binding: freezeDeep({ catalog_id: starts.catalog_id,
      revision: starts.current_binding_revision }),
    listPublic: () => [
      ...externalStarts.values(), ...profiles.values()
    ].map((entry) => ({ scenario_id: entry.scenario_id,
      ...structuredClone(entry.public_metadata) })),
    hasScenario: (scenarioId) => externalStarts.has(scenarioId)
      || publications.has(scenarioId),
    loadPublication: async (scenarioId) => {
      const authored = publications.get(scenarioId);
      if (authored) return authored;
      if (!externalStarts.has(scenarioId)) return null;
      return externalPublicationLoader({ rootDir, phase1AManifestDigest,
        scenarioDefinitionRevision });
    },
    resolveProfile: (scenarioId) => profiles.get(scenarioId) ?? null,
    resolveRuntimeBinding: ({ catalog_id: catalogId, revision } = {}) =>
      runtimeBindings.get(`${catalogId}@${revision}`) ?? null
  });
}

function authoredPublication({ manifest, profile, starts }) {
  const runtimeBinding = {
    catalog_id: starts.catalog_id,
    revision: starts.current_binding_revision
  };
  const binding = {
    schema: 'rus.live_world_runtime.authored_start_binding.v1',
    binding_id: `${profile.scenario_id}@${starts.current_binding_revision}`,
    revision: starts.current_binding_revision,
    status: 'approved',
    scenario_id: profile.scenario_id,
    publication_availability: 'public',
    fallback_policy: 'forbidden',
    public_metadata: structuredClone(profile.public_metadata),
    materializer_binding_id: 'live_world_authored_start_v1',
    phase_1a_manifest_ref: {
      digest: canonicalDigest({ catalog_id: starts.catalog_id,
        revision: starts.current_binding_revision })
    },
    scenario_definition_ref: {
      revision: starts.current_binding_revision,
      digest: canonicalDigest({ catalog_id: starts.catalog_id,
        revision: starts.current_binding_revision,
        scenario_id: profile.scenario_id })
    },
    execution_identity: {
      ...structuredClone(starts.execution_contract),
      seed_context:
        `authored_start:${profile.scenario_id}:v${starts.current_binding_revision}`,
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
    || !Array.isArray(starts.player_known_facts)
    || !Array.isArray(starts.starts) || starts.starts.length === 0) {
    fail('LIVE_WORLD_AUTHORED_START_CATALOG_INVALID');
  }
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
    || Object.hasOwn(profile.player, 'unconfirmed_known_facts')
    || !Array.isArray(people) || people.length === 0
    || new Set(personKeys).size !== personKeys.length
    || people.some((person) => !text(person.person_key) || !text(person.name)
      || !Array.isArray(person.relationships)
      || person.relationships.some(({ to }) => !known.has(to)))
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
