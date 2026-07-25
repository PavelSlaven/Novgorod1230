import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeSpatialV3CanonicalDigest
} from '@rus/contracts/spatial-v3/registry';
import {
  createSpatialV3JourneyCommandCoordinator
} from '@rus/turn/spatial-v3-journey-commands';
import {
  createSpatialV3TargetShadowComposition
} from '@rus/turn/spatial-v3-target-composition';

const digest = (value) => value.repeat(64);
const seal = (value) => ({
  ...structuredClone(value),
  canonical_digest: computeSpatialV3CanonicalDigest(value)
});
const entityRef = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const endpoint = (endpoint_id) => ({ endpoint_kind: 'route_anchor_scene', endpoint_id });
const exactTime = (whole_minutes = '42') => ({
  whole_minutes,
  subminute_numerator: '0',
  subminute_denominator: '1'
});
const stateVersionEntries = [
  { entity_ref: entityRef('party', 'party-1'), state_version: 7 }
];
const expectedStateVersions = {
  entries: stateVersionEntries,
  canonical_digest: computeSpatialV3CanonicalDigest(stateVersionEntries).replace('sha256:', '')
};
const pinEntries = [{
    dependency_role: 'profile',
    entity_ref: entityRef('action_contract', 'journey-policy'),
    version_pin: {
      pin_kind: 'authoring_version',
      authoring_version: 'v1'
    }
  }];
const dependencyPins = {
  pins: pinEntries,
  canonical_digest: computeSpatialV3CanonicalDigest(pinEntries).replace('sha256:', '')
};
const zero = { numerator: '0', denominator: '1' };

const projection = (overrides = {}) => seal({
  party_id: 'party-1',
  exact_time: exactTime(),
  turn_number: 12,
  route_plan_snapshot: seal({
    id: 'route-plan-1',
    party_id: 'party-1',
    status: 'ready',
    canonical_serialization_digest: digest('c'),
    lifecycle_state_version: 2
  }),
  execution_snapshot: seal({
    id: 'route-execution-1',
    party_id: 'party-1',
    route_plan_id: 'route-plan-1',
    status: 'planned',
    current_step_ordinal: 0,
    current_endpoint_ref: endpoint('anchor-1'),
    state_version: 3
  }),
  expected_state_versions: expectedStateVersions,
  dependency_pins: dependencyPins,
  ...overrides
});

const baseCommand = {
  command_id: 'journey-command-1',
  party_id: 'party-1',
  route_plan_id: 'route-plan-1',
  route_plan_execution_id: 'route-execution-1',
  route_plan_digest: digest('c'),
  expected_state_versions: expectedStateVersions,
  dependency_pins: dependencyPins,
  idempotency_key: 'journey-idempotency-1'
};

const proposal = (kind, command, state, overrides = {}) => seal({
  kind,
  party_id: command.party_id,
  command_id: command.command_id,
  route_plan_id: command.route_plan_id,
  route_plan_execution_id: command.route_plan_execution_id,
  route_plan_digest: command.route_plan_digest,
  exact_time: state.exact_time,
  elapsed: zero,
  boundary_candidates: [],
  ...overrides
});

test('journey start uses only the sealed server clock and preserves the immutable route plan', async () => {
  let handlerInput;
  const coordinator = createSpatialV3JourneyCommandCoordinator({
    startPreparedExecution: async (input) => {
      handlerInput = input;
      return {
        ok: true,
        proposal: proposal('journey_start_proposal', input.command, input.state_projection)
      };
    }
  });
  const command = {
    ...baseCommand,
    intent_kind: 'start_prepared_execution'
  };
  const state = projection();

  const result = await coordinator.resolve({ command, state_projection: state });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(handlerInput.exact_time, state.exact_time);
  assert.equal(Object.isFrozen(handlerInput), true);
  assert.equal(result.proposal.route_plan_digest, state.route_plan_snapshot.canonical_serialization_digest);
  assert.equal(Object.hasOwn(command, 'exact_time'), false);
});

