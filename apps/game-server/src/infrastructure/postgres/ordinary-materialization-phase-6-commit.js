import { canonicalDigest, assertAndNormalizeOrdinaryAggregate, applyOrdinaryAggregateTransition } from '@rus/materialization';
import { planFiniteResourceDecrement } from '@rus/items-property/finite-resource-transition';
import {
  OrdinaryMaterializationCommitError,
  basisCoversItem,
  basisDigest,
  clonePhase6Data,
  exact,
  exactAdmittedItem,
  fail,
  freezePhase6Data,
  normalizeSupportingBases,
  normalizePropertyPlacementBase,
  propertyPlacementBaseDigest,
  propertyPlacementEvidenceMatches,
  safeVersion,
  sameText,
  sameTextList,
  text,
  validTransitionShape,
  version
} from './ordinary-materialization-phase-6-commit-internal.js';
import { applyFiniteResourceInitializationInTransaction, applyFiniteResourceTransitionInTransaction, validateFiniteResourceTransition } from './ordinary-materialization-finite-resource-persistence.js';

const RESOLUTIONS = new Set(['materialize', 'absent', 'no_change', 'authority_required']);
export { OrdinaryMaterializationCommitError };

export function createOrdinaryMaterializationAtomicWritePlan(value = {}) {
  value = clonePhase6Data(value);
  if (Object.hasOwn(value, 'schema') || Object.hasOwn(value, 'write_plan_digest')) {
    exact(value, phase6Keys(value, true));
    if (value.schema !== 'ordinary_materialization_atomic_write_plan_v1' || !sameText(value.write_plan_digest)) fail('ORDINARY_PHASE6_PLAN_INVALID');
    const { schema, write_plan_digest, ...raw } = value, normalized = createOrdinaryMaterializationAtomicWritePlan(raw);
    if (normalized.write_plan_digest !== write_plan_digest) fail('ORDINARY_PHASE6_PLAN_INVALID');
    return normalized;
  }
  exact(value, phase6Keys(value, false));
  const scope = exact(value.scope_ref, ['entity_kind','entity_id']), pins = exact(value.expected_versions, ['party_state_version','ordinary_state_version','catalog_version','property_version','placement_version','supporting_basis_catalog_version','supporting_basis_catalog_digest','property_placement_context_digest']);
  text(value.party_id); text(scope.entity_kind); text(scope.entity_id); text(value.request_identity); text(value.input_digest); text(value.transition_digest); text(pins.supporting_basis_catalog_digest); text(pins.property_placement_context_digest); Object.entries(pins).filter(([key])=>!key.endsWith('_digest')).forEach(([,entry])=>version(entry));
  if (!RESOLUTIONS.has(value.resolution)) fail('ORDINARY_PHASE6_PLAN_INVALID');
  const aggregate = assertAndNormalizeOrdinaryAggregate(value.next_aggregate), history = aggregate.committed_request_fingerprints.at(-1), resolution = aggregate.presence_resolutions.at(-1);
  if (!Array.isArray(value.transitions) || ![1,2].includes(value.transitions.length) || value.transitions.some((transition)=>!validTransitionShape(transition)) || value.transitions.at(-1).kind !== 'resolve_presence' || value.transitions.at(-1).request_identity !== value.request_identity || (value.transitions.length===2 && value.transitions[0].kind!=='seed') || aggregate.scope_ref.entity_kind !== scope.entity_kind || aggregate.scope_ref.entity_id !== scope.entity_id || aggregate.state_version !== pins.ordinary_state_version + value.transitions.length || !history || history.request_identity !== value.request_identity || history.transition_digest !== value.transition_digest || !resolution || resolution.request_identity !== value.request_identity || resolution.resolution !== value.resolution) fail('ORDINARY_PHASE6_TRANSITION_INVALID');
  const expectedBases = normalizeSupportingBases(value.expected_supporting_basis_catalog, scope, aggregate, false);
  const newBases = normalizeSupportingBases(value.new_prepared_bases, scope, aggregate, true);
  const bases = normalizeSupportingBases(value.next_supporting_basis_catalog, scope, aggregate, false);
  const nextBasisVersion = pins.supporting_basis_catalog_version + (newBases.length ? 1 : 0);
  const nextBasisDigest = basisDigest(bases);
  const propertyPlacement = normalizePropertyPlacementBase(
    value.expected_property_placement_context, scope);
  const enablementPin = value.enablement_pin == null ? null : exact(value.enablement_pin,
    ['objective_digest','enabled']);
  if (enablementPin != null && (!sameText(enablementPin.objective_digest)
      || enablementPin.enabled !== true)) fail('ORDINARY_PHASE6_ENABLEMENT_PIN_INVALID');
  if (basisDigest(expectedBases) !== pins.supporting_basis_catalog_digest
      || canonicalDigest([...expectedBases,...newBases].sort((a,b)=>a.basis_ref.localeCompare(b.basis_ref))) !== canonicalDigest(bases)
      || new Set(bases.map((basis)=>basis.basis_ref)).size !== bases.length
      || value.next_supporting_basis_catalog_version !== nextBasisVersion
      || value.next_supporting_basis_catalog_digest !== nextBasisDigest) fail('ORDINARY_PHASE6_BASIS_CATALOG_INVALID');
  if (propertyPlacementBaseDigest(propertyPlacement)
      !== pins.property_placement_context_digest) {
    fail('ORDINARY_PHASE6_PROPERTY_PLACEMENT_CONTEXT_INVALID');
  }
  if (value.resolution === 'materialize') {
    const item = exactLegacyOrCurrentItem(value.item);
    value.item = item;
    for (const key of ['item_id','candidate_key','coverage_key','context_version','functional_bucket','admission_class','supporting_basis_ref','property_basis_ref','position_ref','mechanics_policy_ref']) text(item[key]);
    if (!sameTextList(item.causal_basis_refs,[...item.causal_basis_refs].sort()) || !sameTextList(item.permission_refs,[...item.permission_refs].sort()) || !(item.causal_basis_kind === null || sameText(item.causal_basis_kind)) || !(item.condition_state === null || ['serviceable','damaged'].includes(item.condition_state)) || !exactAdmittedItem({ item, scope, request_identity:value.request_identity }) || !basisCoversItem(bases,item) || !propertyPlacementEvidenceMatches({ base:propertyPlacement, item }) || !resolution.identity_key || !aggregate.admitted_identity_keys.includes(resolution.identity_key) || item.item_id !== `ordinary_item_${canonicalDigest({party_id:value.party_id,scope_ref:scope,candidate_key:item.candidate_key,coverage_key:item.coverage_key,context_version:item.context_version}).slice(0,24)}`) fail('ORDINARY_PHASE6_POSITIVE_ITEM_INVALID');
  } else if (value.item !== null || resolution.identity_key !== undefined) fail('ORDINARY_PHASE6_NEGATIVE_ITEM_FORBIDDEN');
  const finite = value.finite_resource_transition == null ? null : validateFiniteResourceTransition(value.finite_resource_transition, value.item, value.request_identity, exact);
  const initialization = value.finite_resource_initialization == null ? null : validateFiniteResourceInitialization(value.finite_resource_initialization, finite, value.request_identity);
  const plan = { schema:'ordinary_materialization_atomic_write_plan_v1', party_id:value.party_id, scope_ref:scope, request_identity:value.request_identity, input_digest:value.input_digest, transition_digest:value.transition_digest, expected_versions:pins, expected_supporting_basis_catalog:expectedBases, new_prepared_bases:newBases, next_supporting_basis_catalog:bases, next_supporting_basis_catalog_version:nextBasisVersion, next_supporting_basis_catalog_digest:nextBasisDigest, expected_property_placement_context:propertyPlacement, ...(enablementPin == null ? {} : { enablement_pin: enablementPin }), ...(finite == null ? {} : { finite_resource_transition:finite }), ...(initialization == null ? {} : { finite_resource_initialization:initialization }), resolution:value.resolution, transitions:value.transitions, next_aggregate:aggregate, item:value.item };
  return freezePhase6Data({ ...plan, write_plan_digest:canonicalDigest(plan) });
}

