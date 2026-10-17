import { playerSpeechVisibleChange } from '../public-boundary.js';
import { bodyStateSummary } from './lower-dvina-trace-opening.js';
import { ownerFail } from './lower-dvina-trace-turn-step-owner-profiles.js';
import { existingItemInspectionVisibleResult } from './lower-dvina-trace-existing-item-inspection.js';
import { projectCampFireState, projectLowerDvinaTracePlayerSafeState } from
  './lower-dvina-trace-player-safe-state.js';
import { projectKnownContext } from './lower-dvina-trace-player-safe-world.js';
import { playerSafeHeardNpcIntroduction } from
  './lower-dvina-trace-player-safe-npc-details.js';
import { deepFreeze, plain } from './lower-dvina-trace-turn-step-runtime-common.js';
import { scenePresentationForLocation } from './lower-dvina-trace-scene-presentation.js';
import { lowerDvinaTraceDirectResultChanges,
  distinctNpcLabels,
  lowerDvinaTraceVisibleSceneItems,
  uniqueLowerDvinaTraceVisibleObjects } from
  './lower-dvina-trace-visible-scene-items.js';
import { enrichLowerDvinaTraceVisibleNpcCues } from './lower-dvina-trace-turn-step-current-scene-npc-cues.js';
import { failCurrentScene, validCurrentScene, visibleNpc } from
  './lower-dvina-trace-turn-step-current-scene-validation.js';
import { isMovementVisibleObject } from './spatial-v3-movement-objects.js';
import { playerSafeWeatherLightFacts } from './player-safe-weather-light.js';
import { playerSafeAppearanceSummary } from
  './lower-dvina-trace-player-safe-appearance.js';
