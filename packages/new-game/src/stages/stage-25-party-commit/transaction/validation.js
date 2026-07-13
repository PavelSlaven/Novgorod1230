import { STAGE25_TRANSACTION_SCHEMA } from '../policy/constants.js';
import { array, isObject, issue, sameScalarSet, text } from '../shared/utils.js';
export function validateStage25TransactionResult(result = {}, input = {}, physicalPlanDigest = null, physicalPlan = null) {
  const concerns = [];
  if (!isObject(result) || result.version !== 1 || result.schema !== STAGE25_TRANSACTION_SCHEMA) {
    return [issue('STAGE25_TRANSACTION_RESULT_INVALID', `Expected ${STAGE25_TRANSACTION_SCHEMA} version 1.`, 'transaction_result')];
  }
  if (result.request_id !== input.request_id) concerns.push(issue('STAGE25_REQUEST_ID_MISMATCH', 'Transaction request_id mismatch.', 'transaction_result.request_id'));
  if (result.party_id !== input.party_creation_context?.party_id) concerns.push(issue('STAGE25_TRANSACTION_RESULT_INVALID', 'Transaction party_id mismatch.', 'transaction_result.party_id'));
  if (result.transaction_id !== input.party_db_write_plan?.transaction?.transaction_id) concerns.push(issue('STAGE25_TRANSACTION_RESULT_INVALID', 'Transaction ID mismatch.', 'transaction_result.transaction_id'));
  if (result.physical_write_plan_digest !== physicalPlanDigest) concerns.push(issue('STAGE25_TRANSACTION_DIGEST_MISMATCH', 'Transaction physical plan digest mismatch.', 'transaction_result.physical_write_plan_digest'));
  if (result.pass !== true || result.commit_status !== 'committed') concerns.push(issue('STAGE25_TRANSACTION_NOT_COMMITTED', 'Transaction result must be committed.', 'transaction_result.commit_status'));
  if (result.rollback?.attempted === true || result.rollback?.completed === true) concerns.push(issue('STAGE25_TRANSACTION_RESULT_INVALID', 'Successful transaction cannot report rollback.', 'transaction_result.rollback'));
  const expectedBatches = array(physicalPlan?.transaction?.write_order);
  if (!sameScalarSet(result.executed_batches, expectedBatches) || array(result.executed_batches).length !== expectedBatches.length) {
    concerns.push(issue('STAGE25_TRANSACTION_RESULT_INVALID', 'Transaction executed_batches must exactly match physical plan write_order.', 'transaction_result.executed_batches'));
  }
  for (const item of array(result.batch_results)) {
    if (!text(item.batch_id) || !Number.isInteger(item.attempted_rows) || !Number.isInteger(item.affected_rows)) concerns.push(issue('STAGE25_TRANSACTION_RESULT_INVALID', 'Invalid batch result row counts.', 'transaction_result.batch_results'));
    if (item.affected_rows < item.attempted_rows && item.operation !== 'upsert_with_idempotency') concerns.push(issue('STAGE25_ROW_COUNT_MISMATCH', `Batch ${item.batch_id} affected fewer rows than expected.`, 'transaction_result.batch_results'));
  }
  if (array(result.postcondition_checks).some((item) => item?.pass !== true)) concerns.push(issue('STAGE25_POSTCONDITION_FAILED', 'Transaction postconditions did not all pass.', 'transaction_result.postcondition_checks'));
  return concerns;
}

