import { canonicalDigest } from '@rus/materialization';
import { ordinaryArmamentWeaponDanger } from '@rus/combat-health';
import { propertyPlacementBaseDigest } from
  './ordinary-materialization-property-evidence.js';

const MAX = Number.MAX_SAFE_INTEGER;

export class OrdinaryMaterializationCommitError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'OrdinaryMaterializationCommitError';
    this.code = code;
  }
}

export function clonePhase6Data(value) {
  const seen = new WeakSet();
  const visit = (entry) => {
    if (entry === null || typeof entry === 'string' || typeof entry === 'boolean'
        || (typeof entry === 'number' && Number.isFinite(entry))) return entry;
    const array = Array.isArray(entry);
    if (!entry || typeof entry !== 'object' || seen.has(entry)
        || Object.getPrototypeOf(entry) !== (array ? Array.prototype : Object.prototype)
        || Object.getOwnPropertySymbols(entry).length) fail('ORDINARY_PHASE6_PLAN_INVALID');
    seen.add(entry);
    const output = array ? [] : {};
    for (const key of Object.getOwnPropertyNames(entry)) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(entry, key);
      if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
        fail('ORDINARY_PHASE6_PLAN_INVALID');
      }
      if (array) {
        if (key !== String(output.length)) fail('ORDINARY_PHASE6_PLAN_INVALID');
        output.push(visit(descriptor.value));
      } else output[key] = visit(descriptor.value);
    }
    return output;
  };
  return visit(value);
}

export function ownData(value, key) {
  if (!value || typeof value !== 'object') return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor?.enumerable === true && Object.hasOwn(descriptor, 'value')
    ? descriptor.value : undefined;
}

export function exact(value, keys) {
  if (!plain(value) || Object.keys(value).length !== keys.length
      || keys.some((key) => !Object.hasOwn(value, key))) fail('ORDINARY_PHASE6_PLAN_INVALID');
  return value;
}

export function phase6Keys(value, sealed) {
  const keys=['party_id','scope_ref',...(Object.hasOwn(value,'semantic_target_ref')?['semantic_target_ref']:[]),'request_identity','input_digest','transition_digest','expected_versions','expected_supporting_basis_catalog','new_prepared_bases','next_supporting_basis_catalog','next_supporting_basis_catalog_version','next_supporting_basis_catalog_digest','expected_property_placement_context',...(Object.hasOwn(value,'enablement_pin')?['enablement_pin']:[]),...(Object.hasOwn(value,'finite_resource_transition')?['finite_resource_transition']:[]),...(Object.hasOwn(value,'finite_resource_initialization')?['finite_resource_initialization']:[]),'resolution','transitions','next_aggregate','item'];
  return sealed ? ['schema',...keys,'write_plan_digest'] : keys;
}

export function validTransitionShape(value) {
  return plain(value) && typeof value.kind === 'string'
    && typeof value.request_identity === 'string'
    && Number.isSafeInteger(value.expected_state_version)
    && value.expected_state_version >= 0;
}

