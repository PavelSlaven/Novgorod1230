import assert from 'node:assert/strict';
import test from 'node:test';
import { createTurnAvailableActionSet, createTurnCommandRegistry } from '@rus/turn';
import { createSpatialV3LocalSceneRuntime } from
  '../src/runtime/spatial-v3-local-scene-runtime.js';
import { loadApprovedLocalMovementEligibilityPins } from
  '../src/infrastructure/postgres/spatial-v3-local-movement-eligibility.js';
import { createLocalMovementDisclosureReader } from
  '../src/infrastructure/postgres/spatial-v3-local-scene-movement.js';
import { createTraceLocalSceneCommands } from
  '../src/runtime/lower-dvina-trace-local-scene-commands.js';
import { projectLowerDvinaTraceTurnStepPlannerState } from
  '../src/runtime/lower-dvina-trace-phase-2-player-safe.js';
import { createTurnStepDomainOwnerPreflight } from
  '../../../packages/turn/src/turn-step-admission.js';
import { applyS1LocalPositionTransition } from
  '../src/infrastructure/postgres/lower-dvina-trace-turn-step-commit-projections.js';
import { createTracePhase3TemporalAdvance, createTracePhase3VisibleProjector } from
  '../src/runtime/lower-dvina-trace-phase-3-effects.js';
import { createTraceRouteBodyEffect } from
  '../src/runtime/lower-dvina-trace-route-body-effects.js';

const positions = ['arrival', 'focus', 'departure'];

test('production local movement uses exact approved 68 policy pins', () => {
  const worldRevisionId = 'novgorod_spatial_v3_target_contract_approval_001';
  const pins = loadApprovedLocalMovementEligibilityPins(worldRevisionId);
  assert.equal(pins.length, 68);
  assert.equal(new Set(pins.map((pin) => pin.id)).size, 68);
  assert.throws(() => loadApprovedLocalMovementEligibilityPins('another-revision'),
    { code: 'SPATIAL_V3_LOCAL_MOVEMENT_PINS_INVALID' });
});
const edges = positions.flatMap((from, index) => [index > 0
  ? [from, positions[index - 1]] : null,
index < positions.length - 1 ? [from, positions[index + 1]] : null])
  .filter(Boolean).map(([from, to]) => ({
    journey_location_id: 'journey', journey_state_version: 1,
    edge_id: `${from}:${to}`, reverse_edge_id: `${to}:${from}`,
    from_position_ref: from, to_position_ref: to, cost_kind: 'action',
    action_units: 1, base_minutes: null, edge_capacity: 1,
    edge_state_version: 1, reverse_edge_state_version: 1,
    source_node_state_version: 1, destination_node_state_version: 1,
    destination_capacity: 2, destination_occupancy: 0,
    destination_slot_key: to, scene_baseline_id: 'baseline', site_id: 'site',
    transition_environment_profile_ref: null,
    movement_orientation_profile_ref: null,
    baseline_movement_method_id: null,
    movement_method_cost_profile_ref: null,
    dynamic_recheck_policy_ref: null
  }));

function state(position) {
  return { party_id: 'party', actor_id: 'actor', party_state: { state_version: 1 },
    position: { position_id: position }, journey_location: { id: 'journey',
      scene_position_id: position, state_version: 1 } };
}

