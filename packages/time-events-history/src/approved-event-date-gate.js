import { sha256 } from '@rus/kernel';

const approvedBy = 'Opus approval pass (lead), out/opus-review-4a3.json + REVIEW-4a4';
const proposalPath = 'data/world-catalogs/novgorod/temporal-v4/news-date-gate-v1/time-owner-event-proposals.json';
const proposalCommit = '362052267c59c2e621c96c21a4bcadeb35bc4822';

export const APPROVED_EVENT_DATE_GATE_RECORDS = Object.freeze([
  ['nov_hist_news_batu_ryazan_lower_dvina', 'outcome_news_reached_lower_dvina', 4_468_320],
  ['nov_hist_news_torzhok_fall_lower_dvina', 'outcome_news_reached_lower_dvina', 4_600_800],
  ['nov_hist_news_neva_victory_lower_dvina', 'outcome_news_reached_lower_dvina', 5_785_920],
  ['nov_hist_news_peipus_victory_lower_dvina', 'outcome_news_reached_lower_dvina', 6_837_120],
  ['nov_hist_news_novgorod_german_peace_lower_dvina', 'outcome_news_reached_lower_dvina', 7_362_720],
  ['nov_hist_news_yaroslav_batu_journey_lower_dvina', 'outcome_news_reached_lower_dvina', 7_624_800],
  ['nov_hist_news_yaroslav_seniority_lower_dvina', 'outcome_news_reached_lower_dvina', 7_624_800],
  ['nov_hist_news_yaroslav_death_lower_dvina', 'outcome_news_reached_lower_dvina', 9_466_560],
  ['nov_hist_news_princes_return_rus_lower_dvina', 'outcome_news_reached_lower_dvina', 11_570_400],
  ['nov_hist_news_alexander_novgorod_lower_dvina', 'outcome_news_reached_lower_dvina', 11_570_400]
].map(([event_id, phase_id, start_at_minutes]) => Object.freeze({
  event_id,
  phase_id,
  phase_meaning: 'outcome_news_reached_lower_dvina',
  start_at_minutes,
  approved_by: approvedBy,
  approved_on: '2026-10-01',
  path: proposalPath,
  commit: proposalCommit
})));

const eventDateGateDigest = sha256(APPROVED_EVENT_DATE_GATE_RECORDS);
const famineRecordId = 'record:historical_phase_local_effect_rules:novgorod_famine_1230_v2';

export function projectApprovedPartyHistoricalEvents({ temporalRecords } = {}) {
  if (!Array.isArray(temporalRecords)) {
    throw new TypeError('approved temporal records are required.');
  }
  const matches = temporalRecords.filter((record) => record?.record_id === famineRecordId);
  if (matches.length !== 1) {
    throw new TypeError('the approved Novgorod famine temporal record is required exactly once.');
  }
  const famine = matches[0];
  const refs = famine.payload?.historical_event_or_figure_refs ?? [];
  const phaseIds = famine.payload?.phase_ids;
  const startBoundary = famine.payload?.source_backed_exact_boundaries_or_authored_ranges
    ?.formal_game_timestamp_range?.start_inclusive;
  const start = startBoundary?.whole_minutes;
  if (famine.family_id !== 'historical_phase_local_effect_rules'
    || famine.record_kind !== 'historical_phase_rule'
    || String(famine.version) !== '1' || famine.status !== 'approved'
    || !/^[a-f0-9]{64}$/u.test(famine.canonical_digest ?? '')
    || !refs.some((ref) => ref?.entity_ref?.entity_kind === 'historical_event'
      && ref.entity_ref.entity_id === 'novgorod_famine_1230')
    || !Array.isArray(phaseIds) || phaseIds.length !== 1
    || typeof phaseIds[0] !== 'string' || phaseIds[0].length === 0
    || !Number.isSafeInteger(Number(start)) || Number(start) < 0
    || Number(startBoundary.subminute_numerator) !== 0
    || Number(startBoundary.subminute_denominator) !== 1) {
    throw new TypeError('the approved Novgorod famine temporal record is invalid.');
  }

  return [
    ...APPROVED_EVENT_DATE_GATE_RECORDS.map((record) => ({
      id: record.event_id,
      phases: [{ id: record.phase_id, start_at_minutes: record.start_at_minutes }],
      source_ref: {
        record_id: record.event_id,
        catalog_digest: eventDateGateDigest
      }
    })),
    {
      id: 'novgorod_famine_1230',
      phases: [{ id: phaseIds[0], start_at_minutes: Number(start) }],
      source_ref: { record_id: famine.record_id, catalog_digest: famine.canonical_digest }
    }
  ];
}
