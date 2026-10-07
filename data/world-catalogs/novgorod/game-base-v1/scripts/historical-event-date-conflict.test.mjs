// Regression for the unresolved 8/9 December departure-date disagreement.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import lib from '../transport-health-recreation/scripts/lib.cjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const phases = lib.loadCsvObjects(
  path.join(ROOT, 'history-events-knowledge/historical_events/event_phases.csv'), ',');
const target = phases.filter(row => row.ev_id === 'nov_hist_1230_004');
const containsBothDatesAndCaveat = text => {
  assert.match(text, /уехали в Торжок 8 декабря[\s\S]*другое датирует их отъезд 9 декабря[\s\S]*разночтение дат отъезда не разрешено/iu);
};
const assertSourceDateAttribution = text => {
  assert.match(text, /book:301539[^;]*?датирует отъезд 8 декабря/iu);
  assert.match(text, /book:667380[^;]*?— 9 декабря/iu);
};

test('nov_hist_1230_004: every phase summary preserves unresolved 8/9 December departure dates', () => {
  assert.equal(target.length, 5);
  for (const phase of target) {
    containsBothDatesAndCaveat(phase.summary);
    containsBothDatesAndCaveat(phase.historical_context);
  }
});

test('nov_hist_1230_004: every phase chronicle_ref attributes both dates to their sources', () => {
  assert.equal(target.length, 5);
  for (const phase of target) {
    containsBothDatesAndCaveat(phase.chronicle_ref);
    assertSourceDateAttribution(phase.chronicle_ref);
  }
});

test('nov_hist_1230_004: source-date assertion rejects swapped dates', () => {
  const original = target[0].chronicle_ref;
  const swapped = original
    .replace(/(book:301539[^;]*?)8 декабря/u, (_, prefix) => `${prefix}9 декабря`)
    .replace(/(book:667380[^;]*?)— 9 декабря/u, (_, prefix) => `${prefix}— 8 декабря`);
  assert.notEqual(swapped, original, 'negative fixture must swap both cited dates');
  assert.throws(() => assertSourceDateAttribution(swapped));
});

test('nov_hist_1230_004: title says departure without asserting flight', () => {
  const event = lib.loadCsvObjects(
    path.join(ROOT, 'history-events-knowledge/historical_events/events.csv'), ',')
    .find(row => row.ev_id === 'nov_hist_1230_004');
  assert.ok(event);
  assert.match(event.event_title, /отъезд в Торжок/iu);
  assert.doesNotMatch(event.event_title, /бегств/iu);
  for (const phase of target) {
    assert.match(phase.event_title, /отъезд в Торжок/iu);
    assert.doesNotMatch(phase.event_title, /бегств/iu);
  }
});
