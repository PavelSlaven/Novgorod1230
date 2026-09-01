import {
  assertAllowedKeys,
  compact,
  finite,
  physicalFactRecords,
  plain,
  projectionError,
  scalarRecord,
  text,
  textArray
} from './lower-dvina-trace-player-safe-json.js';
import {
  ACTOR_ITEM_PHYSICAL_POSITIONS,
  runtimeItemContentsAreOpen as contentsAreOpen,
  runtimeItemRecordIsConcealed as recordIsClosed,
  runtimeItemStateValues as stateValues
} from '@rus/items-property';
const INVENTORY_KEYS = new Set([
  'items', 'total_weight', 'load_category', 'occupied_hands'
]);
const ITEM_KEYS = new Set([
  'item_id', 'instance_id', 'template_id', 'profile_id', 'category_id',
  'name', 'semantic_type', 'quantity', 'quantity_unit_id', 'condition_state', 'legal_status',
  'physical_facts', 'physical_fact_records', 'physical_inscriptions',
  'claim_state', 'placement', 'ownership', 'access_state',
  'visibility_state', 'open_state', 'closure_state', 'contents_state',
  'contents', 'state', 'visible', 'is_visible'
]);
const ITEM_CONDITION_KEYS = new Set([
  'id', 'state', 'status', 'label', 'severity', 'effect'
]);
const PROPERTY_STATE_KEYS = new Set([
  'owner_ref', 'holder_ref', 'controller_ref', 'accessibility',
  'claim_state', 'legal_status', 'state', 'status'
]);
const USE_STATE_KEYS = new Set([
  'id', 'state', 'status', 'kind', 'remaining', 'uses_remaining'
]);
export function projectInventory(value, { strict = false,
  allowedItemIds = null } = {}) {
  if (!plain(value)) return undefined;
  if (strict) {
    assertAllowedKeys(value, INVENTORY_KEYS, 'inventory', invalidCode());
  }
  return compact({
    items: Array.isArray(value.items)
      ? value.items.filter((item) => {
        const itemRef = inventoryItemRef(item);
        return allowedItemIds == null || itemRef != null
          && allowedItemIds.has(itemRef);
      })
        .map((item) => projectInventoryItem(item, strict))
        .filter((item) => item !== undefined)
      : undefined,
    total_weight: projectWeight(value.total_weight, strict),
    load_category: text(value.load_category),
    occupied_hands: finite(value.occupied_hands)
  });
}
export function playerSafeItemIds(items) {
  return new Set((items ?? []).map((item) => item?.item_id)
    .filter((itemId) => typeof itemId === 'string' && itemId.length > 0));
}
export function projectItems(records, { actorId, position, visibleNpcIds,
  strict = false } = {}) {
  if (!Array.isArray(records)) return undefined;
  const byId = new Map(records.filter(plain).map((item) => [
    item.item_id ?? item.instance_id, item
  ]).filter(([id]) => typeof id === 'string' && id.length > 0));
  if (strict) assertNoPlacementCycles(records, byId);
  return records.filter((item) => strict
    ? itemIsStructurallyVisible(item, byId, new Set())
    : itemIsPlayerSafe(item, actorId, position, byId, new Set(),
      visibleNpcIds))
    .map((item) => projectItem(item, strict));
}
function itemIsStructurallyVisible(item, byId, ancestors) {
  if (!plain(item) || recordIsClosed(item)) return false;
  const itemId = item.item_id ?? item.instance_id;
  if (typeof itemId === 'string' && ancestors.has(itemId)) return false;
  const placement = plain(item.placement) ? item.placement : item;
  const containerId = placement.container_id ?? item.container_id;
  const attachedItemId = placement.attached_item_id ?? item.attached_item_id;
  const hostId = containerId ?? attachedItemId;
  if (hostId == null) return true;
  const host = byId.get(hostId);
  if (!plain(host) || containerId != null && !contentsAreOpen(host)) return false;
  const nextAncestors = new Set(ancestors);
  if (typeof itemId === 'string') nextAncestors.add(itemId);
  return itemIsStructurallyVisible(host, byId, nextAncestors);
}
function projectInventoryItem(value, strict) {
  if (typeof value === 'string') return value;
  if (!plain(value)) return undefined;
  const allowed = new Set([
    'item_id', 'instance_id', 'name', 'owner', 'holder', 'access',
    'carry_location', 'weight', 'condition', 'risk', 'use'
  ]);
  if (strict) {
    assertAllowedKeys(value, allowed, 'inventory.items[]', invalidCode());
  }
  return compact({
    item_id: text(value.item_id ?? value.instance_id),
    name: text(value.name), owner: text(value.owner), holder: text(value.holder),
    access: text(value.access), carry_location: text(value.carry_location),
    weight: projectWeight(value.weight, strict), condition: text(value.condition),
    risk: textArray(value.risk), use: text(value.use)
  });
}
function inventoryItemRef(value) {
  return typeof value === 'string'
    ? value
    : plain(value) ? value.item_id ?? value.instance_id : undefined;
}
function projectWeight(value, strict) {
  if (!plain(value)) return undefined;
  if (strict) {
    assertAllowedKeys(value, new Set(['grams']), 'weight', invalidCode());
  }
  return compact({ grams: finite(value.grams) });
}
function itemIsPlayerSafe(item, actorId, position, byId, ancestors,
  visibleNpcIds) {
  if (!plain(item) || recordIsClosed(item)) return false;
  const itemId = item.item_id ?? item.instance_id;
  if (typeof itemId === 'string' && ancestors.has(itemId)) return false;
  const placement = plain(item.placement) ? item.placement : item;
  const containerId = placement.container_id ?? item.container_id;
  if (containerId != null) {
    const container = byId.get(containerId);
    if (!plain(container) || !contentsAreOpen(container)) return false;
    const nextAncestors = new Set(ancestors);
    if (typeof itemId === 'string') nextAncestors.add(itemId);
    return itemIsPlayerSafe(container, actorId, position, byId, nextAncestors,
      visibleNpcIds);
  }
  const attachedItemId = placement.attached_item_id ?? item.attached_item_id;
  if (attachedItemId != null) {
    const host = byId.get(attachedItemId);
    if (!plain(host)) return false;
    const nextAncestors = new Set(ancestors);
    if (typeof itemId === 'string') nextAncestors.add(itemId);
    return itemIsPlayerSafe(host, actorId, position, byId, nextAncestors,
      visibleNpcIds);
  }
  const holder = placement.holder_character_id
    ?? placement.owner_character_id ?? item.holder_character_id
    ?? item.owner_character_id;
  if (holder === actorId) return true;
  const npcHolder = placement.holder_npc_id ?? item.holder_npc_id;
  if (visibleNpcIds?.has(npcHolder)
      && ACTOR_ITEM_PHYSICAL_POSITIONS.includes(
        placement.physical_position)) {
    return true;
  }
  const location = placement.location_ref ?? item.location_ref;
  const anchor = placement.g5_anchor_id ?? placement.anchor_id
    ?? item.g5_anchor_id ?? item.anchor_id;
  if (location != null || anchor != null) {
    return location != null && location === position?.location_ref
    || anchor != null && [position?.g5_anchor_id, position?.anchor_id]
      .includes(anchor);
  }
  return item.visible === true || item.is_visible === true
    || stateValues(item.visibility_state, item.state?.visibility_state)
      .some((state) =>
      ['visible', 'scene'].includes(state));
}
function projectItem(item, strict) {
  if (strict) assertAllowedKeys(item, ITEM_KEYS, 'items[]', invalidCode());
  return compact({
    item_id: text(item.item_id ?? item.instance_id),
    instance_id: text(item.instance_id), template_id: text(item.template_id),
    profile_id: text(item.profile_id), category_id: text(item.category_id),
    name: text(item.name ?? item.state?.display_name),
    semantic_type: text(item.semantic_type),
    physical_facts: projectPhysicalFacts(item, strict),
    physical_fact_records: physicalFactRecords(item.physical_fact_records
      ?? item.state?.ordinary_metadata?.semantic_facts?.map?.((fact) => ({
        fact_ref: fact?.fact_id, text: fact?.text })), { strict,
      path: 'items[].physical_fact_records[]', code: invalidCode() }),
    physical_inscriptions: physicalFactRecords(item.physical_inscriptions
      ?? item.state?.ordinary_metadata?.physical_inscriptions?.map?.((fact) =>
        ({ fact_ref: fact?.fact_id, text: fact?.text })), { strict,
      path: 'items[].physical_inscriptions[]', code: invalidCode() }),
    quantity: finite(item.quantity),
    quantity_unit_id: text(item.quantity_unit_id),
    condition_state: text(item.condition_state), legal_status: text(item.legal_status),
    claim_state: text(item.claim_state),
    placement: projectPlacement(item.placement, strict),
    ownership: projectReferenceState(item.ownership, strict, 'ownership'),
    access_state: projectReferenceState(item.access_state, strict, 'access_state'),
    visibility_state: projectReferenceState(item.visibility_state, strict,
      'visibility_state'),
    open_state: text(item.open_state), closure_state: text(item.closure_state),
    contents_state: text(item.contents_state),
    contents: contentsAreOpen(item) ? projectContents(item.contents, strict)
      : undefined,
    state: projectItemState(item.state, strict)
  });
}
function projectPhysicalFacts(item, strict) {
  const values = item.state?.ordinary_metadata?.semantic_facts;
  const facts = item.physical_facts ?? values?.map?.((fact) =>
    typeof fact === 'string' ? fact : fact?.text);
  const projected = textArray(facts, { strict, path: 'items[].physical_facts', code: invalidCode() });
  return projected?.length ? projected : undefined;
}
function projectPlacement(value, strict) {
  if (!plain(value)) return undefined;
  const allowed = new Set([
    'holder_character_id', 'holder_npc_id', 'owner_character_id',
    'physical_position', 'equipment_slot_category_id',
    'container_id', 'attached_item_id', 'location_ref', 'g5_node_id',
    'g5_anchor_id', 'anchor_id', 'zone_ref'
  ]);
  if (strict) assertAllowedKeys(value, allowed, 'placement', invalidCode());
  return compact(Object.fromEntries([...allowed].map((key) => [
    key, text(value[key])
  ])));
}
function projectReferenceState(value, strict, path) {
  if (typeof value === 'string') return value;
  if (!plain(value)) return undefined;
  const allowed = new Set(['state', 'status', 'access', 'visibility', 'owner_ref',
    'holder_ref', 'controller_ref', 'visible', 'is_visible',
    'visible_to_player_now']);
  if (strict) assertAllowedKeys(value, allowed, path, invalidCode());
  return compact(Object.fromEntries([...allowed].map((key) => [
    key, typeof value[key] === 'boolean' ? value[key] : text(value[key])
  ])));
}

