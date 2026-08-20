import { canonicalDigest } from '@rus/materialization';
import {
  exact,
  fail,
  sameText,
  sameTextList,
  text
} from './ordinary-materialization-phase-6-commit-internal.js';

const ITEM_SCHEMA = 'ordinary_existing_container_item_proposal_v1';
const EVIDENCE_SCHEMA =
  'rus.items.ordinary_existing_container_property_placement_evidence.v1';
const ITEM_FIELDS = ['item_id','request_identity','candidate_key','coverage_key',
  'category_key','context_version','functional_bucket','admission_class',
  'supporting_basis_ref','causal_basis_refs','causal_basis_kind','condition_state',
  'permission_refs','property_basis_ref','mechanics_policy_ref','container_id',
  'item_proposal','mechanics_snapshot','runtime_mechanics_snapshot'];
const PROPOSAL_FIELDS = ['schema','request_id','scope_ref','candidate_key',
  'coverage_key','context_version','semantic_descriptor','supporting_basis_ref',
  'causal_basis_kind','condition_state','property_basis_ref',
  'property_placement_evidence','placement',
  'runtime_item_mechanics_policy_ref'];
const EVIDENCE_FIELDS = ['schema','version','scope_ref','container_id',
  'property_basis_ref','property_context_ref','owner_controller_ref',
  'property_placement_context_digest','property_catalog_version_ref',
  'placement_catalog_version_ref'];
const BASIS_KINDS = new Set(['personal_possession','stored_supply',
  'communal_or_service','waste_or_scrap','remnant','finite_source',
  'ambient_source','local_natural_feature']);

export function validateOrdinaryContainerBatchItem({
  item, plan, aggregate, bases, container
}) {
  item = exact(item, ITEM_FIELDS);
  ['item_id','request_identity','candidate_key','coverage_key','category_key',
    'context_version','functional_bucket','admission_class',
    'supporting_basis_ref','property_basis_ref','mechanics_policy_ref',
    'container_id'].forEach((key) => text(item[key]));
  if (item.container_id !== container.container_id
      || item.admission_class === 'container_capable'
      || !sameTextList(item.causal_basis_refs,
        [...item.causal_basis_refs].sort())
      || !sameTextList(item.permission_refs,
        [...item.permission_refs].sort())
      || !(item.causal_basis_kind === null
        || BASIS_KINDS.has(item.causal_basis_kind))
      || !['serviceable','damaged'].includes(item.condition_state)
      || (item.condition_state === 'damaged'
        && item.causal_basis_kind !== 'remnant')) {
    fail('ORDINARY_CONTAINER_BATCH_ITEM_INVALID');
  }
  const resolution = aggregate.presence_resolutions.find((entry) =>
    entry.request_identity === item.request_identity);
  if (!resolution || resolution.resolution !== 'materialize'
      || resolution.candidate_key !== item.candidate_key
      || resolution.coverage_key !== item.coverage_key
      || resolution.category_key !== item.category_key
      || resolution.context_version !== item.context_version
      || resolution.identity_key !== `ordinary_identity_${canonicalDigest({
        candidate_key:item.candidate_key,coverage_key:item.coverage_key,
        context_version:item.context_version }).slice(0,24)}`
      || item.item_id !== `ordinary_item_${canonicalDigest({
        party_id:plan.party_id,scope_ref:plan.scope_ref,
        candidate_key:item.candidate_key,coverage_key:item.coverage_key,
        context_version:item.context_version }).slice(0,24)}`) {
    fail('ORDINARY_CONTAINER_BATCH_ITEM_INVALID');
  }
  const supporting = [item.supporting_basis_ref,...item.causal_basis_refs];
  if (!supporting.every((ref) => bases.some((basis) =>
    basis.basis_ref === ref
    && basis.functional_buckets.includes(item.functional_bucket)
    && basis.allowed_admission_classes.includes(item.admission_class)
    && sameTextList(basis.permission_refs ?? [], item.permission_refs)))) {
    fail('ORDINARY_CONTAINER_BATCH_BASIS_INVALID');
  }
  validateProposal(item, plan.scope_ref, container);
  validateSnapshots(item);
  return item;
}

