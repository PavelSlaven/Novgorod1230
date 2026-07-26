import {
  resolveApprovedActivityProfile
} from '@rus/turn';
import { serverError } from '../../errors.js';
import {
  ACTIVITY_PROFILES, CONTENT_DIGEST, HIGH_G5, LANDING_G5, SCENARIO_ID,
  START_G4, TRANSPORT_CONTRACT, action, sealedPins
} from './shared.js';

export function initialState({
  partyId,
  requestId,
  player,
  scenario,
  release,
  runtimeCatalogPin
}) {
  return {
    schema: 'lower_dvina_first_playable_state.v1',
    party_id: partyId,
    request_id: requestId,
    scenario_id: scenario ? SCENARIO_ID : null,
    player: {
      id: `actor:${partyId}:player`,
      name_id: player.name_id,
      name: player.name,
      role_id: player.role_id,
      occupation_id: player.occupation_id,
      skill_profile_id: player.skill_profile.profile_id,
      skills: structuredClone(player.skill_profile.skills),
      language_profile: structuredClone(player.language_profile),
      knowledge_profile: structuredClone(player.knowledge_profile),
      body_profile_id: player.body_profile.profile_id,
      equipment_profile: structuredClone(player.equipment_profile),
      profile_candidate_set_digest: player.candidate_set_digest,
      health: player.body_profile.metrics.health,
      energy: player.body_profile.metrics.energy,
      satiety: player.body_profile.metrics.satiety,
      conditions: structuredClone(player.body_profile.active_conditions)
    },
    location: 'high_platform',
    clock_minutes: 0,
    landing_materialized: false,
    npc: null,
    inventory: scenario
      ? [
          ...player.equipment_profile.initial_item_allocations,
          ...player.equipment_profile.initial_container_allocations
        ].map(({ display_name: displayName }) => displayName)
      : [],
    rope: { owner: 'player', holder: 'player', controller: 'player' },
    water_ml: 0,
    relation: 0,
    journal: [],
    boat: scenario ? { id: `transport:${partyId}:boat`, location: 'landing_edge', boarded: false } : null,
    exact_pins: sealedPins([
      {
        kind: 'release',
        id: release.release_id,
        world_revision_id: release.world_revision_id,
        world_catalog_digest: release.world_catalog_digest
      },
      {
        kind: 'item_container_catalog',
        id: runtimeCatalogPin.catalog_revision_id,
        digest: runtimeCatalogPin.catalog_digest
      },
      { kind: 'profile_bundle', id: CONTENT_DIGEST, digest: CONTENT_DIGEST },
      {
        kind: 'template_bundle',
        id: runtimeCatalogPin.catalog_revision_id,
        digest: runtimeCatalogPin.runtime_contract_digest
      },
      {
        kind: 'runtime_bindings',
        id: release.release_id,
        digest: runtimeCatalogPin.compatible_world_pin_manifest_digest
      }
    ]),
    idempotency: {}
  };
}

export function openingScreen(state) {
  return {
    version: 1,
    schema: 'first_game_screen',
    screen_status: 'ready',
    party_id: state.party_id,
    main_prose: state.scenario_id
      ? 'Ты остановился на защищённой высокой площадке. Ниже слышна вода; у посадочного места ждёт твоя малая гребная лодка.'
      : 'Ты готов начать путь.',
    action_panel: { suggested_actions: actionsFor(state) },
    panels: panels(state),
    delivery_state: { message_id: `opening:${state.party_id}` }
  };
}

export function turnScreen(state, { turnNumber, turnId, prose }) {
  return {
    version: 1,
    schema: 'turn_screen',
    screen_status: 'ready',
    party_id: state.party_id,
    turn_id: turnId,
    turn_number: turnNumber,
    main_prose: prose,
    visible_context: {
      place: state.location === 'high_platform' ? 'защищённая высокая площадка' : 'посадочная кромка',
      time_minutes: state.clock_minutes,
      weather: 'позднее лето, открытая вода'
    },
    input_panel: { free_text_enabled: true, input_contract: 'intent_not_fact' },
    action_panel: { suggested_actions: actionsFor(state) },
    panels: panels(state),
    delivery_state: { ready: true }
  };
}

