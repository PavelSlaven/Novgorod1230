import { findForbiddenFirstScreenFields } from '../new-game-pipeline/screens/first-game-screen.js';
import { buildPartyStateSnapshot } from '../state.js';
import { buildActionCheck } from '../checks.js';
import { commitWorldTransaction, simulateTurnMechanics } from '../engine.js';
import { planMasterTurnSync } from '../master.js';
import {
  validateTurnIntentRoute,
  validateTurnModeResolution,
  validateTurnResolutionAudit,
  validateTurnWritePlan
} from './contracts.js';
import { resolveTurnMode } from './mode-resolver.js';
import { runTurnFormatRepairer, runTurnIntentRouter, runTurnOrchestrator, runTurnResolutionAuditor } from './provider.js';
import { loadBaseTurnOrchestrationRunbook } from './runbook.js';

const READY_PHASE = 'awaiting_player_input';
const TECHNICAL_TOKEN_PATTERN = /\b(?:G[1-5]_|g[1-5]_|npc_|item_|container_|anchor_|place_|location_|minilocation_|region_|candidate_|source_|audit_|hidden_)[A-Za-z0-9_-]+\b/u;

export function createPartyTurnRuntimeState({ partyScreenPayload, now = new Date().toISOString() } = {}) {
  const screen = extractActiveScreen(partyScreenPayload);
  if (!screen) throw new Error('createPartyTurnRuntimeState requires active party screen payload.');
  return {
    version: 1,
    schema: 'party_turn_runtime_state',
    initialized_at: now,
    party_id: screen.party_id,
    current_turn_number: Number(screen.turn_number ?? 0),
    current_phase: READY_PHASE,
    current_screen: structuredClone(screen),
    public_state: extractPublicState(screen),
    hidden_state: {
      recent_changes_log: [],
      last_turn_mode: null,
      last_turn_summary: null
    },
    turn_history: []
  };
}

export function shouldUsePartyTurnRuntime(world, partyScreenPayload, partyRuntimeState = null) {
  if (partyRuntimeState?.schema === 'party_turn_runtime_state') return true;
  if (extractActiveScreen(partyScreenPayload)) return true;
  return Boolean(world && typeof world === 'object');
}

export function bootstrapPartyRuntimeFromWorld(world, bootstrapPayload) {
  if (!bootstrapPayload?.party_turn_screen && !bootstrapPayload?.partyTurnScreen && !bootstrapPayload?.firstGameScreen && !bootstrapPayload?.first_game_screen) {
    throw new Error('bootstrapPartyRuntimeFromWorld requires bootstrap payload with active screen.');
  }
  if (world && typeof world === 'object') {
    world.partyScreenPayload = structuredClone(bootstrapPayload);
  }
  return createPartyTurnRuntimeState({ partyScreenPayload: bootstrapPayload });
}

