import { buildPartyStartCommittedFromCurrentDdl } from '../world/party-schema-mapping.js';
import { buildFirstGameScreen } from '../world/new-game-pipeline/screens/first-game-screen.js';

export function buildPartyFirstScreenUiPayload({
  requestId = null,
  transactionId = null,
  partyStartCommitted = null,
  partyState = null,
  currentPosition = null,
  narratorOutputId = null,
  approvedNarratorOutput,
  narratorProseAudit,
  visibleContextPackage,
  visibleContextAudit,
  partyPublicState,
  screenPolicy = null
} = {}) {
  const committed = partyStartCommitted ?? buildPartyStartCommittedFromCurrentDdl({
    requestId,
    transactionId,
    partyState,
    currentPosition,
    narratorOutputId
  });

  const firstGameScreen = buildFirstGameScreen({
    request_id: requestId ?? committed.request_id,
    party_start_committed: committed,
    approved_narrator_output: approvedNarratorOutput,
    narrator_prose_audit: narratorProseAudit,
    visible_context_package: visibleContextPackage,
    visible_context_audit: visibleContextAudit,
    party_public_state: partyPublicState,
    screen_policy: screenPolicy
  });

  return {
    version: 1,
    schema: 'party_first_screen_ui_payload',
    party_id: firstGameScreen.party_id,
    openingText: firstGameScreen.main_prose,
    firstGameScreen,
    delivery_state: firstGameScreen.delivery_state
  };
}

export function adaptFirstGameScreenToUiState(firstGameScreen) {
  if (firstGameScreen?.schema !== 'first_game_screen') {
    throw new Error('adaptFirstGameScreenToUiState requires first_game_screen payload.');
  }
  return {
    version: 1,
    schema: 'party_first_screen_ui_state',
    party_id: firstGameScreen.party_id,
    openingText: firstGameScreen.main_prose,
    position: firstGameScreen.position_panel,
    time: firstGameScreen.time_panel,
    character: firstGameScreen.character_panel,
    attention: firstGameScreen.attention_panel,
    actions: firstGameScreen.action_panel,
    map: firstGameScreen.map_panel,
    delivery_state: firstGameScreen.delivery_state
  };
}

export function adaptPartyTurnScreenToUiState(partyTurnScreen) {
  if (partyTurnScreen?.schema !== 'party_turn_screen') {
    throw new Error('adaptPartyTurnScreenToUiState requires party_turn_screen payload.');
  }
  return {
    version: 1,
    schema: 'party_turn_ui_state',
    party_id: partyTurnScreen.party_id,
    openingText: partyTurnScreen.main_prose,
    position: partyTurnScreen.position_panel,
    time: partyTurnScreen.time_panel,
    character: partyTurnScreen.character_panel,
    attention: partyTurnScreen.attention_panel,
    actions: partyTurnScreen.action_panel,
    map: partyTurnScreen.map_panel,
    delivery_state: partyTurnScreen.delivery_state,
    runtime_state: partyTurnScreen.runtime_state ?? null
  };
}

export function applyPartyScreenToUiState(baseState = {}, screen) {
  if (!screen || typeof screen !== 'object') return baseState;
  const positionLabel = String(screen.position_panel?.public_position_label ?? '').trim();
  const timeLabel = String(screen.time_panel?.public_time_label ?? '').trim();
  const lightLabel = String(screen.time_panel?.public_light_label ?? '').trim();
  const weatherLabel = String(screen.time_panel?.public_weather_label ?? '').trim();
  const bodyState = Array.isArray(screen.character_panel?.body_state_summary)
    ? screen.character_panel.body_state_summary.slice()
    : [];
  const warnings = Array.isArray(screen.character_panel?.warning_badges)
    ? screen.character_panel.warning_badges.slice()
    : [];
  const visibleExits = Array.isArray(screen.attention_panel?.visible_exits)
    ? screen.attention_panel.visible_exits.map((item) => item.label).filter(Boolean)
    : [];

  return {
    ...baseState,
    clockText: [timeLabel, lightLabel, weatherLabel].filter(Boolean).join(' · ') || baseState.clockText,
    lastNarratorProse: screen.main_prose ?? baseState.lastNarratorProse,
    visibleScene: {
      ...(baseState.visibleScene ?? {}),
      prose: screen.main_prose ?? baseState.visibleScene?.prose ?? '',
      markup: {
        ...(baseState.visibleScene?.markup ?? {}),
        atmosphere: {
          ...(baseState.visibleScene?.markup?.atmosphere ?? {}),
          orientation: positionLabel || (baseState.visibleScene?.markup?.atmosphere?.orientation ?? ''),
          light: lightLabel || (baseState.visibleScene?.markup?.atmosphere?.light ?? ''),
          weather: weatherLabel || (baseState.visibleScene?.markup?.atmosphere?.weather ?? '')
        },
        entities: [
          ...toMarkupEntities(screen.attention_panel?.visible_npcs, 'talk'),
          ...toMarkupEntities(screen.attention_panel?.visible_items, 'inspect'),
          ...toMarkupEntities(screen.attention_panel?.visible_containers, 'inspect'),
          ...toMarkupEntities(screen.attention_panel?.visible_exits, 'move')
        ]
      }
    },
    place: {
      ...(baseState.place ?? {}),
      name: positionLabel || (baseState.place?.name ?? 'место не определено'),
      exits: visibleExits.length ? visibleExits : (baseState.place?.exits ?? [])
    },
    microPlace: {
      ...(baseState.microPlace ?? {}),
      name: positionLabel || (baseState.microPlace?.name ?? baseState.place?.name ?? '')
    },
    player: {
      ...(baseState.player ?? {}),
      name: screen.character_panel?.public_character_label ?? baseState.player?.name ?? 'Ты',
      bodyState: bodyState.join(' · ') || (baseState.player?.bodyState ?? ''),
      activeStates: mergeUniqueStrings(baseState.player?.activeStates, bodyState, warnings)
    }
  };
}

