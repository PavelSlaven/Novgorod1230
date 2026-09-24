import { canonicalDigest, projectApprovedCurrentEnvironment } from '@rus/materialization';
import { projectCalendar } from '@rus/time-events-history/calendar';
import { createLowerDvinaTracePhase2PostgresRepository } from './lower-dvina-trace-phase-2.js';
import { serverError } from '../../errors.js';

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
    return { state, environment: projectApprovedCurrentEnvironment({ calendar_record: calendar,
      weather_record: weather, current_environment: environment,
      calendar_date: { year: Number(projected.year), month: Number(projected.month), day: Number(projected.day) },
      local_minute_of_day: minute }) };
  }
  return Object.freeze({
    async readCurrentEnvironment(args) { return (await read(args)).environment; },
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
