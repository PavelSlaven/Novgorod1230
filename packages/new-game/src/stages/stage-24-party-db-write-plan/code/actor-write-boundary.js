import { validateActorBaseAppearance } from '@rus/actors';
import { sha256 } from '@rus/kernel';

export function approvedNpcBodyRows(npcs, partyId, changeSetId) {
  return npcs.filter((npc) => npc.body != null).map((npc) => ({
    party_id: partyId, actor_kind: 'npc', actor_id: npc.instance_id,
    body_profile_ref: { id: npc.body.profile_id, schema: npc.body.schema,
      revision: npc.body.version, digest: npc.body.record_digest },
    health: npc.body.values.health, energy: npc.body.values.energy,
    satiety: npc.body.values.satiety, state_version: 1,
    updated_change_set_id: changeSetId
  }));
}

export function approvedNpcConditionRows(npcs, partyId, changeSetId) {
  return npcs.filter((npc) => npc.body != null).flatMap((npc) =>
    (npc.body.condition_bindings ?? []).map((condition) => ({
      party_id: partyId, actor_kind: 'npc', actor_id: npc.instance_id,
      condition_id: `condition_${sha256([partyId, npc.instance_id,
        condition.state]).slice(0, 24)}`,
      condition_profile_ref: condition, status: 'active', state_version: 1,
      created_change_set_id: changeSetId, terminal_change_set_id: null
    })));
}

export function assertNoPortraitSpec(value) {
  if (containsKey(value, 'portrait_spec_v1')) {
    fail(
      'WRITE_PLAN_PORTRAIT_PROJECTION_FORBIDDEN',
      'portrait_spec_v1 is a read projection and cannot enter a party write plan.'
    );
  }
}

export function assertNewActorAppearance(
  identity,
  contractVersion,
  path,
  body = null,
  required = false
) {
  if (contractVersion !== 'actor_base_appearance_v1') {
    if (required) {
      fail('WRITE_PLAN_ACTOR_APPEARANCE_INCOMPLETE',
        `${path} must declare actor_base_appearance_v1.`);
    }
    return;
  }
  const validation = validateActorBaseAppearance(identity, {
    requireComplete: true,
    body
  });
  if (!validation.ok) {
    fail('WRITE_PLAN_ACTOR_APPEARANCE_INCOMPLETE',
      `${path} must contain a complete canonical actor appearance: ${validation.errors.join('; ')}`);
  }
}

function containsKey(value, key, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (Object.hasOwn(value, key)) return true;
  return Object.values(value).some((child) => containsKey(child, key, seen));
}

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}