export function exactAdmittedItem({ item, scope, request_identity }) {
  const proposal = exactOrNull(item.item_proposal, ['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','condition_state','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref'])
    ?? exactOrNull(item.item_proposal, ['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','causal_basis_kind','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref'])
    ?? exactOrNull(item.item_proposal, ['schema','request_id','scope_ref','candidate_key','coverage_key','context_version','semantic_descriptor','supporting_basis_ref','property_basis_ref','property_placement_evidence','placement','runtime_item_mechanics_policy_ref']);
  const snapshot = exactOrNull(item.mechanics_snapshot, ['schema','version','provenance','mechanics']);
  if (!proposal || !snapshot || !['ordinary_world_item_proposal_v1',
      'ordinary_world_item_proposal_v2','ordinary_world_item_proposal_v3']
    .includes(proposal.schema)
      || proposal.request_id !== request_identity || !sameScope(proposal.scope_ref, scope)
      || !sameText(proposal.candidate_key, item.candidate_key)
      || !sameText(proposal.coverage_key, item.coverage_key)
      || !sameText(proposal.context_version, item.context_version)
      || !sameText(proposal.supporting_basis_ref, item.supporting_basis_ref)
      || (proposal.schema === 'ordinary_world_item_proposal_v2'
        ? proposal.causal_basis_kind !== item.causal_basis_kind
        : proposal.schema === 'ordinary_world_item_proposal_v3'
          ? proposal.causal_basis_kind !== item.causal_basis_kind
            || proposal.condition_state !== item.condition_state
            || !['serviceable','damaged'].includes(item.condition_state)
            || (item.condition_state === 'damaged'
              && item.causal_basis_kind !== 'remnant')
          : item.causal_basis_kind != null || item.condition_state != null)
      || !sameText(proposal.property_basis_ref, item.property_basis_ref)
      || !sameText(proposal.runtime_item_mechanics_policy_ref, item.mechanics_policy_ref)
      || !semanticDescriptor(proposal.semantic_descriptor)
      || (item.admission_class === 'weapon_or_armament'
        ? ordinaryArmamentWeaponDanger(item.weapon_mechanics_snapshot) == null
          || item.weapon_mechanics_snapshot.condition_state
            !== item.condition_state
        : item.weapon_mechanics_snapshot != null)) return false;
  const placement = exactOrNull(proposal.placement, ['scope_ref','position_ref']);
  const runtimePlacement = exactOrNull(item.runtime_placement, ['anchor_id']);
  const evidence = exactOrNull(proposal.property_placement_evidence, ['schema','version','scope_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref','property_basis_ref','property_basis_class','property_source_ref','unowned_cause_ref','placement_context_ref','placement'])
    ?? exactOrNull(proposal.property_placement_evidence, ['schema','version','property_context_version','scope_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref','property_basis_ref','property_basis_class','property_source_ref','unowned_cause_ref','unowned_cause_kind','placement_context_ref','placement']);
  if (!placement || placement.scope_ref !== scope.entity_id || placement.position_ref !== item.position_ref
      || !runtimePlacement || !sameText(runtimePlacement.anchor_id)
      || !evidence || !((evidence.schema === 'rus.items.ordinary_world_property_placement_evidence.v2'
        && evidence.version === 2)
        || (evidence.schema === 'rus.items.ordinary_world_property_placement_evidence.v3'
          && evidence.version === 3 && evidence.property_context_version === 2))
      || !sameScope(evidence.scope_ref, scope)
      || evidence.property_basis_ref !== item.property_basis_ref
      || !sameText(evidence.property_placement_context_digest)
      || !sameText(evidence.property_catalog_version_ref)
      || !sameText(evidence.placement_catalog_version_ref)
      || !sameText(evidence.property_basis_class) || !sameText(evidence.property_source_ref)
      || !(evidence.unowned_cause_ref === null || sameText(evidence.unowned_cause_ref))
      || !sameText(evidence.placement_context_ref)
      || !samePlacementEvidence(evidence.placement, scope, item.position_ref)) return false;
  const provenance = exactOrNull(snapshot.provenance, ['source_kind','causal_ref','request_id','candidate_key','coverage_key','context_version','policy_ref','source_refs']);
  const mechanics = exactOrNull(snapshot.mechanics, ['mass_grams','external_hand_cost','carry_form','packing_slot_cost','quantity','container']);
  const quantity = mechanics && exactOrNull(mechanics.quantity, ['value','unit']);
  const expectedSources = [...new Set([
    item.candidate_key, item.coverage_key, item.supporting_basis_ref,
    ...item.causal_basis_refs, ...(item.permission_refs ?? []),
    item.property_basis_ref, item.position_ref,
    item.mechanics_policy_ref, evidence.property_source_ref,
    evidence.property_catalog_version_ref, evidence.placement_catalog_version_ref,
    evidence.placement_context_ref, evidence.property_placement_context_digest,
    ...(evidence.unowned_cause_ref === null ? [] : [evidence.unowned_cause_ref])
  ])].sort();
  return snapshot.schema === 'rus.items.runtime_instance_mechanics_snapshot.v2'
    && snapshot.version === 2 && provenance
    && provenance.source_kind === 'ordinary_world_materialization'
    && sameText(provenance.causal_ref) && provenance.request_id === request_identity
    && provenance.candidate_key === item.candidate_key
    && provenance.coverage_key === item.coverage_key
    && provenance.context_version === item.context_version
    && provenance.policy_ref === item.mechanics_policy_ref
    && sameTextList(provenance.source_refs, expectedSources) && mechanics
    && Number.isSafeInteger(mechanics.mass_grams) && mechanics.mass_grams >= 1
    && [0, 1, 2].includes(mechanics.external_hand_cost)
    && ['compact', 'regular', 'long', 'bulky'].includes(mechanics.carry_form)
    && Number.isSafeInteger(mechanics.packing_slot_cost) && mechanics.packing_slot_cost >= 0
    && quantity && Number.isSafeInteger(quantity.value) && quantity.value >= 1
    && quantity.unit === 'item' && mechanics.container === null;
}