export function ordinaryContainerRuntimeItemState(item, changeSetId = null) {
  const descriptor = item.item_proposal.semantic_descriptor;
  return {
    lifecycle_status:'active',
    runtime_instance_mechanics_snapshot:item.runtime_mechanics_snapshot,
    ordinary_metadata:{ semantic_type:descriptor.semantic_type,
      name:descriptor.name,origin:{ kind:'ordinary_container_contents',
        source_refs:item.mechanics_snapshot.provenance.source_refs },
      semantic_facts:descriptor.facts,operation_history:[] },
    property_state:{ property_basis_ref:item.property_basis_ref,
      property_placement_evidence:
        item.item_proposal.property_placement_evidence },
    ...(changeSetId == null ? {} : { created_change_set_id:changeSetId })
  };
}

function validateSnapshots(item) {
  const proof = exact(item.mechanics_snapshot,
    ['schema','version','provenance','mechanics']);
  const provenance = exact(proof.provenance, ['source_kind','causal_ref',
    'request_id','candidate_key','coverage_key','context_version','policy_ref',
    'source_refs']);
  const runtime = exact(item.runtime_mechanics_snapshot,
    ['schema','version','provenance','mechanics']);
  const runtimeProvenance = exact(runtime.provenance, ['source_kind',
    'root_turn_id','step_index','operation_ref','origin_kind','source_refs']);
  if (proof.schema !== 'rus.items.runtime_instance_mechanics_snapshot.v2'
      || proof.version !== 2
      || provenance.source_kind !== 'ordinary_world_materialization'
      || provenance.request_id !== item.request_identity
      || provenance.candidate_key !== item.candidate_key
      || provenance.coverage_key !== item.coverage_key
      || provenance.context_version !== item.context_version
      || provenance.policy_ref !== item.mechanics_policy_ref
      || !sameText(provenance.causal_ref)
      || !sameTextList(provenance.source_refs,
        [...provenance.source_refs].sort())
      || runtime.schema !== 'rus.items.runtime_instance_mechanics_snapshot.v1'
      || runtime.version !== 1
      || runtimeProvenance.source_kind !== 'ordinary_world_materialization'
      || runtimeProvenance.origin_kind !== 'existing_container_ordinary'
      || !sameTextList(runtimeProvenance.source_refs,
        [...runtimeProvenance.source_refs].sort())
      || canonicalDigest(runtimeProvenance.source_refs)
        !== canonicalDigest(provenance.source_refs)
      || canonicalDigest(runtime.mechanics) !== canonicalDigest(proof.mechanics)) {
    fail('ORDINARY_CONTAINER_BATCH_MECHANICS_INVALID');
  }
}

function validateProposal(item, scope, container) {
  const proposal = exact(item.item_proposal, PROPOSAL_FIELDS);
  const evidence = exact(proposal.property_placement_evidence,
    EVIDENCE_FIELDS);
  const placement = exact(proposal.placement, ['container_id']);
  const descriptor = exact(proposal.semantic_descriptor,
    ['semantic_type','name','facts']);
  if (proposal.schema !== ITEM_SCHEMA || proposal.request_id !== item.request_identity
      || canonicalDigest(proposal.scope_ref) !== canonicalDigest(scope)
      || proposal.candidate_key !== item.candidate_key
      || proposal.coverage_key !== item.coverage_key
      || proposal.context_version !== item.context_version
      || proposal.supporting_basis_ref !== item.supporting_basis_ref
      || proposal.causal_basis_kind !== item.causal_basis_kind
      || proposal.condition_state !== item.condition_state
      || proposal.property_basis_ref !== item.property_basis_ref
      || proposal.runtime_item_mechanics_policy_ref !== item.mechanics_policy_ref
      || placement.container_id !== container.container_id
      || evidence.schema !== EVIDENCE_SCHEMA || evidence.version !== 1
      || canonicalDigest(evidence.scope_ref) !== canonicalDigest(scope)
      || evidence.container_id !== container.container_id
      || evidence.property_basis_ref !== item.property_basis_ref
      || ![evidence.property_context_ref,evidence.owner_controller_ref,
        evidence.property_placement_context_digest,
        evidence.property_catalog_version_ref,
        evidence.placement_catalog_version_ref,
        descriptor.semantic_type,descriptor.name]
        .every((entry) => sameText(entry))
      || !sameTextList(descriptor.facts, [...descriptor.facts].sort())) {
    fail('ORDINARY_CONTAINER_BATCH_ITEM_INVALID');
  }
}
