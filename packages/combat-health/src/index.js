import { deepFreeze } from '@rus/kernel';
import { validateCombatSession as sessionValid, validateCombatIntent as intentValid, validateCombatTechnicalStepProposal, validateCombatExchangeProposal } from '@rus/contracts/combat-v1';
export const validateCombatSession=sessionValid;
export const validateCombatIntent=intentValid;

export function combatQualityFromMargin(margin) {
  const value = Number(margin);
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value >= 15) return 4;
  if (value >= 10) return 3;
  if (value >= 5) return 2;
  return 1;
}

export function combatHealthLossFromDamageScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value) || value <= 1) return 0;
  if (value <= 3) return 5;
  if (value <= 5) return 12;
  if (value <= 7) return 25;
  return 45;
}

export function combatInjuryProfileFromDamageScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value) || value <= 1) return null;
  if (value <= 3) return deepFreeze({ severity:1, bleeding:0, label:'лёгкая рана' });
  if (value <= 5) return deepFreeze({ severity:2, bleeding:1, label:'средняя рана' });
  if (value <= 7) return deepFreeze({ severity:3, bleeding:2, label:'тяжёлая рана' });
  return deepFreeze({ severity:4, bleeding:3, label:'критическая рана' });
}

export function buildAttackRequest(input = {}) {
  return deepFreeze({
    attacker_id: text(input.attacker_id) || null,
    target_id: text(input.target_id) || null,
    action: text(input.action) || 'attack',
    attribute_value: finite(input.attribute_value),
    skill_bonus: finite(input.skill_bonus) ?? 0,
    state_modifier: finite(input.state_modifier) ?? 0,
    equipment_modifier: finite(input.equipment_modifier) ?? 0,
    circumstance_modifier: finite(input.circumstance_modifier) ?? 0,
    target_defense: finite(input.target_defense),
    weapon_danger: finite(input.weapon_danger) ?? 0,
    target_protection: finite(input.target_protection) ?? 0,
    target_vulnerability: finite(input.target_vulnerability) ?? 0,
    focus: input.focus && typeof input.focus === 'object' ? structuredClone(input.focus) : null
  });
}

