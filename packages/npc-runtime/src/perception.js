import { NPC_RUNTIME_OWNER, NPC_RUNTIME_RESOURCE_LIMITS } from './runtime-configuration.js';
import {
  blocked,
  dependencyPins,
  digest,
  formal,
  freeze,
  normalizeTimestamp,
  pinned,
  refKey,
  sealedRecord,
  success
} from './internal.js';

const PERCEPTION_RESULTS = new Set([
  'not_perceived',
  'perceived_unidentified',
  'perceived_partial',
  'recognized',
  'misinterpreted'
]);

const CONVERSATION_PERCEPTION_INPUT_KEYS = [
  'listener_ref',
  'perception_result_ref',
  'acoustic_path',
  'distance_band',
  'ambient_noise',
  'hearing_capability',
  'attention',
  'language_comprehension',
  'speaker_recognition'
];

const CONVERSATION_VISUAL_PERCEPTION_INPUT_KEYS = [
  'observer_ref',
  'perception_result_ref',
  'visual_path',
  'distance_band',
  'ambient_visibility',
  'visual_capability',
  'attention'
];

const orderedRefs = (values) => [...values].sort(
  (left, right) => refKey(left).localeCompare(refKey(right), 'en')
);

function sealedPerceptionRequest(value) {
  if (!formal('npc_perception_request', value)
    || value.perceiver_ref.entity_kind !== 'npc'
    || normalizeTimestamp(value.perceived_at) === null
    || !dependencyPins(value.dependency_pins)
    || !dependencyPins(value.environment_snapshot?.transient_modifier_dependency_pins)) {
    return false;
  }
  const snapshots = [
    value.factual_signal,
    value.propagation_snapshot,
    value.environment_snapshot,
    value.attention_snapshot,
    value.recognition_snapshot,
    value.perception_profile,
    ...value.propagation_snapshot.edges
  ];
  if (snapshots.some((snapshot) => !sealedRecord(snapshot))) return false;
  const profile = value.perception_profile;
  return pinned(value.dependency_pins, 'profile', profile.recognition_policy_ref)
    && pinned(value.dependency_pins, 'condition', profile.visibility_policy_ref)
    && (profile.acoustic_policy_ref == null
      || pinned(value.dependency_pins, 'condition', profile.acoustic_policy_ref))
    && pinned(value.dependency_pins, 'source_dependency', profile.provenance_ref);
}

function visualPathState(request) {
  const states = [
    request.environment_snapshot.weather_visibility_result,
    request.environment_snapshot.transient_visibility_result
  ];
  for (const edge of request.propagation_snapshot.edges) {
    if (!edge.permitted_channels.includes('visual')) return 'blocked';
    states.push(edge.visibility_quality === 'partial' ? 'partial' : 'clear');
    if (edge.visibility_portal_result) states.push(edge.visibility_portal_result);
    if (edge.resolved_condition_visibility) states.push(edge.resolved_condition_visibility);
  }
  if (states.includes('blocked')) return 'blocked';
  return states.includes('partial') ? 'partial' : 'clear';
}

function acousticPathState(request) {
  const losses = [
    request.environment_snapshot.weather_acoustic_loss,
    request.environment_snapshot.transient_acoustic_loss
  ];
  for (const edge of request.propagation_snapshot.edges) {
    if (!edge.permitted_channels.includes('acoustic')) return 'blocked';
    losses.push(String(edge.acoustic_base_loss));
    if (edge.acoustic_portal_extra_loss != null) losses.push(String(edge.acoustic_portal_extra_loss));
    if (edge.resolved_condition_acoustic_loss != null) losses.push(String(edge.resolved_condition_acoustic_loss));
  }
  if (losses.includes('blocked')) return 'blocked';
  return losses.some((loss) => loss !== '0') ? 'partial' : 'clear';
}

function recognitionResult(outcome) {
  if (outcome === 'partial') return 'perceived_partial';
  if (outcome === 'unidentified') return 'perceived_unidentified';
  return outcome;
}

