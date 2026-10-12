import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import lib from '../../data/world-catalogs/novgorod/game-base-v1/transport-health-recreation/scripts/lib.cjs';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OWNER_ROOT = process.env.ISSUE_439_OWNER_ROOT;
const BUILDER = OWNER_ROOT
  ? path.join(OWNER_ROOT, 'history-events-knowledge/historical_events/scripts/build_events.cjs')
  : path.join(ROOT, 'data/world-catalogs/novgorod/game-base-v1/history-events-knowledge/historical_events/scripts/build_events.cjs');
const TIMELINE = path.join(ROOT, 'data/world-catalogs/novgorod/sources/nov-region-audit-v1/novgorod_historical_timeline_1230_1250_v1.json');
const OUTPUT_ROOT = process.env.ISSUE_439_OUTPUT_ROOT || process.env.FLEET_DIR || ROOT;
const readCsv = filename => lib.loadCsvObjects(filename, ',');

function oneBy(rows, key, value) {
  const found = rows.filter(row => row[key] === value);
  assert.equal(found.length, 1, `${key}=${value}: expected one record`);
  return found[0];
}

test('issue #439: corrected event years match source-backed phase years', (t) => {
  assert.ok(fs.existsSync(BUILDER), `explicit builder target missing: ${BUILDER}`);
  assert.ok(fs.existsSync(TIMELINE), `production timeline missing: ${TIMELINE}`);
  const OUTPUT = fs.mkdtempSync(path.join(OUTPUT_ROOT, 'issue-439-'));
  t.after(() => fs.rmSync(OUTPUT, { recursive: true, force: true }));
  const previousArgv = process.argv;
  process.argv = [process.execPath, BUILDER, TIMELINE, OUTPUT];
  try {
    require(BUILDER);
  } finally {
    process.argv = previousArgv;
  }

  const events = readCsv(path.join(OUTPUT, 'events.csv'));
  const phases = readCsv(path.join(OUTPUT, 'event_phases.csv'));
  for (const [eventId, expectedYear, sourceRef] of [
    ['nov_hist_1242_002', '1243', 'book:220871'],
    ['nov_hist_1245_001', '1246', 'book:378072'],
  ]) {
    const event = oneBy(events, 'ev_id', eventId);
    assert.equal(event.year, expectedYear, `${eventId}: event year`);
    const eventPhases = phases.filter(row => row.ev_id === eventId);
    assert.equal(eventPhases.length, 5, `${eventId}: keep all stable phase records`);
    assert.deepEqual(eventPhases.map(row => row.phase_id).sort(),
      ['background', 'omens', 'escalation', 'impact', 'aftermath']
        .map(suffix => `${eventId}_${suffix}`).sort(),
      `${eventId}: preserve stable phase IDs`);
    assert.deepEqual(new Set(eventPhases.map(row => row.date_range.slice(0, 4))),
      new Set([expectedYear]), `${eventId}: source-backed phases agree with event year`);
    assert.ok(eventPhases.every(row => row.source_refs.includes(sourceRef)),
      `${eventId}: retain source reference ${sourceRef}`);
  }

  assert.ok(phases.some(row => row.phase_id === 'nov_hist_1242_002_background'));
  assert.ok(phases.some(row => row.phase_id === 'nov_hist_1245_001_background'));
  const famineYears = new Set(phases
    .filter(row => row.ev_id === 'nov_hist_1230_003')
    .map(row => row.date_range.slice(0, 4)));
  assert.deepEqual(famineYears, new Set(['1230', '1231']),
    'events may have phases spanning calendar years');
});
