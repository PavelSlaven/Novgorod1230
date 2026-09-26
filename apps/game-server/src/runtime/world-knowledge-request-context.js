import { projectCalendar } from '@rus/time-events-history/calendar';
import { WorldKnowledgeError } from '@rus/world-knowledge';

export function localeOf(request, bundle) {
  const candidate = request.locale ?? request.input_locale
    ?? request.query_locale ?? 'ru';
  return bundle.manifest.supported_locales.includes(candidate)
    ? candidate : bundle.manifest.default_locale;
}
export function semanticInputOf(request) {
  if (request.schema === 'ordinary_materialization_request_v1') {
    const candidate = request.authority_envelope?.candidate;
    return JSON.stringify({ mode: request.mode,
      candidate_hint: request.candidate_query?.candidate_hint ?? null,
      evidence_weight: request.candidate_query?.evidence_weight ?? null,
      candidate: candidate == null ? null : {
        semantic_type: candidate.semantic_type,
        functional_bucket: candidate.functional_bucket,
        admission_class: candidate.admission_class,
        availability_class: candidate.availability_class,
        coverage_kind: candidate.coverage_kind },
      allowed_admission_classes: request.policy_refs?.allowed_admission_classes,
      density_band: request.ordinary_state?.density_band,
      remaining_identity_budget: request.ordinary_state?.remaining_identity_budget,
      max_new_entities: request.technical_limits?.max_new_entities });
  }
  for (const value of [request.remaining_intent, request.root_player_action,
    request.utterance_text, request.semantic_input, request.reason]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  if (request.schema === 'npc_action_decision_request_v1'
      || request.schema === 'npc_conversation_response_request_v1') {
    const text = npcSituationText(request);
    if (text) return text;
  }
  throw new WorldKnowledgeError('WORLD_KNOWLEDGE_SEMANTIC_INPUT_UNAVAILABLE',
    'World Knowledge semantic_input cannot be derived from request fields.', {
      schema: request?.schema ?? null
    });
}
export function focusInputOf(request, authoritative) {
  if (request.schema !== 'ordinary_materialization_request_v1') {
    return semanticInputOf(request);
  }
  const scene = authoritative?.semantic_context;
  return [request.candidate_query?.candidate_hint, scene?.visible_scene,
    ...(scene?.sensory_details ?? []), ...(scene?.visible_objects ?? [])]
    .filter(value => typeof value === 'string').join(' ');
}
export function situationSummaryOf(request, authoritative) {
  if (request.schema === 'ordinary_materialization_request_v1') {
    return JSON.stringify({ visible: authoritative?.semantic_context ?? null });
  }
  return JSON.stringify({ actor: request.player_safe_state?.actor_id
      ?? request.npc_ref ?? null,
    position: request.player_safe_state?.position
      ?? request.npc_safe_state?.position ?? null,
    visible: request.player_safe_state?.current_visible_context
      ?? request.npc_safe_state?.visible_context ?? null }).slice(0, 4000)
    || 'authoritative context supplied by server';
}

export function actorFacetsOf(request, authoritative) {
  const exactNpc = request?.schema === 'npc_action_decision_request_v1';
  const conversationNpc = request?.schema === 'npc_conversation_response_request_v1';
  if (exactNpc || conversationNpc) {
    const roleRef = request.npc?.social_role?.role_ref;
    return typeof roleRef === 'string' && roleRef
      ? { role_ref: roleRef } : {};
  }
  const source = request.npc_safe_state ?? request.player_safe_state ?? {};
  const result = {};
  for (const key of ['occupation_ref', 'role_ref', 'specialist_domain',
    'social_status', 'sex_category', 'age_category']) {
    const value = source[key] ?? source.identity?.[key];
    if (typeof value === 'string' && value) result[key] = value;
  }
  for (const key of ['occupation_ref', 'role_ref', 'specialist_domain',
    'social_status', 'sex_category', 'age_category']) {
    const value = authoritative?.actor_facets?.[key];
    if (typeof value === 'string' && value) result[key] = value;
  }
  return result;
}

export function authoritativeContextOf(request, authoritative, defaults) {
  const safe = request.npc_safe_state ?? request.player_safe_state ?? {};
  const timestamp = authoritative?.clock ?? safe.clock ?? request.requested_at
    ?? request.occurred_at;
  const explicitYear = authoritative?.year ?? request.historical_context?.year;
  const projectedYear = timestamp != null && defaults.calendarProfile != null
    ? Number(projectCalendar(timestamp, defaults.calendarProfile).year) : null;
  const year = Number.isInteger(explicitYear) ? explicitYear
    : Number.isInteger(projectedYear) ? projectedYear : defaults.year;
  const placeRefs = new Set(defaults.placeRefs);
  for (const ref of [
    ...(authoritative?.place_refs ?? []),
    ...positionRefs(safe.position),
    request.schema === 'npc_action_decision_request_v1'
      ? request.historical_context?.region : null,
    request.objective_context?.context_refs?.region_ref,
    request.objective_context?.scope_ref?.entity_id
  ]) if (typeof ref === 'string' && ref) placeRefs.add(ref);
  return { time: { year }, place_refs: [...placeRefs].sort(),
    actor_facets: actorFacetsOf(request, authoritative) };
}

function npcSituationText(request) {
  const parts = [];
  const changes = request.decision_reasons?.perceived_changes;
  if (Array.isArray(changes)) {
    for (const entry of changes) {
      if (typeof entry === 'string' && entry.trim()) parts.push(entry.trim());
    }
  }
  const perception = request.perception;
  if (perception && typeof perception === 'object') {
    for (const key of ['visible_scene', 'perceived_changes', 'heard', 'felt']) {
      const values = perception[key];
      if (!Array.isArray(values)) continue;
      for (const entry of values) {
        const text = typeof entry === 'string' ? entry
          : entry?.summary ?? entry?.text ?? entry?.runtime_text;
        if (typeof text === 'string' && text.trim()) parts.push(text.trim());
      }
    }
  }
  if (request.schema === 'npc_conversation_response_request_v1') {
    const history = request.public_conversation_history;
    if (Array.isArray(history)) {
      for (const entry of history) {
        const text = entry?.utterance_text
          ?? entry?.speech?.utterance_text
          ?? entry?.content;
        if (typeof text === 'string' && text.trim()) parts.push(text.trim());
      }
    }
  }
  return parts.join(' ').trim();
}

function positionRefs(position) {
  if (position == null || typeof position !== 'object') return [];
  return ['g4_id', 'g5_node_id', 'g5_anchor_id', 'anchor_id', 'location_ref',
    'zone_ref'].map((key) => position[key]).filter((ref) =>
    typeof ref === 'string' && ref);
}
