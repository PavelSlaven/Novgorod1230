import {
  TURN_ALLOWED_CHECKS,
  TURN_ALLOWED_STATE_BLOCKS,
  TURN_ALLOWED_SUBSYSTEMS,
  TURN_ALLOWED_WRITE_TARGETS,
  TURN_PRIMARY_MODES
} from './contracts.js';

const PATTERNS = Object.freeze({
  attention: /(?:осматриваюсь|осмотреть(?:ся)?|осмотр|ищу|искать|слушаю|прислуш(?:аться|иваюсь)|следить|вспоминаю|нюхаю|присматриваюсь)/iu,
  movement_scene: /(?:иду|подхожу|подойти|перехожу|захожу|выхожу|отхожу|перейти к|подойти к|бегу|отступаю)/iu,
  movement_route: /(?:по дороге|по маршруту|по тропе|вернуться назад|возвращаюсь|к известному месту|по зимнику|через брод|через мост)/iu,
  long_course: /(?:на север|на юг|на запад|на восток|вдоль|в лес|к берегу|куда глаза глядят|держусь|иду прочь|вниз по реке|вверх по реке)/iu,
  item_property: /(?:беру|взять|использую|использовать|отдать|спрятать|продать|купить|сломать|починить|открыть|вскрыть|переложить|достать|надеть|снять|передать|обыскать|инструмент)/iu,
  social_npc: /(?:говорю|спрашиваю|прошу|торгуюсь|лгу|договариваюсь|убеждаю|угрожаю словами|давлю статусом|нанимаю|обещаю|обмениваюсь)/iu,
  combat: /(?:нападаю|защищаюсь|ударить|схватить|повалить|удержать|вырваться|оружие|обезоружить|сдаться|позвать помощь в опасности)/iu,
  time_wait_work_sleep: /(?:жду|ожидаю|пережидаю|сплю|работаю|сон|отдыхаю долго|дежурю)/iu,
  body_recovery: /(?:лечу|лечить|перевязываю|останавливаю кровь|ем|пью|восстанавливаюсь|сплю чтобы восстановиться)/iu,
  stealth_order_violation: /(?:тихо|крадучись|скрытно|незаметно|прячусь|следить тайно|нарушаю порядок|ворую|без спроса|чтобы не заметили)/iu,
  knowledge_history: /(?:вспоминаю|слух|слухи|кто здесь правил|что было раньше|история|память|знаю ли я|помню ли я)/iu
});

export function resolveTurnIntentRoute(rawText, availableContext = {}) {
  const text = cleanText(rawText);
  const candidatePrimaryMode = selectPrimaryMode(text);
  const candidateSecondaryModes = selectSecondaryModes(text, candidatePrimaryMode);
  const requiredStateBlocks = selectRequiredStateBlocks(candidatePrimaryMode, candidateSecondaryModes);
  return {
    version: 1,
    schema: 'turn_intent_route',
    turn_id: buildTurnId(availableContext.partyId, availableContext.turnNumber),
    candidate_primary_mode: candidatePrimaryMode,
    candidate_secondary_modes: candidateSecondaryModes,
    required_state_blocks: requiredStateBlocks,
    needs_hidden_state: requiredStateBlocks.includes('relevant_hidden_state'),
    needs_npcs: requiredStateBlocks.includes('relevant_npcs'),
    needs_items: requiredStateBlocks.includes('relevant_items'),
    needs_routes: requiredStateBlocks.includes('relevant_routes'),
    needs_combat: candidatePrimaryMode === 'combat' || candidateSecondaryModes.includes('combat_resolution'),
    needs_stealth: candidatePrimaryMode === 'stealth_order_violation' || candidateSecondaryModes.includes('stealth')
  };
}

export function resolveTurnMode(rawText, availableContext = {}) {
  const text = cleanText(rawText);
  const route = resolveTurnIntentRoute(text, availableContext);
  const target = detectTarget(text, availableContext);
  const accessibilityCheck = buildAccessibilityCheck(route.candidate_primary_mode, route.candidate_secondary_modes, target);
  const resolutionPlan = buildResolutionPlan(route.candidate_primary_mode, route.candidate_secondary_modes, route.required_state_blocks);

  return {
    version: 1,
    schema: 'turn_mode_resolution',
    turn_id: route.turn_id,
    selected_primary_mode: route.candidate_primary_mode,
    secondary_modes: route.candidate_secondary_modes,
    intent: {
      raw_text: text,
      normalized_intent: normalizeIntent(text),
      player_words_are_world_facts: false
    },
    current_state_refs: {
      party_id: cleanText(availableContext.partyId) || 'party_runtime',
      current_position_id: cleanText(availableContext.currentPositionId) || `position:${route.turn_id}`,
      visible_context_id: cleanText(availableContext.visibleContextId) || `visible:${route.turn_id}`,
      character_knowledge_map_id: cleanText(availableContext.characterKnowledgeMapId) || `knowledge:${route.turn_id}`
    },
    accessibility_check: accessibilityCheck,
    resolution_plan: resolutionPlan,
    must_preserve: [
      'already_committed_facts',
      'current_position',
      'hidden_state_boundary',
      'character_knowledge_boundary'
    ],
    must_not_do: [
      'do_not_create_player_requested_fact_without_basis',
      'do_not_write_prose_before_consequences',
      'do_not_show_hidden_state',
      'do_not_replace_committed_state'
    ],
    target: target ? {
      label: target.label,
      target_type: target.targetType,
      source_panel: target.sourcePanel
    } : null
  };
}

