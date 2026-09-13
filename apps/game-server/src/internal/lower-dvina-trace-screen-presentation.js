import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { loadLowerDvinaTraceMaterializationBundle } from './lower-dvina-trace-phase-1a-bundle.js';
import { loadLowerDvinaTraceScenePresentation } from './lower-dvina-trace-scene-presentation.js';

/** Read-only presentation data from the party's existing exact scenario pins. */
export async function loadLowerDvinaTraceScreenPresentation(payload, rootDir = process.cwd()) {
  const scenarioDefinitionRevision = payload.materialization_trace?.seed_context?.scenario_definition_revision;
  if (!Number.isInteger(scenarioDefinitionRevision)) return null;
  const [bundle, scenePresentation] = await Promise.all([
    loadLowerDvinaTraceMaterializationBundle({ rootDir, scenarioDefinitionRevision }),
    loadLowerDvinaTraceScenePresentation({ rootDir, scenarioDefinitionRevision })
  ]);
  const set = bundle.item_container_set;
  const labels = {};
  for (const [key, idField] of [['item_templates', 'item_template_id'],
    ['container_templates', 'container_template_id']]) {
    const source = set.canonical_item_catalog_source_ref.datasets[key];
    const bytes = await readFile(resolve(rootDir, source.path));
    if (createHash('sha256').update(bytes).digest('hex') !== source.sha256) {
      throw Object.assign(new Error('Pinned item presentation catalog mismatch'),
        { code: 'TRACE_ITEM_CATALOG_DIGEST_MISMATCH' });
    }
    const titles = new Map(JSON.parse(bytes).map(({ id, title }) => [id, title]));
    for (const template of set[key]) {
      const title = template.display_name ?? titles.get(template.base_catalog_ref?.template_id);
      if (typeof title === 'string' && title.length > 0) labels[template[idField]] = title;
    }
  }
  return { calendarProfile: bundle.calendar_profile, scenePresentation, itemLabels: labels };
}
