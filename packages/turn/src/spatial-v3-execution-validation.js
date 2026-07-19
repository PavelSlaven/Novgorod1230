import { normalizeRational } from '@rus/time-events-history';
import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';

export const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
export const stableId = (value) => typeof value === 'string' && value.trim().length > 0;
export const isRational = (value) => value && Number.isSafeInteger(value.numerator) &&
  Number.isSafeInteger(value.denominator) && value.numerator >= 0 && value.denominator > 0;
export const positiveRational = (value) => isRational(value) && value.numerator > 0;
export const nonNegativeInteger = (value) => Number.isSafeInteger(value) && value >= 0;
export const CLOCK_MODES = new Set(['direct_party_clock', 'shared_root_transport_clock']);

export function hasValidDigest(value) {
  if (!isRecord(value) || typeof value.canonical_digest !== 'string') return false;
  const payload = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'canonical_digest'));
  return value.canonical_digest === computeSpatialV3CanonicalDigest(payload);
}

export const sealedRecord = (value) => isRecord(value) && hasValidDigest(value);
export const sealedPinSet = (value) => sealedRecord(value) && Array.isArray(value.pins) && value.pins.length > 0 && value.pins.every((pin) =>
  isRecord(pin) && typeof pin.dependency_role === 'string' && stableId(pin.entity_ref?.entity_kind) &&
  stableId(pin.entity_ref?.entity_id) && isRecord(pin.version_pin) && stableId(pin.version_pin.pin_kind));
export const sealedEndpoint = (value) => sealedRecord(value) && stableId(value.endpoint_kind) && stableId(value.endpoint_id);
export const sealedContext = (value) => sealedRecord(value) && stableId(value.context_id ?? value.id ?? value.context_kind);
export const sealedExecutionState = (value, required = []) => sealedRecord(value) && required.every((name) => Object.hasOwn(value, name));

const delayIdentity = (delay) => delay?.occurrence_key ?? delay?.occurrence_id;
const delayTime = (delay) => delay?.exact_minutes ?? delay?.delay;

/** Validate only already-resolved, seal-pinned formula sources. */
export function validateResolvedTimeSources(input) {
  const snapshot = input.dynamic_snapshot;
  if (!sealedRecord(snapshot) || !sealedPinSet(input.dynamic_dependency_pins) ||
    !sealedRecord(input.delay_occurrence_history) || !stableId(input.delay_occurrence_history.id) ||
    !Array.isArray(input.delay_occurrence_history.committed_occurrence_keys)) return { ok: false, code: 'time_factor_invalid' };
  const factors = input.resolved_factors ?? snapshot.resolved_factors ?? snapshot.factors ?? [];
  const delays = input.resolved_delays ?? snapshot.resolved_delays ?? snapshot.delays ?? [];
  if (!Array.isArray(factors) || !Array.isArray(delays)) return { ok: false, code: 'time_factor_invalid' };
  const seenFactors = new Set();
  for (const factor of factors) {
    if (!factor || typeof factor.factor_kind !== 'string' || seenFactors.has(factor.factor_kind) ||
      !positiveRational({ numerator: factor.numerator, denominator: factor.denominator }) ||
      !sealedRecord(factor) || !sealedPinSet(factor.source_dependency_pins)) return { ok: false, code: 'time_factor_invalid' };
    seenFactors.add(factor.factor_kind);
  }
  const consumed = new Set(input.delay_occurrence_history.committed_occurrence_keys);
  const seenDelays = new Set();
  for (const delay of delays) {
    const occurrenceKey = delayIdentity(delay);
    const exact = delayTime(delay);
    const scope = delay?.application_scope;
    if (!delay || typeof occurrenceKey !== 'string' || !occurrenceKey || !positiveRational(exact) ||
      !stableId(delay.occurrence_history_id) || delay.occurrence_history_id !== input.delay_occurrence_history.id ||
      !sealedRecord(delay) || !sealedPinSet(delay.source_dependency_pins ?? delay.dependency_pins) ||
      seenDelays.has(occurrenceKey) || consumed.has(occurrenceKey) ||
      (scope != null && !['interval_once', 'segment_once', 'step_once', 'synchronized_slice_once'].includes(scope))) {
      return { ok: false, code: 'time_delay_occurrence_invalid' };
    }
    seenDelays.add(occurrenceKey);
  }
  return { ok: true, factors: structuredClone(factors), delays: structuredClone(delays) };
}

export function canonicalSignals(input) {
  const raw = input.source_signals ?? input.signals;
  return sealedRecord(raw) && sealedPinSet(raw.dependency_pins) ? raw : null;
}

export const normalized = (value) => normalizeRational(value);
