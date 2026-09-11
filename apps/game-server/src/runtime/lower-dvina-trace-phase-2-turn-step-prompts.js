export const TURN_STEP_PLAN_EXAMPLE = JSON.stringify({ schema: 'turn_step_plan_v1', request_id: '<request_id>', committed_state_version: 0, working_revision: 0, step_index: 1, interpretation: { player_goal: '<player_goal>', grounded_attempt: '<grounded_attempt>', adaptation: 'literal' }, resolution: 'direct', goal_result: 'not_achieved', activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' }, operations: [], check: null, continuation: null, clarification: null, direct_result_kind: null, reason_code: '<reason_code>', reason: '<reason>' });

export const TURN_STEP_COMPOUND_EXAMPLE = 'Flat compound example. Input: Прошу подождать, затем сажусь. Output:\n' + JSON.stringify({
  interpretation: { player_goal: 'Прошу подождать, затем сажусь.',
    grounded_attempt: 'Прошу подождать.', adaptation: 'literal' },
  resolution: 'direct', goal_result: 'pending',
  activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
  direct_result_kind: 'player_utterance', utterance: {
    speaker_ref: '<copy current actor ref from request>',
    utterance_text: 'Подождите.', input_mode: 'intent_paraphrase' },
  operation_family: null, operation_choice: null, operations: [], check: null,
  continuation: { remaining_intent: 'затем сажусь.', depends_on_refs: [] },
  clarification: null, reason_code: 'speech_before_independent_action',
  reason: 'Only the request to wait is spoken; the independent next action remains unperformed.'
});

export const TURN_STEP_PLAN_MAPPINGS = JSON.stringify({
  player_utterance: {
    interpretation: { adaptation: 'literal' },
    resolution: 'direct', goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    direct_result_kind: 'player_utterance',
    utterance: {
      speaker_ref: '<copy current actor ref from request>',
      utterance_text: '<exact intended spoken words without enclosing action; faithful wording only when no quotation was supplied>',
      input_mode: '<verbatim for supplied words; intent_paraphrase for unquoted speech intent>'
    },
    operation_family: null, operation_choice: null,
    operations: [], check: null, clarification: null, continuation: null
  },
  reality_limited_physical_attempt: {
    interpretation: { adaptation: 'reality_limited' },
    resolution: 'direct', goal_result: 'not_achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'moderate' },
    operations: [], check: null
  },
  impossible_absent_fantastical_referent: {
    interpretation: { adaptation: 'make_believe' },
    resolution: 'direct', goal_result: 'not_achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'light' },
    operations: [], check: null
  },
  focused_ordinary_discovery: { interpretation: { adaptation: 'literal' }, resolution: 'domain_request', goal_result: 'pending', activity: { owner: 'domain', duration_class: null, effort: null }, operations: [{ op: 'request_discovery', actor_ref: '<copy current actor ref from request>', discovery_kind: '<copy inspect or search from intent>', target_refs: ['<copy every matching current visible searched location or entity ref in intent order>'], query: '<copy exact earliest discovery segment from request.remaining_intent>' }], check: null },
  ordinary_material_prerequisite: { interpretation: { adaptation: 'literal' }, resolution: 'domain_request', goal_result: 'pending', activity: { owner: 'domain', duration_class: null, effort: null }, operations: [{ op: 'request_discovery', actor_ref: '<copy current actor ref from request>', discovery_kind: 'inspect', target_refs: ['<copy one current visible scope ref>'], query: '<name only the needed ordinary referent, material, or physically connected group>' }], check: null, continuation: { remaining_intent: '<complete unexecuted acquisition, relocation, transformation, handling, and use intent>', depends_on_refs: [] } },
  ambient_ordinary_portion_take: { interpretation: { adaptation: 'literal' }, resolution: 'direct', goal_result: 'achieved', activity: { owner: 'semantic', duration_class: 'moment', effort: 'light' }, operations: [{ op: 'create_entity', temp_ref: '<new temporary ref>', semantic_type: 'material_portion', name: '<copy visible capability label>', origin: { kind: 'ambient_ordinary', source_refs: ['<copy exact visible ambient capability ref>'] }, facts: [], mechanics: { mass_grams: '<integer within capability ambient_portion_bounds.min_mass_grams..max_mass_grams>', external_hand_cost: 1, carry_form: 'compact', packing_slot_cost: '<nonnegative integer>', quantity: { value: '<number within capability ambient_portion_bounds.min_quantity..max_quantity>', unit: '<copy capability ambient_portion_bounds.quantity_unit>' }, container: null }, placement: { relation: 'held_by', target_ref: '<copy current actor ref from request>' } }], check: null },
  transient_item_use: { interpretation: { adaptation: 'literal' }, resolution: 'domain_request', goal_result: 'pending', activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' }, operations: [{ op: 'request_item_use', actor_ref: '<copy current actor ref>', item_ref: '<copy matching actionable item ref>', use_kind: 'other', target_refs: ['<copy only current player-safe targets, or empty>'], description: '<attempted non-transforming handling or contact only; no discovered result>' }], check: null, continuation: null },
  direct_item_relocation: { interpretation: { adaptation: 'literal' }, resolution: 'direct', goal_result: 'pending', activity: { owner: 'semantic', duration_class: 'moment', effort: 'light' }, operations: [{ op: 'move_entity', entity_ref: '<copy the grounded source item ref>', placement: { relation: '<held_by, worn_by, inside, located_at, or attached_to>', target_ref: '<copy the player-safe actor, container, position, or attachment target ref>' } }], check: null, continuation: { remaining_intent: '<only the still-unexecuted handling or transformation>', depends_on_refs: ['<copy the moved source item ref when later work needs it>'] } },
  action_production_preserve_source: {
    interpretation: { adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' },
    operations: [{ op: 'request_item_use',
      actor_ref: '<copy current actor ref from request>',
      item_ref: '<copy first source item ref>',
      use_kind: 'other',
      target_refs: ['<copy remaining source and tool refs in exact order>'],
      action_production: {
        source_refs: ['<one or more visible material item refs>'],
        tool_refs: ['<zero or more visible unchanged tool refs>'],
        requested_output_count: null,
        identity_mode: 'preserve_source', origin: null,
        result_class: 'ordinary_physical_result', material_extent: null,
        result_descriptor: {
          display_name: null,
          physical_description: '<visible physical result on preserved item>',
          qualitative_facts: ['<visible qualitative physical fact>'],
          removed_physical_fact_refs: [], inscription_text: null,
          physical_form: '<one allowed physical form or null>',
          source_fact_delta: null
        },
        output_class: 'ordinary_mundane'
      }
    }], check: null
  },
  available_container_access: {
    interpretation: { adaptation: 'literal' },
    resolution: 'domain_request',
    operation_choice: '<select matching supplied choice_id>', check: null
  },
  visible_general_look: {
    interpretation: { adaptation: 'literal' },
    resolution: 'direct', goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    operations: [], check: null,
    direct_result_kind: 'player_safe_observation'
  },
  ordinary_scene_seed: {
    interpretation: { adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{ op: 'request_discovery',
      actor_ref: '<copy current actor ref from request>',
      discovery_kind: 'look',
      target_refs: ['<copy current position ref from request>'],
      query: 'общий вид ближайшего окружения' }], check: null
  },
  spatial_grounded_look: {
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{ op: 'request_discovery', actor_ref: '<copy current actor ref from request>',
      discovery_kind: 'look', target_refs: ['<copy spatial_semantic.position_ref from request>'],
      query: '<brief look query>' }], check: null
  },
  local_world_process_start: {
    resolution: 'domain_request',
    operation_choice: '<select matching supplied choice_id>', check: null
  },
  local_world_process_affect: {
    resolution: 'domain_request',
    operation_choice: '<select matching supplied choice_id>', check: null
  }
});

export const NARRATION_AUDIT_PROMPT = 'Return only narration_audit JSON. Reject every unsupported fact. Use short strings and no duplicate evidence. Complete valid passing example: {"version":1,"schema":"narration_audit","pass":true,"concerns":[],"evidence":["visible facts only"]}.';
export const SEMANTIC_RESOLVER_PROMPT = [
  'Resolve the raw Russian player text against the complete closed',
  'option set. Return either {"status":"unknown","reason_code":',
  '"unknown_intent"} or exactly {"option_id":"<one offered option_id>"}.',
  'Never add consequences, time, checks, facts, writes or narration.'
];

export { TURN_STEP_PLANNER_INSTRUCTIONS } from
  './lower-dvina-trace-turn-step-planner-instructions.js';