export async function runPartyTurnPipeline({
  world = null,
  partyScreenPayload = null,
  partyRuntimeState = null,
  bootstrapPayload = null,
  rawText,
  selectedActionOptionId = null,
  env = process.env,
  llmExecutors = {},
  now = new Date().toISOString()
} = {}) {
  const text = cleanText(rawText);
  if (!text) throw new Error('Party turn pipeline requires non-empty rawText.');

  const runtime = resolveRuntimeState({ world, partyScreenPayload, partyRuntimeState, bootstrapPayload, now });
  const nextTurnNumber = Number(runtime.current_turn_number ?? 0) + 1;
  const playerTurnInput = {
    version: 1,
    schema: 'player_turn_input',
    party_id: runtime.party_id,
    turn_number: nextTurnNumber,
    raw_text: text,
    selected_action_option_id: cleanText(selectedActionOptionId) || null,
    input_source: selectedActionOptionId ? 'suggested_action' : 'free_text',
    received_at: now,
    interpretation_status: 'pending',
    contract: 'intent_not_fact'
  };

  const retrievedState = buildRetrievedTurnState(world, runtime, playerTurnInput);
  const routerInput = {
    raw_text: text,
    available_context: buildAvailableContext(runtime, retrievedState)
  };
  const turnIntentRoute = await runTurnIntentRouter(buildTurnRolePayload('TurnIntentRouter', routerInput), {
    env,
    executor: llmExecutors.intentRouter,
    forceDeterministic: true
  });
  assertValidation('turn_intent_route', validateTurnIntentRoute(turnIntentRoute));

  const orchestratorInput = {
    raw_text: text,
    available_context: buildAvailableContext(runtime, retrievedState),
    retrieved_state: filterRetrievedStateByRoute(retrievedState, turnIntentRoute),
    runbook: loadBaseTurnOrchestrationRunbook()
  };
  let turnModeResolution;
  try {
    turnModeResolution = await runTurnOrchestrator(buildTurnRolePayload('TurnOrchestratorAgent', orchestratorInput), {
      env,
      executor: llmExecutors.orchestrator,
      forceDeterministic: true
    });
  } catch (error) {
    turnModeResolution = await runTurnFormatRepairer({
      expected_schema: 'turn_mode_resolution',
      broken_json: String(error?.message ?? '')
    }, {
      env,
      executor: llmExecutors.formatRepairer,
      forceDeterministic: true
    });
  }
  if (!turnModeResolution?.selected_primary_mode) {
    turnModeResolution = resolveTurnMode(text, buildAvailableContext(runtime, retrievedState));
  }
  assertValidation('turn_mode_resolution', validateTurnModeResolution(turnModeResolution));

  const resolutionAudit = await runTurnResolutionAuditor({
    retrieved_state: filterRetrievedStateByRoute(retrievedState, turnIntentRoute),
    turn_mode_resolution: turnModeResolution
  }, {
    env,
    executor: llmExecutors.auditor,
    forceDeterministic: true
  });
  assertValidation('turn_resolution_audit', validateTurnResolutionAudit(resolutionAudit));

  const turnStatus = resolutionAudit.pass ? 'resolved' : resolutionAudit.status;
  const mechanicsBridge = buildMechanicalBridge(world, text);
  const consequence = buildTurnConsequence(
    filterRetrievedStateByRoute(retrievedState, turnIntentRoute),
    turnModeResolution,
    resolutionAudit,
    playerTurnInput,
    mechanicsBridge
  );
  const visibleContext = buildVisibleContextPackage(consequence.public_state, turnModeResolution, turnStatus);
  const narratorProse = buildNarratorProse(visibleContext, turnModeResolution, turnStatus, consequence);
  const writePlan = buildTurnWritePlan({
    runtime,
    playerTurnInput,
    turnModeResolution,
    resolutionAudit,
    consequence,
    visibleContext,
    narratorProse
  });
  assertValidation('party_turn_write_plan', validateTurnWritePlan(writePlan));
  const commitGate = buildTurnCommitGate(writePlan, resolutionAudit);
  if (!commitGate.pass) {
    throw new Error(`TURN_COMMIT_GATE_FAILED: ${commitGate.concerns.join('; ')}`);
  }

  if (world && mechanicsBridge?.draftWorld && turnStatus === 'resolved') {
    commitWorldTransaction(world, mechanicsBridge.draftWorld);
    normalizeCommittedWorldState(world);
    applySupplementalTurnEffects(world, mechanicsBridge, playerTurnInput);
  }
  const nextRuntime = applyWritePlan(runtime, writePlan, narratorProse, turnModeResolution, now);
  const nextScreen = buildPartyTurnScreen(nextRuntime, playerTurnInput, turnModeResolution, narratorProse, visibleContext, turnStatus, now);
  const nextPayload = {
    version: 1,
    schema: 'party_turn_result_ui_payload',
    party_id: nextRuntime.party_id,
    openingText: nextScreen.main_prose,
    firstGameScreen: null,
    partyTurnScreen: nextScreen,
    party_turn_screen: nextScreen,
    delivery_state: nextScreen.delivery_state,
    runtime_state: {
      party_id: nextRuntime.party_id,
      current_phase: nextRuntime.current_phase,
      current_turn_number: nextRuntime.current_turn_number
    }
  };

  if (world && typeof world === 'object') {
    world.partyRuntimeState = structuredClone(nextRuntime);
    world.partyScreenPayload = structuredClone(nextPayload);
    world.lastNarratorProse = nextScreen.main_prose;
    world.lastUpdatedAt = now;
    world.catalogDirty = true;
  }

  return {
    playerTurnInput,
    turnIntentRoute,
    turnModeResolution,
    resolutionAudit,
    consequence,
    visibleContext,
    narratorProse,
    writePlan,
    commitGate,
    partyRuntimeState: nextRuntime,
    partyScreenPayload: nextPayload,
    text: nextScreen.main_prose
  };
}

