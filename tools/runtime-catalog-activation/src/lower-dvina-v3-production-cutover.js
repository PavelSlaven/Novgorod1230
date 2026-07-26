import { createHash } from 'node:crypto';

const PARTY_CLEANUP_LOCK_KEY = 7_613_260_251;
const CUTOVER_PHASE_LOCK_KEY = 7_613_260_252;

export const PARTY_AGGREGATE_DELETE_TRIGGERS = Object.freeze([
  ['party_action_step_runs', 'v3_action_run_append_only'],
  ['party_activity_resource_bindings', 'temporal_append_only'],
  [
    'party_actor_npc_interaction_summaries',
    'first_playable_interaction_summary_append_only'
  ],
  [
    'party_actor_npc_interactions',
    'first_playable_interaction_append_only'
  ],
  ['party_body_temporal_history', 'temporal_append_only'],
  ['party_catalog_pins', 'party_catalog_pins_immutable'],
  ['party_change_set_write_plans', 'v3_change_set_write_plan_immutable'],
  [
    'party_check_resolutions',
    'first_playable_check_resolution_append_only'
  ],
  ['party_clock_owner_handoffs', 'v3_clock_handoff_immutable'],
  ['party_clocks', 'v3_clock_no_delete'],
  [
    'party_materialization_run_catalog_pins',
    'party_materialization_run_catalog_pins_immutable'
  ],
  ['party_narration_attempts', 'temporal_append_only'],
  ['party_npc_decision_traces', 'temporal_append_only'],
  ['party_npc_reaction_option_proposals', 'temporal_append_only'],
  ['party_npc_runtime_transitions', 'temporal_append_only'],
  ['party_perception_records', 'temporal_append_only'],
  ['party_perception_witnesses', 'temporal_append_only'],
  [
    'party_route_plan_execution_events',
    'v3_execution_event_append_only'
  ],
  ['party_route_plan_steps', 'v3_plan_step_immutable'],
  ['party_temporal_event_dependencies', 'temporal_append_only'],
  ['party_temporal_event_subjects', 'temporal_append_only'],
  ['party_timed_activity_attempts', 'v3_activity_attempt_append_only'],
  ['party_traversal_interval_results', 'v3_interval_append_only'],
  ['party_visible_packages', 'temporal_append_only'],
  ['preparation_claims', 'v3_claim_transition'],
  ['preparation_snapshot_members', 'v3_preparation_member_immutable'],
  ['preparation_snapshots', 'v3_preparation_snapshot_immutable'],
  [
    'spatial_v3_migration_coverage_artifacts',
    'spatial_v3_migration_coverage_artifact_immutable'
  ]
].map(Object.freeze));

export const LOWER_DVINA_V2_WORLD_PIN = Object.freeze({
  world_revision_id:
    'novgorod_spatial_v3_production_v2_candidate_001',
  world_catalog_digest:
    'fd75d9cb1ad0e949ff3b0bb5ef044e510f340a967f43867e9c4d41c16ba9f255'
});

export const LOWER_DVINA_V3_WORLD_PIN = Object.freeze({
  world_revision_id:
    'novgorod_spatial_v3_production_v3_candidate_001',
  world_catalog_digest:
    '1cf914ed9a19801f94b8b1463a717dbb0be7f1d51ea2351e6d1d5a51c492215e'
});

