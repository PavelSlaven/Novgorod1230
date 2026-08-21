import {
  addElapsedTime,
  compareGameTimestamp
} from '@rus/time-events-history';
import {
  selectEarliestTemporalBoundaryBatch
} from '@rus/time-events-history/temporal-boundaries';
import { serverError } from '../errors.js';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { PHASE6_PROGRESS_EFFECT_REF } from
  './lower-dvina-trace-phase-6-temporal-effect-owner.js';
import { buildTracePhase7TemporalRequest,
  TRACE_PHASE7_EXTERNAL_PROVIDER,TRACE_PHASE7_PROVIDER,
  tracePhase7TemporalVisibleEnvelope } from
  './lower-dvina-trace-phase-7-temporal-request.js';
import { localFireTemporalCandidateFromRuntime,
  localFireTemporalRuntimeFromPlan } from
  './lower-dvina-trace-local-fire-temporal.js';

export function createTracePhase2TemporalAdvance({ contracts,
  temporalAdvanceOwner }) {
  if (contracts.activity.nearest_temporal_boundary_rule
      !== 'split_before_earliest_boundary') {
    throw temporalError('TRACE_PHASE_2_TEMPORAL_POLICY_MISMATCH');
  }
  return async function advance({
    clock_before: clockBefore,
    exact_elapsed: exactElapsed,
    relevant_state: state,local_fire_atomic_write_plans:actorPlans=[],
    root_turn_id:rootTurnId='turn:prepared'
  }) {
    const window = inspectTracePhase2TemporalWindow({
      contracts,
      state,
      clockBefore,
      exactElapsed
    });
    const sourceCandidates=[...(state.temporal_boundary_candidates??[])];
    const localFireRuntime=structuredClone(state.local_fire_runtime??[]);
    for(const raw of actorPlans){
      const runtime=localFireTemporalRuntimeFromPlan(raw);
      const after=runtime.process_state;
      if(after.status!=='active')continue;
      localFireRuntime.push(runtime);
      sourceCandidates.push(localFireTemporalCandidateFromRuntime(runtime));
    }
    if(window.ok&&sourceCandidates.length===0)return basicResult(
      clockBefore,window.clock_after,exactElapsed,window.candidate_count);
    if(typeof temporalAdvanceOwner?.advance!=='function')
      throw temporalError('TRACE_PHASE_2_TEMPORAL_OWNER_MISSING');
    const executionId=`activity:${state.party_id}:${rootTurnId}:prepared`;
    const projection={calendar_profile_ref:calendarProfileRef(),
      active_execution_refs:[{entity_kind:'party_timed_activity_execution',
        entity_id:executionId}],active_execution_requires_boundary:false,
      available_event_ids:sourceCandidates.map(({boundary_id:id})=>id),
      cumulative_elapsed_minutes:0,processed_source_boundary_ids:[],
      local_fire_runtime:localFireRuntime};
    const request=buildTracePhase7TemporalRequest({state,contracts:null,
      executionId,limit:window.clock_after,commandIdempotencyKey:
        `${rootTurnId}:prepared`,rootTurnId,clockBefore,
      sourceCandidates,projection,segment:'prepared'});
    const advanced=temporalAdvanceOwner.advance({request,
      engine_version:'lower-dvina-trace-prepared-temporal-v1',
      temporal_resolution_policy_version:'temporal-resolution-v1',
      safety_limits:{max_slices:100,max_candidates:500,max_iterations:500},
      source_provider_ref:TRACE_PHASE7_EXTERNAL_PROVIDER,
      source_candidates:sourceCandidates,
      registered_provider_ref:TRACE_PHASE7_PROVIDER,registered_effects:[],
      continuous_effect:{effect_ref:PHASE6_PROGRESS_EFFECT_REF,input:{}},
      finalization:{visible_package_candidate:
        tracePhase7TemporalVisibleEnvelope(request),
        validation_report:{ok:true}},stop_after_source_batch:false});
    if(compareGameTimestamp(advanced.result.clock_after,window.clock_after)!==0)
      throw temporalError('TRACE_PHASE_2_TEMPORAL_BOUNDARY_REQUIRES_RESOLUTION');
    const plans=advanced.result.combined_change_set.proposals.flatMap(
      (proposal)=>proposal.local_fire_atomic_write_plans??[]);
    return {
      clock_before: clockBefore,
      clock_after: advanced.result.clock_after,
      exact_elapsed: exactElapsed,
      nearest_boundary: null,
      local_fire_atomic_write_plans:plans,
      boundary_trace: {
        owner: '@rus/time-events-history/temporal-boundaries',
        policy:
          contracts.activity.nearest_temporal_boundary_rule,
        evaluated_candidate_count: window.candidate_count,
        processed_boundary_ids: advanced.result.trace.processed_boundary_ids
      }
    };
  };
}

