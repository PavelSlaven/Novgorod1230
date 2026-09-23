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
import { buildFirstEntryNaturalCapabilities, readApprovedNaturalFirstEntryAuthoring }
  from './ordinary-materialization-first-entry-natural.js';

/** The existing first-entry owner proposes rows; Spatial P16 remains the writer. */
export function createOrdinaryGeneratedFirstEntryProposal({ profile,
  naturalSourceAuthoring, readNaturalSourceProperty } = {}) {
  if (!profile) throw code('ORDINARY_FIRST_ENTRY_PROVISIONING_INVALID');
  const authoring = readApprovedNaturalFirstEntryAuthoring(naturalSourceAuthoring);
  return async function prepareFirstEntry({ transaction, request, proposal, change_set_id }) {
    const partyId = request.party_id;
    const inserts = proposal.inserts ?? [];
    const site = inserts.find((write) => write.target_table === 'party_g5_sites'
      && write.id === proposal.target_site_id)?.record;
    const scenes = inserts.filter((write) => write.target_table === 'party_g6_instances'
      && write.record.host_id === site?.id && write.record.scene_slot_key === 'main');
    const positions = inserts.filter((write) => write.target_table === 'scene_position_nodes'
      && write.record.g6_instance_id === scenes[0]?.id
      && write.record.template_slot_key === 'focus');
    if (scenes.length !== 1 || positions.length !== 1) {
      throw code('ORDINARY_NATURAL_FIRST_ENTRY_BINDING_INVALID');
    }
    const scene = scenes[0].record;
    const scope = { entity_kind: 'g6', entity_id: scenes[0].id };
    const positionRef = positions[0].id;
    const binding = { g5_id: site.id, world_revision_id: request.g4.world_revision_id,
      g4_id: request.g4.id, g4_version: request.g4.version,
      g5_generation_template_id: site.generated_template_ref?.entity_id,
      g5_generation_template_version: Number(site.generated_template_ref?.authoring_version),
      scene_template_id: scene.source_scene_template_ref?.entity_id,
      scene_template_version: Number(scene.source_scene_template_ref?.authoring_version),
      g6_slot_key: scene.scene_slot_key, position_slot_key: positions[0].record.template_slot_key };
    const build = async (tx) => {
      const naturalCapabilities = await buildFirstEntryNaturalCapabilities({ authoring,
        binding, readProperty: readNaturalSourceProperty, transaction: tx, partyId,
        scope, positionRef, profile, spatialProposal: proposal });
      return buildRows({ profile, partyId, scope, positionRef,
        includeContextBoundCapabilities: false, initialSceneSeed: null, naturalCapabilities,
        itemKind: 'natural_resource_portion', capabilityOnly: true });
    };
    const rows = await build(transaction);
    const scopeKey = `${partyId}:${scope.entity_kind}:${scope.entity_id}`;
    const scoped = { party_id: partyId, scope_kind: scope.entity_kind, scope_id: scope.entity_id };
    const write = (target_table, record, id = scopeKey) => ({ target_table, id, record });
    const writes = [
      write('party_ordinary_materialization_aggregates', { ...scoped,
        state_version: rows.aggregate.state_version, aggregate_payload: rows.aggregate }),
      write('party_ordinary_materialization_contexts', { ...scoped,
        catalog_version: profile.catalog_version, property_version: profile.property_version,
        placement_version: profile.placement_version,
        supporting_basis_catalog_version: rows.basis_catalog_version,
        supporting_basis_catalog_digest: rows.basis_digest,
        property_placement_context_digest: rows.property_digest,
        property_placement_base_snapshot: rows.property_placement_context }),
      ...rows.bases.map((basis) => write('party_ordinary_materialization_basis_catalog', {
        ...scoped, basis_ref: basis.basis_ref, origin_request_identity: null,
        basis_snapshot: basis }, `${scopeKey}:${basis.basis_ref}`)),
      write('party_ordinary_materialization_enablements', { ...scoped,
        objective_snapshot: rows.objective, objective_digest: rows.objective_digest, enabled: true }),
      ...rows.finite_sources.map((source) => write('party_resource_nodes', {
        resource_node_id: source.source_resource_node_id, party_id: partyId,
        source_resource_ref: { entity_kind: 'ordinary_finite_source', entity_id: source.source_resource_node_id },
        position_node_id: source.position_ref, quantity_numerator: source.initial_quantity,
        quantity_denominator: 1, quantity_unit_ref: source.quantity_unit_ref,
        quality_ref: source.quality_ref, access_policy_ref: source.access_policy_ref,
        state_version: 1, created_change_set_id: change_set_id, updated_change_set_id: change_set_id,
        lifecycle_state: 'active', initial_amount_bounds: source.initial_amount_bounds,
        initialization_identity: change_set_id, initial_amount_evidence: null,
        property_basis_ref: source.property_basis_ref }, source.source_resource_node_id))
    ];
    return { ok: true, approved_write_sets: [{ inserts: writes, updates: [], appends: [] }],
      recheck: async ({ transaction: tx }) => {
        if (canonicalDigest(await build(tx)) !== canonicalDigest(rows)) {
          throw code('ORDINARY_FIRST_ENTRY_PROVISIONING_CONFLICT');
        }
        return { ok: true };
      } };
  };
}

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
      for (const source of rows.finite_sources) {
        await insertFirstEntryFiniteSource({ transaction, partyId, changeSetId,
          source });
      }
      await provisionInitialOrdinaryContainer({transaction,partyId,
        firstEntryBinding,loadedProfile:ordinaryContainerContentsProfile});
      return Object.freeze({ provisioned: true, scope_ref: Object.freeze(scope) });
    }
  });
}

