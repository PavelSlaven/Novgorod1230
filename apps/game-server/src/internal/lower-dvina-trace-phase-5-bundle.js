import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';

export async function loadLowerDvinaTraceRevision11Bundle({
  rootDir,
  historicalBundle,
  fail,
  freezeDeep,
  validateDefinitionPins
}) {
  const historical = structuredClone(historicalBundle);
  const names = [
    'manifest.json',
    'definition.json',
    'item-container-set.json',
    'activity-check-consequence-profiles.json',
    'body-environment-profiles.json',
    'npc-decision-schedule-policies.json'
  ];
  const loaded = Object.fromEntries(await Promise.all(names.map(async (name) => [
    name,
    await readJson(rootDir, `${ROOT}/phase-5-content/${name}`)
  ])));
  const phase5 = loaded['manifest.json'];
  const phase1a = await readJson(rootDir, `${ROOT}/phase-1a-v7/manifest.json`);
  const bindings = await readJson(rootDir,
    `${ROOT}/phase-1a-v7/materialization-bindings.json`);
  if (phase5.value?.package_id !== 'lower_dvina_trace_phase_5_content_v1'
    || phase5.value.scenario_definition_revision !== 11
    || phase5.value.superseded_definition_ref?.digest
      !== historical.artifact_pins.definition.digest
    || phase5.value.content_digest !== contentDigest(phase5.value.files)
    || names.slice(1).some((name) =>
      phase5.value.files?.[name] !== loaded[name].digest)
    || phase1a.value?.package_id !== 'lower_dvina_trace_phase_1a_v7'
    || phase1a.value.revision !== 7
    || phase1a.value.scenario_definition_revision !== 11
    || phase1a.value.superseded_package_ref?.digest
      !== historical.artifact_pins.phase_1a_manifest.digest
    || phase1a.value.base_definition_ref?.digest !== phase5.digest
    || phase1a.value.content_refs?.materialization_bindings?.digest
      !== bindings.digest
    || bindings.value?.binding_set_id
      !== 'lower_dvina_trace_phase_1a_materialization_bindings_v7'
    || bindings.value.revision !== 7
    || bindings.value.scenario_definition_revision !== 11
    || bindings.value.superseded_binding_ref?.digest
      !== historical.artifact_pins.materialization_bindings.digest) {
    fail('TRACE_PHASE_5_CONTENT_INVALID',
      'Exact approved Phase 5 content is required.');
  }
  historical.definition_revision = 11;
  historical.manifest_digest = phase1a.digest;
  historical.phase_5_content_manifest_digest = phase5.digest;
  historical.phase_1a_manifest = phase1a.value;
  for (const [key, value, path] of [
    ['phase_1a_manifest', phase1a, `${ROOT}/phase-1a-v7/manifest.json`],
    ['materialization_bindings', bindings,
      `${ROOT}/phase-1a-v7/materialization-bindings.json`],
    ['definition', loaded['definition.json'],
      `${ROOT}/phase-5-content/definition.json`],
    ['item_container_set', loaded['item-container-set.json'],
      `${ROOT}/phase-5-content/item-container-set.json`],
    ['activity_check_consequence_profiles',
      loaded['activity-check-consequence-profiles.json'],
      `${ROOT}/phase-5-content/activity-check-consequence-profiles.json`],
    ['body_environment_profiles', loaded['body-environment-profiles.json'],
      `${ROOT}/phase-5-content/body-environment-profiles.json`],
    ['npc_decision_schedule_policies',
      loaded['npc-decision-schedule-policies.json'],
      `${ROOT}/phase-5-content/npc-decision-schedule-policies.json`]
  ]) {
    historical[key] = value.value;
    historical.artifact_pins[key] = {
      key,
      path,
      digest: value.digest,
      canonical_digest: canonicalDigest(value.value),
      schema: value.value.schema,
      revision: value.value.revision
    };
  }
  validateDefinitionPins(historical);
  return freezeDeep(historical);
}

async function readJson(rootDir, path) {
  const raw = await readFile(resolve(rootDir, path));
  return {
    value: JSON.parse(raw.toString('utf8')),
    digest: createHash('sha256').update(raw).digest('hex')
  };
}

function contentDigest(files) {
  const payload = Object.entries(files ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, digest]) => `${name}:${digest}`)
    .join('\n')
    .concat('\n');
  return createHash('sha256').update(payload).digest('hex');
}