function basicResult(clockBefore,clockAfter,exactElapsed,count){return{
  clock_before:clockBefore,clock_after:clockAfter,exact_elapsed:exactElapsed,
  nearest_boundary:null,boundary_trace:{owner:
    '@rus/time-events-history/temporal-boundaries',
    policy:'split_before_earliest_boundary',evaluated_candidate_count:count,
    processed_boundary_ids:[]}};}
function calendarProfileRef(){const value={profile_ref:versioned(
  'calendar_profile','lower-dvina-trace-calendar','1')};return{...value,
  canonical_digest:computeSpatialV3CanonicalDigest(value)};}
function versioned(entityKind,entityId,authoringVersion){return{entity_ref:{
  entity_kind:entityKind,entity_id:entityId},authoring_version:authoringVersion};}

export function inspectTracePhase2TemporalWindow({
  contracts,
  state,
  clockBefore = state.clock_weather_light?.clock ?? state.clock,
  exactElapsed = {
    exact_minutes: {
      numerator: String(contracts.activity.duration_minutes),
      denominator: '1'
    }
  }
}) {
  assertTemporalSourceProof(
    state.temporal_source_proof,
    state.temporal_boundary_candidates ?? []
  );
  const clockAfter = addElapsedTime(clockBefore, exactElapsed);
  const candidates =
    structuredClone(state.temporal_boundary_candidates ?? []);
  const nearest = selectEarliestTemporalBoundaryBatch({
    from_timestamp: clockBefore,
    limit_timestamp: clockAfter,
    candidates,
    execution_requires_boundary: false
  });
  return {
    ok: nearest == null
      || compareGameTimestamp(nearest.scheduled_at, clockAfter) > 0,
    clock_after: clockAfter,
    nearest_boundary: nearest,
    candidate_count: candidates.length
  };
}

function assertTemporalSourceProof(proof, candidates) {
  const legacy = proof?.version === 1
      && proof.schema
        === 'lower_dvina_trace_phase_2_temporal_source_proof';
  const current = proof?.version === 2
    && proof.schema === 'lower_dvina_trace_temporal_source_proof'
    && proof.admission_policy
      === 'pass_exact_candidates_to_temporal_activity_owner'
    && Array.isArray(proof.candidates)
    && proof.candidate_count === proof.candidates.length
    && JSON.stringify(proof.candidates) === JSON.stringify(candidates);
  if ((!legacy && !current)
      || proof.owner !== '@rus/time-events-history/temporal-boundaries'
      || proof.same_time_cascade_owner
        !== '@rus/time-events-history/temporal-boundaries:resolveSameTimeCascade'
      || !Number.isInteger(proof.pending_event_count)
      || !Number.isInteger(proof.active_schedule_count)
      || !Number.isInteger(proof.candidate_count)
      || (legacy && (proof.admission_policy
          !== 'fail_closed_before_activity_when_unbound_candidate_exists'
        || proof.pending_event_count !== 0
        || proof.active_schedule_count !== 0
        || proof.candidate_count !== 0))) {
    throw temporalError('TRACE_PHASE_2_TEMPORAL_SOURCE_UNPROVEN');
  }
}

function temporalError(code, details = {}) {
  return serverError(
    code,
    'Pinned Phase 2 temporal boundary cannot be resolved by this phase.',
    { status: 409, details }
  );
}
