import { computeSpatialV3CanonicalDigest as digest } from
  '@rus/contracts/spatial-v3/registry';
import { createLocalFireAtomicWritePlan } from
  '../../infrastructure/postgres/local-fire-atomic-write-plan.js';
import { loadLocalFireCommittedContext } from
  '../../infrastructure/postgres/local-fire-persistence.js';

export function createLowerDvinaTraceF1ProductionResolverFactory({
  pool, loadedProfile
} = {}) {
  const profile = requireProfile(loadedProfile);
  if (!pool?.query) throw new TypeError('F1 PostgreSQL pool is required.');
  return ({ partyId }) => async function resolveLocalFire(envelope) {
    const operation = envelope.operation;
    const marker = markerFrom(envelope.request?.player_safe_state);
    const actorRef = envelope.actor?.actor_id;
    const action = operation?.process_action === 'start' ? 'start'
      : operation?.process_action === 'affect' ? 'add_fuel' : null;
    const sourceRefs = operation?.source_refs;
    if (operation?.op !== 'request_world_process'
        || operation.process_kind !== 'fire' || action === null
        || operation.actor_ref !== actorRef || !text(actorRef)
        || marker?.semantic_grounding_available !== true
        || marker.context_ref !== profile.context_ref
        || !Array.isArray(sourceRefs) || sourceRefs.length === 0
        || sourceRefs.some((ref) => !marker.approved_fuel_refs.includes(ref))
        || (action === 'start'
          ? operation.process_ref !== null
            || !same(operation.target_refs, [marker.ignition_basis_ref])
          : !text(operation.process_ref)
            || !marker.active_process_refs.includes(operation.process_ref)
            || operation.target_refs.length !== 0)) fail('TRACE_F1_SCOPE_INVALID');
    const loaded = await loadLocalFireCommittedContext({ client: pool,
      partyId, actorRef, contextRef: profile.context_ref,
      fuelItemIds: sourceRefs, processRef: operation.process_ref });
    const authority = loaded.authority_pin.persisted_row;
    if (authority.profile_ref !== profile.profile_id
        || authority.profile_version !== String(profile.revision)
        || authority.policy_ref !== profile.policy_ref
        || authority.policy_version !== profile.policy_version
        || authority.ignition_basis_item_id !== marker.ignition_basis_ref) {
      fail('TRACE_F1_AUTHORITY_STALE');
    }
    const rootTurnId = envelope.request.root_turn_id;
    const stepIndex = envelope.request.step_index;
    const stateVersion = Number(envelope.request.committed_state_version);
    const turnNumber = Number(envelope.committed_state?.party_state?.turn_number)
      + 1;
    const actionRef = `local-fire-action:${digest({
      domain: 'rus.world_processes.local_fire.trace_action_ref.v1',
      root_turn_id: rootTurnId, step_index: stepIndex,
      approved_plan: envelope.plan
    })}`;
    const plan = createLocalFireAtomicWritePlan({
      schema: 'local_fire_atomic_write_request_v1', party_id: partyId,
      base_party_state_version: stateVersion,
      change_set_id: `change:${partyId}:turn-step:${turnNumber}`,
      actor_ref: actorRef, authority_pin: loaded.authority_pin,
      ignition_basis_pin: loaded.ignition_basis_pin,
      process_state: loaded.process_state, fuel_pins: loaded.fuel_pins,
      action, at_timestamp: envelope.committed_state.clock,
      causal_identity: { request_id: envelope.request.request_id,
        root_turn_id: rootTurnId, action_ref: actionRef,
        step_index: stepIndex }
    });
    return Object.freeze({
      working_projection: structuredClone(envelope.working_projection),
      summary: action === 'start' ? 'local_fire:started' : 'local_fire:fuel_added',
      write_fragments: [], local_fire_atomic_write_plan: plan,
      player_response_boundary: true
    });
  };
}

export function projectLowerDvinaTraceF1Capability({ playerSafeState,
  committedState, loadedProfile, resolverAvailable }) {
  const profile = loadedProfile?.profile;
  const authority = committedState?.local_fire_authority;
  const visibleItemIds = new Set((playerSafeState?.items ?? [])
    .map((item) => item?.item_id ?? item?.instance_id)
    .filter(text));
  const currentScope = committedState?.position?.g5_anchor_id
    ?? committedState?.position?.anchor_id
    ?? committedState?.position?.location_ref;
  const active = (committedState?.local_fire_runtime ?? [])
    .map(({ process_state: state }) => state)
    .filter((state) => state?.status === 'active')
    .map(({ process_ref: ref }) => ref);
  const visibleApproved = (authority?.approved_fuel_item_ids ?? [])
    .filter((id) => visibleItemIds.has(id));
  if (!resolverAvailable || profile?.status !== 'approved'
      || authority?.status !== 'committed'
      || authority.context_ref !== profile.context_ref
      || authority.profile_ref !== profile.profile_id
      || authority.profile_version !== String(profile.revision)
      || currentScope !== authority.scope_ref
      || !visibleItemIds.has(authority.ignition_basis_item_id)
      || visibleApproved.length === 0 && active.length === 0) {
    return structuredClone(playerSafeState);
  }
  return { ...structuredClone(playerSafeState), local_world_process: {
    semantic_grounding_available: true, context_ref: authority.context_ref,
    ignition_basis_ref: authority.ignition_basis_item_id,
    approved_fuel_refs: visibleApproved,
    active_process_refs: active
  } };
}

function markerFrom(state) {
  if (!state || typeof state !== 'object') return null;
  const descriptor = Object.getOwnPropertyDescriptor(state,
    'local_world_process');
  if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) return null;
  const value = descriptor.value;
  const keys = ['semantic_grounding_available','context_ref',
    'ignition_basis_ref','approved_fuel_refs','active_process_refs'];
  return value && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value,key)) ? value : null;
}
function requireProfile(value) {
  if (value?.schema !== 'rus.lower_dvina_trace_f1_loaded_profile.v1'
      || value.profile?.schema
        !== 'rus.lower_dvina_trace_local_fire_profile.v1'
      || value.profile.status !== 'approved') {
    throw new TypeError('Exact loaded F1 profile is required.');
  }
  return value.profile;
}
function same(a,b) { return JSON.stringify(a) === JSON.stringify(b); }
function text(value) { return typeof value === 'string' && value.length > 0; }
function fail(code) { throw Object.assign(new Error(code), { code }); }
