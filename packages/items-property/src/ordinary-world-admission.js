import { deepFreeze } from '@rus/kernel';
import { resolveOrdinaryWorldPropertyPlacement } from
  './ordinary-world-property-placement.js';
const O1_BUCKETS = new Set(['household','work','storage','stock',
  'furnishing_textile','maintenance_material','waste_scrap','personal_effect',
  'other_ordinary']);
const CARRY_FORMS = new Set(['compact','regular','long','bulky']);

const HANDOFF = ['schema','status','stage','request_id','scope_ref','candidate_key','coverage_key','context_version','admission_evidence','proposed_item'];
const CONTEXT = ['schema','version','supporting_bases','property_placement_input','mechanics_policy','causal_identity'];
const EVIDENCE = ['authority_class','admission_class','availability_class','functional_bucket','supporting_basis_ref','property_basis_ref','runtime_item_mechanics_policy_ref','property_placement_context_digest','property_catalog_version_ref','placement_catalog_version_ref'];
const ITEM = ['semantic_descriptor','authority_class','admission_class','availability_class','functional_bucket','presence_expectation','supporting_basis_ref','causal_basis','property_basis_ref','placement_proposal','mechanics_proposal'];
const BASIS = ['basis_ref','state','scope_ref','prepared_seed_provenance','functional_buckets','allowed_admission_classes'];
const POLICY = ['policy_ref','max_mass_grams','allowed_external_hand_costs','allowed_carry_forms','max_packing_slot_cost','max_quantity'];
const MECHANICS = ['mass_grams','external_hand_cost','carry_form','packing_slot_cost','quantity','container'];

export function admitOrdinaryWorldMaterialization(input = {}) {
  const copied = copyBoundary(input), args = record(copied, ['handoff','admission_context']);
  const pending = args && record(args.handoff, HANDOFF), context = args && record(args.admission_context, CONTEXT);
  if (!pending || !context || context.schema !== 'rus.items.ordinary_world_admission_context.v3' || context.version !== 3) return failed('ITEM_ORDINARY_WORLD_ADMISSION_INVALID');
  const evidence = record(pending.admission_evidence, EVIDENCE), item = record(pending.proposed_item, ITEM);
  const position = item && record(item.placement_proposal, ['scope_ref','position_ref']);
  const causalBasis = item && record(item.causal_basis, ['basis_kind','basis_refs']);
  if (!validPending(pending, evidence, item, position, causalBasis)) return failed('ITEM_ORDINARY_WORLD_ADMISSION_INVALID');
  if (evidence.authority_class !== 'ordinary' || evidence.admission_class !== 'common_mundane' || evidence.availability_class !== 'common' || !O1_BUCKETS.has(item.functional_bucket)) return failed('ITEM_ORDINARY_WORLD_RESTRICTED');
  const bases = Array.isArray(context.supporting_bases) ? context.supporting_bases.map((value) => record(value, BASIS)) : null;
  if (!bases || bases.some((value) => !validBasis(value, pending.scope_ref)) || !covers(bases, item.supporting_basis_ref, item, pending.scope_ref) || causalBasis.basis_refs.some((ref) => !covers(bases, ref, item, pending.scope_ref))) return failed('ITEM_ORDINARY_WORLD_SUPPORTING_BASIS_INVALID');
  const propertyInput = record(context.property_placement_input, ['scope_ref','property_catalog_version_ref','placement_catalog_version_ref','item_kind','supporting_basis_ref','causal_basis_refs','requested_position_ref','personal_communal_refs','occupied_site_refs','unowned_cause_refs','placement_context_refs','property_catalog','placement_catalog']);
  if (!propertyInput || !sameScope(propertyInput.scope_ref, pending.scope_ref)
      || propertyInput.item_kind !== 'man_made'
      || propertyInput.supporting_basis_ref !== item.supporting_basis_ref
      || !sameRefs(propertyInput.causal_basis_refs, causalBasis.basis_refs)
      || propertyInput.requested_position_ref !== position.position_ref) return failed('ITEM_ORDINARY_WORLD_PROPERTY_INVALID');
  const resolvedPropertyPlacement = resolveOrdinaryWorldPropertyPlacement(
    context.property_placement_input);
  const propertyPlacement = resolvedPropertyPlacement.pass
    ? resolvedPropertyPlacement.evidence : null;
  if (!propertyPlacement || propertyPlacement.property_basis_ref !== item.property_basis_ref) return failed('ITEM_ORDINARY_WORLD_PROPERTY_INVALID');
  if (evidence.property_placement_context_digest !== propertyPlacement.property_placement_context_digest || evidence.property_catalog_version_ref !== propertyPlacement.property_catalog_version_ref || evidence.placement_catalog_version_ref !== propertyPlacement.placement_catalog_version_ref) return failed('ITEM_ORDINARY_WORLD_PROPERTY_INVALID');
  if (propertyPlacement.placement.scope_ref !== position.scope_ref
      || propertyPlacement.placement.position_ref !== position.position_ref) return failed('ITEM_ORDINARY_WORLD_PLACEMENT_INVALID');
  const policy = record(context.mechanics_policy, POLICY);
  if (!policy || policy.policy_ref !== evidence.runtime_item_mechanics_policy_ref) return failed('ITEM_ORDINARY_WORLD_MECHANICS_POLICY_INVALID');
  const mechanics = mechanicsOf(item.mechanics_proposal, policy);
  if (!mechanics) return failed('ITEM_ORDINARY_WORLD_MECHANICS_INVALID');
  const causal = record(context.causal_identity, ['request_id','candidate_key','coverage_key','context_version','causal_ref','source_refs']);
  const expectedRefs = canonicalRefs([pending.candidate_key,pending.coverage_key,
    item.supporting_basis_ref,...causalBasis.basis_refs,item.property_basis_ref,
    position.position_ref,policy.policy_ref,propertyPlacement.property_source_ref,
    propertyPlacement.property_catalog_version_ref,
    propertyPlacement.placement_catalog_version_ref,
    propertyPlacement.placement_context_ref,
    propertyPlacement.property_placement_context_digest,
    ...(propertyPlacement.unowned_cause_ref === null ? []
      : [propertyPlacement.unowned_cause_ref])]);
  if (!causal || !text(causal.causal_ref) || causal.request_id !== pending.request_id || causal.candidate_key !== pending.candidate_key || causal.coverage_key !== pending.coverage_key || causal.context_version !== pending.context_version || !sameRefs(causal.source_refs, expectedRefs)) return failed('ITEM_ORDINARY_WORLD_PROVENANCE_INVALID');
  const snapshot = v2Snapshot({ causal_ref: causal.causal_ref, request_id: pending.request_id, candidate_key: pending.candidate_key, coverage_key: pending.coverage_key, context_version: pending.context_version, policy_ref: policy.policy_ref, source_refs: expectedRefs, mechanics });
  return deepFreeze({ pass: true, errors: [], proposal: deepFreeze({ schema: 'ordinary_world_item_proposal_v1', request_id: pending.request_id, scope_ref: pending.scope_ref, candidate_key: pending.candidate_key, coverage_key: pending.coverage_key, context_version: pending.context_version, semantic_descriptor: descriptor(item.semantic_descriptor), supporting_basis_ref: item.supporting_basis_ref, property_basis_ref: item.property_basis_ref, property_placement_evidence: propertyPlacement, placement: position, runtime_item_mechanics_policy_ref: policy.policy_ref }), runtime_instance_mechanics_snapshot: snapshot });
}


