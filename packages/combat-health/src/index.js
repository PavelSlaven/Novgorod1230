import { deepFreeze } from '@rus/kernel';

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
