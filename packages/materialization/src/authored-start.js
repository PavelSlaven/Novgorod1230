import { computeMaterializationEnvelopeDigest } from '@rus/contracts';
import { deepFreeze } from '@rus/kernel';
import { canonicalDigest, deriveSeed, deterministicInstanceId } from './core.js';

export function materializeAuthoredStartPartyInstance(input) {
  const profile = input?.scenario_bundle;
  assertInput(input, profile);
  const identity = requestIdentity(input);
  const seed = deriveSeed(identity);
  const runId = `authored_${seed.digest.slice(0, 24)}`;
  const id = (kind, key, ordinal = 0) => deterministicInstanceId(
    input.party_id, runId, kind, key, ordinal
  );
  const playerId = id('player_character', 'player');
  const startNodeId = id('g5_node', profile.geometry.start.slot_key);
  const startAnchorId = id('g5_anchor', profile.geometry.start.anchor_slot_key);
  const otherScenes = profile.geometry.other_places.map((place, ordinal) => {
    const nodeId = id('g5_node', place.slot_key, ordinal + 1);
    return {
      location_profile_ref: place.location_profile_id,
      node: node(place, nodeId, profile.geometry.g4_id),
      anchor: anchor(place, id('g5_anchor', place.anchor_slot_key, ordinal + 1), nodeId)
    };
  });
  const npcIds = new Map(profile.people.map((person, ordinal) => [
    person.person_key, id('npc', person.person_key, ordinal)
  ]));
  const npcs = profile.people.map((person) => {
    const sceneIndex = person.location === 'start'
      ? null : Number(person.location.split(':')[1]);
    return {
      instance_id: npcIds.get(person.person_key),
      participant_slot_ref: person.person_key,
      profile_id: `authored_person:${person.person_key}`,
      profile_revision: 1,
      profile_level: 'scene',
      anchor_id: sceneIndex == null
        ? startAnchorId : otherScenes[sceneIndex].anchor.instance_id,
      location_profile_ref: sceneIndex == null
        ? profile.geometry.start.location_profile_id
        : otherScenes[sceneIndex].location_profile_ref,
      zone_ref: 'main',
      role_ref: { id: person.role_id, source: 'approved_scenario_profile' },
      occupation_ref: { id: person.occupation_id, source: 'approved_scenario_profile' },
      identity_state: { canonical_name: person.name },
      machine_state: { status: 'active', materialization_depth: 'full' },
      semantic_state: { scenario_function: 'ordinary_authored_person', causal_basis: 'authored_start' },
      relationships: person.relationships.map((relation) => ({
        ...relation,
        target_actor_id: relation.to === 'player'
          ? playerId : npcIds.get(relation.to)
      })),
      schedule_records: [],
      knowledge_profile_snapshot: { known_facts: [] },
      profile_candidate_set_digest: canonicalDigest(profile.people.map(({ person_key }) => person_key)),
      profile_record_digest: canonicalDigest(person)
    };
  });
  const items = profile.resources.map((resource, ordinal) => {
    const playerHeld = resource.holder === 'player';
    const holderId = playerHeld ? playerId : npcIds.get(resource.holder);
    return {
      instance_id: id('item', resource.resource_key, ordinal),
      template_id: `authored_resource:${resource.resource_key}`,
      profile_id: 'authored_finite_resource_v1',
      category_id: resource.category_id,
      quantity: resource.quantity,
      condition_state: 'serviceable',
      legal_status: 'owned',
      claim_state: 'established',
      ...(playerHeld
        ? { holder_character_id: holderId, owner_character_id: holderId,
            controller_character_id: holderId }
        : { holder_npc_id: holderId, owner_npc_id: holderId,
            controller_npc_id: holderId }),
      physical_position: 'hands',
      state: { display_name: resource.display_name,
        causal_basis: 'authored_start_resource', finite: true }
    };
  });
  const choice = {
    choice_ordinal: 0,
    choice_key: 'player_profile',
    slot_key: 'player_profile',
    candidate_set_digest: canonicalDigest([profile.player.name]),
    candidate_ids: [profile.player.name],
    selected_id: profile.player.name,
    rng_draw: 0
  };
  const body = {
    profile_id: 'authored_healthy_adult_v1',
    schema: 'rus.body_state.profile.v1',
    version: 1,
    values: { health: profile.player.health, energy: profile.player.energy,
      satiety: profile.player.satiety },
    conditions: [],
    condition_bindings: []
  };
  body.record_digest = canonicalDigest(body);
  const immediate = {
    player: { instance_id: playerId, dossier: {
      identity: { name: profile.player.name, canonical_name: profile.player.name },
      social_status: { social_role_id: profile.player.role_id,
        occupation_id: profile.player.occupation_id,
        display_name: profile.player.role_label },
      skills: {},
      knowledge: { known_facts: structuredClone(profile.player.known_facts) }
    } },
    spatial: {
      node: node(profile.geometry.start, startNodeId, profile.geometry.g4_id),
      anchor: anchor(profile.geometry.start, startAnchorId, startNodeId),
      position: { g4_id: profile.geometry.g4_id, g5_node_id: startNodeId,
        g5_anchor_id: startAnchorId }
    },
    body,
    items,
    containers: [],
    timestamp: structuredClone(profile.timestamp),
    environment_snapshot: { environment_profile_id: profile.environment.profile_id,
      facts: structuredClone(profile.environment.facts) },
    prepared_scenes: otherScenes,
    npcs
  };
  const hiddenTruth = { kind: 'none', digest: canonicalDigest({ kind: 'none' }) };
  const trace = {
    run_id: runId,
    idempotency_key: input.idempotency_key,
    materializer_version: input.materializer_version,
    rng_version: input.rng_algorithm_id,
    seed_context: identity,
    seed_digest: seed.digest,
    input_digest: canonicalDigest(identity),
    world_revision_id: input.world_revision_id,
    catalog_digest: input.domain_catalog_pin.catalog_digest,
    scenario_manifest_digest: input.scenario_manifest_digest,
    policy_profile_pins: [],
    policy_profile_pin_digest: canonicalDigest([]),
    choices: [choice],
    rng_draw_count: 0
  };
  const result = {
    version: 1,
    schema: 'rus.authored_start_party_materialization_result.v1',
    status: 'materialized',
    party_id: input.party_id,
    run_id: runId,
    request_identity: identity,
    immediate,
    hidden_truth: hiddenTruth,
    sealed_selections: [],
    policy_profile_pins: [],
    validation_report: { pass: true, checks: { approved_profile: true,
      actor_refs: true, placements: true, resources: true, player_known: true } },
    trace
  };
  trace.result_digest = computeMaterializationEnvelopeDigest(result);
  return deepFreeze(result);
}