export function buildPartyTurnBootstrapPayloadFromUiState(uiState = {}, {
  partyId = 'legacy_party_runtime',
  turnNumber = 0,
  messageId = 'bootstrap_message_001'
} = {}) {
  const positionLabel = String(uiState.microPlace?.name ?? uiState.place?.name ?? 'место не определено').trim() || 'место не определено';
  const clockText = String(uiState.clockText ?? 'время неизвестно').trim() || 'время неизвестно';
  const prose = String(uiState.visibleScene?.prose ?? uiState.lastNarratorProse ?? '').trim() || 'Сцена готова к ходу.';
  const screen = {
    version: 1,
    schema: 'party_turn_screen',
    screen_status: 'ready',
    request_id: 'legacy_world_bootstrap',
    party_id: partyId,
    turn_number: turnNumber,
    main_prose: prose,
    position_panel: {
      public_position_label: positionLabel,
      technical_position_hidden: true,
      debug_position: null
    },
    time_panel: {
      public_time_label: clockText,
      public_light_label: String(uiState.visibleScene?.markup?.atmosphere?.light ?? '').trim() || 'свет не уточнён',
      public_weather_label: String(uiState.visibleScene?.markup?.atmosphere?.weather ?? '').trim() || null
    },
    character_panel: {
      public_character_label: String(uiState.player?.name ?? 'Ты').trim() || 'Ты',
      body_state_summary: Array.isArray(uiState.player?.activeStates) ? uiState.player.activeStates.slice(0, 6) : [],
      inventory_summary: Array.isArray(uiState.player?.inventory) ? uiState.player.inventory.slice(0, 6) : [],
      warning_badges: Array.isArray(uiState.player?.needs) ? uiState.player.needs.slice(0, 4) : []
    },
    attention_panel: {
      visible_npcs: Array.isArray(uiState.visibleNpcs) ? uiState.visibleNpcs.map((item) => ({ label: item.name ?? item.label ?? 'человек' })) : [],
      visible_items: [],
      visible_containers: [],
      visible_exits: Array.isArray(uiState.place?.exits) ? uiState.place.exits.map((item) => ({ label: typeof item === 'string' ? item : (item?.label ?? '') })).filter((item) => item.label) : [],
      audible_or_sensory_cues: [],
      known_context_hints: []
    },
    action_panel: {
      suggested_actions: [],
      free_text_input: {
        enabled: true,
        placeholder: 'Что ты делаешь?',
        input_contract: 'player_intent_not_world_fact'
      }
    },
    map_panel: {
      enabled: true,
      map_mode: 'character_known_only',
      known_current_node: { label: positionLabel, certainty: 'known_current' },
      known_nearby_nodes: [],
      unknown_exits: [],
      must_not_show_hidden_nodes: true
    },
    delivery_state: {
      message_id: messageId,
      awaiting_client_ack: false
    },
    runtime_state: {
      current_phase: 'awaiting_player_input',
      current_turn_number: turnNumber
    }
  };
  return {
    version: 1,
    schema: 'party_turn_result_ui_payload',
    party_id: partyId,
    openingText: prose,
    firstGameScreen: null,
    partyTurnScreen: screen,
    party_turn_screen: screen,
    delivery_state: screen.delivery_state,
    runtime_state: screen.runtime_state
  };
}

function toMarkupEntities(list, action) {
  return Array.isArray(list)
    ? list
      .map((item) => {
        const label = String(item?.label ?? '').trim();
        return label ? { label, action } : null;
      })
      .filter(Boolean)
    : [];
}

function mergeUniqueStrings(...lists) {
  const result = [];
  const seen = new Set();
  for (const list of lists) {
    for (const item of Array.isArray(list) ? list : []) {
      const text = String(item ?? '').trim();
      if (!text || seen.has(text)) continue;
      seen.add(text);
      result.push(text);
    }
  }
  return result;
}