export { enrichLowerDvinaTraceVisibleNpcCues } from './lower-dvina-trace-turn-step-current-scene-npc-cues.js';
export function projectPerceivedPeopleAbsence({ currentVisibleContext,
  currentSpatialContextIsFresh, currentSpatialContextFiltersEntities }) {
  if (currentSpatialContextIsFresh !== true
      || currentSpatialContextFiltersEntities !== true
      || !validCurrentScene(currentVisibleContext)
      || currentVisibleContext.visible_npc.length !== 0) return null;
  return 'В поле зрения никого нет.';
}
export function withLowerDvinaTraceCurrentScene({ committedState,
  locationProfiles = committedState?.location_profiles ?? null,
  scenePresentation = committedState?.scene_presentation ?? null,
  itemLabels = {},
  currentSpatialContext = committedState?.current_spatial_context ?? null,
  currentSpatialContextIsFresh = committedState?.current_spatial_context_is_fresh
    ?? currentSpatialContext != null }) {
  if (committedState == null || typeof committedState !== 'object'
      || Array.isArray(committedState)) failCurrentScene();
  const projectionSource = structuredClone(committedState);
  projectionSource.current_visible_context = null;
  const { actor, player_safe_state: playerSafe } = projectLowerDvinaTracePlayerSafeState({
    committed_state: projectionSource,
    scene_presentation: scenePresentation,
    actor_id: projectionSource.actor_id
  });
  const selfKnowledge = [...projectKnownContext(actor, playerSafe.knowledge, playerSafe.interactions),
    ...(playerSafe.available_routes ?? []).map(route => route.label).filter(Boolean)];
  const sceneItems = lowerDvinaTraceVisibleSceneItems(playerSafe.items,
    playerSafe.position, playerSafe.actor_id, itemLabels);
  const initial = committedState.current_visible_context;
  if (Number(committedState?.party_state?.state_version) === 0
      && validCurrentScene(initial)) {
    const observed = enrichLowerDvinaTraceVisibleNpcCues({
      visibleContext: {
        ...initial,
        known_context: unique([...initial.known_context, ...selfKnowledge]),
        sensory_details: unique([...initial.sensory_details,
          ...sceneItems.filter(({ visibleObject }) =>
            text(visibleObject?.display_label))
            .flatMap(({ physicalFacts }) => physicalFacts),
          ...currentEnvironmentChanges(committedState)]),
        visible_objects: uniqueLowerDvinaTraceVisibleObjects([
          ...initial.visible_objects,
          ...sceneItems.map(({ visibleObject }) => visibleObject)])
      },
      committedState: projectionSource
    });
    const current = { ...observed,
      visible_npc: distinctNpcLabels(observed.visible_npc) };
    if (!validCurrentScene(current)) failCurrentScene();
    return { ...withoutCurrentSpatialContext(committedState),
      current_visible_context: deepFreeze(current) };
  }
  const locationRef = playerSafe.position?.location_ref;
  const presentationMatches = scenePresentation?.locations?.filter((row) =>
    row?.location_ref === locationRef) ?? [];
  const presented = presentationMatches.length === 0 ? null
    : scenePresentationForLocation({ scenePresentation, locationRef });
  const currentSpatial = !currentSpatialContextIsFresh
      || currentSpatialContext == null ? null
    : projectCampFireState(currentSpatialContext, projectionSource,
      playerSafe.position);
  const movementObservedContext = currentSpatial;
  const visibleSceneItems = sceneItems;
  const profile = currentSpatial != null && text(currentSpatial.visible_scene)
    ? { display_name: currentSpatial.visible_scene,
      player_visible_physical_facts: currentSpatial.sensory_details ?? [] }
    : presented
      ?? { display_name: null, player_visible_physical_facts: [] };
  // Presence comes from the current owner below; an NPC who is still here keeps
  // the label of the last committed perception of the same entity.
  const priorPerceivedNpcs = committedState.prior_perceived_visible_npcs
    ?? committedState.current_visible_context?.visible_npc ?? [];
  const perceivedNpcs = new Map(priorPerceivedNpcs
    .filter((npc) => npc?.entity_ref?.entity_kind === 'npc'
      && text(npc.entity_ref.entity_id))
    .map((npc) => [npc.entity_ref.entity_id, npc]));
  const refreshedAppearanceNpcIds = new Set();
  const sceneNpcs = committedState.current_spatial_context_filters_entities === true
    ? (currentSpatial?.visible_npc ?? []).map((npc) => {
      const id = npc?.entity_ref?.entity_id;
      const knownName = playerSafeHeardNpcIntroduction({
        committedNpcs: committedState.npcs,
        conversationStatements: committedState.conversation_statements,
        receivedMessages: committedState.received_messages,
        playerId: committedState.actor_id,
        npcId: id
      });
      const perceived = perceivedNpcs.get(id);
      const currentLabel = npc?.display_label;
      const currentKnownName = text(knownName) ? knownName
        : npc?.recognition === 'recognized' && text(currentLabel)
          && currentLabel !== 'человек' ? currentLabel : null;
      const priorAppearance = text(currentKnownName)
          || perceived?.recognition === 'recognized'
        ? null : playerSafeAppearanceSummary(perceived);
      const priorAppearanceSuffix = text(priorAppearance)
          && text(perceived?.display_label)
          && perceived.display_label.endsWith(`, ${priorAppearance}`)
        ? `, ${priorAppearance}` : null;
      if (!text(currentKnownName) && priorAppearanceSuffix != null
          && npc?.observable_cues != null) {
        refreshedAppearanceNpcIds.add(id);
      }
      const priorDisplayLabel = priorAppearanceSuffix != null
          && npc?.observable_cues != null
        ? perceived.display_label.slice(0, -priorAppearanceSuffix.length)
        : perceived?.display_label;
      return {
        ...structuredClone(npc),
        ...(text(currentKnownName) ? {
          display_label: currentKnownName, recognition: 'recognized'
        } : perceived == null ? {} : {
          display_label: priorDisplayLabel,
          recognition: perceived.recognition ?? npc?.recognition
        }),
        ...(npc?.observable_cues == null && perceived?.observable_cues != null ? {
          observable_cues: withoutHeldItemCues(perceived.observable_cues)
        } : {})
      };
    })
    : (playerSafe.npcs ?? []).map((npc) => {
      const id = npc?.instance_id ?? npc?.actor_id ?? npc?.npc_id;
      const knownName = playerSafeHeardNpcIntroduction({
        committedNpcs: committedState.npcs,
        conversationStatements: committedState.conversation_statements,
        receivedMessages: committedState.received_messages,
        playerId: committedState.actor_id,
        npcId: id
      });
      return visibleNpc(npc, playerSafe.position, knownName, perceivedNpcs.get(id));
    }).filter(Boolean);
  const currentItemRows = visibleSceneItems.map(({ visibleObject }) => visibleObject);
  const placeFacts = currentSpatial?.sensory_details
    ?? presented?.player_visible_physical_facts ?? [];
  const spatiallyObservedItemIds = new Set((currentSpatial?.visible_objects ?? [])
    .filter(({ entity_ref: ref }) => ref?.entity_kind === 'item')
    .map(({ entity_ref: ref }) => ref.entity_id));
  const itemFacts = visibleSceneItems.filter(({ visibleObject }) =>
    text(visibleObject?.display_label)
      && (!currentSpatialContextIsFresh
        || spatiallyObservedItemIds.has(visibleObject.entity_ref?.entity_id)))
    .flatMap(({ physicalFacts }) => physicalFacts);
  const sensoryDetails = unique([...(placeFacts ?? []),
    ...itemFacts, ...currentEnvironmentChanges(committedState)]);
  const currentUncertainties = currentSpatial?.uncertainties
    ?? committedState.current_visible_context?.uncertainties
    ?? playerSafe.current_visible_context?.uncertainties ?? [];
  const observed = projectCampFireState(enrichLowerDvinaTraceVisibleNpcCues({ visibleContext: {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: profile.display_name,
    visible_changes: [],
    sensory_details: sensoryDetails,
    visible_npc: sceneNpcs,
    visible_objects: uniqueLowerDvinaTraceVisibleObjects([
      ...currentItemRows,
      ...(movementObservedContext?.visible_objects ?? [])
        .filter((object) => isMovementVisibleObject(object))]),
    known_context: unique([...(text(profile.display_name)
      ? [profile.display_name] : []),
      ...(currentSpatial?.known_context ?? []),
      ...selfKnowledge]),
    uncertainties: unique(currentUncertainties).filter(text),
    allowed_tensions: [],
    do_not_imply: ['hidden_fact', 'undiscovered_clue']
  }, committedState: projectionSource }), projectionSource, playerSafe.position);
  const current = { ...observed,
    visible_npc: distinctNpcLabels(observed.visible_npc).map((npc) => {
      if (!refreshedAppearanceNpcIds.has(npc?.entity_ref?.entity_id)) return npc;
      const appearance = playerSafeAppearanceSummary(npc);
      if (!text(appearance) || npc.display_label?.endsWith(`, ${appearance}`)) {
        return npc;
      }
      return { ...npc, display_label: `${npc.display_label}, ${appearance}` };
    }) };
  if (!validCurrentScene(current)) failCurrentScene();
  const { current_spatial_context: _currentSpatialContext,
    current_spatial_context_is_fresh: _currentSpatialContextIsFresh,
    current_spatial_context_filters_entities: _currentSpatialContextFiltersEntities,
    prior_perceived_visible_npcs: _priorPerceivedVisibleNpcs,
    ...projectedState } = committedState;
  return { ...projectedState, current_visible_context: deepFreeze(current) };
}
export function projectCurrentSceneForNoOperationDirect({ input, directSeedKeys, body,
  locationProfiles = input?.retrieved_state?.location_profiles ?? null,
  scenePresentation = input?.retrieved_state?.scene_presentation ?? null,
  itemLabels = {} }) {
  if (input?.consequence?.visible_seed?.clarification != null) return null;
  const traces = input?.mode_resolution?.decision_trace?.step_traces;
  if (!Array.isArray(traces) || traces.length === 0
      || traces.some(({ approved_plan: plan }) =>
        plan?.resolution !== 'direct'
        || !Array.isArray(plan.operations)
        || plan.operations.length !== 0
        || plan.check !== null)) {
    return null;
  }
  return projectCurrentSceneForVisibleOverlay({
    input, directSeedKeys, body,
    currentSpatialContext: input?.retrieved_state?.current_spatial_context,
    locationProfiles, scenePresentation, itemLabels
  });
}
export function projectCurrentSceneForVisibleOverlay({ input, directSeedKeys, body,
  currentSpatialContext = input?.retrieved_state?.current_spatial_context,
  locationProfiles = input?.retrieved_state?.location_profiles ?? null,
  scenePresentation = input?.retrieved_state?.scene_presentation ?? null,
  itemLabels = {} }) {
  const state = input?.retrieved_state;
  const isFresh = state?.current_spatial_context_is_fresh === true
    && currentSpatialContext != null;
  const current = withLowerDvinaTraceCurrentScene({
    committedState: state, locationProfiles, scenePresentation,
    itemLabels,
    currentSpatialContext, currentSpatialContextIsFresh: isFresh
  }).current_visible_context;
  if (!validCurrentScene(current)) failCurrentScene();
  const outcomeConstraints = directOutcomeConstraints(input);
  const directResultChanges = lowerDvinaTraceDirectResultChanges(input,
    playerSafeSceneItems(input?.retrieved_state), body, current);
  return deepFreeze({
    ...structuredClone(current),
    visible_changes: unique([
      ...projectDirectSeedChanges({ input, directSeedKeys,
        visibleObjects: current.visible_objects }),
      ...directResultChanges
    ]),
    known_context: unique([
      ...current.known_context,
      ...([body.health, body.satiety, body.energy].every(Number.isFinite)
        ? [bodyStateSummary(body)] : [])
    ]),
    uncertainties: unique(current.uncertainties),
    do_not_imply: unique([
      ...current.do_not_imply,
      'hidden_fact',
      'uncommitted_body_delta',
      'uncommitted_time',
      ...outcomeConstraints
    ])
  });
}
function playerSafeSceneItems(state) {
  return lowerDvinaTraceVisibleSceneItems(state?.items, state?.position,
    state?.actor_id);
}

