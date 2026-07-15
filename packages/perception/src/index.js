import { validateNpcReactionRouting, validatePerceptionResult, validateSensoryEvent, validateSensorySceneSnapshot } from '@rus/contracts';
import { deepFreeze, sha256 } from '@rus/kernel';

export class PerceptionError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = 'PerceptionError'; this.code = code; this.details = deepFreeze(structuredClone(details)); }
}

const LEVELS = Object.freeze(['blocked','below_threshold','detected','localized','classified','identified','speech_understood']);
const perceptionCycles = new WeakSet();
const reactionHandlerRegistries = new WeakSet();

export function resolveSoundPaths({ event, snapshot }) {
  if (event?.modality !== 'sound') throw new PerceptionError('SENSORY_EVENT_MODALITY_INVALID', 'resolveSoundPaths requires a sound event.');
  const graph = indexGraph(snapshot);
  if (!graph.anchors.has(event.source_anchor_id)) throw new PerceptionError('SENSORY_SOURCE_ANCHOR_MISSING', 'Sound source anchor is absent from the snapshot.', { source_anchor_id: event.source_anchor_id });
  const paths = shortestPaths({ graph, sourceAnchorId: event.source_anchor_id, modality: 'sound', weatherLoss: units(snapshot?.weather?.sound_loss_units, 'weather.sound_loss_units') });
  return deepFreeze({
    version: 1,
    schema: 'sound_path_resolution_v1',
    event_id: event.event_id,
    source_anchor_id: event.source_anchor_id,
    by_anchor: Object.fromEntries([...paths.entries()].map(([anchorId, path]) => [anchorId, deepFreeze({
      path_id: `sound:${event.event_id}:${anchorId}`,
      anchor_id: anchorId,
      edge_ids: path.edgeIds,
      total_loss_units: path.loss,
      arrival_strength_units: Math.max(0, event.base_strength_units - path.loss),
      physical_reach: true
    })]))
  });
}

export function resolveSoundPerception({ event, observer, arrival, perceptionProfile, attentionState = {}, ambientProfile = {} }) {
  if (event?.modality !== 'sound') throw new PerceptionError('SENSORY_EVENT_MODALITY_INVALID', 'resolveSoundPerception requires a sound event.');
  requireObject(observer, 'observer'); requireObject(arrival, 'arrival'); requireObject(perceptionProfile, 'perceptionProfile');
  const arrivalStrength = units(arrival.arrival_strength_units, 'arrival.arrival_strength_units');
  const threshold = Math.max(
    units(perceptionProfile.hearing_threshold_units, 'perceptionProfile.hearing_threshold_units')
      + optionalUnits(attentionState.activity_penalty_units)
      + optionalUnits(attentionState.body_penalty_units)
      + optionalUnits(attentionState.impairment_penalty_units)
      - optionalUnits(attentionState.vigilance_bonus_units)
      - (attentionState.active_listening === true ? optionalUnits(attentionState.active_listening_bonus_units) : 0),
    units(ambientProfile.ambient_noise_floor_units, 'ambientProfile.ambient_noise_floor_units') + optionalUnits(ambientProfile.class_masking_modifier_units)
  );
  const margin = arrivalStrength - threshold;
  const perceived = arrival.physical_reach !== false && margin >= 0;
  const level = !perceived ? (arrival.physical_reach === false ? 'blocked' : 'below_threshold') : levelForSound(margin, perceptionProfile, event);
  return result({ event, observer, arrival, threshold, margin, perceived, level, direction: directionFor(level), identifiedSource: sourceIdentified(level, margin, perceptionProfile) ? event.source_id : null, identifiedClass: levelIndex(level) >= levelIndex('classified') ? event.semantic_class_id : null, speechContent: level === 'speech_understood' ? event.source_id : null, profiles: [event.signal_profile_id, perceptionProfile.profile_id, ambientProfile.profile_id].filter(Boolean) });
}

