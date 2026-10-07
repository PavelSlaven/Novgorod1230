export const TURN_STEP_PLAN_EXAMPLE = JSON.stringify({ schema: 'turn_step_plan_v1', request_id: '<request_id>', committed_state_version: 0, working_revision: 0, step_index: 1, interpretation: { player_goal: '<player_goal>', grounded_attempt: '<grounded_attempt>', adaptation: 'literal' }, resolution: 'direct', goal_result: 'not_achieved', activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' }, operations: [], check: null, continuation: null, clarification: null, direct_result_kind: null, reason_code: '<reason_code>', reason: '<reason>' });

export const TURN_STEP_COMPOUND_EXAMPLE = 'Плоский пример составного действия. Ввод: Прошу подождать, затем сажусь. Вывод:\n' + JSON.stringify({
  interpretation: { player_goal: 'Прошу подождать, затем сажусь.',
    grounded_attempt: 'Прошу подождать.', adaptation: 'literal' },
  resolution: 'direct', goal_result: 'pending',
  activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
  direct_result_kind: 'player_utterance', utterance: {
    speaker_ref: '<скопируй ref текущего актора из request>',
    utterance_text: 'Подождите.', input_mode: 'intent_paraphrase',
    delivery: { loudness: 2, duration_class: 'instant' } },
  operation_family: null, operation_choice: null, operations: [], check: null,
  continuation: { remaining_intent: 'затем сажусь.', depends_on_refs: [] },
  clarification: null, reason_code: 'speech_before_independent_action',
  reason: 'Произнесена только просьба подождать; независимое следующее действие ещё не выполнено.'
});

export const TURN_STEP_PLAN_MAPPINGS = JSON.stringify({
  qualitative_assessment: {
    interpretation: { adaptation: 'literal' },
    resolution: 'direct', goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    direct_result_kind: 'player_safe_observation',
    assessment: {
      text: '<краткий player-safe вывод, подтверждённый переданными фактами>',
      support_refs: ['<скопируй один или несколько точных значений claim_ref из world_knowledge>']
    },
    operation_family: null, operation_choice: null, operations: [], check: null,
    continuation: null, clarification: null
  },
  ordinary_semantic_activity: {
    interpretation: { adaptation: 'literal' },
    resolution: 'direct', goal_result: 'achieved',
    activity: { owner: 'semantic',
      duration_class: '<moment, brief, short, or extended>',
      effort: '<none, light, moderate, or heavy>',
      requested_duration_minutes: '<положительное целое число минут, только если длительность указана явно>' },
    direct_result_kind: null, operation_family: null,
    operation_choice: null, operations: [], check: null,
    continuation: null, clarification: null
  },
  player_utterance: {
    interpretation: { adaptation: 'literal' },
    resolution: 'direct', goal_result: 'achieved',
    activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' },
    direct_result_kind: 'player_utterance',
    utterance: {
      speaker_ref: '<скопируй ref текущего актора из request>',
      utterance_text: '<точные задуманные произнесённые слова без описания действия; верная формулировка, только если цитата не была передана>',
      input_mode: '<verbatim для переданных слов; intent_paraphrase для намерения говорить без точной цитаты>',
      delivery: { loudness: '<1 шёпот, 2 обычная громкость, 3 повышенная громкость, 4 крик>',
        duration_class: '<instant, brief, or sustained>' }
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
  focused_ordinary_discovery: { interpretation: { adaptation: 'literal' }, resolution: 'domain_request', goal_result: 'pending', activity: { owner: 'domain', duration_class: null, effort: null }, operations: [{ op: 'request_discovery', actor_ref: '<скопируй ref текущего актора из request>', discovery_kind: '<скопируй inspect или search из намерения>', target_refs: ['<скопируй все подходящие текущие видимые refs разыскиваемого места или сущности в порядке намерения>'], query: '<скопируй точный самый ранний фрагмент discovery из request.remaining_intent>' }], check: null },
  ordinary_material_prerequisite: { interpretation: { adaptation: 'literal' }, resolution: 'domain_request', goal_result: 'pending', activity: { owner: 'domain', duration_class: null, effort: null }, operations: [{ op: 'request_discovery', actor_ref: '<скопируй ref текущего актора из request>', discovery_kind: 'inspect', target_refs: ['<скопируй ref одной текущей видимой области>'], query: '<назови только нужный обычный объект, материал или физически связанную группу>' }], check: null, continuation: { remaining_intent: '<полное ещё не выполненное намерение получить, переместить, преобразовать, обработать и использовать>', depends_on_refs: [] } },
  ambient_ordinary_portion_take: { interpretation: { adaptation: 'literal' }, resolution: 'direct', goal_result: 'achieved', activity: { owner: 'semantic', duration_class: 'moment', effort: 'light' }, operations: [{ op: 'create_entity', temp_ref: '<новый временный ref>', semantic_type: 'material_portion', name: '<скопируй видимую метку capability>', origin: { kind: 'ambient_ordinary', source_refs: ['<скопируй точный видимый ref ambient capability>'] }, facts: [], mechanics: { mass_grams: '<целое число в пределах capability ambient_portion_bounds.min_mass_grams..max_mass_grams>', external_hand_cost: 1, carry_form: 'compact', packing_slot_cost: '<неотрицательное целое число>', quantity: { value: '<число в пределах capability ambient_portion_bounds.min_quantity..max_quantity>', unit: '<скопируй capability ambient_portion_bounds.quantity_unit>' }, container: null }, placement: { relation: 'held_by', target_ref: '<скопируй ref текущего актора из request>' } }], check: null },
  transient_item_use: { interpretation: { adaptation: 'literal' }, resolution: 'domain_request', goal_result: 'pending', activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' }, operations: [{ op: 'request_item_use', actor_ref: '<скопируй ref текущего актора>', item_ref: '<скопируй подходящий пригодный item ref>', use_kind: 'other', target_refs: ['<скопируй только текущие player-safe цели или оставь массив пустым>'], description: '<только попытка обработки или контакта без преобразования; без обнаруженного результата>' }], check: null, continuation: null },
  direct_item_relocation: { interpretation: { adaptation: 'literal' }, resolution: 'direct', goal_result: 'pending', activity: { owner: 'semantic', duration_class: 'moment', effort: 'light' }, operations: [{ op: 'move_entity', entity_ref: '<скопируй обоснованный ref исходного предмета>', placement: { relation: '<held_by, worn_by, inside, located_at или attached_to>', target_ref: '<скопируй player-safe ref актора, контейнера, позиции или цели крепления>' } }], check: null, continuation: { remaining_intent: '<только ещё не выполненная обработка или преобразование>', depends_on_refs: ['<скопируй ref перемещённого источника, если он понадобится для дальнейшей работы>'] } },
  action_production_preserve_source: {
    interpretation: { adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'semantic', duration_class: 'brief', effort: 'light' },
    operations: [{ op: 'request_item_use',
      actor_ref: '<скопируй ref текущего актора из request>',
      item_ref: '<скопируй ref первого исходного предмета>',
      use_kind: 'other',
      target_refs: ['<скопируй остальные refs источников и инструментов в точном порядке>'],
      action_production: {
        source_refs: ['<один или несколько видимых refs предметов-материалов>'],
        tool_refs: ['<ноль или более видимых refs неизменённых инструментов>'],
        requested_output_count: null,
        identity_mode: 'preserve_source', origin: null,
        result_class: 'ordinary_physical_result', material_extent: null,
        result_descriptor: {
          display_name: null,
          physical_description: '<видимый физический результат на сохраняемом предмете>',
          qualitative_facts: ['<видимый качественный физический факт>'],
          removed_physical_fact_refs: [], inscription_text: null,
          physical_form: '<одна допустимая физическая форма или null>',
          source_fact_delta: null
        },
        output_class: 'ordinary_mundane'
      }
    }], check: null
  },
  available_container_access: {
    interpretation: { adaptation: 'literal' },
    resolution: 'domain_request',
    operation_choice: '<выбери подходящий переданный choice_id>', check: null
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
      actor_ref: '<скопируй ref текущего актора из request>',
      discovery_kind: 'look',
      target_refs: ['<скопируй ref текущей позиции из request>'],
      query: 'общий вид ближайшего окружения' }], check: null
  },
  spatial_grounded_look: {
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{ op: 'request_discovery', actor_ref: '<скопируй ref текущего актора из request>',
      discovery_kind: 'look', target_refs: ['<скопируй spatial_semantic.position_ref из request>'],
      query: '<краткий запрос на осмотр>' }], check: null
  },
  local_spatial_movement: {
    interpretation: { adaptation: 'literal' },
    resolution: 'domain_request', goal_result: 'pending',
    activity: { owner: 'domain', duration_class: null, effort: null },
    operations: [{ op: 'request_movement',
      actor_ref: '<скопируй ref текущего актора из request>',
      target_ref: '<скопируй entity_id одной видимой spatial_local_reference>',
      movement_kind: 'local' }], check: null
  },
  local_world_process_start: {
    resolution: 'domain_request',
    operation_choice: '<выбери подходящий переданный choice_id>', check: null
  },
  local_world_process_affect: {
    resolution: 'domain_request',
    operation_choice: '<выбери подходящий переданный choice_id>', check: null
  }
});

export const NARRATION_AUDIT_PROMPT = 'Return only narration_audit JSON. Reject every unsupported fact. Use short strings and no duplicate evidence. Complete valid passing example: {"version":1,"schema":"narration_audit","pass":true,"concerns":[],"evidence":["visible facts only"]}.';
export const SEMANTIC_RESOLVER_PROMPT = [
  'Сопоставь исходный русский текст игрока с полным закрытым набором',
  'вариантов. Верни либо {"status":"unknown","reason_code":"unknown_intent"}, либо в точности {"option_id":"<один из предложенных option_id>"}.',
  'Не добавляй последствия, время, проверки, факты, изменения состояния мира или повествование.'
];

export { TURN_STEP_PLANNER_INSTRUCTIONS } from
  './lower-dvina-trace-turn-step-planner-instructions.js';
