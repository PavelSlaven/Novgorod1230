import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBodyStateChange, normalizeBodyState, stateModifier, validateBodyState } from '../src/index.js';

test('body-state applies bounded approved change formula', () => {
  const next = applyBodyStateChange({ health:80, satiety:40, energy:20 }, { restore:{ energy:10 }, spend:{ satiety:5 }, harm:{ health:15 } });
  assert.deepEqual([next.health, next.satiety, next.energy], [65,35,30]);
  assert.equal(stateModifier(next, ['energy']), -1);
  assert.equal(Object.isFrozen(next), true);
  assert.equal(validateBodyState({ health:101 }).ok, false);
  assert.equal(normalizeBodyState({ health:'70' }).health, 70);
});
