import {
  compareGameTimestamp
} from '@rus/time-events-history';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import {
  resolveSameTimeCascade,
  selectEarliestTemporalBoundaryBatch
} from '@rus/time-events-history/temporal-boundaries';
import {
  collectProviderCandidates,
  cloneFrozen,
  createSlicePlan,
  createSliceResult,
  finalizeResult,
  idempotencyDigests,
  immutableConfiguration,
  normalizeHandlerOutcome,
  normalizeResolution,
  replayCommittedResult,
  validateConfiguration,
  validateRequest
} from './temporal-advance-support.js';

export { advanceTemporalNpcDecisionBoundary } from
  './temporal-npc-decision-boundary.js';
export {
  createNpcActorStepCompletionEffect,
  createNpcScheduleDecisionTerminalEffect,
  NPC_ACTOR_STEP_COMPLETION_EFFECT_REF,
  NPC_SCHEDULE_DECISION_TERMINAL_EFFECT_REF,
  npcScheduleDecisionTransitionId,
  npcTemporalEffectRegistrations,
  npcActorSteps,
  startNpcActorStep,
  domainOwner
} from './temporal-npc-effects.js';

const engines = new WeakSet();

function fail(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = cloneFrozen(details);
  throw error;
}

export function createTemporalAdvanceEngine(configuration) {
  validateConfiguration(configuration);
  const config = immutableConfiguration(configuration);
  const engine = Object.freeze({ advance(rawRequest) { return advance(config, rawRequest); } });
  engines.add(engine);
  return engine;
}

export function isTemporalAdvanceEngine(value) {
  return engines.has(value);
}

export function advanceTemporalBoundaryBatch({ request, engine_version,
  temporal_resolution_policy_version, safety_limits,
  source_provider_ref, source_candidates, registered_provider_ref,
  registered_candidates, apply_continuous, resolve_source_candidate,
  resolve_registered_candidate, finalize,
  stop_after_source_batch = true } = {}) {
  if (!Array.isArray(source_candidates)
      || !Array.isArray(registered_candidates)
      || typeof apply_continuous !== 'function'
      || typeof resolve_source_candidate !== 'function'
      || typeof resolve_registered_candidate !== 'function'
      || typeof finalize !== 'function') {
    throw new TypeError('temporal batch owner requires exact providers and handlers');
  }
  const registeredIds = new Set(registered_candidates.map(
    ({ boundary_id: id }) => id
  ));
  if (registeredIds.size !== registered_candidates.length
      || source_candidates.some(({ boundary_id: id }) =>
        registeredIds.has(id))) {
    throw new TypeError('temporal batch candidate identity is ambiguous');
  }
  const providers = [
    staticProvider(source_provider_ref, source_candidates),
    staticProvider(registered_provider_ref, registered_candidates)
  ];
  let finalProjection = request?.relevant_state_projection;
  const engine = createTemporalAdvanceEngine({
    engine_version,
    temporal_resolution_policy_version,
    safety_limits,
    providers,
    handlers: {
      applyContinuous: apply_continuous,
      resolve(candidate, context) {
        if (registeredIds.has(candidate.boundary_id)) {
          return resolve_registered_candidate(candidate, context);
        }
        const resolved = resolve_source_candidate(candidate, context);
        const sourceBoundaryIds = [
          ...(resolved.state_projection
            ?.processed_source_boundary_ids
            ?? context.projection.processed_source_boundary_ids
            ?? []),
          candidate.boundary_id
        ];
        const normalized = {
          ...resolved,
          state_projection: {
            ...(resolved.state_projection ?? context.projection),
            processed_source_boundary_ids: sourceBoundaryIds
          }
        };
        return stop_after_source_batch
          ? { ...normalized, stop_after_current_batch: true }
          : normalized;
      },
      finalize(input) {
        finalProjection = input.state_projection;
        return finalize(input);
      }
    }
  });
  return Object.freeze({
    result: engine.advance(request),
    state_projection: cloneFrozen(finalProjection)
  });
}

export function createTemporalSourceResolver({ registrations = [] } = {}) {
  if (!Array.isArray(registrations)) {
    throw new TypeError('temporal source registrations must be an array');
  }
  const handlers = new Map();
  for (const registration of registrations) {
    if (typeof registration?.resolve !== 'function') {
      throw new TypeError('temporal source registration requires resolve');
    }
    const identity = sourceIdentity(registration);
    if (handlers.has(identity)) {
      throw new TypeError('temporal source registration is ambiguous');
    }
    handlers.set(identity, registration.resolve);
  }
  return Object.freeze((candidate, context) => {
    const resolve = handlers.get(sourceIdentity(candidate));
    if (resolve == null) {
      throw Object.assign(new Error('temporal source owner is not registered'), {
        code: 'temporal_source_owner_missing',
        details: { boundary_id: candidate?.boundary_id ?? null }
      });
    }
    return resolve(candidate, context);
  });
}

