import { canonicalDigest, projectApprovedCurrentEnvironment } from '@rus/materialization';
import { projectCalendar } from '@rus/time-events-history/calendar';
import { createLowerDvinaTracePhase2PostgresRepository } from './lower-dvina-trace-phase-2.js';
import { createLowerDvinaTracePhase1ARepository } from '@rus/party-store/internal/lower-dvina-trace-phase-1a';
import { serverError } from '../../errors.js';
import { readCurrentEntityVisibilityScene } from './g4-natural-perception-reader.js';

/** Reuse the normalized committed-state owner inside the caller's transaction. */
export function createTargetCurrentFactualContext({ partyPool, committer, runtime,
  authoredRuntimeBindingResolver } = {}) {
  const inputs = runtime?.materialization_inputs;
  const calendarProfile = inputs?.calendar_profile;
  const records = inputs?.approved_actor_temporal_bundle?.temporal_records;
  async function read({ transaction, partyId }) {
    if (typeof transaction?.query !== 'function' || !calendarProfile || !Array.isArray(records)) gap();
    const repository = createLowerDvinaTracePhase2PostgresRepository({
      partyPool: { query: transaction.query.bind(transaction), connect: partyPool.connect.bind(partyPool) },
      committer, authoredRuntimeBindingResolver });
    const state = await repository.loadPhase2State(partyId, { includeCurrentVisibleContext: false });
    if (state.world_identity?.world_revision_id !== runtime.itemPin.compatible_world_revision_id
      || state.world_identity?.world_catalog_digest !== runtime.itemPin.compatible_world_catalog_digest) gap();
    return { state, environment: projectEnvironment(state) };
  }
  function projectEnvironment(state) {
    const environment = state.environment_snapshot;
    const exact = (ref, family) => {
      const matches = records.filter((row) => row.record_id === ref?.id
        && String(row.version) === String(ref?.version) && row.status === 'approved' && row.family_id === family);
      if (matches.length !== 1) gap();
      return matches[0];
    };
    const calendar = exact(environment?.calendar_record_ref, 'calendar_daylight_light_profiles');
    const weather = exact(environment?.weather_record_ref, 'weather_transition_profiles_processes');
    const projected = projectCalendar(state.clock, calendarProfile);
    const minute = Number(BigInt(projected.local_time_of_day.numerator)
      / BigInt(projected.local_time_of_day.denominator));
    return projectApprovedCurrentEnvironment({ calendar_record: calendar,
      weather_record: weather, current_environment: environment,
      calendar_date: { year: Number(projected.year), month: Number(projected.month), day: Number(projected.day) },
      local_minute_of_day: minute });
  }
  return Object.freeze({
    async readCurrentEnvironment(args) { return (await read(args)).environment; },
    async readInitialEnvironment({ transaction, partyId, actorId }) {
      if (typeof transaction?.query !== 'function' || !calendarProfile || !Array.isArray(records)) gap();
      const lifecycle = await transaction.query(`SELECT p.state_version,s.party_id AS session_party_id
        FROM party_runtime.parties p LEFT JOIN party_runtime.party_server_sessions s
          ON s.party_id=p.party_id WHERE p.party_id=$1`, [partyId]);
      if (lifecycle.rows.length !== 1 || Number(lifecycle.rows[0].state_version) !== 0
        || lifecycle.rows[0].session_party_id != null) gap();
      const state = await createLowerDvinaTracePhase1ARepository({
        query: transaction.query.bind(transaction) }).loadInternal(partyId);
      if (state?.request_identity?.party_id !== partyId || state.player?.instance_id !== actorId
        || state.request_identity.world_revision_id !== runtime.itemPin.compatible_world_revision_id
        || state.request_identity.world_catalog_digest !== runtime.itemPin.compatible_world_catalog_digest) gap();
      return projectEnvironment({ clock: state.timestamp,
        environment_snapshot: state.environment_snapshot });
    },
    async readCurrentVisibilityFacts({ transaction, partyId, actorId }) {
      const current = await read({ transaction, partyId });
      if (current.state.actor_id !== actorId) gap();
      const scene = await readCurrentEntityVisibilityScene({ transaction, partyId, actorId,
        pin: runtime.itemPin });
      if (current.state.position?.position_id !== scene.location.scene_position_id) gap();
      return { scene, environment: current.environment };
    },
    async readFactualContext({ transaction, request }) {
      const args = { transaction, partyId: request.party_id };
      const current = await read(args);
      if (current.state.actor_id !== request.actor_id
        || current.state.position?.position_id !== request.source_position_id) gap();
      const digest = canonicalDigest(current);
      return { ok: true, party_id: request.party_id,
        world_revision_id: current.state.world_identity.world_revision_id,
        started_at: current.state.clock, calendar_profile: calendarProfile,
        environment: current.environment,
        async recheck({ transaction: currentTransaction }) {
          return { ok: canonicalDigest(await read({ ...args, transaction: currentTransaction })) === digest,
            code: 'state_version_conflict' };
        } };
    }
  });
}

function gap() { throw serverError('TARGET_CURRENT_FACTUAL_CONTEXT_DATA_GAP',
  'Exact committed target state and approved Temporal records are required.', { status: 409 }); }