function capResult(request, pathState, result) {
  if (pathState === 'blocked') return 'not_perceived';
  const channel = request.factual_signal.channel;
  const capability = channel === 'visual'
    ? request.attention_snapshot.visual_capability_level
    : request.attention_snapshot.acoustic_capability_level;
  if (capability === 0) return 'not_perceived';
  if (channel === 'visual'
    && request.environment_snapshot.light_state_id === 'dark'
    && result === 'recognized') {
    return request.perception_profile.darkness_visual_result_cap;
  }
  if (pathState === 'partial' && result === 'recognized') return 'perceived_partial';
  return result;
}

function knowledgeRefs(request, result) {
  const candidates = orderedRefs(request.candidate_knowledge_fact_refs ?? []);
  if (result === 'not_perceived') {
    return freeze({ fact_refs: [], hypothesis_refs: [] });
  }
  if (result === 'misinterpreted') {
    return freeze({ fact_refs: [], hypothesis_refs: candidates });
  }
  return freeze({ fact_refs: candidates, hypothesis_refs: [] });
}

function knowledgeProposal(request, perception, refs) {
  const payload = {
    proposal_id: `knowledge-delta:${request.perception_id}:${request.expected_state_versions.canonical_digest}`,
    owner_ref: request.perceiver_ref,
    source_kind: 'perception',
    source_ref: {
      entity_kind: 'perception_result',
      entity_id: request.perception_id
    },
    source_perception: perception,
    expected_state_versions: request.expected_state_versions,
    dependency_pins: request.dependency_pins,
    fact_refs: refs.fact_refs,
    hypothesis_refs: refs.hypothesis_refs
  };
  return freeze({ ...payload, canonical_digest: digest(payload) });
}

function policyVersionsDigest(request) {
  return digest({
    recognition_policy_ref: request.perception_profile.recognition_policy_ref,
    visibility_policy_ref: request.perception_profile.visibility_policy_ref,
    acoustic_policy_ref: request.perception_profile.acoustic_policy_ref ?? null,
    provenance_ref: request.perception_profile.provenance_ref
  });
}

function replayEvidence(request, perception) {
  const payload = {
    perception_id: request.perception_id,
    canonical_input_digest: request.canonical_input_digest,
    perception_digest: perception.canonical_digest,
    expected_state_versions_digest: digest(request.expected_state_versions),
    dependency_pins_digest: request.dependency_pins.canonical_digest,
    policy_versions_digest: policyVersionsDigest(request),
    idempotency_key: request.idempotency_key
  };
  return freeze({ ...payload, canonical_digest: digest(payload) });
}

function matchesReplay(request, perception, evidence) {
  if (!formal('perception_result', perception)
    || !formal('perception_replay_evidence', evidence)
    || !sealedRecord(evidence)
    || perception.perception_id !== request.perception_id
    || evidence.perception_id !== request.perception_id
    || evidence.canonical_input_digest !== request.canonical_input_digest
    || evidence.perception_digest !== perception.canonical_digest
    || evidence.expected_state_versions_digest !== digest(request.expected_state_versions)
    || evidence.dependency_pins_digest !== request.dependency_pins.canonical_digest
    || evidence.policy_versions_digest !== policyVersionsDigest(request)
    || evidence.idempotency_key !== request.idempotency_key) {
    return false;
  }
  return true;
}

