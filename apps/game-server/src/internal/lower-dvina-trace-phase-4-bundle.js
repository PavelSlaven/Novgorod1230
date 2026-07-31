import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';

export async function loadLowerDvinaTraceRevision10Bundle({ rootDir, historicalBundle, fail, freezeDeep, validateDefinitionPins }) {
  const historical = structuredClone(historicalBundle);
  const [phase4, phase1a, bindings, definition, npc] = await Promise.all([
    readJson(rootDir, `${ROOT}/phase-4-content/manifest.json`),
    readJson(rootDir, `${ROOT}/phase-1a-v6/manifest.json`),
    readJson(rootDir, `${ROOT}/phase-1a-v6/materialization-bindings.json`),
    readJson(rootDir, `${ROOT}/phase-4-content/definition.json`),
    readJson(rootDir, `${ROOT}/phase-4-content/npc-decision-schedule-policies.json`)
  ]);
  if (phase4.value?.package_id !== 'lower_dvina_trace_phase_4_content_v1'
    || phase4.value.schema !== 'rus.lower_dvina_trace_phase_4_content_manifest.v1'
    || phase4.value.revision !== 1
    || phase4.value.scenario_definition_revision !== 10
    || phase4.value.files?.['definition.json'] !== definition.digest
    || phase4.value.files?.['npc-decision-schedule-policies.json'] !== npc.digest
    || phase4.value.content_refs?.definition?.path !== 'definition.json'
    || phase4.value.content_refs.definition.id !== 'lower_dvina_trace_v1'
    || phase4.value.content_refs.definition.revision !== 10
    || phase4.value.content_refs.definition.schema !== definition.value.schema
    || phase4.value.content_refs.definition.digest !== definition.digest
    || phase4.value.content_refs?.npc_decision_schedule_policies?.path
      !== 'npc-decision-schedule-policies.json'
    || phase4.value.content_refs.npc_decision_schedule_policies.id
      !== 'trace_ld_v1_npc_decision_schedule_policies'
    || phase4.value.content_refs.npc_decision_schedule_policies.revision !== 3
    || phase4.value.content_refs.npc_decision_schedule_policies.schema
      !== npc.value.schema
    || phase4.value.content_refs.npc_decision_schedule_policies.digest !== npc.digest
    || phase4.value.content_digest !== contentDigest(phase4.value.files)
    || phase1a.value?.package_id !== 'lower_dvina_trace_phase_1a_v6'
    || phase1a.value.revision !== 6
    || phase1a.value.scenario_definition_revision !== 10
    || phase1a.value.content_refs?.materialization_bindings?.digest !== bindings.digest
    || phase1a.value.base_definition_ref?.digest !== phase4.digest
    || bindings.value?.binding_set_id !== 'lower_dvina_trace_phase_1a_materialization_bindings_v6'
    || bindings.value.revision !== 6
    || bindings.value.scenario_definition_revision !== 10
    || definition.value?.revision !== 10
    || definition.value.supersedes_definition_ref?.digest
      !== historical.artifact_pins.definition.digest
    || npc.value?.revision !== 3
    || npc.value.supersedes_ref?.digest
      !== historical.artifact_pins.npc_decision_schedule_policies.digest) {
    fail('TRACE_PHASE_4_CONTENT_INVALID', 'Exact approved Phase 4 materialization content is required.');
  }
  historical.definition_revision = 10;
  historical.manifest_digest = phase1a.digest;
  historical.phase_4_content_manifest_digest = phase4.digest;
  historical.phase_1a_manifest = phase1a.value;
  for (const [key, loaded, path] of [
    ['phase_1a_manifest', phase1a, `${ROOT}/phase-1a-v6/manifest.json`],
    ['materialization_bindings', bindings, `${ROOT}/phase-1a-v6/materialization-bindings.json`],
    ['definition', definition, `${ROOT}/phase-4-content/definition.json`],
    ['npc_decision_schedule_policies', npc, `${ROOT}/phase-4-content/npc-decision-schedule-policies.json`]
  ]) {
    historical[key] = loaded.value;
    historical.artifact_pins[key] = { key, path, digest: loaded.digest, canonical_digest: canonicalDigest(loaded.value), schema: loaded.value.schema, revision: loaded.value.revision };
  }
  validateDefinitionPins(historical);
  return freezeDeep(historical);
}

async function readJson(rootDir, path) {
  const raw = await readFile(resolve(rootDir, path));
  return { value: JSON.parse(raw.toString('utf8')), digest: createHash('sha256').update(raw).digest('hex') };
}

function contentDigest(files) {
  const payload = Object.entries(files ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, digest]) => `${name}:${digest}`)
    .join('\n')
    .concat('\n');
  return createHash('sha256').update(payload).digest('hex');
}