test('local movement follows only committed directed edges; P16 changes exact position', async () => {
  let committed = state('arrival');
  const pool = { async query(_sql, [partyId, actorId, positionId]) {
    assert.deepEqual([partyId, actorId], ['party', 'actor']);
    return { rows: edges.filter(({ from_position_ref: from }) => from === positionId) };
  } };
  const runtime = createSpatialV3LocalSceneRuntime({ pool,
    readLocalEdgeDisclosure: async ({ state: current }) => edges
      .filter(({ from_position_ref: from }) => from === current.position.position_id)
      .map(({ edge_id: id }) => ({ edge_id: id, display_label: `Проход ${id}` })) });
  const initial = await runtime.listLocalOptions({ partyId: 'party', actorId: 'actor', state: committed });
  assert.deepEqual(initial.map(({ edge_id: id }) => id), ['arrival:focus']);
  assert.equal(initial[0].display_label, 'Проход arrival:focus');
  const commands = await createTraceLocalSceneCommands({ state: committed,
    inputDigest: 'digest', spatialLocalSceneRuntime: runtime });
  const actionSet = await createTurnAvailableActionSet({
    registry: createTurnCommandRegistry(commands), committedState: committed,
    actorId: committed.actor_id, policyPins: [] });
  assert.deepEqual(actionSet.options.map(({ option_id: id }) => id),
    ['local_scene_edge:arrival:focus']);
  await assert.rejects(runtime.prepareLocalMovement({ partyId: 'party', actorId: 'actor',
    state: committed, edgeId: 'focus:departure', playerInput: {}, inputDigest: 'digest' }),
  { code: 'SPATIAL_V3_LOCAL_EDGE_UNAVAILABLE' });
  for (const [from, to] of [['arrival', 'focus'], ['focus', 'departure']]) {
    const result = await runtime.prepareLocalMovement({ partyId: 'party', actorId: 'actor',
      state: committed, edgeId: `${from}:${to}`, playerInput: {}, inputDigest: 'digest' });
    assert.equal(result.duration_minutes, 0);
    assert.equal(result.position_transition.movement_edge_ref, `${from}:${to}`);
    assert.deepEqual(result.visible_seed.destination_movement_objects.map((row) => row.entity_ref.entity_id),
      edges.filter(({ from_position_ref: at }) => at === to).map(({ edge_id: id }) => id),
      'the screen of the move shows the passages of the arrival position');
    const snapshot = structuredClone(committed);
    applyS1LocalPositionTransition({ snapshot, state: committed,
      transition: result.position_transition });
    assert.equal(snapshot.position.position_id, to);
    committed = state(to);
  }
  assert.deepEqual((await runtime.listLocalOptions({ partyId: 'party', actorId: 'actor',
    state: committed })).map(({ edge_id: id }) => id), ['departure:focus']);
});

test('one exit approach is prepared as an owner-admitted ordered local edge chain', async () => {
  const pool = { async query(_sql, [partyId, actorId, positionId, originPositionId]) {
    assert.deepEqual([partyId, actorId, originPositionId], ['party', 'actor', 'arrival']);
    return { rows: edges.filter(({ from_position_ref: from }) => from === positionId) };
  } };
  const runtime = createSpatialV3LocalSceneRuntime({ pool });
  const chain = await runtime.prepareLocalApproachChain({ partyId: 'party', actorId: 'actor',
    state: state('arrival'), edgeIds: ['arrival:focus', 'focus:departure'] });
  assert.equal(chain.origin_position_ref, 'arrival');
  assert.equal(chain.terminal_position_ref, 'departure');
  assert.deepEqual(chain.edges.map(({ edge_id: id }) => id),
    ['arrival:focus', 'focus:departure']);
  assert.deepEqual(chain.edges.map(({ movement_admission: admission }) =>
    admission.from_position_ref), ['arrival', 'focus']);
});

test('S1 projection still rejects a stale committed position', () => {
  const committed = state('departure');
  assert.throws(() => applyS1LocalPositionTransition({
    snapshot: structuredClone(committed), state: committed,
    transition: { owner: '@rus/movement-routes', actor_id: 'actor',
      from_position_ref: 'focus', to_position_ref: 'arrival' }
  }), { code: 'TRACE_S1_MOVEMENT_TRANSITION_INVALID' });
  assert.throws(() => applyS1LocalPositionTransition({
    snapshot: structuredClone(committed), state: committed,
    transition: { owner: 'unknown', actor_id: 'actor',
      from_position_ref: 'departure', to_position_ref: 'focus' }
  }), { code: 'TRACE_S1_MOVEMENT_TRANSITION_INVALID' });
});