export function proposeNpcPerception({
  request,
  persisted_perception = null,
  persisted_replay_evidence = null
} = {}) {
  if (!sealedPerceptionRequest(request)) {
    return blocked(
      'perception_policy_gap',
      'Perception requires one complete formal sealed request with approved policy pins',
      request?.perceiver_ref,
      request?.dependency_pins
    );
  }
  if ((request.known_fact_refs?.length ?? 0) > NPC_RUNTIME_RESOURCE_LIMITS.max_known_fact_refs
    || (request.candidate_knowledge_fact_refs?.length ?? 0) > NPC_RUNTIME_RESOURCE_LIMITS.max_known_fact_refs) {
    return blocked(
      'temporal_execution_unbounded',
      'Perception knowledge input exceeded its explicit resource cap',
      request.perceiver_ref,
      request.dependency_pins
    );
  }

  const channel = request.factual_signal.channel;
  const pathState = channel === 'visual'
    ? visualPathState(request)
    : acousticPathState(request);
  const attention = request.attention_snapshot;
  const attentionPermits = attention.attended_channels.includes(channel)
    && (attention.status === 'awake'
      || request.perception_profile.sleeping_attention_channels.includes(channel));
  const rawRecognition = recognitionResult(request.recognition_snapshot.outcome);
  const result = attentionPermits
    ? capResult(request, pathState, rawRecognition)
    : 'not_perceived';
  if (!PERCEPTION_RESULTS.has(result)) {
    return blocked(
      'perception_policy_gap',
      'Approved perception policy produced an unknown result',
      request.perceiver_ref,
      request.dependency_pins
    );
  }

  const knowledge = knowledgeRefs(request, result);
  const payload = {
    perception_id: request.perception_id,
    perceiver_ref: request.perceiver_ref,
    event_ref: request.event_ref,
    perceived_at: normalizeTimestamp(request.perceived_at),
    result,
    recognition_policy_ref: request.perception_profile.recognition_policy_ref,
    visibility_policy_ref: request.perception_profile.visibility_policy_ref,
    signal_refs: [request.factual_signal.signal_ref],
    knowledge_update_refs: [...knowledge.fact_refs, ...knowledge.hypothesis_refs]
  };
  const perception = freeze({ ...payload, canonical_digest: digest(payload) });
  if (!formal('perception_result', perception)) {
    return blocked(
      'generated_schema_mismatch',
      'NPC runtime produced a non-formal perception result',
      request.perceiver_ref,
      request.dependency_pins
    );
  }
  const proposal = knowledgeProposal(request, perception, knowledge);
  if (!formal('knowledge_memory_delta_proposal', proposal)) {
    return blocked(
      'generated_schema_mismatch',
      'NPC runtime produced a non-formal knowledge delta proposal',
      request.perceiver_ref,
      request.dependency_pins
    );
  }
  const evidence = replayEvidence(request, perception);
  if (!formal('perception_replay_evidence', evidence)) {
    return blocked(
      'generated_schema_mismatch',
      'NPC runtime produced non-formal replay evidence',
      request.perceiver_ref,
      request.dependency_pins
    );
  }

  const suppliedReplay = persisted_perception !== null || persisted_replay_evidence !== null;
  if (suppliedReplay) {
    if (!matchesReplay(request, persisted_perception, persisted_replay_evidence)) {
      return blocked(
        'idempotency_conflict',
        'Persisted perception does not match the full sealed request identity',
        request.perceiver_ref,
        request.dependency_pins
      );
    }
    if (persisted_perception.canonical_digest !== perception.canonical_digest) {
      return blocked(
        'idempotency_conflict',
        'Persisted perception conflicts with the deterministic current result',
        request.perceiver_ref,
        request.dependency_pins
      );
    }
    return success({
      perception: persisted_perception,
      perception_evidence: persisted_replay_evidence,
      knowledge_proposal: proposal,
      replay_status: 'already_committed',
      trace: {
        owner: NPC_RUNTIME_OWNER,
        canonical_input_digest: request.canonical_input_digest,
        path_state: pathState,
        attended: attentionPermits
      }
    });
  }

  return success({
    perception,
    perception_evidence: evidence,
    knowledge_proposal: proposal,
    replay_status: 'new',
    trace: {
      owner: NPC_RUNTIME_OWNER,
      canonical_input_digest: request.canonical_input_digest,
      path_state: pathState,
      attended: attentionPermits
    }
  });
}

