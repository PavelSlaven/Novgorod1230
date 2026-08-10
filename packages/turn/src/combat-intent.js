import { deepFreeze } from '@rus/kernel';
import { validateCombatIntent } from '@rus/combat-health';
export function combatIntentFromPlan(plan, options = {}) {
  const operation = plan?.operation;
  return buildCombatIntent(operation, {
    combat_id: plan?.combat_id,
    intent_id: options.intent_id,
    actor_ref: plan?.npc_ref,
    created_from_boundary_ref: options.created_from_boundary_ref,
    state_version: options.state_version,
    expected_op: 'set_combat_intent'
  });
}
export function combatIntentFromOperation(operation, {
  combat_id,
  intent_id,
  created_from_boundary_ref,
  state_version = '1'
} = {}) {
  return buildCombatIntent(operation, { combat_id, intent_id,
    actor_ref: operation?.actor_ref, created_from_boundary_ref, state_version,
    expected_op: 'request_combat' });
}

function buildCombatIntent(operation, input) {
  const value = { schema: 'combat_intent_v1', intent_id: input.intent_id,
    combat_id: input.combat_id, actor_ref: structuredClone(input.actor_ref),
    intent_kind: operation?.intent_kind, target_refs: structuredClone(operation?.target_refs ?? []),
    protected_refs: structuredClone(operation?.protected_refs ?? []), scope_ref: structuredClone(operation?.scope_ref ?? null),
    destination_ref: structuredClone(operation?.destination_ref ?? null), force_limit: operation?.force_limit,
    risk_posture: operation?.risk_posture, persistence: 'until_decision_boundary',
    created_from_boundary_ref: structuredClone(input.created_from_boundary_ref), state_version: String(input.state_version ?? '1'), status: 'active' };
  if (operation?.op !== input.expected_op || !validateCombatIntent(value)) throw Object.assign(new Error('invalid combat intent'), { code: 'TURN_COMBAT_INTENT_INVALID' });
  return deepFreeze(value);
}

export function installCombatIntent(session, intent) {
  if (!validateCombatIntent(intent) || session?.combat_id !== intent.combat_id) throw Object.assign(new Error('invalid combat intent'), { code: 'TURN_COMBAT_INTENT_INVALID' });
  const next = structuredClone(session);
  const participant = next.participant_states.find((entry) => entry.actor_ref.entity_kind === intent.actor_ref.entity_kind && entry.actor_ref.entity_id === intent.actor_ref.entity_id);
  if (!participant) throw Object.assign(new Error('combat actor unavailable'), { code: 'TURN_COMBAT_ACTOR_NOT_ACTIVE' });
  participant.current_intent = structuredClone(intent);
  return deepFreeze(next);
}