export function normalizeSupportingBases(value, scope, aggregate, preparedOnly) {
  if (!Array.isArray(value)) fail('ORDINARY_PHASE6_BASIS_CATALOG_INVALID');
  const bases = value.map((basis) => {
    const normalized = exactOrNull(basis, ['basis_ref','state','scope_ref','prepared_seed_provenance','functional_buckets','allowed_admission_classes'])
      ?? exactOrNull(basis, ['basis_ref','state','scope_ref','prepared_seed_provenance','functional_buckets','allowed_admission_classes','permission_refs'])
      ?? exactOrNull(basis, ['basis_ref','state','scope_ref','prepared_seed_provenance','functional_buckets','allowed_admission_classes','permission_refs','basis_kind']);
    if (!normalized || !sameText(normalized.basis_ref)
        || !['committed', 'prepared_seed'].includes(normalized.state)
        || !sameScope(normalized.scope_ref, scope)
        || !sameTextList(normalized.functional_buckets, [...normalized.functional_buckets].sort())
        || !sameTextList(normalized.allowed_admission_classes, [...normalized.allowed_admission_classes].sort())
        || (Object.hasOwn(normalized, 'permission_refs')
          && !sameTextList(normalized.permission_refs,
            [...normalized.permission_refs].sort()))
        || (Object.hasOwn(normalized, 'basis_kind')
          && !['personal_possession','stored_supply','communal_or_service',
            'waste_or_scrap','remnant','finite_source','ambient_source',
            'local_natural_feature'].includes(normalized.basis_kind))
        || (preparedOnly && normalized.state !== 'prepared_seed')) {
      fail('ORDINARY_PHASE6_BASIS_CATALOG_INVALID');
    }
    if (normalized.state === 'committed') {
      if (normalized.prepared_seed_provenance !== null) fail('ORDINARY_PHASE6_BASIS_CATALOG_INVALID');
    } else {
      const provenance = exactOrNull(normalized.prepared_seed_provenance, ['seed_request_id','mode','candidate_query']);
      const group = aggregate.background_groups.find((entry) => entry?.group_ref === normalized.basis_ref);
      if (!provenance || provenance.mode !== 'seed_scope' || provenance.candidate_query !== null
          || !group || !sameScope(group.scope_ref, scope)
          || group.functional_bucket !== normalized.functional_buckets[0]
          || !sameTextList(group.allowed_admission_classes, normalized.allowed_admission_classes)
          || canonicalDigest(group.prepared_seed_provenance) !== canonicalDigest(provenance)) {
        fail('ORDINARY_PHASE6_BASIS_CATALOG_INVALID');
      }
    }
    return normalized;
  });
  if (new Set(bases.map((basis) => basis.basis_ref)).size !== bases.length) {
    fail('ORDINARY_PHASE6_BASIS_CATALOG_INVALID');
  }
  return bases.sort((left, right) => left.basis_ref.localeCompare(right.basis_ref));
}

export function basisDigest(bases) {
  return canonicalDigest({ domain: 'ordinary_supporting_basis_catalog_v1', supporting_bases: bases });
}

