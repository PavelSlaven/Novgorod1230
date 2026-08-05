import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonicalDigest } from '@rus/materialization';
import { assertRevision14Package } from
  './lower-dvina-trace-conversation-bundle-validation.js';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const CONTENT_ROOT = `${ROOT}/phase-m2-content`;

export async function loadLowerDvinaTraceRevision14Bundle({
  rootDir,
  historicalBundle,
  fail,
  freezeDeep,
  validateDefinitionPins
}) {
  const [manifest, definition, conversationBindings, phase1a, bindings,
    reused] = await Promise.all([
    readJson(rootDir, `${CONTENT_ROOT}/manifest.json`),
    readJson(rootDir, `${CONTENT_ROOT}/definition.json`),
    readJson(rootDir, `${CONTENT_ROOT}/conversation-semantic-bindings.json`),
    readJson(rootDir, `${ROOT}/phase-1a-v10/manifest.json`),
    readJson(rootDir, `${ROOT}/phase-1a-v10/materialization-bindings.json`),
    readJson(rootDir, `${ROOT}/phase-1a-v9/materialization-bindings.json`)
  ]);
  assertRevision14Package({
    historical: historicalBundle,
    manifest,
    definition,
    conversationBindings,
    phase1a,
    bindings,
    reused,
    fail
  });

  const historical = structuredClone(historicalBundle);
  const materializationBindings = {
    ...structuredClone(historical.materialization_bindings),
    schema: bindings.value.schema,
    binding_set_id: bindings.value.binding_set_id,
    revision: bindings.value.revision,
    status: bindings.value.status,
    scenario_id: bindings.value.scenario_id,
    scenario_definition_revision:
      bindings.value.scenario_definition_revision,
    superseded_binding_ref:
      structuredClone(bindings.value.superseded_binding_ref),
    reused_immutable_binding_ref:
      structuredClone(bindings.value.reused_immutable_binding_ref),
    binding_resolution_policy: bindings.value.binding_resolution_policy,
    fallback_policy: bindings.value.fallback_policy,
    normalization_policy: bindings.value.normalization_policy,
    binding_overrides: structuredClone(bindings.value.binding_overrides),
    sealed_selection_inventory_ref:
      structuredClone(bindings.value.sealed_selection_inventory_ref)
  };
  historical.definition_revision = 14;
  historical.manifest_digest = phase1a.digest;
  historical.m2_content_manifest_digest = manifest.digest;
  historical.phase_1a_manifest = phase1a.value;
  historical.definition = definition.value;
  historical.conversation_semantic_bindings = conversationBindings.value;
  historical.materialization_bindings = materializationBindings;
  for (const [key, loaded, path, value] of [
    ['phase_1a_manifest', phase1a, `${ROOT}/phase-1a-v10/manifest.json`,
      phase1a.value],
    ['materialization_bindings', bindings,
      `${ROOT}/phase-1a-v10/materialization-bindings.json`,
      materializationBindings],
    ['definition', definition, `${CONTENT_ROOT}/definition.json`,
      definition.value],
    ['conversation_semantic_bindings', conversationBindings,
      `${CONTENT_ROOT}/conversation-semantic-bindings.json`,
      conversationBindings.value]
  ]) {
    historical.artifact_pins[key] = {
      key,
      path,
      digest: loaded.digest,
      canonical_digest: canonicalDigest(value),
      schema: value.schema,
      revision: value.revision
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