export function resolveVisibility({ event, snapshot, observer, perceptionProfile, attentionState = {} }) {
  if (event?.modality !== 'visual') throw new PerceptionError('SENSORY_EVENT_MODALITY_INVALID', 'resolveVisibility requires a visual event.');
  requireObject(observer, 'observer'); requireObject(perceptionProfile, 'perceptionProfile');
  const graph = indexGraph(snapshot);
  if (!graph.anchors.has(event.source_anchor_id) || !graph.anchors.has(observer.anchor_id)) throw new PerceptionError('VISION_ANCHOR_MISSING', 'Visual source or observer anchor is absent from snapshot.');
  const paths = shortestPaths({ graph, sourceAnchorId: event.source_anchor_id, modality: 'visual', weatherLoss: units(snapshot?.weather?.vision_loss_units ?? 0, 'weather.vision_loss_units') + units(snapshot?.light_state?.visibility_loss_units ?? 0, 'light_state.visibility_loss_units') });
  const path = paths.get(observer.anchor_id);
  if (!path) return result({ event, observer, arrival: { path_id: `visual:${event.event_id}:${observer.anchor_id}`, arrival_strength_units: 0, physical_reach: false }, threshold: 0, margin: 0, perceived: false, level: 'blocked', direction: 'none', identifiedSource: null, identifiedClass: null, speechContent: null, profiles: [event.signal_profile_id, perceptionProfile.profile_id].filter(Boolean) });
  const arrivalStrength = Math.max(0, units(event.base_strength_units, 'event.base_strength_units') - path.loss);
  const threshold = units(perceptionProfile.visual_threshold_units, 'perceptionProfile.visual_threshold_units') + optionalUnits(attentionState.visual_penalty_units) - optionalUnits(attentionState.vigilance_bonus_units);
  const margin = arrivalStrength - threshold;
  const perceived = margin >= 0;
  const level = !perceived ? 'below_threshold' : levelForVisual(margin, perceptionProfile);
  return result({ event, observer, arrival: { path_id: `visual:${event.event_id}:${observer.anchor_id}`, arrival_strength_units: arrivalStrength, physical_reach: true, edge_ids: path.edgeIds }, threshold, margin, perceived, level, direction: directionFor(level), identifiedSource: levelIndex(level) >= levelIndex('identified') ? event.source_id : null, identifiedClass: levelIndex(level) >= levelIndex('classified') ? event.semantic_class_id : null, speechContent: null, profiles: [event.signal_profile_id, perceptionProfile.profile_id].filter(Boolean) });
}

export function evaluateAwareness({ current_state, perception_result, routine_match, significance, policy }) {
  if (!['calm','attentive','suspicious','alarmed','engaged'].includes(current_state)) throw new PerceptionError('AWARENESS_STATE_INVALID', 'current_state is invalid.');
  if (perception_result?.perceived !== true) return deepFreeze({ previous_state: current_state, next_state: current_state, reaction_required: false, reason: 'not_perceived' });
  const routine = routine_match === true;
  const significant = !routine && ['medium','high','critical'].includes(significance);
  const transition = policy?.transitions?.[current_state];
  if (!transition || typeof transition !== 'object') throw new PerceptionError('REACTION_POLICY_MISSING', 'Awareness transition policy is missing for current state.', { current_state });
  const nextState = routine ? transition.routine : significant ? transition.significant : transition.nonroutine;
  if (!['calm','attentive','suspicious','alarmed','engaged'].includes(nextState)) throw new PerceptionError('REACTION_POLICY_INVALID', 'Awareness transition target is invalid.', { current_state, next_state: nextState });
  return deepFreeze({ previous_state: current_state, next_state: nextState, reaction_required: !routine && significant, reason: routine ? 'routine' : significant ? 'significant' : 'nonroutine' });
}

