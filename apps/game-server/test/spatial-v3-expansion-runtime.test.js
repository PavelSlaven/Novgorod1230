import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpatialV3ExpansionRuntime, eligibleExpansions } from '../src/runtime/spatial-v3-expansion-runtime.js';
import { createSpatialV3GenerationAdmission } from '../src/infrastructure/postgres/spatial-v3-generation-admission.js';
import { approvedNaturalPerceptionFixture } from './g4-natural-perception-fixture.js';

function context() {
  const profile = { id: 'profile', version: 7, world_revision_id: 'world', status: 'approved' };
  const expansion_rule_sets = [['adjacency_rule_set', 'adjacency', 'through_same_exit'],
    ['connectivity_rule_set', 'connectivity', 'existing_exit_reachable'], ['seed_policy', 'seed', 'mulberry32_v1']]
    .map(([role, rule_kind, strategy]) => {
      profile[`${role}_id`] = role; profile[`${role}_version`] = 2;
      return { id: role, version: 2, dependency_role: role, rule_kind, strategy, status: 'approved',
        world_revision_id: 'world', canonical_digest: 'digest', authoring_digest: 'digest', canonical_ordinal: 0 };
    });
  const slot = { id: 'slot', version: 3, profile_id: 'profile', profile_version: 7, world_revision_id: 'world',
    g4_id: 'g4', g4_version: 4, status: 'approved', continuation_role: 'through', directional_exit_id: 'exit',
    directional_exit_version: 2, max_instances: 3, terminal_policy_id: 'terminal', terminal_policy_version: 1,
    continuation_length_rule_id: 'length', continuation_length_rule_version: 1 };
  return { partyId: 'party', actorId: 'actor', g4: { id: 'g4', version: 4, world_revision_id: 'world' }, profile,
    position: { id: 'departure-position', template_slot_key: 'departure', template_instance_ordinal: 0 },
    site: { id: 'source-site', origin: 'canonical', canonical_g5_ref: { entity_id: 'canonical', authoring_version: '4' } },
    scene: { endpoint_slots: [{ slot_key: 'out', endpoint_role: 'departure', required_position_slot_key: 'departure', required_position_instance_ordinal: 0 }] },
    snapshot: { sites: [], reservations: [], frontiers: [], chains: [], bindings: [], site_connections: [], endpoint_bindings: [] },
    closure: { profile, expansion_rule_sets, slots: [slot],
      directional_exits: [{ id: 'exit', version: 2, direction_context_id: 'direction', g4_id: 'g4', g4_version: 4, status: 'approved' }],
      terminal_policies: [{ id: 'terminal', version: 1, status: 'approved', policy_kind: 'world_route_exit', target_directional_exit_id: 'exit', target_directional_exit_version: 2 }],
      continuation_length_rules: [{ id: 'length', version: 1, status: 'approved', selection_kind: 'fixed' }],
      continuation_length_candidates: [{ rule_id: 'length', rule_version: 1, terminal_ordinal: 0, weight: 1 }],
      entry_endpoint_bindings: [{ id: 'entry', version: 1, canonical_g5_id: 'canonical', canonical_g5_version: 4, departure_scene_endpoint_slot_key: 'out' }],
      entry_slot_rules: [{ entry_binding_id: 'entry', entry_binding_version: 1, slot_id: 'slot', slot_version: 3 }] } };
}
const identity = { partyId: 'party', actorId: 'actor', directionalExitId: 'exit', requestId: 'request' };
const disclosure = async () => [{ directional_exit_id: 'exit', directional_exit_version: 2,
  direction_context_id: 'direction', knowledge_state: 'visible', display_label: 'Продолжить путь' }];
