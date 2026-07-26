import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import { hash, ref } from '../../../runtime/first-playable/shared.js';
import { conversationWrites } from './plan-conversation.js';
import { actorRef, expected, row } from './plan-shared.js';

export function activityWrites(input) {
  const { command, result } = input;
  if (command.verb === 'talk') return conversationWrites(input, timedActivityRows);
  if (![
    'collect_resource',
    'perform_simple_work',
    'rest'
  ].includes(command.verb)) return null;
  const base = timedActivityRows(input);
  if (command.verb === 'collect_resource') {
    appendResourceCollection(base, input);
  } else if (command.verb === 'perform_simple_work') {
    appendWorkEffects(base, input);
  }
  return base;
}

export function timedActivityRows({
  state,
  changeSet,
  turnNumber,
  command,
  result
}) {
  const partyId = state.party_id;
  const executionId = `activity:${partyId}:${turnNumber}`;
  const idemId =
    `idem:${partyId}:${hash(command.idempotency_key).slice(0, 20)}`;
  const profile = result.activity_profile;
  const elapsed = result.elapsed;
  const startedAt = state.clock_minutes - elapsed;
  const context = {
    location: state.location,
    npc_id: state.npc?.id ?? null,
    quantity: command.quantity ?? null
  };
  const snapshot = resolvedActivitySnapshot(profile, state);
  return {
    inserts: [
      row('party_timed_activity_executions', executionId, {
        id: executionId,
        series_ordinal: 0,
        activity_snapshot: snapshot,
        original_total_minutes: elapsed,
        cumulative_elapsed_numerator: elapsed,
        cumulative_elapsed_denominator: 1,
        remaining_time_numerator: 0,
        remaining_time_denominator: 1,
        next_attempt_ordinal: 1,
        status: 'completed',
        state_version: 2,
        updated_change_set_id: changeSet,
        terminal_change_set_id: changeSet,
        execution_scope: 'standalone',
        activity_series_id: `series:${partyId}:${turnNumber}`,
        activity_owner_ref: actorRef(state),
        origin_location_snapshot: { position: state.location },
        execution_context_snapshot: context,
        originating_command_ref:
          ref('semantic_command', command.request_id),
        originating_command_digest: command.canonical_digest,
        idempotency_record_id: idemId,
        started_at_whole_minutes: startedAt,
        started_at_subminute_numerator: 0,
        started_at_subminute_denominator: 1,
        last_processed_at_whole_minutes: state.clock_minutes,
        last_processed_at_subminute_numerator: 0,
        last_processed_at_subminute_denominator: 1,
        next_boundary_at_whole_minutes: null,
        next_boundary_at_subminute_numerator: null,
        next_boundary_at_subminute_denominator: null,
        progress: {},
        preconditions_digest: hash(`preconditions:${executionId}`),
        terminal_reason_code: `${command.verb}_completed`
      })
    ],
    updates: [],
    appends: [
      row(
        'party_timed_activity_attempts',
        `${executionId}:0`,
        activityAttempt({
          executionId,
          elapsed,
          context,
          command,
          state,
          changeSet,
          idemId,
          turnNumber,
          startedAt,
          profile
        })
      )
    ],
    deletes: [],
    executionId,
    idemId
  };
}

function resolvedActivitySnapshot(profile, state) {
  const payload = {
    schema: 'resolved_activity_profile_snapshot.v1',
    resolved_profile: profile,
    resolved_profile_digest:
      computeSpatialV3CanonicalDigest(profile),
    applicability_resolution: {
      result: 'single_approved_profile',
      activity_profile_id: profile.activity_profile_id
    },
    dependency_pins: state.exact_pins
  };
  return {
    ...payload,
    canonical_digest: computeSpatialV3CanonicalDigest(payload)
  };
}