export async function runPartyTurnRuntime(options = {}) {
  return runPartyTurnPipeline(options);
}

function resolveRuntimeState({ world, partyScreenPayload, partyRuntimeState, bootstrapPayload, now }) {
  if (partyRuntimeState?.schema === 'party_turn_runtime_state') return structuredClone(partyRuntimeState);
  if (extractActiveScreen(partyScreenPayload)) return createPartyTurnRuntimeState({ partyScreenPayload, now });
  if (extractActiveScreen(bootstrapPayload)) return createPartyTurnRuntimeState({ partyScreenPayload: bootstrapPayload, now });
  throw new Error('No party runtime state or bootstrap payload available for new turn pipeline.');
}

function buildRetrievedTurnState(world, runtime, playerTurnInput) {
  const partyStateSnapshot = world ? buildPartyStateSnapshot(world) : {};
  const screen = runtime.current_screen ?? {};
  return {
    version: 1,
    schema: 'retrieved_turn_state',
    party_state: {
      party_id: runtime.party_id,
      current_phase: runtime.current_phase,
      current_turn_number: runtime.current_turn_number,
      snapshot: structuredClone(partyStateSnapshot)
    },
    current_position: structuredClone(partyStateSnapshot.current_position ?? world?.current_position ?? null),
    clock_weather_light: {
      clock: structuredClone(partyStateSnapshot.time ?? world?.clock ?? null),
      weather: structuredClone(partyStateSnapshot.weather ?? world?.scene?.weather ?? null),
      light: structuredClone(world?.scene?.light ?? null)
    },
    visible_context: structuredClone(runtime.public_state),
    character_knowledge_map: structuredClone(partyStateSnapshot.character_knowledge_map ?? world?.player?.knowledge_map ?? null),
    relevant_hidden_state: structuredClone(partyStateSnapshot.hidden_state ?? runtime.hidden_state ?? null),
    relevant_npcs: structuredClone(partyStateSnapshot.npcs ?? world?.npcs ?? []),
    relevant_items: structuredClone(partyStateSnapshot.items ?? world?.propertyLedger ?? []),
    relevant_containers: structuredClone(partyStateSnapshot.containers ?? []),
    relevant_routes: structuredClone(partyStateSnapshot.known_routes ?? world?.player?.knowledge_map?.known_routes ?? []),
    relevant_anchors: structuredClone(world?.cluster?.graph?.anchors ?? []),
    recent_changes_log: structuredClone(partyStateSnapshot.recent_changes_log ?? runtime.hidden_state?.recent_changes_log ?? []),
    relevant_events: structuredClone(world?.events ?? []),
    current_state_refs: {
      party_id: runtime.party_id,
      current_position_id: cleanText(screen.position_panel?.public_position_label) || `position:${runtime.party_id}`,
      visible_context_id: cleanText(screen.delivery_state?.message_id) || `visible:${playerTurnInput.turn_number}`,
      character_knowledge_map_id: `knowledge:${runtime.party_id}`
    }
  };
}

function filterRetrievedStateByRoute(retrievedState, turnIntentRoute) {
  const state = { ...retrievedState };
  const needed = new Set(turnIntentRoute.required_state_blocks ?? []);
  if (!needed.has('relevant_hidden_state')) state.relevant_hidden_state = null;
  if (!needed.has('relevant_npcs')) state.relevant_npcs = [];
  if (!needed.has('relevant_items')) state.relevant_items = [];
  if (!needed.has('relevant_containers')) state.relevant_containers = [];
  if (!needed.has('relevant_routes')) state.relevant_routes = [];
  if (!needed.has('relevant_anchors')) state.relevant_anchors = [];
  if (!needed.has('relevant_events')) state.relevant_events = [];
  return state;
}