function phase6Keys(value, sealed) { const keys=['party_id','scope_ref','request_identity','input_digest','transition_digest','expected_versions','expected_supporting_basis_catalog','new_prepared_bases','next_supporting_basis_catalog','next_supporting_basis_catalog_version','next_supporting_basis_catalog_digest','expected_property_placement_context']; if(Object.hasOwn(value,'enablement_pin')) keys.push('enablement_pin'); if(Object.hasOwn(value,'finite_resource_transition')) keys.push('finite_resource_transition'); if(Object.hasOwn(value,'finite_resource_initialization')) keys.push('finite_resource_initialization'); keys.push('resolution','transitions','next_aggregate','item'); return sealed ? ['schema',...keys,'write_plan_digest'] : keys; }
function validateFiniteResourceInitialization(value,transition,requestIdentity) { if(transition==null) fail('ORDINARY_PHASE6_FINITE_SOURCE_INITIALIZATION_INVALID'); const initialization=exact(value,['source_resource_node_id','expected_state_version','initialization_identity','quantity_unit_ref','selection_ref','selected_amount']); if(!sameText(initialization.selection_ref)||initialization.source_resource_node_id!==transition.source_resource_node_id||initialization.expected_state_version+1!==transition.expected_state_version||initialization.initialization_identity!==requestIdentity||canonicalDigest(initialization.quantity_unit_ref)!==canonicalDigest(transition.quantity_unit_ref)||canonicalDigest(initialization.selected_amount)!==canonicalDigest(transition.before_quantity)) fail('ORDINARY_PHASE6_FINITE_SOURCE_INITIALIZATION_INVALID'); try { const check=planFiniteResourceDecrement({source_resource_node_id:initialization.source_resource_node_id,expected_state_version:transition.expected_state_version,causal_transition_identity:requestIdentity,source:{state_version:transition.expected_state_version,lifecycle_state:'active',quantity:initialization.selected_amount},requested_decrement:transition.decrement_quantity}); if(canonicalDigest(check.after_quantity)!==canonicalDigest(transition.after_quantity)) fail('ORDINARY_PHASE6_FINITE_SOURCE_INITIALIZATION_INVALID'); } catch { fail('ORDINARY_PHASE6_FINITE_SOURCE_INITIALIZATION_INVALID'); } return initialization; }