export function createTemporalAdvanceOwner({ source_registrations = [],
  effect_registrations = [] } = {}) {
  const resolveSource = createTemporalSourceResolver({
    registrations: source_registrations
  });
  const effects = new Map();
  const runtimeEffectIds = new Set();
  for (const registration of effect_registrations) {
    if (typeof registration?.resolve !== 'function') {
      throw new TypeError('temporal effect registration requires resolve');
    }
    const identity = effectIdentity(registration.effect_ref);
    if (effects.has(identity)) {
      throw new TypeError('temporal effect registration is ambiguous');
    }
    effects.set(identity, registration.resolve);
    if (registration.runtime_resolution === true) {
      runtimeEffectIds.add(identity);
    } else if (registration.runtime_resolution !== undefined) {
      throw new TypeError('temporal runtime effect policy must be boolean');
    }
  }
  return Object.freeze({
    advance(input = {}) {
      const registeredEffects = input.registered_effects ?? [];
      const byBoundary = new Map();
      for (const effect of registeredEffects) {
        const id = effect?.candidate?.boundary_id;
        if (typeof id !== 'string' || !id || byBoundary.has(id)) {
          throw new TypeError('temporal registered effect is ambiguous');
        }
        effectIdentity(effect.effect_ref);
        byBoundary.set(id, effect);
      }
      const continuousEffects = input.continuous_effects
        ?? (input.continuous_effect == null ? [] : [input.continuous_effect]);
      const finalization = input.finalization;
      if (!Array.isArray(continuousEffects)
          || continuousEffects.length === 0
          || (input.continuous_effects != null
            && input.continuous_effect != null)
          || finalization == null) {
        throw new TypeError('temporal advance owner requires exact effects and finalization');
      }
      return advanceTemporalBoundaryBatch({
        ...input,
        registered_candidates: registeredEffects.map(
          ({ candidate }) => candidate
        ),
        apply_continuous(slice, context) {
          let projection = context.projection;
          const proposals = [];
          for (const effect of continuousEffects) {
            const resolved = resolveEffect(effects, effect, {
              kind: 'continuous', slice,
              context: { ...context, projection }, request: input.request
            });
            proposals.push(...(resolved.proposals ?? []));
            projection = resolved.state_projection;
          }
          return { proposals, state_projection: projection };
        },
        resolve_source_candidate: resolveSource,
        resolve_registered_candidate(candidate, context) {
          const effect = byBoundary.get(candidate.boundary_id);
          if (effect == null) {
            throw new TypeError('temporal registered effect is missing');
          }
          const fixed = resolveEffect(effects, effect, {
            kind: 'boundary', candidate, context, request: input.request
          });
          if (!runtimeEffectIds.has(effectIdentity(effect.effect_ref))) {
            return fixed;
          }
          if (typeof input.resolve_registered_effect !== 'function') {
            throw new TypeError('temporal runtime effect resolver is missing');
          }
          const runtime = input.resolve_registered_effect(Object.freeze({
            candidate: cloneFrozen(candidate), context,
            effect_ref: cloneFrozen(effect.effect_ref),
            descriptor: cloneFrozen(effect.input ?? {}) }));
          if (runtime == null || typeof runtime !== 'object') {
            throw new TypeError('temporal runtime effect result is missing');
          }
          return { ...runtime, proposals: [
            ...(fixed.proposals ?? []), ...(runtime.proposals ?? [])] };
        },
        finalize({ clock_after: clockAfter }) {
          return {
            temporal_status: compareGameTimestamp(
              clockAfter, input.request.inclusive_limit_timestamp
            ) === 0 ? 'completed' : 'paused',
            execution_state_ref: input.request.requested_execution_ref,
            visible_package_candidate:
              finalization.visible_package_candidate,
            validation_report: finalization.validation_report
          };
        }
      });
    }
  });
}

function sourceIdentity(value) {
  const identity = {
    rule_ref: value?.rule_ref,
    policy_ref: value?.policy_ref
  };
  if ([identity.rule_ref, identity.policy_ref].some((entry) =>
        entry == null || typeof entry !== 'object')) {
    throw new TypeError('temporal source identity requires exact refs');
  }
  return computeSpatialV3CanonicalDigest(identity);
}

function effectIdentity(value) {
  if (value == null || typeof value !== 'object') {
    throw new TypeError('temporal effect identity requires an exact ref');
  }
  return computeSpatialV3CanonicalDigest(value);
}

