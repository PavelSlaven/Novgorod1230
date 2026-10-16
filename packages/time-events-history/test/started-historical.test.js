import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  APPROVED_EVENT_DATE_GATE_RECORDS,
  StartedHistoricalError,
  projectApprovedPartyHistoricalEvents,
  startedHistoricalEventIds,
  startedHistoricalEventsAndPhases
} from '../src/index.js';

const ts = (m) => ({
  whole_minutes: String(m), subminute_numerator: '0', subminute_denominator: '1'
});

test('future phase stays hidden until party clock reaches start', () => {
  const events = [{
    id: 'event:posadnik-change',
    phases: [
      { id: 'background', start_at_minutes: 0 },
      { id: 'impact', start_at_minutes: 10_000 }
    ]
  }];
  const before = startedHistoricalEventsAndPhases(ts(100), events);
  assert.equal(before.length, 1);
  assert.equal(before[0].phase.id, 'background');
  assert.deepEqual(startedHistoricalEventIds(ts(100), events),
    ['event:posadnik-change']);

  const noneYet = startedHistoricalEventsAndPhases(ts(50),
    [{ id: 'event:famine', phases: [{ id: 'start', start_at_minutes: 200 }] }]);
  assert.deepEqual(noneYet, []);
  assert.deepEqual(startedHistoricalEventIds(ts(50),
    [{ id: 'event:famine', phases: [{ id: 'start', start_at_minutes: 200 }] }]),
  []);

  const after = startedHistoricalEventsAndPhases(
    { total_minutes: 10_000 }, events);
  assert.equal(after[0].phase.id, 'impact');
});

test('N-1 invalid start_at_minutes never opens at minute 0', () => {
  for (const bad of [null, '', false, '0', undefined]) {
    assert.deepEqual(startedHistoricalEventIds(ts(100), [{
      id: 'event:leaky',
      phases: [{ id: 'start', start_at_minutes: bad }]
    }]), []);
  }
});

test('N-2 v3 start_at compared via GameTimestamp', () => {
  const events = [{
    id: 'event:famine-v3',
    phases: [{ id: 'start', start_at: ts(200), end_at: ts(400),
      phase_id: 'start', status: 'scheduled', event_ref: 'event:famine-v3',
      scope_ref: 'world', applicability: {}, source_refs: [], provenance_refs: [],
      local_effect_rule_ref: 'r', boundary_policy_ref: 'b',
      visibility_policy_ref: 'v', interrupt_effect: 'notice',
      allow_derived_visible_effects: false, dependency_pins: {},
      canonical_digest: 'd' }]
  }];
  // Only start_at is read by started-historical; extra v3 fields ignored.
  const slim = [{
    id: 'event:famine-v3',
    phases: [{ id: 'start', start_at: ts(200) }]
  }];
  assert.deepEqual(startedHistoricalEventIds(ts(100), slim), []);
  assert.deepEqual(startedHistoricalEventIds(ts(200), slim),
    ['event:famine-v3']);
  assert.deepEqual(startedHistoricalEventIds(ts(250), events),
    ['event:famine-v3']);
});

test('N-2 invalid clock is StartedHistoricalError', () => {
  assert.throws(() => startedHistoricalEventIds('nope', []),
    (err) => err instanceof StartedHistoricalError
      && err.code === 'STARTED_HISTORICAL_CLOCK_INVALID');
});

