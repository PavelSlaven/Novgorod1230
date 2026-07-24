import { NPC_RUNTIME_OWNER, NPC_RUNTIME_RESOURCE_LIMITS } from './runtime-configuration.js';
import { allowedKeys, blocked, dependencyPins, digest, entityRef, exactKeys, formal, freeze, normalizeTimestamp, pinned, refKey, sealedRecord, sameRef, stableId, success, uniqueEntityRefs, uniqueStableIds, versionedRef } from './internal.js';

const SIGNAL_CHANNELS = new Set(['visual', 'acoustic']);
const ATTENTION_STATUSES = new Set(['awake', 'sleeping']);
const RECOGNITION_OUTCOMES = new Set(['recognized', 'misinterpreted', 'partial', 'unidentified']);
const PERCEPTION_RESULTS = new Set(['not_perceived', 'perceived_unidentified', 'perceived_partial', 'recognized', 'misinterpreted']);
const PERCEPTION_PROFILE_KEYS = ['recognition_policy_ref', 'visibility_policy_ref', 'provenance_ref', 'status', 'darkness_visual_result_cap', 'sleeping_attention_channels', 'canonical_digest'];
const SIGNAL_KEYS = ['signal_ref', 'channel', 'source_scope_ref', 'canonical_digest'];
const PROPAGATION_KEYS = ['source_scope_ref', 'target_scope_ref', 'edges', 'canonical_digest'];
const PATH_EDGE_KEYS = ['edge_ref', 'from_ref', 'to_ref', 'permitted_channels'];
const ENVIRONMENT_KEYS = ['light_state_id', 'canonical_digest'];
const ATTENTION_KEYS = ['attention_state_ref', 'status', 'attended_channels', 'canonical_digest'];
const RECOGNITION_KEYS = ['recognition_state_ref', 'outcome', 'canonical_digest'];
const PERCEPTION_EVIDENCE_KEYS = ['perception_id', 'input_digest', 'perception_digest', 'canonical_digest'];

function validatePerceptionProfile(value, pins) {
  return exactKeys(value, PERCEPTION_PROFILE_KEYS) && sealedRecord(value) && value.status === 'approved'
    && versionedRef(value.recognition_policy_ref) && versionedRef(value.visibility_policy_ref)
    && versionedRef(value.provenance_ref, 'source_record')
    && ['not_perceived', 'perceived_unidentified', 'perceived_partial'].includes(value.darkness_visual_result_cap)
    && uniqueStableIds(value.sleeping_attention_channels) && value.sleeping_attention_channels.every((channel) => SIGNAL_CHANNELS.has(channel))
    && dependencyPins(pins) && pinned(pins, 'profile', value.recognition_policy_ref)
    && pinned(pins, 'condition', value.visibility_policy_ref) && pinned(pins, 'source_dependency', value.provenance_ref);
}
function validateSignal(value) { return exactKeys(value, SIGNAL_KEYS) && sealedRecord(value) && entityRef(value.signal_ref) && SIGNAL_CHANNELS.has(value.channel) && entityRef(value.source_scope_ref); }
function validatePropagation(value) {
  if (!exactKeys(value, PROPAGATION_KEYS) || !sealedRecord(value) || !entityRef(value.source_scope_ref) || !entityRef(value.target_scope_ref) || !Array.isArray(value.edges) || value.edges.length > NPC_RUNTIME_RESOURCE_LIMITS.max_signal_path_edges) return false;
  const edgeIds = new Set(); const visitedScopes = new Set([refKey(value.source_scope_ref)]); let cursor = value.source_scope_ref;
  for (const edge of value.edges) {
    if (!exactKeys(edge, PATH_EDGE_KEYS) || !entityRef(edge.edge_ref) || !entityRef(edge.from_ref) || !entityRef(edge.to_ref) || !sameRef(edge.from_ref, cursor) || edgeIds.has(refKey(edge.edge_ref)) || visitedScopes.has(refKey(edge.to_ref)) || !uniqueStableIds(edge.permitted_channels) || edge.permitted_channels.some((channel) => !SIGNAL_CHANNELS.has(channel))) return false;
    edgeIds.add(refKey(edge.edge_ref)); visitedScopes.add(refKey(edge.to_ref)); cursor = edge.to_ref;
  }
  return sameRef(cursor, value.target_scope_ref);
}
function validateEnvironment(value) { return exactKeys(value, ENVIRONMENT_KEYS) && sealedRecord(value) && ['bright', 'dim', 'dark'].includes(value.light_state_id); }
function validateAttention(value) { return exactKeys(value, ATTENTION_KEYS) && sealedRecord(value) && entityRef(value.attention_state_ref) && ATTENTION_STATUSES.has(value.status) && uniqueStableIds(value.attended_channels) && value.attended_channels.every((channel) => SIGNAL_CHANNELS.has(channel)); }
function validateRecognition(value) { return exactKeys(value, RECOGNITION_KEYS) && sealedRecord(value) && entityRef(value.recognition_state_ref) && RECOGNITION_OUTCOMES.has(value.outcome); }
function perceptionEvidence(value) { return exactKeys(value, PERCEPTION_EVIDENCE_KEYS) && sealedRecord(value) && stableId(value.perception_id) && typeof value.input_digest === 'string' && typeof value.perception_digest === 'string'; }
function pathAllowsChannel(propagation, channel) { return propagation.edges.every((edge) => edge.permitted_channels.includes(channel)); }
function recognitionResult(outcome) { if (outcome === 'partial') return 'perceived_partial'; if (outcome === 'unidentified') return 'perceived_unidentified'; return outcome; }
function capVisualRecognition(result, lightStateId, cap) { return lightStateId !== 'dark' || result !== 'recognized' ? result : cap; }