export function currentEnvironmentChanges(state) {
  const environment = state?.environment_snapshot;
  if (environment?.schema !== 'rus.approved_initial_environment.v1') return [];
  return playerSafeWeatherLightFacts({ season: environment.season,
    day_part: environment.day_part, light_state: environment.light_state,
    weather_state: environment.weather_state }).map(({ text }) => text);
}

function withoutCurrentSpatialContext(state) {
  const { current_spatial_context: _currentSpatialContext,
    current_spatial_context_is_fresh: _currentSpatialContextIsFresh,
    current_spatial_context_filters_entities: _currentSpatialContextFiltersEntities,
    prior_perceived_visible_npcs: _priorPerceivedVisibleNpcs,
    ...projectedState } = state;
  return projectedState;
}
export function projectDirectSeedChanges({ input, directSeedKeys, appliedPlan = null,
  visibleObjects = null }) {
  const seed = input?.consequence?.visible_seed ?? {};
  const values = directSeedKeys.map((key) => seed[key]);
  const speech = appliedPlan?.resolution === 'direct' && appliedPlan.direct_result_kind === 'player_utterance'
    ? playerSpeechVisibleChange(appliedPlan.utterance.utterance_text) : null;
  const observation = appliedPlan?.resolution === 'direct'
    && appliedPlan.direct_result_kind === 'player_safe_observation';
  const activityCompleted = input?.time_update?.semantic_activity_resolutions
    ?.some(({ execution }) => execution?.status === 'completed') === true;
  const directActivity = appliedPlan?.resolution === 'direct'
    && appliedPlan.goal_result !== 'not_achieved'
    && appliedPlan.direct_result_kind == null
    && activityCompleted
    && values.some((value) => value?.kind === 'semantic_activity')
    ? appliedPlan.interpretation?.grounded_attempt : null;
  const attempts = values.filter(value => value?.kind === 'transient_item_use'
    && Object.keys(value).length === 2 && text(value.description));
  const changes = values.flatMap((value) => {
    if (value?.kind === 'semantic_activity' && appliedPlan?.resolution === 'direct'
        && appliedPlan.goal_result === 'not_achieved') {
      // A discovery authority gap is not a confirmed search result.
      return activityCompleted && value.discovery_result?.resolution !== 'authority_required'
        ? directSeedChange(value) : null;
    }
    if (appliedPlan != null && (
        (value?.kind === 'semantic_activity'
          && (appliedPlan.resolution === 'direct'
            || value.discovery_result == null))
        || (attempts.length === 1 && value === attempts[0]))) return [];
    return directSeedChange(value, visibleObjects,
      input?.ordinary_materialization_atomic_write_plan?.item);
  }).filter(Boolean);
  if (speech != null) return [speech, ...changes];
  if (text(directActivity)) return [sentence(directActivity), ...changes];
  if (observation) return [text(appliedPlan.assessment?.text)
    ? appliedPlan.assessment.text : 'Обстановка внимательно изучена.',
  ...changes];
  if (appliedPlan != null && attempts.length === 1) return [
    ...directSeedChange(attempts[0]),
    'Результат этой попытки пока не установлен.',
    ...changes
  ];
  return changes;
}
export function validateMaterializedOrdinaryPresence(value) {
  if (!plain(value) || value.kind !== 'ordinary_presence_seed' || value.resolution !== 'materialized'
      || ![4, 5].includes(Object.keys(value).length)
      || typeof value.query !== 'string' || !value.query.trim()
      || typeof value.display_name !== 'string' || !value.display_name.trim()
      || (Object.keys(value).length === 5 && !text(value.item_ref))) {
    ownerFail('TRACE_TURN_STEP_ORDINARY_PRESENCE_VISIBLE_SEED_INVALID');
  }
}
export function materializedOrdinaryPresenceChange(value, visibleObjects, plannedItem = null) {
  validateMaterializedOrdinaryPresence(value);
  if (value.item_ref != null) {
    if (plannedItem != null && plannedItem.item_id !== value.item_ref) {
      ownerFail('TRACE_TURN_STEP_ORDINARY_PRESENCE_VISIBLE_SEED_INVALID');
    }
    const matches = (visibleObjects ?? []).filter(({ entity_ref: ref }) =>
      ref?.entity_kind === 'item' && ref.entity_id === value.item_ref);
    const descriptor = plannedItem?.item_proposal?.semantic_descriptor;
    if (matches.length > 1 || (matches.length === 0 && plannedItem == null)
        || (matches.length === 1 && (!text(matches[0].display_label)
          || matches[0].display_label !== value.display_name))
        || (plannedItem != null && descriptor?.name !== value.display_name)) {
      ownerFail('TRACE_TURN_STEP_ORDINARY_PRESENCE_VISIBLE_SEED_INVALID');
    }
    const distinctSameName = (visibleObjects ?? []).some(({ entity_ref: ref, display_label }) =>
      ref?.entity_kind === 'item' && ref.entity_id !== value.item_ref
        && display_label === value.display_name);
    const distinctness = distinctSameName
      ? ' Найденный предмет — отдельная вещь от других видимых предметов с тем же названием.'
      : '';
    if (matches.length === 0) return `Найден предмет — ${value.display_name}. `
      + `При находке он не находился в руках героя.${distinctness}`;
    return `Найден предмет — ${value.display_name}. Найденный предмет ${
      matches[0].visible_status === 'available'
        ? 'виден здесь, не в руках героя' : matches[0].visible_status}.${distinctness}`;
  }
  return `Найден предмет — ${value.display_name}.`;
}
function directSeedChange(value, visibleObjects, plannedItem) {
  if (value?.kind === 'local_movement_signature') {
    failCurrentScene();
  }
  if (value?.kind === 'background_npc_observation') {
    if (!plain(value) || Object.keys(value).length !== 4
        || !text(value.npc_ref) || !text(value.display_label)
        || !text(value.ordinary_descriptor)) failCurrentScene();
    return `Герой рассмотрел ${value.display_label}: ${sentence(
      value.ordinary_descriptor)}`;
  }
  if (value?.kind === 'transient_item_use' && Object.keys(value).length === 2 && text(value.description))
    return [`Выполнена попытка: «${value.description}»${/[.!?…]$/u.test(value.description) ? '' : '.'}`];
  if (value?.kind === 'ordinary_presence_seed') return materializedOrdinaryPresenceChange(value,
    visibleObjects, plannedItem);
  if (value?.kind === 'existing_item_inspection') {
    return existingItemInspectionVisibleResult(value).changes;
  }
  if (value?.kind === 'semantic_activity') {
    const duration = Number(value.duration_minutes);
    if (!Number.isSafeInteger(duration) || duration <= 0) return null;
    const result = value.discovery_result;
    if (result == null) return value.discovery_kind === 'search'
      ? 'Поиск завершён.'
      : value.discovery_kind === 'inspect' ? 'Осмотр завершён.' : null;
    if (!['search', 'inspect'].includes(value.discovery_kind) || !plain(result)
        || ![2, 3].includes(Object.keys(result).length)
        || !['no_change', 'authority_required'].includes(result.resolution)
        || !text(result.query) || !result.query.trim()
        || (Object.keys(result).length === 3
          && (result.resolution !== 'authority_required'
            || !['access_denied', 'source_depleted'].includes(result.reason_code)))) {
      failCurrentScene();
    }
    const action = value.discovery_kind === 'search' ? 'Поиск' : 'Осмотр';
    if (result.reason_code === 'access_denied') {
      return `Доступ к источнику по вопросу «${result.query}» закрыт.`;
    }
    if (result.reason_code === 'source_depleted') {
      return `Источник по вопросу «${result.query}» исчерпан.`;
    }
    return `${action} по вопросу «${result.query}» не дал подтверждённой находки.`;
  }
  if (value?.kind === 'body_event') {
    return 'Герой ощутил перемену в своём состоянии.';
  }
  if (value?.kind === 'post_applied_perception_window'
      && value.status === 'completed'
      && Array.isArray(value.observable_response_event_refs)
      && value.observable_response_event_refs.length === 0) {
    return 'Непосредственного наблюдаемого отклика на действие героя не последовало.';
  }
  if (value?.kind === 'post_applied_perception_window'
      && value.status === 'pending_npc_decision'
      && Array.isArray(value.observable_response_event_refs)
      && value.observable_response_event_refs.length === 0
      && Array.isArray(value.pending_npc_decision_refs)
      && value.pending_npc_decision_refs.length > 0
      && value.pending_npc_decision_refs.every(text)) {
    return null;
  }
  if (value?.change === 'created' && text(value.name)) {
    return `Появился результат работы героя: ${value.name}.`;
  }
  if (value?.change === 'moved') {
    if (value.relation === 'held_by' && text(value.display_label)) {
      return `Герой взял в руки ${value.display_label}.`;
    }
    return text(value.display_label)
      ? `Герой переместил ${value.display_label}.`
      : 'Герой переместил доступный предмет.';
  }
  if (value?.change === 'move_blocked' && text(value.display_label)) {
    return value.reason === 'hands_full'
      ? `Герой не смог взять ${value.display_label}: руки заняты.`
      : value.reason === 'load_limit'
        ? `Герой не смог взять ${value.display_label}: ноша слишком тяжела.`
        : failCurrentScene();
  }
  if (value?.change === 'physical_change'
      && (text(value.physical_description)
        || Array.isArray(value.qualitative_facts))) {
    const changes = [];
    const delta = value.source_fact_delta;
    let sourceIsVisible = false;
    if (delta != null) {
      if (!plain(delta)
          || Object.keys(delta).some((key) => ![
            'physical_description', 'qualitative_facts'
          ].includes(key))
          || delta.physical_description != null
            && !text(delta.physical_description)
          || !Array.isArray(delta.qualitative_facts)
          || delta.qualitative_facts.some((fact) => !text(fact))) {
        failCurrentScene();
      }
      sourceIsVisible = typeof value.entity_ref === 'string'
        && Array.isArray(visibleObjects)
        && visibleObjects.some((object) =>
          object?.entity_ref?.entity_id === value.entity_ref
          && ['recognized', 'known'].includes(object.recognition));
      if (sourceIsVisible) {
        changes.push('Действие изменило исходную вещь.');
      }
    }
    if (text(value.physical_description)) {
      changes.push(sentence(value.physical_description));
    }
    if (Array.isArray(value.qualitative_facts)) {
      changes.push(...value.qualitative_facts.map(sentence));
    }
    if (sourceIsVisible) {
      changes.push(...(text(delta.physical_description)
        ? [sentence(delta.physical_description)] : []),
      ...delta.qualitative_facts.map(sentence));
    }
    return changes;
  }
  if (value?.change === 'container_accessed') {
    return 'Герой изменил состояние доступного вместилища.';
  }
  if (['facts_changed', 'mechanics_changed'].includes(value?.change)) {
    return 'Доступный предмет изменился.';
  }
  if (value?.change === 'retired') {
    return 'Исходный предмет больше не существует отдельно.';
  }
  failCurrentScene();
}
function sentence(value) {
  return /[.!?…]$/u.test(value) ? value : `${value}.`;
}
function directOutcomeConstraints(input) {
  const trace = input?.mode_resolution?.decision_trace;
  const allPlans = (trace?.step_traces ?? [])
    .map(({ approved_plan: plan }) => plan).filter(Boolean);
  const plans = allPlans.filter((plan) => plan.resolution === 'direct');
  const results = plans.map(({ goal_result: result }) => result).filter(Boolean);
  const productionSources = new Set(allPlans.flatMap((plan) =>
    (plan.operations ?? []).flatMap((operation) =>
      operation?.action_production?.source_refs ?? [])));
  const movedSources = new Set(allPlans.flatMap((plan) =>
    (plan.operations ?? []).filter(({ op }) => op === 'move_entity')
      .map(({ entity_ref: ref }) => ref)));
  const sourceStayedPut = [...productionSources]
    .some((sourceRef) => !movedSources.has(sourceRef));
  const constraints = sourceStayedPut
    ? ['uncommitted_action_production_source_relocation'] : [];
  if (results.length > 0 && results.every((result) => result === 'not_achieved')
      && !text(trace?.remaining_intent)) {
    constraints.push('unconfirmed_attempt_success');
  }
  if (results.includes('partially_achieved') || text(trace?.remaining_intent)
      || (results.length === 0 && input?.consequence?.status === 'partial')) {
    constraints.push('uncompleted_remaining_intent');
  }
  return constraints;
}
function withoutHeldItemCues(cues) {
  const current = structuredClone(cues);
  delete current.held_items;
  return current;
}

function text(value) { return typeof value === 'string' && value.length > 0; }
function unique(values) { return [...new Set(values)]; }
