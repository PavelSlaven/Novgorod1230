import { canonicalDigest } from '@rus/materialization';
import { createLowerDvinaTraceOrdinaryDiscoveryResolver } from
  '../lower-dvina-trace-ordinary-discovery.js';

export const LOWER_DVINA_TRACE_N1_ACTIVE_AUTHORITY = Object.freeze({
  profile_digest:'cbaea7a2b59e6c46dadb66ac8369d4653b525c9e1827039bf640082a17eed887',
  profile_canonical_digest:'9a87e6530680f969f597c7725f5ff5496f92f7e7709b2503c3b420b73811d3e8',
  m12_manifest_digest:'d3999a1d2dc26d5c57fe1d47891779ee5da062fa46ba978170cf7925925a967e',
  phase_1a_manifest_digest:'60ebc56de5d04bf91ccd61899d8206d016b3d182157dd523d311aafd244460fd',
  phase_1b_manifest_digest:'7de7a6ffe20750755e7654ad00461ab6c2f4244df5220c1ba862aad6ce99c306',
  phase_1b_binding_digest:'3a64bdc5f22db19417d2ca09d70bc43a68ec4fdb052aa518e8aa728b1db84127'
});

export function createLowerDvinaTraceN1ProductionOwnerFactory({
  loadedProfile, loadEnablement, ordinaryMaterializationModel
} = {}) {
  const authority = validateLoadedProfile(loadedProfile);
  if (typeof loadEnablement !== 'function'
      || typeof ordinaryMaterializationModel !== 'function') {
    throw new TypeError('N1 requires O1 authority and semantic model ports');
  }
  return ({ partyId, inputDigest }) => {
    const capability = (rawInput) => {
      const state=snapshotField(rawInput,'state'),
        contracts=snapshotField(rawInput,'contracts');
      if(state==null||contracts==null)return null;
      const pin = objectivePin({ state, contracts,
        authority });
      return pin == null ? null : Object.freeze({
        operation_contract: Object.freeze({
          owner: '@rus/materialization',
          actor_scope: 'npc_subjective_and_objective_revalidated',
          allowed: Object.freeze([{
            actor_ref: pin.npc_ref,
            discovery_kind: authority.profile.discovery.discovery_kind,
            target_refs: Object.freeze([pin.target_ref])
          }]),
          factual_outcome_write: 'owner_only'
        }),
        objective_pin: pin
      });
    };
    return Object.freeze({
    capability,
    async resolve(rawInput) {
      const state=snapshotField(rawInput,'state'),
        contracts=snapshotField(rawInput,'contracts'),
        rawExecution=dataField(rawInput,'execution');
      if(state==null||contracts==null||rawExecution==null)
        fail('N1_OBJECTIVE_STALE');
      const operation=snapshotField(rawExecution,'operation'),
        request=snapshotField(rawExecution,'request');
      if(operation==null)fail('N1_OPERATION_SNAPSHOT_INVALID');
      if(request==null)fail('N1_REQUEST_SNAPSHOT_INVALID');
      const execution={operation,request,working_projection:{}};
      const available = capability({ state, contracts });
      if (available == null || operation?.op !== 'request_discovery'
          || operation.actor_ref !== available.objective_pin.npc_ref
          || operation.discovery_kind
            !== authority.profile.discovery.discovery_kind
          || !same(operation.target_refs,
            [available.objective_pin.target_ref])) fail('N1_OBJECTIVE_STALE');
      const ordinary = createLowerDvinaTraceOrdinaryDiscoveryResolver({
        partyId, inputDigest, loadEnablement, ordinaryMaterializationModel
      });
      const result = await ordinary({
        ...structuredClone(execution),
        committed_state: {
          party_id: partyId,
          party_state: structuredClone(state.party_state),
          position: {
            g6_id: available.objective_pin.scope_ref.entity_id,
            g6_ref: available.objective_pin.scope_ref.entity_id
          }
        }
      });
      if (result?.ordinary_materialization_atomic_write_plan == null) {
        fail('N1_ORDINARY_RESULT_UNAVAILABLE');
      }
      return Object.freeze({
        ordinary_materialization_atomic_write_plan:
          structuredClone(result.ordinary_materialization_atomic_write_plan),
        objective_pin: available.objective_pin
      });
    }
  }); };
}

