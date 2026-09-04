import { ownerFail } from './lower-dvina-trace-turn-step-owner-profiles.js';
import {
  enrichLowerDvinaTraceVisibleNpcCues,
  projectCurrentSceneForNoOperationDirect,
  projectCurrentSceneForVisibleOverlay,
  projectDirectSeedChanges
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

export function createLowerDvinaTraceTurnStepVisibleProjector({
  fallback
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
        return enrichLowerDvinaTraceVisibleNpcCues({
          visibleContext: await projectWithoutFire({
            input, consequence, seedEntries, fallback
          }),
          committedState: input.retrieved_state
        });
      }
      const fireVisible = projectLowerDvinaTraceFireVisible(seedEntries,
        consequence.visible_seed.clarification);
      const ordinaryDetails = ordinarySceneDetails(seedEntries);
      const body = input.body_update?.state_after ?? {};
      const base = hasVisibleDomainProjection(consequence)
        ? await fallback.project(input)
        : projectCurrentSceneForVisibleOverlay({
            input,
            directSeedKeys: directSeedKeys(seedEntries),
            body
          });
      return enrichLowerDvinaTraceVisibleNpcCues({
        visibleContext: overlayFireVisible(
          overlayOrdinaryScene(base, ordinaryDetails), fireVisible),
        committedState: input.retrieved_state
      });
    }
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
  if (ordinaryDetails.length > 0) {
    const body = input.body_update?.state_after ?? {};
    const base = hasVisibleDomainProjection(consequence)
      ? await fallback.project(input)
      : projectCurrentSceneForVisibleOverlay({
          input, directSeedKeys: directSeedKeys(seedEntries), body
        });
    return overlayOrdinaryScene(base, ordinaryDetails);
  }
  const synthetic = plain(consequence?.visible_seed)
    && Array.isArray(consequence.visible_seed.completed_steps)
    && !hasVisibleDomainProjection(consequence);
  if (!synthetic) return fallback.project(input);
  const directSeeds = seedEntries
    .filter(([key, value]) => key.startsWith('turn_step_') && plain(value));
  const body = input.body_update?.state_after ?? {};
  const currentScene = projectCurrentSceneForNoOperationDirect({
    input,
    directSeedKeys: directSeeds.map(([key]) => key),
    body
  });
  if (currentScene != null) return currentScene;
  // An unfinished domain handoff with no visible effects confirms no part of
  // the player's goal. Keep the committed scene, not a synthetic success.
  if (consequence.status === 'partial' && directSeeds.length === 0
      && consequence.visible_seed.clarification == null) {
    return projectCurrentSceneForVisibleOverlay({ input, directSeedKeys: [], body });
  }
  return deepFreeze({
    version: 1,
    schema: 'visible_context_package',
    visible_scene: 'Заявленное действие завершено.',
    visible_changes: projectDirectSeedChanges({ input,
      directSeedKeys: directSeeds.map(([key]) => key) }),
    sensory_details: [],
    visible_npc: [],
    visible_objects: [],
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
  });
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
  return deepFreeze({ ...structuredClone(base), sensory_details:
    unique([...base.sensory_details, ...details]) });
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
    key.startsWith('turn_step_')
      && !key.startsWith(FIRE_SEED_PREFIX)
      && plain(value)).map(([key]) => key);
}

function hasVisibleDomainProjection(consequence) {
  return Array.isArray(consequence?.observations)
    || consequence?.combat_kind != null
    || Object.keys(consequence ?? {}).some((key) =>
      /^phase\d+_kind$/u.test(key) && consequence[key] != null);
}

function stepIndex(key) {
  return Number(key.slice(FIRE_SEED_PREFIX.length));
}

function unique(values) {
  return [...new Set(values)];
}

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