test('target/shadow command registry routes the sealed journey envelope through the server state loader', async () => {
  const state = projection();
  let observedExactTime;
  const journeyCommandCoordinator = createSpatialV3JourneyCommandCoordinator({
    startPreparedExecution: async (input) => {
      observedExactTime = input.exact_time;
      return {
        ok: true,
        proposal: proposal('journey_start_proposal', input.command, input.state_projection)
      };
    }
  });
  const unavailable = async () => ({ ok: false });
  const composition = createSpatialV3TargetShadowComposition({
    planner: { resolve: unavailable },
    activationValidator: { validate: unavailable },
    executionEngine: {},
    targetPreparation: { prepare: unavailable },
    frontierResolver: { resolve: unavailable },
    journeyCommandCoordinator,
    loadJourneyState: async () => ({ ok: true, state_projection: state }),
    loadSnapshots: unavailable,
    validateProposal: unavailable,
    advanceTemporal: unavailable,
    deriveVisiblePackage: unavailable,
    loadCommittedVisiblePackage: unavailable,
    claimPresentationAttempt: unavailable,
    narrate: unavailable,
    persistNarrationOutput: unavailable,
    finalizePresentationAttempt: unavailable,
    projectScreen: unavailable,
    committer: { commit: unavailable },
    verifyApproval: unavailable,
    loadStartSnapshot: unavailable,
    prepareStart: unavailable,
    buildStartWritePlanInput: unavailable,
    modeHandoff: { handoff: unavailable },
    buildModeHandoffProposal: unavailable,
    commandAdapters: {
      journey_command: async ({ command, result }) => ({
        ok: true,
        proposal: seal({
          party_id: command.party_id,
          kind: 'journey_command_proposal',
          command_id: command.command_id,
          idempotency_key: command.idempotency_key,
          dependency_pins: dependencyPins,
          journey_proposal: result.proposal
        })
      })
    }
  });
  const taggedCommand = {
    ...baseCommand,
    intent_kind: 'start_prepared_execution'
  };
  const outerCommand = seal({
    party_id: 'party-1',
    command_id: taggedCommand.command_id,
    command_kind: 'journey_command',
    idempotency_key: taggedCommand.idempotency_key,
    command_payload: seal(taggedCommand)
  });

  const result = await composition.registry.dispatch(outerCommand);

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.deepEqual(observedExactTime, state.exact_time);
  assert.equal(result.proposal.journey_proposal.route_plan_digest, digest('c'));
});

test('target/shadow registry rejects an outer/inner journey identity mismatch before loading state', async () => {
  let loaderCalls = 0;
  const unavailable = async () => ({ ok: false });
  const composition = createSpatialV3TargetShadowComposition({
    planner: { resolve: unavailable },
    activationValidator: { validate: unavailable },
    executionEngine: {},
    targetPreparation: { prepare: unavailable },
    frontierResolver: { resolve: unavailable },
    journeyCommandCoordinator: { resolve: unavailable },
    loadJourneyState: async () => {
      loaderCalls += 1;
      return { ok: true, state_projection: projection() };
    },
    loadSnapshots: unavailable,
    validateProposal: unavailable,
    advanceTemporal: unavailable,
    deriveVisiblePackage: unavailable,
    loadCommittedVisiblePackage: unavailable,
    claimPresentationAttempt: unavailable,
    narrate: unavailable,
    persistNarrationOutput: unavailable,
    finalizePresentationAttempt: unavailable,
    projectScreen: unavailable,
    committer: { commit: unavailable },
    verifyApproval: unavailable,
    loadStartSnapshot: unavailable,
    prepareStart: unavailable,
    buildStartWritePlanInput: unavailable,
    modeHandoff: { handoff: unavailable },
    buildModeHandoffProposal: unavailable,
    commandAdapters: { journey_command: unavailable }
  });
  const taggedCommand = {
    ...baseCommand,
    intent_kind: 'start_prepared_execution'
  };
  const outerCommand = seal({
    party_id: 'party-1',
    command_id: 'different-command',
    command_kind: 'journey_command',
    idempotency_key: taggedCommand.idempotency_key,
    command_payload: seal(taggedCommand)
  });

  const result = await composition.registry.dispatch(outerCommand);

  assert.equal(result.ok, false);
  assert.equal(loaderCalls, 0);
});