export function evaluateLowerDvinaV3ProductionCutover({
  world,
  party,
  expectedWorldDatabase,
  expectedPartyDatabase,
  expectedPreviousEventId,
  expectedPartyIds,
  requestDigest,
  expectedPreparedEvent
}) {
  const identityMatches =
    world.database === expectedWorldDatabase
    && party.database === expectedPartyDatabase;
  const active = world.active_event ?? null;
  const currentParties = [...(party.parties ?? [])]
    .map(({ party_id: partyId }) => partyId)
    .sort();
  const expectedParties = [...expectedPartyIds].sort();
  const alreadyActive =
    active?.compatible_world_revision_id
      === LOWER_DVINA_V3_WORLD_PIN.world_revision_id
    && active?.compatible_world_catalog_digest
      === LOWER_DVINA_V3_WORLD_PIN.world_catalog_digest;
  const exactPredecessor =
    active?.event_id === expectedPreviousEventId
    && active?.compatible_world_revision_id
      === LOWER_DVINA_V2_WORLD_PIN.world_revision_id
    && active?.compatible_world_catalog_digest
      === LOWER_DVINA_V2_WORLD_PIN.world_catalog_digest;
  const exactPartySet =
    currentParties.length === expectedParties.length
    && currentParties.every((partyId, index) =>
      partyId === expectedParties[index]);
  const exactPartyPins = (party.parties ?? []).every((candidate) =>
    candidate.world_revision_id === LOWER_DVINA_V2_WORLD_PIN.world_revision_id
    && candidate.world_catalog_digest
      === LOWER_DVINA_V2_WORLD_PIN.world_catalog_digest);
  const noInflight = Number(party.inflight_count ?? 0) === 0;
  const phaseEvents = world.cutover_events ?? [];
  const exactPrepared = phaseEvents.some((event) =>
    exactPhaseEvent(event, expectedPreparedEvent, 'prepared'));
  const exactCleanupCommitted = phaseEvents.some((event) =>
    exactPhaseEvent(
      event,
      expectedPreparedEvent,
      'party_cleanup_committed'
    ));
  const invalidRequestPhaseEvent = phaseEvents.some((event) =>
    event.request_digest === requestDigest
    && !exactPhaseEvent(event, expectedPreparedEvent, event.phase));
  const conflictingPhaseEvent = phaseEvents.some((event) =>
    event.request_digest !== requestDigest) || invalidRequestPhaseEvent;
  const resumeAfterCleanup =
    identityMatches
    && exactPredecessor
    && currentParties.length === 0
    && noInflight
    && exactPrepared
    && !conflictingPhaseEvent;
  const readyWithParty =
    identityMatches && exactPredecessor && exactPartySet
    && exactPartyPins && noInflight && !conflictingPhaseEvent;

  return Object.freeze({
    status: alreadyActive
      ? 'already_active'
      : resumeAfterCleanup
        ? 'resume_after_cleanup'
        : readyWithParty
        ? 'ready'
        : 'blocked',
    ready: readyWithParty || resumeAfterCleanup,
    ready_with_party: readyWithParty,
    resume_after_cleanup: resumeAfterCleanup,
    already_active: alreadyActive,
    identity_matches: identityMatches,
    exact_predecessor: exactPredecessor,
    exact_party_set: exactPartySet,
    exact_party_world_pins: exactPartyPins,
    no_inflight_commands: noInflight,
    exact_prepared_event: exactPrepared,
    exact_cleanup_committed_event: exactCleanupCommitted,
    conflicting_phase_event: conflictingPhaseEvent,
    current_party_ids: currentParties,
    expected_party_ids: expectedParties,
    world,
    party
  });
}

function exactPhaseEvent(event, expectedPreparedEvent, phase) {
  if (!expectedPreparedEvent
      || !['prepared', 'party_cleanup_committed'].includes(phase)
      || event.phase !== phase) {
    return false;
  }
  const payload = {
    request_digest: event.request_digest,
    phase: event.phase,
    release_id: event.release_id,
    world_revision_id: event.world_revision_id,
    world_catalog_digest: event.world_catalog_digest,
    expected_previous_event_id: event.expected_previous_event_id,
    expected_party_ids: event.expected_party_ids,
    expected_party_set_digest: event.expected_party_set_digest,
    authorization_digest: event.authorization_digest,
    party_database: event.party_database,
    party_principal: event.party_principal,
    party_cleanup_result_digest:
      event.party_cleanup_result_digest ?? null
  };
  const commonFields = [
    'request_digest',
    'release_id',
    'world_revision_id',
    'world_catalog_digest',
    'expected_previous_event_id',
    'expected_party_set_digest',
    'authorization_digest',
    'party_database',
    'party_principal'
  ];
  return commonFields.every((field) =>
    payload[field] === expectedPreparedEvent[field])
    && JSON.stringify(payload.expected_party_ids)
      === JSON.stringify(expectedPreparedEvent.expected_party_ids)
    && (
      phase === 'prepared'
        ? payload.party_cleanup_result_digest === null
        : /^[a-f0-9]{64}$/u.test(
            payload.party_cleanup_result_digest ?? ''
          )
    )
    && event.event_digest === digest(payload);
}