function activityAttempt({
  executionId,
  elapsed,
  context,
  command,
  state,
  changeSet,
  idemId,
  turnNumber,
  startedAt,
  profile
}) {
  return {
    activity_execution_id: executionId,
    attempt_ordinal: 0,
    remaining_before_numerator: elapsed,
    remaining_before_denominator: 1,
    planned_time_numerator: elapsed,
    planned_time_denominator: 1,
    actual_time_numerator: elapsed,
    actual_time_denominator: 1,
    remaining_after_numerator: 0,
    remaining_after_denominator: 1,
    cumulative_time_before_numerator: 0,
    cumulative_time_before_denominator: 1,
    cumulative_time_after_numerator: elapsed,
    cumulative_time_after_denominator: 1,
    crossed_whole_minute_boundaries: elapsed,
    clock_commit_mode: 'direct_party_clock',
    execution_context_snapshot: context,
    result_kind: 'completed',
    result_code: `${command.verb}_completed`,
    dynamic_dependency_pins: state.exact_pins,
    result_change_set_id: changeSet,
    idempotency_record_id: idemId,
    occurred_at_turn: turnNumber,
    started_at_whole_minutes: startedAt,
    started_at_subminute_numerator: 0,
    started_at_subminute_denominator: 1,
    ended_at_whole_minutes: state.clock_minutes,
    ended_at_subminute_numerator: 0,
    ended_at_subminute_denominator: 1,
    reason_code: `${command.verb}_completed`,
    progress_before: {},
    progress_after: {},
    resource_reservations: [],
    resource_consumptions: [],
    body_effect_refs: command.verb === 'perform_simple_work'
      ? [{ effect: 'energy_delta', value: -8 }]
      : [],
    participant_attendance: state.npc
      ? [{ participant_kind: 'npc', participant_id: state.npc.id }]
      : [],
    rule_and_policy_pins: {
      activity_profile: `${profile.activity_profile_id}@1`,
      resolved_profile_digest:
        computeSpatialV3CanonicalDigest(profile)
    }
  };
}

function appendResourceCollection(set, {
  state,
  changeSet,
  versions
}) {
  const partyId = state.party_id;
  set.updates.push(
    row('party_resource_nodes', `resource:${partyId}:surface-water`, {
      resource_node_id: `resource:${partyId}:surface-water`,
      party_id: partyId,
      quantity_numerator: versions.resourceQuantity - 1000,
      updated_change_set_id: changeSet
    }),
    row('party_containers', `container:${partyId}:bucket`, {
      party_id: partyId,
      container_id: `container:${partyId}:bucket`,
      state: {
        content_kind: 'surface_water',
        quantity_numerator: state.water_ml,
        quantity_denominator: 1,
        quantity_unit: 'millilitre',
        quality: 'untested_surface_water'
      },
      updated_change_set_id: changeSet
    })
  );
  set.expected = [
    expected(
      'party_resource_nodes',
      `resource:${partyId}:surface-water`,
      versions.resource
    ),
    expected(
      'party_containers',
      `container:${partyId}:bucket`,
      versions.container
    )
  ];
}

function appendWorkEffects(set, {
  state,
  changeSet,
  versions
}) {
  const partyId = state.party_id;
  const ropeId = `item:${partyId}:rope`;
  set.appends.push(row(
    'party_activity_resource_bindings',
    `${set.executionId}:item:${ropeId}:required_tool`,
    {
      activity_execution_id: set.executionId,
      resource_kind: 'item',
      resource_id: ropeId,
      binding_kind: 'required_tool',
      quantity_numerator: 1,
      quantity_denominator: 1,
      change_set_id: changeSet,
      idempotency_record_id: set.idemId,
      consumption_policy_ref:
        ref('resource_policy', 'resource_policy_temporary_rope_holder_v1'),
      state_version: 1
    }
  ));
  set.updates.push(row('party_entity_controls', `item:${ropeId}`, {
    party_id: partyId,
    entity_kind: 'item',
    entity_id: ropeId,
    owner_ref: actorRef(state),
    holder_ref: actorRef(state),
    controller_ref: actorRef(state),
    updated_change_set_id: changeSet
  }));
  const relation = row(
    'party_actor_relations',
    `relation:${partyId}:player:fisher`,
    {
      relation_id: `relation:${partyId}:player:fisher`,
      party_id: partyId,
      subject_ref: actorRef(state),
      object_ref: ref('npc', state.npc.id),
      relation_category_ref:
        ref('relation_category', 'cooperative_familiarity'),
      relation_state: { value: state.relation },
      causal_evidence_kind: 'terminal_activity_attempt',
      causal_evidence_ref: {
        activity_execution_id: set.executionId,
        attempt_ordinal: 0
      },
      updated_change_set_id: changeSet
    }
  );
  if (versions.relation == null) {
    relation.record.state_version = 1;
    relation.record.created_change_set_id = changeSet;
    set.inserts.push(relation);
  } else {
    set.updates.push(relation);
  }
  set.expected = [
    expected(
      'party_entity_controls',
      `item:${ropeId}`,
      versions.ropeControl
    ),
    ...(versions.relation == null
      ? []
      : [expected(
          'party_actor_relations',
          relation.id,
          versions.relation
        )])
  ];
}
