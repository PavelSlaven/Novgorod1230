import { row } from './first-playable/plan-shared.js';
import { appendCombatSessionWrite } from './combat-session-persistence.js';
import { sessionRecord } from './npc-semantic-conversation-write-rows.js';
import { lowerDvinaTraceNpcActorStepModeHandoffChange } from
  '../../runtime/lower-dvina-trace-npc-actor-step-mode-handoffs.js';

export function appendNpcActorStepModeHandoffWrites({ inserts, updates, partyId, phase7,
  changeSetId }) {
  const change = lowerDvinaTraceNpcActorStepModeHandoffChange(
    phase7.actor_step_owner_outputs?.consequence_fragment);
  const handoff = change?.mode_handoff;
  if (handoff?.mode === 'conversation') {
    inserts.push(row('party_conversation_sessions',
      handoff.result.conversation_id,
      sessionRecord(handoff.result, partyId, changeSetId)));
  } else if (handoff?.mode === 'combat') {
    appendCombatSessionWrite({ inserts, updates, partyId, changeSetId,
      session: handoff.result, mode: 'insert' });
  }
}
