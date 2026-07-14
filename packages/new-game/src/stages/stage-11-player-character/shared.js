export function concern(code, message, extra = {}) { return { code, message, ...extra }; }

export function hasNullOccupationReason(output) {
  return hasAnyText(output, ['occupation_null_reason', 'why_occupation_is_null', 'occupation_reason'])
    || hasAnyText(output.social_status, ['occupation_null_reason', 'why_occupation_is_null'])
    || hasAnyText(output.selected_candidate_refs, ['occupation_null_reason', 'why_occupation_is_null']);
}

export function hasStartPlaceReason(output) {
  return hasAnyText(output.start_place_connection, ['reason', 'why_here', 'why_now', 'basis'])
    || hasAnyText(output, ['reason_for_start_place', 'why_here', 'why_now']);
}

export function hasImmediateNeed(output) {
  return hasAnyText(output.goals, ['immediate_need', 'need_now', 'current_need'])
    || hasAnyText(output, ['immediate_need']);
}

export function hasConsequenceOfInaction(output) {
  return hasAnyText(output.goals, ['consequence_of_inaction', 'inaction_consequence'])
    || hasAnyText(output.constraints_and_risks, ['consequence_of_inaction', 'inaction_consequence'])
    || hasAnyText(output, ['consequence_of_inaction']);
}

export function collectSocialRoleIds(root) {
  return collectCandidateIdsDeep(root, ['social_role_id', 'role_id', 'id', 'candidate_id'], (path) => /social|role|roles/u.test(path));
}

export function collectOccupationIds(root) {
  return collectCandidateIdsDeep(root, ['occupation_id', 'id', 'candidate_id'], (path) => /occupation|occupations|заняти/u.test(path));
}

export function collectItemProfileIds(root) {
  const direct = collectCandidateIdSet(root?.item_profile_candidates ?? []);
  if (direct.size > 0) return direct;
  return collectCandidateIdsDeep(root, ['item_profile_candidate_id', 'item_profile_id', 'profile_id', 'id', 'candidate_id'], (path) => /item_profile|item_profiles|item/u.test(path));
}

export function collectNpcCandidateIds(root) {
  const direct = collectCandidateIdSet(root?.npc_candidates ?? []);
  if (direct.size > 0) return direct;
  return collectCandidateIdsDeep(root, ['npc_candidate_id', 'npc_id', 'id', 'candidate_id'], (path) => /npc|candidate/u.test(path));
}

export function collectCandidateIdSet(value) {
  const ids = new Set();
  for (const item of collectArrayLike(value)) {
    const id = firstText(item?.id, item?.candidate_id, item?.item_profile_candidate_id, item?.container_profile_candidate_id, item?.property_rule_candidate_id, item?.npc_candidate_id, item?.social_role_id, item?.occupation_id);
    if (id) ids.add(id);
  }
  return ids;
}

export function collectCandidateIdsDeep(root, idKeys, pathPredicate = () => true) {
  const ids = new Set();
  walk(root, (value, path) => {
    if (!isPlainObject(value) || !pathPredicate(path)) return;
    for (const key of idKeys) {
      if (text(value[key])) ids.add(value[key]);
    }
  });
  return ids;
}

export function collectInventoryItems(inventory) {
  const items = [];
  walk(inventory, (value, path) => {
    if (!isPlainObject(value)) return;
    const meaningful = hasAny(value, ['item_profile_candidate_id', 'item_profile_id', 'profile_id', 'item_id', 'name', 'title', 'label'])
      && !/summary|total|load|occupied_hands|policy/u.test(path);
    if (meaningful) items.push({ ...value, __path: path });
  });
  return dedupeObjects(items);
}

export function collectRelationObjects(relations) {
  const relationObjects = [];
  walk(relations, (value, path) => {
    if (!isPlainObject(value)) return;
    const looksLikeRelation = hasAny(value, ['relation_mode', 'npc_candidate_id', 'npc_id', 'person_label', 'relationship', 'relation_type'])
      && !/summary|policy/u.test(path);
    if (looksLikeRelation) relationObjects.push({ ...value, __path: path });
  });
  return dedupeObjects(relationObjects);
}