export function routeNpcReaction({ party_id, event_id, observer_id, reaction_policy_id, state_version, awareness, options }) {
  requireText(party_id, 'party_id'); requireText(event_id, 'event_id'); requireText(observer_id, 'observer_id'); requireText(reaction_policy_id, 'reaction_policy_id');
  if (!Number.isInteger(state_version) || state_version < 0) throw new PerceptionError('STATE_VERSION_INVALID', 'state_version must be a non-negative integer.');
  if (!Array.isArray(options)) throw new PerceptionError('REACTION_OPTIONS_INVALID', 'options must be an array.');
  const unique = new Set();
  for (const option of options) { requireText(option?.option_id, 'option.option_id'); requireText(option?.command_id, 'option.command_id'); if (unique.has(option.option_id)) throw new PerceptionError('REACTION_OPTIONS_INVALID', 'option_id values must be unique.'); unique.add(option.option_id); }
  if (awareness?.reaction_required !== true) return routing({ party_id, event_id, observer_id, reaction_policy_id, state_version, status: 'no_reaction', options: [] });
  if (options.length === 0) throw new PerceptionError('REQUIRED_CANDIDATE_SET_EMPTY', 'A reaction-required stimulus has no approved options.');
  return routing({ party_id, event_id, observer_id, reaction_policy_id, state_version, status: options.length === 1 ? 'code_reaction' : 'bounded_decision_required', options });
}

/**
 * Выполняет один неизменяемый цикл восприятия поверх утверждённого snapshot.
 * Все profile/policy/options передаются вызывающим слоем из version-pinned
 * world_base; эта функция не выбирает и не дополняет их.
 */
export function evaluatePerceptionCycle({ cycle_id, snapshot, events, observers }) {
  requireText(cycle_id, 'cycle_id');
  if (!Array.isArray(events) || !Array.isArray(observers)) throw new PerceptionError('PERCEPTION_CYCLE_INPUT_INVALID', 'events and observers must be arrays.');
  assertContract(validateSensorySceneSnapshot(snapshot), 'SENSORY_SNAPSHOT_CONTRACT_INVALID');
  const results = [];
  const awarenessStates = [];
  const reactionRoutings = [];
  for (const event of events) {
    requireEvent(event); assertContract(validateSensoryEvent(event), 'SENSORY_EVENT_CONTRACT_INVALID');
    const soundPaths = event.modality === 'sound' ? resolveSoundPaths({ event, snapshot }) : null;
    for (const observer of observers) {
      requireObserver(observer);
      const perception = event.modality === 'sound'
        ? resolveSoundPerception({ event, observer, arrival: soundPaths.by_anchor[observer.anchor_id] ?? blockedArrival(event, observer), perceptionProfile: observer.perception_profile, attentionState: observer.attention_state, ambientProfile: observer.ambient_profile })
        : resolveVisibility({ event, snapshot, observer, perceptionProfile: observer.perception_profile, attentionState: observer.attention_state });
      assertContract(validatePerceptionResult(perception), 'PERCEPTION_RESULT_CONTRACT_INVALID');
      results.push(perception);
      if (observer.kind !== 'npc') continue;
      if (!observer.reaction_context) throw new PerceptionError('NPC_REACTION_CONTEXT_MISSING', 'NPC observer requires reaction_context.', { observer_id: observer.actor_id });
      const context = observer.reaction_context;
      const awareness = evaluateAwareness({
        current_state: context.current_awareness_state,
        perception_result: perception,
        routine_match: context.routine_match === true,
        significance: context.significance,
        policy: context.policy
      });
      awarenessStates.push(deepFreeze({ npc_id: observer.actor_id, event_id: event.event_id, reaction_policy_id: context.reaction_policy_id, significance_band: context.significance, ...awareness }));
      const routing = routeNpcReaction({
        party_id: event.party_id,
        event_id: event.event_id,
        observer_id: observer.actor_id,
        reaction_policy_id: context.reaction_policy_id,
        state_version: event.state_version,
        awareness,
        options: context.options ?? []
      });
      assertContract(validateNpcReactionRouting(routing), 'NPC_REACTION_ROUTING_CONTRACT_INVALID');
      reactionRoutings.push(routing);
    }
  }
  const trace = { cycle_id, snapshot_digest: snapshot?.snapshot_digest, event_ids: events.map((event) => event.event_id), result_ids: results.map((result) => result.result_id) };
  const waves = summarizeCycleWaves([{ cycle_id, events, trace_digest: sha256(trace) }]);
  const cycle = deepFreeze({ version: 1, schema: 'perception_cycle_v1', cycle_id, party_id: snapshot?.party_id, state_version: snapshot?.state_version, snapshot_digest: snapshot?.snapshot_digest, wave_count: waves.length, waves, events: structuredClone(events), results, awareness_states: awarenessStates, reaction_routings: reactionRoutings, trace_digest: sha256(trace) });
  perceptionCycles.add(cycle);
  return cycle;
}

