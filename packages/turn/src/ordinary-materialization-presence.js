import { deepFreeze } from '@rus/kernel';
import { assertOrdinaryMaterializationRequestV1,
  ordinaryWorldPropertyPlacementContextDigest,
  validateOrdinaryMaterializationPlanV1 } from
  '@rus/contracts/ordinary-materialization-v1';
import { applyOrdinaryAggregateTransition, createOrdinaryCandidateKey, createOrdinaryCategoryKey, createOrdinaryContextVersion, createOrdinaryCoverageKey, createOrdinaryResolutionRef, validateSupportingBasisAdmission } from '@rus/materialization';
import { turnFailure } from './errors.js';
import { applyOrdinaryAggregateToTurnWorkingProjection, assertAndNormalizeTurnOrdinaryWorkingProjection } from './turn-step-ordinary-working-projection.js';
const RESTRICTED = new Set(['specialized_or_valuable','weapon_or_armament',
  'currency_or_precious','document_like','other_restricted']);

export async function resolveOrdinaryMaterializationPresence({ envelope, ordinaryMaterializationModel, workingProjection, basisCatalog, beforeModel, repairAvailable = () => true, codeOwnedResolution = null, mechanicsPolicy = null, semanticContext = null } = {}) {
  const input = envelopeOf(envelope), projection = projectionOf(input.request, workingProjection);
  const codeResolution = codeOwnedResolution ?? forbiddenAdmission(input);
  const early = preflight(input, projection, basisCatalog, codeResolution); if (early) return early;
  if (codeResolution !== null) {
    if (!['absent', 'no_change', 'authority_required'].includes(codeResolution)) {
      fail('TURN_ORDINARY_PRESENCE_CODE_OWNED_RESOLUTION_INVALID');
    }
    return negative(input, { resolution: codeResolution }, projection, false);
  }
  if (beforeModel != null) {
    if (typeof beforeModel !== 'function') fail('TURN_ORDINARY_PRESENCE_CUTOVER_INVALID');
    await invokeBeforeModel(beforeModel);
  }
  if (typeof ordinaryMaterializationModel !== 'function') fail('TURN_ORDINARY_PRESENCE_MODEL_MISSING');
  const mechanics = mechanicsPolicy == null ? null : mechanicsPolicyOf(mechanicsPolicy);
  if (mechanicsPolicy != null && mechanics == null) {
    fail('TURN_ORDINARY_PRESENCE_MECHANICS_POLICY_INVALID');
  }
  const modelContext = { ...(mechanics == null ? {} : { mechanics_policy: mechanics }),
    ...(semanticContext == null ? {} : { semantic_context: semanticContext }) };
  const request = freeze(input.request); let raw = await invoke(ordinaryMaterializationModel, request, { ...modelContext, repair: null }, false);
  let errors = planErrors(raw, request, mechanics), repaired = false;
  if (errors.length) { if (typeof repairAvailable !== 'function' || !repairAvailable()) throw turnFailure('TURN_ORDINARY_PRESENCE_PLAN_INVALID', 'Ordinary presence response is invalid and no structural repair budget remains.', { repair_attempted: false, validation_errors: errors }); raw = await invoke(ordinaryMaterializationModel, request, { ...modelContext, repair: { schema: 'ordinary_materialization_repair_context_v1', original_output: null, validation_errors: errors } }, true); errors = planErrors(raw, request, mechanics); repaired = true; if (errors.length) throw turnFailure('TURN_ORDINARY_PRESENCE_PLAN_INVALID', 'Ordinary presence response and its repair are invalid.', { validation_errors: errors }); }
  const plan = freeze(raw);
  if (plan.resolution !== 'materialize') return negative(input, plan, projection, repaired);
  if (input.identity.admission_class === 'common_mundane'
      && plan.entities.length === 1
      && RESTRICTED.has(plan.entities[0]?.admission_class)) {
    return negative(input, { resolution: 'absent' }, projection, repaired);
  }
  const pending = positive(input, plan, projection, basisCatalog);
  return deepFreeze({ status: 'pending_items_property_admission', decision: decision(request, plan, repaired), pending_items_property_admission: pending, working_projection: projection });
}

