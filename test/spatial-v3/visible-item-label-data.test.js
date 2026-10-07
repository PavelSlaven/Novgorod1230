import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { canonicalDigest } from '@rus/materialization';

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DATA_ROOT = 'data/world-catalogs/novgorod';
const TRACE_ROOT = `${DATA_ROOT}/lower-dvina-trace-v1`;
const PHASE_5_ROOT = `${TRACE_ROOT}/phase-5-content`;
const CANONICAL_INITIAL_ITEM_PROFILES_SHA256 =
  '738d89ba82eaa46d8d08ee2585c65006431843af8c9112eec1f16bb7816e7549';
const UNNAMED_PLACED_ITEM_REASONS = new Map([
  ['trace_ld_v1_item_blue_wool_fragment', 'нет утверждённого имени, ждёт данных'],
  ['trace_ld_v1_item_cut_bag_fastening', 'нет утверждённого имени, ждёт данных'],
  ['trace_ld_v1_item_persistent_debris', 'нет утверждённого имени, ждёт данных'],
  ['trace_ld_v1_item_broken_oar', 'нет утверждённого имени, ждёт данных'],
  ['trace_ld_v1_item_side_collision_trace', 'нет утверждённого имени, ждёт данных'],
  ['trace_ld_v1_item_hidden_trunk_trace', 'нет утверждённого имени, ждёт данных']
]);

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(REPOSITORY_ROOT, relativePath), 'utf8'));
}

async function sha256(relativePath) {
  const bytes = await readFile(resolve(REPOSITORY_ROOT, relativePath));
  return createHash('sha256').update(bytes).digest('hex');
}

async function assertPinnedFile(pin, context) {
  assert.ok(pin?.path, `${context}: missing pinned path`);
  assert.match(pin.sha256 ?? pin.digest ?? '', /^[a-f0-9]{64}$/u,
    `${context}: missing SHA-256 pin`);
  const expected = pin.sha256 ?? pin.digest;
  assert.equal(await sha256(pin.path), expected, `${context}: pinned file hash mismatch`);
}

