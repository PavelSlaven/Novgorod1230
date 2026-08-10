import test from 'node:test'; import assert from 'node:assert/strict';
import { detectBodyThresholdCrossings } from '../src/index.js';
test('body threshold is edge-triggered',()=>{const threshold={threshold_id:'hurt',metric:'health',direction:'decrease',value:20};assert.equal(detectBodyThresholdCrossings({before:{health:30},after:{health:20},thresholds:[threshold]}).length,1);assert.equal(detectBodyThresholdCrossings({before:{health:20},after:{health:10},thresholds:[threshold]}).length,0);});
