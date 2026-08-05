import { buildSocialDeliveryResult } from '@rus/npc-runtime';
import { turnFailure } from './errors.js';

const OUTCOME_BANDS = new Set([
  'clean_success',
  'success',
  'success_with_cost',
  'failure_with_consequence',
  'severe_failure'
]);

export async function resolveNpcContributionSocialCheck({
  plan,
  request,
  boundary,
  resolver
}) {
  if (plan.resolution === 'automatic') {
    return { check_result: null, social_delivery_result: null };
  }
  if (typeof resolver !== 'function') {
    throw turnFailure(
      'TURN_CONVERSATION_NPC_CHECK_OWNER_MISSING',
      'A check-required NPC contribution needs the injected code-owned check owner'
    );
  }
  let checkResult;
  try {
    checkResult = await resolver(structuredClone({ plan, request, boundary }));
  } catch (error) {
    throw turnFailure(
      'TURN_CONVERSATION_NPC_CHECK_FAILED',
      'The code-owned NPC social check failed',
      { cause: error instanceof Error ? error.message : String(error) }
    );
  }
  const outcomeBand = checkResult?.outcome?.band;
  if (typeof checkResult?.check_id !== 'string'
      || !checkResult.check_id.trim()
      || !OUTCOME_BANDS.has(outcomeBand)) {
    throw turnFailure(
      'TURN_CONVERSATION_NPC_CHECK_INVALID',
      'The NPC social check owner must return one exact five-band outcome'
    );
  }
  return {
    check_result: structuredClone(checkResult),
    social_delivery_result: buildSocialDeliveryResult({
      schema: 'social_delivery_result_v1',
      check_resolution_id: checkResult.check_id,
      outcome_band: outcomeBand,
      delivery_quality: plan.check.outcomes[outcomeBand].delivery_quality,
      observable_effects: []
    })
  };
}
