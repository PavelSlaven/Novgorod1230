import test from 'node:test';
import assert from 'node:assert/strict';
import { TurnRuntimeRoles } from '../src/provider-config.js';
import { combatTurnRoleDefaults } from '../src/combat-role-defaults.js';

test('LLM runtime exposes combat planner, repair and weapon classifier roles',
  () => {
  const roles = combatTurnRoleDefaults({
    JSON_OBJECT_WITH_SCHEMA: 'json_object_with_schema', JSON_REPAIR: 'json_repair'
  });
  assert.equal(TurnRuntimeRoles.NPC_COMBAT_DECIDER, 'npc_combat_decider');
  assert.equal(TurnRuntimeRoles.ACTION_PRODUCED_WEAPON_CLASSIFIER,
    'combat_weapon_classification');
  assert.equal(roles.npc_combat_decider.expectedSchema, 'npc_combat_intent_plan_v1');
  assert.equal(roles.npc_combat_decider_format_repair.expectedSchema, 'npc_combat_intent_plan_v1');
  assert.deepEqual(roles.combat_weapon_classification, {
    envPrefix: 'COMBAT_WEAPON_CLASSIFICATION', model: 'deepseek-v4-flash',
    thinking: 'disabled', reasoningEffort: null,
    responseFormat: 'json_object', maxTokens: 500, temperature: 0, topP: 1,
    outputContractMode: 'json_object_with_schema', expectedSchema:
      'rus.combat.action_produced_weapon_classification.v1',
    parseJson: true, targetInputTokens: 4000,
    comfortableInputTokens: 8000, hardInputLimitTokens: 30000,
    reserveOutputTokens: 500, reserveRepairTokens: 500
  });
});
