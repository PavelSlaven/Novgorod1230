import { canonicalDigest, assertAndNormalizeOrdinaryAggregate } from '@rus/materialization';
import { assertOrdinaryMaterializationRequestV1 } from '@rus/contracts/ordinary-materialization-v1';

// This is deliberately a server-only loader: it exposes no budget, basis,
// permission, negative-resolution, or objective data to player projections.
export function createPostgresOrdinaryMaterializationEnablementRepository({ pool } = {}) {
  if (!pool?.query) throw new TypeError('ordinary enablement requires a PostgreSQL pool');
  return Object.freeze({
    async load({ partyId, scopeRef }) {
      const result = await pool.query(`SELECT e.objective_snapshot,e.objective_digest,e.enabled,
          p.state_version AS party_state_version,
          a.aggregate_payload,a.state_version AS ordinary_state_version,
          c.catalog_version,c.property_version,c.placement_version,
          c.supporting_basis_catalog_version,c.supporting_basis_catalog_digest,
          c.property_placement_base_snapshot,c.property_placement_context_digest,
          COALESCE((SELECT jsonb_agg(b.basis_snapshot ORDER BY b.basis_ref)
            FROM party_runtime.party_ordinary_materialization_basis_catalog b
            WHERE b.party_id=e.party_id AND b.scope_kind=e.scope_kind AND b.scope_id=e.scope_id), '[]'::jsonb) AS supporting_bases
        FROM party_runtime.party_ordinary_materialization_enablements e
        JOIN party_runtime.parties p ON p.party_id=e.party_id
        JOIN party_runtime.party_ordinary_materialization_aggregates a
          ON a.party_id=e.party_id AND a.scope_kind=e.scope_kind AND a.scope_id=e.scope_id
        JOIN party_runtime.party_ordinary_materialization_contexts c
          ON c.party_id=e.party_id AND c.scope_kind=e.scope_kind AND c.scope_id=e.scope_id
        WHERE e.party_id=$1 AND e.scope_kind=$2 AND e.scope_id=$3`,
        [partyId, scopeRef?.entity_kind, scopeRef?.entity_id]);
      if (result.rowCount !== 1 || result.rows[0].enabled !== true) return null;
      return normalizeEnablement(result.rows[0], scopeRef);
    }
  });
}

export function normalizeOrdinaryMaterializationEnablement(value, scopeRef) {
  return normalizeEnablement(value, scopeRef);
}

function normalizeEnablement(row, scopeRef) {
  if (!scope(scopeRef) || !plain(row?.objective_snapshot)
      || typeof row.objective_digest !== 'string'
      || row.objective_digest !== canonicalDigest(row.objective_snapshot)) {
    throw code('ORDINARY_ENABLEMENT_INVALID');
  }
  if (!exact(row.objective_snapshot, ['request_id', 'scope_ref', 'context_refs',
    'policy_refs', 'technical_limits']) && !exact(row.objective_snapshot,
    ['request_id', 'scope_ref', 'context_refs', 'policy_refs', 'technical_limits',
      'execution_context'])) throw code('ORDINARY_ENABLEMENT_INVALID');
  const { execution_context: executionContext = null, ...objective } = structuredClone(row.objective_snapshot);
  const aggregate = assertAndNormalizeOrdinaryAggregate(row.aggregate_payload);
  if (!sameScope(objective.scope_ref, scopeRef)
      || !sameScope(aggregate.scope_ref, scopeRef)
      || Number(row.ordinary_state_version) !== aggregate.state_version
      || !plain(row.property_placement_base_snapshot)
      || typeof row.property_placement_context_digest !== 'string') {
    throw code('ORDINARY_ENABLEMENT_INVALID');
  }
  const ordinary_state = {
    seeded: aggregate.seeded,
    density_band: aggregate.density_band,
    remaining_identity_budget: aggregate.remaining_identity_budget,
    background_groups: aggregate.background_groups.map(({ group_ref }) => group_ref),
    presence_resolutions: aggregate.presence_resolutions.map(({ resolution_ref }) => resolution_ref),
    closed_observation_scopes: aggregate.closed_observation_scopes.map(({ coverage_key }) => coverage_key)
  };
  try {
    assertOrdinaryMaterializationRequestV1({ schema: 'ordinary_materialization_request_v1',
      request_id: objective.request_id, mode: 'seed_scope', scope_ref: objective.scope_ref,
      context_refs: objective.context_refs, policy_refs: objective.policy_refs,
      ordinary_state, candidate_query: null, technical_limits: objective.technical_limits });
  } catch { throw code('ORDINARY_ENABLEMENT_INVALID'); }
  const version_pins = {
    party_state_version: Number(row.party_state_version ?? 0),
    ordinary_state_version: aggregate.state_version,
    catalog_version: Number(row.catalog_version ?? 0), property_version: Number(row.property_version ?? 0),
    placement_version: Number(row.placement_version ?? 0),
    supporting_basis_catalog_version: Number(row.supporting_basis_catalog_version ?? 0),
    supporting_basis_catalog_digest: row.supporting_basis_catalog_digest ?? canonicalDigest(row.supporting_bases ?? []),
    property_placement_context_digest: row.property_placement_context_digest
  };
  return Object.freeze({ objective_digest: row.objective_digest,
    objective_context: Object.freeze({ ...objective, ordinary_state }),
    ordinary_aggregate: aggregate, ordinary_state_version: aggregate.state_version,
    property_placement_context: structuredClone(row.property_placement_base_snapshot),
    property_placement_context_digest: row.property_placement_context_digest,
    version_pins: Object.freeze(version_pins), execution_context: executionContext == null ? null :
      Object.freeze({ ...structuredClone(executionContext), supporting_bases:
        structuredClone(row.supporting_bases ?? []) }) });
}

function plain(value) { return value != null && typeof value === 'object' && !Array.isArray(value); }
function exact(value, keys) { return plain(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function scope(value) { return plain(value) && value.entity_kind === 'g6' && typeof value.entity_id === 'string' && value.entity_id.length > 0; }
function sameScope(left, right) { return scope(left) && scope(right) && left.entity_kind === right.entity_kind && left.entity_id === right.entity_id; }
function code(value) { return Object.assign(new TypeError(value), { code: value }); }