function preflight(input, projection, bases, codeOwnedResolution) {
  const { request, identity } = input, aggregate = projection.ordinary_materialization_aggregate;
  const known = aggregate.presence_resolutions.find((r) => r.candidate_key === identity.candidate_key && r.coverage_key === identity.coverage_key && r.context_version === identity.context_version) ?? aggregate.closed_observation_scopes.find((r) => r.coverage_key === identity.coverage_key && r.category_key === identity.category_key && r.context_version === identity.context_version);
  if (known) return deepFreeze({ status: 'already_resolved', decision: null, pending_items_property_admission: null, known_resolution: known, working_projection: projection });
  if (!fresh(input, aggregate)) return outcome('no_change', projection, 'aggregate_not_current');
  if (request.ordinary_state.closed_observation_scopes.includes(identity.coverage_key)) return outcome('no_change', projection, 'observation_closed');
  if (aggregate.presence_resolutions.length + aggregate.closed_observation_scopes.length >= aggregate.resolution_record_cap) return outcome('no_change', projection, 'budget_or_cap_exhausted');
  if (codeOwnedResolution !== null) return null;
  if (aggregate.remaining_identity_budget < 1) return outcome('no_change', projection, 'budget_or_cap_exhausted');
  if (!propertyOK(input) || !input.property_placement_context.placement_catalog.some((v) => placementOK(v, request.scope_ref))) return outcome('no_change', projection, 'committed_property_or_placement_missing');
  if (!compatible(input, bases)) return outcome('authority_required', projection, 'supporting_basis_missing');
  return null;
}
function positive(input, plan, projection, bases) {
  const { request, identity } = input, entity = plan.entities[0];
  const permission_refs = permissionsFor(identity, request);
  if (plan.entities.length !== 1 || entity.authority_class !== 'ordinary'
      || entity.admission_class !== identity.admission_class
      || entity.availability_class !== identity.availability_class
      || entity.admission_class === 'container_capable'
      || entity.functional_bucket !== identity.functional_bucket
      || (identity.availability_class === 'context_bound'
        && entity.semantic_descriptor.facts.length !== 0)
      || permission_refs === null) reject('ORDINARY_PRESENCE_ENTITY_INVALID');
  const authority = request.authority_envelope;
  if (authority?.stage === 'resolve_presence'
      && (!authority.allowed_supporting_bases.some((basis) =>
        basis.basis_ref === entity.supporting_basis_ref)
      || !entity.causal_basis.basis_refs.every((ref) =>
        authority.allowed_supporting_bases.some((basis) => basis.basis_ref === ref))
      || entity.property_basis_ref !== authority.property_basis_ref
      || !authority.placement_refs.includes(entity.placement_proposal.position_ref))) {
    reject('ORDINARY_PRESENCE_ENVELOPE_SELECTION_INVALID');
  }
  if (!propertyOK(input) || entity.property_basis_ref !== request.context_refs.property_context_ref) reject('ORDINARY_PRESENCE_PROPERTY_INVALID');
  if (entity.placement_proposal.scope_ref !== request.scope_ref.entity_id || !input.property_placement_context.placement_catalog.some((v) => placementOK(v, request.scope_ref) && v.position_ref === entity.placement_proposal.position_ref)) reject('ORDINARY_PRESENCE_PLACEMENT_INVALID');
  try { validate(entity.supporting_basis_ref); for (const ref of entity.causal_basis.basis_refs) validate(ref); } catch (error) { reject('ORDINARY_PRESENCE_BASIS_INVALID', message(error)); }
  function validate(supporting_basis_ref) { validateSupportingBasisAdmission({ request, candidate: { supporting_basis_ref, functional_bucket: entity.functional_bucket, admission_class: entity.admission_class, availability_class: entity.availability_class }, basis_catalog: bases }); }
  return deepFreeze({ schema: 'ordinary_pending_items_property_admission_v1', status: 'pending_items_property_admission', stage: 'presence_resolution', request_id: request.request_id, scope_ref: freeze(request.scope_ref), candidate_key: identity.candidate_key, coverage_key: identity.coverage_key, context_version: identity.context_version, admission_evidence: freeze({ authority_class: entity.authority_class, admission_class: entity.admission_class, availability_class: entity.availability_class, functional_bucket: entity.functional_bucket, supporting_basis_ref: entity.supporting_basis_ref, property_basis_ref: entity.property_basis_ref, permission_refs, causal_basis_kind: entity.causal_basis.basis_kind, runtime_item_mechanics_policy_ref: request.policy_refs.runtime_item_mechanics_policy_ref, property_placement_context_digest: input.property_placement_context_digest, property_catalog_version_ref: input.property_placement_context.property_catalog_version_ref, placement_catalog_version_ref: input.property_placement_context.placement_catalog_version_ref }), proposed_item: freeze(entity) });
}
function negative(input, plan, projection, repaired) { const { request, identity } = input; const aggregate = projection.ordinary_materialization_aggregate; const transition = { kind: 'resolve_presence', request_identity: request.request_id, expected_state_version: aggregate.state_version, resolution_ref: createOrdinaryResolutionRef({ scope_ref: request.scope_ref, candidate_key: identity.candidate_key, coverage_key: identity.coverage_key, context_version: identity.context_version, request_identity: request.request_id, policy_version: identity.policy_version }), candidate_key: identity.candidate_key, coverage_key: identity.coverage_key, category_key: identity.category_key, context_version: identity.context_version, resolution: plan.resolution }; try { const next = applyOrdinaryAggregateTransition({ aggregate, transition }); return deepFreeze({ status: plan.resolution, decision: decision(request, plan, repaired), pending_items_property_admission: null, working_projection: applyOrdinaryAggregateToTurnWorkingProjection({ working_projection: withoutOrdinaryAggregate(projection), ordinary_aggregate: next }) }); } catch (error) { throw turnFailure('TURN_ORDINARY_PRESENCE_TRANSITION_INVALID', 'Ordinary transition cannot apply.', { cause: message(error) }); } }
function envelopeOf(value) {
  if (!jsonData(value)) fail('TURN_ORDINARY_PRESENCE_ENVELOPE_INVALID');
  const e = record(value, ['schema','request','identity','ordinary_state_version',
    'property_placement_context','property_placement_context_digest']);
  if (!e || e.schema !== 'ordinary_materialization_presence_envelope_v1') {
    fail('TURN_ORDINARY_PRESENCE_ENVELOPE_INVALID');
  }
  try { assertOrdinaryMaterializationRequestV1(e.request); } catch {
    fail('TURN_ORDINARY_PRESENCE_ENVELOPE_INVALID');
  }
  const identityKeys = ['candidate_key','coverage_key','category_key',
    'context_version','normalized_candidate_ref','normalizer_version',
    'semantic_type','coverage_kind','coverage_ref','policy_version',
    'functional_bucket','admission_class','availability_class'];
  const i = record(e.identity, Object.hasOwn(e.identity ?? {}, 'source_ref')
    ? [...identityKeys, 'source_ref'] : identityKeys);
  const p = propertyContext(e.property_placement_context);
  if (!i || !Object.values(i).every((entry) => typeof entry === 'string' && entry)
      || !Number.isSafeInteger(e.ordinary_state_version)
      || e.request.mode !== 'resolve_presence'
      || e.request.candidate_query.evidence_weight !== 0 || !p
      || !['man_made','natural_resource_portion'].includes(p.item_kind)
      || !scope(p.scope_ref,e.request.scope_ref)
      || e.property_placement_context_digest !== propertyContextDigest(p)) {
    fail('TURN_ORDINARY_PRESENCE_ENVELOPE_INVALID');
  }
  try {
    const source = i.source_ref == null ? {} : { source_ref: i.source_ref };
    const candidate_key = createOrdinaryCandidateKey({
      scope_ref:e.request.scope_ref,
      normalized_candidate_ref:i.normalized_candidate_ref,
      normalizer_version:i.normalizer_version,
      functional_bucket:i.functional_bucket,
      admission_class:i.admission_class,
      availability_class:i.availability_class,
      policy_version:i.policy_version, ...source });
    const coverage_key = createOrdinaryCoverageKey({scope_ref:e.request.scope_ref,
      coverage_kind:i.coverage_kind,coverage_ref:i.coverage_ref,
      policy_version:i.policy_version});
    const category_key = createOrdinaryCategoryKey({scope_ref:e.request.scope_ref,
      functional_bucket:i.functional_bucket,admission_class:i.admission_class,
      availability_class:i.availability_class,policy_version:i.policy_version});
    const context_version = createOrdinaryContextVersion({
      scope_ref:e.request.scope_ref,context_refs:e.request.context_refs,
      ordinary_presence_policy_ref:e.request.policy_refs.ordinary_presence_policy_ref,
      property_basis_ref:e.request.context_refs.property_context_ref,
      property_placement_context_digest:e.property_placement_context_digest,
      ...source});
    const authority = e.request.authority_envelope;
    if (i.candidate_key !== candidate_key || i.coverage_key !== coverage_key
        || i.category_key !== category_key || i.context_version !== context_version
        || i.policy_version !== e.request.policy_refs.ordinary_presence_policy_ref
        || authority?.stage === 'resolve_presence' && !sameCandidateAuthority(
          authority.candidate, i)) {
      fail('TURN_ORDINARY_PRESENCE_ENVELOPE_INVALID');
    }
  } catch { fail('TURN_ORDINARY_PRESENCE_ENVELOPE_INVALID'); }
  return freeze(e);
}
function forbiddenAdmission(input) {
  const { identity, request } = input;
  return !request.policy_refs.allowed_admission_classes.includes(
    identity.admission_class) || permissionsFor(identity, request) === null
    ? 'authority_required' : null;
}
function sameCandidateAuthority(authority, identity) { return authority.semantic_type
  === identity.semantic_type && authority.functional_bucket === identity.functional_bucket
  && authority.admission_class === identity.admission_class
  && authority.availability_class === identity.availability_class
  && authority.coverage_kind === identity.coverage_kind
  && authority.coverage_ref === identity.coverage_ref; }
