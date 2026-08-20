import { deepFreeze } from '@rus/kernel';
import {
  ADAPTATIONS,
  DIFFICULTIES,
  DURATION_CLASSES,
  EFFORTS,
  GOAL_RESULTS,
  OUTCOME_BANDS,
  RESOLUTIONS
} from './constants.js';

const textSchema = { type: 'string', minLength: 1 };
const refSchema = { type: 'string', minLength: 1 };
const nullableRefSchema = { anyOf: [refSchema, { type: 'null' }] };

function strictObject(required, properties) {
  return { type: 'object', additionalProperties: false, required, properties };
}

const jsonDataDefinitions = {
  json_object: {
    type: 'object',
    additionalProperties: { $ref: '#/$defs/json_data' }
  },
  json_data: {
    anyOf: [
      { type: 'null' },
      { type: 'boolean' },
      { type: 'number' },
      { type: 'string' },
      { type: 'array', items: { $ref: '#/$defs/json_data' } },
      { $ref: '#/$defs/json_object' }
    ]
  }
};

const ACTION_PRODUCTION_FIELDS = [
  'source_refs', 'tool_refs', 'output_count', 'identity_mode', 'origin',
  'result_class', 'result_descriptor', 'output_class'
];
const ACTION_PRODUCTION_PROPERTIES = {
  source_refs: { type: 'array', minItems: 1, uniqueItems: true,
    items: refSchema },
  tool_refs: { type: 'array', uniqueItems: true, items: refSchema },
  output_count: { type: 'integer', minimum: 0, maximum: 8 },
  identity_mode: { enum: [
    'preserve_source', 'independent_outputs', 'no_useful_result'
  ] },
  origin: { anyOf: [{ type: 'null' }, {
    enum: ['direct_partition', 'crafted']
  }] },
  result_class: { enum: [
    'ordinary_physical_result', 'partial_transformation',
    'nonworking_construction', 'waste', 'written_carrier',
    'no_useful_result'
  ] },
  result_descriptor: { $ref: '#/$defs/action_production_descriptor' },
  output_class: { anyOf: [{ type: 'null' }, { enum: [
    'ordinary_mundane', 'weapon_capable', 'money_like_token',
    'written_carrier'
  ] }] }
};

function actionProductionSchema(identityMode, outputCount, descriptorRef) {
  return strictObject(ACTION_PRODUCTION_FIELDS, {
    ...ACTION_PRODUCTION_PROPERTIES,
    identity_mode: { const: identityMode }, output_count: outputCount,
    ...(descriptorRef == null ? {} : {
      result_descriptor: { $ref: descriptorRef }
    })
  });
}

export const TURN_STEP_REQUEST_V1_SCHEMA = deepFreeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'urn:rus:turn:turn_step_request_v1',
  ...strictObject([
    'schema', 'request_id', 'root_turn_id', 'committed_state_version',
    'working_revision', 'step_index', 'max_internal_steps',
    'root_player_action', 'remaining_intent', 'completed_steps', 'actor',
    'player_safe_state'
  ], {
    schema: { const: 'turn_step_request_v1' },
    request_id: textSchema,
    root_turn_id: textSchema,
    committed_state_version: { type: 'integer', minimum: 0 },
    working_revision: { type: 'integer', minimum: 0 },
    step_index: { type: 'integer', minimum: 1, maximum: 8 },
    max_internal_steps: { const: 8 },
    root_player_action: textSchema,
    remaining_intent: textSchema,
    completed_steps: {
      type: 'array',
      maxItems: 7,
      items: { $ref: '#/$defs/completed_step' }
    },
    actor: { $ref: '#/$defs/json_object' },
    player_safe_state: { $ref: '#/$defs/json_object' }
  }),
  $defs: {
    ...jsonDataDefinitions,
    completed_step: strictObject(['step_index', 'summary'], {
      step_index: { type: 'integer', minimum: 1, maximum: 7 },
      summary: textSchema
    })
  }
});

