import { clampDifficulty, executeCheck } from '@rus/checks-rng';
import { requireRandomSource } from '../ports.js';
import { freezeOutput } from './shared.js';
import { getTurnStepWorkflowDraft } from '../turn-step-workflow-draft.js';

export function executeApprovedChecksStage({ availability, services,
  modeResolution }) {
  const requests = availability.check_requests ?? [];
  const randomSource = requireRandomSource(services, requests);
  const normalizedRequests = requests.map(normalizeLegacyCheckRequest);
  const results = normalizedRequests.map((request) =>
    executeCheck(request, randomSource));
  const draftChecks = getTurnStepWorkflowDraft(modeResolution)
    ?.loop_result?.check_results ?? [];
  const draftRequests = getTurnStepWorkflowDraft(modeResolution)
    ?.loop_result?.check_requests ?? [];
  return freezeOutput({
    version: 1,
    schema: 'turn_check_results',
    requests: [
      ...structuredClone(normalizedRequests),
      ...structuredClone(draftRequests)
    ],
    results: [...results, ...structuredClone(draftChecks)]
  });
}

function normalizeLegacyCheckRequest(request) {
  return {
    check_id: request.check_id,
    difficulty: clampDifficulty(request.difficulty),
    attribute_value: finite(request.attribute_value, 10),
    skill_bonus: finite(request.skill_bonus, 0),
    state_modifier: finite(request.state_modifier, 0),
    equipment_modifier: finite(request.equipment_modifier, 0),
    circumstance_modifier: finite(request.circumstance_modifier, 0)
  };
}

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