test('arrival with no local path to departure offers no expansion and neither mutates nor asks disclosure owner', async () => {
  const current = context(); current.position = { id: 'arrival-position', template_slot_key: 'arrival', template_instance_ordinal: 0 };
  current.scene = { ...current.scene, positions: [current.position], movement_edges: [] };
  const runtime = createSpatialV3ExpansionRuntime({ readContext: async () => current });
  assert.deepEqual(await runtime.listExpansionOptions(identity), []);
  assert.deepEqual(await runtime.listApproachOptions(identity), []);
  await assert.rejects(runtime.prepareExpansion(identity), (e) => e.details.reason === 'selected_exit_unavailable');
});
test('an arrival position from which departure is reachable by a local edge offers the approach, not the crossing (A-B1-06)', async () => {
  const current = context();
  const departurePosition = current.position;
  current.position = { id: 'arrival-position', template_slot_key: 'arrival', template_instance_ordinal: 0 };
  current.scene = { ...current.scene, positions: [current.position, departurePosition],
    movement_edges: [{ id: 'local-edge-1', from_position_id: 'arrival-position',
      to_position_id: departurePosition.id, status: 'active' }] };
  const runtime = createSpatialV3ExpansionRuntime({ readContext: async () => current, readExitDisclosure: disclosure,
    materializerVersion: 'version', generatedExpansionAdapter: { prepareExpansion: async () => ({ ok: true }) } });
  // No executable crossing from here - it would fail prepareTraversal's committed-position check.
  assert.deepEqual(await runtime.listExpansionOptions(identity), []);
  // Instead, the first local hop toward departure, labelled with the exit's own stable text -
  // the same local-scene edge the local-scene movement owner would offer and execute.
  assert.deepEqual(await runtime.listApproachOptions({ ...identity, firstStepEdgeIds: ['local-edge-1'] }),
    [{ kind: 'approach', directional_exit_id: 'exit', edge_id: 'local-edge-1', display_label: 'Продолжить путь' }]);
});
test('the approach carries the approach phrase the disclosure owner supplied (F4)', async () => {
  const current = context();
  const departurePosition = current.position;
  current.position = { id: 'arrival-position', template_slot_key: 'arrival', template_instance_ordinal: 0 };
  current.scene = { ...current.scene, positions: [current.position, departurePosition],
    movement_edges: [{ id: 'local-edge-1', from_position_id: 'arrival-position',
      to_position_id: departurePosition.id, status: 'active' }] };
  const runtime = createSpatialV3ExpansionRuntime({ readContext: async () => current,
    readExitDisclosure: async () => (await disclosure()).map((row) => ({ ...row,
      approach_phrase: 'подход по суше' })), materializerVersion: 'version',
    generatedExpansionAdapter: { prepareExpansion: async () => ({ ok: true }) } });
  const [approach] = await runtime.listApproachOptions({ ...identity, firstStepEdgeIds: ['local-edge-1'] });
  assert.equal(approach.approach_phrase, 'подход по суше');
});
test('the first approach step is taken only from the edges the local-scene owner offered (F3)', async () => {
  const current = context();
  const departurePosition = current.position;
  current.position = { id: 'arrival-position', template_slot_key: 'arrival', template_instance_ordinal: 0 };
  const middle = { id: 'middle-position', template_slot_key: 'middle', template_instance_ordinal: 0 };
  // The one-hop edge exists in raw topology but is not offered (not visible / not eligible).
  current.scene = { ...current.scene, positions: [current.position, middle, departurePosition],
    movement_edges: [
      { id: 'a-direct', from_position_id: 'arrival-position', to_position_id: departurePosition.id, status: 'active' },
      { id: 'b-via', from_position_id: 'arrival-position', to_position_id: 'middle-position', status: 'active' },
      { id: 'c-onward', from_position_id: 'middle-position', to_position_id: departurePosition.id, status: 'active' }] };
  const runtime = createSpatialV3ExpansionRuntime({ readContext: async () => current, readExitDisclosure: disclosure,
    materializerVersion: 'version', generatedExpansionAdapter: { prepareExpansion: async () => ({ ok: true }) } });
  assert.deepEqual(await runtime.listApproachOptions({ ...identity, firstStepEdgeIds: [] }), []);
  assert.deepEqual(await runtime.listApproachOptions(identity), []);
  const viaOffered = await runtime.listApproachOptions({ ...identity, firstStepEdgeIds: ['b-via'] });
  assert.deepEqual(viaOffered.map((row) => row.edge_id), ['b-via']);
  const both = await runtime.listApproachOptions({ ...identity, firstStepEdgeIds: ['b-via', 'a-direct'] });
  assert.deepEqual(both.map((row) => row.edge_id), ['a-direct'], 'shortest path among offered first steps');
});
test('the disclosure owner receives the exit-to-slot mapping so pass-target text reaches both the crossing and the approach (live gap)', async () => {
  const seen = [];
  const spy = async (input) => { seen.push(input.slotByExit); return disclosure(); };
  const atDeparture = context();
  const crossing = createSpatialV3ExpansionRuntime({ readContext: async () => atDeparture, readExitDisclosure: spy,
    materializerVersion: 'version', generatedExpansionAdapter: { prepareExpansion: async () => ({ ok: true }) } });
  await crossing.listExpansionOptions(identity);
  const away = context(); const departurePosition = away.position;
  away.position = { id: 'arrival-position', template_slot_key: 'arrival', template_instance_ordinal: 0 };
  away.scene = { ...away.scene, positions: [away.position, departurePosition],
    movement_edges: [{ id: 'local-edge-1', from_position_id: 'arrival-position', to_position_id: departurePosition.id, status: 'active' }] };
  const approach = createSpatialV3ExpansionRuntime({ readContext: async () => away, readExitDisclosure: spy,
    materializerVersion: 'version', generatedExpansionAdapter: { prepareExpansion: async () => ({ ok: true }) } });
  await approach.listApproachOptions({ ...identity, firstStepEdgeIds: ['local-edge-1'] });
  assert.equal(seen.length, 2);
  for (const slotByExit of seen) assert.deepEqual([...slotByExit], [['exit', { id: 'slot', version: 3 }]]);
});
test('at departure, no approach is offered (already there)', async () => {
  const current = context();
  const runtime = createSpatialV3ExpansionRuntime({ readContext: async () => current, readExitDisclosure: disclosure,
    materializerVersion: 'version', generatedExpansionAdapter: { prepareExpansion: async () => ({ ok: true }) } });
  assert.deepEqual(await runtime.listApproachOptions({ partyId: 'party', actorId: 'actor' }), []);
});
test('exact approved entry and current disclosure select server-owned request only', async () => {
  const current = context(); const before = structuredClone(current); let request;
  const runtime = createSpatialV3ExpansionRuntime({ readContext: async () => current, readExitDisclosure: disclosure,
    materializerVersion: 'version', generatedExpansionAdapter: { prepareExpansion: async (input) => { request = input; return { ok: true }; } } });
  assert.deepEqual(await runtime.listExpansionOptions(identity), [{ kind: 'crossing', directional_exit_id: 'exit', display_label: 'Продолжить путь' }]);
  await runtime.prepareExpansion({ ...identity, slot_ref: { id: 'client', version: 999 }, candidate_ordinal: 999 });
  assert.equal(request.candidate_ordinal, 0); assert.deepEqual(request.slot_ref, { id: 'slot', version: 3 });
  assert.equal(request.source_position_id, 'departure-position'); assert.equal(request.actor_id, 'actor');
  assert.deepEqual(current, before);
});
test('a resolved pass-target description reaches listExpansionOptions verbatim (step 3)', async () => {
  // The disclosure owner (spatial-v3-current-visibility-provider.js) already resolved and, if
  // needed, disambiguated the pass-target text ("к руслу", or "к руслу (1)" on a collision)
  // before this runtime ever sees it; this runtime is a pure passthrough and must not touch it.
  const current = context();
  const runtime = createSpatialV3ExpansionRuntime({ readContext: async () => current,
    readExitDisclosure: async () => [{ directional_exit_id: 'exit', directional_exit_version: 2,
      direction_context_id: 'direction', knowledge_state: 'visible', display_label: 'к руслу' }],
    materializerVersion: 'version',
    generatedExpansionAdapter: { prepareExpansion: async () => ({ ok: true }) } });
  const options = await runtime.listExpansionOptions({ partyId: 'party', actorId: 'actor' });
  assert.deepEqual(options, [{ kind: 'crossing', directional_exit_id: 'exit', display_label: 'к руслу' }]);
});