export function collectSkillObjects(skills) {
  const out = [];
  walk(skills, (value, path) => {
    if (isPlainObject(value)) {
      const bonus = value.bonus ?? value.skill_bonus ?? value.value;
      if (bonus !== undefined && path !== 'root') {
        out.push({
          name: value.name ?? value.skill_id ?? path.split('.').at(-1),
          bonus,
          basis: value.basis ?? value.reason ?? value.biographical_basis ?? value.why,
          category: value.category ?? value.skill_group ?? '',
          path
        });
      }
    } else if (typeof value === 'number' && path !== 'root') {
      out.push({ name: path.split('.').at(-1), bonus: value, basis: readSiblingBasis(skills, path), category: '', path });
    }
  });
  return out;
}

export function extractNumericNamedValues(root, names = []) {
  const out = [];
  walk(root, (value, path) => {
    if (typeof value !== 'number') return;
    const lower = path.toLowerCase();
    if (names.some((name) => lower.endsWith(`.${name}`) || lower.includes(`.${name}.`) || lower.endsWith(String(name).toLowerCase()))) {
      out.push({ path, value });
    }
  });
  if (out.length === 0 && isPlainObject(root)) {
    for (const [key, value] of Object.entries(root)) {
      if (typeof value === 'number') out.push({ path: `attributes.${key}`, value });
      if (isPlainObject(value) && typeof value.value === 'number') out.push({ path: `attributes.${key}.value`, value: value.value });
    }
  }
  return out;
}

export function hasPropertyInventoryConfusion(output) {
  const inventoryText = JSON.stringify(output.inventory ?? {}).toLowerCase();
  return /not[_ -]?carried|не при персонаже|outside physical access|имущество вне доступа/u.test(inventoryText);
}

export function hasMilitaryOrHunterBasis(output) {
  const textValue = JSON.stringify({ origin: output.origin, social_status: output.social_status, skills: output.skills }).toLowerCase();
  return /warrior|military|guard|retainer|hunter|охот|воин|дружин|сторож|ратн/u.test(textValue);
}

export function isCombatSkill(skill) {
  const textValue = `${skill.name ?? ''} ${skill.category ?? ''}`.toLowerCase();
  return /combat|melee|ranged|bow|weapon|бой|ближ|дальн|оруж|лук|копь|меч/u.test(textValue);
}

export function readSiblingBasis(root, path) {
  const parentPath = path.split('.').slice(1, -1);
  let current = root;
  for (const key of parentPath) current = current?.[key];
  return current?.basis ?? current?.reason ?? null;
}

export function walk(value, visitor, path = 'root', seen = new Set()) {
  if (value && typeof value === 'object') {
    if (seen.has(value)) return;
    seen.add(value);
  }
  visitor(value, path);
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, visitor, `${path}[${index}]`, seen));
  } else if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (key === '__path') continue;
      walk(child, visitor, `${path}.${key}`, seen);
    }
  }
}

export function collectArrayLike(value) {
  if (Array.isArray(value)) return value;
  if (isPlainObject(value)) return Object.values(value).filter((item) => isPlainObject(item));
  return [];
}

export function dedupeObjects(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.__path ?? JSON.stringify(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function hasAny(object, keys) {
  if (!isPlainObject(object)) return false;
  return keys.some((key) => object[key] !== undefined && object[key] !== null && object[key] !== '');
}

export function hasAnyNested(object, keys) {
  let found = false;
  walk(object, (value, path) => {
    if (found) return;
    const last = path.split('.').at(-1)?.replace(/\[\d+\]$/u, '');
    if (keys.includes(last) && value !== undefined && value !== null && value !== '') found = true;
  });
  return found;
}

export function hasAnyNestedText(object, keys) {
  let found = false;
  walk(object, (value, path) => {
    if (found) return;
    const last = path.split('.').at(-1)?.replace(/\[\d+\]$/u, '');
    if (keys.includes(last) && text(value)) found = true;
    if (keys.includes(last) && isPlainObject(value) && Object.keys(value).length > 0) found = true;
  });
  return found;
}

export function hasAnyText(object, keys) {
  if (!isPlainObject(object)) return false;
  return keys.some((key) => text(object[key]) || (Array.isArray(object[key]) && object[key].some(text)));
}

export function firstText(...values) {
  for (const value of values) {
    if (text(value)) return String(value).trim();
  }
  return null;
}

export function text(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function nonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

export function emptyArray(value) {
  return Array.isArray(value) && value.length === 0;
}

export function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function inRange(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}
