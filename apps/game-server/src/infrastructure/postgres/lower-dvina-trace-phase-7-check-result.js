import { stateModifier } from '@rus/body-state';
import { DC, attributeBonus, evaluateCheckOutcome } from '@rus/checks-rng';
import { canonicalDigest } from '@rus/materialization';

export function validTracePhase7ActorStepCheck(phase7, contracts, factual,
  state = null) {
  const plan = phase7.autonomous.proposal.plan;
  const check = phase7.actor_step_check;
  if (plan.resolution !== 'generic_check') return check === null;
  const request = check?.request;
  const result = check?.result;
  const expectedId = `${plan.root_turn_id}:step:${plan.decision_index}`;
  const context = contracts.genericCheckContext;
  const policy = contracts.genericCheckModifierPolicy;
  const attribute = context.attributes.find(({ attribute_ref: ref }) =>
    ref === plan.check.attribute_ref);
  const skill = plan.check.skill_ref == null ? null
    : context.skills.find(({ skill_ref: ref }) =>
      ref === plan.check.skill_ref);
  const npc = liveNpc(state, contracts.zhdanko);
  const body = authoritativeNpcCheckBody(npc);
  const loadCategory = authoritativeNpcLoadCategory(npc);
  if (body == null || loadCategory == null) return false;
  const relevantMetrics =
    policy.state_relevance_by_attribute[plan.check.attribute_ref];
  const expectedModifiers = {
    attribute: attributeBonus(attribute?.value),
    skill: skill?.value ?? 0,
    state: stateModifier(body, relevantMetrics),
    equipment: policy.load_category_modifiers[loadCategory],
    circumstances: 0
  };
  const total = result?.roll + Object.values(expectedModifiers).reduce(
    (sum, value) => sum + value, 0);
  const difficulty = DC[plan.check.difficulty_id];
  const outcome = evaluateCheckOutcome(result?.roll, total, difficulty);
  return request?.check_id === expectedId
    && result?.check_id === expectedId
    && request.difficulty === difficulty
    && request.policy_profile_ref === policy.profile_ref
    && canonicalDigest(request.policy_profile_pin)
      === canonicalDigest(policy.profile_pin)
    && canonicalDigest(request.check_policy_ref)
      === canonicalDigest(policy.check_policy_ref)
    && canonicalDigest(request.consequence_policy_ref)
      === canonicalDigest(policy.consequence_policy_ref)
    && request.step_plan_digest === canonicalDigest(plan)
    && request.check_plan_digest === canonicalDigest(plan.check)
    && request.outcome_map_digest === canonicalDigest(plan.check.outcomes)
    && Number.isInteger(result?.roll) && result.roll >= 1 && result.roll <= 20
    && canonicalDigest(result.modifiers) === canonicalDigest(expectedModifiers)
    && result.total === total
    && result.difficulty === difficulty
    && canonicalDigest(result.outcome) === canonicalDigest(outcome)
    && validCheckAudit(result.audit, result.roll, factual.player_input);
}

function liveNpc(state, fallback) {
  if (state?.npcs == null) return fallback;
  const match = state.npcs.find(
    ({ instance_id: id }) => id === fallback?.instance_id
  );
  return match ?? fallback;
}

function authoritativeNpcCheckBody(npc) {
  const metrics = npc?.check_body_state;
  const health = Number(metrics?.health);
  const satiety = Number(metrics?.satiety);
  const energy = Number(metrics?.energy);
  if (![health, satiety, energy].every(Number.isFinite)
      || !Array.isArray(metrics?.active_conditions)) {
    return null;
  }
  return {
    health,
    satiety,
    energy,
    active_conditions: structuredClone(metrics.active_conditions)
  };
}

function authoritativeNpcLoadCategory(npc) {
  const fromMachine = npc?.machine_state?.load_category;
  if (typeof fromMachine === 'string' && fromMachine.length > 0) {
    return fromMachine;
  }
  const fromInventory = npc?.inventory?.load_category;
  if (typeof fromInventory === 'string' && fromInventory.length > 0) {
    return fromInventory;
  }
  return null;
}

function validCheckAudit(audit, roll, playerInput) {
  const common = audit?.die === 'd20'
    && audit.value === roll
    && audit.formula
      === 'd20 + attribute + skill + state + equipment + circumstances';
  if (!common) return false;
  if (audit.rng_mode === 'explicit_rng') {
    return audit.algorithm === null && audit.seed_ref === null
      && audit.counter === null;
  }
  const seedRef = canonicalDigest({
    schema: 'rus.lower_dvina_trace_phase_2_rng_identity.v1',
    party_id: playerInput.party_id,
    request_id: playerInput.request_id,
    idempotency_key: playerInput.idempotency_key
  });
  return audit.rng_mode === 'seeded'
    && audit.algorithm === 'mulberry32_v1'
    && audit.seed_ref === seedRef
    && audit.counter === 0;
}
