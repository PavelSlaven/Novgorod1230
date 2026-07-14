import { FORBIDDEN_KEYS } from './constants.js';

export function readAllowedCandidateIds(input) {
  return input.start_candidate_set?.downstream_constraints?.must_choose_from_candidate_ids ?? [];
}

export function readAllowedTemplateLinkIds(input) {
  return input.candidate_place_template_set?.downstream_constraints?.must_choose_candidate_template_link_id
    ?? input.candidate_place_template_set?.downstream_constraints?.must_choose_from_candidate_template_link_ids
    ?? [];
}

export function allowedCandidates(input) {
  const allowed = new Set(readAllowedCandidateIds(input));
  return (input.start_candidate_set?.candidates ?? []).filter((item) => allowed.has(candidateIdOf(item)));
}

export function allowedCandidateLinks(input) {
  const candidates = new Map((input.start_candidate_set?.candidates ?? []).map((item) => [candidateIdOf(item), item]));
  const allowed = new Set(readAllowedTemplateLinkIds(input));
  return (input.candidate_place_template_set?.candidate_template_links ?? [])
    .filter((link) => allowed.has(linkIdOf(link)))
    .map((link) => ({ link, candidate: candidates.get(candidateIdOfLink(link)) }))
    .filter((item) => item.candidate);
}

export function candidateIdOf(candidate) {
  return candidate?.candidate_id ?? candidate?.start_candidate_id ?? candidate?.id ?? candidate?.selected_candidate_id ?? null;
}

export function linkIdOf(link) {
  return link?.candidate_place_template_link_id ?? link?.link_id ?? link?.id ?? link?.candidate_template_link_id ?? null;
}

export function candidateIdOfLink(link) {
  return link?.candidate_id ?? link?.start_candidate_id ?? link?.selected_candidate_id ?? null;
}

export function placeTemplateIdOfLink(link) {
  return link?.place_template_id ?? link?.selected_place_template_id ?? link?.template_id ?? null;
}

export function scaleOfCandidate(candidate) {
  return String(candidate?.scale_level ?? candidate?.selected_scale_level ?? candidate?.canonical_node?.scale_level ?? candidate?.node?.scale_level ?? '').toUpperCase();
}

export function knownCandidateNodeIds(candidate) {
  return new Set([
    candidate?.canonical_node?.node_id,
    candidate?.canonical_node?.id,
    candidate?.node?.node_id,
    candidate?.node?.id,
    candidate?.node_id,
    candidate?.graph_node_id,
    candidate?.start_node_id,
    candidate?.selected_node_id,
    candidate?.location_node_id,
    candidate?.g4_node_id,
    candidate?.g3_node_id,
    candidate?.g2_node_id,
    candidate?.g1_node_id
  ].filter(nonEmpty));
}

export function candidateChain(candidate, link) {
  const source = link?.node_chain ?? candidate?.node_chain ?? candidate?.parent_chain ?? {};
  return {
    g1_node_id: source.g1_node_id ?? candidate?.g1_node_id ?? null,
    g2_node_id: source.g2_node_id ?? candidate?.g2_node_id ?? null,
    g3_node_id: source.g3_node_id ?? candidate?.g3_node_id ?? null,
    g4_node_id: source.g4_node_id ?? candidate?.g4_node_id ?? null
  };
}

export function isG5Ready(value) {
  return value?.g5_ready === true || value?.is_g5_ready === true || value?.g5_readiness === 'ready' || value?.g5_status === 'ready';
}

export function hasNpcSupport(npcCandidateSet, placeTemplateId, linkId, candidateId) {
  return (npcCandidateSet?.npc_candidates ?? []).some((npc) => {
    const links = npc.allowed_candidate_place_template_link_ids ?? npc.allowed_place_template_link_ids ?? [];
    const places = npc.allowed_place_template_ids ?? [];
    const candidates = npc.allowed_start_candidate_ids ?? npc.start_candidate_ids ?? [];
    return links.includes(linkId) || places.includes(placeTemplateId) || candidates.includes(candidateId);
  });
}

export function hasItemSupport(itemCandidateSet, placeTemplateId, linkId) {
  return (itemCandidateSet?.item_profile_candidates ?? []).some((item) => {
    const links = item.allowed_candidate_place_template_link_ids ?? item.allowed_place_template_link_ids ?? [];
    const places = item.allowed_place_template_ids ?? [];
    return links.includes(linkId) || places.includes(placeTemplateId);
  });
}

export function findForbiddenPaths(value, path = '$', hits = []) {
  if (!value || typeof value !== 'object') return hits;
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenPaths(item, `${path}[${index}]`, hits));
    return hits;
  }
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    if (FORBIDDEN_KEYS.has(key)) hits.push(nextPath);
    findForbiddenPaths(nested, nextPath, hits);
  }
  return hits;
}

export function collectSourceIds(values) {
  const ids = new Set();
  const visit = (value) => {
    if (value == null) return;
    if (typeof value === 'string') {
      if (value.trim()) ids.add(value.trim());
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value === 'object') {
      for (const key of ['source_id', 'sourceId', 'id']) {
        if (typeof value[key] === 'string' && value[key].trim()) ids.add(value[key].trim());
      }
      if (value.source_ref?.id) ids.add(String(value.source_ref.id));
      if (value.source?.id) ids.add(String(value.source.id));
      for (const nestedKey of ['source_trace', 'sources', 'evidence']) visit(value[nestedKey]);
    }
  };
  for (const value of values) visit(value);
  return [...ids];
}

export function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function readPath(value, path) {
  return String(path).split('.').reduce((current, key) => current?.[key], value);
}

export function concern(code, message, extra = {}) {
  return { code, message, ...extra };
}
