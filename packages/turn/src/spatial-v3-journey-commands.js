import {
  computeSpatialV3CanonicalDigest,
  createSpatialV3TypedError,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';

const INTENTS = Object.freeze({
  start_prepared_execution: Object.freeze({
    contract: 'journey_prepared_execution_start_command',
    handler: 'startPreparedExecution',
    proposal: 'journey_start_proposal'
  }),
  continue_execution: Object.freeze({
    contract: 'journey_execution_continue_command',
    handler: 'continueExecution',
    proposal: 'journey_continue_proposal'
  }),
  cancel_execution: Object.freeze({
    contract: 'journey_execution_cancel_command',
    handler: 'cancelExecution',
    proposal: 'journey_cancel_proposal'
  }),
  prepare_successor_plan: Object.freeze({
    contract: 'journey_successor_plan_preparation_command',
    handler: 'prepareSuccessorPlan',
    proposal: 'journey_successor_plan_proposal'
  })
});

const clone = (value) => structuredClone(value);
const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.length > 0;
const zero = (value) => value?.numerator === '0' && value?.denominator === '1';

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function sealed(value) {
  if (!record(value) || !text(value.canonical_digest)) return false;
  const payload = Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'canonical_digest')
  );
  return value.canonical_digest === computeSpatialV3CanonicalDigest(payload);
}

function sealedCollection(value, collectionKey) {
  return record(value)
    && Array.isArray(value[collectionKey])
    && text(value.canonical_digest)
    && value.canonical_digest
      === computeSpatialV3CanonicalDigest(value[collectionKey]).replace('sha256:', '');
}

const sealedExpectedStateVersions = (value) => sealedCollection(value, 'entries');
const sealedDependencyPins = (value) => sealedCollection(value, 'pins');

function same(left, right) {
  return computeSpatialV3CanonicalDigest(left) === computeSpatialV3CanonicalDigest(right);
}

function failure(code, command = {}, state = {}, diagnostics = {}) {
  const pins = [
    command.dependency_pins,
    state.dependency_pins
  ].find(sealedDependencyPins) ?? {
    pins: [],
    canonical_digest: computeSpatialV3CanonicalDigest([])
      .replace('sha256:', '')
  };
  return freeze({
    ok: false,
    error: createSpatialV3TypedError(code, {
      subject_ref: {
        entity_kind: 'party_route_plan_execution',
        entity_id: command.route_plan_execution_id
          ?? command.predecessor_execution_id
          ?? state.execution_snapshot?.id
          ?? 'journey-execution'
      },
      dependency_pins: pins,
      diagnostics
    })
  });
}

function stateError(command, state) {
  if (!sealed(state)
    || state.party_id !== command.party_id
    || validateSpatialV3Contract('game_timestamp', state.exact_time).length
    || !Number.isSafeInteger(state.turn_number)
    || state.turn_number < 0
    || !sealed(state.route_plan_snapshot)
    || !sealed(state.execution_snapshot)
    || state.route_plan_snapshot.party_id !== command.party_id
    || state.execution_snapshot.party_id !== command.party_id
    || state.execution_snapshot.route_plan_id !== state.route_plan_snapshot.id) {
    return 'route_plan_snapshot_missing';
  }
  if (!sealedExpectedStateVersions(command.expected_state_versions)
    || !sealedExpectedStateVersions(state.expected_state_versions)
    || !sealedDependencyPins(command.dependency_pins)
    || !sealedDependencyPins(state.dependency_pins)
    || !same(command.expected_state_versions, state.expected_state_versions)
    || !same(command.dependency_pins, state.dependency_pins)) {
    return 'state_version_conflict';
  }
  return null;
}

function bindingError(intent, command, state) {
  const plan = state.route_plan_snapshot;
  const execution = state.execution_snapshot;
  if (intent === 'prepare_successor_plan') {
    if (command.predecessor_route_plan_id !== plan.id
      || command.predecessor_execution_id !== execution.id
      || command.predecessor_handoff_snapshot_digest
        !== state.predecessor_handoff_snapshot_digest
      || !same(
        command.predecessor_handoff_endpoint_ref,
        state.handoff_endpoint_ref
          ?? execution.suspension_endpoint_ref
          ?? execution.current_endpoint_ref
      )) {
      return 'route_plan_snapshot_missing';
    }
    return null;
  }
  if (command.route_plan_id !== plan.id
    || command.route_plan_execution_id !== execution.id
    || command.route_plan_digest !== plan.canonical_serialization_digest) {
    return 'route_plan_snapshot_missing';
  }
  if (intent === 'start_prepared_execution'
    && (plan.status !== 'ready' || execution.status !== 'planned')) {
    return 'route_plan_execution_conflict';
  }
  if (intent === 'continue_execution'
    && !['active', 'waiting_at_anchor'].includes(execution.status)) {
    return 'route_plan_execution_conflict';
  }
  if (intent === 'cancel_execution'
    && !['planned', 'active', 'waiting_at_anchor', 'suspended_at_scene'].includes(execution.status)) {
    return 'activity_transition_invalid';
  }
  return null;
}

