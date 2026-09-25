import { createHash } from 'node:crypto';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

/** Extend pinned v1 family refs only for the separately approved scene successors. */
export function deriveApprovedGeneratedSceneV2Bindings(candidate, { capacityApproval,
  sceneTemplateBytes } = {}) {
  if (capacityApproval?.schema !== 'rus.m2c_supplemental_data_approval.v1'
    || capacityApproval.decision !== 'APPROVE_DATA_ONLY'
    || hash(sceneTemplateBytes ?? '') !== capacityApproval.source_pins?.scene_templates?.sha256) {
    throw new TypeError('Exact approved scene v2 source is required.');
  }
  const scenes = JSON.parse(sceneTemplateBytes);
  const byId = new Map(scenes.map((row) => [row.id, row]));
  if (byId.size !== scenes.length || scenes.some((row) => row.version !== 2)) {
    throw new TypeError('Exact approved scene v2 source is required.');
  }
  const copy = structuredClone(candidate);
  for (const family of copy.family_profiles ?? copy.family_bindings ?? []) {
    const refs = family.exact_match?.scene_template_refs ?? family.scene_template_refs;
    if (!Array.isArray(refs)) throw new TypeError('Exact scene family refs are required.');
    for (const ref of [...refs]) {
      const [id, version] = ref.split('@');
      if (version !== '1' || !byId.has(id)) continue;
      const next = `${id}@2`;
      if (refs.includes(next)) throw new TypeError('Duplicate scene v2 family ref.');
      refs.push(next);
    }
  }
  return copy;
}