test('wrong exact entry version, hidden exit and changed disclosure version are unavailable', async () => {
  const current = context(); current.site.canonical_g5_ref.authoring_version = '999';
  assert.deepEqual(eligibleExpansions(current, 1), []);
  for (const readExitDisclosure of [async () => [], async () => [{ ...(await disclosure())[0], directional_exit_version: 999 }]]) {
    const runtime = createSpatialV3ExpansionRuntime({ readContext: async () => context(), readExitDisclosure });
    assert.deepEqual(await runtime.listExpansionOptions(identity), []);
    await assert.rejects(runtime.prepareExpansion(identity), (e) => e.details.reason === 'selected_exit_unavailable');
  }
});
test('consumed frontier reload reuses committed connection without generation', async () => {
  const current = context(); let generated = false;
  current.snapshot.frontiers = [{ id: 'frontier', source_g5_site_id: 'source-site', slot_ref: { entity_id: 'slot', authoring_version: '3' },
    continuation_ordinal: 0, continuation_chain_id: 'chain', status: 'consumed', resolved_site_connection_id: 'connection' }];
  current.snapshot.chains = [{ id: 'chain', terminal_ordinal: 0 }];
  current.snapshot.bindings = [{ frontier_id: 'frontier', position_id: 'departure-position', status: 'inactive' }];
  current.snapshot.site_connections = [{ id: 'connection', from_site_id: 'source-site', status: 'active' }];
  current.snapshot.endpoint_bindings = [{ site_connection_id: 'connection', endpoint_role: 'from', status: 'active', position_id: 'departure-position' }];
  const runtime = createSpatialV3ExpansionRuntime({ readContext: async () => current, readExitDisclosure: disclosure,
    generatedExpansionAdapter: { prepareExpansion: async () => { generated = true; } } });
  const result = await runtime.prepareExpansion(identity);
  assert.equal(result.replay, true); assert.equal(result.connection_id, 'connection'); assert.equal(generated, false);
  await assert.rejects(runtime.prepareTraversal({ ...identity, expansion: result }),
    (e) => e.details.reason === 'site_connection_traversal_owner_required');
});
test('generation admission rejects absent Temporal owner and unknown candidate policy before materialization', async () => {
  await assert.rejects(createSpatialV3GenerationAdmission()({}),
    (e) => e.details.reason === 'current_temporal_owner_required');
  const admit = createSpatialV3GenerationAdmission({ readCurrentEnvironment: async () => { throw new Error('must not run'); } });
  await assert.rejects(admit({ request: { g4: { world_revision_id: 'world' } },
    selection: { status: 'generation', selected_template: { scene_materialization_profile_id: 'scene-profile', scene_materialization_profile_version: 1 } },
    closure: { scene_materialization_profiles: [{ id: 'scene-profile', version: 1 }] }, scene_candidates: [{}] }),
  (e) => e.details.reason === 'scene_policy_owner_required');
});

