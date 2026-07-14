import { assertValid, validatePlayerTurnInput } from '../validators.js';
import { freezeOutput, text } from './shared.js';

export function normalizeTurnIntent(input = {}, now = new Date().toISOString()) {
  const rawText = text(input.raw_text ?? input.rawText);
  const turnNumber = Number(input.turn_number ?? input.turnNumber);
  const normalized = {
    version: 1,
    schema: 'player_turn_input',
    party_id: text(input.party_id ?? input.partyId),
    turn_number: Number.isInteger(turnNumber) ? turnNumber : 1,
    raw_text: rawText,
    selected_action_option_id: text(input.selected_action_option_id ?? input.selectedActionOptionId) || null,
    input_source: text(input.selected_action_option_id ?? input.selectedActionOptionId) ? 'suggested_action' : 'free_text',
    received_at: text(input.received_at ?? input.receivedAt) || now,
    interpretation_status: 'pending',
    contract: 'intent_not_fact'
  };
  assertValid('player_turn_input', validatePlayerTurnInput(normalized));
  return freezeOutput(normalized);
}
