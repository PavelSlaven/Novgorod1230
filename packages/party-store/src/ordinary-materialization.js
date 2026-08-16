import { deepFreeze } from '@rus/kernel';
import { assertAndNormalizeOrdinaryAggregate } from '@rus/materialization';

const SCOPE_KINDS = new Set(['g6', 'scene_position', 'container', 'source']);

export class OrdinaryAggregateStoreError extends Error {
  constructor(code, message) { super(message); this.name = 'OrdinaryAggregateStoreError'; this.code = code; }
}

export function normalizeOrdinaryAggregateIdentity(input) {
  const party_id = text(input?.party_id, 'ORDINARY_AGGREGATE_PARTY_INVALID', 'party_id');
  const scope_ref = input?.scope_ref;
  if (!scope_ref || typeof scope_ref !== 'object' || Array.isArray(scope_ref) || Object.keys(scope_ref).length !== 2 || !Object.hasOwn(scope_ref, 'entity_kind') || !Object.hasOwn(scope_ref, 'entity_id') || !SCOPE_KINDS.has(scope_ref.entity_kind)) throw new OrdinaryAggregateStoreError('ORDINARY_AGGREGATE_SCOPE_INVALID', 'scope_ref must be an exact supported ordinary aggregate scope.');
  return deepFreeze({ party_id, scope_ref: { entity_kind: scope_ref.entity_kind, entity_id: text(scope_ref.entity_id, 'ORDINARY_AGGREGATE_SCOPE_INVALID', 'scope_ref.entity_id') } });
}

export function normalizeOrdinaryAggregateMutation(input) {
  const identity = normalizeOrdinaryAggregateIdentity(input);
  const expected_state_version = version(input?.expected_state_version, 'ORDINARY_AGGREGATE_EXPECTED_VERSION_INVALID');
  const aggregate = assertAndNormalizeOrdinaryAggregate(input?.aggregate);
  if (aggregate?.scope_ref?.entity_kind !== identity.scope_ref.entity_kind || aggregate?.scope_ref?.entity_id !== identity.scope_ref.entity_id || aggregate.state_version !== expected_state_version + 1) throw new OrdinaryAggregateStoreError('ORDINARY_AGGREGATE_VERSION_RELATION_INVALID', 'aggregate scope and next state version must match the CAS request.');
  return deepFreeze({ ...identity, expected_state_version, aggregate });
}

export function createOrdinaryAggregateStore({ load, compareAndSet } = {}) {
  if (typeof load !== 'function' || typeof compareAndSet !== 'function') throw new OrdinaryAggregateStoreError('ORDINARY_AGGREGATE_PORT_INVALID', 'load and compareAndSet ports are required.');
  return Object.freeze({
    async load(input) { return normalizeLoadResult(await load(normalizeOrdinaryAggregateIdentity(input))); },
    async compareAndSet(input) { const mutation = normalizeOrdinaryAggregateMutation(input); return normalizeCasResult(await compareAndSet(mutation), mutation); }
  });
}

function normalizeLoadResult(value) {
  if (value?.status === 'unseeded' && Object.keys(value).length === 1) return deepFreeze({ status: 'unseeded' });
  if (value?.status === 'present' && Object.keys(value).length === 2) return deepFreeze({ status: 'present', aggregate: assertAndNormalizeOrdinaryAggregate(value.aggregate) });
  throw new OrdinaryAggregateStoreError('ORDINARY_AGGREGATE_LOAD_RESULT_INVALID', 'Load port returned an invalid ordinary aggregate result.');
}
function normalizeCasResult(value, mutation) {
  if (value?.status === 'committed' && Object.keys(value).length === 2 && value.state_version === mutation.aggregate.state_version) return deepFreeze({ status: 'committed', state_version: value.state_version });
  if (value?.status === 'stale' && Object.keys(value).length === 1) return deepFreeze({ status: 'stale' });
  throw new OrdinaryAggregateStoreError('ORDINARY_AGGREGATE_CAS_RESULT_INVALID', 'CAS port returned an invalid ordinary aggregate result.');
}
function text(value, code, label) { if (typeof value !== 'string' || value.length === 0 || /(?:^[\t\n\v\f\r ]|[\t\n\v\f\r ]$|[\p{Cc}])/u.test(value)) throw new OrdinaryAggregateStoreError(code, `${label} must be a non-empty stable identifier without edge whitespace or control characters.`); return value; }
function version(value, code) { if (!Number.isSafeInteger(value) || value < 0) throw new OrdinaryAggregateStoreError(code, 'expected_state_version must be a non-negative safe integer.'); return value; }