function buildRows({ profile, partyId, scope, positionRef,
  includeContextBoundCapabilities, initialSceneSeed, naturalCapabilities = [], itemKind = 'man_made',
  capabilityOnly = false }) {
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
  const capabilities = [...(o2a == null ? [] : [o2a]), ...naturalCapabilities];
  const committedBases = [...(capabilityOnly ? [] : [basis]), ...capabilities.map((entry) => entry.basis)]
    .sort((left, right) =>
    left.basis_ref.localeCompare(right.basis_ref));
  const seedRequestIdentity = initialSceneSeed == null
    ? `${profile.profile_id}:${scope.entity_id}`
    : `system_scene_seed:${profile.profile_id}:${partyId}:${scope.entity_id}:v1`;
  const seedPolicyRefs = { ...profile.policy_refs,
    allowed_supporting_bases: committedBases.map(({ basis_ref }) => ({ basis_ref,
      basis_state: 'committed' })) };
  const property = { schema: 'rus.items.ordinary_world_property_placement_context.v2',
    version: 2, scope_ref: scope, item_kind: itemKind,
    property_catalog_version_ref: `${profile.profile_id}:property-catalog`,
    placement_catalog_version_ref: `${profile.profile_id}:placement-catalog`,
    explicit_item_source_refs: capabilities.map((entry) => entry.basis.basis_ref),
    personal_possession_refs: [], communal_public_service_refs: [],
    container_property_refs: [], occupied_site_refs: capabilityOnly ? [] : [basisRef], unowned_cause_refs: [],
    placement_context_refs: [placementContextRef], property_catalog: [...(capabilityOnly ? [] : [{
      property_basis_ref: propertyBasisRef, state: 'committed', scope_ref: scope,
      basis_class: 'occupied_site_default', source_ref: basisRef,
      unowned_cause_ref: null, unowned_cause_kind: null
    }]), ...capabilities.map((entry) => ({
      property_basis_ref: entry.property_basis_ref, state: 'committed', scope_ref: scope,
      basis_class: 'explicit_source_item', source_ref: entry.basis.basis_ref,
      unowned_cause_ref: null, unowned_cause_kind: null
    }))], placement_catalog: [{ position_ref: positionRef, state: 'committed',
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
      ...(capabilityOnly ? { scope_presence_enabled: false } : {}),
      context_bound_capabilities: capabilities.map((entry) => entry.capability),
      stage_b_classification_eval:
        structuredClone(profile.stage_b_classification_eval),
      candidate_context: { ...structuredClone(profile.execution.candidate_context),
        target_ref: scope.entity_id }, source_refs: [basisRef, propertyBasisRef,
        positionRef, placementContextRef,
        ...bases.map(({ basis_ref }) => basis_ref)].sort() } };
  return { aggregate: seeded.aggregate,
  bases, finite_sources: capabilities.map((entry) => entry.finite_source),
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