function projectContents(value, strict) {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item) => plain(item) && !recordIsClosed(item))
    .map((item) => {
    const allowed = new Set([
      'item_id', 'instance_id', 'template_id', 'name', 'quantity',
      'visible', 'is_visible', 'visibility_state', 'access_state'
    ]);
    if (strict) assertAllowedKeys(item, allowed, 'contents[]', invalidCode());
    return compact({
      item_id: text(item.item_id ?? item.instance_id),
      template_id: text(item.template_id), name: text(item.name),
      quantity: finite(item.quantity)
    });
  }).filter(Boolean);
}

function projectItemState(value, strict) {
  if (!plain(value)) return undefined;
  const allowed = new Set([
    'semantic_category', 'display_name', 'evidence_ref', 'condition', 'condition_state',
    'property_state', 'accessibility', 'access_state', 'visibility_state',
    'use_state'
  ]);
  if (strict) assertAllowedKeys(value, allowed, 'item.state', invalidCode());
  const propertyState = scalarRecord(value.property_state, { strict,
    path: 'item.state.property_state', allowedKeys: PROPERTY_STATE_KEYS });
  return compact({
    semantic_category: text(value.semantic_category),
    display_name: text(value.display_name),
    evidence_ref: text(value.evidence_ref),
    condition: typeof value.condition === 'string' ? value.condition
      : scalarRecord(value.condition, { strict, path: 'item.state.condition',
          allowedKeys: ITEM_CONDITION_KEYS }),
    condition_state: text(value.condition_state),
    property_state: propertyState != null && Object.keys(propertyState).length
      ? propertyState : undefined,
    accessibility: text(value.accessibility),
    access_state: projectReferenceState(value.access_state, strict,
      'item.state.access_state'),
    visibility_state: projectReferenceState(value.visibility_state, strict,
      'item.state.visibility_state'),
    use_state: scalarRecord(value.use_state, { strict,
      path: 'item.state.use_state', allowedKeys: USE_STATE_KEYS })
  });
}

function assertNoPlacementCycles(records, byId) {
  for (const item of records) {
    const origin = item?.item_id ?? item?.instance_id;
    const seen = new Set();
    let current = origin;
    while (typeof current === 'string' && byId.has(current)) {
      if (seen.has(current)) {
        throw projectionError(invalidCode(),
          `items[] contains a placement cycle at ${current}.`);
      }
      seen.add(current);
      const record = byId.get(current);
      const placement = plain(record?.placement) ? record.placement : record;
      current = placement?.container_id ?? placement?.attached_item_id;
    }
  }
}

function invalidCode() {
  return 'TRACE_PLAYER_SAFE_WORKING_PROJECTION_INVALID';
}
