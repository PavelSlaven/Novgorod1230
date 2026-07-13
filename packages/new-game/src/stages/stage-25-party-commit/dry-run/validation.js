import { REQUIRED_DRY_RUN_CHECKS, STAGE25_DRY_RUN_SCHEMA } from '../policy/constants.js';
import { array, isObject, issue } from '../shared/utils.js';
export function validateStage25DryRunResult(result = {}, input = {}, physicalPlanDigest = null) {
  const concerns = [];
  if (!isObject(result) || result.version !== 1 || result.schema !== STAGE25_DRY_RUN_SCHEMA) {
    return [issue('STAGE25_DRY_RUN_RESULT_INVALID', `Expected ${STAGE25_DRY_RUN_SCHEMA} version 1.`, 'dry_run_result')];
  }
  if (result.request_id !== input.request_id) concerns.push(issue('STAGE25_REQUEST_ID_MISMATCH', 'Dry-run request_id mismatch.', 'dry_run_result.request_id'));
  if (result.physical_write_plan_digest !== physicalPlanDigest) concerns.push(issue('STAGE25_DRY_RUN_DIGEST_MISMATCH', 'Dry-run physical plan digest mismatch.', 'dry_run_result.physical_write_plan_digest'));
  if (typeof result.pass !== 'boolean') concerns.push(issue('STAGE25_DRY_RUN_RESULT_INVALID', 'Dry-run pass must be boolean.', 'dry_run_result.pass'));
  for (const key of REQUIRED_DRY_RUN_CHECKS) {
    if (result.checks?.[key]?.pass !== true) concerns.push(issue('STAGE25_DRY_RUN_CHECK_FAILED', `Dry-run check failed or missing: ${key}.`, `dry_run_result.checks.${key}`));
  }
  if (result.pass === true) {
    if (array(result.concerns).length !== 0) concerns.push(issue('STAGE25_DRY_RUN_RESULT_INVALID', 'Successful dry-run cannot contain concerns.', 'dry_run_result.concerns'));
    if (array(result.evidence).length === 0) concerns.push(issue('STAGE25_DRY_RUN_RESULT_INVALID', 'Successful dry-run requires evidence.', 'dry_run_result.evidence'));
    if (result.rollback_completed !== true) concerns.push(issue('STAGE25_DRY_RUN_ROLLBACK_FAILED', 'Dry-run must complete rollback.', 'dry_run_result.rollback_completed'));
  } else {
    if (array(result.concerns).length === 0) concerns.push(issue('STAGE25_DRY_RUN_RESULT_INVALID', 'Failed dry-run requires concerns.', 'dry_run_result.concerns'));
  }
  return concerns;
}