function buildAvailableContext(runtime, retrievedState) {
  return {
    partyId: runtime.party_id,
    turnNumber: Number(runtime.current_turn_number ?? 0) + 1,
    currentPositionId: retrievedState.current_state_refs.current_position_id,
    visibleContextId: retrievedState.current_state_refs.visible_context_id,
    characterKnowledgeMapId: retrievedState.current_state_refs.character_knowledge_map_id,
    visibleExits: runtime.public_state.public_visible_exits,
    visibleNpcs: runtime.public_state.public_visible_npcs,
    visibleItems: runtime.public_state.public_visible_items,
    visibleContainers: runtime.public_state.public_visible_containers,
    knownRoutes: runtime.public_state.public_visible_map?.known_nearby_nodes
  };
}

function buildTurnRolePayload(name, payload) {
  return {
    system_prompt: [
      `Ты ${name}.`,
      'Верни только JSON object без markdown.',
      'Игроков ввод трактуется как намерение, а не как факт мира.'
    ].join('\n'),
    payload
  };
}

function buildTurnConsequence(retrievedState, turnModeResolution, resolutionAudit, playerTurnInput, mechanicsBridge = null) {
  const publicState = structuredClone(retrievedState.visible_context ?? {});
  const primary = turnModeResolution.selected_primary_mode;
  const target = turnModeResolution.target?.label ?? null;
  const blocked = resolutionAudit.pass !== true;

  if (blocked) {
    return {
      summary: resolutionAudit.status,
      public_state: publicState,
      visible_changes: [],
      hidden_changes: [],
      result_text: `Действие "${playerTurnInput.raw_text}" пока нельзя надёжно разрешить по текущему состоянию мира.`
    };
  }

  const summaryMap = {
    attention: 'observation',
    movement_scene: 'movement_scene',
    movement_route: 'movement_route',
    long_course: 'long_course',
    item_property: 'item_property',
    social_npc: 'social_npc',
    combat: 'combat',
    time_wait_work_sleep: 'time_wait_work_sleep',
    body_recovery: 'body_recovery',
    stealth_order_violation: 'stealth_order_violation',
    knowledge_history: 'knowledge_history',
    combined: 'combined'
  };

  const visibleChanges = [];
  if (primary === 'movement_scene' && target) {
    publicState.public_position_label = `рядом с ${target}`;
    visibleChanges.push(`позиция смещена к ${target}`);
  } else if (primary === 'movement_route') {
    publicState.public_position_label = target ? `по пути к ${target}` : 'в пути по известному маршруту';
    visibleChanges.push('позиция по маршруту обновлена');
  } else if (primary === 'long_course') {
    publicState.public_warning_badges = mergeHint(publicState.public_warning_badges, 'Курс ещё требует уточнения по местности.');
    visibleChanges.push('дальний курс продолжен');
  } else if (primary === 'time_wait_work_sleep' || primary === 'body_recovery') {
    publicState.public_time_label = bumpTimeLabel(publicState.public_time_label);
    visibleChanges.push('время прошло');
  } else if (primary === 'knowledge_history') {
    publicState.public_context_hints = mergeHint(publicState.public_context_hints, 'Персонаж восстановил часть релевантного знания.');
    visibleChanges.push('карта знания обновлена');
  }

  return {
    summary: summaryMap[primary] ?? 'combined',
    public_state: publicState,
    visible_changes: visibleChanges,
    hidden_changes: [],
    result_text: cleanText(mechanicsBridge?.resolution?.text) || buildResultText(primary, target, playerTurnInput.raw_text)
  };
}

function buildVisibleContextPackage(publicState, turnModeResolution, turnStatus) {
  return {
    version: 1,
    schema: 'visible_context_package',
    visible_context_status: turnStatus === 'resolved' ? 'formed' : 'partial',
    turn_mode: turnModeResolution.selected_primary_mode,
    public_state: structuredClone(publicState)
  };
}

function buildNarratorProse(visibleContext, turnModeResolution, turnStatus, consequence = null) {
  const state = visibleContext.public_state ?? {};
  const prose = turnStatus === 'resolved'
    ? cleanText(consequence?.result_text) || buildResultText(turnModeResolution.selected_primary_mode, turnModeResolution.target?.label ?? null, turnModeResolution.intent?.raw_text ?? '')
    : `Попытка "${turnModeResolution.intent?.raw_text ?? ''}" не дала надёжного результата без дополнительного подтверждения.`;
  return {
    version: 1,
    schema: 'narrator_turn_prose',
    prose_status: 'drafted',
    prose,
    action_options: buildSuggestedActions(state, turnModeResolution),
    visible_context_ref: visibleContext.schema
  };
}

