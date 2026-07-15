import { freezeOutput } from './shared.js';
import { deepFreeze } from '@rus/kernel';
import { issueBoundedDecisionRequest, validateBoundedDecisionResult } from '@rus/materialization';
import { validateSensoryEvent } from '@rus/contracts';
import { isCodeOwnedPerceptionCycle, mergePerceptionCycles, requireNpcReactionHandlerRegistry } from '@rus/perception';

export async function evaluatePerceptionStage({ playerInput, modeResolution, retrievedState, consequence, timeUpdate, perceptionEngine = null, npcReactionHandlers = null, decisionExecutor = null, decisionSecret = null, decisionExpiresAt = null, now = null, maxWaveCount = 3, maxEventsPerCycle = 128 }) {
  const events = consequence.sensory_events ?? [];
  if (!Array.isArray(events)) throw turnPerceptionError('TURN_SENSORY_EVENTS_INVALID', 'sensory_events must be an array.');
  if (events.length === 0) return freezeOutput({ version: 1, schema: 'turn_perception', status: 'not_applicable' });
  if (!perceptionEngine || typeof perceptionEngine.evaluate !== 'function') throw turnPerceptionError('TURN_PERCEPTION_ENGINE_REQUIRED', 'Sensory events require an approved perception engine.');
  const output = await perceptionEngine.evaluate(Object.freeze(structuredClone({ playerInput, modeResolution, retrievedState, consequence, timeUpdate, events })));
  if (!output || typeof output !== 'object' || Array.isArray(output) || !isCodeOwnedPerceptionCycle(output.cycle)) throw turnPerceptionError('TURN_PERCEPTION_OUTPUT_INVALID', 'Perception engine must return a code-owned cycle.');
  validatePins(output.pins);
  const reaction_decisions = await resolveReactionRoutings({
    cycle: output.cycle, handlers: npcReactionHandlers, decisionExecutor, decisionSecret,
    decisionExpiresAt, now: now ?? new Date().toISOString()
  });
  const cycles = [output.cycle];
  let pendingEvents = collectSecondaryEvents(reaction_decisions, { waveIndex: 1, knownEventIds: new Set(output.cycle.events.map((event) => event.event_id)), maxEventsPerCycle });
  while (pendingEvents.length) {
    if (pendingEvents[0].wave_index >= maxWaveCount) throw turnPerceptionError('TURN_PERCEPTION_WAVE_LIMIT', 'Secondary sensory event exceeds maxWaveCount.');
    if (typeof perceptionEngine.evaluateWave !== 'function') throw turnPerceptionError('TURN_PERCEPTION_WAVE_ENGINE_REQUIRED', 'Secondary sensory events require evaluateWave on the perception engine.');
    const next = await perceptionEngine.evaluateWave(Object.freeze({ previous_cycle: cycles.at(-1), events: structuredClone(pendingEvents), wave_index: pendingEvents[0].wave_index }));
    if (!next || !isCodeOwnedPerceptionCycle(next.cycle)) throw turnPerceptionError('TURN_PERCEPTION_OUTPUT_INVALID', 'evaluateWave must return a code-owned cycle.');
    validatePins(next.pins);
    if (JSON.stringify(next.pins) !== JSON.stringify(output.pins)) throw turnPerceptionError('TURN_PERCEPTION_PINS_MISMATCH', 'Secondary wave must keep perception version pins.');
    cycles.push(next.cycle);
    const decisions = await resolveReactionRoutings({ cycle: next.cycle, handlers: npcReactionHandlers, decisionExecutor, decisionSecret, decisionExpiresAt, now: now ?? new Date().toISOString() });
    reaction_decisions.push(...decisions);
    pendingEvents = collectSecondaryEvents(decisions, { waveIndex: pendingEvents[0].wave_index + 1, knownEventIds: new Set(cycles.flatMap((cycle) => cycle.events.map((event) => event.event_id))), maxEventsPerCycle });
  }
  const cycle = cycles.length === 1 ? output.cycle : mergePerceptionCycles({ cycle_id: output.cycle.cycle_id, cycles });
  // cycle carries an in-process provenance capability checked by persistence;
  // cloning it would deliberately strip that capability.
  return deepFreeze({ version: 1, schema: 'turn_perception', status: 'evaluated', cycle, pins: structuredClone(output.pins), reaction_decisions });
}

function collectSecondaryEvents(decisions, { waveIndex, knownEventIds, maxEventsPerCycle }) {
  const events = decisions.flatMap((decision) => decision.effect.secondary_events ?? []).sort((left, right) => left.event_id.localeCompare(right.event_id));
  if (!events.length) return [];
  if (knownEventIds.size + events.length > maxEventsPerCycle) throw turnPerceptionError('TURN_PERCEPTION_EVENT_LIMIT', 'Perception event count exceeds maxEventsPerCycle.');
  const added = new Set();
  for (const event of events) {
    const issues = validateSensoryEvent(event);
    if (issues.length || event.wave_index !== waveIndex || typeof event.parent_event_id !== 'string' || !event.parent_event_id || typeof event.causal_reaction_id !== 'string' || !event.causal_reaction_id || knownEventIds.has(event.event_id) || added.has(event.event_id)) throw turnPerceptionError('TURN_SECONDARY_SENSORY_EVENT_INVALID', 'Secondary sensory event must be valid, causal and unique.');
    added.add(event.event_id);
  }
  return events;
}

