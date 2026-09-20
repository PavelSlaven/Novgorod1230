import {
  applyOrdinaryAggregateTransition,
  canonicalDigest,
  computeOrdinaryIdentityBudget,
  createOrdinaryAggregate,
  validateOrdinaryBackgroundGroup
} from '@rus/materialization';
import {
  ordinaryWorldPropertyPlacementContextDigest
} from '@rus/items-property';
import {
  assertOrdinaryMaterializationRequestV1
} from '@rus/contracts/ordinary-materialization-v1';
import { provisionInitialOrdinaryContainer } from
  './ordinary-container-first-entry-provisioning.js';
import {
  buildFirstEntryContextBoundCapability,
  insertFirstEntryFiniteSource
} from './ordinary-materialization-first-entry-capability.js';

export function createOrdinaryMaterializationFirstEntryProvisioner({
  profile,
  ordinaryContainerContentsProfile = null,
  includeContextBoundCapabilities = true,
  initialSceneSeed = null
} = {}) {
  if (profile == null || typeof profile !== 'object') {
    throw new TypeError('ordinary first-entry provisioning requires a versioned profile');
  }
  return Object.freeze({
    async provision({ transaction, partyId, firstEntryBinding, changeSetId }) {
      if (!transaction?.query || !text(partyId) || !text(firstEntryBinding?.g6_instance_id)
          || !text(firstEntryBinding?.position_id) || !text(changeSetId)) {
        throw code('ORDINARY_FIRST_ENTRY_PROVISIONING_INVALID');
      }
      const scope = { entity_kind: 'g6', entity_id: firstEntryBinding.g6_instance_id };
      const rows = buildRows({ profile, partyId, scope,
        positionRef: firstEntryBinding.position_id,
        includeContextBoundCapabilities, initialSceneSeed });
      const existing = await transaction.query(
        `SELECT e.objective_snapshot,e.objective_digest,e.enabled,
                a.aggregate_payload,a.state_version,c.catalog_version,
                c.property_version,c.placement_version,
                c.supporting_basis_catalog_version,c.supporting_basis_catalog_digest,
                c.property_placement_context_digest,c.property_placement_base_snapshot,
                COALESCE((SELECT jsonb_agg(b.basis_snapshot ORDER BY b.basis_ref)
                  FROM party_runtime.party_ordinary_materialization_basis_catalog b
                  WHERE b.party_id=e.party_id AND b.scope_kind=e.scope_kind
                    AND b.scope_id=e.scope_id), '[]'::jsonb) AS bases
           FROM party_runtime.party_ordinary_materialization_enablements e
           JOIN party_runtime.party_ordinary_materialization_aggregates a
             ON a.party_id=e.party_id AND a.scope_kind=e.scope_kind AND a.scope_id=e.scope_id
           JOIN party_runtime.party_ordinary_materialization_contexts c
             ON c.party_id=e.party_id AND c.scope_kind=e.scope_kind AND c.scope_id=e.scope_id
          WHERE e.party_id=$1 AND e.scope_kind=$2 AND e.scope_id=$3
          FOR UPDATE OF e,a,c`, [partyId, scope.entity_kind, scope.entity_id]);
      if (existing.rowCount === 1) {
        if (!sameExisting(existing.rows[0], rows)) throw code('ORDINARY_FIRST_ENTRY_PROVISIONING_CONFLICT');
        await provisionInitialOrdinaryContainer({transaction,partyId,
          firstEntryBinding,loadedProfile:ordinaryContainerContentsProfile});
        return Object.freeze({ provisioned: false, scope_ref: Object.freeze(scope) });
      }
      await transaction.query(`INSERT INTO party_runtime.party_ordinary_materialization_aggregates
        (party_id,scope_kind,scope_id,state_version,aggregate_payload)
        VALUES ($1,$2,$3,$4,$5::jsonb)`, [partyId, scope.entity_kind, scope.entity_id,
        rows.aggregate.state_version,
        JSON.stringify(rows.aggregate)]);
      await transaction.query(`INSERT INTO party_runtime.party_ordinary_materialization_contexts
        (party_id,scope_kind,scope_id,catalog_version,property_version,placement_version,
         supporting_basis_catalog_version,supporting_basis_catalog_digest,
         property_placement_context_digest,property_placement_base_snapshot)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`, [partyId, scope.entity_kind,
        scope.entity_id, profile.catalog_version, profile.property_version,
        profile.placement_version, rows.basis_catalog_version,
        rows.basis_digest, rows.property_digest,
        JSON.stringify(rows.property_placement_context)]);
      for (const basis of rows.bases) {
        await transaction.query(`INSERT INTO party_runtime.party_ordinary_materialization_basis_catalog
          (party_id,scope_kind,scope_id,basis_ref,origin_request_identity,basis_snapshot)
          VALUES ($1,$2,$3,$4,$5,$6::jsonb)`, [partyId, scope.entity_kind,
          scope.entity_id, basis.basis_ref, null,
          JSON.stringify(basis)]);
      }
      await transaction.query(`INSERT INTO party_runtime.party_ordinary_materialization_enablements
        (party_id,scope_kind,scope_id,objective_snapshot,objective_digest,enabled)
        VALUES ($1,$2,$3,$4::jsonb,$5,TRUE)`, [partyId, scope.entity_kind, scope.entity_id,
        JSON.stringify(rows.objective), rows.objective_digest]);
      if (rows.finite_source != null) {
        await insertFirstEntryFiniteSource({ transaction, partyId, changeSetId,
          source: rows.finite_source });
      }
      await provisionInitialOrdinaryContainer({transaction,partyId,
        firstEntryBinding,loadedProfile:ordinaryContainerContentsProfile});
      return Object.freeze({ provisioned: true, scope_ref: Object.freeze(scope) });
    }
  });
}