function proposalError(intent, command, state, proposal, expectedKind) {
  if (!sealed(proposal)
    || proposal.kind !== expectedKind
    || proposal.party_id !== command.party_id
    || proposal.command_id !== command.command_id
    || !same(proposal.exact_time, state.exact_time)
    || !zero(proposal.elapsed)
    || !Array.isArray(proposal.boundary_candidates)) {
    return 'generated_schema_mismatch';
  }
  if (intent === 'prepare_successor_plan') {
    if (proposal.predecessor_route_plan_id !== command.predecessor_route_plan_id
      || proposal.predecessor_execution_id !== command.predecessor_execution_id
      || proposal.predecessor_handoff_snapshot_digest
        !== command.predecessor_handoff_snapshot_digest
      || !same(
        proposal.predecessor_handoff_endpoint_ref,
        command.predecessor_handoff_endpoint_ref
      )
      || proposal.successor_path_query_digest
        !== command.successor_path_query.canonical_digest
      || !text(proposal.successor_route_plan_id)
      || !text(proposal.successor_execution_id)
      || proposal.successor_route_plan_id === command.predecessor_route_plan_id
      || proposal.successor_execution_id === command.predecessor_execution_id) {
      return 'route_plan_snapshot_missing';
    }
    return null;
  }
  if (proposal.route_plan_id !== command.route_plan_id
    || proposal.route_plan_execution_id !== command.route_plan_execution_id
    || proposal.route_plan_digest !== command.route_plan_digest) {
    return 'route_plan_snapshot_missing';
  }
  if (intent === 'cancel_execution' && proposal.boundary_candidates.length) {
    return 'activity_transition_invalid';
  }
  return null;
}

export function createSpatialV3JourneyCommandCoordinator(handlers = {}) {
  const replay = new Map();
  return freeze({
    async resolve(input = {}) {
      const command = input.command;
      const state = input.state_projection;
      const intent = INTENTS[command?.intent_kind];
      if (!intent
        || validateSpatialV3Contract(intent.contract, command).length > 0) {
        return failure('generated_schema_mismatch', command, state, {
          stage: 'journey_command_input'
        });
      }
      const invalidState = stateError(command, state);
      if (invalidState) {
        return failure(invalidState, command, state, {
          stage: 'journey_state_projection'
        });
      }
      const invalidBinding = bindingError(command.intent_kind, command, state);
      if (invalidBinding) {
        return failure(invalidBinding, command, state, {
          stage: 'journey_command_binding'
        });
      }
      const replayKey = `${command.party_id}:${command.idempotency_key}`;
      const inputDigest = computeSpatialV3CanonicalDigest({
        command,
        state_projection: state
      });
      const previous = replay.get(replayKey);
      if (previous && previous.input_digest !== inputDigest) {
        return failure('idempotency_conflict', command, state, {
          stage: 'journey_command_replay'
        });
      }
      if (previous) {
        return freeze({ ...clone(previous.result), replayed: true });
      }
      const handler = handlers[intent.handler];
      if (typeof handler !== 'function') {
        return failure('route_contract_missing', command, state, {
          stage: intent.handler
        });
      }
      const handlerInput = freeze({
        command: clone(command),
        state_projection: clone(state),
        exact_time: clone(state.exact_time)
      });
      const result = await handler(handlerInput);
      if (!record(result) || result.ok !== true) {
        return record(result) && result.ok === false
          ? freeze(clone(result))
          : failure('generated_schema_mismatch', command, state, {
            stage: intent.handler
          });
      }
      const invalidProposal = proposalError(
        command.intent_kind,
        command,
        state,
        result.proposal,
        intent.proposal
      );
      if (invalidProposal) {
        return failure(invalidProposal, command, state, {
          stage: `${intent.handler}.proposal`
        });
      }
      const output = freeze({
        ok: true,
        proposal: clone(result.proposal),
        replayed: false
      });
      replay.set(replayKey, {
        input_digest: inputDigest,
        result: clone(output)
      });
      return output;
    }
  });
}
