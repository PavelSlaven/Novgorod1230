import { canonicalDigest } from '@rus/materialization';
import { mergeItemContainerSet } from '../../../apps/game-server/src/internal/lower-dvina-trace-character-appearance-bundle.js';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { loadLowerDvinaTraceMaterializationBundle } from '../../../apps/game-server/src/internal/lower-dvina-trace-phase-1a-bundle.js';

// Current unpublished successor only; historical M7 and releases remain immutable.
const root = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const write = async (path, value) => { const bytes = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(path, bytes); return digest(bytes); };
const bundle = await loadLowerDvinaTraceMaterializationBundle({ scenarioDefinitionRevision: 32 });
const source = bundle.item_container_set.canonical_item_catalog_source_ref.datasets.item_templates;
const bytes = await readFile(source.path);
if (digest(bytes) !== source.sha256) throw new Error('TRACE_ITEM_CATALOG_DIGEST_MISMATCH');
const titles = new Map(JSON.parse(bytes).map(({ id, title }) => [id, title]));
const overrides = bundle.item_container_set.item_templates.flatMap(template => {
  if (template.base_catalog_ref?.template_id == null) return [];
  const ref = { ...template.base_catalog_ref };
  if (template.item_template_id === 'trace_ld_v1_item_base_shirt') ref.template_id = 'item_tpl_nov_linen_shirt_v1';
  const title = titles.get(ref.template_id);
  if (typeof title !== 'string' || !title.trim()) throw new Error(`Approved item title missing: ${ref.template_id}`);
  return [{ item_template_id: template.item_template_id, base_catalog_ref: ref, display_name: title }];
});
const path = `${root}/phase-m21-content/item-container-set-overlay.json`;
const overlay = { schema: 'rus.trace_item_container_set_overlay.v1', set_id: 'trace_ld_v1_item_container_set',
  revision: 6, status: 'approved', publication_status: 'unpublished',
  supersedes_ref: { id: 'trace_ld_v1_item_container_set', revision: 5,
    schema: 'rus.trace_item_container_set_overlay.v1', path: bundle.artifact_pins.item_container_set.path,
    digest: bundle.artifact_pins.item_container_set.digest },
  canonical_item_catalog_source_ref: structuredClone(bundle.item_container_set.canonical_item_catalog_source_ref),
  item_template_overrides: overrides, fallback_policy: 'forbidden', normalization_policy: 'forbidden', alias_policy: 'forbidden' };
const overlayDigest = await write(path, overlay);
const definitionPath = `${root}/phase-m21-content/definition.json`;
const phase1aPath = `${root}/phase-1a-v24/manifest.json`;
const bindingPath = `${root}/phase-1b-v28/publication-binding.json`;
const publicationPath = `${root}/phase-1b-v28/manifest.json`;
const materializationPath = `${root}/phase-1a-v24/materialization-bindings.json`;
const tracked = [definitionPath, phase1aPath, bindingPath, publicationPath, materializationPath];
const before = await Promise.all(tracked.map(async path => digest(await readFile(path))));
const definition = await read(definitionPath);
definition.immutable_content_refs.item_container_set = { id: overlay.set_id, revision: 6, digest: overlayDigest };
const definitionDigest = await write(definitionPath, definition);
const materialization = await read(materializationPath);
const inventory = structuredClone(bundle.materialization_bindings.sealed_selection_inventory);
inventory.source_artifact_digests.item_container_set = overlayDigest;
const merged = mergeItemContainerSet(bundle.item_container_set, overlay, code => { throw new Error(code); });
const itemRecords = merged.item_templates.filter(({ item_template_id: id }) => id !== 'trace_ld_v1_item_mikula_knife')
  .map(template => ({ record_id: template.item_template_id, record_digest: canonicalDigest(template) }))
  .sort((a, b) => a.record_id.localeCompare(b.record_id));
const group = inventory.required_groups.find(({ selection_kind: kind }) => kind === 'items');
group.required_record_count = itemRecords.length;
group.required_records_digest = canonicalDigest(itemRecords);
delete group.allowed_records_digests;
materialization.sealed_selection_inventory = inventory;
const materializationDigest = await write(materializationPath, materialization);
const phase1a = await read(phase1aPath);
phase1a.content_refs.materialization_bindings.digest = materializationDigest;
phase1a.content_refs.item_container_set = { path, id: overlay.set_id, revision: 6, schema: overlay.schema, digest: overlayDigest };
const phase1aDigest = await write(phase1aPath, phase1a);
const binding = await read(bindingPath);
binding.phase_1a_manifest_ref.digest = phase1aDigest;
binding.scenario_definition_ref.digest = definitionDigest;
binding.execution_identity.phase_1a_manifest_digest = phase1aDigest;
binding.execution_identity.scenario_definition_digest = definitionDigest;
const bindingDigest = await write(bindingPath, binding);
const publication = await read(publicationPath);
publication.content_refs.publication_binding.digest = bindingDigest;
const publicationDigest = await write(publicationPath, publication);
const after = [definitionDigest, phase1aDigest, bindingDigest, publicationDigest, materializationDigest];
const consumers = [
  'packages/materialization/src/lower-dvina-trace-phase-1a-validation.js',
  'apps/game-server/src/internal/lower-dvina-trace-revision-33-bundle.js',
  'apps/game-server/src/internal/lower-dvina-trace-revision-32-publication.js',
  'apps/game-server/src/internal/lower-dvina-trace-phase-1b-identities.js',
  'apps/game-server/src/composition/production-spatial-v3-release.js',
  'apps/game-server/src/runtime/releases/spatial-v3-production-v15-bindings.js',
  'test/spatial-v3/pr8-production-v3-composition.test.js'
];
for (const file of consumers) {
  let text = await readFile(file, 'utf8');
  for (const [index, old] of before.entries()) text = text.replaceAll(old, after[index]);
  text = text.replace(/const ITEM_DISPLAY_OVERLAY_DIGEST = '[^']+';/,
    `const ITEM_DISPLAY_OVERLAY_DIGEST = '${overlayDigest}';`);
  await writeFile(file, text);
}
console.log('Current item display overlay and exact successor consumers refreshed.');
