import { computeMaterializationEnvelopeDigest,
  computeStage24ArtifactDigest } from '@rus/contracts';
import { deepFreeze } from '@rus/kernel';
import { canonicalDigest, deriveSeed, deterministicInstanceId } from './core.js';

export function materializeAuthoredStartPartyInstance(input) {
  const profile = input?.scenario_bundle;
  assertInput(input, profile);
  const admission = resolveAuthoritativeAdmission(input, profile);
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
      node: node(place, nodeId),
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
      profile_id: person.occupation_id,
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
      template_id: resource.item_template_id,
      profile_id: resource.inventory_profile_id,
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
        causal_basis: 'authored_start_resource', finite: true,
        inventory_profile_snapshot: structuredClone(
          admission.resource_mechanics[ordinal]) }
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
      attributes: structuredClone(profile.player.attributes),
      skills: structuredClone(profile.player.skills),
      knowledge: { known_facts: structuredClone(admission.player_known_facts) }
    } },
    spatial: {
      node: node(profile.geometry.start, startNodeId),
      anchor: anchor(profile.geometry.start, startAnchorId, startNodeId),
      position: { g4_id: profile.geometry.start.g4_id, g5_node_id: startNodeId,
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
    catalog_bundle_digest: admission.domain_catalog_bundle_digest,
    actor_catalog_digest: admission.actor_catalog_digest,
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
    validation_report: admission.validation_report,
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

function node(place, instanceId) {
  return { instance_id: instanceId, parent_g4_id: place.g4_id,
    template_id: place.node_template_id, slot_key: place.slot_key,
    state: { location_profile_ref: place.location_profile_id,
      canonical_g5_ref: { id: place.canonical_g5_id,
        version: place.canonical_g5_version },
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
    || !Array.isArray(profile.player.known_fact_refs)
    || Object.hasOwn(profile.player, 'unconfirmed_known_facts')
    || profile.player.known_fact_refs.some((fact) => typeof fact !== 'string' || !fact.trim())
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

function resolveAuthoritativeAdmission(input, profile) {
  const world = input.world_base_reference_snapshot;
  const domain = input.domain_catalog;
  if (world?.schema !== 'world_base_reference_snapshot'
    || domain?.schema !== 'rus.verified_item_catalog.v2'
    || domain.verified !== true
    || domain.pin?.catalog_digest !== input.domain_catalog_pin.catalog_digest) {
    invalid();
  }
  const places = [profile.geometry.start, ...profile.geometry.other_places];
  const spatialRefs = places.map((place) => resolvePlace(world, place));
  const environmentProfiles = new Set(spatialRefs.flatMap(({ closure }) =>
    closure.movement_edges.map(({ transition_environment_profile_id: id }) => id)
      .filter(Boolean)));
  if (!environmentProfiles.has(profile.environment.profile_id)) invalid();
  const resourceRefs = profile.resources.map((resource) =>
    resolveAuthoredStartResource(domain.records_by_table, resource));
  const actorRefs = resolveActors(profile);
  const approvedFacts = new Map((profile.approved_player_known_facts ?? [])
    .filter(({ status }) => status === 'approved')
    .map((fact) => [fact.fact_id, fact.text]));
  const playerKnownFacts = profile.player.known_fact_refs.map((ref) =>
    approvedFacts.get(ref));
  if (playerKnownFacts.some((fact) => typeof fact !== 'string' || !fact.trim())) {
    invalid();
  }
  const worldDigest = computeStage24ArtifactDigest(world);
  const domainBundleDigest = canonicalDigest(domain);
  const actorCatalogDigest = canonicalDigest(profile.actor_catalog);
  return {
    player_known_facts: playerKnownFacts,
    domain_catalog_bundle_digest: domainBundleDigest,
    actor_catalog_digest: actorCatalogDigest,
    resource_mechanics: resourceRefs.map(({ inventory_profile }) =>
      inventory_profile),
    validation_report: {
      version: 1,
      schema: 'rus.live_world_runtime.authored_start_admission.v1',
      pass: true,
      world_base_reference_digest: worldDigest,
      domain_catalog_digest: domain.pin.catalog_digest,
      domain_catalog_bundle_digest: domainBundleDigest,
      actor_catalog_digest: actorCatalogDigest,
      checks: {
        exact_world_closure: true,
        exact_domain_closure: true,
        actor_refs: true,
        placements: true,
        resources: true,
        player_known: true
      },
      resolved_spatial_refs: spatialRefs.map(({ binding, position }) => ({
        canonical_g5_id: binding.id,
        canonical_g5_version: binding.version,
        g4_id: binding.parent_id,
        node_template_id: binding.scene_template_id,
        node_template_version: binding.scene_template_version,
        location_profile_id: binding.materialization_profile_id,
        anchor_slot_key: position.position_slot_key
      })),
      resolved_resource_refs: resourceRefs,
      resolved_actor_refs: actorRefs
    }
  };
}

function resolveActors(profile) {
  const catalog = profile.actor_catalog;
  if (catalog?.schema !== 'rus.live_world_runtime.approved_actor_catalog.v1'
    || !Number.isInteger(catalog.version) || !catalog.region_id
    || !Array.isArray(catalog.roles) || !Array.isArray(catalog.occupations)) {
    invalid();
  }
  const roles = new Map(catalog.roles.map((record) => [record.role_id, record]));
  const occupations = new Map(catalog.occupations.map((record) => [
    record.occupation_id, record
  ]));
  const actors = [{ actor_ref: 'player', ...profile.player },
    ...profile.people.map((person) => ({ actor_ref: person.person_key,
      ...person }))];
  return actors.map((actor) => {
    const role = roles.get(actor.role_id);
    const occupation = occupations.get(actor.occupation_id);
    if (!role || !occupation
      || role.status !== 'approved' || occupation.status !== 'approved'
      || role.region_id !== catalog.region_id
      || occupation.region_id !== catalog.region_id
      || !allows(occupation.allowed_social_role_ids, actor.role_id)) invalid();
    return { actor_ref: actor.actor_ref, role_id: role.role_id,
      occupation_id: occupation.occupation_id };
  });
}

function allows(value, id) {
  const values = list(value);
  return values.length === 0 || values.includes(id);
}

function list(value) {
  return String(value ?? '').split(';').map((item) => item.trim())
    .filter(Boolean);
}

function resolvePlace(world, place) {
  const binding = world.canonical_g5_scene_bindings?.find((candidate) =>
    candidate.id === place.canonical_g5_id
      && Number(candidate.version) === place.canonical_g5_version);
  const closure = world.scene_template_closures?.find((candidate) =>
    candidate.header?.id === place.node_template_id
      && Number(candidate.header?.version) === place.node_template_version);
  const position = closure?.position_slots?.find((candidate) =>
    candidate.position_slot_key === place.anchor_slot_key);
  const failures = [
    [!binding, 'canonical_g5'],
    [binding?.status !== 'approved', 'canonical_g5_status'],
    [binding?.parent_id !== place.g4_id, 'g4'],
    [binding?.scene_template_id !== place.node_template_id, 'node_template'],
    [Number(binding?.scene_template_version) !== place.node_template_version,
      'node_template_version'],
    [binding?.materialization_profile_id !== place.location_profile_id,
      'location_profile'],
    [!closure, 'template_closure'],
    [!position, 'anchor_slot'],
    [position?.position_type_id !== place.anchor_template_id,
      'anchor_template'],
    [['npc', 'item', 'container'].some((key) =>
      place.capacities[key] > Number(position?.capacity)), 'capacity']
  ].filter(([failed]) => failed).map(([, name]) => name);
  if (failures.length > 0) invalid({ place: place.slot_key, failures });
  return { binding, closure, position };
}

export function resolveAuthoredStartResource(records, resource) {
  const template = byId(records?.item_templates, resource.item_template_id);
  const inventory = byId(records?.item_template_inventory_profiles,
    resource.inventory_profile_id);
  const quantity = byId(records?.item_template_quantity_profiles,
    resource.quantity_profile_id);
  const category = byId(records?.universal_categories, resource.category_id);
  const sizeBindings = records?.item_template_category_bindings?.filter(
    (candidate) => candidate.item_template_id === resource.item_template_id
      && candidate.binding_kind === 'size_band'
      && candidate.status === 'approved') ?? [];
  const sizeBinding = sizeBindings[0];
  const sizeCategory = byId(records?.universal_categories,
    sizeBinding?.category_id);
  if (!template || !inventory || !quantity || !category
    || template.status !== 'approved' || inventory.status !== 'approved'
    || quantity.status !== 'approved' || category.status !== 'approved'
    || template.category_id !== resource.category_id
    || inventory.item_template_id !== resource.item_template_id
    || quantity.item_template_id !== resource.item_template_id
    || resource.quantity < Number(quantity.minimum_quantity)
    || resource.quantity > Number(quantity.maximum_quantity)
    || sizeBindings.length !== 1
    || sizeCategory?.status !== 'approved'
    || sizeCategory.domain !== 'item' || sizeCategory.facet !== 'size_band'
    || !Number.isSafeInteger(Number(sizeBinding.packing_slot_cost))
    || Number(sizeBinding.packing_slot_cost) <= 0
    || !Number.isSafeInteger(Number(sizeBinding.packing_bundle_size))
    || Number(sizeBinding.packing_bundle_size) <= 0) invalid();
  return {
    item_template_id: template.id,
    inventory_profile_id: inventory.id,
    quantity_profile_id: quantity.id,
    category_id: category.id,
    inventory_profile: {
      mass_grams: Number(inventory.mass_grams),
      carry_form: inventory.carry_form,
      external_hand_cost: Number(inventory.external_hand_cost),
      packing_slot_cost: Number(sizeBinding.packing_slot_cost),
      packing_bundle_size: Number(sizeBinding.packing_bundle_size),
      size_band: sizeBinding.category_id
    }
  };
}

function byId(records, id) {
  return records?.find((record) => record.id === id);
}

function invalid(details = {}) {
  throw Object.assign(new Error('Approved authored start profile is invalid.'), {
    code: 'AUTHORED_START_PROFILE_INVALID', details
  });
}
