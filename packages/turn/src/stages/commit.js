import { sha256 } from '@rus/kernel';
import { freezeOutput } from './shared.js';
import { enterG4WithMaterialization } from '../first-entry-materialization.js';

export async function commitTurnStage({ writePlan, partyStore, materializer = null }) {
  const idempotencyKey = `turn:${writePlan.party_id}:${writePlan.turn_id}:${sha256(writePlan)}`;
  if (writePlan.first_entry_materialization) {
    if (!materializer || typeof materializer.materialize !== 'function') throw new TypeError('First G4 entry requires materializer.materialize.');
    const transition = writePlan.first_entry_materialization;
    const result = await enterG4WithMaterialization({
      partyId: writePlan.party_id,
      g4Id: transition.g4_id,
      loadCommittedBaseline: partyStore.loadCommittedBaseline.bind(partyStore),
      buildMaterializationRequest: partyStore.buildMaterializationRequest.bind(partyStore),
      materialize: materializer.materialize.bind(materializer),
      transact: partyStore.transact.bind(partyStore),
      commitMovement: ({ transaction, ...args }) => partyStore.commitMovement({ ...args, writePlan, idempotencyKey }, { transaction }),
      commitMaterializationAndMovement: ({ transaction, ...args }) => partyStore.commitMaterializationAndMovement({ ...args, writePlan, idempotencyKey }, { transaction })
    });
    return freezeOutput({ version: 1, schema: 'turn_commit_result', idempotency_key: idempotencyKey, ...result });
  }
  const result = await partyStore.commit(writePlan, { idempotencyKey });
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new TypeError('partyStore.commit must return an object');
  return freezeOutput({ version: 1, schema: 'turn_commit_result', idempotency_key: idempotencyKey, ...result });
}