function selectPrimaryMode(text) {
  const candidates = [];
  for (const mode of TURN_PRIMARY_MODES) {
    if (PATTERNS[mode]?.test(text)) candidates.push(mode);
  }
  if (candidates.length === 0) return 'combined';
  if (candidates.length === 1) return candidates[0];
  if (candidates.includes('combat')) return 'combat';
  if (candidates.includes('social_npc')) return 'social_npc';
  if (candidates.includes('item_property')) return 'item_property';
  if (candidates.includes('movement_route')) return 'movement_route';
  if (candidates.includes('movement_scene')) return 'movement_scene';
  return 'combined';
}

function selectSecondaryModes(text, primaryMode) {
  const secondary = [];
  for (const mode of TURN_PRIMARY_MODES) {
    if (mode !== primaryMode && PATTERNS[mode]?.test(text)) secondary.push(mode);
  }
  if (PATTERNS.stealth_order_violation.test(text)) secondary.push('stealth');
  if (PATTERNS.social_npc.test(text)) secondary.push('npc_interaction');
  if (PATTERNS.item_property.test(text)) secondary.push('item_access');
  if (PATTERNS.knowledge_history.test(text)) secondary.push('knowledge_memory');
  if (PATTERNS.time_wait_work_sleep.test(text) || PATTERNS.body_recovery.test(text) || PATTERNS.movement_scene.test(text) || PATTERNS.movement_route.test(text) || PATTERNS.long_course.test(text)) {
    secondary.push('time_progression');
  }
  return Array.from(new Set(secondary));
}

function selectRequiredStateBlocks(primaryMode, secondaryModes) {
  const blocks = new Set(['party_state', 'current_position', 'clock_weather_light', 'visible_context', 'character_knowledge_map', 'recent_changes_log']);
  if (['movement_scene', 'movement_route', 'long_course', 'social_npc', 'combat', 'combined'].includes(primaryMode)) blocks.add('relevant_npcs');
  if (['item_property', 'body_recovery', 'combined'].includes(primaryMode) || secondaryModes.includes('item_access')) {
    blocks.add('relevant_items');
    blocks.add('relevant_containers');
  }
  if (['movement_route', 'long_course', 'combined'].includes(primaryMode)) {
    blocks.add('relevant_routes');
    blocks.add('relevant_anchors');
  }
  if (['combat', 'knowledge_history', 'social_npc', 'stealth_order_violation', 'combined'].includes(primaryMode)) {
    blocks.add('relevant_hidden_state');
    blocks.add('relevant_events');
  }
  return TURN_ALLOWED_STATE_BLOCKS.filter((block) => blocks.has(block));
}

function buildAccessibilityCheck(primaryMode, secondaryModes, target) {
  const combined = primaryMode === 'combined' || secondaryModes.some((mode) => TURN_PRIMARY_MODES.includes(mode));
  return {
    can_attempt: true,
    cannot_attempt_reason: null,
    requires_check: combined || primaryMode === 'combat' || primaryMode === 'stealth_order_violation',
    requires_time: primaryMode !== 'knowledge_history',
    requires_risk_resolution: primaryMode === 'combat' || primaryMode === 'stealth_order_violation' || secondaryModes.includes('combat_resolution') || secondaryModes.includes('stealth'),
    physical_access: target ? 'uncertain' : 'pass',
    knowledge_access: primaryMode === 'knowledge_history' ? 'uncertain' : 'pass',
    social_access: primaryMode === 'social_npc' ? 'uncertain' : 'pass'
  };
}

