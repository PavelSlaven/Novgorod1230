const supportedGuard = /^Only the named actors materialized from ([a-z0-9_.:-]+) and ([a-z0-9_.:-]+) at ([a-z0-9_.:-]+); other role holders are not ([a-z_]+)\.$/u;

/** Resolve only explicit D-2 slot facts whose approved rule has a supported exact guard. */
export function materializeNpcRelationshipRules({ rules = [], compositions = [], npcs = [] } = {}) {
  const output = npcs.map((npc) => structuredClone(npc));
  const relations = new Map();
  for (const rule of rules) {
    if (rule?.status !== 'approved' || !positiveVersion(rule.rule_version)
        || rule.scope_kind !== 'role_pair' || rule.scope_ref !== ''
        || !['symmetric', 'directed'].includes(rule.direction)
        || !text(rule.subject_role_ref) || !text(rule.object_role_ref)
        || !text(rule.relationship_kind)) continue;
    const guard = supportedGuard.exec(rule.materialization_guard ?? '');
    const guardKind = rule.relationship_kind === 'spouse' ? 'spouses' : rule.relationship_kind;
    if (!guard || guard[4] !== guardKind) continue;
    const [, fromGroup, toGroup, placeFamilyId] = guard;
    for (const composition of compositions) {
      const ref = composition?.composition_ref;
      if (composition?.place_family_id !== placeFamilyId
          || !text(ref?.id) || !positiveVersion(ref?.version)
          || ref.world_revision_id !== rule.world_revision_id
          || !Array.isArray(composition.slot_relationships)) continue;
      const sourceGroups = new Map((composition.population_groups ?? [])
        .filter((group) => text(group?.group_id))
        .map((group) => [group.group_id, group]));
      const fromDefinition = sourceGroups.get(fromGroup);
      const toDefinition = sourceGroups.get(toGroup);
      if (!hasRole(fromDefinition, rule.subject_role_ref)
          || !hasRole(toDefinition, rule.object_role_ref)) continue;
      for (const fact of composition.slot_relationships) {
        if (fact?.from_group_id !== fromGroup || fact?.to_group_id !== toGroup
            || fact?.relationship_kind !== rule.relationship_kind) continue;
        const from = output.filter((npc) => named(npc) && belongsTo(npc, composition, fromGroup)
          && npc.role_ref?.id === rule.subject_role_ref);
        const to = output.filter((npc) => named(npc) && belongsTo(npc, composition, toGroup)
          && npc.role_ref?.id === rule.object_role_ref);
        if (from.length !== 1 || to.length !== 1 || from[0].instance_id === to[0].instance_id
            || !sameHousehold(from[0], to[0])) continue;
        const [left, right] = rule.direction === 'symmetric'
          && from[0].instance_id > to[0].instance_id
          ? [to[0], from[0]] : [from[0], to[0]];
        const key = `${left.instance_id}\u0000${right.instance_id}\u0000${rule.relationship_kind}`;
        if (relations.has(key)) continue;
        relations.set(key, { from_npc_id: left.instance_id, to_npc_id: right.instance_id,
          relation_category_id: rule.relationship_kind,
          state: { source_rule_ref: { id: rule.rule_id, version: rule.rule_version },
            source_composition_ref: structuredClone(ref),
            source_groups: { from: fromGroup, to: toGroup } } });
        addRelationship(left, right.instance_id, rule.relationship_kind);
        if (rule.direction === 'symmetric') addRelationship(right, left.instance_id, rule.relationship_kind);
      }
    }
  }
  return { npcs: output, relations: [...relations.values()] };
}

function hasRole(group, roleRef) {
  return (group?.weighted_subjects ?? []).some((subject) => subject?.subject_kind === 'social_role'
    && subject.subject_ref === roleRef);
}
function named(npc) {
  return text(npc?.instance_id) && text(npc?.identity_state?.canonical_name);
}
function belongsTo(npc, composition, groupId) {
  const binding = npc.semantic_state?.source_binding;
  const lineage = binding?.source ?? binding;
  return binding?.world_revision_id === composition.composition_ref.world_revision_id
    && lineage?.place_family_id === composition.place_family_id
    && lineage?.group_id === groupId
    && sameRef(lineage?.place_population_composition_ref, composition.composition_ref)
    && text(binding.canonical_g5_ref?.id) && positiveVersion(binding.canonical_g5_ref?.version);
}
function sameHousehold(left, right) {
  const a = left.semantic_state?.source_binding?.canonical_g5_ref;
  const b = right.semantic_state?.source_binding?.canonical_g5_ref;
  return text(a?.id) && a.id === b?.id
    && positiveVersion(a.version) && String(a.version) === String(b?.version);
}
function sameRef(left, right) {
  return left?.id === right?.id && positiveVersion(left?.version)
    && String(left.version) === String(right.version)
    && left?.world_revision_id === right?.world_revision_id;
}
function addRelationship(npc, target, kind) {
  for (const key of ['relationships', 'semantic_state']) {
    const holder = key === 'relationships' ? npc : npc.semantic_state;
    if (!holder) continue;
    const field = key === 'relationships' ? 'relationships' : 'relationships';
    const list = holder[field] ?? (holder[field] = []);
    if (!list.some((row) => row?.target_actor_id === target && row?.kind === kind)) {
      list.push({ target_actor_id: target, kind });
    }
  }
}
function positiveVersion(value) {
  return (typeof value === 'string' || Number.isSafeInteger(value))
    && Number.isSafeInteger(Number(value)) && Number(value) > 0;
}
function text(value) { return typeof value === 'string' && value.trim().length > 0; }