function exactLegacyOrCurrentItem(value) {
  const current = ['item_id','candidate_key','coverage_key','context_version','functional_bucket','admission_class','supporting_basis_ref','causal_basis_refs','causal_basis_kind','condition_state','permission_refs','property_basis_ref','position_ref','mechanics_policy_ref','item_proposal','mechanics_snapshot'];
  if (value && typeof value === 'object' && !Array.isArray(value)
      && Object.getPrototypeOf(value) === Object.prototype) {
    const names=Object.getOwnPropertyNames(value);
    for (const omitted of [[], ['condition_state'], ['causal_basis_kind','condition_state'],
      ['permission_refs','causal_basis_kind','condition_state']]) {
      const keys=current.filter((key)=>!omitted.includes(key));
      if(names.length===keys.length&&keys.every((key)=>names.includes(key))) {
        exact(value,keys); return { ...value,
          ...(omitted.includes('causal_basis_kind')?{causal_basis_kind:null}:{}),
          ...(omitted.includes('condition_state')?{condition_state:null}:{}),
          ...(omitted.includes('permission_refs')?{permission_refs:[]}:{}) };
      }
    }
  }
  return exact(value, current);
}

export function createPostgresOrdinaryMaterializationAtomicCommitter({ pool } = {}) {
  if (!pool?.connect) fail('ORDINARY_PHASE6_POOL_REQUIRED');
  return Object.freeze({ async commit(input) { const client = await pool.connect(); try { await client.query('BEGIN');
    const result = await applyOrdinaryMaterializationAtomicWritePlanInTransaction({
      client, input, updatePartyState: true
    });
    await client.query('COMMIT'); return result;
  } catch(error) { await client.query('ROLLBACK').catch(()=>{}); throw error; } finally { client.release(); } }});
}

