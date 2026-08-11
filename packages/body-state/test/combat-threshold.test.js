import test from 'node:test'; import assert from 'node:assert/strict';
import { detectBodyThresholdCrossings } from '../src/index.js';
test('body threshold is edge-triggered',()=>{const threshold={threshold_id:'hurt',metric:'health',direction:'decrease',value:20};assert.equal(detectBodyThresholdCrossings({before:{health:30},after:{health:20},thresholds:[threshold]}).length,1);assert.equal(detectBodyThresholdCrossings({before:{health:20},after:{health:10},thresholds:[threshold]}).length,0);});

test('body threshold crossing preserves its approved decision signal descriptor', () => {
  const decision_signal = {
    category: 'self',
    significance: 'critical',
    perception_required: false,
    perceived_change_summary: 'The injury sharply limits further resistance.'
  };
  const [crossing] = detectBodyThresholdCrossings({
    before: { health: 100 },
    after: { health: 90 },
    thresholds: [{ threshold_id: 'combat-critical', metric: 'health',
      direction: 'decrease', value: 95, decision_signal }]
  });
  assert.deepEqual(crossing.decision_signal, decision_signal);
});
