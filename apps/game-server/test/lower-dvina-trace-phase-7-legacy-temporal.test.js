import assert from 'node:assert/strict';
import test from 'node:test';
import {
  lowerDvinaTracePhase7TemporalEffectRegistrations,
  PHASE7_WAITING_TERMINAL_EFFECT_REF
} from '../src/runtime/lower-dvina-trace-phase-7-temporal-effect-owner.js';

test('Phase 7 retains the historical waiting-terminal replay owner', () => {
  const registration = lowerDvinaTracePhase7TemporalEffectRegistrations()
    .find(({ effect_ref: effectRef }) => effectRef.entity_ref.entity_id
      === PHASE7_WAITING_TERMINAL_EFFECT_REF.entity_ref.entity_id);
  const result = registration.resolve({
    candidate: {
      boundary_id: 'npc-waiting:party:zhdanko:terminal',
      scheduled_at: {
        whole_minutes: '125', subminute_numerator: '0',
        subminute_denominator: '1'
      }
    },
    context: { projection: { waiting_terminal_reached: false } },
    descriptor: {
      npc_ref: 'zhdanko_storehouse_controller',
      signal_subject_npc_ref: 'zhdanko-1',
      activity_ref: 'trace_ld_v1_activity_zhdanko_wait',
      transition_kind: 'waiting_terminal_reached',
      decision_signal: { category: 'objective', significance: 'material' }
    }
  });

  assert.equal(result.state_projection.waiting_transition.transition_id,
    'waiting-transition:npc-waiting:party:zhdanko:terminal');
  assert.equal(result.state_projection.npc_decision_signal_descriptors[0]
    .perceived_change_summary, 'Ратша не вернулся к условленному сроку.');
});