function buildResolutionPlan(primaryMode, secondaryModes, requiredStateBlocks) {
  const subsystems = new Set();
  const checks = new Set(['physical_access', 'knowledge_access', 'social_access']);
  const writes = new Set(['party_state', 'party_visible_context_package', 'party_narrator_output', 'party_player_visible_message']);
  addPrimarySubsystems(primaryMode, subsystems, writes);
  for (const mode of secondaryModes) {
    if (TURN_ALLOWED_SUBSYSTEMS.includes(mode)) subsystems.add(mode);
    if (TURN_PRIMARY_MODES.includes(mode)) addPrimarySubsystems(mode, subsystems, writes);
    if (mode === 'stealth') checks.add('stealth_resolution');
    if (mode === 'npc_interaction') checks.add('social_access');
    if (mode === 'knowledge_memory') checks.add('knowledge_access');
  }
  if (subsystems.has('movement') || subsystems.has('route') || subsystems.has('long_course_materialization')) checks.add('time_cost');
  if (subsystems.has('combat_resolution')) checks.add('combat_resolution');
  return {
    subsystems: TURN_ALLOWED_SUBSYSTEMS.filter((item) => subsystems.has(item)),
    checks_to_run: TURN_ALLOWED_CHECKS.filter((item) => checks.has(item)),
    state_blocks_to_load: requiredStateBlocks,
    expected_writes: TURN_ALLOWED_WRITE_TARGETS.filter((item) => writes.has(item))
  };
}

function addPrimarySubsystems(mode, subsystems, writes) {
  switch (mode) {
    case 'attention':
      subsystems.add('visible_context_projection');
      subsystems.add('knowledge_memory');
      break;
    case 'movement_scene':
      subsystems.add('movement');
      subsystems.add('time_progression');
      writes.add('party_current_position');
      break;
    case 'movement_route':
      subsystems.add('route');
      subsystems.add('time_progression');
      writes.add('party_current_position');
      break;
    case 'long_course':
      subsystems.add('long_course_materialization');
      subsystems.add('route');
      subsystems.add('time_progression');
      writes.add('party_current_position');
      break;
    case 'item_property':
      subsystems.add('item_access');
      subsystems.add('inventory');
      subsystems.add('ownership_access');
      writes.add('party_items');
      writes.add('party_containers');
      break;
    case 'social_npc':
      subsystems.add('npc_interaction');
      subsystems.add('social_status');
      subsystems.add('event_reaction');
      writes.add('party_npcs');
      writes.add('party_events');
      break;
    case 'combat':
      subsystems.add('combat_resolution');
      subsystems.add('body_state');
      subsystems.add('event_reaction');
      writes.add('party_npcs');
      writes.add('party_events');
      break;
    case 'time_wait_work_sleep':
      subsystems.add('time_progression');
      subsystems.add('body_state');
      break;
    case 'body_recovery':
      subsystems.add('recovery');
      subsystems.add('body_state');
      subsystems.add('inventory');
      writes.add('party_items');
      break;
    case 'stealth_order_violation':
      subsystems.add('stealth');
      subsystems.add('event_reaction');
      writes.add('party_events');
      break;
    case 'knowledge_history':
      subsystems.add('knowledge_memory');
      writes.add('party_character_knowledge_map');
      break;
    case 'combined':
      subsystems.add('visible_context_projection');
      subsystems.add('event_reaction');
      break;
    default:
      break;
  }
}

function detectTarget(text, availableContext) {
  const candidates = collectCandidates(availableContext);
  const normalizedText = normalizeSearchText(text);
  for (const candidate of candidates) {
    const label = normalizeSearchText(candidate.label);
    const labelStem = label.length > 4 ? label.slice(0, -1) : label;
    if (label && (normalizedText.includes(label) || (labelStem && normalizedText.includes(labelStem)))) {
      return candidate;
    }
  }
  return null;
}

function collectCandidates(availableContext) {
  return [
    ...normalizeCandidates(availableContext.visibleExits, 'visible_exit', 'attention_panel.visible_exits'),
    ...normalizeCandidates(availableContext.visibleNpcs, 'visible_npc', 'attention_panel.visible_npcs'),
    ...normalizeCandidates(availableContext.visibleItems, 'visible_item', 'attention_panel.visible_items'),
    ...normalizeCandidates(availableContext.visibleContainers, 'visible_container', 'attention_panel.visible_containers'),
    ...normalizeCandidates(availableContext.knownRoutes, 'known_route', 'map_panel.known_nearby_nodes')
  ];
}

function normalizeCandidates(list, targetType, sourcePanel) {
  return Array.isArray(list)
    ? list.map((item) => {
      const label = cleanText(item?.label ?? item?.public_label ?? item);
      return label ? { label, targetType, sourcePanel } : null;
    }).filter(Boolean)
    : [];
}

function normalizeIntent(value) {
  return normalizeSearchText(value);
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function normalizeSearchText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function buildTurnId(partyId, turnNumber) {
  const party = cleanText(partyId) || 'party';
  const turn = Number.isFinite(Number(turnNumber)) ? Number(turnNumber) : 0;
  return `turn:${party}:${String(turn).padStart(4, '0')}`;
}
