import {
  createNpcScheduleDecisionTerminalEffect,
  NPC_SCHEDULE_DECISION_TERMINAL_EFFECT_REF,
  npcScheduleDecisionTransitionId,
  resolveNpcScheduleDecisionTerminal
} from '@rus/npc-runtime';

export {
  createNpcScheduleDecisionTerminalEffect,
  NPC_SCHEDULE_DECISION_TERMINAL_EFFECT_REF,
  npcScheduleDecisionTransitionId
};

export function npcTemporalEffectRegistrations() {
  return [{
    effect_ref: NPC_SCHEDULE_DECISION_TERMINAL_EFFECT_REF,
    resolve: resolveNpcScheduleDecisionTerminal
  }];
}
