import { deepFreeze } from '@rus/kernel';
import { validateNpcCombatDecisionRequest, validateNpcCombatIntentPlan } from '@rus/contracts/combat-v1';
export { validateNpcCombatDecisionRequest, validateNpcCombatIntentPlan };
export function buildNpcCombatDecisionRequest(value={}){if(!validateNpcCombatDecisionRequest(value))throw new TypeError('invalid NPC combat request');return deepFreeze(structuredClone(value));}
export function buildNpcCombatIntentPlan(value={},request){if(!validateNpcCombatIntentPlan(value,request))throw new TypeError('invalid NPC combat plan');return deepFreeze(structuredClone(value));}

export function validateNpcCombatPlanApplicability(plan, request) {
  if (!validateNpcCombatIntentPlan(plan, request)) {
    return rejected('NPC_COMBAT_PLAN_STRUCTURAL_INVALID');
  }
  const operation = plan.operation;
  const contract = request.operation_contract;
  const allowedRefs = refsForIntent(contract, operation.intent_kind);
  const selectedRefs = selectedRefsForIntent(operation);
  if (!contract.allowed_intent_kinds?.includes(operation.intent_kind)
      || !contract.allowed_force_limits?.includes(operation.force_limit)
      || !contract.allowed_risk_postures?.includes(operation.risk_posture)
      || (operation.intent_kind === 'surrender'
        && contract.surrender_available !== true)
      || (operation.intent_kind === 'cease_hostility'
        && contract.cease_hostility_available !== true)
      || (plan.combat_statement !== null
        && contract.combat_statement_available !== true)
      || selectedRefs.some((selected) =>
        !allowedRefs.some((allowed) => sameRef(selected, allowed)))) {
    return rejected('NPC_COMBAT_OPERATION_NOT_APPLICABLE');
  }
  return { pass: true, errors: [] };
}

function refsForIntent(contract, intentKind) {
  const fields = {
    engage: 'engageable_actor_refs',
    control: 'controllable_actor_refs',
    protect: 'protectable_refs',
    hold: 'holdable_scope_refs',
    reach: 'reachable_destination_refs',
    break_contact: 'break_contact_destination_refs'
  };
  return structuredClone(contract?.[fields[intentKind]] ?? []);
}

function selectedRefsForIntent(operation) {
  if (['engage', 'control'].includes(operation.intent_kind)) {
    return operation.target_refs;
  }
  if (operation.intent_kind === 'protect') {
    return [...operation.protected_refs,
      ...(operation.scope_ref ? [operation.scope_ref] : [])];
  }
  if (operation.intent_kind === 'hold') return [operation.scope_ref];
  if (['reach', 'break_contact'].includes(operation.intent_kind)) {
    return operation.destination_ref ? [operation.destination_ref] : [];
  }
  return [];
}

function sameRef(left, right) {
  return left?.entity_kind === right?.entity_kind
    && left?.entity_id === right?.entity_id;
}

function rejected(code) {
  return {
    pass: false,
    errors: [{ code, category: 'applicability', retryable: false }]
  };
}
