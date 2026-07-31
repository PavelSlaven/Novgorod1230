import { subtractGameTimestamp } from '@rus/time-events-history';
import { carrierInventoryAdmission } from
  './lower-dvina-trace-phase-6-carry-inventory.js';
import {
  REPLACEMENT,
  actorMap,
  exactResources,
  requiredActor,
  requiredSelectedActor
} from './lower-dvina-trace-phase-6-carry-support.js';

export const PHASE6_PROGRESS_EFFECT_REF = versioned(
  'temporal_effect', 'activity-progress', '1'
);
export const PHASE6_REBIND_EFFECT_REF = versioned(
  'temporal_effect', 'lower-dvina-trace-carrier-rebind', '1'
);

export function lowerDvinaTracePhase6TemporalEffectRegistrations() {
  return [{ effect_ref: PHASE6_PROGRESS_EFFECT_REF,
    resolve: resolveProgress }, {
    effect_ref: PHASE6_REBIND_EFFECT_REF,
    resolve: resolveCarrierRebinding
  }];
}

function resolveProgress({ slice, context }) {
  return {
    proposals: [{
      proposal_id: `${slice.slice_id}:phase6-progress`,
      write_target: `activity-progress:${slice.slice_id}`
    }],
    state_projection: {
      ...context.projection,
      cumulative_elapsed_minutes:
        context.projection.cumulative_elapsed_minutes
        + integerElapsed(slice.from_timestamp, slice.to_timestamp)
    }
  };
}

function resolveCarrierRebinding({ candidate, context, descriptor }) {
  const projection = context.projection;
  const state = projection.phase6_state;
  if (projection.cumulative_elapsed_minutes
      < descriptor.boundary.elapsed_minutes) {
    fail('TRACE_PHASE_6_INTERNAL_BOUNDARY_EARLY');
  }
  const bodyDue = descriptor.body_effect_already_committed !== true;
  try {
    const actors = actorMap(state);
    const onisim = requiredActor(actors, 'onisim_boatman',
      descriptor.source_anchor_id);
    const replacement = requiredSelectedActor(state, actors, REPLACEMENT,
      descriptor.source_anchor_id);
    const resources = exactResources({ state, actors, onisim,
      prior: descriptor.prior });
    const eremey = requiredActor(actors, 'eremey_fisher',
      descriptor.source_anchor_id);
    const ratsha = requiredActor(actors, 'ratsha_storehouse_helper',
      descriptor.source_anchor_id);
    carrierInventoryAdmission({ state, resources,
      prior: descriptor.prior,
      cumulativeBefore: descriptor.cumulative_before,
      rebindRequired: true,
      initialCarrierIds: descriptor.initial_carrier_ids,
      reboundCarrierIds: [eremey.instance_id, ratsha.instance_id,
        replacement.instance_id],
      replacementBoundary: descriptor.boundary });
    return {
      disposition: 'execute',
      proposals: [{
        proposal_id: `carrier-rebind:${candidate.boundary_id}`,
        write_target: `carrier-group:${candidate.source_ref.entity_id}`
      }],
      state_projection: { ...projection,
        internal_rebinding_applied_in_window: true,
        player_body_effect_due_in_window: bodyDue,
        active_carrier_ids: [eremey.instance_id, ratsha.instance_id,
          replacement.instance_id] },
      follow_up_candidates: []
    };
  } catch (error) {
    if ((projection.processed_source_boundary_ids ?? []).length === 0) {
      throw error;
    }
    return {
      disposition: 'cancel',
      proposals: [{
        proposal_id: `carrier-rebind-cancel:${candidate.boundary_id}`,
        write_target: `carrier-group:${candidate.source_ref.entity_id}`
      }],
      state_projection: { ...projection,
        internal_rebinding_applied_in_window: false,
        player_body_effect_due_in_window: bodyDue,
        active_carrier_ids: descriptor.initial_carrier_ids,
        internal_rebinding_blocked_by: error.code
          ?? 'TRACE_PHASE_6_REBIND_ADMISSION_FAILED' },
      follow_up_candidates: []
    };
  }
}

function integerElapsed(from, to) {
  const exact = subtractGameTimestamp(to, from);
  if (exact.denominator !== '1') {
    fail('TRACE_PHASE_6_TEMPORAL_FRACTION_GAP');
  }
  const value = Number(exact.numerator);
  if (!Number.isSafeInteger(value) || value < 0) {
    fail('TRACE_PHASE_6_TEMPORAL_INTERVAL_INVALID');
  }
  return value;
}

function versioned(entityKind, entityId, authoringVersion) {
  return { entity_ref: { entity_kind: entityKind, entity_id: entityId },
    authoring_version: authoringVersion };
}

function fail(code) {
  throw Object.assign(new Error(code), { code });
}
