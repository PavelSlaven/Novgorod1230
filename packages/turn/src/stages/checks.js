import { executeCheck } from '@rus/checks-rng';
import { requireRandomSource } from '../ports.js';
import { freezeOutput } from './shared.js';

export function executeApprovedChecksStage({ availability, services }) {
  const requests = availability.check_requests ?? [];
  const randomSource = requireRandomSource(services, requests);
  const results = requests.map((request) => executeCheck(request, randomSource));
  return freezeOutput({ version: 1, schema: 'turn_check_results', requests: structuredClone(requests), results });
}
