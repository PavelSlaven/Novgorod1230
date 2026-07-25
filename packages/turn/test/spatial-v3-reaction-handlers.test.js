import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SPATIAL_V3_NPC_REACTION_HANDLER_BINDINGS,
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import { resolveSpatialV3NpcReaction } from '../src/spatial-v3-reaction-handlers.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const vr = (entity_kind, entity_id) => ({
  entity_ref: ref(entity_kind, entity_id),
  authoring_version: '1'
});
const pin = (dependency_role, reference) => ({
  dependency_role,
  entity_ref: reference.entity_ref,
  version_pin: {
    pin_kind: 'authoring_version',
    authoring_version: reference.authoring_version
  }
});
const seal = (value) => ({
  ...value,
  canonical_digest: computeSpatialV3CanonicalDigest(value)
});
const at = {
  whole_minutes: '100',
  subminute_numerator: '0',
  subminute_denominator: '1'
};

function reactionRequest(commandId = 'npc_investigate_signal') {
  const binding = SPATIAL_V3_NPC_REACTION_HANDLER_BINDINGS[commandId];
  const commandRef = vr('decision_command', commandId);
  const sourceRecordRef = vr('source_record', 'npc-temporal-policy');
  const consequencePolicyRef = vr('action_contract', `${commandId}-policy`);
  const dependencyPins = seal({
    pins: [
      pin('action_contract', commandRef),
      pin('consequence_rule', consequencePolicyRef),
      pin('source_dependency', sourceRecordRef)
    ]
  });
  const commandRecord = seal({
    command_ref: commandRef,
    domain: 'npc_reaction',
    handler_id: binding.handler_id,
    input_contract_name: binding.input_contract_name,
    consequence_contract_name: binding.consequence_contract_name,
    source_record_ref: sourceRecordRef,
    applicability: ['novgorod'],
    status: 'approved',
    dependency_pins: dependencyPins
  });
  const option = {
    option_id: binding.effect_kind,
    command_ref: commandRef,
    command_token: `cmd.v1:${commandId}:request-1`,
    canonical_ordinal: 0,
    preconditions_digest: computeSpatialV3CanonicalDigest({
      command_id: commandId,
      state_version: '7'
    }),
    consequence_policy_ref: consequencePolicyRef
  };
  const traceInput = {
    request_id: 'reaction-request-1',
    state_version: '7',
    option_id: option.option_id,
    command_token: option.command_token,
    options_digest: computeSpatialV3CanonicalDigest([option]),
    validated_at: at,
    status: 'validated',
    idempotency_key: 'npc-decision:reaction-request-1'
  };
  const trace = {
    ...traceInput,
    trace_digest: computeSpatialV3CanonicalDigest(traceInput)
  };
  const perception = seal({
    perception_id: 'perception-1',
    perceiver_ref: ref('npc', 'npc-1'),
    event_ref: ref('sound_event', 'signal-1'),
    perceived_at: at,
    result: 'recognized',
    recognition_policy_ref: vr('action_contract', 'recognition-policy'),
    visibility_policy_ref: vr('action_contract', 'visibility-policy'),
    signal_refs: [ref('sound_event', 'signal-1')],
    knowledge_update_refs: [ref('knowledge_fact', 'signal-observed')]
  });
  const handlerInput = seal({
    source_perception: perception,
    reaction_scope_ref: ref('canonical_spatial_node', 'market'),
    observed_preconditions_digest: option.preconditions_digest,
    dependency_pins: dependencyPins
  });
  const requestInput = {
    request_id: trace.request_id,
    npc_ref: perception.perceiver_ref,
    selected_option: option,
    decision_trace: trace,
    command_record: commandRecord,
    consequence_input_snapshot: handlerInput,
    current_state_version: trace.state_version,
    executed_at: at,
    dependency_pins: dependencyPins,
    idempotency_key:
      `npc-reaction:${trace.request_id}:${trace.state_version}:${trace.trace_digest}:${commandRecord.canonical_digest}`
  };
  return {
    ...requestInput,
    canonical_input_digest: computeSpatialV3CanonicalDigest(requestInput)
  };
}

test('three registered reaction handlers produce only their mapped formal target command effect', () => {
  for (const [commandId, binding] of Object.entries(
    SPATIAL_V3_NPC_REACTION_HANDLER_BINDINGS
  )) {
    const request = reactionRequest(commandId);
    assert.deepEqual(validateSpatialV3Contract(
      'npc_reaction_consequence_request',
      request
    ), []);
    const result = resolveSpatialV3NpcReaction({ request });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(result.effect.effect_kind, binding.effect_kind);
    assert.equal(result.effect.successor_command_kind, binding.successor_command_kind);
    assert.deepEqual(validateSpatialV3Contract(
      'npc_reaction_consequence_proposal',
      result.proposal
    ), []);
    assert.equal(JSON.stringify(result).includes('state_patch'), false);
    assert.equal(JSON.stringify(result).includes('clock'), false);
    assert.equal(JSON.stringify(result).includes('sql'), false);
  }
});

test('reaction handlers reject stale/tampered requests and replay only the identical proposal', () => {
  const request = reactionRequest();
  const first = resolveSpatialV3NpcReaction({ request });
  assert.equal(first.ok, true);
  const replay = resolveSpatialV3NpcReaction({
    request,
    persisted_proposal: first.proposal
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.replay_status, 'already_committed');
  assert.deepEqual(replay.proposal, first.proposal);

  const stale = {
    ...request,
    current_state_version: '8'
  };
  assert.equal(
    resolveSpatialV3NpcReaction({ request: stale }).error.code,
    'npc_decision_policy_gap'
  );
  assert.equal(
    resolveSpatialV3NpcReaction({
      request,
      persisted_proposal: {
        ...first.proposal,
        canonical_input_digest: computeSpatialV3CanonicalDigest({ other: true })
      }
    }).error.code,
    'idempotency_conflict'
  );
});
