import {
  assertAndNormalizeOrdinaryAggregate
} from '@rus/materialization';
import {
  normalizeOrdinaryAggregateIdentity,
  normalizeOrdinaryAggregateMutation
} from '@rus/party-store/ordinary-materialization';

export function createPostgresOrdinaryMaterializationAggregateStore() {
  return Object.freeze({
    async load({ transaction, ...input } = {}) {
      requireTransaction(transaction);
      const identity = normalizeOrdinaryAggregateIdentity(input);
      const result = await transaction.query(
        `SELECT state_version,aggregate_payload
         FROM party_runtime.party_ordinary_materialization_aggregates
         WHERE party_id=$1 AND scope_kind=$2 AND scope_id=$3`,
        [identity.party_id, identity.scope_ref.entity_kind, identity.scope_ref.entity_id]
      );
      if (result.rows.length === 0) return Object.freeze({ status: 'unseeded' });
      if (result.rows.length !== 1) throw storeError('ORDINARY_AGGREGATE_ROW_INVALID', 'Exact aggregate identity returned multiple rows.');
      const aggregate = assertAndNormalizeOrdinaryAggregate(result.rows[0].aggregate_payload);
      if (aggregate.scope_ref.entity_kind !== identity.scope_ref.entity_kind
          || aggregate.scope_ref.entity_id !== identity.scope_ref.entity_id
          || aggregate.state_version !== safeVersion(result.rows[0].state_version)) {
        throw storeError('ORDINARY_AGGREGATE_ROW_INVALID', 'Persisted aggregate scope or state version is inconsistent with its row.');
      }
      return Object.freeze({ status: 'present', aggregate });
    },

    async compareAndSet({ transaction, ...input } = {}) {
      requireTransaction(transaction);
      const mutation = normalizeOrdinaryAggregateMutation(input);
      const aggregate = assertAndNormalizeOrdinaryAggregate(mutation.aggregate);
      if (aggregate.scope_ref.entity_kind !== mutation.scope_ref.entity_kind
          || aggregate.scope_ref.entity_id !== mutation.scope_ref.entity_id
          || aggregate.state_version !== mutation.expected_state_version + 1) {
        throw storeError('ORDINARY_AGGREGATE_MUTATION_INVALID', 'Aggregate does not satisfy the exact CAS identity and version relation.');
      }
      const values = [
        mutation.party_id, mutation.scope_ref.entity_kind, mutation.scope_ref.entity_id,
        aggregate.state_version, aggregate
      ];
      if (mutation.expected_state_version === 0) {
        const inserted = await transaction.query(
          `INSERT INTO party_runtime.party_ordinary_materialization_aggregates
             (party_id,scope_kind,scope_id,state_version,aggregate_payload)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (party_id,scope_kind,scope_id) DO NOTHING
           RETURNING state_version`,
          values
        );
        return inserted.rowCount === 1
          ? Object.freeze({ status: 'committed', state_version: aggregate.state_version })
          : Object.freeze({ status: 'stale' });
      }
      const updated = await transaction.query(
        `UPDATE party_runtime.party_ordinary_materialization_aggregates
           SET state_version=$4,aggregate_payload=$5
         WHERE party_id=$1 AND scope_kind=$2 AND scope_id=$3 AND state_version=$6
         RETURNING state_version`,
        [...values, mutation.expected_state_version]
      );
      return updated.rowCount === 1
        ? Object.freeze({ status: 'committed', state_version: aggregate.state_version })
        : Object.freeze({ status: 'stale' });
    }
  });
}

function requireTransaction(transaction) {
  if (!transaction || typeof transaction.query !== 'function') throw storeError('ORDINARY_AGGREGATE_TRANSACTION_REQUIRED', 'An active PostgreSQL transaction is required.');
}
function safeVersion(value) {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 0) throw storeError('ORDINARY_AGGREGATE_ROW_INVALID', 'Persisted state version is invalid.');
  return version;
}
function storeError(code, message) { return Object.assign(new Error(message), { code }); }