export function proposeNpcPerception({ perception_input: value } = {}) {
  const required = ['perception_id', 'perceiver_ref', 'event_ref', 'perceived_at', 'target_scope_ref', 'factual_signal', 'propagation_snapshot', 'environment_snapshot', 'attention_snapshot', 'recognition_snapshot', 'perception_profile', 'known_fact_refs', 'knowledge_update_refs', 'dependency_pins'];
  const allowed = [...required, 'persisted_perception', 'persisted_perception_evidence'];
  if (!allowedKeys(value, allowed, required) || !stableId(value.perception_id) || !entityRef(value.perceiver_ref, 'npc') || !entityRef(value.event_ref) || !entityRef(value.target_scope_ref) || normalizeTimestamp(value.perceived_at) === null || !validateSignal(value.factual_signal) || !validatePropagation(value.propagation_snapshot) || !validateEnvironment(value.environment_snapshot) || !validateAttention(value.attention_snapshot) || !validateRecognition(value.recognition_snapshot) || !validatePerceptionProfile(value.perception_profile, value.dependency_pins) || !uniqueEntityRefs(value.known_fact_refs) || !uniqueEntityRefs(value.knowledge_update_refs)) return blocked('perception_policy_gap', 'Perception requires sealed topology, attention, recognition, policy and pin snapshots', value?.perceiver_ref, value?.dependency_pins);
  if (value.known_fact_refs.length > NPC_RUNTIME_RESOURCE_LIMITS.max_known_fact_refs || value.knowledge_update_refs.length > NPC_RUNTIME_RESOURCE_LIMITS.max_known_fact_refs) return blocked('temporal_execution_unbounded', 'Perception knowledge input exceeded its explicit resource cap', value.perceiver_ref, value.dependency_pins);
  if (!sameRef(value.factual_signal.source_scope_ref, value.propagation_snapshot.source_scope_ref) || !sameRef(value.target_scope_ref, value.propagation_snapshot.target_scope_ref)) return blocked('perception_policy_gap', 'Signal and propagation path endpoints disagree', value.perceiver_ref, value.dependency_pins);
  const channel = value.factual_signal.channel;
  const reaches = pathAllowsChannel(value.propagation_snapshot, channel);
  const awakeOrAllowedSleeping = value.attention_snapshot.status === 'awake' || value.perception_profile.sleeping_attention_channels.includes(channel);
  const attends = awakeOrAllowedSleeping && value.attention_snapshot.attended_channels.includes(channel);
  let result = 'not_perceived';
  if (reaches && attends) result = capVisualRecognition(recognitionResult(value.recognition_snapshot.outcome), channel === 'visual' ? value.environment_snapshot.light_state_id : 'bright', value.perception_profile.darkness_visual_result_cap);
  if (!PERCEPTION_RESULTS.has(result)) return blocked('perception_policy_gap', 'Recognition policy produced an unregistered perception result', value.perceiver_ref, value.dependency_pins);
  const perceivedAt = normalizeTimestamp(value.perceived_at);
  const inputDigest = digest({ perception_id: value.perception_id, perceiver_ref: value.perceiver_ref, event_ref: value.event_ref, perceived_at: perceivedAt, target_scope_ref: value.target_scope_ref, factual_signal_digest: value.factual_signal.canonical_digest, propagation_snapshot_digest: value.propagation_snapshot.canonical_digest, environment_snapshot_digest: value.environment_snapshot.canonical_digest, attention_snapshot_digest: value.attention_snapshot.canonical_digest, recognition_snapshot_digest: value.recognition_snapshot.canonical_digest, perception_profile_digest: value.perception_profile.canonical_digest, known_fact_refs: [...value.known_fact_refs].sort((left, right) => refKey(left).localeCompare(refKey(right), 'en')), knowledge_update_refs: [...value.knowledge_update_refs].sort((left, right) => refKey(left).localeCompare(refKey(right), 'en')), dependency_pins_digest: value.dependency_pins.canonical_digest });
  const payload = { perception_id: value.perception_id, perceiver_ref: value.perceiver_ref, event_ref: value.event_ref, perceived_at: perceivedAt, result, recognition_policy_ref: value.perception_profile.recognition_policy_ref, visibility_policy_ref: value.perception_profile.visibility_policy_ref, signal_refs: [value.factual_signal.signal_ref], knowledge_update_refs: result === 'not_perceived' ? [] : value.knowledge_update_refs };
  const perception = freeze({ ...payload, canonical_digest: digest(payload) });
  if (!formal('perception_result', perception)) return blocked('generated_schema_mismatch', 'Perception owner produced a non-formal result', value.perceiver_ref, value.dependency_pins);
  const evidencePayload = { perception_id: value.perception_id, input_digest: inputDigest, perception_digest: perception.canonical_digest };
  const evidence = freeze({ ...evidencePayload, canonical_digest: digest(evidencePayload) });
  if (value.persisted_perception !== undefined || value.persisted_perception_evidence !== undefined) {
    if (!formal('perception_result', value.persisted_perception) || !perceptionEvidence(value.persisted_perception_evidence) || value.persisted_perception.perception_id !== value.perception_id || value.persisted_perception_evidence.perception_id !== value.perception_id) return blocked('temporal_change_set_conflict', 'Persisted perception replay material is incomplete or belongs to another identity', value.perceiver_ref, value.dependency_pins);
    if (value.persisted_perception_evidence.input_digest !== inputDigest || value.persisted_perception_evidence.perception_digest !== value.persisted_perception.canonical_digest || value.persisted_perception.canonical_digest !== perception.canonical_digest) return blocked('idempotency_conflict', 'Persisted perception conflicts with current causal input', value.perceiver_ref, value.dependency_pins);
    return success({ perception: value.persisted_perception, perception_evidence: value.persisted_perception_evidence, replay_status: 'already_committed', trace: { owner: NPC_RUNTIME_OWNER, input_digest: inputDigest, signal_reached: reaches, attended: attends } });
  }
  return success({ perception, perception_evidence: evidence, replay_status: 'new', trace: { owner: NPC_RUNTIME_OWNER, input_digest: inputDigest, signal_reached: reaches, attended: attends } });
}
