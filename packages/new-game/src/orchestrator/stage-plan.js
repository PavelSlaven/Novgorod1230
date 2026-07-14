import {
  stage2Definition, stage3Definition, stage4Definition, stage5Definition, stage6Definition,
  stage7Definition, stage8Definition, stage9Definition, stage10Definition, stage11Definition,
  stage12Definition, stage13Definition, stage14Definition, stage15Definition, stage16Definition,
  stage17Definition, stage18Definition, stage19Definition, stage20Definition, stage21Definition,
  stage22Definition, stage23Definition, stage24Definition, stage25Definition, stage26Definition
} from '../definitions.js';

export const MODULAR_NEW_GAME_STAGE_PLAN = Object.freeze([
  stage2Definition, stage3Definition, stage4Definition, stage5Definition, stage6Definition,
  stage7Definition, stage8Definition, stage9Definition, stage10Definition, stage11Definition,
  stage12Definition, stage13Definition, stage14Definition, stage15Definition, stage16Definition,
  stage17Definition, stage18Definition, stage19Definition, stage20Definition, stage21Definition,
  stage22Definition, stage23Definition, stage24Definition, stage25Definition, stage26Definition
]);

export function validateModularStagePlan(stages = MODULAR_NEW_GAME_STAGE_PLAN) {
  const ids = stages.map((stage) => stage?.id);
  const expected = Array.from({ length: 25 }, (_, index) => index + 2);
  if (JSON.stringify(ids) !== JSON.stringify(expected)) {
    throw new Error(`Modular new-game stage plan must contain Stages 2-26 exactly once in order; received ${ids.join(',')}.`);
  }
  for (const stage of stages) {
    if (!stage || typeof stage.execute !== 'function') throw new Error(`Stage ${stage?.id ?? '?'} is not executable.`);
  }
  return stages;
}