test('generation admission checks all natural layers and rechecks exact actor/Temporal source', async () => {
  const { input } = await approvedNaturalPerceptionFixture();
  const g4 = input.currentFacts.scene.g4_ref; const scene = input.currentFacts.scene.scene_template_ref;
  const location = { id: 'location', party_id: 'party', owner_kind: 'actor', owner_id: 'actor',
    location_kind: 'scene', scene_position_id: 'departure', state_version: 1 };
  let environment = input.currentFacts.current_environment;
  const admit = createSpatialV3GenerationAdmission({ verifiedCatalog: input.verifiedCatalog, pin: input.pin,
    readCurrentEnvironment: async () => environment });
  const request = { party_id: 'party', actor_id: 'actor', source_position_id: 'departure', g4 };
  const profile = { id: 'scene-profile', version: 1, status: 'approved', world_revision_id: g4.world_revision_id,
    source_kind: 'g5_generation_template', source_entity_id: 'template', source_entity_version: 2,
    selection_rule_id: 'scene_selection_single_candidate_v1', selection_rule_version: 1 };
  const candidate = { profile_id: profile.id, profile_version: 1, scene_template_id: scene.id,
    scene_template_version: scene.version, applicability_rule_id: 'scene_applicability_exact_source_ref_v1',
    applicability_rule_version: 1, weight: 1 };
  const args = { transaction: { query: async () => ({ rows: [{ turn_number: 4 }] }) },
    request, closure: { scene_materialization_profiles: [profile], scene_rules: [
      ['scene_selection_rule', profile.selection_rule_id], ['scene_applicability_rule', candidate.applicability_rule_id]
    ].map(([entity_kind, id]) => ({ entity_kind, id, version: 1, status: 'approved',
      world_revision_id: g4.world_revision_id, canonical_digest: 'a'.repeat(64) })) },
    snapshot: { journey_locations: [location] }, dependency_pins: { pins: [] },
    selection: { status: 'generation', selected_template: { template_id: 'template', template_version: 2,
      scene_materialization_profile_id: profile.id, scene_materialization_profile_version: 1 } }, scene_candidates: [candidate] };
  const result = await admit(args);
  assert.equal(result.ok, true); assert.deepEqual(result.scene_template_ref, scene);
  assert.equal(result.created_at_turn, 4);
  assert.ok(result.validation_report.natural_profile_ref.payload_digest);
  assert.equal(result.sensory_details, undefined);
  assert.equal((await result.recheck({ transaction: { query: async () => ({ rows: [{ location: structuredClone(location) }] }) } })).ok, true);
  assert.equal((await result.recheck({ transaction: { query: async () => ({ rows: [{ location: { ...location, scene_position_id: 'moved' } }] }) } })).ok, false);
  environment = { ...environment, light_state: 'night' };
  assert.equal((await result.recheck({ transaction: { query: async () => ({ rows: [{ location }] }) } })).ok, false);
  const stale = { ...args, scene_candidates: [{ ...candidate, applicability_rule_version: 999 }] };
  await assert.rejects(admit(stale), (error) => error.details.reason === 'scene_policy_owner_required');
  await assert.rejects(admit({ ...args, closure: { ...args.closure, scene_rules: [] } }),
    (error) => error.details.reason === 'approved_scene_rule_pin_required');
});

