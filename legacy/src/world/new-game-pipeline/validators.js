function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export const DEFAULT_STAT_POLICY = Object.freeze({
  attributes_range: [3, 18],
  normal_human_range: [8, 13],
  abnormal_requires_justification_below: 6,
  exceptional_requires_justification_above: 15
});

export function validateNumericStatPolicy(subject = {}, {
  path = 'root.attributes',
  keys = null,
  policy = DEFAULT_STAT_POLICY,
  justificationPaths = []
} = {}) {
  const concerns = [];
  if (!isPlainObject(subject)) {
    return [{ code: 'NUMERIC_POLICY_SUBJECT_NOT_OBJECT', message: `${path}: expected object`, field: path }];
  }

  const range = Array.isArray(policy?.attributes_range) ? policy.attributes_range : DEFAULT_STAT_POLICY.attributes_range;
  const below = Number(policy?.abnormal_requires_justification_below ?? DEFAULT_STAT_POLICY.abnormal_requires_justification_below);
  const above = Number(policy?.exceptional_requires_justification_above ?? DEFAULT_STAT_POLICY.exceptional_requires_justification_above);
  const targetKeys = Array.isArray(keys) && keys.length > 0 ? keys : Object.keys(subject);
  const justifications = collectJustifications(subject, justificationPaths);

  for (const key of targetKeys) {
    const value = subject?.[key];
    const numeric = Number(value);
    const field = `${path}.${key}`;
    if (!Number.isFinite(numeric)) {
      concerns.push({ code: 'NUMERIC_POLICY_NOT_NUMBER', message: `${field}: expected number`, field });
      continue;
    }
    if (numeric < range[0] || numeric > range[1]) {
      concerns.push({
        code: 'NUMERIC_POLICY_OUT_OF_RANGE',
        message: `${field}: expected ${range[0]}-${range[1]}, got ${numeric}`,
        field
      });
    }
    if ((numeric < below || numeric > above) && !justifications.has(key)) {
      concerns.push({
        code: 'NUMERIC_POLICY_JUSTIFICATION_REQUIRED',
        message: `${field}: abnormal value ${numeric} requires semantic justification`,
        field
      });
    }
  }

  return concerns;
}

export function validateVisibleHiddenBoundary(value, {
  visiblePaths = [],
  path = 'root'
} = {}) {
  const concerns = [];
  const forbiddenTerms = [
    'подозр',
    'опасн',
    'лж',
    'замышл',
    'скрыва',
    'скроет',
    'скрыт',
    'на самом деле',
    'по слухам правда',
    'слух оказался правдой',
    'знает, что будет',
    'боится, что его раскроют',
    'скрывает нож',
    'готовит засаду'
  ];

  for (const visiblePath of visiblePaths) {
    const fieldValue = readPath(value, visiblePath);
    if (fieldValue == null) continue;
    const lines = flattenText(fieldValue);
    for (const line of lines) {
      const normalized = String(line).toLowerCase();
      if (forbiddenTerms.some((term) => normalized.includes(term))) {
        concerns.push({
          code: 'VISIBLE_HIDDEN_BOUNDARY_LEAK',
          message: `${path}.${visiblePath}: contains hidden or subjective information`,
          field: `${path}.${visiblePath}`
        });
        break;
      }
    }
  }

  return concerns;
}

export function validatePositionReferenceConsistency(value, {
  positionPaths = ['position', 'current_position'],
  requiredPaths = [],
  visibleActorPaths = [],
  visibleItemPaths = [],
  path = 'root'
} = {}) {
  const concerns = [];
  for (const positionPath of positionPaths) {
    const position = readPath(value, positionPath);
    if (position == null) continue;
    for (const key of ['region_id', 'place_id', 'location_id', 'minilocation_id', 'anchor_id']) {
      if (!text(position?.[key])) {
        concerns.push({
          code: 'POSITION_REFERENCE_MISSING',
          message: `${path}.${positionPath}.${key}: expected non-empty string`,
          field: `${path}.${positionPath}.${key}`
        });
      }
    }
  }

  for (const requiredPath of requiredPaths) {
    if (!text(readPath(value, requiredPath))) {
      concerns.push({
        code: 'REFERENCE_REQUIRED_MISSING',
        message: `${path}.${requiredPath}: expected non-empty string`,
        field: `${path}.${requiredPath}`
      });
    }
  }

  for (const actorPath of visibleActorPaths) {
    const actors = readPath(value, actorPath);
    if (!Array.isArray(actors)) continue;
    for (const [index, actor] of actors.entries()) {
      if (!isPlainObject(actor)) continue;
      const hasPlacement = text(actor.anchor_id) || text(actor.location_id) || text(actor.minilocation_id);
      const offscreenCue = text(actor.offscreen_sensory_cue) || text(actor.offscreenSensoryCue);
      if (!hasPlacement && !offscreenCue) {
        concerns.push({
          code: 'VISIBLE_ACTOR_WITHOUT_PLACEMENT',
          message: `${path}.${actorPath}[${index}]: visible actor requires placement or offscreen sensory cue`,
          field: `${path}.${actorPath}[${index}]`
        });
      }
    }
  }

  for (const itemPath of visibleItemPaths) {
    const items = readPath(value, itemPath);
    if (!Array.isArray(items)) continue;
    for (const [index, item] of items.entries()) {
      if (!isPlainObject(item)) continue;
      const anchored = text(item.holder_id) || text(item.container_id) || text(item.location_id) || text(item.anchor_id);
      if (!anchored) {
        concerns.push({
          code: 'VISIBLE_ITEM_WITHOUT_PLACEMENT',
          message: `${path}.${itemPath}[${index}]: visible item requires holder/container/location/anchor`,
          field: `${path}.${itemPath}[${index}]`
        });
      }
    }
  }

  return concerns;
}

export function diffForbiddenPathChanges(previousValue, nextValue, forbiddenPaths = []) {
  const changed = [];
  for (const path of forbiddenPaths) {
    const before = readPath(previousValue, path);
    const after = readPath(nextValue, path);
    if (!sameValue(before, after)) changed.push(path);
  }
  return changed;
}

export function flattenObjectPaths(value, currentPath = 'root') {
  if (Array.isArray(value)) {
    const paths = [currentPath];
    for (const [index, item] of value.entries()) {
      paths.push(...flattenObjectPaths(item, `${currentPath}[${index}]`));
    }
    return paths;
  }
  if (!isPlainObject(value)) return [currentPath];
  const paths = [currentPath];
  for (const [key, nested] of Object.entries(value)) {
    paths.push(...flattenObjectPaths(nested, `${currentPath}.${key}`));
  }
  return paths;
}

function collectJustifications(subject, justificationPaths) {
  const result = new Set();
  for (const path of justificationPaths) {
    const value = readPath(subject, path);
    if (isPlainObject(value)) {
      for (const [key, nested] of Object.entries(value)) {
        if (text(nested)) result.add(key);
      }
    }
  }
  return result;
}

function flattenText(value) {
  if (Array.isArray(value)) return value.flatMap((item) => flattenText(item));
  if (isPlainObject(value)) return Object.values(value).flatMap((item) => flattenText(item));
  if (typeof value === 'string') return [value];
  return [];
}

function readPath(value, path) {
  return String(path)
    .replace(/^root\./u, '')
    .split('.')
    .reduce((current, key) => current?.[key], value);
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}
