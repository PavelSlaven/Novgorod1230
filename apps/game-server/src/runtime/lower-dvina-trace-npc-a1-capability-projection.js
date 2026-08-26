/** Projects per-reference A1 applicability into NPC-safe contract bounds. */
export async function applicableNpcA1Refs(owner, refs, input) {
  const source_refs = [];
  const partial_independent_source_refs = [];
  const partial_preserve_secondary_source_refs = [];
  const removable_physical_fact_refs_by_source = {};
  for (const ref of refs) {
    const reference = input({ item_ref: ref, source_refs: [ref], tool_refs: [] });
    if (await owner.referencesApplicable(reference)) {
      source_refs.push(ref);
      const projection = typeof owner.actionProductionCapability === 'function'
        ? await owner.actionProductionCapability(reference) : null;
      if (projection?.partial_independent_allowed === true) {
        partial_independent_source_refs.push(ref);
      }
      if (projection?.partial_preserve_secondary_allowed === true) {
        partial_preserve_secondary_source_refs.push(ref);
      }
      if (Array.isArray(projection?.removable_physical_fact_refs)
          && projection.removable_physical_fact_refs.length > 0) {
        removable_physical_fact_refs_by_source[ref] = [
          ...projection.removable_physical_fact_refs];
      }
    }
  }
  const tool_refs = [];
  for (const ref of refs) {
    const source = source_refs.find((candidate) => candidate !== ref);
    if (source != null && await owner.referencesApplicable(input({
      item_ref: source, source_refs: [source], tool_refs: [ref] }))) {
      tool_refs.push(ref);
    }
  }
  const independent_output_source_groups = []; // ponytail: bulk if inventory grows.
  for (const ref of source_refs) {
    let joined = false;
    for (const group of independent_output_source_groups) {
      if (typeof owner.referencesJointlyApplicable === 'function'
          && await owner.referencesJointlyApplicable(input({
            item_ref: group[0], source_refs: [...group, ref], tool_refs: [],
            identity_mode: 'independent_outputs'
          }))) {
        group.push(ref);
        joined = true;
        break;
      }
    }
    if (!joined) independent_output_source_groups.push([ref]);
  }
  if (typeof owner.referencesJointlyApplicable !== 'function'
      && independent_output_source_groups.length > 1) {
    independent_output_source_groups.splice(0,
      independent_output_source_groups.length, [...source_refs]);
  }
  return { source_refs, tool_refs, independent_output_source_groups,
    partial_independent_source_refs, partial_preserve_secondary_source_refs,
    removable_physical_fact_refs_by_source };
}