const planDefinitions = {
  interpretation: strictObject([
    'player_goal', 'grounded_attempt', 'adaptation'
  ], {
    player_goal: textSchema,
    grounded_attempt: textSchema,
    adaptation: { enum: ADAPTATIONS }
  }),
  semantic_activity: strictObject([
    'owner', 'duration_class', 'effort'
  ], {
    owner: { const: 'semantic' },
    duration_class: { enum: DURATION_CLASSES },
    effort: { enum: EFFORTS }
  }),
  domain_activity: strictObject([
    'owner', 'duration_class', 'effort'
  ], {
    owner: { const: 'domain' },
    duration_class: { type: 'null' },
    effort: { type: 'null' }
  }),
  additional_activity: strictObject(['duration_class', 'effort'], {
    duration_class: { enum: DURATION_CLASSES },
    effort: { enum: EFFORTS }
  }),
  continuation: {
    type: 'object',
    additionalProperties: false,
    required: ['remaining_intent', 'depends_on_refs'],
    properties: {
      remaining_intent: textSchema,
      depends_on_refs: {
        type: 'array', uniqueItems: true, items: refSchema
      }
    }
  },
  clarification: strictObject(['question', 'target_refs'], {
    question: textSchema,
    target_refs: { type: 'array', uniqueItems: true, items: refSchema }
  }),
  fact: strictObject(['temp_ref', 'text'], {
    temp_ref: refSchema,
    text: textSchema
  }),
  quantity: strictObject(['value', 'unit'], {
    value: { type: 'number', exclusiveMinimum: 0 },
    unit: textSchema
  }),
  mechanics: strictObject([
    'mass_grams', 'external_hand_cost', 'carry_form', 'packing_slot_cost',
    'quantity', 'container'
  ], {
    mass_grams: { type: 'integer', minimum: 0 },
    external_hand_cost: { enum: [0, 1, 2] },
    carry_form: { enum: ['compact', 'regular', 'long', 'bulky'] },
    packing_slot_cost: { type: 'integer', minimum: 0 },
    quantity: { anyOf: [{ type: 'null' }, { $ref: '#/$defs/quantity' }] },
    container: { type: 'null' }
  }),
  placement: strictObject(['relation', 'target_ref'], {
    relation: {
      enum: ['held_by', 'worn_by', 'inside', 'located_at', 'attached_to']
    },
    target_ref: refSchema
  }),
  origin: strictObject(['kind', 'source_refs'], {
    kind: { enum: ['direct_partition', 'ambient_ordinary', 'crafted'] },
    source_refs: {
      type: 'array', minItems: 1, uniqueItems: true, items: refSchema
    }
  }),
  create_entity: strictObject([
    'op', 'temp_ref', 'semantic_type', 'name', 'origin', 'facts', 'mechanics',
    'placement'
  ], {
    op: { const: 'create_entity' },
    temp_ref: refSchema,
    semantic_type: textSchema,
    name: textSchema,
    origin: { $ref: '#/$defs/origin' },
    facts: { type: 'array', items: { $ref: '#/$defs/fact' } },
    mechanics: { $ref: '#/$defs/mechanics' },
    placement: { $ref: '#/$defs/placement' }
  }),
  move_entity: strictObject(['op', 'entity_ref', 'placement'], {
    op: { const: 'move_entity' },
    entity_ref: refSchema,
    placement: { $ref: '#/$defs/placement' }
  }),
  change_entity_facts: strictObject([
    'op', 'entity_ref', 'remove_fact_refs', 'add_facts'
  ], {
    op: { const: 'change_entity_facts' },
    entity_ref: refSchema,
    remove_fact_refs: { type: 'array', uniqueItems: true, items: refSchema },
    add_facts: { type: 'array', items: { $ref: '#/$defs/fact' } }
  }),
  set_entity_mechanics: strictObject([
    'op', 'entity_ref', 'mechanics', 'reason'
  ], {
    op: { const: 'set_entity_mechanics' },
    entity_ref: refSchema,
    mechanics: { $ref: '#/$defs/mechanics' },
    reason: textSchema
  }),
  retire_entity: strictObject(['op', 'entity_ref', 'reason'], {
    op: { const: 'retire_entity' },
    entity_ref: refSchema,
    reason: textSchema
  }),
  apply_body_event: strictObject([
    'op', 'actor_ref', 'mechanism', 'severity', 'body_part_ref', 'description'
  ], {
    op: { const: 'apply_body_event' },
    actor_ref: refSchema,
    mechanism: {
      enum: [
        'impact', 'cut', 'puncture', 'burn', 'strain', 'crush', 'fall',
        'cold', 'heat', 'suffocation', 'poison', 'other'
      ]
    },
    severity: { enum: ['minor', 'moderate', 'severe', 'critical'] },
    body_part_ref: nullableRefSchema,
    description: textSchema
  }),
  request_discovery: strictObject([
    'op', 'actor_ref', 'discovery_kind', 'target_refs', 'query'
  ], {
    op: { const: 'request_discovery' },
    actor_ref: refSchema,
    discovery_kind: {
      enum: ['look', 'inspect', 'search', 'listen', 'remember', 'dig']
    },
    target_refs: {
      type: 'array', minItems: 1, uniqueItems: true, items: refSchema
    },
    query: textSchema
  }),
  request_container_access: strictObject([
    'op', 'actor_ref', 'container_ref', 'access_kind'
  ], {
    op: { const: 'request_container_access' },
    actor_ref: refSchema,
    container_ref: refSchema,
    access_kind: { enum: ['open', 'close', 'unlock', 'force', 'open_and_view'] }
  }),
  request_movement: strictObject([
    'op', 'actor_ref', 'target_ref', 'movement_kind'
  ], {
    op: { const: 'request_movement' },
    actor_ref: refSchema,
    target_ref: refSchema,
    movement_kind: { enum: ['local', 'route', 'long_course'] }
  }),
  action_production_descriptor: strictObject([
    'display_name', 'physical_description', 'qualitative_facts',
    'inscription_text', 'weapon_qualitative_class'
  ], {
    display_name: { anyOf: [{ type: 'null' }, textSchema] },
    physical_description: { anyOf: [{ type: 'null' }, textSchema] },
    qualitative_facts: {
      type: 'array', uniqueItems: true, items: textSchema
    },
    inscription_text: { anyOf: [{ type: 'null' }, textSchema] },
    weapon_qualitative_class: { anyOf: [{ type: 'null' }, { enum: [
      'improvised_puncture_light', 'improvised_impact_light',
      'improvised_cutting_light', 'improvised_two_hand_heavy'
    ] }] }
  }),
  action_production_output_descriptor: strictObject([
    'display_name', 'physical_description', 'qualitative_facts',
    'inscription_text', 'weapon_qualitative_class'
  ], {
    display_name: textSchema,
    physical_description: { anyOf: [{ type: 'null' }, textSchema] },
    qualitative_facts: {
      type: 'array', uniqueItems: true, items: textSchema
    },
    inscription_text: { anyOf: [{ type: 'null' }, textSchema] },
    weapon_qualitative_class: { anyOf: [{ type: 'null' }, { enum: [
      'improvised_puncture_light', 'improvised_impact_light',
      'improvised_cutting_light', 'improvised_two_hand_heavy'
    ] }] }
  }),
  action_production: { oneOf: [
    actionProductionSchema('preserve_source', { const: 0 }),
    actionProductionSchema('independent_outputs', {
      type: 'integer', minimum: 1, maximum: 8
    }, '#/$defs/action_production_output_descriptor'),
    actionProductionSchema('no_useful_result', { const: 0 })
  ] },
  request_item_use_legacy: strictObject([
    'op', 'actor_ref', 'item_ref', 'use_kind', 'target_refs'
  ], {
    op: { const: 'request_item_use' },
    actor_ref: refSchema,
    item_ref: refSchema,
    use_kind: { enum: ['consume', 'apply', 'operate', 'equip', 'unequip', 'other'] },
    target_refs: { type: 'array', uniqueItems: true, items: refSchema }
  }),
  request_item_use_action_production: strictObject([
    'op', 'actor_ref', 'item_ref', 'use_kind', 'target_refs',
    'action_production'
  ], {
    op: { const: 'request_item_use' }, actor_ref: refSchema,
    item_ref: refSchema, use_kind: { const: 'other' },
    target_refs: { type: 'array', uniqueItems: true, items: refSchema },
    action_production: { $ref: '#/$defs/action_production' }
  }),
  request_item_use: {
    oneOf: [
      { $ref: '#/$defs/request_item_use_legacy' },
      { $ref: '#/$defs/request_item_use_action_production' }
    ]
  },
  request_activity: strictObject([
    'op', 'actor_ref', 'activity_kind', 'target_refs', 'description'
  ], {
    op: { const: 'request_activity' },
    actor_ref: refSchema,
    activity_kind: { enum: ['wait', 'sleep', 'work', 'recover', 'carry', 'other'] },
    target_refs: { type: 'array', uniqueItems: true, items: refSchema },
    description: textSchema
  }),
  emit_interaction: strictObject([
    'op', 'actor_ref', 'target_actor_refs', 'interaction_kind', 'content',
    'instrument_refs'
  ], {
    op: { const: 'emit_interaction' },
    actor_ref: refSchema,
    target_actor_refs: {
      type: 'array', minItems: 1, uniqueItems: true, items: refSchema
    },
    interaction_kind: {
      enum: ['speech', 'gesture', 'offer', 'request', 'threat', 'attack', 'aid', 'other']
    },
    content: textSchema,
    instrument_refs: { type: 'array', uniqueItems: true, items: refSchema }
  })
};