test('local action movement keeps exact clock; route traversal owns its elapsed time', async () => {
  const clock = { whole_minutes: '10', subminute_numerator: '0',
    subminute_denominator: '1' };
  const advance = createTracePhase3TemporalAdvance({ phase2Advance() {
    throw new Error('movement must not delegate its clock');
  } });
  const local = { clock_before: clock, relevant_state: {
    temporal_boundary_candidates: [] }, exact_elapsed: {
    exact_minutes: { numerator: '0', denominator: '1' } }, consequence: {
    phase3_kind: 'movement', duration_minutes: 0,
    position_transition: { owner: '@rus/movement-routes' }
  } };
  const localResult = await advance(local);
  assert.deepEqual(localResult.clock_after, clock);
  assert.equal(localResult.boundary_trace.owner, 'movement_route_owner');
  const directional = { ...local, consequence: {
    phase3_kind: 'movement', duration_minutes: 0,
    movement: { status: 'completed', cost_kind: 'action', action_units: 1 },
    position_transition: {
      owner: '@rus/turn/spatial-v3-site-connection-traversal'
    }
  } };
  assert.deepEqual((await advance(directional)).clock_after, clock);
  await assert.rejects(advance({ ...local, exact_elapsed: {
    exact_minutes: { numerator: '1', denominator: '1' } } }),
  { code: 'TRACE_PHASE_3_TEMPORAL_STATE_INVALID' });
  const route = { ...local, exact_elapsed: {
    exact_minutes: { numerator: '8', denominator: '1' } }, consequence: {
    phase3_kind: 'movement', duration_minutes: 8, movement: { traversal: {
      clock_before: clock, clock_update: { world_time_after: {
        ...clock, whole_minutes: '18' } }, interval_result: {
        clock_commit_mode: 'direct_party_clock', actual_time_numerator: '8',
        actual_time_denominator: '1' }
    } }
  } };
  assert.equal((await advance(route)).clock_after.whole_minutes, '18');
  await assert.rejects(advance({ ...route, consequence: {
    ...route.consequence, movement: { traversal: {
      ...route.consequence.movement.traversal, clock_update: null
    } }
  } }), { code: 'TRACE_PHASE_3_TEMPORAL_STATE_INVALID' });
});

test('local movement preserves current scene projection without route destination', async () => {
  const visible = { version: 1, schema: 'visible_context_package',
    visible_scene: 'Окрестности.', visible_changes: [], sensory_details: [],
    visible_npc: [], visible_objects: [], known_context: [],
    uncertainties: [], allowed_tensions: [], do_not_imply: [] };
  const projector = createTracePhase3VisibleProjector({
    phase2Projector: { project() { throw new Error('wrong owner'); } },
    contracts: {}, scenePresentation: {}
  });
  assert.deepEqual(await projector.project({ consequence: {
    phase3_kind: 'movement', position_transition: { owner: '@rus/movement-routes' }
  }, retrieved_state: { current_visible_context: visible } }), visible);
});

test('local movement does not consume route body effect', () => {
  const body = { health: 100, satiety: 70, energy: 80,
    active_conditions: [] };
  const owner = createTraceRouteBodyEffect({
    phase2BodyEffect: { apply() { throw new Error('wrong owner'); } },
    phase3Contracts: { routeBodyEffect: { elapsed_minutes: 8 } }
  });
  assert.deepEqual(owner.apply({ committed_state: { body_state: body },
    consequence: { phase3_kind: 'movement', duration_minutes: 0,
      position_transition: { owner: '@rus/movement-routes' } },
    time_update: { exact_elapsed: { exact_minutes: {
      numerator: '0', denominator: '1' } } }
  }), { owner: '@rus/body-state', applied: false, proposal: null,
    state_after: body });
});

