const GENERIC_ITEM_LABEL = /^предмет\s*[,.;:]?$/iu;
const SERVICE_REFERENCE = /\b[a-z][a-z\d]*(?:_[a-z\d]+)+\b|\b[a-f\d]{24,}\b|[{}]/iu;

/** One committed item-name projection shared by scene and operation inventories. */
export function visibleItemName(item) {
  return safeLabel(item?.name)
    ?? safeLabel(item?.state?.display_name)
    ?? safeLabel(item?.state?.ordinary_metadata?.name);
}

/** Resolve a player-visible item name only from committed display data or its
 * pinned, approved template-label map. A missing name remains a typed gap. */
export function resolveVisibleItemLabel(item, itemLabels = {}) {
  const label = visibleItemName(item) ?? safeLabel(itemLabels?.[item?.template_id]);
  return label == null
    ? { kind: 'gap', code: 'player_safe_item_label_required' }
    : { kind: 'labeled', label };
}

export function isVisibleItemLabelGap(value) {
  return value?.kind === 'gap'
    && value.code === 'player_safe_item_label_required'
    && Object.keys(value).length === 2;
}

function safeLabel(value) {
  if (typeof value !== 'string') return null;
  const label = value.trim();
  return label.length > 0 && !GENERIC_ITEM_LABEL.test(label)
    && !SERVICE_REFERENCE.test(label) ? label : null;
}