function buildTurnWritePlan({ runtime, playerTurnInput, turnModeResolution, resolutionAudit, consequence, visibleContext, narratorProse }) {
  return {
    version: 1,
    schema: 'party_turn_write_plan',
    party_id: runtime.party_id,
    turn_number: playerTurnInput.turn_number,
    status: resolutionAudit.status,
    write_targets: [
      { target: 'party_state', kind: 'update_current_turn_number' },
      { target: 'party_visible_context_package', kind: 'replace_visible_context' },
      { target: 'party_narrator_output', kind: 'insert_turn_prose' },
      { target: 'party_player_visible_message', kind: 'replace_player_visible_screen' }
    ],
    visible_context_package: visibleContext,
    narrator_prose: narratorProse,
    consequence_summary: consequence.summary,
    selected_primary_mode: turnModeResolution.selected_primary_mode
  };
}

function buildTurnCommitGate(writePlan, resolutionAudit) {
  const concerns = [];
  if (!writePlan?.party_id) concerns.push('missing party_id');
  if (resolutionAudit.pass !== true && !['blocked', 'partial', 'needs_repair'].includes(resolutionAudit.status)) {
    concerns.push('invalid audit status');
  }
  return {
    pass: concerns.length === 0,
    concerns
  };
}

function applyWritePlan(runtime, writePlan, narratorProse, turnModeResolution, now) {
  const next = structuredClone(runtime);
  next.current_turn_number = Number(writePlan.turn_number ?? next.current_turn_number);
  next.current_phase = READY_PHASE;
  next.public_state = structuredClone(writePlan.visible_context_package.public_state ?? next.public_state);
  next.hidden_state.last_turn_mode = turnModeResolution.selected_primary_mode;
  next.hidden_state.last_turn_summary = writePlan.consequence_summary;
  next.hidden_state.recent_changes_log = [
    ...(Array.isArray(next.hidden_state.recent_changes_log) ? next.hidden_state.recent_changes_log.slice(-19) : []),
    {
      turn_number: next.current_turn_number,
      primary_mode: turnModeResolution.selected_primary_mode,
      summary: writePlan.consequence_summary
    }
  ];
  next.turn_history = [
    ...(Array.isArray(next.turn_history) ? next.turn_history.slice(-19) : []),
    {
      turn_number: next.current_turn_number,
      selected_primary_mode: turnModeResolution.selected_primary_mode,
      narrator_prose: narratorProse.prose,
      committed_at: now
    }
  ];
  return next;
}

function buildPartyTurnScreen(runtime, playerTurnInput, turnModeResolution, narratorProse, visibleContext, turnStatus, now) {
  const state = visibleContext.public_state ?? {};
  const screen = {
    version: 1,
    schema: 'party_turn_screen',
    screen_status: 'ready',
    request_id: runtime.current_screen?.request_id ?? null,
    party_id: runtime.party_id,
    turn_number: playerTurnInput.turn_number,
    main_prose: narratorProse.prose,
    turn_resolution_status: turnStatus,
    position_panel: {
      public_position_label: requirePublicText(state.public_position_label, 'position_panel.public_position_label'),
      technical_position_hidden: true,
      debug_position: null
    },
    time_panel: {
      public_time_label: requirePublicText(state.public_time_label, 'time_panel.public_time_label'),
      public_light_label: requirePublicText(state.public_light_label, 'time_panel.public_light_label'),
      public_weather_label: optionalPublicText(state.public_weather_label)
    },
    character_panel: {
      public_character_label: optionalPublicText(state.public_character_label) ?? 'Ты',
      body_state_summary: publicTextList(state.public_body_state_summary),
      inventory_summary: publicTextList(state.public_inventory_summary),
      warning_badges: publicTextList(state.public_warning_badges)
    },
    attention_panel: {
      visible_npcs: sanitizeAttentionList(state.public_visible_npcs, 'visible_npc'),
      visible_items: sanitizeAttentionList(state.public_visible_items, 'visible_item'),
      visible_containers: sanitizeAttentionList(state.public_visible_containers, 'visible_container'),
      visible_exits: sanitizeAttentionList(state.public_visible_exits, 'visible_exit'),
      audible_or_sensory_cues: sanitizeAttentionList(state.public_attention_targets, 'sensory_cue'),
      known_context_hints: sanitizeAttentionList(state.public_context_hints, 'known_context_hint')
    },
    action_panel: {
      suggested_actions: narratorProse.action_options,
      free_text_input: {
        enabled: true,
        placeholder: 'Что ты делаешь?',
        input_contract: 'player_intent_not_world_fact'
      }
    },
    map_panel: {
      enabled: true,
      map_mode: 'character_known_only',
      known_current_node: publicMapNode(state.public_visible_map?.known_current_node),
      known_nearby_nodes: publicMapList(state.public_visible_map?.known_nearby_nodes),
      unknown_exits: publicMapList(state.public_visible_map?.unknown_exits),
      must_not_show_hidden_nodes: true
    },
    ui_safety_boundary: {
      hidden_state_not_included: true,
      audit_not_included: true,
      source_trace_not_included: true,
      raw_ids_not_included: true,
      player_sees_only_character_safe_context: true
    },
    delivery_state: {
      message_id: `turn:${runtime.party_id}:${String(playerTurnInput.turn_number).padStart(4, '0')}`,
      produced_at: now,
      awaiting_client_ack: false
    },
    runtime_state: {
      current_phase: READY_PHASE,
      current_turn_number: playerTurnInput.turn_number,
      mode: turnModeResolution.selected_primary_mode
    }
  };
  const violations = findForbiddenFirstScreenFields(screen);
  if (violations.length > 0) {
    throw new Error(`Party turn screen leaked forbidden fields: ${violations.map((item) => item.code).join(', ')}`);
  }
  return screen;
}