function validPending(p,e,item,pos,causal) { return p.schema === 'ordinary_pending_items_property_admission_v1' && p.status === 'pending_items_property_admission' && p.stage === 'presence_resolution' && [p.request_id,p.candidate_key,p.coverage_key,p.context_version].every(text) && scope(p.scope_ref) && e && item && pos && pos.scope_ref === scopeId(p.scope_ref) && text(pos.position_ref) && causal && text(causal.basis_kind) && refs(causal.basis_refs)?.length > 0 && descriptor(item.semantic_descriptor) && e.authority_class === item.authority_class && e.admission_class === item.admission_class && e.availability_class === item.availability_class && e.functional_bucket === item.functional_bucket && e.supporting_basis_ref === item.supporting_basis_ref && e.property_basis_ref === item.property_basis_ref && text(e.runtime_item_mechanics_policy_ref); }
function validBasis(b,s) { return b && text(b.basis_ref) && ['committed','prepared_seed'].includes(b.state) && sameScope(b.scope_ref,s) && refs(b.functional_buckets) && refs(b.allowed_admission_classes) && (b.state === 'committed' ? b.prepared_seed_provenance === null : prepared(b.prepared_seed_provenance)); }
function prepared(value) { const p = record(value, ['seed_request_id','mode','candidate_query']); return p && text(p.seed_request_id) && p.mode === 'seed_scope' && p.candidate_query === null; }
function covers(bases, ref, item, scopeRef) { return bases.some((b) => b && b.basis_ref === ref && validBasis(b,scopeRef) && b.functional_buckets.includes(item.functional_bucket) && b.allowed_admission_classes.includes(item.admission_class)); }
function descriptor(value) { const v = record(value, ['semantic_type','name','facts']), facts = v && refs(v.facts); return v && text(v.semantic_type) && text(v.name) && facts ? { semantic_type:v.semantic_type, name:v.name, facts } : null; }
function mechanicsOf(value,p) { const v=record(value,MECHANICS),q=v&&record(v.quantity,['value','unit']); if (!(text(p.policy_ref)&&Number.isSafeInteger(p.max_mass_grams)&&p.max_mass_grams>=1&&p.max_mass_grams<=1000000&&numberRefs(p.allowed_external_hand_costs)&&refs(p.allowed_carry_forms)&&Number.isSafeInteger(p.max_packing_slot_cost)&&p.max_packing_slot_cost>=0&&p.max_packing_slot_cost<=1000&&Number.isSafeInteger(p.max_quantity)&&p.max_quantity>=1&&p.max_quantity<=1000&&v&&Number.isSafeInteger(v.mass_grams)&&v.mass_grams>=1&&v.mass_grams<=p.max_mass_grams&&v.mass_grams<=1000000&&[0,1,2].includes(v.external_hand_cost)&&p.allowed_external_hand_costs.includes(v.external_hand_cost)&&CARRY_FORMS.has(v.carry_form)&&p.allowed_carry_forms.includes(v.carry_form)&&Number.isSafeInteger(v.packing_slot_cost)&&v.packing_slot_cost>=0&&v.packing_slot_cost<=p.max_packing_slot_cost&&v.packing_slot_cost<=1000&&q&&Number.isSafeInteger(q.value)&&q.value>=1&&q.value<=p.max_quantity&&q.value<=1000&&q.unit==='item'&&v.container===null)) return null; return {mass_grams:v.mass_grams,external_hand_cost:v.external_hand_cost,carry_form:v.carry_form,packing_slot_cost:v.packing_slot_cost,quantity:{value:q.value,unit:q.unit},container:null}; }
function v2Snapshot({causal_ref,request_id,candidate_key,coverage_key,context_version,policy_ref,source_refs,mechanics}) { return deepFreeze({schema:'rus.items.runtime_instance_mechanics_snapshot.v2',version:2,provenance:{source_kind:'ordinary_world_materialization',causal_ref,request_id,candidate_key,coverage_key,context_version,policy_ref,source_refs},mechanics}); }
function canonicalRefs(values) { return [...new Set(values)].sort((a,b)=>a < b ? -1 : a > b ? 1 : 0); }
function sameRefs(value,expected) { const actual=refs(value); return actual&&actual.length===expected.length&&actual.every((v,i)=>v===expected[i]); }
function record(value,fields) { if (!value||typeof value!=='object'||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype||Object.getOwnPropertySymbols(value).length) return null; const names=Object.getOwnPropertyNames(value); if(names.length!==fields.length||fields.some((f)=>!names.includes(f)))return null; const out={}; for(const f of fields){const d=Object.getOwnPropertyDescriptor(value,f);if(!d||d.enumerable!==true||!Object.hasOwn(d,'value'))return null;out[f]=d.value;}return out; }
function copyBoundary(value) { const seen=new WeakSet(); function visit(v){if(v===null||typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v))return v;if(!v||typeof v!=='object'||seen.has(v)||Object.getOwnPropertySymbols(v).length)return null;const array=Array.isArray(v);if(array?Object.getPrototypeOf(v)!==Array.prototype:Object.getPrototypeOf(v)!==Object.prototype)return null;seen.add(v);const keys=Object.getOwnPropertyNames(v),out=array?[]:{};if(array&&(keys.length!==v.length+1||!keys.includes('length')))return null;for(const key of keys){if(array&&key==='length')continue;const d=Object.getOwnPropertyDescriptor(v,key);if(!d||d.enumerable!==true||!Object.hasOwn(d,'value'))return null;const child=visit(d.value);if(child===null&&d.value!==null)return null;if(array){if(key!==String(out.length))return null;out.push(child);}else out[key]=child;}return out;}return visit(value); }
function scope(value) { const v=record(value,['entity_kind','entity_id']);return v&&text(v.entity_kind)&&text(v.entity_id); }
function scopeId(value) { return record(value,['entity_kind','entity_id'])?.entity_id??null; }
function sameScope(a,b) { const x=record(a,['entity_kind','entity_id']),y=record(b,['entity_kind','entity_id']);return x&&y&&x.entity_kind===y.entity_kind&&x.entity_id===y.entity_id; }
function refs(value) { if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)return null;const out=[];for(let i=0;i<value.length;i+=1){const d=Object.getOwnPropertyDescriptor(value,String(i));if(!d||d.enumerable!==true||!Object.hasOwn(d,'value')||!text(d.value))return null;out.push(d.value);}return new Set(out).size===out.length?out:null; }
function numberRefs(value) { return Array.isArray(value) && value.length > 0 && value.every(Number.isSafeInteger) && new Set(value).size === value.length; }
function text(value) { return typeof value==='string'&&value.length>0&&value.trim()===value; }
function failed(code) { return deepFreeze({pass:false,proposal:null,runtime_instance_mechanics_snapshot:null,errors:[{code,category:'data_gap',retryable:false,message:code,details:{}}]}); }