async function resolveReactionRoutings({ cycle, handlers, decisionExecutor, decisionSecret, decisionExpiresAt, now }) {
  const routings = cycle.reaction_routings.filter((routing) => routing.status !== 'no_reaction');
  if (!routings.length) return [];
  requireNpcReactionHandlerRegistry(handlers);
  const resolved = [];
  for (const routing of routings) {
    let selected; let request = null; let result = null; let decisionResponse = null; let resolution_kind;
    if (routing.status === 'code_reaction') {
      selected = routing.options[0];
      resolution_kind = 'code_singleton';
    } else if (routing.status === 'bounded_decision_required') {
      if (typeof decisionExecutor !== 'function' || !decisionSecret || !decisionExpiresAt) throw turnPerceptionError('TURN_NPC_REACTION_DECISION_DEPENDENCY_MISSING', 'An ambiguous NPC reaction requires bounded-decision dependencies.');
      request = issueBoundedDecisionRequest({
        requestId: `npc-reaction:${routing.routing_id}`, partyId: routing.party_id, actorId: routing.observer_id,
        policyId: routing.reaction_policy_id, policyVersion: 'perception_v1', stateVersion: routing.state_version,
        issuedAt: now, expiresAt: decisionExpiresAt, secret: decisionSecret,
        options: routing.options.map((option) => boundedOption(option, routing))
      });
      const raw = await decisionExecutor({ input: request, stage: { id: 'npc_reaction_selection', input_schema: 'bounded_decision_request_v2', output_schema: 'bounded_decision_result_v2' } });
      decisionResponse = raw?.output ?? raw;
      result = validateBoundedDecisionResult({ request, result: decisionResponse, secret: decisionSecret, now, currentPolicyVersion: 'perception_v1' });
      selected = request.options.find((option) => option.option_id === result.option_id);
      resolution_kind = 'bounded_decision';
    } else {
      throw turnPerceptionError('TURN_NPC_REACTION_ROUTING_INVALID', `Unsupported NPC reaction routing status: ${routing.status}.`);
    }
    const handler = handlers.get(selected.command_id);
    if (typeof handler !== 'function') throw turnPerceptionError('TURN_NPC_REACTION_HANDLER_MISSING', `No code handler for ${selected.command_id}.`);
    const effect = await handler(deepFreeze({ cycle, routing, selected_option: structuredClone(selected), decision_request: request, decision_result: result }));
    validateReactionEffect(effect);
    resolved.push(deepFreeze({
      version: 1, schema: 'npc_reaction_decision_v1', reaction_decision_id: `npc-reaction:${routing.routing_id}`,
      routing_id: routing.routing_id, party_id: routing.party_id, event_id: routing.event_id, npc_id: routing.observer_id,
      reaction_policy_id: routing.reaction_policy_id, state_version: routing.state_version, resolution_kind,
      selected_option_id: selected.option_id, command_id: selected.command_id,
      ...(request ? { decision_request: request, decision_response: structuredClone(decisionResponse), decision_result: result } : {}), effect: structuredClone(effect)
    }));
  }
  return resolved;
}

function boundedOption(option, routing) {
  for (const field of ['option_id','command_id','reason_visible_to_actor']) if (typeof option?.[field] !== 'string' || !option[field].trim()) throw turnPerceptionError('TURN_NPC_REACTION_OPTION_INVALID', `${field} is required for bounded NPC reaction.`);
  if (!Array.isArray(option.preconditions) || !option.expected_cost || typeof option.expected_cost !== 'object' || Array.isArray(option.expected_cost) || !Array.isArray(option.known_risks)) throw turnPerceptionError('TURN_NPC_REACTION_OPTION_INVALID', 'Bounded NPC reaction option is incomplete.');
  return { option_id: option.option_id, command_id: option.command_id, actor_id: routing.observer_id, target_id: routing.party_id, preconditions: structuredClone(option.preconditions), expected_cost: structuredClone(option.expected_cost), known_risks: structuredClone(option.known_risks), reason_visible_to_actor: option.reason_visible_to_actor, state_version: routing.state_version, metadata: { routing_id: routing.routing_id } };
}

function validateReactionEffect(effect) {
  if (!effect || effect.version !== 1 || effect.schema !== 'npc_reaction_effect_v1' || !Array.isArray(effect.secondary_events) || Object.keys(effect).some((key) => !['version','schema','secondary_events','trace'].includes(key))) throw turnPerceptionError('TURN_NPC_REACTION_EFFECT_INVALID', 'NPC reaction handler must return npc_reaction_effect_v1 with secondary_events.');
}

function turnPerceptionError(code, message) { return Object.assign(new Error(message), { code }); }
function validatePins(pins) {
  for (const field of ['perception_algorithm_id', 'sensory_catalog_digest', 'reaction_policy_digest']) {
    if (typeof pins?.[field] !== 'string' || !pins[field].trim()) throw turnPerceptionError('TURN_PERCEPTION_PINS_INVALID', `${field} is required.`);
  }
  for (const field of ['sensory_catalog_digest', 'reaction_policy_digest']) if (!/^[a-f0-9]{64}$/u.test(pins[field])) throw turnPerceptionError('TURN_PERCEPTION_PINS_INVALID', `${field} must be a SHA-256 digest.`);
}
