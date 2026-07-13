import { sha256 } from '@rus/kernel';
import { freezeOutput } from './shared.js';

export async function commitTurnStage({ writePlan, partyStore }) {
  const idempotencyKey = `turn:${writePlan.party_id}:${writePlan.turn_id}:${sha256(writePlan)}`;
  const result = await partyStore.commit(writePlan, { idempotencyKey });
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new TypeError('partyStore.commit must return an object');
  return freezeOutput({ version: 1, schema: 'turn_commit_result', idempotency_key: idempotencyKey, ...result });
}
