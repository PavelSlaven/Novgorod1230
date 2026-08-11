import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCombatStepHarmPackage, buildCombatTechnicalStepProposal,
  buildCombatExchangeProposal, combatBodyThresholdSignalProfile,
  validateCombatIntent, validateCombatSession
} from '../src/index.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const at = { whole_minutes:'1', subminute_numerator:'0', subminute_denominator:'1' };
const intent = { schema:'combat_intent_v1', intent_id:'i', combat_id:'combat-1', actor_ref:ref('npc','n'), intent_kind:'engage', target_refs:[ref('player_character','p')], protected_refs:[], scope_ref:null, destination_ref:null, force_limit:'ordinary', risk_posture:'ordinary', persistence:'until_decision_boundary', created_from_boundary_ref:ref('npc_decision_boundary','b'), state_version:'1', status:'active' };
const session = { schema:'combat_session_v1', combat_id:'combat-1', state_version:'1', status:'active', started_at:at, scope_ref:ref('location','l'), participant_refs:[ref('npc','n'),ref('player_character','p')], participant_states:[{actor_ref:ref('npc','n'),combat_status:'active',current_intent:intent,next_action_boundary_ref:null},{actor_ref:ref('player_character','p'),combat_status:'active',current_intent:null,next_action_boundary_ref:null}], exchange_ordinal:0,last_exchange_ref:null,player_response_required:false,last_change_set_ref:null };

test('combat session and intent have exact participant and intent invariants', () => {
  assert.equal(validateCombatSession(session), true);
  assert.equal(validateCombatSession({ ...session, participant_states:[session.participant_states[0],session.participant_states[0]] }), false);
  assert.equal(validateCombatIntent(intent), true);
  assert.equal(validateCombatIntent({ ...intent, target_refs:[] }), false);
});
test('technical step and exchange remain formal immutable DTOs', () => {
  const step=buildCombatTechnicalStepProposal({session,intent,preconditions_digest:'d',execution_profile:{check_request:{target_defense:10}}});
  const exchange=buildCombatExchangeProposal({session,technical_steps:[step],preconditions_digest:'d'});
  assert.equal(Object.isFrozen(step),true);assert.equal(exchange.technical_steps[0].proposal_id,step.proposal_id);
});
test('hit may harm, but a high-danger miss has zero harm and no injury', () => {
  const request={target_id:'p',weapon_danger:5};
  assert.equal(buildCombatStepHarmPackage({check_result:{outcome:{success:true,margin:1}},attack_request:request}).health_loss>0,true);
  assert.deepEqual(buildCombatStepHarmPackage({check_result:{outcome:{success:false,margin:-20}},attack_request:request}),{target_id:'p',quality:0,damage_score:0,health_loss:0,injury:null,focus:null});
});
test('generic combat body threshold mapping supplies explicit signal metadata',
  () => {
    const profile = combatBodyThresholdSignalProfile();
    assert.equal(profile.status, 'approved');
    assert.deepEqual(profile.thresholds.map(({ value, decision_signal: signal }) =>
      [value, signal.significance]), [[75, 'material'], [50, 'material'],
      [25, 'critical'], [0, 'critical']]);
    assert.equal(Object.isFrozen(profile), true);
  });
