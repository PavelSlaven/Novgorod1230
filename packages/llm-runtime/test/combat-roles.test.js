import test from 'node:test';
import assert from 'node:assert/strict';
import { TurnRuntimeRoles } from '../src/provider-config.js';
import { combatTurnRoleDefaults } from '../src/combat-role-defaults.js';

test('LLM runtime exposes combat planner and repair roles', () => {
  const roles = combatTurnRoleDefaults({
    JSON_OBJECT_WITH_SCHEMA: 'json_object_with_schema', JSON_REPAIR: 'json_repair'
  });
  assert.equal(TurnRuntimeRoles.NPC_COMBAT_DECIDER, 'npc_combat_decider');
  assert.equal(roles.npc_combat_decider.expectedSchema, 'npc_combat_intent_plan_v1');
  assert.equal(roles.npc_combat_decider_format_repair.expectedSchema, 'npc_combat_intent_plan_v1');
});
