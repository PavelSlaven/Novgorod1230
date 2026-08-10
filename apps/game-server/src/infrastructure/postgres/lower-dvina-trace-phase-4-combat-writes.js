import { appendCombatSessionWrite } from './combat-session-persistence.js';
import { appendNpcDecisionTraceWrites } from
  './npc-semantic-conversation-decision-writes.js';

export function appendPhase4CombatInitialization({
  inserts,
  updates,
  appends,
  partyId,
  changeSetId,
  rootTurnId,
  workingRevision,
  initialization
}) {
  if (initialization == null) return;
  appendCombatSessionWrite({
    inserts,
    updates,
    partyId,
    changeSetId,
    session: initialization.session,
    mode: 'insert'
  });
  appendNpcDecisionTraceWrites({
    appends,
    decisionRecords: initialization.decision_records,
    partyId,
    changeSetId,
    rootTurnId,
    workingRevision
  });
}
