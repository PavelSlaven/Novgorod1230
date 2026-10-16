import { materializeG4NaturalBaseline } from '@rus/materialization';
import { loadApprovedG4NaturalCatalog } from '@rus/runtime-catalog';

/** Machine readiness only; the visibility owner must project perceived facts. */
export function prepareG4NaturalBaseline({ verifiedCatalog, pin, g4_ref,
  scene_template_ref, current_environment, member_selection } = {}) {
  const catalog = loadApprovedG4NaturalCatalog({ verifiedCatalog, pin });
  return materializeG4NaturalBaseline({ catalog, g4_ref, scene_template_ref,
    current_environment, member_selection });
}