export function isCodeOwnedPerceptionCycle(value) { return perceptionCycles.has(value); }

export function mergePerceptionCycles({ cycle_id, cycles }) {
  requireText(cycle_id, 'cycle_id');
  if (!Array.isArray(cycles) || cycles.length === 0 || cycles.some((cycle) => !isCodeOwnedPerceptionCycle(cycle))) throw new PerceptionError('PERCEPTION_CYCLE_MERGE_INVALID', 'Only non-empty code-owned cycles may be merged.');
  const first = cycles[0];
  if (cycles.some((cycle) => cycle.party_id !== first.party_id || cycle.state_version !== first.state_version || cycle.snapshot_digest !== first.snapshot_digest)) throw new PerceptionError('PERCEPTION_CYCLE_MERGE_INVALID', 'Merged cycles must share party, state and snapshot pins.');
  const events = cycles.flatMap((cycle) => cycle.events);
  const ids = new Set(events.map((event) => event.event_id));
  if (ids.size !== events.length) throw new PerceptionError('PERCEPTION_CYCLE_MERGE_INVALID', 'Merged cycles cannot duplicate event IDs.');
  const trace = { cycle_id, merged_cycle_ids: cycles.map((cycle) => cycle.cycle_id), event_ids: events.map((event) => event.event_id) };
  const waves = summarizeCycleWaves(cycles);
  const merged = deepFreeze({ version: 1, schema: 'perception_cycle_v1', cycle_id, party_id: first.party_id, state_version: first.state_version, snapshot_digest: first.snapshot_digest, wave_count: waves.length, waves, events: structuredClone(events), results: cycles.flatMap((cycle) => cycle.results), awareness_states: cycles.flatMap((cycle) => cycle.awareness_states), reaction_routings: cycles.flatMap((cycle) => cycle.reaction_routings), trace_digest: sha256(trace) });
  perceptionCycles.add(merged);
  return merged;
}

/** Реестр code-owned последствий утверждённых NPC-команд. */
export function createNpcReactionHandlerRegistry(definitions = []) {
  const handlers = new Map();
  for (const definition of definitions) {
    requireText(definition?.command_id, 'reaction_handler.command_id');
    if (handlers.has(definition.command_id) || typeof definition.handler !== 'function') throw new PerceptionError('REACTION_HANDLER_INVALID', 'Every NPC reaction handler needs a unique command_id and function.');
    handlers.set(definition.command_id, definition.handler);
  }
  const registry = Object.freeze({ get(commandId) { return handlers.get(commandId) ?? null; } });
  reactionHandlerRegistries.add(registry);
  return registry;
}

export function requireNpcReactionHandlerRegistry(registry) {
  if (!reactionHandlerRegistries.has(registry)) throw new PerceptionError('REACTION_HANDLER_REGISTRY_INVALID', 'NPC reaction handlers must come from the code-owned registry.');
  return registry;
}

function indexGraph(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.g5_nodes) || !Array.isArray(snapshot.g5_anchors) || !Array.isArray(snapshot.g5_edges)) throw new PerceptionError('SENSORY_SNAPSHOT_INVALID', 'Snapshot must include G5 nodes, anchors and edges.');
  const nodes = new Map(snapshot.g5_nodes.map((node) => [node.node_id, node]));
  const anchors = new Map(snapshot.g5_anchors.map((anchor) => [anchor.anchor_id, anchor]));
  const adjacency = new Map([...anchors.keys()].map((id) => [id, []]));
  for (const edge of snapshot.g5_edges) {
    requireText(edge?.edge_id, 'edge.edge_id'); requireText(edge?.from_anchor_id, 'edge.from_anchor_id'); requireText(edge?.to_anchor_id, 'edge.to_anchor_id');
    if (!anchors.has(edge.from_anchor_id) || !anchors.has(edge.to_anchor_id)) throw new PerceptionError('G5_EDGE_REFERENCE_INVALID', 'G5 edge references an unknown anchor.', { edge_id: edge.edge_id });
    adjacency.get(edge.from_anchor_id).push(edge); adjacency.get(edge.to_anchor_id).push(edge);
  }
  return { nodes, anchors, adjacency };
}

