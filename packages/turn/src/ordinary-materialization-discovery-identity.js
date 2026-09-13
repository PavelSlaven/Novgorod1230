import { canonicalDigest } from '@rus/materialization';

export function candidateForDiscovery({ candidateContext, query, quantity }) {
  const { target_ref: targetRef, candidate_ref_namespace: namespace,
    ...candidate } = candidateContext;
  const normalized = normalizeQuery(query);
  const requestedQuantity = normalizeQuantity(quantity);
  if (normalized == null || typeof targetRef !== 'string' || !targetRef
      || typeof namespace !== 'string' || !namespace
      || requestedQuantity === undefined) return null;
  return { ...candidate, normalized_candidate_ref:
    `${namespace}:${canonicalDigest({
      domain: 'rus.ordinary.discovery.query_candidate.v2',
      target_ref: targetRef, normalized_query: normalized,
      requested_quantity: requestedQuantity
    }).slice(0, 32)}`, candidate_hint: normalized };
}

export function knownMaterializedItemName({ request, partyId, scopeRef,
  knownResolution }) {
  if (knownResolution?.resolution !== 'materialize') return null;
  const itemId = `ordinary_item_${canonicalDigest({ party_id: partyId,
    scope_ref: scopeRef, candidate_key: knownResolution.candidate_key,
    coverage_key: knownResolution.coverage_key,
    context_version: knownResolution.context_version }).slice(0, 24)}`;
  const item = (request?.request?.player_safe_state?.items ?? []).find(
    ({ item_id: id, instance_id: instanceId }) => (id ?? instanceId) === itemId);
  const required = request.operation?.quantity ?? null;
  const actual = item?.runtime_instance_mechanics_snapshot?.mechanics?.quantity
    ?? (Number.isSafeInteger(item?.quantity)
      && typeof item?.quantity_unit_id === 'string'
      ? { value: item.quantity, unit: item.quantity_unit_id } : null);
  if (required != null && (actual?.value !== required.value
      || actual?.unit !== required.unit)) return null;
  const name = item?.name ?? item?.state?.display_name;
  return typeof name === 'string' && name.trim() ? name : null;
}

function normalizeQuery(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.normalize('NFKC').trim().replace(/\s+/gu, ' ')
    .toLocaleLowerCase('ru-RU');
  return normalized.length === 0 ? null : normalized;
}
function normalizeQuantity(value) {
  if (value === null) return null;
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === 2
    && Number.isSafeInteger(value.value) && value.value >= 1 && value.value <= 16
    && value.unit === 'item'
    ? { value: value.value, unit: value.unit } : undefined;
}
