import { NEEDS_CHECK_BLOCKER } from '@rus/runtime-catalog';
import { projectCalendar } from '@rus/time-events-history/calendar';
import { TurnWorkflowError } from '@rus/turn';

export const NEEDS_CHECK_MATERIALIZATION_BLOCKED =
  'TURN_MATERIALIZATION_NEEDS_CHECK_BLOCKED';

/** Turn guard for the immutable snapshot in the turn's pinned catalog context. */
export function createNeedsCheckMaterializationGuard({ resolveRegion,
  calendarProfile } = {}) {
  if (typeof resolveRegion !== 'function' || calendarProfile == null) {
    throw new TypeError('Pinned needs-check materialization context is required.');
  }
  return async function assertAllowed({ committedState, candidate,
    catalogContext } = {}) {
    const context = catalogContext;
    if (context == null || !validPin(context.pin)
        || !validWorldPin(context.world_pin)) {
      throw new TurnWorkflowError('NEEDS_CHECK_BLOCKER_CATALOG_REQUIRED',
        'Pinned runtime catalog context is required.', {
          path: candidate?.path ?? 'undefined', queue_ids: [],
          region: 'undefined', year: 'undefined',
          region_undefined: true, year_undefined: true
        });
    }
    const blockerSnapshot = context?.needs_check_blocker_snapshot ?? null;
    const exactWorldPin = context.world_pin;
    const exactRuntimePin = context.pin;
    if (blockerSnapshot == null) {
      if (context.needs_check_blocker_snapshot_required === true) {
        throw new TurnWorkflowError('NEEDS_CHECK_BLOCKER_CATALOG_REQUIRED',
          'Pinned runtime catalog is missing its needs-check blocker snapshot.',
          { path: candidate?.path ?? 'undefined', queue_ids: [],
            region: 'undefined', year: 'undefined',
            region_undefined: true, year_undefined: true });
      }
      return;
    }
    NEEDS_CHECK_BLOCKER.validateSnapshot(blockerSnapshot);
    const spatialWorldPin = { world_revision_id: exactWorldPin.world_revision_id,
      catalog_digest: exactWorldPin.world_catalog_digest };
    const stateWorld = committedState?.world_identity;
    const sameWorld = stateWorld?.world_revision_id === spatialWorldPin.world_revision_id
      && stateWorld?.world_catalog_digest === spatialWorldPin.catalog_digest;
    let region;
    if (sameWorld) {
      region = await resolveRegion({ committedState, catalogContext: context });
    }
    const clock = committedState?.clock
      ?? committedState?.clock_weather_light?.clock;
    let year;
    if (sameWorld && clock != null) {
      year = Number(projectCalendar(clock, calendarProfile).year);
    }
    const hits = NEEDS_CHECK_BLOCKER.matchesAll({ snapshot: blockerSnapshot, candidate: {
      ...candidate,
      ...(text(region) ? { region } : {}),
      ...(Number.isSafeInteger(year) ? { year } : {})
    } });
    if (hits.length > 0) throw new TurnWorkflowError(
      NEEDS_CHECK_MATERIALIZATION_BLOCKED,
      'Committed needs-check blocker matched a proposed materialization.',
      { path: candidate?.path ?? 'undefined',
        queue_id: hits[0].queue_id,
        queue_ids: hits.map(({ queue_id }) => queue_id),
        region: region ?? 'undefined', year: Number.isSafeInteger(year)
          ? year : 'undefined', region_undefined: !text(region),
        year_undefined: !Number.isSafeInteger(year) });
  };
}

function text(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function validPin(pin) {
  return pin != null && typeof pin === 'object' && !Array.isArray(pin)
    && text(pin.import_id) && text(pin.catalog_digest)
    && text(pin.runtime_contract_digest);
}

function validWorldPin(pin) {
  return pin != null && typeof pin === 'object' && !Array.isArray(pin)
    && text(pin.world_revision_id) && text(pin.world_catalog_digest);
}
