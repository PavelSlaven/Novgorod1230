import { createSpatialV3ExecutionEngine } from '@rus/turn/spatial-v3-execution';
import { addRational, advanceExactClock } from '@rus/time-events-history';

const engine = createSpatialV3ExecutionEngine();
if (typeof engine.executeImmediateAction !== 'function' || typeof engine.resolveTraversalInterval !== 'function') throw new Error('P19 execution public surface is incomplete');
if (addRational({ numerator: 1, denominator: 2 }, { numerator: 1, denominator: 2 }).numerator !== 1) throw new Error('P19 rational reduction is unavailable');
if (advanceExactClock({ numerator: 0, denominator: 1 }, { numerator: 1, denominator: 1 }).crossed_whole_minute_boundaries !== 1) throw new Error('P19 exact clock is unavailable');
console.log('P19 execution/time surface: OK');