planDefinitions.direct_operation = {
  oneOf: [
    'create_entity', 'move_entity', 'change_entity_facts',
    'set_entity_mechanics', 'retire_entity', 'apply_body_event'
  ].map((name) => ({ $ref: `#/$defs/${name}` }))
};
planDefinitions.domain_operation = {
  oneOf: [
    'request_discovery', 'request_container_access', 'request_movement',
    'request_item_use', 'request_activity', 'emit_interaction'
  ].map((name) => ({ $ref: `#/$defs/${name}` }))
};
planDefinitions.operation = {
  oneOf: [
    { $ref: '#/$defs/direct_operation' },
    { $ref: '#/$defs/domain_operation' }
  ]
};
planDefinitions.outcome = strictObject([
  'goal_result', 'additional_activity', 'operations', 'continuation'
], {
  goal_result: { enum: GOAL_RESULTS },
  additional_activity: {
    anyOf: [{ type: 'null' }, { $ref: '#/$defs/additional_activity' }]
  },
  operations: {
    type: 'array', items: { $ref: '#/$defs/operation' }
  },
  continuation: {
    anyOf: [{ type: 'null' }, { $ref: '#/$defs/continuation' }]
  }
});
planDefinitions.outcomes = strictObject(
  OUTCOME_BANDS,
  Object.fromEntries(OUTCOME_BANDS.map(
    (band) => [band, { $ref: '#/$defs/outcome' }]
  ))
);
planDefinitions.generic_check = strictObject([
  'purpose', 'attribute_ref', 'skill_ref', 'difficulty_id', 'outcomes'
], {
  purpose: textSchema,
  attribute_ref: refSchema,
  skill_ref: nullableRefSchema,
  difficulty_id: { enum: DIFFICULTIES },
  outcomes: { $ref: '#/$defs/outcomes' }
});

