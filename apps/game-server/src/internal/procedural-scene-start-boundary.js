export function resolveOptionalProceduralSceneCatalog({ generate, bindings,
  approvedRecordBundle } = {}) {
  try {
    const catalog = generate({ bindings, approvedRecordBundle });
    if (catalog?.status === 'blocked_data_gap') return null;
    if (catalog?.status !== 'approved' || !Array.isArray(catalog.profiles)
        || catalog.profiles.length === 0) throw new Error(
      'PROCEDURAL_SCENE_CATALOG_INVALID');
    return catalog;
  } catch (error) {
    if (error?.code === 'PROCEDURAL_SCENE_PROFILE_DATA_GAP'
        || error?.message === 'PROCEDURAL_SCENE_GENERATOR_INPUT_INVALID') {
      return null;
    }
    throw error;
  }
}