test('approved party projection includes ten news dates and canonical famine source', async () => {
  const temporalRecord = await famineRecord();
  const events = projectApprovedPartyHistoricalEvents({
    temporalRecords: [temporalRecord]
  });
  assert.equal(APPROVED_EVENT_DATE_GATE_RECORDS.length, 10);
  assert.ok(APPROVED_EVENT_DATE_GATE_RECORDS.every((record) =>
    record.approved_by === 'Opus approval pass (lead), out/opus-review-4a3.json + REVIEW-4a4'
      && record.approved_on === '2026-10-01'
      && /^[0-9a-f]{40}$/u.test(record.commit)));
  const proposals = JSON.parse(await readFile(new URL(
    `../../../${APPROVED_EVENT_DATE_GATE_RECORDS[0].path}`, import.meta.url), 'utf8'));
  const review = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/temporal-v4/news-date-gate-v1/opus-review-4a3.json',
    import.meta.url), 'utf8'));
  assert.deepEqual(
    proposals.entries.map((entry) => [entry.event_id, entry.first_phase_meaning]).sort(),
    APPROVED_EVENT_DATE_GATE_RECORDS.map((record) => [record.event_id, record.phase_meaning]).sort());
  const decision = review.time_owner_proposals_decision;
  assert.equal(decision.verdict, 'approved_as_candidate_input');
  assert.equal(decision.per_event.length, proposals.entries.length);
  assert.ok(decision.per_event.every((entry) => entry.verdict === 'approved'));
  const approvalById = new Map(decision.per_event.map((entry) => [entry.event_id, entry.start]));
  const proposalById = new Map(proposals.entries.map((entry) => [
    entry.event_id, entry.proposed_first_phase_start_julian
  ]));
  assert.deepEqual([...approvalById].sort(), [...proposalById].sort());

  const [calendarRecord] = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/temporal-v4/datasets/calendar_daylight_light_profiles.json',
    import.meta.url), 'utf8'));
  const calendar = calendarRecord.payload;
  assert.equal(calendar.calendar_system, proposals.calendar);
  const sourceMinutes = proposals.entries.map((entry) => {
    const approvedStart = approvalById.get(entry.event_id);
    assert.equal(entry.proposed_first_phase_start_julian, approvedStart);
    return [entry.event_id, julianMinutesFromEpoch(approvedStart, calendar)];
  });
  assert.deepEqual(sourceMinutes.sort(([a], [b]) => a.localeCompare(b)),
    APPROVED_EVENT_DATE_GATE_RECORDS.map((record) => [record.event_id, record.start_at_minutes])
      .sort(([a], [b]) => a.localeCompare(b)));
  assert.equal(events.length, 11);
  const famineStart = Number(temporalRecord.payload.source_backed_exact_boundaries_or_authored_ranges
    .formal_game_timestamp_range.start_inclusive.whole_minutes);
  assert.deepEqual(startedHistoricalEventIds(ts(famineStart - 1), events), []);
  assert.deepEqual(startedHistoricalEventIds(ts(famineStart), events), [
    'novgorod_famine_1230'
  ]);
  const neva = events.find((event) => event.id === 'nov_hist_news_neva_victory_lower_dvina');
  assert.deepEqual(startedHistoricalEventIds(ts(5_785_919), [neva]), []);
  assert.deepEqual(startedHistoricalEventIds(ts(5_785_920), [neva]), [neva.id]);
  for (const [eventId, startAtMinutes] of sourceMinutes) {
    const event = events.find((entry) => entry.id === eventId);
    assert.deepEqual(startedHistoricalEventIds(
      ts(startAtMinutes - 1), [event]), []);
    assert.deepEqual(startedHistoricalEventIds(
      ts(startAtMinutes), [event]), [eventId]);
  }
  assert.deepEqual(events.at(-1).source_ref, {
    record_id: temporalRecord.record_id,
    catalog_digest: temporalRecord.canonical_digest
  });
});

test('party projection is detached from later temporal-catalog mutation', async () => {
  const temporalRecord = await famineRecord();
  const events = projectApprovedPartyHistoricalEvents({
    temporalRecords: [temporalRecord]
  });
  const snapshotEvents = structuredClone(events);
  temporalRecord.payload.source_backed_exact_boundaries_or_authored_ranges
    .formal_game_timestamp_range.start_inclusive.whole_minutes = '1';
  temporalRecord.canonical_digest = 'f'.repeat(64);
  assert.deepEqual(events, snapshotEvents);
});

test('empty approved event list has no started event ids', () => {
  assert.deepEqual(startedHistoricalEventIds(ts(0), []), []);
});

async function famineRecord() {
  const [record] = JSON.parse(await readFile(new URL(
    '../../../data/world-catalogs/novgorod/temporal-v4/datasets/'
      + 'historical_phase_local_effect_rules.json', import.meta.url), 'utf8'));
  return { ...record, canonical_digest: 'a'.repeat(64) };
}

function julianMinutesFromEpoch(date, calendar) {
  const rules = calendar.day_month_leap_rules;
  assert.equal(rules.leap_rule, 'Julian year divisible by 4');
  assert.equal(rules.year_numbering, 'common_era_no_year_zero');
  const leapMonth = rules.month_lengths_leap.findIndex((length, index) => (
    Number(length) > Number(rules.month_lengths_common[index])
  )) + 1;
  assert.ok(leapMonth > 0);
  const ordinal = (isoDate) => {
    const [yearText, monthText, dayText] = isoDate.split('-');
    const year = BigInt(yearText);
    const month = Number(monthText);
    let days = 365n * (year - 1n) + (year - 1n) / 4n;
    for (let currentMonth = 1; currentMonth < month; currentMonth += 1) {
      days += BigInt(rules.month_lengths_common[currentMonth - 1]);
      if (currentMonth === leapMonth && year % 4n === 0n) days += 1n;
    }
    return days + BigInt(dayText) - 1n;
  };
  const epoch = calendar.epoch_reference.calendar_date_at_zero;
  const epochDate = `${epoch.year}-${epoch.month.padStart(2, '0')}-${epoch.day.padStart(2, '0')}`;
  const minutes = (ordinal(date) - ordinal(epochDate)) * 1440n;
  const result = Number(minutes);
  assert.ok(Number.isSafeInteger(result));
  return result;
}