test('local command binds exact current edge and rejects stale state', async () => {
  const committed = state('arrival');
  const runtime = { async listLocalOptions() { return [{ edge_id: 'arrival:focus',
    display_label: 'Перейти к соседнему месту 1', action_units: 1,
    destination_status: 'open' }]; },
  async prepareLocalMovement() { return { schema: 'turn_consequence_package',
    status: 'resolved', duration_minutes: 0, visible_seed: {}, hidden_update: {},
    state_changes: [], suggested_actions: [] }; } };
  const [command] = await createTraceLocalSceneCommands({ state: committed,
    inputDigest: 'digest', spatialLocalSceneRuntime: runtime });
  assert.deepEqual(command.writeTargets(), []);
  assert.equal(command.label, 'Перейти к соседнему месту 1');
  assert.equal(command.semantic_binding.operation_dto.target_ref, 'arrival:focus');
  const actionSet = await createTurnAvailableActionSet({
    registry: createTurnCommandRegistry([command]), committedState: committed,
    actorId: committed.actor_id, policyPins: [] });
  assert.deepEqual(actionSet.options.map(({ option_id: id }) => id),
    ['local_scene_edge:arrival:focus']);
  const operation = command.semantic_binding.operation_dto;
  const projected = projectLowerDvinaTraceTurnStepPlannerState({
    actor_id: 'actor', current_visible_context: { visible_objects: [{
      entity_ref: { entity_kind: 'scene_movement_edge',
        entity_id: 'arrival:focus' }, display_label: 'Перейти к соседнему месту 1'
    }] }
  });
  assert.equal(projected.available_domain_operations, undefined);
  const preflight = createTurnStepDomainOwnerPreflight({
    externalRegistry: null, semanticBindings: [{ command,
      binding: command.semantic_binding }],
    availableOptions: new Set(actionSet.options.map(({ option_id }) => option_id)),
    actor: { actor_ref: 'actor' }, committedState: committed, services: {}
  });
  const selected = { ...operation };
  delete selected.description;
  assert.equal(preflight.resolve({ operation: selected,
    plan: { operations: [selected] }, request: {
      available_domain_operations: [operation], player_safe_state: projected
    } }).kind, 'binding');
  const unavailable = createTurnStepDomainOwnerPreflight({
    externalRegistry: null, semanticBindings: [{ command,
      binding: command.semantic_binding }], availableOptions: new Set(),
    actor: { actor_ref: 'actor' }, committedState: committed, services: {}
  });
  assert.equal(unavailable.resolve({ operation: selected,
    plan: { operations: [selected] }, request: {
      available_domain_operations: [selected], player_safe_state: projected
    } }).kind, 'missing');
  assert.equal(command.semantic_binding.matches({ operation: {
    ...operation, description: 'Иду к соседнему месту' } }), true);
  assert.equal(command.semantic_binding.matches({ operation: {
    ...operation, target_ref: 'arrival:other' } }), false);
  assert.equal(command.availability({ retrievedState: committed }).can_attempt, true);
  const stale = { ...committed, position: { position_id: 'focus' } };
  assert.equal(command.availability({ retrievedState: stale }).can_attempt, false);
  await assert.rejects(command.consequence({ retrievedState: stale, playerInput: {} }),
    { code: 'SPATIAL_V3_LOCAL_SOURCE_STALE' });
});