test('terminal admission pins the committed canonical destination scene', async () => {
  const { input } = await approvedNaturalPerceptionFixture();
  const g4 = input.currentFacts.scene.g4_ref;
  const scene = input.currentFacts.scene.scene_template_ref;
  const canonical = { id: 'canonical', version: 1, parent_id: g4.id,
    parent_version: g4.version, scene_template_id: scene.id, scene_template_version: scene.version,
    selection_rule_id: 'scene_selection_single_candidate_v1', selection_rule_version: 1,
    applicability_rule_id: 'scene_applicability_exact_source_ref_v1', applicability_rule_version: 1,
    scene_rules: [['scene_selection_rule', 'scene_selection_single_candidate_v1'],
      ['scene_applicability_rule', 'scene_applicability_exact_source_ref_v1']].map(([entity_kind, id]) => ({
      entity_kind, id, version: 1, status: 'approved', world_revision_id: g4.world_revision_id,
      canonical_digest: 'a'.repeat(64) })) };
  let pinned;
  const admit = createSpatialV3GenerationAdmission({ verifiedCatalog: input.verifiedCatalog,
    pin: input.pin, readCurrentEnvironment: async () => input.currentFacts.current_environment,
    worldBaseReader: { readPinnedCanonicalG5SceneBinding: async (request) => {
      pinned = request;
      return request.scene_template_ref?.id === scene.id
        && request.scene_template_ref.version === scene.version
        ? { ok: true, value: canonical } : { ok: false };
    } } });
  const result = await admit({ transaction: { query: async () => ({ rows: [{ turn_number: 4 }] }) },
    request: { party_id: 'party', actor_id: 'actor', source_position_id: 'departure',
      source_site_id: 'source-site', g4 },
    snapshot: { sites: [{ id: 'target-site', origin: 'canonical', status: 'active',
      canonical_g5_ref: { entity_id: canonical.id, authoring_version: '1' } }],
    scene_baselines: [{ host_kind: 'g5_site', host_id: 'target-site', status: 'active',
      scene_template_ref: { entity_id: scene.id, authoring_version: String(scene.version) } }],
    journey_locations: [{ id: 'location', party_id: 'party', owner_kind: 'actor',
      owner_id: 'actor', location_kind: 'scene', scene_position_id: 'departure' }] },
    selection: { status: 'terminal', directional_exit: { exit_canonical_g5_id: canonical.id,
      exit_canonical_g5_version: canonical.version } }, dependency_pins: { pins: [] } });
  assert.equal(result.ok, true);
  assert.deepEqual(pinned.scene_template_ref, scene);
});