function buildSuggestedActions(publicState, turnModeResolution) {
  const actions = [];
  for (const item of sanitizeAttentionList(publicState.public_visible_containers, 'visible_container').slice(0, 2)) {
    actions.push(makeSuggestedAction(`Осмотреть ${item.label}.`, 'inspect', `осмотреть ${item.label}`, item.risk_hint));
  }
  for (const item of sanitizeAttentionList(publicState.public_visible_npcs, 'visible_npc').slice(0, 2)) {
    actions.push(makeSuggestedAction(`Заговорить с ${item.label}.`, 'talk', `заговорить с ${item.label}`, item.risk_hint));
  }
  for (const item of sanitizeAttentionList(publicState.public_visible_exits, 'visible_exit').slice(0, 2)) {
    actions.push(makeSuggestedAction(`Подойти к ${item.label}.`, 'move', `подойти к ${item.label}`, item.risk_hint));
  }
  if (!actions.some((item) => item.action_kind === 'wait')) {
    actions.push(makeSuggestedAction('Подождать и осмотреться.', 'wait', 'жду', null));
  }
  if (turnModeResolution.selected_primary_mode === 'combined') {
    actions.unshift(makeSuggestedAction('Уточнить главное намерение.', 'inspect', 'осматриваюсь', 'low'));
  }
  return actions.slice(0, 6);
}

function makeSuggestedAction(label, actionKind, command, riskHint) {
  return withoutNullish({
    suggested_action_id: `suggested_action_${slugify(label)}`,
    label: requirePublicText(label, 'suggested_action.label'),
    action_kind: actionKind,
    command: requirePublicText(command, 'suggested_action.command'),
    risk_hint: optionalPublicText(riskHint),
    requires_resolution_pipeline: true,
    must_not_reveal_hidden_truth: true
  });
}