test('occupied local edge stays a selectable plan operation; attempt fails typed, not as a plan mismatch',
  async () => {
    const committed = state('arrival');
    const pool = { async query() { return { rows: [{ ...edges.find((edge) =>
      edge.edge_id === 'arrival:focus'), destination_occupancy: 2 }] }; } };
    const runtime = createSpatialV3LocalSceneRuntime({ pool,
      readLocalEdgeDisclosure: async () => [{ edge_id: 'arrival:focus', display_label: 'Проход 1',
        destination_status: 'occupied' }] });
    const [command] = await createTraceLocalSceneCommands({ state: committed,
      inputDigest: 'digest', spatialLocalSceneRuntime: runtime });
    // The status the actor may see comes from the disclosure owner (perceived occupants only):
    // the label the actor and planner see says the passage is occupied.
    assert.equal(command.label, 'Проход 1 (проход занят)');
    assert.equal(command.reason_visible_to_actor, 'Проход 1 (проход занят)');
    const actionSet = await createTurnAvailableActionSet({
      registry: createTurnCommandRegistry([command]), committedState: committed,
      actorId: committed.actor_id, policyPins: [] });
    // Still present: a free-text match resolves to this binding, never 'missing' —
    // the occupied case must not surface as a generic plan/operation mismatch.
    assert.deepEqual(actionSet.options.map(({ option_id: id }) => id),
      ['local_scene_edge:arrival:focus']);
    const preflight = createTurnStepDomainOwnerPreflight({
      externalRegistry: null, semanticBindings: [{ command, binding: command.semantic_binding }],
      availableOptions: new Set(actionSet.options.map(({ option_id }) => option_id)),
      actor: { actor_ref: 'actor' }, committedState: committed, services: {}
    });
    const operation = command.semantic_binding.operation_dto;
    assert.equal(preflight.resolve({ operation, plan: { operations: [operation] },
      request: { available_domain_operations: [operation] } }).kind, 'binding');
    await assert.rejects(command.consequence({ retrievedState: committed, playerInput: {} }),
      { code: 'SPATIAL_V3_LOCAL_EDGE_OCCUPIED' });
  });

test('a full destination the actor cannot perceive is listed open, yet the attempt is refused (F6)',
  async () => {
    const committed = state('arrival');
    const pool = { async query() { return { rows: [{ ...edges.find((edge) =>
      edge.edge_id === 'arrival:focus'), destination_occupancy: 2 }] }; } };
    const runtime = createSpatialV3LocalSceneRuntime({ pool,
      readLocalEdgeDisclosure: async () => [{ edge_id: 'arrival:focus', display_label: 'Проход 1',
        destination_status: 'open' }] });
    const [command] = await createTraceLocalSceneCommands({ state: committed,
      inputDigest: 'digest', spatialLocalSceneRuntime: runtime });
    assert.equal(command.label, 'Проход 1', 'nothing about the unseen occupants is shown');
    assert.deepEqual(command.semantic_grounding, { destination_status: 'open' });
    const ids = { partyId: 'party', actorId: 'actor', state: committed, edgeId: 'arrival:focus' };
    assert.equal(await runtime.localEdgeAttemptStatus(ids), 'occupied');
    assert.equal(await runtime.localEdgeAttemptStatus({ ...ids, edgeId: 'unknown' }), null);
    await assert.rejects(command.consequence({ retrievedState: committed, playerInput: {} }),
      { code: 'SPATIAL_V3_LOCAL_EDGE_OCCUPIED' });
  });

for (const status of ['restrained', 'incapacitated']) test(
  `local edge while ${status} has blocked command availability`, async () => {
    const committed = { ...state('arrival'), combat_sessions: [{
      status: 'paused_for_player', participant_states: [{
        actor_ref: { entity_kind: 'player_character', entity_id: 'actor' },
        combat_status: status }] }] };
    const [command] = await createTraceLocalSceneCommands({ state: committed,
      inputDigest: 'digest', spatialLocalSceneRuntime: {
        listLocalOptions: async () => [{ edge_id: 'arrival:focus',
          display_label: 'Перейти к соседнему месту', action_units: 1,
          destination_status: 'open' }],
        prepareLocalMovement: async () => { throw new Error('must not prepare'); }
      } });
    assert.deepEqual(command.availability({ committed_state: committed }), {
      version: 1, schema: 'turn_availability_decision', status: 'blocked',
      can_attempt: false, reasons: ['actor_movement_blocked'], check_requests: [] });
  });