function resolveEffect(registry, effect, context) {
  const resolve = registry.get(effectIdentity(effect.effect_ref));
  if (resolve == null) {
    throw Object.assign(new Error('temporal effect owner is not registered'), {
      code: 'temporal_effect_owner_missing',
      details: { effect_ref: effect.effect_ref }
    });
  }
  return resolve(Object.freeze({ ...context,
    descriptor: cloneFrozen(effect.input ?? {}) }));
}

function staticProvider(providerRef, candidates) {
  return {
    provider_ref: providerRef,
    collect: ({ from_timestamp: from, limit_timestamp: limit }) =>
      candidates.filter(({ scheduled_at: at }) =>
        compareGameTimestamp(at, from) >= 0
        && compareGameTimestamp(at, limit) <= 0)
  };
}

function advance(config, rawRequest) {
  const request = validateRequest(config, rawRequest);
  const digests = idempotencyDigests(request);
  const replay = replayCommittedResult(request, digests);
  if (replay) return replay;

  const processed = new Set();
  const processedBoundaryIds = [];
  const dispositions = [];
  const allProposals = [];
  const timeSliceResults = [];
  const deferredCandidates = [];
  let projection = request.relevant_state_projection;
  let clock = request.clock_before;
  let sliceIndex = 0;
  let stopAfterCurrentBatch = false;

  while (compareGameTimestamp(clock, request.inclusive_limit_timestamp) <= 0) {
    const candidates = collectProviderCandidates(config, request, projection, clock, processed, deferredCandidates);
    const batch = selectEarliestTemporalBoundaryBatch({
      from_timestamp: clock,
      limit_timestamp: request.inclusive_limit_timestamp,
      candidates,
      execution_requires_boundary: request.relevant_state_projection.active_execution_requires_boundary === true
        && processedBoundaryIds.length === 0
    });
    if (!batch && compareGameTimestamp(clock, request.inclusive_limit_timestamp) === 0) break;
    if (++sliceIndex > config.safety_limits.max_slices) {
      fail('temporal_boundary_cycle', 'Temporal advance exceeded its explicit slice limit.');
    }

    const toTimestamp = batch?.scheduled_at ?? request.inclusive_limit_timestamp;
    const plan = createSlicePlan(request, sliceIndex, clock, toTimestamp, batch);
    const sliceProposals = [];
    const sliceDispositions = [];
    const processedCandidates = [];

    if (compareGameTimestamp(clock, toTimestamp) < 0) {
      const continuous = config.handlers.applyContinuous(plan, cloneFrozen({ request, projection }));
      const continuousOutcome = normalizeHandlerOutcome(continuous, 'applyContinuous');
      sliceProposals.push(...continuousOutcome.proposals);
      if (continuousOutcome.state_projection) projection = continuousOutcome.state_projection;
    }

    if (batch) {
      const cascade = resolveSameTimeCascade({
        timestamp: toTimestamp,
        candidates: batch.candidates,
        max_candidates: config.safety_limits.max_candidates,
        max_iterations: config.safety_limits.max_iterations,
        resolveCandidate: (candidate) => {
          const raw = config.handlers.resolve(candidate, cloneFrozen({
            request,
            projection,
            clock_before: toTimestamp,
            slice_plan: plan
          }));
          const resolution = normalizeResolution(raw, candidate, toTimestamp, request, deferredCandidates);
          processed.add(candidate.boundary_id);
          processedBoundaryIds.push(candidate.boundary_id);
          processedCandidates.push(candidate);
          const disposition = { boundary_id: candidate.boundary_id, disposition: resolution.disposition };
          dispositions.push(disposition);
          sliceDispositions.push(disposition);
          sliceProposals.push(...resolution.proposals);
          if (resolution.state_projection) projection = resolution.state_projection;
          stopAfterCurrentBatch ||= resolution.stop_after_current_batch;
          return { follow_up_candidates: resolution.follow_up_candidates };
        }
      });
      if (!cascade.reached_fixed_point) {
        fail('temporal_boundary_cycle', 'Temporal same-time cascade did not reach a fixed point.');
      }
    }

    const sliceResult = createSliceResult(request, plan, sliceProposals, processedCandidates, sliceDispositions);
    timeSliceResults.push(sliceResult);
    allProposals.push(...sliceProposals);
    clock = toTimestamp;
    if (stopAfterCurrentBatch) break;
    if (compareGameTimestamp(clock, request.inclusive_limit_timestamp) === 0) break;
  }

  return finalizeResult(
    config,
    request,
    projection,
    clock,
    allProposals,
    timeSliceResults,
    processedBoundaryIds,
    dispositions,
    deferredCandidates,
    digests,
    stopAfterCurrentBatch
  );
}
