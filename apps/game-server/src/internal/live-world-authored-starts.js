import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';
import { loadLowerDvinaTracePhase1BPublication } from
  './lower-dvina-trace-phase-1b-publication.js';

const ROOT = 'data/world-catalogs/novgorod/live-world-runtime-v1';

export async function loadLiveWorldAuthoredStartCatalog({
  rootDir = process.cwd(),
  phase1AManifestDigest = null,
  scenarioDefinitionRevision = null
} = {}) {
  const [manifest, starts, tracePublication] = await Promise.all([
    readJson(rootDir, `${ROOT}/manifest.json`),
    readJson(rootDir, `${ROOT}/authored-starts.json`),
    loadLowerDvinaTracePhase1BPublication({ rootDir,
      phase1AManifestDigest, scenarioDefinitionRevision })
  ]);
  assertCatalog(manifest, starts);
  const publications = new Map([[tracePublication.binding.scenario_id,
    tracePublication]]);
  const profiles = new Map();
  for (const profile of starts.starts) {
    assertProfile(profile);
    profiles.set(profile.scenario_id, freezeDeep(structuredClone(profile)));
    publications.set(profile.scenario_id, authoredPublication({
      profile, starts, tracePublication
    }));
  }
  return Object.freeze({
    runtime_binding: freezeDeep(structuredClone(starts.runtime_binding)),
    listPublic: () => [...publications.values()].map(({ public_projection }) => ({
      scenario_id: public_projection.scenario_id,
      ...structuredClone(public_projection.public_metadata)
    })),
    loadPublication: (scenarioId) => publications.get(scenarioId) ?? null,
    resolveProfile: (scenarioId) => profiles.get(scenarioId) ?? null
  });
}

function authoredPublication({ profile, starts, tracePublication }) {
  const binding = {
    schema: 'rus.live_world_runtime.authored_start_binding.v1',
    binding_id: `${profile.scenario_id}@${starts.revision}`,
    revision: starts.revision,
    status: 'approved',
    scenario_id: profile.scenario_id,
    publication_availability: 'public',
    fallback_policy: 'forbidden',
    public_metadata: structuredClone(profile.public_metadata),
    materializer_binding_id: 'live_world_authored_start_v1',
    phase_1a_manifest_ref: {
      digest: tracePublication.binding.phase_1a_manifest_ref.digest
    },
    scenario_definition_ref: {
      revision: starts.revision,
      digest: canonicalDigest({ catalog_id: starts.catalog_id,
        revision: starts.revision, scenario_id: profile.scenario_id })
    },
    execution_identity: {
      ...structuredClone(tracePublication.binding.execution_identity),
      seed_context: `authored_start:${profile.scenario_id}:v${starts.revision}`
    },
    world_compatibility: structuredClone(
      tracePublication.binding.world_compatibility
    ),
    runtime_binding: structuredClone(starts.runtime_binding)
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
    manifest_digest: tracePublication.manifest_digest,
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
    || starts?.schema !== 'rus.live_world_runtime.authored_starts.v1'
    || starts.status !== 'approved'
    || starts.catalog_id !== manifest.catalog_id
    || starts.revision !== manifest.revision
    || starts.runtime_binding?.catalog_id !== starts.catalog_id
    || starts.runtime_binding?.revision !== starts.revision
    || !Array.isArray(starts.starts) || starts.starts.length === 0) {
    fail('LIVE_WORLD_AUTHORED_START_CATALOG_INVALID');
  }
}

function assertProfile(profile) {
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
    || !Array.isArray(profile.player?.known_facts)
    || profile.player.known_facts.some((fact) => !text(fact))
    || Object.hasOwn(profile.player, 'unconfirmed_known_facts')
    || !Array.isArray(people) || people.length === 0
    || new Set(personKeys).size !== personKeys.length
    || people.some((person) => !text(person.person_key) || !text(person.name)
      || !Array.isArray(person.relationships)
      || person.relationships.some(({ to }) => !known.has(to)))
    || !Array.isArray(resources) || resources.length === 0
    || resources.some((resource) => !text(resource.resource_key)
      || !Number.isInteger(resource.quantity) || resource.quantity <= 0
      || !known.has(resource.holder))
    || !text(profile.geometry?.g4_id)
    || !validPlace(profile.geometry.start)
    || !Array.isArray(places) || places.some((place) => !validPlace(place))
    || !text(profile.environment?.profile_id)
    || !Array.isArray(profile.environment.facts)) {
    fail('LIVE_WORLD_AUTHORED_START_PROFILE_INVALID');
  }
}

function validPlace(place) {
  return text(place?.location_profile_id) && text(place.node_template_id)
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
