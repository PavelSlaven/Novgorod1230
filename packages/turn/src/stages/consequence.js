import { assertValid, validateConsequencePackage } from '../validators.js';
import { freezeOutput } from './shared.js';
import {
  buildTurnStepDraftConsequence,
  buildTurnStepPreparedDomainConsequence,
  getTurnStepWorkflowDraft,
  mergeTurnStepDraftConsequence,
  turnStepDraftPreparedEffectLedger
} from '../turn-step-workflow-draft.js';
import {
  bindTurnStepPreparedConsequence
} from '../turn-step-prepared-effects.js';

export async function resolveConsequenceStage({ playerInput, modeResolution, retrievedState, availability, checks, commandRegistry }) {
  const draft = getTurnStepWorkflowDraft(modeResolution);
  if (draft && draft.selected_command_id == null) {
    const output = buildTurnStepDraftConsequence(draft);
    assertValid('turn_consequence_package', validateConsequencePackage(output));
    return freezeOutput(output);
  }
  const command = commandRegistry.get(modeResolution.command_id);
  const preparedDomain = buildTurnStepPreparedDomainConsequence(draft);
  const commandOutput = preparedDomain
    ?? await command.consequence(Object.freeze(structuredClone({ playerInput, modeResolution, retrievedState, availability, checks })));
  assertValid(
    'turn_consequence_package',
    validateConsequencePackage(commandOutput)
  );
  let output = draft
    ? mergeTurnStepDraftConsequence(commandOutput, draft)
    : commandOutput;
  const ledger = turnStepDraftPreparedEffectLedger(draft);
  if (ledger != null) {
    output = bindTurnStepPreparedConsequence(output, ledger);
  }
  assertValid('turn_consequence_package', validateConsequencePackage(output));
  return freezeOutput(output);
}
