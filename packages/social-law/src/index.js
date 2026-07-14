import { deepFreeze } from '@rus/kernel';

export function validateSocialBinding(binding = {}) {
  const errors = [];
  if (!text(binding.actor_id)) errors.push('actor_id is required');
  if (!text(binding.region_id)) errors.push('region_id is required');
  if (!text(binding.social_role_id)) errors.push('social_role_id is required');
  if (binding.occupation_ids != null && !Array.isArray(binding.occupation_ids)) errors.push('occupation_ids must be an array');
  return { ok: errors.length === 0, errors };
}

export function evaluateRights(binding = {}, action = {}) {
  const requested = text(action.right_id ?? action.action_type);
  const rights = new Set(strings(binding.rights ?? binding.allowed_actions));
  const restrictions = new Set(strings(binding.restrictions ?? binding.forbidden_actions));
  let decision = 'unknown';
  if (requested && restrictions.has(requested)) decision = 'forbidden';
  else if (requested && rights.has(requested)) decision = 'allowed';
  return deepFreeze({ actor_id:text(binding.actor_id) || null, right_id:requested || null, decision, requires_permission:decision === 'unknown' && Boolean(action.requires_permission) });
}

export function validateAuthorityReference(reference = {}) {
  const errors = [];
  if (!text(reference.authority_id)) errors.push('authority_id is required');
  if (!text(reference.region_id)) errors.push('region_id is required');
  if (!text(reference.authority_type)) errors.push('authority_type is required');
  return { ok: errors.length === 0, errors };
}

export function buildSocialRisk(input = {}) {
  const witnesses = Array.isArray(input.witness_ids) ? input.witness_ids.map(text).filter(Boolean) : [];
  const violations = Array.isArray(input.violation_ids) ? input.violation_ids.map(text).filter(Boolean) : [];
  const severity = Math.max(0, Math.min(4, (finite(input.base_severity) ?? 0) + (witnesses.length ? 1 : 0) + (violations.length > 1 ? 1 : 0)));
  return deepFreeze({ actor_id:text(input.actor_id) || null, action_id:text(input.action_id) || null, witness_ids:witnesses, violation_ids:violations, severity, requires_semantic_resolution:severity > 0 });
}

export function buildLegalConsequencePackage(input = {}) {
  const risk = input.risk && typeof input.risk === 'object' ? structuredClone(input.risk) : buildSocialRisk(input);
  return deepFreeze({
    actor_id:text(input.actor_id) || null,
    authority_id:text(input.authority_id) || null,
    jurisdiction_id:text(input.jurisdiction_id) || null,
    alleged_violation_ids:Array.isArray(input.alleged_violation_ids) ? input.alleged_violation_ids.map(text).filter(Boolean) : [],
    evidence_refs:Array.isArray(input.evidence_refs) ? structuredClone(input.evidence_refs) : [],
    witness_ids:Array.isArray(input.witness_ids) ? input.witness_ids.map(text).filter(Boolean) : [],
    risk,
    proposed_consequences:Array.isArray(input.proposed_consequences) ? structuredClone(input.proposed_consequences) : [],
    approval_required:true
  });
}

function strings(value) { return Array.isArray(value) ? value.map(text).filter(Boolean) : []; }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function text(value) { return String(value ?? '').trim(); }