function panels(state) {
  return {
    character: {
      visible: true,
      data: {
        name: state.player.name,
        health: state.player.health,
        energy: state.player.energy,
        satiety: state.player.satiety,
        conditions: state.player.conditions
      }
    },
    inventory: { visible: true, data: { items: state.inventory, water_ml: state.water_ml } },
    people: {
      visible: state.npc != null,
      data: state.npc ? {
        name: state.npc.name ?? 'незнакомый рыбак',
        activity: 'работает с сетью',
        relation: state.relation
      } : {}
    },
    route: {
      visible: true,
      data: {
        safe_local_path: state.location === 'high_platform'
          ? 'к посадочной кромке'
          : 'к высокой площадке',
        southern_boundary: 'переход пока недоступен'
      }
    },
    journal: { visible: state.journal.length > 0, data: { entries: state.journal } }
  };
}

function actionsFor(state) {
  const actions = [action('action:look', 'Осмотреться'), action('action:save', 'Сохранить')];
  if (!state.scenario_id) return actions;
  if (state.location === 'high_platform') {
    actions.push(action('action:move', 'Спуститься к берегу'));
    actions.push(action(
      'action:move_risky',
      'Спуститься по скользкой кромке'
    ));
    actions.push(action('rest:30', 'Отдохнуть 30 минут'));
  } else {
    actions.push(action('action:move', 'Вернуться на площадку'));
    if (state.npc) {
      actions.push(action('action:talk', 'Поговорить с рыбаком'));
      actions.push(action('action:collect_water', 'Набрать 1000 мл воды'));
      if (state.rope.holder === 'player') actions.push(action('action:give', 'Передать верёвку'));
      if (state.rope.holder === 'fisher'
          && state.rope.controller === 'fisher') {
        actions.push(action(
          'action:perform_simple_work',
          'Помочь с сетью'
        ));
      }
      actions.push(action(state.boat.boarded ? 'action:alight' : 'action:board',
        state.boat.boarded ? 'Выйти из лодки' : 'Сесть в лодку'));
    }
  }
  return actions;
}

export function visibleEntityRefs(state) {
  const refs = [];
  if (state.npc && state.location === 'landing_edge') refs.push('npc:fisher');
  if (state.location === 'landing_edge') refs.push('resource:visible');
  if (state.boat && state.location === 'landing_edge') refs.push('transport:player_boat');
  return refs;
}

export function resolveRuntimeActivityProfile(command, state) {
  let context = null;
  if (command.verb === 'talk') {
    context = {
      category: 'conversation',
      addressed_scene_npc_required: Boolean(state.npc)
    };
  } else if (command.verb === 'collect_resource'
      && command.quantity?.unit === 'millilitre') {
    context = {
      category: 'collect_resource',
      resource_quality: 'untested_surface_water',
      quantity: { numerator: 1000, denominator: 1, unit: 'millilitre' },
      container_required: true
    };
  } else if (command.verb === 'collect_resource'
      && command.quantity?.unit === 'bundle') {
    context = {
      category: 'collect_resource',
      resource_kind: 'fallen_deadwood',
      quantity: { numerator: 1, denominator: 1, unit: 'bundle' }
    };
  } else if (command.verb === 'perform_simple_work') {
    context = {
      category: 'perform_simple_work',
      occupation_context: 'fishing_water',
      required_participant_role: 'nov_role_fisher'
    };
  } else if (command.verb === 'rest') {
    context = { category: 'rest', rest_place_required: true };
  }
  if (context == null) return null;
  const resolution = resolveApprovedActivityProfile({
    profiles: ACTIVITY_PROFILES,
    context
  });
  if (!resolution.ok) {
    throw serverError(
      resolution.code.toUpperCase(),
      'Approved ActivityProfile resolution failed.',
      { status: 409 }
    );
  }
  const profile = resolution.profile;
  if (profile.completion_model === 'bounded_decision'
      && !profile.allowed_duration_minutes.includes(command.duration_minutes)) {
    throw serverError(
      'ACTIVITY_DURATION_NOT_ALLOWED',
      'The selected duration is not allowed by the approved ActivityProfile.',
      { status: 409 }
    );
  }
  return profile;
}
