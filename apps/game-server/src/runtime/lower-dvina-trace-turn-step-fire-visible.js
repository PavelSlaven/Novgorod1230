import { ownerFail } from './lower-dvina-trace-turn-step-owner-profiles.js';

const SCHEMA =
  'rus.lower_dvina_trace_turn_step_world_process_visible_result.v1';
const SCENES = Object.freeze({
  'start:started:active': 'Огонь разгорелся.',
  'add_fuel:fuel_added:active': 'В огонь добавлено топливо.',
  'affect:no_effect:active': 'Воздействие не изменило огонь.',
  'affect:continue:active': 'Огонь изменился, но продолжает гореть.',
  'affect:complete:completed': 'Огонь погас.'
});

export function projectLowerDvinaTraceFireVisible(entries, clarification) {
  const facts = entries.filter(([key]) =>
    key.startsWith('turn_step_world_process_')).map(projectSeed);
  const scenes = facts.map(({scene}) => scene);
  if (clarification) scenes.push('Требуется уточнение дальнейшего действия.');
  return {
    scene: scenes.length > 0 ? scenes.join(' ') : null,
    changes: new Map(facts.map(({key,change}) => [key,change]))
  };
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