function buildRows({ profile, partyId, scope, positionRef,
  includeContextBoundCapabilities, initialSceneSeed }) {
  const basisRef = `${profile.profile_id}:basis`;
  const propertyBasisRef = profile.context_refs?.property_context_ref;
  const placementContextRef = `${profile.profile_id}:placement`;
  const basis = { basis_ref: basisRef, state: 'committed', scope_ref: scope,
    prepared_seed_provenance: null, functional_buckets: ['other_ordinary'],
    allowed_admission_classes: ['common_mundane'] };
  const o2a = includeContextBoundCapabilities
    ? buildFirstEntryContextBoundCapability({
      profile, partyId, scope, positionRef
    })
    : null;
  const committedBases = [basis, ...(o2a == null ? [] : [o2a.basis])]
    .sort((left, right) =>
    left.basis_ref.localeCompare(right.basis_ref));
  const seedRequestIdentity = initialSceneSeed == null
    ? `${profile.profile_id}:${scope.entity_id}`
    : `system_scene_seed:${profile.profile_id}:${partyId}:${scope.entity_id}:v1`;
  const seedPolicyRefs = { ...profile.policy_refs,
    allowed_supporting_bases: committedBases.map(({ basis_ref }) => ({ basis_ref,
      basis_state: 'committed' })) };
  const property = { schema: 'rus.items.ordinary_world_property_placement_context.v2',
    version: 2, scope_ref: scope, item_kind: 'man_made',
    property_catalog_version_ref: `${profile.profile_id}:property-catalog`,
    placement_catalog_version_ref: `${profile.profile_id}:placement-catalog`,
    explicit_item_source_refs: o2a == null ? [] : [o2a.basis.basis_ref],
    personal_possession_refs: [], communal_public_service_refs: [],
    container_property_refs: [], occupied_site_refs: [basisRef], unowned_cause_refs: [],
    placement_context_refs: [placementContextRef], property_catalog: [{
      property_basis_ref: propertyBasisRef, state: 'committed', scope_ref: scope,
      basis_class: 'occupied_site_default', source_ref: basisRef,
      unowned_cause_ref: null, unowned_cause_kind: null
    }, ...(o2a == null ? [] : [{
      property_basis_ref: o2a.property_basis_ref, state: 'committed', scope_ref: scope,
      basis_class: 'explicit_source_item', source_ref: o2a.basis.basis_ref,
      unowned_cause_ref: null, unowned_cause_kind: null
    }])], placement_catalog: [{ position_ref: positionRef, state: 'committed',
      scope_ref: scope, position_kind: 'scene_position', g6_ref: scope.entity_id,
      containment_depth: 1, placement_context_ref: placementContextRef }] };
  const contextRefs = structuredClone(profile.context_refs);
  const seedRequest = { schema: 'ordinary_materialization_request_v1',
      request_id: seedRequestIdentity, mode: 'seed_scope', scope_ref: scope,
      context_refs: contextRefs, policy_refs: seedPolicyRefs,
      ordinary_state: { seeded: false, density_band: null, remaining_identity_budget: 0,
        background_groups: [], presence_resolutions: [], closed_observation_scopes: [] },
      candidate_query: null, technical_limits: structuredClone(profile.technical_limits) };
  try {
    assertOrdinaryMaterializationRequestV1(seedRequest);
  } catch { throw code('ORDINARY_FIRST_ENTRY_PROVISIONING_INVALID'); }
  const initial = createOrdinaryAggregate({ scope_ref: scope,
    resolution_record_cap: profile.technical_limits.max_resolution_records });
  const seeded = seedInitialScene({ profile, request: seedRequest,
    initial, committedBasis: basis, committedBases, initialSceneSeed });
  const bases = [...committedBases, ...seeded.committedSeedBases]
    .sort((left, right) => left.basis_ref.localeCompare(right.basis_ref));
  const policyRefs = { ...seedPolicyRefs,
    allowed_supporting_bases: bases.map(({ basis_ref }) => ({ basis_ref,
      basis_state: 'committed' })) };
  const objective = { request_id: seedRequestIdentity,
    scope_ref: scope, context_refs: contextRefs, policy_refs: policyRefs,
    technical_limits: structuredClone(profile.technical_limits), execution_context: {
      ...structuredClone(profile.execution), supporting_bases: bases,
      context_bound_capabilities: o2a == null ? [] : [o2a.capability],
      stage_b_classification_eval:
        structuredClone(profile.stage_b_classification_eval),
      candidate_context: { ...structuredClone(profile.execution.candidate_context),
        target_ref: scope.entity_id }, source_refs: [basisRef, propertyBasisRef,
        positionRef, placementContextRef,
        ...bases.map(({ basis_ref }) => basis_ref)].sort() } };
  return { aggregate: seeded.aggregate,
  bases, finite_source: o2a?.finite_source ?? null,
  basis_catalog_version: seeded.committedSeedBases.length === 0 ? 0 : 1,
  basis_digest: canonicalDigest({ domain: 'ordinary_supporting_basis_catalog_v1',
    supporting_bases: bases }), property_placement_context: property,
  property_digest: ordinaryWorldPropertyPlacementContextDigest({ ...property,
    supporting_basis_ref: 'phase6_context_digest_only',
    causal_basis_refs: ['phase6_context_digest_only'],
    requested_position_ref: 'phase6_context_digest_only' }), objective,
  objective_digest: canonicalDigest(objective) };
}

