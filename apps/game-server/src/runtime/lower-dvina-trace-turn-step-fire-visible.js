import { ownerFail } from './lower-dvina-trace-turn-step-owner-profiles.js';
import { lowerDvinaTraceObservedSceneChanges } from './lower-dvina-trace-visible-scene-items.js';
import { existingItemInspectionVisibleResult } from './lower-dvina-trace-existing-item-inspection.js';
import {
  enrichLowerDvinaTraceVisibleNpcCues,
  projectCurrentSceneForNoOperationDirect,
  projectCurrentSceneForVisibleOverlay,
  projectDirectSeedChanges, materializedOrdinaryPresenceChange
} from './lower-dvina-trace-turn-step-current-scene.js';
import { deepFreeze, plain } from
  './lower-dvina-trace-turn-step-runtime-common.js';
const SCHEMA =
  'rus.lower_dvina_trace_turn_step_world_process_visible_result.v1';
const FIRE_SEED_PREFIX = 'turn_step_world_process_';
const SCENES = Object.freeze({
  'start:started:active': 'Огонь разгорелся.',
  'add_fuel:fuel_added:active': 'В огонь добавлено топливо.',
  'affect:no_effect:active': 'Воздействие не изменило огонь.',
  'affect:continue:active': 'Огонь изменился, но продолжает гореть.',
  'affect:complete:completed': 'Огонь погас.'
});
const ORDINARY_PRESENCE_CHANGES = Object.freeze({
  absent: 'По этому вопросу отсутствие установлено',
  no_change: 'Результат по этому вопросу не установлен',
  authority_required: 'Имеющихся данных недостаточно для ответа'
});
export function createLowerDvinaTraceTurnStepVisibleProjector({
  fallback, calendarProfile = null
} = {}) {
  if (typeof fallback?.project !== 'function') {
    throw new TypeError('fallback visibleProjector.project is required');
  }
  return Object.freeze({
    async project(input) {
      const consequence = input?.consequence;
      const seedEntries = plain(consequence?.visible_seed)
        ? Object.entries(consequence.visible_seed) : [];
      if (!seedEntries.some(([key]) => key.startsWith(FIRE_SEED_PREFIX))) {
        return finishVisibleProjection(await projectWithoutFire({
          input, consequence, seedEntries, fallback
        }), input, calendarProfile);
      }
      const fireVisible = projectLowerDvinaTraceFireVisible(seedEntries,
        consequence.visible_seed.clarification);
      const ordinaryDetails = ordinarySceneDetails(seedEntries);
      const ordinaryPresence = ordinaryPresenceResolution(seedEntries);
      const base = hasVisibleDomainProjection(consequence)
        ? await fallback.project(input)
        : projectCurrentSceneForVisibleOverlay({
            input,
            directSeedKeys: directSeedKeys(seedEntries),
            body: currentBody(input)
          });
      return finishVisibleProjection(overlayFireVisible(overlayOrdinaryPresence(
          overlayOrdinaryScene(base, ordinaryDetails), ordinaryPresence), fireVisible),
        input, calendarProfile);
    }
  });
}
function finishVisibleProjection(base, input, calendarProfile) {
  const enriched = enrichLowerDvinaTraceVisibleNpcCues({ visibleContext: base,
    committedState: input.retrieved_state, calendarProfile,
    bodyAfter: input.body_update?.state_after, clockAfter: input.time_update?.clock_after,
    temporalResults: input.time_update?.temporal_results });
  const consequence = input.consequence;
  const arrival = consequence?.phase3_kind === 'movement'
    || (consequence?.phase6_kind === 'synchronized_carry'
      && consequence.carry?.intent?.execution_after?.status === 'completed');
  return overlayTurnStepResults(arrival ? { ...enriched,
    visible_changes: unique([...enriched.visible_changes,
      ...base.known_context]),
    sensory_details: lowerDvinaTraceObservedSceneChanges(enriched)
  } : enriched, input);
}
function overlayTurnStepResults(base, input) {
  const itemInspections = Object.values(input?.consequence?.visible_seed ?? {})
    .filter(seed => seed?.kind === 'existing_item_inspection')
    .map(existingItemInspectionVisibleResult);
  const remaining = input?.mode_resolution?.decision_trace?.remaining_intent;
  const inspection = input?.consequence?.visible_seed?.observed_evidence_inspection_seed;
  if (inspection != null && (!plain(inspection)
      || inspection.kind !== 'observed_evidence_inspection_seed'
      || inspection.resolution !== 'no_new_supported_conclusion'
      || Object.keys(inspection).length !== 3
      || typeof inspection.query !== 'string' || !inspection.query.trim())) {
    ownerFail('TRACE_TURN_STEP_OBSERVED_EVIDENCE_VISIBLE_SEED_INVALID');
  }
  const traces = (input?.mode_resolution?.decision_trace?.step_traces ?? []).filter(({ applied }) => applied === true);
  const directPlans = traces.map(({ approved_plan: plan }) => plan).filter(plan => plan?.resolution === 'direct');
  const seeds = input?.consequence?.visible_seed ?? {};
  const pendingNpcResponse = seeds.turn_step_post_applied_perception_window
    ?.status === 'pending_npc_decision';
  const slices = input?.time_update?.prepared_effect_ledger?.slices ?? [];
  const availableKeys = directSeedKeys(Object.entries(seeds)), usedKeys = new Set(), components = new Set();
  const orderedChanges = traces.flatMap(({ step_index: step, approved_plan: plan }) => {
    const keys = slices.filter(slice => slice.step_index === step)
      .flatMap(slice => Object.keys(slice.consequence?.visible_seed ?? {})).filter(key => availableKeys.includes(key));
    if (keys.length === 0 && traces.length === 1) keys.push(...availableKeys);
    if (seeds.ordinary_presence_seed?.resolution === 'materialized' && plan.operations?.some(op =>
      op.op === 'request_discovery' && op.query === seeds.ordinary_presence_seed.query)) {
      keys.push(...availableKeys.filter(key => seeds[key]?.discovery_kind === 'search'), 'ordinary_presence_seed');
    }
    const actionKey = `turn_step_action_production_${step}`;
    if (Object.hasOwn(seeds, actionKey)) keys.push(actionKey);
    if (Object.hasOwn(seeds, `turn_step_item_use_${step}`)) keys.push(`turn_step_item_use_${step}`);
    const orderedKeys = unique(keys).filter(key => !usedKeys.has(key))
      .sort((a, b) => Number(seeds[b]?.kind === 'semantic_activity') - Number(seeds[a]?.kind === 'semantic_activity'));
    orderedKeys.forEach(key => usedKeys.add(key));
    projectDirectSeedChanges({ input, directSeedKeys: orderedKeys }).forEach(change => components.add(change));
    const changes = projectDirectSeedChanges({ input, directSeedKeys: orderedKeys, appliedPlan: plan });
    if (plan.direct_result_kind === 'player_safe_observation') {
      components.add('Вы внимательно изучили обстановку.');
      components.add(text(plan.assessment?.text)
        ? plan.assessment.text : 'Вы внимательно изучили обстановку.');
    }
    if (plan.resolution === 'direct' && plan.goal_result === 'not_achieved') changes.push(
      text(plan.interpretation?.player_goal) ? `Не удалось достичь цели «${plan.interpretation.player_goal}».` : 'Цель попытки не достигнута.');
    changes.forEach(change => components.add(change));
    return changes;
  });
  projectDirectSeedChanges({ input, directSeedKeys: [...usedKeys] }).forEach(change => components.add(change));
  if (!text(remaining) && orderedChanges.length === 0 && inspection == null && itemInspections.length === 0) return base;
  return deepFreeze({ ...structuredClone(base),
    visible_changes: unique([...orderedChanges,
      ...base.visible_changes.filter(change => !components.has(change)),
      ...itemInspections.flatMap(result => result.changes).filter(change => !components.has(change))]),
    uncertainties: unique([...base.uncertainties,
      ...itemInspections.map(result => result.uncertainty),
      ...(pendingNpcResponse ? [
        'Возможный отклик слушателей ещё не разрешён и не является подтверждённым молчанием.'
      ] : []),
      ...(inspection == null ? [] : [
        `Новый достоверный вывод не установлен. Вопрос остаётся открытым: «${inspection.query}».`]),
      ...(text(remaining) ? [
        `Ещё не выполнено: «${remaining}». Результат этой попытки не установлен.`] : [])]),
    do_not_imply: unique([...base.do_not_imply,
      ...(pendingNpcResponse ? ['unresolved_npc_response_as_absence'] : []),
      ...(text(remaining) ? ['uncompleted_remaining_intent'] : []),
      ...(directPlans.some((plan) => plan.direct_result_kind === 'player_utterance')
        && !Object.values(seeds).some((value) =>
          value?.kind === 'post_applied_perception_window') ? [
        'unconfirmed_speech_audience_or_response', 'player_speech_claims_as_truth'] : [])])
  });
}
export function projectLowerDvinaTraceFireVisible(entries, clarification) {
  const facts = entries.filter(([key]) =>
    key.startsWith(FIRE_SEED_PREFIX))
    .sort(([left], [right]) => stepIndex(left) - stepIndex(right))
    .map(projectSeed);
  const scenes = facts.map(({scene}) => scene);
  if (clarification) scenes.push('Требуется уточнение дальнейшего действия.');
  return {
    scene: scenes.length > 0 ? scenes.join(' ') : null,
    changes: new Map(facts.map(({key,change}) => [key,change]))
  };
}
async function projectWithoutFire({ input, consequence, seedEntries,
  fallback }) {
  const ordinaryDetails = ordinarySceneDetails(seedEntries);
  const ordinaryPresence = ordinaryPresenceResolution(seedEntries);
  let base;
  if (ordinaryDetails.length > 0 || ordinaryPresence != null
      || seedEntries.some(([key, value]) => key.startsWith('turn_step_')
        && ['semantic_activity', 'existing_item_inspection'].includes(value?.kind))
      || seedEntries.some(([key]) => key === 'observed_evidence_inspection_seed')) {
    const body = currentBody(input);
    base = hasVisibleDomainProjection(consequence)
      ? await fallback.project(input)
      : projectCurrentSceneForVisibleOverlay({
            input, directSeedKeys: directSeedKeys(seedEntries), body
          });
    return overlayOrdinaryPresence(
      overlayOrdinaryScene(base, ordinaryDetails), ordinaryPresence);
  }
  const synthetic = plain(consequence?.visible_seed)
    && Array.isArray(consequence.visible_seed.completed_steps)
    && !hasVisibleDomainProjection(consequence);
  if (!synthetic) return overlayOrdinaryPresence(
    await fallback.project(input), ordinaryPresence);
  const directSeeds = seedEntries
    .filter(([key, value]) => key.startsWith('turn_step_') && plain(value));
  const body = currentBody(input);
  const currentScene = projectCurrentSceneForNoOperationDirect({
    input,
    directSeedKeys: directSeeds.map(([key]) => key),
    body
  });
  if (currentScene != null) return overlayOrdinaryPresence(
    currentScene, ordinaryPresence);
  // An unfinished domain handoff with no visible effects confirms no part of
  // the player's goal. Keep the committed scene, not a synthetic success.
  if (consequence.status === 'partial' && directSeeds.length === 0
      && consequence.visible_seed.clarification == null) {
    return overlayOrdinaryPresence(projectCurrentSceneForVisibleOverlay({
      input, directSeedKeys: [], body }), ordinaryPresence);
  }
  return overlayOrdinaryPresence(deepFreeze({
    version: 1,
    schema: 'visible_context_package',
    visible_scene: 'Заявленное действие завершено.',
    visible_changes: projectDirectSeedChanges({ input,
      directSeedKeys: directSeeds.map(([key]) => key) }),
    sensory_details: [], visible_npc: [], visible_objects: [],
    known_context: [
      ...(Number.isFinite(body.health) ? [`health:${body.health}`] : []),
      ...(Number.isFinite(body.satiety) ? [`satiety:${body.satiety}`] : []),
      ...(Number.isFinite(body.energy) ? [`energy:${body.energy}`] : [])
    ],
    uncertainties: [
      ...(consequence.visible_seed.clarification
        ? ['Фактическое действие не применено до уточнения.'] : []),
      ...(consequence.status === 'partial'
        ? ['Удалось осуществить лишь часть задуманного; остальное ещё не произошло.']
        : [])
    ],
    allowed_tensions: [],
    do_not_imply: [
      'hidden_fact', 'uncommitted_body_delta', 'uncommitted_time'
    ]
  }), ordinaryPresence);
}
function currentBody(input) {
  return input.body_update?.state_after ?? input.retrieved_state?.body_state
    ?? {};
}
function ordinarySceneDetails(entries) {
  const seeds = entries.filter(([key]) => key === 'ordinary_scene_seed');
  if (seeds.length === 0) return [];
  if (seeds.length !== 1) ownerFail(
    'TRACE_TURN_STEP_ORDINARY_SCENE_VISIBLE_SEED_INVALID');
  const value = seeds[0][1];
  const details = value?.sensory_details;
  if (!plain(value) || value.kind !== 'ordinary_scene_seed'
      || Object.keys(value).length !== 2 || !Array.isArray(details)
      || details.length === 0 || details.some((detail) => !text(detail))) {
    ownerFail('TRACE_TURN_STEP_ORDINARY_SCENE_VISIBLE_SEED_INVALID');
  }
  return details;
}
function overlayOrdinaryScene(base, details) {
  if (details.length === 0) return base;
  return deepFreeze({ ...structuredClone(base),
    visible_changes: unique([...base.visible_changes, ...details]), sensory_details:
    unique([...base.sensory_details, ...details]) });
}
function ordinaryPresenceResolution(entries) {
  const seeds = entries.filter(([key]) => key === 'ordinary_presence_seed');
  if (seeds.length === 0) return null;
  if (seeds.length !== 1) ownerFail(
    'TRACE_TURN_STEP_ORDINARY_PRESENCE_VISIBLE_SEED_INVALID');
  const value = seeds[0][1];
  if (value?.resolution === 'materialized') { materializedOrdinaryPresenceChange(value); return value; }
  if (!plain(value) || value.kind !== 'ordinary_presence_seed'
      || Object.keys(value).length !== 3
      || typeof value.query !== 'string' || !value.query.trim()
      || !Object.hasOwn(ORDINARY_PRESENCE_CHANGES, value.resolution)) {
    ownerFail('TRACE_TURN_STEP_ORDINARY_PRESENCE_VISIBLE_SEED_INVALID');
  }
  return value;
}
function overlayOrdinaryPresence(base, presence) {
  if (presence == null) return base;
  const { resolution, query } = presence;
  const positive = resolution === 'materialized';
  const field = positive || resolution === 'absent' ? 'visible_changes' : 'uncertainties';
  const change = positive ? materializedOrdinaryPresenceChange(presence) : `${ORDINARY_PRESENCE_CHANGES[resolution]}: «${query}».`;
  return deepFreeze({ ...structuredClone(base), [field]: unique([
    ...(positive && !base[field].includes(change) ? [change, ...base[field]] : [...base[field], change])
  ]), do_not_imply: unique([...base.do_not_imply,
    'discovery_query_as_existence_ownership_or_executed_action']) });
}
function overlayFireVisible(base, fireVisible) {
  return deepFreeze({
    ...structuredClone(base),
    visible_scene: [base.visible_scene, fireVisible.scene]
      .filter(Boolean).join(' '),
    visible_changes: unique([
      ...base.visible_changes,
      ...fireVisible.changes.values()
    ])
  });
}
function directSeedKeys(entries) {
  return entries.filter(([key, value]) =>
    (key.startsWith('turn_step_') || key === 'ordinary_presence_seed' && value?.resolution === 'materialized')
      && !key.startsWith(FIRE_SEED_PREFIX)
      && plain(value)).map(([key]) => key);
}
function hasVisibleDomainProjection(consequence) {
  return Array.isArray(consequence?.observations)
    || consequence?.combat_kind != null
    || Object.keys(consequence ?? {}).some((key) =>
      /^phase\d+_kind$/u.test(key) && consequence[key] != null);
}
function stepIndex(key) { return Number(key.slice(FIRE_SEED_PREFIX.length)); }
function unique(values) { return [...new Set(values)]; }
function text(value) {
  return typeof value === 'string' && value.length > 0
    && value.trim() === value;
}
function projectSeed([key,value]) {
  const keys = ['schema','process_kind','action','outcome','status'];
  const scene = SCENES[`${value?.action}:${value?.outcome}:${value?.status}`];
  if (!/^turn_step_world_process_[1-8]$/u.test(key)
      || value == null || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Object.keys(value).length !== keys.length
      || keys.some((field) => !Object.hasOwn(value, field))
      || value.schema !== SCHEMA
      || value.process_kind !== 'fire' || scene == null) {
    ownerFail('TRACE_TURN_STEP_WORLD_PROCESS_VISIBLE_SEED_INVALID');
  }
  return { key, scene, change: `${key}:local_fire:${value.outcome}` };
}
