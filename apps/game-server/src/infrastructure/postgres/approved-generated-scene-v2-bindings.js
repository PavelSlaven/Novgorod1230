import { createHash } from 'node:crypto';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Extend pinned v1 families only for separately approved scene and generation successors. */
export function deriveApprovedGeneratedSceneV2Bindings(candidate, { capacityApproval,
  sceneTemplateBytes, materializationProfileBytes } = {}) {
  if (capacityApproval?.schema !== 'rus.m2c_supplemental_data_approval.v1'
    || capacityApproval.decision !== 'APPROVE_DATA_ONLY'
    || hash(sceneTemplateBytes ?? '') !== capacityApproval.source_pins?.scene_templates?.sha256
    || hash(materializationProfileBytes ?? '') !== capacityApproval.source_pins?.materialization_profiles?.sha256) {
    throw new TypeError('Exact approved scene v2 source is required.');
  }
  const scenes = JSON.parse(sceneTemplateBytes);
  const profiles = JSON.parse(materializationProfileBytes);
  const byId = new Map(scenes.map((row) => [row.id, row]));
  if (byId.size !== scenes.length || scenes.some((row) => row.version !== 2)
    || !Array.isArray(profiles)) {
    throw new TypeError('Exact approved scene v2 source is required.');
  }
  const copy = structuredClone(candidate);
  const families = copy.family_profiles ?? copy.family_bindings ?? [];
  for (const family of [...families]) {
    const refs = family.exact_match?.scene_template_refs ?? family.scene_template_refs;
    const match = family.exact_match ?? family;
    if (!Array.isArray(refs)) throw new TypeError('Exact scene family refs are required.');
    for (const ref of [...refs]) {
      const [id, version] = ref.split('@');
      if (version !== '1' || !byId.has(id)) continue;
      const next = `${id}@2`;
      if (refs.includes(next)) throw new TypeError('Duplicate scene v2 family ref.');
      refs.push(next);
    }
    const successors = profiles.filter((row) => row.status === 'approved'
      && row.world_revision_id === match.world_revision_id
      && row.source_kind === 'g5_generation_template'
      && row.source_entity_id === match.g5_generation_template_id
      && row.source_entity_version === 2);
    if (successors.length > 1) throw new TypeError('Ambiguous approved generation successor.');
    if (match.g5_generation_template_version === 1 && successors.length === 1
      && refs.some((ref) => ref.endsWith('@2'))) {
      if (families.some((row) => (row.exact_match ?? row).g5_generation_template_id
        === match.g5_generation_template_id
        && (row.exact_match ?? row).g5_generation_template_version === 2)) {
        throw new TypeError('Duplicate generation successor family.');
      }
      const successor = structuredClone(family);
      const binding = successor.exact_match ?? successor;
      binding.g5_generation_template_version = 2;
      binding.scene_template_refs = refs.filter((ref) => ref.endsWith('@2'));
      families.push(successor);
    }
  }
  return copy;
}
