export function ref(entityKind, entityId) {
  return { entity_kind: entityKind, entity_id: entityId };
}

export function same(left, right) {
  try {
    return canonicalDigest(left) === canonicalDigest(right);
  } catch {
    return false;
  }
}

export function semanticFail(code) {
  throw Object.assign(
    new Error('The resolved Phase 4 semantic evidence is invalid.'),
    { code }
  );
}