export function resolveConversationListenerPerception(input = {}) {
  if (!plainRecord(input)
      || Object.keys(input).length !== CONVERSATION_PERCEPTION_INPUT_KEYS.length
      || CONVERSATION_PERCEPTION_INPUT_KEYS.some(
        (key) => !Object.hasOwn(input, key)
      )
      || !exactConversationRef(
        input.listener_ref,
        input.listener_ref?.entity_kind
      )
      || !['npc', 'player_character'].includes(input.listener_ref.entity_kind)
      || !exactConversationRef(
        input.perception_result_ref,
        'perception_result'
      )
      || !['clear', 'degraded', 'blocked'].includes(input.acoustic_path)
      || !['conversation', 'nearby', 'distant'].includes(input.distance_band)
      || !['quiet', 'ordinary', 'loud', 'overwhelming']
        .includes(input.ambient_noise)
      || !['full', 'partial', 'none'].includes(input.hearing_capability)
      || !['available', 'distracted', 'unavailable'].includes(input.attention)
      || !['full', 'partial', 'none'].includes(input.language_comprehension)
      || !['recognized', 'unidentified', 'misinterpreted']
        .includes(input.speaker_recognition)) {
    throw Object.assign(new TypeError(
      'Conversation listener perception requires one exact factual snapshot.'
    ), { code: 'CONVERSATION_PERCEPTION_INPUT_INVALID' });
  }

  const unheard = input.acoustic_path === 'blocked'
    || input.distance_band === 'distant'
    || input.ambient_noise === 'overwhelming'
    || input.hearing_capability === 'none'
    || input.attention === 'unavailable';
  if (unheard) {
    return conversationPerceptionResult(
      input,
      'not_perceived',
      'none',
      false
    );
  }

  const degraded = input.acoustic_path === 'degraded'
    || input.distance_band === 'nearby'
    || input.ambient_noise === 'loud'
    || input.hearing_capability === 'partial'
    || input.attention === 'distracted';
  const comprehension = input.language_comprehension === 'none'
    ? 'none'
    : degraded || input.language_comprehension === 'partial'
      ? 'partial'
      : 'full';
  const perception = input.speaker_recognition === 'misinterpreted'
    ? 'misinterpreted'
    : degraded
      ? 'perceived_partial'
      : input.speaker_recognition === 'unidentified'
        ? 'perceived_unidentified'
        : 'recognized';
  const speakerRecognized = input.speaker_recognition === 'recognized';
  return conversationPerceptionResult(
    input,
    perception,
    comprehension,
    speakerRecognized
  );
}

export function resolveConversationVisualPerception(input = {}) {
  if (!plainRecord(input)
      || Object.keys(input).length
        !== CONVERSATION_VISUAL_PERCEPTION_INPUT_KEYS.length
      || CONVERSATION_VISUAL_PERCEPTION_INPUT_KEYS.some(
        (key) => !Object.hasOwn(input, key)
      )
      || !exactConversationRef(input.observer_ref, 'npc')
      || !exactConversationRef(
        input.perception_result_ref,
        'perception_result'
      )
      || !['clear', 'degraded', 'blocked'].includes(input.visual_path)
      || !['conversation', 'nearby', 'distant'].includes(input.distance_band)
      || !['clear', 'degraded', 'blocked']
        .includes(input.ambient_visibility)
      || !['full', 'partial', 'none'].includes(input.visual_capability)
      || !['available', 'distracted', 'unavailable'].includes(input.attention)) {
    throw Object.assign(new TypeError(
      'Conversation visual perception requires one exact factual snapshot.'
    ), { code: 'CONVERSATION_VISUAL_PERCEPTION_INPUT_INVALID' });
  }

  const notPerceived = input.visual_path === 'blocked'
    || input.distance_band === 'distant'
    || input.ambient_visibility === 'blocked'
    || input.visual_capability === 'none'
    || input.attention === 'unavailable';
  const partial = !notPerceived && (
    input.visual_path === 'degraded'
      || input.distance_band === 'nearby'
      || input.ambient_visibility === 'degraded'
      || input.visual_capability === 'partial'
      || input.attention === 'distracted'
  );
  return freeze({
    observer_ref: structuredClone(input.observer_ref),
    perception_result_ref: structuredClone(input.perception_result_ref),
    perception_result: notPerceived
      ? 'not_perceived'
      : partial ? 'perceived_partial' : 'recognized'
  });
}

function plainRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactConversationRef(value, kind) {
  return plainRecord(value)
    && Object.keys(value).length === 2
    && value.entity_kind === kind
    && typeof value.entity_id === 'string'
    && value.entity_id.trim() === value.entity_id
    && value.entity_id.length > 0;
}

function conversationPerceptionResult(
  input,
  perceptionResult,
  comprehension,
  speakerRecognized
) {
  return freeze({
    listener_ref: structuredClone(input.listener_ref),
    perception_result_ref: structuredClone(input.perception_result_ref),
    perception_result: perceptionResult,
    comprehension,
    speaker_recognized: speakerRecognized
  });
}
