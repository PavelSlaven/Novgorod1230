import { issueBoundedDecisionRequest, validateBoundedDecisionResult } from '@rus/materialization';
import { buildStage3HistoricalFrameInput } from './input.js';
import { validateStage3HistoricalFrame } from './validation.js';

export const stage3Definition = Object.freeze({
  id: 3,
  name: 'historical_frame',
  version: 2,
  stageType: 'bounded_semantic_decision',
  buildInput: buildStage3HistoricalFrameInput,
  validate: validateStage3HistoricalFrame,
  async execute({ input, services = {} } = {}) {
    const options = buildHistoricalFrameOptions(input);
    if (options.length === 0) return { status: 'blocked', artifact: null, concerns: [{ code: 'NO_COMPATIBLE_HISTORICAL_FRAME', message: 'No approved candidate combination can form a historical frame.' }] };
    let selected = options[0];
    let decisionTrace = { decision_protocol: 'code_singleton_v1', option_id: selected.option_id };
    if (options.length > 1) {
      const executor = services.stage3?.executor ?? services.selectHistoricalFrame ?? services.executor;
      const secret = services.stage3?.decisionSecret ?? services.decisionSecret;
      const expiresAt = services.stage3?.decisionExpiresAt ?? services.decisionExpiresAt;
      const now = services.stage3?.now ?? services.now ?? new Date().toISOString();
      if (typeof executor !== 'function' || !secret || !expiresAt) throw stage3Error('HISTORICAL_FRAME_BOUNDED_DEPENDENCY_MISSING', 'Ambiguous historical-frame selection requires executor, secret and expiry.');
      const partyId = String(services.partyId ?? input.party_id ?? '').trim();
      if (!partyId) throw stage3Error('HISTORICAL_FRAME_PARTY_ID_MISSING', 'Bounded historical-frame selection requires the target party identity.');
      const request = issueBoundedDecisionRequest({ requestId: `${input.request_id}:stage3`, partyId, actorId: 'new_game_historical_frame_selector', policyId: 'stage3_historical_frame_selection', policyVersion: '2', stateVersion: 0, issuedAt: now, expiresAt, options, secret });
      const raw = await executor({ input: request, stage: { id: 3, slug: 'historical_frame', input_schema: 'bounded_decision_request_v2', output_schema: 'bounded_decision_result_v2' } });
      const result = raw?.output ?? raw?.data ?? raw;
      const validated = validateBoundedDecisionResult({ request, result, secret, now, currentPolicyVersion: '2' });
      selected = options.find((option) => option.option_id === validated.option_id);
      decisionTrace = { decision_protocol: 'bounded_decision_v2', option_id: validated.option_id, bounded_decision_trace: { request, result: validated, validation_report: { pass: true } } };
    }
    const artifact = buildHistoricalFrame(input, selected.metadata, decisionTrace);
    const concerns = validateStage3HistoricalFrame(artifact, input);
    return { status: concerns.length === 0 ? 'approved' : 'repair_required', artifact, concerns };
  }
});

export function buildHistoricalFrameOptions(input) {
  const candidates = input?.available_candidates ?? {};
  const options = [];
  for (const region of candidates.regions ?? []) for (const period of (candidates.historical_periods ?? []).filter((value) => value.region_id === region.region_id)) for (const season of (candidates.season_rules ?? []).filter((value) => value.region_id === region.region_id)) for (const time of candidates.time_of_day_policies ?? []) {
    const year = requestedYear(input.normalized_request, period);
    if (!Number.isInteger(year) || (period.year_start != null && year < period.year_start) || (period.year_end != null && year > period.year_end)) continue;
    const metadata = { region_id: region.region_id, historical_period_id: period.period_id, season_rule_id: season.season_rule_id, time_of_day_policy_id: time.time_of_day_policy_id, year, season: season.season_id, hour: time.hour_min, minute: 0, time_of_day: time.time_of_day, light_profile: time.light_profile };
    const optionId = `historical-frame-${options.length + 1}`;
    options.push({ option_id: optionId, command_id: `select_${optionId}`, actor_id: 'new_game_historical_frame_selector', target_id: period.period_id, preconditions: [], expected_cost: { kind: 'new_game_selection', value: 0 }, known_risks: [], reason_visible_to_actor: 'Выбор из утверждённых исторических рамок.', state_version: 0, metadata });
  }
  return options;
}

function buildHistoricalFrame(input, selection, decisionTrace) {
  const candidates = input.available_candidates;
  const region = candidates.regions.find((value) => value.region_id === selection.region_id);
  const period = candidates.historical_periods.find((value) => value.period_id === selection.historical_period_id);
  const season = candidates.season_rules.find((value) => value.season_rule_id === selection.season_rule_id);
  const political = candidates.political_contexts.find((value) => value.region_id === selection.region_id) ?? { summary: region.political_summary ?? period.political_summary };
  const social = candidates.social_contexts.find((value) => value.region_id === selection.region_id) ?? { summary: region.social_summary ?? period.social_summary };
  const sources = [...new Set([...(region.sources ?? []), ...(period.sources ?? []), ...(season.sources ?? [])])];
  return {
    version: 1, schema: 'historical_frame', request_id: input.request_id, selection_status: 'selected',
    era: { period_id: period.period_id, title: period.title ?? period.summary }, year: { value: selection.year }, calendar: { season: selection.season },
    clock: { day: 1, hour: selection.hour, minute: selection.minute, time_of_day: selection.time_of_day, light_profile: selection.light_profile },
    region: structuredClone(region), political_context: structuredClone(political), social_context: structuredClone(social), seasonal_context: structuredClone(season),
    downstream_constraints: { must_preserve: ['year','calendar.season','region.region_id','clock.hour','clock.minute','clock.time_of_day','clock.light_profile'], must_not_create_yet: ['concrete_event','npc_instance','item_instance','g5_scene'], must_resolve_later: ['start_node','character_profile'] },
    candidate_ids_used: { region_id: selection.region_id, historical_period_id: selection.historical_period_id, season_rule_id: selection.season_rule_id, time_of_day_policy_id: selection.time_of_day_policy_id },
    sources, decision_trace: decisionTrace, audit: { pass: true, concerns: [], evidence: [{ kind: 'code_candidate_projection', ...decisionTrace }] }
  };
}

function requestedYear(request, period) {
  const value = Number(request?.year_request?.value);
  if (Number.isInteger(value)) return value;
  if (Number.isInteger(period.year_start)) return period.year_start;
  if (Number.isInteger(period.year_end)) return period.year_end;
  return null;
}
function stage3Error(code, message) { return Object.assign(new Error(message), { code }); }