export async function recordProductionCutoverPhase({
  worldPool,
  event
}) {
  if (!worldPool?.connect) {
    throw new TypeError('worldPool with connect() is required.');
  }
  const client = await worldPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock($1::bigint)',
      [CUTOVER_PHASE_LOCK_KEY]
    );
    const existing = (await client.query(
      `SELECT request_digest,phase,event_digest
         FROM operator_control.lower_dvina_v3_cutover_events
        WHERE request_digest=$1 AND phase=$2`,
      [event.request_digest, event.phase]
    )).rows[0];
    if (existing) {
      if (existing.event_digest !== event.event_digest) {
        fail(
          'PRODUCTION_CUTOVER_PHASE_CONFLICT',
          'Persisted cutover phase differs from the exact request-bound event.'
        );
      }
      await client.query('COMMIT');
      return Object.freeze({
        status: 'already_recorded',
        request_digest: event.request_digest,
        phase: event.phase,
        event_digest: event.event_digest
      });
    }
    await client.query(
      `INSERT INTO operator_control.lower_dvina_v3_cutover_events
         (request_digest,phase,release_id,world_revision_id,
          world_catalog_digest,expected_previous_event_id,
          expected_party_ids,expected_party_set_digest,
          authorization_digest,party_database,party_principal,
          party_cleanup_result_digest,event_digest)
       VALUES
         ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13)`,
      [
        event.request_digest,
        event.phase,
        event.release_id,
        event.world_revision_id,
        event.world_catalog_digest,
        event.expected_previous_event_id,
        JSON.stringify(event.expected_party_ids),
        event.expected_party_set_digest,
        event.authorization_digest,
        event.party_database,
        event.party_principal,
        event.party_cleanup_result_digest,
        event.event_digest
      ]
    );
    await client.query('COMMIT');
    return Object.freeze({
      status: 'recorded',
      request_digest: event.request_digest,
      phase: event.phase,
      event_digest: event.event_digest
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function buildProductionCutoverPhaseEvent({
  request,
  phase,
  partyCleanupResult = null
}) {
  if (!['prepared', 'party_cleanup_committed'].includes(phase)) {
    throw new TypeError(`Unsupported cutover phase: ${phase}`);
  }
  if ((phase === 'prepared') !== (partyCleanupResult == null)) {
    throw new TypeError(
      'partyCleanupResult is required only for party_cleanup_committed.'
    );
  }
  const payload = {
    request_digest: request.request_digest,
    phase,
    release_id: request.release_id,
    world_revision_id: request.world_revision_id,
    world_catalog_digest: request.world_catalog_digest,
    expected_previous_event_id: request.expected_previous_event_id,
    expected_party_ids: [...request.expected_party_ids],
    expected_party_set_digest: digest(request.expected_party_ids),
    authorization_digest: digest(request.authorization_ref),
    party_database: request.expected_party_database,
    party_principal: request.expected_party_principal,
    party_cleanup_result_digest:
      partyCleanupResult == null ? null : digest(partyCleanupResult)
  };
  return Object.freeze({
    ...payload,
    event_digest: digest(payload)
  });
}

export async function deleteAuthorizedProductionParties({
  partyPool,
  expectedPartyIds
}) {
  if (!partyPool?.connect) {
    throw new TypeError('partyPool with connect() is required.');
  }
  const expected = [...new Set(expectedPartyIds)].sort();
  if (expected.length === 0) {
    fail(
      'PRODUCTION_PARTY_DELETE_SCOPE_REQUIRED',
      'At least one exact party ID is required.'
    );
  }
  const client = await partyPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'SELECT pg_advisory_xact_lock($1::bigint)',
      [PARTY_CLEANUP_LOCK_KEY]
    );
    const parties = (await client.query(
      `SELECT party_id
         FROM party_runtime.parties
        ORDER BY party_id
        FOR UPDATE`
    )).rows.map(({ party_id: partyId }) => partyId);
    if (parties.length !== expected.length
        || parties.some((partyId, index) => partyId !== expected[index])) {
      fail(
        'PRODUCTION_PARTY_DELETE_SCOPE_CHANGED',
        'The production party set differs from the authorized exact scope.',
        { expected_party_ids: expected, actual_party_ids: parties }
      );
    }
    const inflight = Number((await client.query(
      `SELECT count(*)::int AS count
         FROM party_runtime.commit_idempotency
        WHERE status IN ('reserved','transaction_committed')`
    )).rows[0].count);
    if (inflight !== 0) {
      fail(
        'PRODUCTION_PARTY_DELETE_INFLIGHT',
        'Production party cleanup is blocked by in-flight commands.',
        { inflight_count: inflight }
      );
    }
    await assertExactAggregateDeleteTriggers(client);
    for (const [table, trigger] of PARTY_AGGREGATE_DELETE_TRIGGERS) {
      await client.query(
        `ALTER TABLE party_runtime.${quoteIdentifier(table)}
           DISABLE TRIGGER ${quoteIdentifier(trigger)}`
      );
    }
    const runPins = await client.query(
      `DELETE FROM party_runtime.party_materialization_run_catalog_pins
        WHERE party_id = ANY($1::text[])`,
      [expected]
    );
    const artifacts = await client.query(
      `DELETE FROM party_runtime.spatial_v3_migration_coverage_artifacts
        WHERE party_id = ANY($1::text[])`,
      [expected]
    );
    const pins = await client.query(
      `DELETE FROM party_runtime.party_catalog_pins
        WHERE party_id = ANY($1::text[])`,
      [expected]
    );
    const roots = await client.query(
      `DELETE FROM party_runtime.parties
        WHERE party_id = ANY($1::text[])`,
      [expected]
    );
    for (const [table, trigger] of
      [...PARTY_AGGREGATE_DELETE_TRIGGERS].reverse()) {
      await client.query(
        `ALTER TABLE party_runtime.${quoteIdentifier(table)}
           ENABLE TRIGGER ${quoteIdentifier(trigger)}`
      );
    }
    const disabledTriggerCount = Number((await client.query(
      `SELECT count(*)::int AS count
         FROM pg_trigger
        WHERE (tgrelid::regclass::text || ':' || tgname)
                = ANY($1::text[])
          AND tgenabled <> 'O'`,
      [PARTY_AGGREGATE_DELETE_TRIGGERS.map(([table, trigger]) =>
        `party_runtime.${table}:${trigger}`)]
    )).rows[0].count);
    const remaining = Number((await client.query(
      'SELECT count(*)::int AS count FROM party_runtime.parties'
    )).rows[0].count);
    if (roots.rowCount !== expected.length
        || remaining !== 0
        || disabledTriggerCount !== 0) {
      fail(
        'PRODUCTION_PARTY_DELETE_READBACK_FAILED',
        'Exact party cleanup did not produce an empty party database.',
        {
          deleted_party_count: roots.rowCount,
          remaining_party_count: remaining,
          disabled_trigger_count: disabledTriggerCount
        }
      );
    }
    await client.query('COMMIT');
    return Object.freeze({
      status: 'deleted',
      party_ids: expected,
      deleted_party_count: roots.rowCount,
      deleted_materialization_run_catalog_pin_count: runPins.rowCount,
      deleted_catalog_pin_count: pins.rowCount,
      deleted_coverage_artifact_count: artifacts.rowCount,
      remaining_party_count: remaining
    });
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function assertExactAggregateDeleteTriggers(client) {
  const actual = (await client.query(
    `SELECT c.relname AS table_name, t.tgname AS trigger_name
       FROM pg_trigger t
       JOIN pg_class c ON c.oid=t.tgrelid
       JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='party_runtime'
        AND NOT t.tgisinternal
        AND (t.tgtype & 8) = 8
        AND c.relname <> 'schema_migrations'
        AND t.tgname NOT IN (
          'first_playable_entity_control_on_placement',
          'first_playable_entity_control_on_control',
          'first_playable_entity_control_on_location'
        )
      ORDER BY c.relname,t.tgname`
  )).rows.map(({ table_name: table, trigger_name: trigger }) =>
    `${table}:${trigger}`);
  const expected = PARTY_AGGREGATE_DELETE_TRIGGERS
    .map(([table, trigger]) => `${table}:${trigger}`)
    .sort();
  if (actual.length !== expected.length
      || actual.some((identity, index) => identity !== expected[index])) {
    fail(
      'PRODUCTION_PARTY_DELETE_TRIGGER_SET_CHANGED',
      'The party aggregate delete-trigger set differs from the reviewed schema.',
      { expected, actual }
    );
  }
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function digest(value) {
  return createHash('sha256')
    .update(JSON.stringify(value))
    .digest('hex');
}

function fail(code, message, details = {}) {
  throw Object.assign(new Error(message), { code, details });
}