function sameExisting(row, expected) {
  return row.enabled === true && row.objective_digest === expected.objective_digest
    && canonicalDigest(row.objective_snapshot) === expected.objective_digest
    && canonicalDigest(row.aggregate_payload) === canonicalDigest(expected.aggregate)
    && Number(row.state_version) === expected.aggregate.state_version
    && Number(row.catalog_version) === 1 && Number(row.property_version) === 1
    && Number(row.placement_version) === 1
    && Number(row.supporting_basis_catalog_version) === expected.basis_catalog_version
    && row.supporting_basis_catalog_digest === expected.basis_digest
    && row.property_placement_context_digest === expected.property_digest
    && canonicalDigest(row.property_placement_base_snapshot)
      === canonicalDigest(expected.property_placement_context)
    && canonicalDigest(row.bases) === canonicalDigest(expected.bases);
}
function seedInitialScene({ profile, request, initial, committedBasis,
  committedBases,
  initialSceneSeed }) {
  if (initialSceneSeed == null) return { aggregate: initial, committedSeedBases: [] };
  if (!text(initialSceneSeed.descriptor)
      || !['sparse', 'ordinary', 'dense'].includes(initialSceneSeed.density_band)) {
    throw code('ORDINARY_FIRST_ENTRY_PROVISIONING_INVALID');
  }
  const disclosure = profile.execution.allowed_disclosure_policy_refs?.[0];
  try {
    const group = validateOrdinaryBackgroundGroup({ request, group: {
      descriptor: initialSceneSeed.descriptor,
      functional_bucket: committedBasis.functional_buckets[0],
      availability_class: 'common',
      allowed_admission_classes: ['common_mundane'],
      causal_basis: { basis_kind: 'scope_bound_ordinary_policy',
        basis_refs: [committedBasis.basis_ref] },
      property_basis_ref: request.context_refs.property_context_ref,
      permission_refs: [], disclosure_policy_ref: disclosure
    }, basis_catalog: committedBases.map((entry) => ({
      ...structuredClone(entry), policy: {
        functional_buckets: structuredClone(entry.functional_buckets),
        allowed_admission_classes:
          structuredClone(entry.allowed_admission_classes),
        permission_refs: structuredClone(entry.permission_refs ?? [])
      }
    })), allowed_disclosure_policy_refs:
      profile.execution.allowed_disclosure_policy_refs });
    const budget = computeOrdinaryIdentityBudget({
      density_band: initialSceneSeed.density_band,
      scope: request.scope_ref,
      function_refs: request.context_refs.function_refs,
      policy: profile.execution.density_policy,
      hard_technical_max: request.technical_limits.max_new_entities
    });
    const aggregate = applyOrdinaryAggregateTransition({ aggregate: initial,
      transition: { kind: 'seed', request_identity: request.request_id,
        expected_state_version: 0, density_band: budget.density_band,
        identity_budget: budget.identity_budget, background_groups: [group] } });
    return { aggregate, committedSeedBases: [{ basis_ref: group.group_ref,
      state: 'committed', scope_ref: structuredClone(group.scope_ref),
      prepared_seed_provenance: null,
      functional_buckets: [group.functional_bucket],
      allowed_admission_classes:
        structuredClone(group.allowed_admission_classes),
      permission_refs: structuredClone(group.permission_refs) }] };
  } catch {
    throw code('ORDINARY_FIRST_ENTRY_PROVISIONING_INVALID');
  }
}
function text(value) { return typeof value === 'string' && value.trim() === value && value.length > 0; }
function code(value) { return Object.assign(new Error(value), { code: value, spatialCode: 'state_version_conflict' }); }