function buildResultText(primaryMode, targetLabel, rawText) {
  switch (primaryMode) {
    case 'attention':
      return targetLabel
        ? `Ты сосредотачиваешься на "${targetLabel}" и отделяешь наблюдаемое от догадок.`
        : 'Ты ещё раз внимательно осматриваешься и не подменяешь видимое предположениями.';
    case 'movement_scene':
      return targetLabel
        ? `Ты смещаешься к "${targetLabel}" и оцениваешь сцену с новой позиции.`
        : 'Ты меняешь позицию внутри сцены и заново оцениваешь обстановку.';
    case 'movement_route':
      return targetLabel
        ? `Ты продолжаешь путь по известному маршруту к "${targetLabel}".`
        : 'Ты идёшь по известному маршруту и удерживаешь направление.';
    case 'long_course':
      return 'Ты берёшь общий курс и двигаешься дальше, не выдавая себе лишнего знания о местности.';
    case 'item_property':
      return `Ты пытаешься воздействовать на предметный мир: "${rawText}", и система сначала проверяет доступ, владение и свидетелей.`;
    case 'social_npc':
      return `Ты вступаешь в адресное социальное взаимодействие: "${rawText}", и реакция зависит от роли, памяти и статуса NPC.`;
    case 'combat':
      return `Сцена переходит в прямую угрозу: "${rawText}", и последствия зависят от позиции, тела, оружия и реакции противника.`;
    case 'time_wait_work_sleep':
      return 'Ты тратишь время осмысленным ожиданием или длительным действием, и мир меняется вместе с ходом часов.';
    case 'body_recovery':
      return 'Ты пытаешься восстановить тело или удовлетворить базовую потребность, не обходя ограничения состояния и ресурсов.';
    case 'stealth_order_violation':
      return `Ты пытаешься действовать скрытно или нарушить порядок: "${rawText}", и система сначала проверяет риск обнаружения и последствия.`;
    case 'knowledge_history':
      return `Ты обращаешься к памяти, слухам или историческому знанию: "${rawText}", не подменяя отсутствие знания авторской истиной.`;
    default:
      return `Ты предпринимаешь сложное комбинированное действие: "${rawText}", и система сначала раскладывает его на проверяемые подсистемы.`;
  }
}

function buildMechanicalBridge(world, rawText) {
  if (!world || typeof world !== 'object') return null;
  try {
    const plan = planMasterTurnSync(world, rawText);
    const intent = plan?.frame?.intent ?? null;
    if (!intent) return null;
    const check = buildActionCheck(world, plan.frame);
    const simulation = simulateTurnMechanics(world, plan, intent, check);
    return {
      plan,
      intent,
      check,
      resolution: simulation?.resolution ?? null,
      draftWorld: simulation?.draft ?? null
    };
  } catch {
    return null;
  }
}

function normalizeCommittedWorldState(world) {
  pruneLegacyItemAliases(world?.player);
  for (const npc of Array.isArray(world?.npcs) ? world.npcs : []) {
    pruneLegacyItemAliases(npc);
  }
}

function pruneLegacyItemAliases(actor) {
  if (!actor || typeof actor !== 'object' || !actor.items || typeof actor.items !== 'object') return;
  if (Array.isArray(actor.inventory)) delete actor.inventory;
  if (Array.isArray(actor.property)) delete actor.property;
}

function applySupplementalTurnEffects(world, mechanicsBridge, playerTurnInput) {
  const intentType = cleanText(mechanicsBridge?.intent?.type).toLowerCase();
  if (intentType === 'claim') {
    const rumor = `Слух: ${playerTurnInput.raw_text}`;
    if (!Array.isArray(world.memory.heardRumors)) world.memory.heardRumors = [];
    if (!world.memory.heardRumors.includes(rumor)) {
      world.memory.heardRumors.unshift(rumor);
      world.memory.heardRumors = world.memory.heardRumors.slice(0, 20);
    }

    if (!Array.isArray(world.social.recentWitnesses)) world.social.recentWitnesses = [];
    const witnessMark = cleanText(world.current_position?.location_id) || cleanText(world.currentLocationId) || 'current_scene';
    if (!world.social.recentWitnesses.includes(witnessMark)) {
      world.social.recentWitnesses.unshift(witnessMark);
      world.social.recentWitnesses = world.social.recentWitnesses.slice(0, 20);
    }

    const locationId = cleanText(world.current_position?.location_id) || cleanText(world.currentLocationId);
    const location = locationId ? world.locations?.[locationId] : null;
    if (location) {
      if (!Array.isArray(location.recentTraces)) location.recentTraces = [];
      const trace = `Заявление игрока: ${playerTurnInput.raw_text}`;
      if (!location.recentTraces.includes(trace)) {
        location.recentTraces.unshift(trace);
        location.recentTraces = location.recentTraces.slice(0, 20);
      }
    }
  }
}

