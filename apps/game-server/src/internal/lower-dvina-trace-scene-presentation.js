import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const V1_PATH = 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v23/scene-presentation-v1.json';
const V2_PATH = 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v26/scene-presentation-v2.json';
export const TRACE_SCENE_PRESENTATION_DIGEST =
  '3f502cb872f662c74fdace184111b1ded2f3af286ce258a6707d4940ddd2d347';
export const TRACE_SCENE_PRESENTATION_V2_DIGEST =
  'b0e68dabf6541bc76b24294f797746c34d7d3ab28c6732d71cba79336369750c';

export async function loadLowerDvinaTraceScenePresentation({
  rootDir = process.cwd(), scenarioDefinitionRevision
} = {}) {
  if (![28, 29, 30, 31].includes(scenarioDefinitionRevision)) return null;
  const version = scenarioDefinitionRevision === 31 ? 2 : 1;
  const raw = await readFile(resolve(rootDir, version === 2 ? V2_PATH : V1_PATH));
  const digest = createHash('sha256').update(raw).digest('hex');
  const value = JSON.parse(raw);
  if (digest !== (version === 2 ? TRACE_SCENE_PRESENTATION_V2_DIGEST : TRACE_SCENE_PRESENTATION_DIGEST)
      || value?.schema !== 'rus.lower_dvina_trace_scene_presentation.v1'
      || value.presentation_id !== `lower_dvina_trace_scene_presentation_v${version}`
      || value.revision !== version || value.status !== 'approved'
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
        player_visible_physical_facts: facts,
        ordinary_background_descriptor: ordinary,
        ordinary_density_band: density, source_basis: basis }) =>
        !text(ref) || !text(name) || !text(basis) || !Array.isArray(facts)
          || facts.some((fact) => !text(fact)) || !text(ordinary)
          || !['sparse', 'ordinary', 'dense'].includes(density))) {
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
