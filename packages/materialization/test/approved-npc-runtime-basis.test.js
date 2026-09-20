import assert from 'node:assert/strict';
import test from 'node:test';
import { compileApprovedNpcRuntimeBasis } from '../src/index.js';

const role = { role_id: 'fisher', region_id: 'novgorod', status: 'approved' };
const occupation = { occupation_id: 'fishing', region_id: 'novgorod',
  status: 'approved', allowed_social_role_ids: 'fisher; boatman',
  daily_schedule_summer: 'summer schedule', typical_property: 'property',
  typical_tools: 'tools', typical_clothing: 'clothing',
  typical_containers: 'containers', typical_local_knowledge: 'local knowledge',
  typical_route_knowledge: 'route knowledge', common_relationships: 'relations',
  common_fears: 'fears', common_goals: 'goals',
  how_to_materialize_as_background_npc: 'background rule',
  how_to_materialize_as_scene_npc: 'scene rule',
  how_to_materialize_as_key_npc: 'key rule',
  llm_adaptation_rules: 'adaptation boundary',
  llm_forbidden_uses: 'forbidden boundary' };

test('approved NPC basis preserves owner fields and seasonal source refs', () => {
  const result = compileApprovedNpcRuntimeBasis({ role, occupation,
    season: 'summer', profile_level: 'background' });
  assert.equal(result.schedule.source_ref,
    'approved_occupations:fishing:daily_schedule_summer');
  assert.equal(result.tool_requirement.value, 'tools');
  assert.equal(result.materialization_rule.value, 'background rule');
  assert.ok(Object.isFrozen(result));
});

test('NPC basis rejects incompatible role and missing approved owner field', () => {
  assert.throws(() => compileApprovedNpcRuntimeBasis({ role: { ...role,
    role_id: 'merchant' }, occupation }),
  { code: 'NPC_RUNTIME_BASIS_INPUT_INVALID' });
  assert.throws(() => compileApprovedNpcRuntimeBasis({ role,
    occupation: { ...occupation, typical_tools: '' } }),
  (error) => error.code === 'NPC_RUNTIME_BASIS_DATA_GAP'
    && error.details.missing_fields.includes('typical_tools'));
});