test('full destination stays listed as occupied and is denied with a typed reason on attempt',
  async () => {
    let occupied = true;
    const pool = { async query() { return { rows: [{ ...edges.find((edge) =>
      edge.edge_id === 'arrival:focus'), destination_occupancy: occupied ? 2 : 0 }] }; } };
    const runtime = createSpatialV3LocalSceneRuntime({ pool,
      readLocalEdgeDisclosure: async () => [{ edge_id: 'arrival:focus', display_label: 'Проход 1' }] });
    const source = state('arrival');
    const listed = await runtime.listLocalOptions({ partyId: 'party', actorId: 'actor',
      state: source });
    assert.deepEqual(listed.map(({ edge_id: id }) => id), ['arrival:focus']);
    await assert.rejects(runtime.prepareLocalMovement({ partyId: 'party', actorId: 'actor',
      state: source, edgeId: 'arrival:focus', playerInput: {}, inputDigest: 'digest' }),
    { code: 'SPATIAL_V3_LOCAL_EDGE_OCCUPIED' });
    occupied = false;
    assert.equal((await runtime.prepareLocalMovement({ partyId: 'party', actorId: 'actor',
      state: source, edgeId: 'arrival:focus', playerInput: {}, inputDigest: 'digest' }))
      .duration_minutes, 0);
  });

test('changed journey version denies local movement regardless of occupancy', async () => {
  const pool = { async query() { return { rows: [{ ...edges.find((edge) =>
    edge.edge_id === 'arrival:focus'), destination_occupancy: 0 }] }; } };
  const runtime = createSpatialV3LocalSceneRuntime({ pool,
    readLocalEdgeDisclosure: async () => [{ edge_id: 'arrival:focus', display_label: 'Проход 1' }] });
  const stale = structuredClone(state('arrival'));
  stale.journey_location.state_version = 2;
  await assert.rejects(runtime.prepareLocalMovement({ partyId: 'party', actorId: 'actor',
    state: stale, edgeId: 'arrival:focus', playerInput: {}, inputDigest: 'digest' }),
  { code: 'SPATIAL_V3_LOCAL_EDGE_UNAVAILABLE' });
});

test('topology alone grants no player-facing local movement', async () => {
  const runtime = createSpatialV3LocalSceneRuntime({ pool: { async query() {
    throw new Error('topology must not be read without visibility proof');
  } } });
  assert.deepEqual(await runtime.listLocalOptions({ partyId: 'party', actorId: 'actor',
    state: state('arrival') }), []);
  await assert.rejects(runtime.prepareLocalMovement({ partyId: 'party', actorId: 'actor',
    state: state('arrival'), edgeId: 'arrival:focus', playerInput: {},
    inputDigest: 'digest' }), { code: 'SPATIAL_V3_LOCAL_VISIBILITY_DATA_GAP' });
});

test('the disclosure owner and the local-scene runtime read admission through the same eligibility reader (F7)', async () => {
  const seenFlags = [];
  const pool = { async query(_sql, params) {
    seenFlags.push(params[4]);
    return { rows: edges.filter(({ from_position_ref: from }) => from === 'arrival')
      .map((row) => ({ ...row, destination_placements: [{ entity_kind: 'npc', entity_id: 'n', units: '1' }] })) };
  } };
  const readLocalMovementEligibility = async () => null;
  const disclosed = await createLocalMovementDisclosureReader({ readLocalMovementEligibility })({
    transaction: pool, partyId: 'party', actorId: 'actor', positionId: 'arrival' });
  const runtime = createSpatialV3LocalSceneRuntime({ pool, readLocalMovementEligibility,
    readLocalEdgeDisclosure: async () => [{ edge_id: 'arrival:focus', display_label: 'Проход' }] });
  await runtime.listLocalOptions({ partyId: 'party', actorId: 'actor', state: state('arrival') });
  assert.deepEqual(seenFlags, [true, true], 'both admission reads pass the eligibility reader');
  assert.deepEqual(disclosed, [{ edge_id: 'arrival:focus', destination_capacity: 2,
    destination_placements: [{ entity_kind: 'npc', entity_id: 'n', units: 1 }] }]);
  const without = [];
  await createLocalMovementDisclosureReader()({ transaction: { async query(_sql, params) {
    without.push(params[4]); return { rows: [] }; } }, partyId: 'party', actorId: 'actor', positionId: 'arrival' });
  assert.deepEqual(without, [false]);
});