function requestIdentity(input) {
  return Object.fromEntries([
    'party_id', 'scenario_id', 'scenario_definition_revision',
    'scenario_manifest_digest', 'world_revision_id', 'world_catalog_digest',
    'materializer_version', 'rng_algorithm_id', 'seed_context',
    'idempotency_key', 'trigger', 'occurrence', 'existing_party_state',
    'world_compatibility'
  ].map((key) => [key, structuredClone(input[key])]));
}

function node(place, instanceId, g4Id) {
  return { instance_id: instanceId, parent_g4_id: g4Id,
    template_id: place.node_template_id, slot_key: place.slot_key,
    state: { location_profile_ref: place.location_profile_id,
      environment_profile_ref: null } };
}

function anchor(place, instanceId, nodeId) {
  return { instance_id: instanceId, node_id: nodeId,
    template_id: place.anchor_template_id, slot_key: place.anchor_slot_key,
    npc_capacity: place.capacities.npc, item_capacity: place.capacities.item,
    container_capacity: place.capacities.container,
    state: { access_class: 'ordinary_shared' } };
}

function assertInput(input, profile) {
  const people = profile?.people;
  const resources = profile?.resources;
  const places = profile?.geometry?.other_places;
  const locations = ['start', ...(places ?? []).map((_, index) => `other:${index}`)];
  if (profile?.status !== 'approved' || profile.scenario_id !== input?.scenario_id
    || !input?.domain_catalog_pin?.catalog_digest || !profile.player?.name
    || !Array.isArray(profile.player.known_facts)
    || Object.hasOwn(profile.player, 'unconfirmed_known_facts')
    || profile.player.known_facts.some((fact) => typeof fact !== 'string' || !fact.trim())
    || !Array.isArray(people) || people.length === 0
    || !Array.isArray(resources) || resources.length === 0
    || !Array.isArray(places) || !profile.geometry?.start?.location_profile_id
    || people.some((person) => !person.person_key || !person.name
      || !Array.isArray(person.relationships) || !locations.includes(person.location))
    || resources.some((resource) => !resource.resource_key
      || !Number.isInteger(resource.quantity) || resource.quantity <= 0
      || !['player', ...people.map(({ person_key }) => person_key)]
        .includes(resource.holder))) invalid();
  const knownPeople = new Set(['player', ...people.map(({ person_key }) => person_key)]);
  if (new Set(people.map(({ person_key }) => person_key)).size !== people.length
    || people.some((person) => person.relationships.some(({ to }) => !knownPeople.has(to)))) {
    invalid();
  }
}

function invalid() {
  throw Object.assign(new Error('Approved authored start profile is invalid.'), {
    code: 'AUTHORED_START_PROFILE_INVALID'
  });
}