test('journey command rejects stale state and dependency pins before invoking a handler', async () => {
  let calls = 0;
  const coordinator = createSpatialV3JourneyCommandCoordinator({
    continueExecution: async () => {
      calls += 1;
      return { ok: false };
    }
  });
  const command = {
    ...baseCommand,
    command_id: 'journey-command-2',
    intent_kind: 'continue_execution',
    idempotency_key: 'journey-idempotency-2',
    expected_state_versions: {
      entries: [{ entity_ref: entityRef('party', 'party-1'), state_version: 8 }],
      canonical_digest: expectedStateVersions.canonical_digest
    }
  };

  const result = await coordinator.resolve({
    command,
    state_projection: projection({
      execution_snapshot: seal({
        id: 'route-execution-1',
        party_id: 'party-1',
        route_plan_id: 'route-plan-1',
        status: 'active',
        current_step_ordinal: 0,
        state_version: 3
      })
    })
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'state_version_conflict');
  assert.equal(calls, 0);
});

test('journey replay is idempotent and conflicting reuse of one key fails closed', async () => {
  let calls = 0;
  const coordinator = createSpatialV3JourneyCommandCoordinator({
    continueExecution: async (input) => {
      calls += 1;
      return {
        ok: true,
        proposal: proposal('journey_continue_proposal', input.command, input.state_projection)
      };
    }
  });
  const command = {
    ...baseCommand,
    command_id: 'journey-command-3',
    intent_kind: 'continue_execution',
    idempotency_key: 'journey-idempotency-3'
  };
  const state = projection({
    execution_snapshot: seal({
      id: 'route-execution-1',
      party_id: 'party-1',
      route_plan_id: 'route-plan-1',
      status: 'active',
      current_step_ordinal: 0,
      state_version: 3
    })
  });

  const first = await coordinator.resolve({ command, state_projection: state });
  const replay = await coordinator.resolve({ command, state_projection: state });
  const conflict = await coordinator.resolve({
    command: { ...command, command_id: 'journey-command-conflict' },
    state_projection: state
  });

  assert.equal(first.ok, true);
  assert.equal(replay.ok, true);
  assert.equal(replay.replayed, true);
  assert.equal(calls, 1);
  assert.equal(conflict.ok, false);
  assert.equal(conflict.error.code, 'idempotency_conflict');
});

test('journey cancel is a zero-time control outcome and never returns a temporal candidate', async () => {
  const command = {
    ...baseCommand,
    command_id: 'journey-command-4',
    intent_kind: 'cancel_execution',
    control_reason_code: 'player_cancelled',
    idempotency_key: 'journey-idempotency-4'
  };
  const state = projection({
    execution_snapshot: seal({
      id: 'route-execution-1',
      party_id: 'party-1',
      route_plan_id: 'route-plan-1',
      status: 'waiting_at_anchor',
      current_step_ordinal: 1,
      current_endpoint_ref: endpoint('anchor-1'),
      state_version: 3
    })
  });
  const valid = createSpatialV3JourneyCommandCoordinator({
    cancelExecution: async (input) => ({
      ok: true,
      proposal: proposal('journey_cancel_proposal', input.command, input.state_projection, {
        outcome_status: 'aborted'
      })
    })
  });
  const invalid = createSpatialV3JourneyCommandCoordinator({
    cancelExecution: async (input) => ({
      ok: true,
      proposal: proposal('journey_cancel_proposal', input.command, input.state_projection, {
        boundary_candidates: [{ boundary_kind: 'invented_future_cancel' }]
      })
    })
  });

  assert.equal((await valid.resolve({ command, state_projection: state })).ok, true);
  const rejected = await invalid.resolve({ command, state_projection: state });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, 'activity_transition_invalid');
});

test('successor preparation binds the exact predecessor handoff and creates a new lineage', async () => {
  const command = {
    command_id: 'journey-command-5',
    intent_kind: 'prepare_successor_plan',
    party_id: 'party-1',
    predecessor_route_plan_id: 'route-plan-1',
    predecessor_execution_id: 'route-execution-1',
    predecessor_handoff_endpoint_ref: endpoint('anchor-1'),
    predecessor_handoff_snapshot_digest: digest('e'),
    successor_path_query: {
      request_id: 'path-query-2',
      party_id: 'party-1',
      request_kind: 'ordinary',
      journey_owner_ref: entityRef('actor', 'actor-1'),
      journey_scope: 'world_travel',
      start_endpoint_ref: endpoint('anchor-1'),
      target_request: {
        target_kind: 'factual_spatial',
        factual_target_ref: {
          spatial_kind: 'canonical_g5',
          spatial_id: 'g5-target'
        }
      },
      knowledge_scope: 'factual',
      cost_mode: 'segmented',
      capability_context: {
        allowed_movement_methods: ['movement_method.walk'],
        available_transport_pins: [],
        equipment_state_pins: [],
        legal_access_fact_pins: [],
        allowed_pace_modes: ['pace.normal']
      },
      expected_state_versions: expectedStateVersions,
      planning_state_version: 7,
      canonical_digest: digest('f')
    },
    expected_state_versions: expectedStateVersions,
    dependency_pins: dependencyPins,
    idempotency_key: 'journey-idempotency-5'
  };
  const state = projection({
    predecessor_handoff_snapshot_digest: digest('e'),
    execution_snapshot: seal({
      id: 'route-execution-1',
      party_id: 'party-1',
      route_plan_id: 'route-plan-1',
      status: 'waiting_at_anchor',
      current_step_ordinal: 1,
      current_endpoint_ref: endpoint('anchor-1'),
      state_version: 3
    })
  });
  const coordinator = createSpatialV3JourneyCommandCoordinator({
    prepareSuccessorPlan: async (input) => ({
      ok: true,
      proposal: seal({
        kind: 'journey_successor_plan_proposal',
        party_id: input.command.party_id,
        command_id: input.command.command_id,
        predecessor_route_plan_id: input.command.predecessor_route_plan_id,
        predecessor_execution_id: input.command.predecessor_execution_id,
        predecessor_handoff_endpoint_ref: input.command.predecessor_handoff_endpoint_ref,
        predecessor_handoff_snapshot_digest: input.command.predecessor_handoff_snapshot_digest,
        successor_route_plan_id: 'route-plan-2',
        successor_execution_id: 'route-execution-2',
        successor_path_query_digest: input.command.successor_path_query.canonical_digest,
        exact_time: input.state_projection.exact_time,
        elapsed: zero,
        boundary_candidates: []
      })
    })
  });

  const result = await coordinator.resolve({ command, state_projection: state });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.notEqual(result.proposal.successor_route_plan_id, command.predecessor_route_plan_id);
  assert.notEqual(result.proposal.successor_execution_id, command.predecessor_execution_id);
  assert.deepEqual(state.route_plan_snapshot, projection().route_plan_snapshot);
});