function shortestPaths({ graph, sourceAnchorId, modality, weatherLoss }) {
  const distances = new Map([[sourceAnchorId, 0]]); const edgePaths = new Map([[sourceAnchorId, []]]); const queue = [{ anchorId: sourceAnchorId, loss: 0 }];
  while (queue.length) {
    queue.sort((left, right) => left.loss - right.loss || left.anchorId.localeCompare(right.anchorId));
    const current = queue.shift();
    if (current.loss !== distances.get(current.anchorId)) continue;
    for (const edge of graph.adjacency.get(current.anchorId) ?? []) {
      if (!allows(edge, modality)) continue;
      const nextAnchorId = edge.from_anchor_id === current.anchorId ? edge.to_anchor_id : edge.from_anchor_id;
      const nextAnchor = graph.anchors.get(nextAnchorId); const nextNode = graph.nodes.get(nextAnchor?.node_id);
      if (!nextNode) throw new PerceptionError('G5_NODE_REFERENCE_INVALID', 'Anchor references an unknown G5 node.', { anchor_id: nextAnchorId });
      const loss = current.loss + transitionLoss(edge, modality) + nodeLoss(nextNode, modality);
      if (!distances.has(nextAnchorId) || loss < distances.get(nextAnchorId)) { distances.set(nextAnchorId, loss); edgePaths.set(nextAnchorId, [...edgePaths.get(current.anchorId), edge.edge_id]); queue.push({ anchorId: nextAnchorId, loss }); }
    }
  }
  return new Map([...distances.entries()].map(([anchorId, loss]) => [anchorId, { loss: loss + (anchorId === sourceAnchorId ? 0 : weatherLoss), edgeIds: edgePaths.get(anchorId) }]));
}

