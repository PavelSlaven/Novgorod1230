import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const PATH = 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v23/scene-presentation-v1.json';
export const TRACE_SCENE_PRESENTATION_DIGEST =
  '3f502cb872f662c74fdace184111b1ded2f3af286ce258a6707d4940ddd2d347';

export async function loadLowerDvinaTraceScenePresentation({
  rootDir = process.cwd(), scenarioDefinitionRevision
} = {}) {
  if (scenarioDefinitionRevision !== 28) return null;
  const raw = await readFile(resolve(rootDir, PATH));
  const digest = createHash('sha256').update(raw).digest('hex');
  const value = JSON.parse(raw);
  if (digest !== TRACE_SCENE_PRESENTATION_DIGEST
      || value?.schema !== 'rus.lower_dvina_trace_scene_presentation.v1'
      || value.presentation_id !== 'lower_dvina_trace_scene_presentation_v1'
      || value.revision !== 1 || value.status !== 'approved'
      || value.scenario_id !== 'lower_dvina_trace_v1'
      || value.fallback_policy !== 'forbidden'
      || !Array.isArray(value.locations)
      || !validPresentations(value.fact_presentations, 'fact_ref', ['text'])
      || !validPresentations(value.route_presentations, 'route_fact_ref',
        ['visible_scene', 'visible_change', 'known_context'])
      || !validPresentations(value.route_presentations, 'route_ref',
        ['visible_scene', 'visible_change', 'known_context'])
      || new Set(value.locations.map(({ location_ref: ref }) => ref)).size
        !== value.locations.length
      || value.locations.some(({ location_ref: ref, display_name: name,
        player_visible_physical_facts: facts, source_basis: basis }) =>
        !text(ref) || !text(name) || !text(basis) || !Array.isArray(facts)
          || facts.some((fact) => !text(fact)))) {
    fail();
  }
  return Object.freeze(structuredClone(value));
}

function validPresentations(records, key, textFields) {
  return Array.isArray(records) && records.length > 0
    && new Set(records.map((record) => record?.[key])).size === records.length
    && records.every((record) => text(record?.[key]) && text(record?.source_basis)
      && text(record?.perception_requirement)
      && textFields.every((field) => text(record?.[field])));
}

function text(value) { return typeof value === 'string' && value.length > 0; }
function fail() {
  throw Object.assign(new Error('TRACE_SCENE_PRESENTATION_INVALID'), {
    code: 'TRACE_SCENE_PRESENTATION_INVALID', status: 409
  });
}