export function validateLowerDvinaTraceN1Profile(profile) {
  const expected = ['schema','profile_id','revision','status',
    'scenario_definition_revision','boundary','discovery','ordinary_scope',
    'disabled_owner_kinds','fallback_policy'];
  return exact(profile, expected)
    && profile.schema === 'rus.lower_dvina_trace_n1_npc_semantic_profile.v1'
    && profile.profile_id === 'lower_dvina_trace_n1_zhdanko_o1_profile_v1'
    && profile.revision === 1 && profile.status === 'approved'
    && profile.scenario_definition_revision === 24
    && exact(profile.boundary, ['phase_ref','participant_slot_ref',
      'npc_profile_set_ref','location_profile_ref','zone_ref','required_status'])
    && profile.boundary.phase_ref === 'trace_phase_7_autonomous_boundary'
    && valuesText(profile.boundary)
    && exact(profile.discovery, ['operation','discovery_kind','target_ref',
      'access_policy_ref'])
    && profile.discovery.operation === 'request_discovery'
    && profile.discovery.discovery_kind === 'look'
    && valuesText(profile.discovery)
    && exact(profile.ordinary_scope, ['entity_kind','entity_id','position_ref'])
    && profile.ordinary_scope.entity_kind === 'g6'
    && profile.ordinary_scope.entity_id === profile.boundary.location_profile_ref
    && profile.ordinary_scope.position_ref === profile.discovery.target_ref
    && Array.isArray(profile.disabled_owner_kinds)
    && same(profile.disabled_owner_kinds, ['o2a','o2b','a1','f1','s1'])
    && profile.fallback_policy === 'forbidden';
}

export function validateLowerDvinaTraceN1LoadedProfile(value) {
  try { validateLoadedProfile(value); return true; } catch { return false; }
}

export function validateLowerDvinaTraceN1ObjectivePin({
  pin: rawPin, authority: rawAuthority, operation: rawOperation
} = {}) {
  const pin = strictSnapshot(rawPin), operation = strictSnapshot(rawOperation);
  let authority;
  try { authority = validateLoadedProfile(rawAuthority); } catch { return false; }
  const profile = authority.profile;
  if (pin == null || operation == null || !exact(pin, [
    'schema','profile_ref','profile_version','profile_digest',
    'profile_canonical_digest','npc_ref','participant_slot_ref',
    'npc_profile_set_ref','location_profile_ref','zone_ref','required_status',
    'target_ref','access_policy_ref','scope_ref','objective_digest'
  ]) || !exact(operation, ['op','actor_ref','discovery_kind','target_refs','query'])
      || pin.schema !== 'lower_dvina_trace_n1_objective_pin_v1'
      || !digest(pin.objective_digest) || operation.op !== 'request_discovery'
      || operation.actor_ref !== pin.npc_ref || !text(operation.query)
      || operation.discovery_kind !== profile.discovery.discovery_kind
      || !same(operation.target_refs, [profile.discovery.target_ref])
      || pin.profile_ref !== profile.profile_id
      || pin.profile_version !== profile.revision
      || pin.profile_digest !== authority.artifact_digest
      || pin.profile_canonical_digest !== authority.profile_canonical_digest
      || pin.participant_slot_ref !== profile.boundary.participant_slot_ref
      || pin.npc_profile_set_ref !== profile.boundary.npc_profile_set_ref
      || pin.location_profile_ref !== profile.boundary.location_profile_ref
      || pin.zone_ref !== profile.boundary.zone_ref
      || pin.required_status !== profile.boundary.required_status
      || pin.target_ref !== profile.discovery.target_ref
      || pin.access_policy_ref !== profile.discovery.access_policy_ref
      || canonicalDigest(pin.scope_ref) !== canonicalDigest(profile.ordinary_scope)) {
    return false;
  }
  const { objective_digest: ignored, ...unsigned } = pin;
  return pin.objective_digest === canonicalDigest(unsigned);
}

function validateLoadedProfile(value) {
  const snapshot = strictSnapshot(value);
  if (snapshot == null || !exact(snapshot, ['schema','artifact_digest',
    'profile_canonical_digest','publication_identity','profile'])
    || snapshot.schema !== 'rus.lower_dvina_trace_n1_loaded_profile.v1'
    || snapshot.artifact_digest
      !== LOWER_DVINA_TRACE_N1_ACTIVE_AUTHORITY.profile_digest
    || snapshot.profile_canonical_digest !== canonicalDigest(snapshot.profile)
    || snapshot.profile_canonical_digest
      !== LOWER_DVINA_TRACE_N1_ACTIVE_AUTHORITY.profile_canonical_digest
    || !exact(snapshot.publication_identity, ['profile_digest',
      'profile_canonical_digest','m12_manifest_digest',
      'phase_1a_manifest_digest','phase_1b_manifest_digest',
      'phase_1b_binding_digest'])
    || !Object.values(snapshot.publication_identity).every(digest)
    || snapshot.publication_identity.profile_digest !== snapshot.artifact_digest
    || snapshot.publication_identity.profile_canonical_digest
      !== snapshot.profile_canonical_digest
    || canonicalDigest(snapshot.publication_identity)
      !== canonicalDigest(LOWER_DVINA_TRACE_N1_ACTIVE_AUTHORITY)
    || !validateLowerDvinaTraceN1Profile(snapshot.profile)) {
    fail('N1_PROFILE_INVALID');
  }
  return freeze(snapshot);
}

