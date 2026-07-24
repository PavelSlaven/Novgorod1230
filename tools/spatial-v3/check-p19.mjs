import { createSpatialV3ExecutionEngine } from '@rus/turn/spatial-v3-execution';
import { addElapsedTime, addRationalMinutes, countCrossedWholeMinuteBoundaries } from '@rus/time-events-history';

const engine = createSpatialV3ExecutionEngine();
if (typeof engine.executeImmediateAction !== 'function' || typeof engine.resolveTraversalInterval !== 'function') throw new Error('P19 execution public surface is incomplete');
if (addRationalMinutes({ numerator: '1', denominator: '2' }, { numerator: '1', denominator: '2' }).numerator !== '1') throw new Error('P19 rational reduction is unavailable');
const before = { whole_minutes: '0', subminute_numerator: '0', subminute_denominator: '1' };
const after = addElapsedTime(before, { exact_minutes: { numerator: '1', denominator: '1' } });
if (countCrossedWholeMinuteBoundaries(before, after) !== '1') throw new Error('P19 exact clock is unavailable');
console.log('P19 execution/time surface: OK');