function allows(edge, modality) { return modality === 'sound' ? edge.sound_blocked !== true : edge.vision_transmission !== 'blocked'; }
function transitionLoss(edge, modality) { return modality === 'sound' ? units(edge.sound_loss_units, 'edge.sound_loss_units') + units(edge.distance_loss_units, 'edge.distance_loss_units') : units(edge.vision_loss_units, 'edge.vision_loss_units'); }
function nodeLoss(node, modality) { return modality === 'sound' ? units(node.acoustic_loss_units ?? 0, 'node.acoustic_loss_units') : units(node.vision_loss_units ?? 0, 'node.vision_loss_units'); }
function levelForSound(margin, profile, event) { if (event.semantic_class_id === 'speech' && margin >= units(profile.speech_margin_units, 'perceptionProfile.speech_margin_units')) return 'speech_understood'; if (margin >= units(profile.identification_margin_units, 'perceptionProfile.identification_margin_units')) return 'identified'; if (margin >= units(profile.classification_margin_units, 'perceptionProfile.classification_margin_units')) return 'classified'; if (margin >= units(profile.localization_margin_units, 'perceptionProfile.localization_margin_units')) return 'localized'; return 'detected'; }
function levelForVisual(margin, profile) { if (margin >= units(profile.visual_identification_margin_units, 'perceptionProfile.visual_identification_margin_units')) return 'identified'; if (margin >= units(profile.visual_classification_margin_units, 'perceptionProfile.visual_classification_margin_units')) return 'classified'; return 'detected'; }
function sourceIdentified(level, margin, profile) { return level === 'identified' || (level === 'speech_understood' && margin >= units(profile.identification_margin_units, 'perceptionProfile.identification_margin_units')); }
function summarizeCycleWaves(cycles) { return cycles.flatMap((cycle) => [...new Set(cycle.events.map((event) => event.wave_index))].sort((a, b) => a - b).map((wave_index) => ({ cycle_id: cycle.cycle_id, wave_index, event_ids: cycle.events.filter((event) => event.wave_index === wave_index).map((event) => event.event_id), trace_digest: cycle.trace_digest }))); }
function directionFor(level) { return levelIndex(level) >= levelIndex('localized') ? 'direction' : 'none'; }
function levelIndex(level) { return LEVELS.indexOf(level); }
function result({ event, observer, arrival, threshold, margin, perceived, level, direction, identifiedSource, identifiedClass, speechContent, profiles }) {
  const output = { version: 1, schema: 'perception_result_v1', result_id: `perception:${event.event_id}:${observer.actor_id}`, event_id: event.event_id, observer_kind: observer.kind, observer_id: observer.actor_id, observer_anchor_id: observer.anchor_id, modality: event.modality, physical_reach: arrival.physical_reach !== false, perceived, perception_level: level, direction_resolution: direction, identified_source_id: identifiedSource, identified_semantic_class_id: identifiedClass, speech_content_id: speechContent, confidence_band: confidenceFor(level), path_id: arrival.path_id, arrival_strength_units: Math.max(0, arrival.arrival_strength_units), threshold_units: Math.max(0, threshold), margin_units: margin, applied_profile_ids: profiles, check_result_id: null, trace_digest: sha256({ event_id: event.event_id, observer_id: observer.actor_id, path_id: arrival.path_id, threshold, margin, level, profiles }), state_version: event.state_version };
  return deepFreeze(output);
}
function routing({ party_id, event_id, observer_id, reaction_policy_id, state_version, status, options }) { return deepFreeze({ version: 1, schema: 'npc_reaction_routing_v1', routing_id: `reaction:${event_id}:${observer_id}`, party_id, event_id, observer_id, reaction_policy_id, state_version, status, options: structuredClone(options), trace_digest: sha256({ party_id, event_id, observer_id, reaction_policy_id, state_version, status, options }) }); }
function confidenceFor(level) { return level === 'blocked' || level === 'below_threshold' ? 'none' : level === 'detected' ? 'low' : level === 'localized' ? 'medium' : level === 'classified' ? 'high' : 'certain'; }
function blockedArrival(event, observer) { return { path_id: `${event.modality}:${event.event_id}:${observer.anchor_id}`, arrival_strength_units: 0, physical_reach: false }; }
function requireEvent(event) {
  requireText(event?.event_id, 'event.event_id'); requireText(event?.party_id, 'event.party_id'); requireText(event?.source_anchor_id, 'event.source_anchor_id');
  if (!['sound','visual'].includes(event?.modality)) throw new PerceptionError('SENSORY_EVENT_MODALITY_INVALID', 'event.modality is invalid.');
}
function requireObserver(observer) {
  requireText(observer?.kind, 'observer.kind'); requireText(observer?.actor_id, 'observer.actor_id'); requireText(observer?.anchor_id, 'observer.anchor_id');
  if (!['player','npc'].includes(observer.kind)) throw new PerceptionError('OBSERVER_KIND_INVALID', 'observer.kind must be player or npc.');
  requireObject(observer.perception_profile, 'observer.perception_profile');
}
function assertContract(issues, code) { if (issues.length) throw new PerceptionError(code, issues.map((issue) => issue.message).join('; '), { issues }); }
function units(value, field) { if (!Number.isInteger(value) || value < 0) throw new PerceptionError('PROFILE_VALUE_INVALID', `${field} must be a non-negative integer.`, { field, value }); return value; }
function optionalUnits(value) { return value === undefined ? 0 : units(value, 'optional_units'); }
function requireText(value, field) { if (typeof value !== 'string' || !value.trim()) throw new PerceptionError('INPUT_REQUIRED_FIELD', `${field} must be a non-empty string.`, { field }); }
function requireObject(value, field) { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PerceptionError('INPUT_REQUIRED_FIELD', `${field} must be an object.`, { field }); }
