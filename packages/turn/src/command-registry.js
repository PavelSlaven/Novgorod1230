import { deepFreeze } from '@rus/kernel';
import { issueBoundedDecisionRequest, validateBoundedDecisionResult } from '@rus/materialization';

const registries = new WeakSet();
const sealedPlans = new WeakSet();

export function createTurnCommandRegistry(definitions = []) {
  const commands = new Map();
  for (const definition of definitions) {
    if (!definition?.command_id || commands.has(definition.command_id) || typeof definition.matches !== 'function' || typeof definition.availability !== 'function' || typeof definition.consequence !== 'function' || typeof definition.writeTargets !== 'function') throw new TypeError('Every turn command requires unique ID and code handlers.');
    commands.set(definition.command_id, deepFreeze(structuredCloneHandlers(definition)));
  }
  const registry = Object.freeze({
    eligible(context) { return [...commands.values()].filter((command) => command.matches(context) === true).sort((left, right) => left.command_id.localeCompare(right.command_id)); },
    get(commandId) { return commands.get(commandId) ?? null; }
  });
  registries.add(registry);
  return registry;
}

export async function resolveRegisteredTurnCommand({ registry, playerInput, routingContext, services, now }) {
  requireRegistry(registry);
  const eligible = registry.eligible(deepFreeze({ player_input: playerInput, routing_context: routingContext }));
  if (eligible.length === 0) throw turnCommandError('TURN_COMMAND_NOT_REGISTERED', 'No approved command matches the player intent.');
  let command = eligible[0];
  let decisionTrace = { decision_protocol: 'code_singleton_v1', command_id: command.command_id };
  if (eligible.length > 1) {
    const stateVersion = Number(routingContext.state_version ?? 0);
    const options = eligible.map((entry, ordinal) => ({ option_id: `turn-option-${ordinal + 1}`, command_id: entry.command_id, actor_id: playerInput.party_id, target_id: entry.target_id ?? playerInput.party_id, preconditions: structuredClone(entry.preconditions ?? []), expected_cost: structuredClone(entry.expected_cost), known_risks: structuredClone(entry.known_risks), reason_visible_to_actor: entry.reason_visible_to_actor, state_version: stateVersion, metadata: {} }));
    const executor = services.decisionExecutor;
    if (typeof executor !== 'function' || !services.decisionSecret || !services.decisionExpiresAt) throw turnCommandError('TURN_BOUNDED_DECISION_DEPENDENCY_MISSING', 'Ambiguous command requires a bounded decision executor, secret and expiry.');
    const request = issueBoundedDecisionRequest({ requestId: `turn-decision:${playerInput.party_id}:${playerInput.turn_number}`, partyId: playerInput.party_id, actorId: playerInput.party_id, policyId: 'base_turn_command_selection', policyVersion: '2', stateVersion, issuedAt: now, expiresAt: services.decisionExpiresAt, options, secret: services.decisionSecret });
    const raw = await executor({ input: request, stage: { id: 'turn_command_selection', input_schema: 'bounded_decision_request_v2', output_schema: 'bounded_decision_result_v2' } });
    const result = raw?.output ?? raw;
    const validated = validateBoundedDecisionResult({ request, result, secret: services.decisionSecret, now, currentPolicyVersion: '2' });
    command = registry.get(validated.command_id);
    decisionTrace = { decision_protocol: 'bounded_decision_v2', command_id: validated.command_id, bounded_decision_trace: { request, result: validated, validation_report: { pass: true } } };
  }
  return { command, decisionTrace };
}

export function sealTurnWritePlan(plan) {
  const cloned = structuredClone(plan);
  if (plan.perception_cycle) cloned.perception_cycle = plan.perception_cycle;
  const sealed = deepFreeze(cloned);
  sealedPlans.add(sealed);
  return sealed;
}
export function isCodeOwnedTurnWritePlan(plan) { return sealedPlans.has(plan); }
export function requireTurnCommandRegistry(registry) { requireRegistry(registry); return registry; }

function requireRegistry(registry) { if (!registries.has(registry)) throw turnCommandError('TURN_COMMAND_REGISTRY_INVALID', 'Turn command registry must be created by the code registry factory.'); }
function structuredCloneHandlers(value) { return { ...value, mode: structuredClone(value.mode), preconditions: structuredClone(value.preconditions ?? []), expected_cost: structuredClone(value.expected_cost ?? { kind: 'time', value: 0 }), known_risks: structuredClone(value.known_risks ?? []), reason_visible_to_actor: value.reason_visible_to_actor ?? 'Разрешённая команда.' }; }
function turnCommandError(code, message) { return Object.assign(new Error(message), { code }); }
