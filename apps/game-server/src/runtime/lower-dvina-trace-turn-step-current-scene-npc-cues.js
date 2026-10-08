import { projectLowerDvinaTraceVisibleNpcDetails } from
  './lower-dvina-trace-player-safe-state.js';
import { deepFreeze, plain } from
  './lower-dvina-trace-turn-step-runtime-common.js';
import { validateVisibleContext } from '@rus/visibility-knowledge-memory';
import { projectCalendar } from '@rus/time-events-history/calendar';
import { projectActor, projectBodyState, projectInteractions } from './lower-dvina-trace-player-safe-entities.js';
import { projectKnowledge, projectKnownContext } from './lower-dvina-trace-player-safe-world.js';
import { applyNpcRoutineTemporalResults } from './npc-routine-temporal.js';
import { distinctNpcLabels } from './lower-dvina-trace-visible-scene-items.js';

const ARRAY_FIELDS = ['visible_changes', 'sensory_details', 'visible_npc',
  'visible_objects', 'known_context', 'uncertainties', 'allowed_tensions', 'do_not_imply'];
const BODY_CHANGE_CONTEXT = 'Изменение состояния тела: ';

export function enrichLowerDvinaTraceVisibleNpcCues({
  visibleContext, committedState, bodyAfter = null, clockAfter = null,
  calendarProfile = null, temporalResults = []
}) {
  if (!validCurrentScene(visibleContext)) failCurrentScene();
  const projectedState = applyNpcRoutineTemporalResults(
    structuredClone(committedState ?? {}), temporalResults);
  const transitionEntries = npcRoutineTransitionEntries(temporalResults);
  const projectedNpcs = visibleContext.visible_npc.flatMap((npc) =>
    npc?.entity_ref?.entity_kind === 'npc' && text(npc.entity_ref.entity_id)
      ? [{ instance_id: npc.entity_ref.entity_id }] : []);
  const details = new Map(projectLowerDvinaTraceVisibleNpcDetails({
    visibleContext,
    projectedNpcs,
    committedNpcs: projectedState.npcs,
    committedItems: projectedState.items
  }).map((npc) => [npc.instance_id, npc]));
  const visibleBefore = new Set((committedState?.current_visible_context
    ?.visible_npc ?? []).map(({ entity_ref: ref }) => ref?.entity_id));
  const visibleAfterEntries = distinctNpcLabels(visibleContext.visible_npc);
  const visibleAfter = new Map(visibleAfterEntries.map((npc) => [
    npc?.entity_ref?.entity_id, npc?.display_label
  ]));
  const visibleLabelCounts = new Map();
  for (const label of visibleAfter.values()) {
    if (text(label)) visibleLabelCounts.set(label,
      (visibleLabelCounts.get(label) ?? 0) + 1);
  }
  const observedTransitions = transitionEntries.filter(({ transition }) =>
    visibleBefore.has(transition.npc_id) && visibleAfter.has(transition.npc_id));
  const observedChangeCues = observedNpcChangeCues({
    observedTransitions, visibleAfter, visibleLabelCounts
  });
  const beforeContext = currentActorContext(committedState?.body_state, committedState?.clock, calendarProfile);
  const afterContext = currentActorContext(bodyAfter ?? committedState?.body_state,
    clockAfter ?? committedState?.clock, calendarProfile);
  const beforeConditions = projectBodyState(committedState?.body_state)?.active_conditions ?? [];
  const afterConditions = projectBodyState(bodyAfter)?.active_conditions ?? [];
  const removed = beforeConditions.filter(condition =>
    !afterConditions.some(after => JSON.stringify(condition) === JSON.stringify(after)));
  const added = afterConditions.filter(condition =>
    !beforeConditions.some(before => JSON.stringify(condition) === JSON.stringify(before)));
  const conditionChanges = bodyAfter == null
    || removed.length + added.length === 0 ? [] : [
      `${BODY_CHANGE_CONTEXT}${JSON.stringify({ before: removed, after: added })}`];
  return deepFreeze({
    ...structuredClone(visibleContext),
    visible_changes: [...new Set(visibleContext.visible_changes),
      ...observedChangeCues,
      ...(conditionChanges.length === 0 ? [] : ['Состояние вашего тела изменилось.'])],
    known_context: [...new Set([...visibleContext.known_context.filter(value =>
      !beforeContext.includes(value) && !value.startsWith(BODY_CHANGE_CONTEXT)),
      ...afterContext, ...conditionChanges,
      ...projectKnownContext(projectActor({ profile: committedState?.player_profile,
        actorId: committedState?.actor_id }), projectKnowledge([
          ...(committedState?.player_profile?.knowledge?.initial_records ?? []),
          ...(committedState?.knowledge ?? [])]), projectInteractions(committedState?.interactions))])],
    visible_npc: visibleContext.visible_npc.map((npc) => {
      const id = npc?.entity_ref?.entity_id;
      // ponytail: only observed (visible before+after) transitions may refresh
      // status; never machine_state.current_activity.summary (private note).
      const observed = observedTransitions.find(({ transition }) =>
        transition.npc_id === id);
      const transitionStatus = text(observed?.transition.proposal?.factual_transition?.summary)
        ? observed.transition.proposal.factual_transition.summary
        : null;
      const detail = details.get(id);
      const informative = detail != null
        && (detail.visible_equipment.length > 0
          || Object.keys(detail.presentation).length > 0
          || detail.ordinary_remainder != null
          || Object.keys(detail.identity_state).some((key) =>
            key !== 'display_name'));
      if (!informative && !transitionStatus) return structuredClone(npc);
      return {
        ...structuredClone(npc),
        ...(transitionStatus ? { visible_status: transitionStatus } : {}),
        ...(informative ? {
          observable_cues: {
            identity: structuredClone(detail.identity_state),
            equipment: structuredClone(detail.visible_equipment),
            outward_presentation: structuredClone(detail.presentation),
            ...(detail.ordinary_remainder == null ? {} : {
              ordinary_remainder: structuredClone(detail.ordinary_remainder)
            })
          }
        } : {})
      };
    })
  });
}

