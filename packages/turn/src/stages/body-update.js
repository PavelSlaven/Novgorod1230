import { freezeOutput } from './shared.js';
import {
  buildTurnStepPreparedBodyUpdate,
  requireTurnStepPreparedEffectLedger
} from '../turn-step-prepared-effects.js';

export async function buildBodyUpdateStage({
  retrievedState,
  consequence,
  timeUpdate,
  bodyEffect,
  preparedEffectLedger = null
}) {
  if (preparedEffectLedger != null) {
    const ledger = requireTurnStepPreparedEffectLedger(preparedEffectLedger);
    if (consequence.prepared_effect_ledger_digest !== ledger.ledger_digest
        || timeUpdate.prepared_effect_ledger_digest
          !== ledger.ledger_digest) {
      const error = new Error(
        'Prepared body update is not bound to its consequence and time.');
      error.code = 'TURN_STEP_PREPARED_EFFECT_INVALID';
      throw error;
    }
    return freezeOutput(buildTurnStepPreparedBodyUpdate(ledger));
  }
  const required = consequence.body_effect_ref != null;
  if (!required) {
    return freezeOutput({
      version: 1,
      schema: 'turn_body_update',
      owner: '@rus/body-state',
      applied: false,
      proposal: null,
      state_after: retrievedState.body_state ?? null
    });
  }
  if (typeof bodyEffect?.apply !== 'function') {
    const error = new Error('Approved body effect requires @rus/body-state adapter.');
    error.code = 'TURN_BODY_EFFECT_DEPENDENCY_MISSING';
    throw error;
  }
  const result = await bodyEffect.apply({
    committed_state: structuredClone(retrievedState),
    consequence: structuredClone(consequence),
    time_update: structuredClone(timeUpdate)
  });
  if (result?.owner !== '@rus/body-state'
      || result.applied !== true
      || !result.proposal
      || result.proposal.profile_ref !== consequence.body_effect_ref
      || !result.state_after) {
    const error = new Error('Body-state owner returned an incomplete proposal.');
    error.code = 'TURN_BODY_EFFECT_INVALID';
    throw error;
  }
  return freezeOutput({
    version: 1,
    schema: 'turn_body_update',
    ...structuredClone(result)
  });
}