function nonEmptyLabel(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

test('v17 and Lower Dvina starting items resolve to approved labels or an explicit data gap', async () => {
  const startsRoot = `${DATA_ROOT}/live-world-runtime-v17`;
  const startsManifestPath = `${startsRoot}/target-starts-manifest.v1.json`;
  const startsManifest = await readJson(startsManifestPath);
  const activationApproval = await readJson(`${startsRoot}/target-starts-activation-approval.json`);

  assert.equal(startsManifest.status, 'approved');
  assert.equal(startsManifest.activation_authorized, true);
  await assertPinnedFile(activationApproval.manifest, 'v17 target-starts manifest');
  assert.equal(activationApproval.manifest.path, startsManifestPath);
  assert.deepEqual(
    activationApproval.activated_scenarios,
    startsManifest.starts.map(({ scenario_id }) => scenario_id)
  );
  for (const sourcePin of Object.values(startsManifest.source_artifacts)) {
    await assertPinnedFile(sourcePin, 'v17 start manifest source artifact');
  }

  const canonicalInitialRoot = `${DATA_ROOT}/m2c-npc/canonical-initial`;
  const canonicalInitialCandidatePath = `${DATA_ROOT}/m2c-npc/canonical-initial-candidate.json`;
  const canonicalInitialApproval = await readJson(`${canonicalInitialRoot}/approval.json`);
  assert.equal(await sha256(canonicalInitialCandidatePath),
    canonicalInitialApproval.candidate_sha256,
    'canonical-initial candidate does not match its approval pin');
  assert.equal(canonicalInitialApproval.runtime_activation_authorized, false);

  const canonicalInitialProfiles = await readJson(
    `${canonicalInitialRoot}/datasets/spatial_v3_npc_runtime_profiles.json`
  );
  assert.equal(
    await sha256(`${canonicalInitialRoot}/datasets/spatial_v3_npc_runtime_profiles.json`),
    CANONICAL_INITIAL_ITEM_PROFILES_SHA256,
    'canonical-initial runtime profile dataset is not the reviewed pin'
  );
  const itemProfiles = canonicalInitialProfiles.filter((profile) =>
    profile.profile_kind === 'item_template'
  );
  const itemProfileByTemplateId = new Map();
  for (const profile of itemProfiles) {
    const { canonical_digest: digest, ...profileBody } = profile;
    assert.equal(digest, canonicalDigest(profileBody),
      `canonical-initial profile digest mismatch: ${profile.id}`);
    const templateId = profile.payload?.item_template_id;
    if (templateId) itemProfileByTemplateId.set(templateId, profile);
  }

  const v17Items = [];
  for (const start of startsManifest.starts) {
    await assertPinnedFile(start.transfer, `v17 transfer ${start.scenario_id}`);
    const transfer = await readJson(start.transfer.path);
    for (const item of transfer.clothing_transfer?.equipment_entries ?? []) {
      const templateId = item.item_template_ref;
      const profile = itemProfileByTemplateId.get(templateId);
      assert.ok(profile, `v17 item template has no canonical-initial profile: ${templateId}`);
      assert.equal(profile.status, 'approved', `v17 item profile is not approved: ${templateId}`);
      assert.equal(profile.payload.status, 'approved', `v17 item payload is not approved: ${templateId}`);
      assert.equal(profile.payload.source_status, 'approved',
        `v17 item source is not approved: ${templateId}`);
      assert.ok(nonEmptyLabel(profile.payload.display_name),
        `v17 item has no approved display name: ${templateId}`);
      v17Items.push(templateId);
    }
  }
  assert.equal(v17Items.length, 21, 'expected 21 v17 starting transfer item templates');

  const phase1aManifestPath = `${TRACE_ROOT}/phase-1a-v25/manifest.json`;
  const phase1aManifest = await readJson(phase1aManifestPath);
  assert.equal(phase1aManifest.status, 'approved');
  assert.equal(phase1aManifest.revision, 25);
  const bindingsPin = phase1aManifest.content_refs.materialization_bindings;
  const traceOverlayPin = phase1aManifest.content_refs.item_container_set;
  await assertPinnedFile(bindingsPin, 'Lower Dvina phase-1a v25 materialization bindings');
  await assertPinnedFile(traceOverlayPin, 'Lower Dvina phase-1a v25 item overlay');
  const bindings = await readJson(bindingsPin.path);
  const dossierItems = Object.keys(
    bindings.player_dossier_projection?.inventory_item_projections ?? {}
  );

  const traceOverlay = await readJson(traceOverlayPin.path);
  assert.equal(traceOverlay.status, 'approved');
  await assertPinnedFile(traceOverlay.supersedes_ref, 'Lower Dvina inherited item overlay');
  const inheritedOverlay = await readJson(traceOverlay.supersedes_ref.path);
  const traceLabels = new Map();
  for (const overlay of [inheritedOverlay, traceOverlay]) {
    for (const template of overlay.item_template_overrides ?? []) {
      if (nonEmptyLabel(template.display_name)) {
        traceLabels.set(template.item_template_id, template.display_name.trim());
      }
    }
  }
  for (const templateId of dossierItems) {
    assert.ok(nonEmptyLabel(traceLabels.get(templateId)),
      `Lower Dvina dossier item has no approved overlay name: ${templateId}`);
  }
  assert.equal(dossierItems.length, 1, 'expected one Lower Dvina dossier item');

  const phase5Manifest = await readJson(`${PHASE_5_ROOT}/manifest.json`);
  const phase5SetPin = {
    ...phase5Manifest.content_refs.item_container_set,
    path: resolve(REPOSITORY_ROOT, PHASE_5_ROOT,
      phase5Manifest.content_refs.item_container_set.path)
  };
  await assertPinnedFile(phase5SetPin, 'Lower Dvina phase-5 item container set');
  const phase5Set = await readJson(`${PHASE_5_ROOT}/item-container-set.json`);
  const canonicalCatalog = phase5Set.canonical_item_catalog_source_ref;
  await assertPinnedFile(canonicalCatalog.candidate_manifest, 'item-container candidate manifest');
  await assertPinnedFile(canonicalCatalog.approval_attestation, 'item-container approval attestation');
  const itemCatalogApproval = await readJson(canonicalCatalog.approval_attestation.path);
  assert.equal(itemCatalogApproval.decision, canonicalCatalog.approval_attestation.decision);
  const itemTemplatesPin = canonicalCatalog.datasets.item_templates;
  await assertPinnedFile(itemTemplatesPin, 'canonical item template catalog');
  const itemCatalog = await readJson(itemTemplatesPin.path);
  const catalogTitleById = new Map(itemCatalog.map((row) => [row.id, row.title]));

  const phase5OverlayByTemplateId = new Map();
  for (const overlay of [inheritedOverlay, traceOverlay]) {
    for (const template of overlay.item_template_overrides ?? []) {
      phase5OverlayByTemplateId.set(template.item_template_id, template);
    }
  }
  const templateById = new Map(phase5Set.item_templates.map((template) => [
    template.item_template_id,
    template
  ]));
  const itemInstanceById = new Map((phase5Set.item_instances ?? []).map((instance) => [
    instance.item_instance_id ?? instance.id,
    instance
  ]));

  function resolvePhase5Label(templateId, instance = null) {
    const template = templateById.get(templateId);
    const overlay = phase5OverlayByTemplateId.get(templateId);
    const stateLabel = instance?.state?.display_name ?? instance?.display_name;
    const catalogId = overlay?.base_catalog_ref?.template_id
      ?? template?.base_catalog_ref?.template_id;
    return [stateLabel, template?.display_name, overlay?.display_name,
      catalogTitleById.get(catalogId)].find(nonEmptyLabel)?.trim() ?? null;
  }

  const requiredPhase5Templates = new Set(
    phase5Set.item_templates
      .filter((template) => template.placement_slot_ref)
      .map((template) => template.item_template_id)
  );
  for (const instance of phase5Set.item_instances ?? []) {
    const templateId = instance.item_template_ref
      ?? instance.item_template_id
      ?? instance.template_id;
    assert.ok(templateId, `phase-5 item instance has no template ref: ${JSON.stringify(instance)}`);
    requiredPhase5Templates.add(templateId);
  }
  for (const placement of phase5Set.materialized_placements ?? []) {
    const directTemplateId = placement.item_template_ref
      ?? placement.item_template_id
      ?? placement.template_id;
    const instanceId = placement.item_instance_ref
      ?? placement.item_instance_id
      ?? placement.instance_id;
    const instance = instanceId ? itemInstanceById.get(instanceId) : null;
    assert.ok(directTemplateId || instance,
      `phase-5 materialized placement has no resolvable item ref: ${JSON.stringify(placement)}`);
    const templateId = directTemplateId ?? instance.item_template_ref
      ?? instance.item_template_id ?? instance.template_id;
    assert.ok(templateId,
      `phase-5 materialized placement instance has no template ref: ${instanceId}`);
    requiredPhase5Templates.add(templateId);
  }

  const unresolvedPhase5Templates = [...requiredPhase5Templates]
    .filter((templateId) => !resolvePhase5Label(templateId))
    .sort();
  const approvedGapIds = [...UNNAMED_PLACED_ITEM_REASONS.keys()].sort();
  assert.deepEqual(unresolvedPhase5Templates, approvedGapIds,
    `unresolved phase-5 labels must match the explicit data-gap allowlist; unresolved: ${unresolvedPhase5Templates.join(', ')}`);
  for (const templateId of unresolvedPhase5Templates) {
    assert.equal(UNNAMED_PLACED_ITEM_REASONS.get(templateId),
      'нет утверждённого имени, ждёт данных',
      `phase-5 label gap needs an explicit reason: ${templateId}`);
  }
});
