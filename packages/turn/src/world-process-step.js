import { deepFreeze } from '@rus/kernel';
import { turnFailure } from './errors.js';

const REQUEST_KEYS = ['schema','request_id','party_state_version',
  'process_state_version','process_mode','process_kind','process',
  'current_timestamp','trigger','subject_state','environment_state',
  'allowed_outcomes'];
const PLAN_KEYS = ['schema','request_id','process_ref','process_state_version',
  'interpretation','process_outcome','affected_refs','fact_changes','reason_code'];

export async function resolveWorldProcessStep({ request,
  worldProcessStepModel } = {}) {
  const safeRequest = snapshot(request);
  if (!validRequest(safeRequest)) fail('TURN_WORLD_PROCESS_STEP_REQUEST_INVALID');
  if (typeof worldProcessStepModel !== 'function') {
    fail('TURN_WORLD_PROCESS_STEP_MODEL_MISSING');
  }
  let raw;
  try { raw = await worldProcessStepModel(deepFreeze(safeRequest)); }
  catch (error) { throw turnFailure('TURN_WORLD_PROCESS_STEP_MODEL_FAILED',
    'World-process semantic step failed.', { cause: message(error) }); }
  const plan = snapshot(raw);
  if (!validPlan(plan, safeRequest)) fail('TURN_WORLD_PROCESS_STEP_PLAN_INVALID');
  return deepFreeze(plan);
}

function validRequest(value) {
  return exact(value, REQUEST_KEYS)
    && value.schema === 'world_process_step_request_v1'
    && text(value.request_id)
    && Number.isSafeInteger(value.party_state_version)
    && value.party_state_version >= 0
    && (value.process_state_version === null
      || Number.isSafeInteger(value.process_state_version)
        && value.process_state_version >= 0)
    && value.process_mode === 'local_exact' && value.process_kind === 'fire'
    && (value.process === null || plain(value.process))
    && plain(value.current_timestamp)
    && ['start_attempt','actor_affected','subject_changed'].includes(value.trigger)
    && plain(value.subject_state) && plain(value.environment_state)
    && Array.isArray(value.allowed_outcomes)
    && value.allowed_outcomes.length > 0
    && new Set(value.allowed_outcomes).size === value.allowed_outcomes.length
    && value.allowed_outcomes.every((entry) =>
      ['no_effect','start','continue','complete'].includes(entry));
}

function validPlan(value, request) {
  if (!exact(value, PLAN_KEYS)
      || value.schema !== 'world_process_step_plan_v1'
      || value.request_id !== request.request_id
      || value.process_ref !== (request.process?.process_ref ?? null)
      || value.process_state_version !== request.process_state_version
      || !exact(value.interpretation, ['grounded_transition'])
      || !text(value.interpretation.grounded_transition)
      || !request.allowed_outcomes.includes(value.process_outcome)
      || !Array.isArray(value.affected_refs)
      || new Set(value.affected_refs).size !== value.affected_refs.length
      || !Array.isArray(value.fact_changes) || value.fact_changes.length !== 0
      || !text(value.reason_code)) return false;
  const allowedRefs = collectRefs(request);
  return value.affected_refs.every((ref) => text(ref) && allowedRefs.has(ref));
}

function collectRefs(value, refs = new Set()) {
  if (Array.isArray(value)) for (const child of value) collectRefs(child, refs);
  else if (plain(value)) for (const [key, child] of Object.entries(value)) {
    if (key.endsWith('_ref') && text(child)) refs.add(child);
    if (key.endsWith('_refs') && Array.isArray(child)) {
      child.filter(text).forEach((ref) => refs.add(ref));
    }
    collectRefs(child, refs);
  }
  return refs;
}

function snapshot(value) {
  try { return structuredClone(value); } catch { return null; }
}
function exact(value, keys) { return plain(value)
  && Object.keys(value).length === keys.length
  && keys.every((key) => Object.hasOwn(value, key)); }
function plain(value) { return value !== null && typeof value === 'object'
  && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype; }
function text(value) { return typeof value === 'string' && value.length > 0; }
function message(error) { return error instanceof Error ? error.message : String(error); }
function fail(code) { throw turnFailure(code, code); }
