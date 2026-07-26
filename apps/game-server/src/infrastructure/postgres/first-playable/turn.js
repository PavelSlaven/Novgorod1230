import {
  createCombinedWritePlanBuilder
} from '@rus/turn';

import { serverError } from '../../../errors.js';
import {
  hash, ref
} from '../../../runtime/first-playable/shared.js';
import { activityWrites } from './plan-activity.js';
import {
  landingMaterializationWrites
} from './plan-materialization.js';
import {
  expected,
  generalWrites,
  mergeWriteSets,
  requiredChecks,
  row,
  visibleEnvelope
} from './plan-shared.js';
import {
  traversalWrites
} from './plan-traversal.js';
import { carrierWrites } from './plan-carrier.js';

export async function buildFirstPlayableTurnPlan(input) {
  const {
    partyId,
    previousState,
    state,
    screen,
    turnNumber,
    nextVersion,
    command,
    result,
    versions
  } = input;
  const changeSet = `change:${partyId}:${turnNumber}`;
  const idemId =
    `idem:${partyId}:${hash(command.idempotency_key).slice(0, 20)}`;
  const generic = generalWrites({
    partyId,
    state,
    screen,
    nextVersion,
    changeSet,
    command,
    turnNumber
  });
  const stateWrites = mutableStateWrites({
    ...input,
    changeSet
  });
  const materialization = landingMaterializationWrites({
    previousState,
    state,
    changeSet
  });
  const activity = activityWrites({
    ...input,
    changeSet
  });
  const traversal = traversalWrites({
    ...input,
    changeSet
  });
  const carrier = carrierWrites({
    ...input,
    changeSet
  });
  const immediate = immediateActionWrites({
    ...input,
    changeSet,
    idemId
  });
  const writeSet = mergeWriteSets(
    generic,
    stateWrites,
    materialization,
    activity,
    traversal,
    carrier,
    immediate
  );
  const expectedVersions = [
    expected('parties', partyId, input.stateVersion),
    expected('party_server_sessions', partyId, versions.session),
    ...(stateWrites.expected ?? []),
    ...(activity?.expected ?? []),
    ...(traversal?.expected ?? []),
    ...(carrier?.expected ?? [])
  ];
  const envelope = visibleEnvelope({
    partyId,
    state,
    screen,
    nextVersion,
    changeSet,
    idemId,
    result,
    turnNumber
  });
  const physicalKeys = Object.values(writeSet)
    .flat()
    .map((write) =>
      `party_runtime.${write.target_table}:${write.id}`);
  const writePlanBuilder = createCombinedWritePlanBuilder({
    verifyApproval: async (candidate) => ({
      ok:
        candidate.party_id === partyId
        && candidate.operation_kind === command.verb
        && candidate.canonical_input_digest
          === normalizeDigest(command.canonical_digest)
    })
  });
  const built = await writePlanBuilder.build({
    plan_id: `p16:${partyId}:${turnNumber}`,
    party_id: partyId,
    write_plan_kind: 'semantic_commit',
    operation_kind: command.verb,
    canonical_input_digest:
      normalizeDigest(command.canonical_digest),
    expected_state_versions: expectedVersions,
    validation_report: {
      status: 'pass',
      digest: normalizeDigest(hash(
        `validated:${command.canonical_digest}`
      ))
    },
    idempotency: {
      id: idemId,
      key: command.idempotency_key,
      semantic_command_snapshot: command,
      semantic_command_digest:
        normalizeDigest(command.canonical_digest),
      semantic_dependency_pins: command.dependency_pins,
      request_id: command.request_id
    },
    change_set: { id: changeSet },
    visible_package_envelope: envelope,
    approved_write_sets: [writeSet],
    lock_context: {
      owner_keys: [`actor:${state.player.id}`],
      execution_keys: activity?.executionId
        ? [activity.executionId]
        : [],
      g4_keys: [],
      physical_keys: physicalKeys
    },
    commit_rechecks: requiredChecks({
      partyId,
      stateVersion: input.stateVersion,
      command,
      versions
    })
  });
  if (!built.ok) {
    throw serverError(
      'P16_WRITE_PLAN_REJECTED',
      'The sealed first-playable write plan was rejected.',
      { status: 409, details: built.error }
    );
  }
  return built.plan;
}

function mutableStateWrites({
  partyId,
  state,
  command,
  result,
  versions,
  changeSet
}) {
  const set = {
    inserts: [],
    updates: [],
    appends: [],
    deletes: [],
    expected: []
  };
  if (result.elapsed > 0) {
    set.updates.push(row('party_clocks', partyId, {
      party_id: partyId,
      whole_minutes: state.clock_minutes,
      updated_change_set_id: changeSet
    }));
    set.expected.push(
      expected('party_clocks', partyId, versions.clock)
    );
  }
  if ((command.verb === 'move' && result.elapsed > 0)
      || ['perform_simple_work', 'rest'].includes(command.verb)) {
    const id = `player_character:${state.player.id}`;
    set.updates.push(row('party_actor_body_states', id, {
      party_id: partyId,
      actor_kind: 'player_character',
      actor_id: state.player.id,
      health: state.player.health,
      energy: state.player.energy,
      satiety: state.player.satiety,
      updated_change_set_id: changeSet
    }));
    set.expected.push(expected(
      'party_actor_body_states',
      id,
      versions.body
    ));
  }
  if (command.verb === 'give') {
    const ropeId = `item:${partyId}:rope`;
    set.updates.push(row(
      'party_entity_controls',
      `item:${ropeId}`,
      {
        party_id: partyId,
        entity_kind: 'item',
        entity_id: ropeId,
        owner_ref: ref('actor', state.player.id),
        holder_ref: ref('npc', state.npc.id),
        controller_ref: ref('npc', state.npc.id),
        updated_change_set_id: changeSet
      }
    ));
    set.expected.push(expected(
      'party_entity_controls',
      `item:${ropeId}`,
      versions.ropeControl
    ));
  }
  return set;
}

function immediateActionWrites({
  partyId,
  state,
  command,
  changeSet,
  turnNumber,
  idemId
}) {
  if (!['look', 'give', 'save'].includes(command.verb)) return null;
  const id = `action:${partyId}:${turnNumber}`;
  const location = { position: state.location };
  return {
    inserts: [],
    updates: [],
    appends: [row('party_action_step_runs', id, {
      id,
      execution_id: null,
      plan_step_ordinal: null,
      attempt_ordinal: 0,
      action_snapshot: {
        verb: command.verb,
        semantic_command_digest: command.canonical_digest
      },
      departure_endpoint_snapshot: location,
      arrival_endpoint_snapshot: location,
      execution_context_snapshot: {
        target_ref: command.target_ref ?? null
      },
      result_kind: 'completed',
      result_code: `${command.verb}_completed`,
      result_change_set_id: changeSet,
      idempotency_record_id: idemId,
      occurred_at_turn: turnNumber,
      party_id: partyId,
      action_scope: 'standalone',
      origin_location_snapshot: location,
      originating_command_ref:
        ref('semantic_command', command.request_id),
      originating_command_digest: command.canonical_digest
    })],
    deletes: []
  };
}

function normalizeDigest(value) {
  const raw = String(value).replace('sha256:', '');
  return `sha256:${raw}`;
}