export async function applyOrdinaryMaterializationAtomicWritePlanInTransaction({
  client, input, partyStateVersionAfter = null, updatePartyState = false,
  requireEnablementPin = false, p16ChangeSetId = null
} = {}) {
  if (!client?.query) fail('ORDINARY_PHASE6_TRANSACTION_REQUIRED');
  const plan = createOrdinaryMaterializationAtomicWritePlan(input);
  if (requireEnablementPin === true && plan.enablement_pin == null) {
    fail('ORDINARY_PHASE6_ENABLEMENT_PIN_REQUIRED');
  }
  if (plan.enablement_pin != null) {
    const enabled = await client.query(`SELECT objective_digest,enabled
      FROM party_runtime.party_ordinary_materialization_enablements
      WHERE party_id=$1 AND scope_kind=$2 AND scope_id=$3 FOR UPDATE`,
    [plan.party_id, plan.scope_ref.entity_kind, plan.scope_ref.entity_id]);
    if (enabled.rowCount !== 1 || enabled.rows[0].enabled !== true
        || enabled.rows[0].objective_digest !== plan.enablement_pin.objective_digest) {
      fail('ORDINARY_PHASE6_ENABLEMENT_STALE');
    }
  }
  const current = await locked(client, plan), old = await client.query(`SELECT input_digest,transition_digest,write_plan_digest,to_ordinary_state_version FROM party_runtime.party_ordinary_materialization_commits WHERE party_id=$1 AND request_identity=$2 FOR UPDATE`, [plan.party_id,plan.request_identity]);
  const nextPartyStateVersion = partyStateVersionAfter ?? current.party_state_version + 1;
  if (!Number.isSafeInteger(nextPartyStateVersion)
      || nextPartyStateVersion !== current.party_state_version + 1) {
    fail('ORDINARY_PHASE6_PARTY_STATE_OWNER_INVALID');
  }
  if (old.rowCount) { const row=old.rows[0]; if (row.input_digest!==plan.input_digest || row.transition_digest!==plan.transition_digest || row.write_plan_digest!==plan.write_plan_digest) fail('ORDINARY_PHASE6_IDEMPOTENCY_COLLISION'); return Object.freeze({status:'committed',replay:true,state_version:Number(row.to_ordinary_state_version)}); }
  for (const [key,value] of Object.entries(plan.expected_versions)) if (current[key] !== value) fail('ORDINARY_PHASE6_PROPOSAL_STALE');
  const next = applyTransitions(current.aggregate, plan.transitions);
  if (canonicalDigest(next) !== canonicalDigest(plan.next_aggregate)) fail('ORDINARY_PHASE6_AGGREGATE_DELTA_INVALID');
  if (plan.finite_resource_transition != null) {
    if (!sameText(p16ChangeSetId)) fail('ORDINARY_PHASE6_FINITE_SOURCE_P16_REQUIRED');
    if (plan.finite_resource_initialization != null) await applyFiniteResourceInitializationInTransaction(client, plan.party_id, plan.finite_resource_initialization, p16ChangeSetId);
    await applyFiniteResourceTransitionInTransaction(client, plan.party_id, plan.finite_resource_transition, plan.item, p16ChangeSetId, plan.finite_resource_initialization ?? null);
  }
  await client.query(`INSERT INTO party_runtime.party_ordinary_materialization_commits (party_id,scope_kind,scope_id,request_identity,input_digest,transition_digest,write_plan_digest,resolution,transition_count,from_party_state_version,to_party_state_version,from_ordinary_state_version,to_ordinary_state_version,item_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [plan.party_id,plan.scope_ref.entity_kind,plan.scope_ref.entity_id,plan.request_identity,plan.input_digest,plan.transition_digest,plan.write_plan_digest,plan.resolution,plan.transitions.length,current.party_state_version,nextPartyStateVersion,current.ordinary_state_version,current.ordinary_state_version+plan.transitions.length,plan.item?.item_id??null]);
    if (canonicalDigest(current.supporting_bases) !== canonicalDigest(plan.expected_supporting_basis_catalog)) fail('ORDINARY_PHASE6_PROPOSAL_STALE');
    if (canonicalDigest(current.property_placement_context)
        !== canonicalDigest(plan.expected_property_placement_context)) fail('ORDINARY_PHASE6_PROPOSAL_STALE');
    for(const basis of plan.new_prepared_bases) await client.query(`INSERT INTO party_runtime.party_ordinary_materialization_basis_catalog (party_id,scope_kind,scope_id,basis_ref,origin_request_identity,basis_snapshot) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,[plan.party_id,plan.scope_ref.entity_kind,plan.scope_ref.entity_id,basis.basis_ref,plan.request_identity,JSON.stringify(basis)]);
    if (plan.item) { const evidence=plan.item.item_proposal.property_placement_evidence; await client.query(`INSERT INTO party_runtime.party_ordinary_materialization_items (party_id,item_id,request_identity,scope_kind,scope_id,candidate_key,coverage_key,context_version,functional_bucket,admission_class,supporting_basis_ref,causal_basis_refs,property_basis_ref,position_ref,property_placement_context_digest,property_catalog_version_ref,placement_catalog_version_ref,property_placement_evidence,mechanics_policy_ref,item_proposal,mechanics_snapshot) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18::jsonb,$19,$20::jsonb,$21::jsonb)`, [plan.party_id,plan.item.item_id,plan.request_identity,plan.scope_ref.entity_kind,plan.scope_ref.entity_id,plan.item.candidate_key,plan.item.coverage_key,plan.item.context_version,plan.item.functional_bucket,plan.item.admission_class,plan.item.supporting_basis_ref,JSON.stringify(plan.item.causal_basis_refs),plan.item.property_basis_ref,plan.item.position_ref,evidence.property_placement_context_digest,evidence.property_catalog_version_ref,evidence.placement_catalog_version_ref,JSON.stringify(evidence),plan.item.mechanics_policy_ref,JSON.stringify(plan.item.item_proposal),JSON.stringify(plan.item.mechanics_snapshot)]); }
    if (plan.item) for (const basis_ref of [...new Set([plan.item.supporting_basis_ref,...plan.item.causal_basis_refs])].sort()) await client.query(`INSERT INTO party_runtime.party_ordinary_materialization_item_basis_refs (party_id,item_id,scope_kind,scope_id,basis_ref) VALUES ($1,$2,$3,$4,$5)`, [plan.party_id,plan.item.item_id,plan.scope_ref.entity_kind,plan.scope_ref.entity_id,basis_ref]);
    const context=await client.query(`UPDATE party_runtime.party_ordinary_materialization_contexts SET supporting_basis_catalog_version=$4,supporting_basis_catalog_digest=$5 WHERE party_id=$1 AND scope_kind=$2 AND scope_id=$3 AND supporting_basis_catalog_version=$6 AND supporting_basis_catalog_digest=$7`, [plan.party_id,plan.scope_ref.entity_kind,plan.scope_ref.entity_id,plan.next_supporting_basis_catalog_version,plan.next_supporting_basis_catalog_digest,plan.expected_versions.supporting_basis_catalog_version,plan.expected_versions.supporting_basis_catalog_digest]); if (context.rowCount!==1) fail('ORDINARY_PHASE6_PROPOSAL_STALE');
    const aggregate=await client.query(`UPDATE party_runtime.party_ordinary_materialization_aggregates SET state_version=$4,aggregate_payload=$5::jsonb WHERE party_id=$1 AND scope_kind=$2 AND scope_id=$3 AND state_version=$6`, [plan.party_id,plan.scope_ref.entity_kind,plan.scope_ref.entity_id,plan.next_aggregate.state_version,JSON.stringify(plan.next_aggregate),current.ordinary_state_version]); if (aggregate.rowCount!==1) fail('ORDINARY_PHASE6_ORDINARY_STATE_STALE');
  if (updatePartyState) { const party=await client.query(`UPDATE party_runtime.parties SET state_version=state_version+1,updated_at=NOW() WHERE party_id=$1 AND state_version=$2`, [plan.party_id,current.party_state_version]); if (party.rowCount!==1) fail('ORDINARY_PHASE6_PARTY_STATE_STALE'); }
  return Object.freeze({status:'committed',replay:false,state_version:current.ordinary_state_version+plan.transitions.length});
}

