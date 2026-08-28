import { exactKeys, stableId } from './internal.js';

const RESOLUTIONS = new Set(['automatic', 'check_required']);

function plainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function jsonSafe(value, ancestors = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)
      || (!Array.isArray(value) && !plainRecord(value))) return false;
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? value.every((entry) => jsonSafe(entry, ancestors))
    : Object.entries(value).every(([key, entry]) => stableId(key)
      && jsonSafe(entry, ancestors));
  ancestors.delete(value);
  return valid;
}

function requiredCheck(value) {
  return exactKeys(value, ['attribute_ref', 'skill_ref', 'difficulty_band'])
    && stableId(value.attribute_ref) && stableId(value.skill_ref)
    && stableId(value.difficulty_band);
}

function sameJson(left, right) {
  if (left === right) return true;
  if (left === null || right === null || typeof left !== 'object'
      || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) return left.length === right.length
    && left.every((entry, index) => sameJson(entry, right[index]));
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) =>
    Object.hasOwn(right, key) && sameJson(left[key], right[key]));
}

export function validateContributionRequirement(value, operationContract = null) {
  const resolution = value?.required_resolution;
  const check = value?.required_check;
  const operation = value?.required_supporting_operation;
  if (resolution !== undefined && !RESOLUTIONS.has(resolution)) return false;
  if (check !== undefined && !requiredCheck(check)) return false;
  if (resolution === 'check_required' ? check === undefined : check !== undefined) return false;
  return operation === undefined || (plainRecord(operation) && stableId(operation.op)
    && jsonSafe(operation) && (operationContract === null
      || Object.hasOwn(operationContract, operation.op)));
}

export function matchesContributionRequirement(plan, request, operationContract) {
  const requirement = request?.schema === 'player_conversation_input_v1'
    ? request.player_safe_context : request?.schema
      === 'npc_conversation_response_request_v1' ? request.decision_scope : null;
  if (requirement === null
      || !validateContributionRequirement(requirement, operationContract)) return requirement === null;
  const required = requirement.required_resolution;
  if (required !== undefined && (plan.resolution !== required
      || (required === 'check_required' && (plan.check?.attribute_ref
        !== requirement.required_check.attribute_ref || plan.check?.skill_ref
        !== requirement.required_check.skill_ref || plan.check?.difficulty_band
        !== requirement.required_check.difficulty_band)))) return false;
  return requirement.required_supporting_operation === undefined
    || plan.contribution_kind === 'speech' && plan.supporting_operations.length === 1
      && sameJson(plan.supporting_operations[0], requirement.required_supporting_operation);
}

export function sameRequiredCheck(left, right) {
  return left?.attribute_ref === right?.attribute_ref
    && left?.skill_ref === right?.skill_ref
    && left?.difficulty_band === right?.difficulty_band;
}
