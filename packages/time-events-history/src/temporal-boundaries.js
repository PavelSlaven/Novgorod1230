import { deepFreeze } from '@rus/kernel';
import {
  compareGameTimestamp,
  normalizeGameTimestamp
} from './index.js';

export const TEMPORAL_RESOLUTION_POLICY_VERSION = 'temporal-resolution-v1';
export const TEMPORAL_RESOLUTION_ORDER = Object.freeze([
  'continuous_finalize',
  'cooccurring_fact',
  'physical_hazard_access',
  'execution_outcome',
  'npc_schedule',
  'perception_knowledge',
  'reaction_decision',
  'propagation_background',
  'interruption_terminal'
]);

const resolutionOrdinal = new Map(TEMPORAL_RESOLUTION_ORDER.map((value, index) => [value, index]));

export class TemporalBoundaryError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'TemporalBoundaryError';
    this.code = code;
    this.details = deepFreeze(structuredClone(details));
  }
}

function boundaryError(code, message, details) {
  throw new TemporalBoundaryError(code, message, details);
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stableId(value) {
  return typeof value === 'string' && value.trim() === value && value.length > 0;
}

function entityRef(value) {
  return record(value) && stableId(value.entity_kind) && stableId(value.entity_id);
}

function compareText(left, right) {
  return String(left).localeCompare(String(right), 'en');
}

function compareEntityRefs(left, right) {
  return compareText(left.entity_kind, right.entity_kind) || compareText(left.entity_id, right.entity_id);
}

function normalizeEntityRefSet(value, field, boundaryId) {
  if (!Array.isArray(value) || value.some((entry) => !entityRef(entry))) {
    boundaryError('generated_schema_mismatch', `${field} must be an entity_ref array`, { boundary_id: boundaryId, field });
  }
  const sorted = value.map((entry) => ({ entity_kind: entry.entity_kind, entity_id: entry.entity_id })).sort(compareEntityRefs);
  if (new Set(sorted.map((entry) => `${entry.entity_kind}\u0000${entry.entity_id}`)).size !== sorted.length) {
    boundaryError('temporal_boundary_ambiguous', `${field} contains a duplicate entity_ref`, { boundary_id: boundaryId, field });
  }
  return sorted;
}

function normalizeCandidate(value) {
  if (!record(value)) boundaryError('generated_schema_mismatch', 'Temporal boundary candidate must be an object');
  if (!stableId(value.boundary_id) || !stableId(value.idempotency_key)) {
    boundaryError('generated_schema_mismatch', 'Temporal boundary candidate requires stable boundary_id and idempotency_key');
  }
  if (!entityRef(value.source_ref) || !entityRef(value.primary_subject_ref) || !entityRef(value.scope_ref)) {
    boundaryError('generated_schema_mismatch', 'Temporal boundary candidate requires typed source, primary subject and scope refs', { boundary_id: value.boundary_id });
  }
  if (!resolutionOrdinal.has(value.resolution_class)) {
    boundaryError('controlled_vocabulary_gap', 'Temporal resolution class is not registered', {
      boundary_id: value.boundary_id,
      resolution_class: value.resolution_class
    });
  }
  const candidate = structuredClone(value);
  candidate.scheduled_at = normalizeGameTimestamp(candidate.scheduled_at);
  candidate.subject_refs = normalizeEntityRefSet(candidate.subject_refs ?? [], 'subject_refs', candidate.boundary_id);
  candidate.causal_parent_refs = normalizeEntityRefSet(candidate.causal_parent_refs ?? [], 'causal_parent_refs', candidate.boundary_id);
  return candidate;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (record(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function compareCandidates(left, right) {
  return compareGameTimestamp(left.scheduled_at, right.scheduled_at)
    || resolutionOrdinal.get(left.resolution_class) - resolutionOrdinal.get(right.resolution_class)
    || compareText(left.rule_ref?.entity_ref?.entity_id, right.rule_ref?.entity_ref?.entity_id)
    || compareText(left.primary_subject_ref.entity_id, right.primary_subject_ref.entity_id)
    || compareText(left.boundary_id, right.boundary_id);
}

export function normalizeTemporalBoundaryCandidates(candidates) {
  if (!Array.isArray(candidates)) boundaryError('generated_schema_mismatch', 'Temporal boundary candidates must be an array');
  const byBoundaryId = new Map();
  const boundaryIdByIdempotencyKey = new Map();
  for (const rawCandidate of candidates) {
    const candidate = normalizeCandidate(rawCandidate);
    const canonical = canonicalJson(candidate);
    const previous = byBoundaryId.get(candidate.boundary_id);
    if (previous && previous.canonical !== canonical) {
      boundaryError('temporal_boundary_ambiguous', 'One boundary identity has conflicting immutable definitions', { boundary_id: candidate.boundary_id });
    }
    const idempotencyOwner = boundaryIdByIdempotencyKey.get(candidate.idempotency_key);
    if (idempotencyOwner && idempotencyOwner !== candidate.boundary_id) {
      boundaryError('temporal_boundary_ambiguous', 'One idempotency key belongs to multiple boundary identities', {
        boundary_id: candidate.boundary_id,
        conflicting_boundary_id: idempotencyOwner
      });
    }
    if (!previous) byBoundaryId.set(candidate.boundary_id, { candidate, canonical });
    boundaryIdByIdempotencyKey.set(candidate.idempotency_key, candidate.boundary_id);
  }
  return deepFreeze([...byBoundaryId.values()].map(({ candidate }) => candidate).sort(compareCandidates));
}

export function selectEarliestTemporalBoundaryBatch({
  from_timestamp,
  limit_timestamp,
  candidates,
  execution_requires_boundary = false
} = {}) {
  const from = normalizeGameTimestamp(from_timestamp);
  const limit = normalizeGameTimestamp(limit_timestamp);
  if (compareGameTimestamp(limit, from) < 0) {
    boundaryError('time_window_invalid', 'Temporal boundary limit cannot precede the current timestamp');
  }
  const eligible = normalizeTemporalBoundaryCandidates(candidates).filter(({ scheduled_at }) => (
    compareGameTimestamp(scheduled_at, from) >= 0 && compareGameTimestamp(scheduled_at, limit) <= 0
  ));
  if (eligible.length === 0) {
    if (execution_requires_boundary) {
      boundaryError('temporal_execution_unbounded', 'A positive temporal execution requires a finite completion or recheck boundary');
    }
    return null;
  }
  const scheduledAt = eligible[0].scheduled_at;
  const batchCandidates = eligible.filter(({ scheduled_at }) => compareGameTimestamp(scheduled_at, scheduledAt) === 0);
  return deepFreeze({
    batch_id: `${TEMPORAL_RESOLUTION_POLICY_VERSION}:${scheduledAt.whole_minutes}:${scheduledAt.subminute_numerator}/${scheduledAt.subminute_denominator}`,
    scheduled_at: scheduledAt,
    is_current_timestamp_batch: compareGameTimestamp(scheduledAt, from) === 0,
    resolution_policy_version: TEMPORAL_RESOLUTION_POLICY_VERSION,
    candidates: batchCandidates
  });
}

function addCausalEdge(graph, parentId, childId) {
  if (parentId === childId || pathExists(graph, childId, parentId)) {
    boundaryError('temporal_boundary_cycle', 'Same-time temporal causal graph contains a cycle', {
      parent_boundary_id: parentId,
      child_boundary_id: childId
    });
  }
  const children = graph.get(parentId) ?? new Set();
  children.add(childId);
  graph.set(parentId, children);
}

function pathExists(graph, fromId, targetId, seen = new Set()) {
  if (fromId === targetId) return true;
  if (seen.has(fromId)) return false;
  seen.add(fromId);
  return [...(graph.get(fromId) ?? [])].some((childId) => pathExists(graph, childId, targetId, seen));
}

function registerCausalEdges(graph, candidate) {
  for (const parent of candidate.causal_parent_refs) {
    if (parent.entity_kind === 'temporal_boundary_candidate') addCausalEdge(graph, parent.entity_id, candidate.boundary_id);
  }
}

export function resolveSameTimeCascade({
  timestamp,
  candidates,
  resolveCandidate,
  max_candidates = 10_000,
  max_iterations = 10_000
} = {}) {
  const scheduledAt = normalizeGameTimestamp(timestamp);
  if (typeof resolveCandidate !== 'function') boundaryError('generated_schema_mismatch', 'resolveCandidate must be a pure function');
  if (!Number.isSafeInteger(max_candidates) || max_candidates <= 0 || !Number.isSafeInteger(max_iterations) || max_iterations <= 0) {
    boundaryError('generated_schema_mismatch', 'Cascade safety limits must be positive safe integers');
  }

  const initial = normalizeTemporalBoundaryCandidates(candidates);
  if (initial.some((candidate) => compareGameTimestamp(candidate.scheduled_at, scheduledAt) !== 0)) {
    boundaryError('time_window_invalid', 'Every same-time cascade candidate must use the cascade timestamp');
  }

  const graph = new Map();
  const byBoundaryId = new Map(initial.map((candidate) => [candidate.boundary_id, candidate]));
  const boundaryIdByIdempotencyKey = new Map(initial.map((candidate) => [candidate.idempotency_key, candidate.boundary_id]));
  for (const candidate of initial) registerCausalEdges(graph, candidate);

  const pending = [...initial];
  const processedIds = new Set();
  const processedCandidates = [];
  const resolutions = [];
  let iterations = 0;

  while (pending.length > 0) {
    if (++iterations > max_iterations || byBoundaryId.size > max_candidates) {
      boundaryError('temporal_boundary_cycle', 'Same-time cascade exceeded its explicit safety bound without reaching a fixed point', {
        max_candidates,
        max_iterations
      });
    }
    pending.sort(compareCandidates);
    const current = pending.shift();
    if (processedIds.has(current.boundary_id)) continue;
    const resolution = resolveCandidate(deepFreeze(structuredClone(current)));
    if (!record(resolution)) {
      boundaryError('temporal_change_set_conflict', 'Boundary resolver must return an explicit result object', { boundary_id: current.boundary_id });
    }
    processedIds.add(current.boundary_id);
    processedCandidates.push(current);
    resolutions.push(deepFreeze(structuredClone(resolution)));

    const followUps = resolution.follow_up_candidates ?? [];
    if (!Array.isArray(followUps)) {
      boundaryError('temporal_change_set_conflict', 'follow_up_candidates must be an array', { boundary_id: current.boundary_id });
    }
    for (const followUp of normalizeTemporalBoundaryCandidates(followUps)) {
      if (compareGameTimestamp(followUp.scheduled_at, scheduledAt) !== 0) {
        boundaryError('time_window_invalid', 'A same-time resolver emitted a candidate at another timestamp', { boundary_id: followUp.boundary_id });
      }
      registerCausalEdges(graph, followUp);
      const existing = byBoundaryId.get(followUp.boundary_id);
      if (existing && canonicalJson(existing) !== canonicalJson(followUp)) {
        boundaryError('temporal_boundary_ambiguous', 'A resolver redefined an existing boundary identity', { boundary_id: followUp.boundary_id });
      }
      const idempotencyOwner = boundaryIdByIdempotencyKey.get(followUp.idempotency_key);
      if (idempotencyOwner && idempotencyOwner !== followUp.boundary_id) {
        boundaryError('temporal_boundary_ambiguous', 'A resolver reused an idempotency key for another boundary', {
          boundary_id: followUp.boundary_id,
          conflicting_boundary_id: idempotencyOwner
        });
      }
      if (!existing) {
        byBoundaryId.set(followUp.boundary_id, followUp);
        boundaryIdByIdempotencyKey.set(followUp.idempotency_key, followUp.boundary_id);
        pending.push(followUp);
      }
    }
  }

  return deepFreeze({
    timestamp: scheduledAt,
    candidates: processedCandidates,
    resolutions,
    reached_fixed_point: true,
    iteration_count: iterations
  });
}
