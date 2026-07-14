import { STAGE25_IDEMPOTENCY_SCHEMA } from '../policy/constants.js';
import { isObject, issue } from '../shared/utils.js';
export function validateIdempotencyResult(result, input, physicalDigest) {
  const concerns = [];
  if (!isObject(result) || result.version !== 1 || result.schema !== STAGE25_IDEMPOTENCY_SCHEMA || result.pass !== true) return [issue('STAGE25_IDEMPOTENCY_RESULT_INVALID', `Successful ${STAGE25_IDEMPOTENCY_SCHEMA} is required.`, 'idempotency_result')];
  if (!['new', 'replay_committed'].includes(result.status)) concerns.push(issue('STAGE25_IDEMPOTENCY_RESULT_INVALID', 'Unsupported idempotency status.', 'idempotency_result.status'));
  if (result.idempotency_key !== input.party_creation_context?.idempotency_key || result.payload_hash !== input.party_creation_context?.payload_hash || result.physical_write_plan_digest !== physicalDigest) concerns.push(issue('STAGE25_IDEMPOTENCY_RESULT_INVALID', 'Idempotency binding mismatch.', 'idempotency_result'));
  if (result.status === 'replay_committed' && !isObject(result.committed_result)) concerns.push(issue('STAGE25_IDEMPOTENCY_RESULT_INVALID', 'replay_committed requires committed_result.', 'idempotency_result.committed_result'));
  return concerns;
}