export function createOrdinaryMaterializationPhase6Coordinator({ loadCommitted, buildSanitizedRequest, model, validate, admit, buildPurePlan, atomicCommit } = {}) {
  for (const [name,port] of Object.entries({loadCommitted,buildSanitizedRequest,model,validate,admit,buildPurePlan,atomicCommit})) if(typeof port!=='function') fail('ORDINARY_PHASE6_PORT_INVALID',`${name} required`);
  return Object.freeze({ async execute(input) { const before=await loadCommitted(input), request=await buildSanitizedRequest({input,committed:before}), raw=await model({request,committed:before}), validated=await validate({input,request,raw,committed:before}), admitted=await admit({input,request,validated,committed:before}), reread=await loadCommitted(input); if(canonicalDigest(before.version_pins)!==canonicalDigest(reread.version_pins)) fail('ORDINARY_PHASE6_PROPOSAL_STALE'); return atomicCommit(await buildPurePlan({input,request,validated,admitted,committed:reread})); }});
}

export function createPostgresOrdinaryMaterializationPhase6Factory({ pool, buildSanitizedRequest, model, validate, admit, buildPurePlan } = {}) {
  const atomic = createPostgresOrdinaryMaterializationAtomicCommitter({ pool });
  const loadCommitted = async ({ party_id, scope_ref }) => {
    const client = await pool.connect();
    try { const row = await client.query(`SELECT p.state_version AS party_state_version,a.state_version AS ordinary_state_version,c.catalog_version,c.property_version,c.placement_version,c.supporting_basis_catalog_version,c.supporting_basis_catalog_digest,c.property_placement_context_digest,c.property_placement_base_snapshot,a.aggregate_payload FROM party_runtime.parties p JOIN party_runtime.party_ordinary_materialization_aggregates a ON a.party_id=p.party_id JOIN party_runtime.party_ordinary_materialization_contexts c ON c.party_id=a.party_id AND c.scope_kind=a.scope_kind AND c.scope_id=a.scope_id WHERE p.party_id=$1 AND a.scope_kind=$2 AND a.scope_id=$3`, [party_id,scope_ref?.entity_kind,scope_ref?.entity_id]); if(row.rowCount!==1) fail('ORDINARY_PHASE6_COMMITTED_STATE_MISSING'); const value=row.rows[0]; const bases=await catalog(client, party_id, scope_ref), propertyPlacement=normalizePropertyPlacementBase(value.property_placement_base_snapshot,scope_ref); if(basisDigest(bases)!==value.supporting_basis_catalog_digest||propertyPlacementBaseDigest(propertyPlacement)!==value.property_placement_context_digest) fail('ORDINARY_PHASE6_COMMITTED_CONTEXT_INVALID'); return { aggregate:assertAndNormalizeOrdinaryAggregate(value.aggregate_payload), supporting_bases:bases, property_placement_context:propertyPlacement, version_pins:{party_state_version:safeVersion(value.party_state_version),ordinary_state_version:safeVersion(value.ordinary_state_version),catalog_version:safeVersion(value.catalog_version),property_version:safeVersion(value.property_version),placement_version:safeVersion(value.placement_version),supporting_basis_catalog_version:safeVersion(value.supporting_basis_catalog_version),supporting_basis_catalog_digest:value.supporting_basis_catalog_digest,property_placement_context_digest:value.property_placement_context_digest} }; } finally { client.release(); }
  };
  return createOrdinaryMaterializationPhase6Coordinator({ loadCommitted, buildSanitizedRequest, model, validate, admit, buildPurePlan, atomicCommit: (plan) => atomic.commit(plan) });
}

