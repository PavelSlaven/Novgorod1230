import { deepFreeze } from '@rus/kernel';
import { MaterializationError } from './core.js';

const SCHEDULE_FIELD = Object.freeze({ winter: 'daily_schedule_winter',
  spring: 'daily_schedule_spring_rasputitsa',
  spring_rasputitsa: 'daily_schedule_spring_rasputitsa',
  summer: 'daily_schedule_summer', autumn: 'daily_schedule_autumn' });
const DEPTH_FIELD = Object.freeze({ background:
  'how_to_materialize_as_background_npc', scene:
  'how_to_materialize_as_scene_npc', key: 'how_to_materialize_as_key_npc' });

export function compileApprovedNpcRuntimeBasis({ role, occupation,
  season = 'summer', profile_level: profileLevel = 'scene' } = {}) {
  const scheduleField = SCHEDULE_FIELD[season];
  const depthField = DEPTH_FIELD[profileLevel];
  if (role?.status !== 'approved' || occupation?.status !== 'approved'
      || !text(role.role_id) || !text(occupation.occupation_id)
      || role.region_id !== occupation.region_id || !scheduleField || !depthField
      || !list(occupation.allowed_social_role_ids).includes(role.role_id)) {
    invalid('NPC_RUNTIME_BASIS_INPUT_INVALID');
  }
  const required = [scheduleField, depthField, 'typical_property',
    'typical_tools', 'typical_clothing', 'typical_containers',
    'typical_local_knowledge', 'typical_route_knowledge', 'common_relationships',
    'common_fears', 'common_goals', 'llm_adaptation_rules', 'llm_forbidden_uses'];
  const missing = required.filter((field) => !text(occupation[field]));
  if (missing.length > 0) throw new MaterializationError(
    'NPC_RUNTIME_BASIS_DATA_GAP', 'Approved occupation basis is incomplete.',
    { occupation_id: occupation.occupation_id, missing_fields: missing });
  return deepFreeze({ schema: 'rus.approved_npc_runtime_basis.v1', version: 1,
    role_ref: { owner: 'approved_social_roles', id: role.role_id },
    occupation_ref: { owner: 'approved_occupations',
      id: occupation.occupation_id },
    schedule: source(occupation, scheduleField),
    property: source(occupation, 'typical_property'),
    tool_requirement: source(occupation, 'typical_tools'),
    clothing_requirement: source(occupation, 'typical_clothing'),
    container_requirement: source(occupation, 'typical_containers'),
    local_knowledge: source(occupation, 'typical_local_knowledge'),
    route_knowledge: source(occupation, 'typical_route_knowledge'),
    relationship_basis: source(occupation, 'common_relationships'),
    fears: source(occupation, 'common_fears'),
    goals: source(occupation, 'common_goals'),
    materialization_rule: source(occupation, depthField),
    llm_adaptation_rules: source(occupation, 'llm_adaptation_rules'),
    llm_forbidden_uses: source(occupation, 'llm_forbidden_uses') });
}

function source(record, field) { return { source_ref:
  `approved_occupations:${record.occupation_id}:${field}`,
field, value: record[field] }; }
function list(value) { return String(value ?? '').split(';').map((item) =>
  item.trim()).filter(Boolean); }
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
function invalid(code) { throw new MaterializationError(code, code); }
