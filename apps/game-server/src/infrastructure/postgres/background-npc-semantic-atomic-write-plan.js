import { canonicalDigest } from '@rus/materialization';
import { validateNpcOrdinarySemanticRemainder } from '@rus/npc-runtime';

const KEYS = ['schema', 'party_id', 'base_party_state_version',
  'change_set_id', 'causal_identity', 'npc_ref', 'formal_state_digest',
  'remainder'];

export function createBackgroundNpcSemanticAtomicWritePlan(input) {
  const plan = clone(input);
  if (!exact(plan, KEYS)
      || plan.schema !== 'background_npc_semantic_atomic_write_plan_v1'
      || !text(plan.party_id) || !text(plan.change_set_id)
      || !integer(plan.base_party_state_version, 0)
      || !identity(plan.causal_identity) || !text(plan.npc_ref)
      || !digest(plan.formal_state_digest)
      || !validateNpcOrdinarySemanticRemainder(plan.remainder)
      || plan.remainder.npc_ref !== plan.npc_ref
      || plan.causal_identity.npc_ref !== plan.npc_ref) fail();
  return freeze(plan);
}

export function backgroundNpcSemanticPhysicalKeys(input) {
  if (input == null) return [];
  const plan = createBackgroundNpcSemanticAtomicWritePlan(input);
  return [`party_runtime.party_npcs:${plan.npc_ref}`];
}

export function applyBackgroundNpcSemanticPlan({ plan: input, state,
  snapshot }) {
  const plan = createBackgroundNpcSemanticAtomicWritePlan(input);
  const current = exactNpc(state?.npcs, plan.npc_ref);
  if (plan.party_id !== (state?.party_state?.party_id ?? state?.party_id)
      || plan.base_party_state_version !== state?.party_state?.state_version
      || current.profile_level !== 'background'
      || canonicalDigest(formalNpcState(current)) !== plan.formal_state_digest
      || current.semantic_state?.n1_remainder != null) fail();
  const nextNpc = { ...structuredClone(current), semantic_state: {
    ...structuredClone(current.semantic_state ?? {}),
    n1_remainder: structuredClone(plan.remainder) } };
  const index = snapshot.npcs.findIndex((npc) => npcId(npc) === plan.npc_ref);
  if (index < 0) fail();
  snapshot.npcs[index] = nextNpc;
  return { target_table: 'party_npcs', id: plan.npc_ref, record: {
    party_id: plan.party_id, npc_id: plan.npc_ref,
    semantic_state: structuredClone(nextNpc.semantic_state),
    updated_change_set_id: plan.change_set_id } };
}

export function backgroundNpcFormalStateDigest(npc) {
  return canonicalDigest(formalNpcState(npc));
}

function formalNpcState(npc) {
  return {
    npc_id: npcId(npc),
    participant_slot_ref: npc.participant_slot_ref
      ?? npc.semantic_state?.participant_slot_ref,
    profile_id: npc.profile_id ?? npc.profile_set_id,
    profile_revision: npc.profile_revision
      ?? npc.semantic_state?.profile_revision,
    profile_level: npc.profile_level,
    anchor_id: npc.anchor_id,
    location_profile_ref: npc.location_profile_ref
      ?? npc.semantic_state?.location_profile_ref,
    zone_ref: npc.zone_ref ?? npc.semantic_state?.zone_ref,
    role_ref: npc.role_ref,
    occupation_ref: npc.occupation_ref,
    identity_state: structuredClone(npc.identity_state),
    machine_state: structuredClone(npc.machine_state)
  };
}
function exactNpc(npcs, ref) {
  const matches = (npcs ?? []).filter((npc) => npcId(npc) === ref);
  if (matches.length !== 1) fail();
  return matches[0];
}
function npcId(npc) { return npc?.instance_id ?? npc?.npc_id; }
function identity(value) { return exact(value,
  ['request_id', 'root_turn_id', 'step_index', 'actor_ref', 'npc_ref'])
  && ['request_id', 'root_turn_id', 'actor_ref', 'npc_ref'].every((key) =>
    text(value[key])) && integer(value.step_index, 1) && value.step_index <= 8; }
function exact(value, keys) { return value != null && typeof value === 'object'
  && !Array.isArray(value) && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key)); }
function text(value) { return typeof value === 'string'
  && value.trim() === value && value.length > 0; }
function digest(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value); }
function integer(value, min) { return Number.isSafeInteger(value) && value >= min; }
function clone(value) { try { return structuredClone(value); } catch { fail(); } }
function freeze(value) { if (value && typeof value === 'object'
  && !Object.isFrozen(value)) { Object.values(value).forEach(freeze);
  Object.freeze(value); } return value; }
function fail() { throw Object.assign(new Error('BACKGROUND_NPC_SEMANTIC_PLAN_INVALID'),
  { code: 'BACKGROUND_NPC_SEMANTIC_PLAN_INVALID' }); }