export function buildHarmPackage(attackResult = {}, request = {}) {
  const quality = combatQualityFromMargin(attackResult.margin ?? (Number(attackResult.total) - Number(request.target_defense)));
  const damageScore = Math.max(0, quality + (finite(request.weapon_danger) ?? 0) + (finite(request.target_vulnerability) ?? 0) - (finite(request.target_protection) ?? 0));
  return deepFreeze({
    target_id: text(request.target_id) || null,
    quality,
    damage_score: damageScore,
    health_loss: combatHealthLossFromDamageScore(damageScore),
    injury: combatInjuryProfileFromDamageScore(damageScore),
    focus: request.focus ? structuredClone(request.focus) : null
  });
}
export function buildCombatStepHarmPackage({check_result,attack_request}={}){if(!check_result||!attack_request)throw new TypeError('resolved check and attack request required');const r=check_result.outcome??check_result;if(r.success===false)return deepFreeze({target_id:text(attack_request.target_id)||null,quality:0,damage_score:0,health_loss:0,injury:null,focus:attack_request.focus?structuredClone(attack_request.focus):null});return buildHarmPackage(r,attack_request);}
export function buildCombatTechnicalStepProposal({session,intent,preconditions_digest,execution_profile={}}={}){if(!sessionValid(session)||!intentValid(intent)||intent.combat_id!==session.combat_id||!text(preconditions_digest))throw new TypeError('matching combat session, intent and digest required');const step_kind=intent.intent_kind==='engage'?'attack':intent.intent_kind;const proposal_id=`combat-step:${session.combat_id}:${session.exchange_ordinal}:${intent.intent_id}`;const v={schema:'combat_technical_step_proposal_v1',proposal_id,combat_id:session.combat_id,exchange_ordinal:session.exchange_ordinal,actor_ref:structuredClone(intent.actor_ref),intent_ref:{entity_kind:'combat_intent',entity_id:intent.intent_id},step_kind,check_request:execution_profile.check_request??null,preconditions_digest,idempotency_key:proposal_id};if(!validateCombatTechnicalStepProposal(v))throw new TypeError('invalid technical step');return deepFreeze(v);}
export function buildCombatExchangeProposal({session,technical_steps,intents,preconditions_digest}={}){const steps=technical_steps??(intents??[]).map(intent=>buildCombatTechnicalStepProposal({session,intent,preconditions_digest}));const proposal_id=`combat-exchange:${session?.combat_id}:${session?.exchange_ordinal}`;const v={schema:'combat_exchange_proposal_v1',proposal_id,combat_id:session?.combat_id,exchange_ordinal:session?.exchange_ordinal,technical_steps:steps,preconditions_digest,idempotency_key:proposal_id};if(!validateCombatExchangeProposal(v))throw new TypeError('invalid combat exchange');return deepFreeze(v);}
export function buildCombatOutcomeEvents({combat_id,technical_step,check_result=null,harm_package=null}={}){if(!validateCombatTechnicalStepProposal(technical_step)||technical_step.combat_id!==combat_id)throw new TypeError('formal matching technical step required');const base=`combat-event:${combat_id}:${technical_step.proposal_id}`;const e=[{event_id:`${base}:attempted`,event_kind:'combat_step_attempted',combat_id,actor_ref:structuredClone(technical_step.actor_ref),source_step_ref:structuredClone(technical_step.intent_ref)}];if(check_result)e.push({event_id:`${base}:check`,event_kind:'combat_check_resolved',combat_id,actor_ref:structuredClone(technical_step.actor_ref),source_step_ref:structuredClone(technical_step.intent_ref),check_result:structuredClone(check_result)});if(harm_package)e.push({event_id:`${base}:harm`,event_kind:'combat_harm_proposed',combat_id,actor_ref:structuredClone(technical_step.actor_ref),source_step_ref:structuredClone(technical_step.intent_ref),harm_package:structuredClone(harm_package)});return deepFreeze(e);}
export function buildCombatDecisionSignalDescriptors({occurred_at,events=[]}={}){if(!occurred_at||!Array.isArray(events))throw new TypeError('time and events required');return deepFreeze(events.map(e=>{if(!['self','others','environment','objective','communication'].includes(e.category)||!['material','critical'].includes(e.significance)||!text(e.perceived_change_summary))throw new TypeError('closed meaningful descriptor required');return {occurred_at:structuredClone(occurred_at),category:e.category,significance:e.significance,source_event_ref:structuredClone(e.source_event_ref),subject_ref:structuredClone(e.subject_ref),scope_refs:structuredClone(e.scope_refs??[]),perception_required:e.perception_required===true,source_perception_ref:e.perception_required?structuredClone(e.source_perception_ref):null,causal_parent_refs:structuredClone(e.causal_parent_refs??[]),perceived_change_summary:e.perceived_change_summary};}));}

export function applyHarmPackage(bodyState = {}, harm = {}) {
  const health = finite(bodyState.health);
  const nextHealth = health == null ? null : Math.max(0, Math.min(100, health - (finite(harm.health_loss) ?? 0)));
  const conditions = Array.isArray(bodyState.active_conditions) ? structuredClone(bodyState.active_conditions) : [];
  if (harm.injury) conditions.push({ id: text(harm.injury.id) || null, ...structuredClone(harm.injury), cause:'combat' });
  return deepFreeze({ ...structuredClone(bodyState), health:nextHealth, active_conditions:conditions });
}

export function validateCombatState(state = {}) {
  const errors = [];
  if (!Array.isArray(state.participants)) errors.push('combat participants must be an array');
  if (state.active === true && (!state.participants || state.participants.length < 2)) errors.push('active combat requires at least two participants');
  if (state.round != null && (!Number.isInteger(Number(state.round)) || Number(state.round) < 0)) errors.push('combat round is invalid');
  return { ok: errors.length === 0, errors };
}

function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function text(value) { return String(value ?? '').trim(); }