function propertyContext(value) {
  const v1 = record(value,['scope_ref','item_kind','property_catalog_version_ref',
    'placement_catalog_version_ref','personal_communal_refs','occupied_site_refs',
    'unowned_cause_refs','placement_context_refs','property_catalog','placement_catalog']);
  if (v1) return v1;
  const v2 = record(value,['schema','version','scope_ref','item_kind',
    'property_catalog_version_ref','placement_catalog_version_ref',
    'explicit_item_source_refs','personal_possession_refs',
    'communal_public_service_refs','container_property_refs','occupied_site_refs',
    'unowned_cause_refs','placement_context_refs','property_catalog','placement_catalog']);
  return v2?.schema === 'rus.items.ordinary_world_property_placement_context.v2'
    && v2.version === 2 ? v2 : null;
}
function propertyContextDigest(value) {
  return ordinaryWorldPropertyPlacementContextDigest({ ...value,
    supporting_basis_ref:'ordinary_presence_context_digest',
    causal_basis_refs:['ordinary_presence_context_digest'],
    requested_position_ref:'ordinary_presence_context_digest' });
}
function projectionOf(request, value) { let p; try { p = assertAndNormalizeTurnOrdinaryWorkingProjection(value); } catch { fail('TURN_ORDINARY_PRESENCE_WORKING_PROJECTION_INVALID'); } if (!scope(p.ordinary_materialization_aggregate.scope_ref, request.scope_ref)) fail('TURN_ORDINARY_PRESENCE_SCOPE_MISMATCH'); return p; }
function propertyOK(input) { return scope(input.property_placement_context.scope_ref, input.request.scope_ref) && ['man_made','natural_resource_portion'].includes(input.property_placement_context.item_kind); }
function fresh(input, aggregate) { const state=input.request.ordinary_state; return input.ordinary_state_version===aggregate.state_version && aggregate.seeded===state.seeded && aggregate.density_band===state.density_band && aggregate.remaining_identity_budget===state.remaining_identity_budget && sameRefs(aggregate.background_groups.map((g)=>g.group_ref),state.background_groups) && sameRefs(aggregate.presence_resolutions.map((r)=>r.resolution_ref),state.presence_resolutions) && sameRefs(aggregate.closed_observation_scopes.map((r)=>r.coverage_key),state.closed_observation_scopes); }
function sameRefs(a,b) { return Array.isArray(b) && a.length===b.length && a.every((v,i)=>v===b[i]); }
function placementOK(v, s) { return v && v.state === 'committed' && scope(v.scope_ref, s); }
function compatible(input, bases) { return selectOrdinaryMaterializationSupportingBasis({ request: input.request, identity: input.identity, basisCatalog: bases }) !== null; }
export function selectOrdinaryMaterializationSupportingBasis({ request, identity,
  basisCatalog } = {}) {
  if (!Array.isArray(basisCatalog) || permissionsFor(identity, request) === null) return null;
  for (const basis of [...basisCatalog].sort((left, right) =>
    (left.state === 'prepared_seed' ? 0 : 1) - (right.state === 'prepared_seed' ? 0 : 1)
      || left.basis_ref.localeCompare(right.basis_ref))) {
    const candidate = record(basis, Object.getOwnPropertyNames(basis));
    if (!candidate) continue;
    try {
      validateSupportingBasisAdmission({ request, candidate: {
        supporting_basis_ref: candidate.basis_ref,
        functional_bucket: identity.functional_bucket,
        admission_class: identity.admission_class,
        availability_class: identity.availability_class
      }, basis_catalog: basisCatalog });
      return candidate.basis_ref;
    } catch {}
  }
  return null;
}
function permissionsFor(identity, request) { if (identity.admission_class === 'common_mundane') return identity.availability_class === 'common' ? [] : null; if (identity.admission_class === 'container_capable' || identity.availability_class !== 'context_bound') return null; const refs = request?.policy_refs?.context_bound_permission_refs; return Array.isArray(refs) && refs.length > 0 && new Set(refs).size === refs.length ? [...refs].sort() : null; }
function record(v, keys) { if (!v || typeof v !== 'object' || Array.isArray(v) || Object.getPrototypeOf(v) !== Object.prototype || Object.getOwnPropertySymbols(v).length) return null; const n = Object.getOwnPropertyNames(v); if (n.length !== keys.length || keys.some((k) => !n.includes(k))) return null; const out = {}; for (const k of keys) { const d = Object.getOwnPropertyDescriptor(v,k); if (d?.enumerable !== true || !Object.hasOwn(d,'value')) return null; out[k]=d.value; } return out; }
function mechanicsPolicyOf(value) { const policy=record(value,['policy_ref','max_mass_grams','allowed_external_hand_costs','allowed_carry_forms','max_packing_slot_cost','max_quantity']); return policy&&typeof policy.policy_ref==='string'&&policy.policy_ref.length>0&&Number.isSafeInteger(policy.max_mass_grams)&&policy.max_mass_grams>=1&&Array.isArray(policy.allowed_external_hand_costs)&&policy.allowed_external_hand_costs.length>0&&policy.allowed_external_hand_costs.every((entry)=>[0,1,2].includes(entry))&&new Set(policy.allowed_external_hand_costs).size===policy.allowed_external_hand_costs.length&&Array.isArray(policy.allowed_carry_forms)&&policy.allowed_carry_forms.length>0&&policy.allowed_carry_forms.every((entry)=>['compact','regular','long','bulky'].includes(entry))&&new Set(policy.allowed_carry_forms).size===policy.allowed_carry_forms.length&&Number.isSafeInteger(policy.max_packing_slot_cost)&&policy.max_packing_slot_cost>=0&&Number.isSafeInteger(policy.max_quantity)&&policy.max_quantity>=1?freeze(policy):null; }
function planErrors(plan,request,policy) { const errors=[...validateOrdinaryMaterializationPlanV1(plan,request)]; if(errors.length!==0||policy==null||plan?.resolution!=='materialize')return errors; const mechanics=plan.entities?.[0]?.mechanics_proposal; const checks=[['entities[0].mechanics_proposal.mass_grams',Number.isSafeInteger(mechanics?.mass_grams)&&mechanics.mass_grams>=1&&mechanics.mass_grams<=policy.max_mass_grams,`must be an integer from 1 to ${policy.max_mass_grams}`],['entities[0].mechanics_proposal.external_hand_cost',policy.allowed_external_hand_costs.includes(mechanics?.external_hand_cost),`must be one of ${policy.allowed_external_hand_costs.join(', ')}`],['entities[0].mechanics_proposal.carry_form',policy.allowed_carry_forms.includes(mechanics?.carry_form),`must be one of ${policy.allowed_carry_forms.join(', ')}`],['entities[0].mechanics_proposal.packing_slot_cost',Number.isSafeInteger(mechanics?.packing_slot_cost)&&mechanics.packing_slot_cost>=0&&mechanics.packing_slot_cost<=policy.max_packing_slot_cost,`must be an integer from 0 to ${policy.max_packing_slot_cost}`],['entities[0].mechanics_proposal.quantity.value',Number.isSafeInteger(mechanics?.quantity?.value)&&mechanics.quantity.value>=1&&mechanics.quantity.value<=policy.max_quantity,`must be an integer from 1 to ${policy.max_quantity}`]]; return checks.filter(([,pass])=>!pass).map(([path,,message])=>Object.freeze({path,code:'mechanics_policy',message:`${path} ${message}.`})); }
function jsonData(value, seen = new Set()) { if (value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) return true; if (!value || typeof value !== 'object' || seen.has(value) || Object.getOwnPropertySymbols(value).length) return false; const array = Array.isArray(value); if (array ? Object.getPrototypeOf(value) !== Array.prototype : Object.getPrototypeOf(value) !== Object.prototype) return false; seen.add(value); for (const key of Object.getOwnPropertyNames(value)) { if (array && key === 'length') continue; const descriptor = Object.getOwnPropertyDescriptor(value,key); if (descriptor?.enumerable !== true || !Object.hasOwn(descriptor,'value') || !jsonData(descriptor.value,seen)) return false; } seen.delete(value); return true; }
function scope(a,b) { const x=record(a,['entity_kind','entity_id']), y=record(b,['entity_kind','entity_id']); return !!x && !!y && x.entity_kind===y.entity_kind && x.entity_id===y.entity_id; }
function outcome(status, working_projection, reason) { return deepFreeze({ status, decision:null, pending_items_property_admission:null, reason, working_projection }); }
async function invoke(model, request, context, repair) { try { return await model(request, freeze(context)); } catch (e) { throw turnFailure('TURN_ORDINARY_PRESENCE_MODEL_FAILED', repair ? 'Repair failed.' : 'Model failed.', { cause:message(e) }); } }
async function invokeBeforeModel(beforeModel) { try { await beforeModel(); } catch (e) { throw turnFailure('TURN_ORDINARY_PRESENCE_CUTOVER_FAILED', 'Ordinary presence cutover failed.', { cause:message(e) }); } }
function decision(request, plan, repaired) { return deepFreeze({ schema:'ordinary_presence_resolution_decision_v1',request_id:request.request_id,scope_ref:freeze(request.scope_ref),resolution:plan.resolution,repaired }); }
function freeze(v) { return deepFreeze(structuredClone(v)); } function fail(code) { throw turnFailure(code, 'Stage B requires an exact committed server envelope.'); } function reject(code, m=code) { throw turnFailure('TURN_ORDINARY_PRESENCE_PLAN_REJECTED',m,{code}); } function message(e) { return e instanceof Error ? e.message : String(e); }
function withoutOrdinaryAggregate(value) { const { ordinary_materialization_aggregate: _aggregate, ...workingProjection } = value; return workingProjection; }