async function locked(client, plan) { const result=await client.query(`SELECT p.state_version AS party_state_version,a.state_version AS ordinary_state_version,c.catalog_version,c.property_version,c.placement_version,c.supporting_basis_catalog_version,c.supporting_basis_catalog_digest,c.property_placement_context_digest,c.property_placement_base_snapshot,a.aggregate_payload FROM party_runtime.parties p JOIN party_runtime.party_ordinary_materialization_aggregates a ON a.party_id=p.party_id JOIN party_runtime.party_ordinary_materialization_contexts c ON c.party_id=a.party_id AND c.scope_kind=a.scope_kind AND c.scope_id=a.scope_id WHERE p.party_id=$1 AND a.scope_kind=$2 AND a.scope_id=$3 FOR UPDATE OF p,a,c`,[plan.party_id,plan.scope_ref.entity_kind,plan.scope_ref.entity_id]); if(result.rowCount!==1) fail('ORDINARY_PHASE6_COMMITTED_STATE_MISSING'); const row=result.rows[0], bases=await catalog(client,plan.party_id,plan.scope_ref,true),propertyPlacement=normalizePropertyPlacementBase(row.property_placement_base_snapshot,plan.scope_ref); if(basisDigest(bases)!==row.supporting_basis_catalog_digest||propertyPlacementBaseDigest(propertyPlacement)!==row.property_placement_context_digest) fail('ORDINARY_PHASE6_COMMITTED_CONTEXT_INVALID'); return {party_state_version:safeVersion(row.party_state_version),ordinary_state_version:safeVersion(row.ordinary_state_version),catalog_version:safeVersion(row.catalog_version),property_version:safeVersion(row.property_version),placement_version:safeVersion(row.placement_version),supporting_basis_catalog_version:safeVersion(row.supporting_basis_catalog_version),supporting_basis_catalog_digest:row.supporting_basis_catalog_digest,property_placement_context_digest:row.property_placement_context_digest,supporting_bases:bases,property_placement_context:propertyPlacement,aggregate:assertAndNormalizeOrdinaryAggregate(row.aggregate_payload)}; }
function applyTransitions(aggregate, transitions) { let next=aggregate; for(const transition of transitions) next=applyOrdinaryAggregateTransition({aggregate:next,transition}); return next; }
async function catalog(client, partyId, scope, lock = false) { const rows=await client.query(`SELECT basis_snapshot FROM party_runtime.party_ordinary_materialization_basis_catalog WHERE party_id=$1 AND scope_kind=$2 AND scope_id=$3 ORDER BY basis_ref ${lock ? 'FOR UPDATE' : ''}`,[partyId,scope.entity_kind,scope.entity_id]); return rows.rows.map((row)=>row.basis_snapshot); }