export function basisCoversItem(bases, item) {
  const permissions = item.permission_refs == null ? []
    : Array.isArray(item.permission_refs) ? item.permission_refs : null;
  if (!permissions || !sameTextList(permissions, [...permissions].sort())) {
    return false;
  }
  const contextBound = item.admission_class !== 'common_mundane',
    finiteSource = item.causal_basis_kind === 'finite_source';
  const itemBasisRefs = new Set([item.supporting_basis_ref,
    ...item.causal_basis_refs]);
  const finiteBasis = bases.some((basis) => itemBasisRefs.has(basis.basis_ref)
    && basis.basis_kind === 'finite_source');
  if (finiteBasis !== finiteSource) return false;
  return [item.supporting_basis_ref, ...item.causal_basis_refs].every((ref) =>
    bases.some((basis) => basis.basis_ref === ref
      && basis.functional_buckets.includes(item.functional_bucket)
      && basis.allowed_admission_classes.includes(item.admission_class)
      && sameTextList(basis.permission_refs ?? [], permissions)
      && (!(contextBound || finiteSource)
        || basis.basis_kind === item.causal_basis_kind)));
}

export function normalizePropertyPlacementBase(value, scope) {
  const base = exactOrNull(value, ['scope_ref','item_kind','property_catalog_version_ref',
    'placement_catalog_version_ref','personal_communal_refs','occupied_site_refs',
    'unowned_cause_refs','placement_context_refs','property_catalog','placement_catalog'])
    ?? exactOrNull(value, ['schema','version','scope_ref','item_kind',
      'property_catalog_version_ref','placement_catalog_version_ref',
      'explicit_item_source_refs','personal_possession_refs',
      'communal_public_service_refs','container_property_refs',
      'occupied_site_refs','unowned_cause_refs','placement_context_refs',
      'property_catalog','placement_catalog']);
  if (!base || (Object.hasOwn(base, 'schema')
      && (base.schema !== 'rus.items.ordinary_world_property_placement_context.v2'
        || base.version !== 2)) || !sameScope(base.scope_ref, scope)
      || !['man_made','natural_resource_portion'].includes(base.item_kind)
      || !sameText(base.property_catalog_version_ref)
      || !sameText(base.placement_catalog_version_ref)) {
    fail('ORDINARY_PHASE6_PROPERTY_PLACEMENT_CONTEXT_INVALID');
  }
  const digest = propertyPlacementBaseDigest(base);
  if (!sameText(digest)) fail('ORDINARY_PHASE6_PROPERTY_PLACEMENT_CONTEXT_INVALID');
  return base;
}

export function sameText(value, expected = undefined) {
  return typeof value === 'string' && value.trim() === value && value.length > 0
    && (expected === undefined || value === expected);
}

export function sameTextList(value, expected) {
  return Array.isArray(value) && value.length === expected.length
    && value.every((entry, index) => sameText(entry) && entry === expected[index])
    && new Set(value).size === value.length;
}

export function safeVersion(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0 || number > MAX) {
    fail('ORDINARY_PHASE6_PERSISTED_VERSION_INVALID');
  }
  return number;
}

export function freezePhase6Data(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const item of Object.values(value)) freezePhase6Data(item);
    Object.freeze(value);
  }
  return value;
}

export function text(value) {
  if (!sameText(value)) fail('ORDINARY_PHASE6_PLAN_INVALID');
}

export function version(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX) fail('ORDINARY_PHASE6_PLAN_INVALID');
}

export function fail(code, message) {
  throw new OrdinaryMaterializationCommitError(code, message);
}

function exactOrNull(value, keys) {
  return plain(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key)) ? value : null;
}

function plain(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}
function sameScope(value, expected) {
  const scope = exactOrNull(value, ['entity_kind','entity_id']);
  return scope?.entity_kind === expected.entity_kind && scope.entity_id === expected.entity_id;
}
function samePlacementEvidence(value, scope, positionRef) {
  const placement = exactOrNull(value, ['scope_ref','position_ref']);
  return !!placement && placement.scope_ref === scope.entity_id && placement.position_ref === positionRef;
}

function semanticDescriptor(value) {
  const descriptor = exactOrNull(value, ['semantic_type','name','facts']);
  return !!descriptor && sameText(descriptor.semantic_type) && sameText(descriptor.name)
    && sameTextList(descriptor.facts, [...descriptor.facts].sort());
}