function npcRoutineTransitionEntries(results) {
  return (results ?? []).flatMap((result, resultIndex) =>
    (result?.combined_change_set?.proposals ?? [])
      .map(({ npc_routine_transition: transition }) => transition)
      .filter(Boolean)
      .map((transition) => ({ transition,
        boundary_key: temporalBoundaryKey(transition.occurred_at, resultIndex) })));
}

function temporalBoundaryKey(occurredAt, resultIndex) {
  if (occurredAt == null) return `result:${resultIndex}`;
  if (typeof occurredAt === 'object'
      && occurredAt.whole_minutes != null
      && occurredAt.subminute_numerator != null
      && occurredAt.subminute_denominator != null) {
    return `time:${occurredAt.whole_minutes}:${occurredAt.subminute_numerator}/${occurredAt.subminute_denominator}`;
  }
  return `time:${JSON.stringify(occurredAt)}`;
}

function observedNpcChangeCues({ observedTransitions, visibleAfter, visibleLabelCounts }) {
  const groups = new Map();
  for (const entry of observedTransitions) {
    const { transition, boundary_key } = entry;
    const summary = transition.proposal?.factual_transition?.summary;
    const label = visibleAfter.get(transition.npc_id);
    if (!text(label) || !text(summary)) continue;
    const key = JSON.stringify([boundary_key, label, summary]);
    const group = groups.get(key) ?? { label, summary, npcIds: new Set() };
    group.npcIds.add(transition.npc_id);
    groups.set(key, group);
  }
  return [...groups.values()].map(({ label, summary, npcIds }) => {
    if (visibleLabelCounts.get(label) === 1) return `${label} ${lowerInitial(summary)}`;
    const count = npcIds.size;
    return `${count} ${peopleForm(count)} с общей подписью «${label}»: ${summary}`;
  });
}

function peopleForm(count) {
  const lastTwo = count % 100;
  if (lastTwo >= 12 && lastTwo <= 14) return 'человек';
  const last = count % 10;
  return last >= 2 && last <= 4 ? 'человека' : 'человек';
}

function currentActorContext(body, clock, calendarProfile) {
  const conditions = projectBodyState(body)?.active_conditions ?? [];
  const result = conditions.length === 0 ? [] : [
    `Текущие состояния вашего тела: ${JSON.stringify(conditions)}`];
  if (clock != null && calendarProfile != null) {
    const calendar = projectCalendar(clock, calendarProfile);
    const minutes = BigInt(calendar.local_time_of_day.numerator)
      / BigInt(calendar.local_time_of_day.denominator);
    result.push(`Текущее местное время: ${calendar.day}.${calendar.month}.${calendar.year}, ${String(minutes / 60n).padStart(2, '0')}:${String(minutes % 60n).padStart(2, '0')}.`);
  }
  return result;
}

function validCurrentScene(value) {
  return plain(value)
    && validateVisibleContext(value).ok
    && ARRAY_FIELDS.every((field) => Array.isArray(value[field]));
}

function text(value) {
  return typeof value === 'string' && value.length > 0;
}

function lowerInitial(value) {
  return value[0].toLocaleLowerCase('ru-RU') + value.slice(1);
}

function failCurrentScene() {
  throw Object.assign(new Error(
    'The committed current scene cannot be projected safely.'),
  { code: 'TRACE_CURRENT_SCENE_PROJECTION_INVALID', status: 409 });
}