export const TURN_STEP_PLAN_V1_SCHEMA = deepFreeze({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'urn:rus:turn:turn_step_plan_v1',
  ...strictObject([
    'schema', 'request_id', 'committed_state_version', 'working_revision',
    'step_index', 'interpretation', 'resolution', 'goal_result', 'activity',
    'operations', 'check', 'continuation', 'clarification', 'reason_code',
    'reason'
  ], {
    schema: { const: 'turn_step_plan_v1' },
    request_id: textSchema,
    committed_state_version: { type: 'integer', minimum: 0 },
    working_revision: { type: 'integer', minimum: 0 },
    step_index: { type: 'integer', minimum: 1, maximum: 8 },
    interpretation: { $ref: '#/$defs/interpretation' },
    resolution: { enum: RESOLUTIONS },
    goal_result: { enum: GOAL_RESULTS },
    activity: {
      oneOf: [
        { $ref: '#/$defs/semantic_activity' },
        { $ref: '#/$defs/domain_activity' }
      ]
    },
    operations: { type: 'array', items: { $ref: '#/$defs/operation' } },
    check: {
      anyOf: [{ type: 'null' }, { $ref: '#/$defs/generic_check' }]
    },
    continuation: {
      anyOf: [{ type: 'null' }, { $ref: '#/$defs/continuation' }]
    },
    clarification: {
      anyOf: [{ type: 'null' }, { $ref: '#/$defs/clarification' }]
    },
    reason_code: textSchema,
    reason: textSchema
  }),
  $defs: planDefinitions
});