function extractPublicState(screen) {
  return {
    public_position_label: requirePublicText(screen.position_panel?.public_position_label, 'position_panel.public_position_label'),
    public_time_label: requirePublicText(screen.time_panel?.public_time_label, 'time_panel.public_time_label'),
    public_light_label: requirePublicText(screen.time_panel?.public_light_label, 'time_panel.public_light_label'),
    public_weather_label: optionalPublicText(screen.time_panel?.public_weather_label),
    public_character_label: optionalPublicText(screen.character_panel?.public_character_label) ?? 'Ты',
    public_body_state_summary: publicTextList(screen.character_panel?.body_state_summary),
    public_inventory_summary: publicTextList(screen.character_panel?.inventory_summary),
    public_warning_badges: publicTextList(screen.character_panel?.warning_badges),
    public_visible_npcs: sanitizeAttentionList(screen.attention_panel?.visible_npcs, 'visible_npc'),
    public_visible_items: sanitizeAttentionList(screen.attention_panel?.visible_items, 'visible_item'),
    public_visible_containers: sanitizeAttentionList(screen.attention_panel?.visible_containers, 'visible_container'),
    public_visible_exits: sanitizeAttentionList(screen.attention_panel?.visible_exits, 'visible_exit'),
    public_attention_targets: sanitizeAttentionList(screen.attention_panel?.audible_or_sensory_cues, 'sensory_cue'),
    public_context_hints: sanitizeAttentionList(screen.attention_panel?.known_context_hints, 'known_context_hint'),
    public_visible_map: {
      known_current_node: publicMapNode(screen.map_panel?.known_current_node),
      known_nearby_nodes: publicMapList(screen.map_panel?.known_nearby_nodes),
      unknown_exits: publicMapList(screen.map_panel?.unknown_exits)
    }
  };
}

function extractActiveScreen(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload.partyTurnScreen
    ?? payload.party_turn_screen
    ?? payload.firstGameScreen
    ?? payload.first_game_screen
    ?? null;
}

function sanitizeAttentionList(value, fallbackType) {
  return Array.isArray(value)
    ? value.map((item) => {
      const label = optionalPublicText(item?.label ?? item?.public_label ?? item);
      if (!label) return null;
      return withoutNullish({
        label,
        target_type: optionalPublicText(item?.target_type) ?? fallbackType,
        attention_mode: optionalPublicText(item?.attention_mode),
        risk_hint: optionalPublicText(item?.risk_hint),
        certainty: optionalPublicText(item?.certainty),
        must_not_reveal_hidden_truth: true
      });
    }).filter(Boolean)
    : [];
}

function publicMapNode(value) {
  if (!value || typeof value !== 'object') return {};
  return withoutNullish({
    label: optionalPublicText(value.label ?? value.public_label),
    certainty: optionalPublicText(value.certainty)
  });
}

function publicMapList(value) {
  return Array.isArray(value) ? value.map(publicMapNode).filter((item) => cleanText(item.label)) : [];
}

function publicTextList(value) {
  return Array.isArray(value) ? value.map(optionalPublicText).filter(Boolean) : [];
}

function requirePublicText(value, field) {
  const text = optionalPublicText(value);
  if (!text) throw new Error(`PARTY_TURN_SCREEN_MISSING_PUBLIC_LABEL: ${field}`);
  return text;
}

function optionalPublicText(value) {
  const text = cleanText(value);
  if (!text) return null;
  if (TECHNICAL_TOKEN_PATTERN.test(text)) throw new Error(`PARTY_TURN_SCREEN_RAW_ID_LEAK: ${text}`);
  return text;
}

function cleanText(value) {
  return String(value ?? '').trim();
}

function bumpTimeLabel(label) {
  const text = cleanText(label);
  if (!text) return 'время немного прошло';
  if (/\bноч/i.test(text)) return `${text}, ближе к утру`;
  if (/\bутр/i.test(text)) return `${text}, время идёт`;
  if (/\bдень|полд/i.test(text)) return `${text}, после короткой паузы`;
  return `${text}, проходит немного времени`;
}

function mergeHint(list, nextLabel) {
  const next = publicTextList(list);
  const label = cleanText(nextLabel);
  if (label && !next.includes(label)) next.push(label);
  return next;
}

function withoutNullish(value) {
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child != null));
}

function slugify(value) {
  return cleanText(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/gu, '').slice(0, 48) || 'action';
}

function assertValidation(label, result) {
  if (!result.pass) {
    throw new Error(`${label} invalid: ${result.concerns.join('; ')}`);
  }
}
