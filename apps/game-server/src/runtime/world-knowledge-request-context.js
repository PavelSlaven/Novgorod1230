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
    const text = ordinaryMaterializationText(request);
    if (text) return text;
  }
  for (const value of [request.remaining_intent, request.root_player_action,
    request.utterance_text, request.semantic_input, request.reason]) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  if (request.schema === 'rus.s1_spatial_semantic_model_request.v1') {
    const text = spatialSemanticText(request);
    if (text) return text;
  }
  if (request.schema === 'npc_ordinary_semantic_remainder_request_v1') {
    const text = npcOrdinaryText(request);
    if (text) return text;
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

function ordinaryMaterializationText(request) {
  const candidate = request.authority_envelope?.candidate;
  const parts = [
    request.mode,
    request.candidate_query?.candidate_hint,
    candidate?.semantic_type,
    candidate?.functional_bucket,
    candidate?.admission_class,
    candidate?.availability_class,
    candidate?.coverage_kind,
    ...(request.policy_refs?.allowed_admission_classes ?? []),
    request.ordinary_state?.density_band
  ];
  return parts.filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim()).join(' ').trim();
}

function spatialSemanticText(request) {
  const context = request.semantic_context ?? {};
  const envelope = request.approved_envelope ?? {};
  const parts = [
    context.allowed_kind, context.period, context.region, context.place_type,
    context.environment, context.material_culture, context.ordinary_boundary,
    envelope.kind, envelope.structural_variant
  ];
  return parts.filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim()).join(' ').trim();
}

function npcOrdinaryText(request) {
  const context = request.observable_context ?? {};
  const parts = [];
  if (typeof context.display_label === 'string' && context.display_label.trim()) {
    parts.push(context.display_label.trim());
  }
  if (Array.isArray(context.scene_details)) {
    collectTextLeaves(context.scene_details, parts);
  }
  // Production cues nest identity/appearance/equipment objects; take text leaves.
  collectTextLeaves(context.observable_cues, parts);
  return parts.join(' ').trim();
}

function collectTextLeaves(value, out) {
  if (typeof value === 'string') {
    const text = value.trim();
    if (text) out.push(text);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectTextLeaves(entry, out);
    return;
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) collectTextLeaves(entry, out);
  }
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