function objectivePin({ state, contracts, authority }) {
  if (canonicalDigest(contracts?.npcSemanticProfile)
      !== authority.profile_canonical_digest) return null;
  const expected = authority.profile.boundary;
  const matches = (state?.npcs ?? []).filter((npc) =>
    npc?.participant_slot_ref === expected.participant_slot_ref);
  if (matches.length !== 1) return null;
  const npc = matches[0], machine = npc.machine_state ?? {};
  const location = machine.location_ref ?? npc.location_profile_ref;
  const zone = machine.spatial_zone_ref ?? npc.zone_ref;
  if ((npc.profile_set_id ?? npc.profile_id) !== expected.npc_profile_set_ref
      || location !== expected.location_profile_ref
      || zone !== expected.zone_ref
      || machine.status !== expected.required_status) return null;
  const pin = {
    schema: 'lower_dvina_trace_n1_objective_pin_v1',
    profile_ref: authority.profile.profile_id,
    profile_version: authority.profile.revision,
    profile_digest: authority.artifact_digest,
    profile_canonical_digest: authority.profile_canonical_digest,
    npc_ref: npc.instance_id,
    participant_slot_ref: expected.participant_slot_ref,
    npc_profile_set_ref: expected.npc_profile_set_ref,
    location_profile_ref: location,
    zone_ref: zone,
    required_status: expected.required_status,
    target_ref: authority.profile.discovery.target_ref,
    access_policy_ref: authority.profile.discovery.access_policy_ref,
    scope_ref: structuredClone(authority.profile.ordinary_scope)
  };
  return freeze({ ...pin, objective_digest: canonicalDigest(pin) });
}

function exact(value, keys) { return value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value,key)); }
function valuesText(value) { return Object.values(value).every(text); }
function text(value) { return typeof value === 'string'
  && value.trim() === value && value.length > 0; }
function digest(value) { return typeof value === 'string'
  && /^[a-f0-9]{64}$/u.test(value); }
function same(left,right) { return Array.isArray(left)&&Array.isArray(right)
  && left.length===right.length&&left.every((entry,index)=>entry===right[index]); }
function fail(code) { throw Object.assign(new Error(code), { code }); }
function freeze(value) { if(value&&typeof value==='object'&&!Object.isFrozen(value)){
  Object.values(value).forEach(freeze);Object.freeze(value);}return value; }
function strictSnapshot(input) { const seen=new Set(); function copy(value){
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number')return Number.isFinite(value)?value:BAD;
  if(typeof value!=='object'||seen.has(value)||Object.getOwnPropertySymbols(value).length)return BAD;
  const array=Array.isArray(value);if(Object.getPrototypeOf(value)!==(array?Array.prototype:Object.prototype))return BAD;
  seen.add(value);const out=array?[]:{};for(const key of Object.getOwnPropertyNames(value)){
    if(array&&key==='length')continue;const descriptor=Object.getOwnPropertyDescriptor(value,key);
    if(descriptor?.enumerable!==true||!Object.hasOwn(descriptor,'value'))return BAD;
    const child=copy(descriptor.value);if(child===BAD)return BAD;out[key]=child;}return out;}
  const result=copy(input);return result===BAD?null:result; }
const BAD=Symbol('bad');
function dataField(value,key){if(value===null||typeof value!=='object'
  ||Array.isArray(value)||Object.getPrototypeOf(value)!==Object.prototype
  ||Object.getOwnPropertySymbols(value).length)return null;
  const descriptor=Object.getOwnPropertyDescriptor(value,key);
  return descriptor?.enumerable===true&&Object.hasOwn(descriptor,'value')
    ?descriptor.value:null;}
function snapshotField(value,key){const raw=dataField(value,key);
  return raw==null?null:strictSnapshot(raw);}
