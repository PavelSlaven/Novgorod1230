import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { canonicalDigest, createOrdinaryAggregate, createRandomSource,
  deriveApprovedInitialEnvironment } from '@rus/materialization';
import { materializeSpatialV3GeneratedScene } from '@rus/materialization/spatial-v3-materialization';
import { targetCanonicalStartFixture } from '../../../test/spatial-v3/target-canonical-start-fixture.js';
import { targetFiniteProfileCatalogFixture } from '../../../test/spatial-v3/target-finite-profile-fixture.js';
import { createTargetGeneratedFirstEntry } from '../src/infrastructure/postgres/target-generated-first-entry.js';
import { createTargetFiniteFirstEntryPorts } from
  '../src/infrastructure/postgres/ordinary-materialization-first-entry-provisioning.js';
import { loadTargetRuntimeProfiles } from '../src/internal/target-runtime-profiles.js';
import {
  applyResolvedPresenceRulesFirstArrival,
  createApprovedO1TemplateBackedItemRefs,
  createTargetPresenceRulesFirstArrivalResolver,
} from '../src/infrastructure/postgres/ordinary-materialization-presence-first-arrival.js';

const worldRevisionId = 'novgorod_spatial_v3_target_contract_approval_001';
const digest = '0ed3a9388930b0245fecdf6ec8adfa08d74d5fe88d5458bd452bee20de16fb1e';
const runtimeCatalogPin = {
  schema: 'rus.runtime_catalog_pin.v2',
  catalog_scope: 'item_container_materialization_v2',
  catalog_revision_id: 'item_container_spatial_v3_target_001',
  catalog_digest: digest,
  compatible_world_revision_id: worldRevisionId,
  compatible_world_catalog_digest: digest,
};

const readM2cPresenceRules = async () => JSON.parse(await readFile(
  'data/world-catalogs/novgorod/m2c-npc-wave/v1/datasets/presence_rules.json', 'utf8'));

async function o1Inputs() {
  const loaded = await loadTargetRuntimeProfiles({ worldRevisionId });
  const selector = loaded.materialization_profiles.ordinaryMaterializationProfile.o1_presence.selector;
  const fixture = await targetCanonicalStartFixture();
  const templateBackedItemRefs = createApprovedO1TemplateBackedItemRefs(fixture.domain_catalog);
  const rules = await readM2cPresenceRules();
  const refs = new Set(selector.applicability.rule_refs.map(({ rule_id, rule_version }) =>
    `${rule_id}@${rule_version}`));
  const selectedRules = rules.filter((rule) => refs.has(`${rule.rule_id}@${rule.rule_version}`));
  assert.equal(selectedRules.length, 75);
  const supported = selectedRules.find((rule) => templateBackedItemRefs.has(rule.item_ref)
    && (rule.variants ?? []).every(({ item_ref }) => templateBackedItemRefs.has(item_ref)));
  const gap = selectedRules.find((rule) => !templateBackedItemRefs.has(rule.item_ref)
    || (rule.variants ?? []).some(({ item_ref }) => !templateBackedItemRefs.has(item_ref)));
  const nonmember = rules.find((rule) => rule.scope_ref === 'pf_peasant_homestead'
    && !refs.has(`${rule.rule_id}@${rule.rule_version}`)
    && rule.subject_kind === 'category'
    && rule.subject_ref !== supported?.subject_ref && rule.subject_ref !== gap?.subject_ref);
  assert.ok(supported && gap && nonmember);
  return { selector, templateBackedItemRefs, supported, gap, nonmember };
}

function gateAwareReader({ tuple, rules, g1Ref = tuple.g1_ref, parentG4Ref = tuple.g4_ref }) {
  const [g4Id, g4Version] = tuple.g4_ref.split('@');
  const [g5Id, g5Version] = tuple.canonical_g5_ref.split('@');
  const [placeFamilyId, placeFamilyVersion] = tuple.place_family_ref.split('@');
  return {
    read: async (sql) => {
      if (sql.includes('spatial_v3_world_revisions') || sql.includes('world_base.world_revisions')) {
        return { rows: [{ id: worldRevisionId, catalog_digest: digest, status: 'approved' }] };
      }
      if (sql.includes('runtime_catalog_activation_events')) {
        return { rows: [{ ...runtimeCatalogPin, event_type: 'activate' }] };
      }
      if (sql.includes('spatial_node_place_family_bindings')) {
        return { rows: [{ place_family_id: placeFamilyId,
          place_family_version: Number(placeFamilyVersion), binding_role: 'primary' }] };
      }
      if (sql.includes('FROM world_base.spatial_v3_node_parents')) {
        const [parentId, parentVersion] = parentG4Ref.split('@');
        return { rows: [{ parent_id: parentId, parent_version: Number(parentVersion) }] };
      }
      if (sql.includes('FROM world_base.presence_rules')) return { rows: rules };
      if (sql.includes('parent_category_id')) return { rows: [] };
      if (sql.includes("spatial_level = 'G1'")) return { rows: [{ id: g1Ref }] };
      if (sql.includes('WITH RECURSIVE chain')) return { rows: [{ id: 'region_novgorod_land' }] };
      if (sql.includes('spatial_v3_nodes')) return { rows: [{ version: Number(g5Version),
        canonical_digest: 'a'.repeat(64) }] };
      throw new Error(`Unexpected pinned world read: ${sql}`);
    },
  };
}

async function resolvePresence({ selector, templateBackedItemRefs, tuple, rules,
  g1Ref = tuple.g1_ref, canonicalG5Ref = tuple.canonical_g5_ref,
  parentG4Ref = tuple.g4_ref, origin = 'canonical', runtimeCatalogPinOverride = runtimeCatalogPin } = {}) {
  const [g4Id, g4Version] = tuple.g4_ref.split('@');
  const [canonicalG5Id, canonicalG5Version] = canonicalG5Ref.split('@');
  const resolver = createTargetPresenceRulesFirstArrivalResolver({
    worldBaseReader: gateAwareReader({ tuple, rules, g1Ref, parentG4Ref }),
    spatialWorldPin: { world_revision_id: worldRevisionId, catalog_digest: digest },
    worldPin: { world_revision_id: worldRevisionId, world_catalog_digest: digest },
    runtimeCatalogPin: runtimeCatalogPinOverride,
    o1Selector: selector,
    templateBackedItemRefs,
    readPartyPresenceCalendar: async () => ({ season: 'summer', periodNumber: 4920 }),
  });
  return resolver({
    transaction: { query: async () => ({ rows: [] }) },
    partyId: 'target-o1-presence-compose',
    site: { id: origin === 'generated' ? 'generated:directional-destination' : `canonical:${canonicalG5Id}`,
      origin, parent_g4_id: g4Id,
      ...(origin === 'canonical' ? { canonical_g5_ref: { entity_id: canonicalG5Id,
        authoring_version: Number(canonicalG5Version) } } : {}) },
    request: { g4: { id: g4Id, version: Number(g4Version) } },
  });
}

function apply(context, suffix) {
  const aggregate = createOrdinaryAggregate({
    scope_ref: { entity_kind: 'g6', entity_id: `target-o1-compose-${suffix}` },
    resolution_record_cap: 64,
  });
  return applyResolvedPresenceRulesFirstArrival({ aggregate, context });
}

test('O1 resolver-to-materializer composition uses exact release closure on all four tuples', async () => {
  const { selector, templateBackedItemRefs, supported, gap, nonmember } = await o1Inputs();
  for (const [index, tuple] of selector.applicability.selectors.entries()) {
    const supportedContext = await resolvePresence({ selector, templateBackedItemRefs,
      tuple, rules: [supported] });
    const supportedResult = apply(supportedContext, `${index}-supported`);
    assert.deepEqual(supportedResult.presence_gaps, [], tuple.canonical_g5_ref);
    assert.ok(supportedResult.aggregate.presence_resolutions.some(({ rule_ref }) =>
      rule_ref === `${supported.rule_id}@${supported.rule_version}`));

    const gapContext = await resolvePresence({ selector, templateBackedItemRefs,
      tuple, rules: [{ ...gap, presence_probability_ppm: Symbol('gap must precede RNG') }] });
    const gapResult = apply(gapContext, `${index}-gap`);
    assert.equal(gapResult.presence_gaps.length, 1, tuple.canonical_g5_ref);
    assert.equal(gapResult.presence_gaps[0].rule_ref, `${gap.rule_id}@${gap.rule_version}`);
    assert.deepEqual(gapResult.aggregate.presence_resolutions, []);
    assert.equal(JSON.stringify(gapResult.aggregate).includes('PRESENCE_RULE_ITEM_TEMPLATE_DATA_GAP'), false);

    const emptyClosureContext = await resolvePresence({ selector, templateBackedItemRefs: new Set(),
      tuple, rules: [supported] });
    const emptyClosure = apply(emptyClosureContext, `${index}-empty-closure`);
    assert.equal(emptyClosure.presence_gaps.length, 1, tuple.canonical_g5_ref);
    assert.equal(emptyClosure.presence_gaps[0].reason, 'template_missing');
    assert.deepEqual(emptyClosure.aggregate.presence_resolutions, []);

    const brokenClosureContext = await resolvePresence({ selector,
      templateBackedItemRefs: [], tuple, rules: [supported] });
    assert.throws(() => apply(brokenClosureContext, `${index}-broken-closure`),
      { code: 'PRESENCE_RULE_ITEM_TEMPLATE_DATA_GAP' }, tuple.canonical_g5_ref);

    const mixedContext = await resolvePresence({ selector, templateBackedItemRefs, tuple,
      rules: [supported, gap, nonmember] });
    const mixed = apply(mixedContext, `${index}-mixed`);
    assert.equal(mixed.presence_gaps.length, 1, tuple.canonical_g5_ref);
    assert.ok(mixed.aggregate.presence_resolutions.some(({ rule_ref }) =>
      rule_ref === `${supported.rule_id}@${supported.rule_version}`));
    assert.ok(mixed.aggregate.presence_resolutions.some(({ rule_ref }) =>
      rule_ref === `${nonmember.rule_id}@${nonmember.rule_version}`));
    assert.equal(JSON.stringify(mixed.aggregate).includes('PRESENCE_RULE_ITEM_TEMPLATE_DATA_GAP'), false);
    const replay = applyResolvedPresenceRulesFirstArrival({
      aggregate: JSON.parse(JSON.stringify(mixed.aggregate)), context: mixedContext,
    });
    assert.deepEqual(replay.aggregate, mixed.aggregate);
    assert.equal(replay.presence_gaps.length, 1);
    assert.equal(replay.presence_gaps[0].rule_ref, `${gap.rule_id}@${gap.rule_version}`);

    const outsideTupleContext = await resolvePresence({ selector, templateBackedItemRefs, tuple,
      canonicalG5Ref: `${tuple.canonical_g5_ref.replace(/@\d+$/u, '')}_outside_selector@1`,
      rules: [supported, gap] });
    const outsideTuple = apply(outsideTupleContext, `${index}-outside`);
    assert.deepEqual(outsideTuple.presence_gaps, []);
    assert.equal(outsideTuple.aggregate.presence_resolutions.length, 2);
  }
});

test('generated directional destination first-entry keeps the same O1 rule on generic production path', async () => {
  const { selector, templateBackedItemRefs, gap } = await o1Inputs();
  const tuple = selector.applicability.selectors[0];
  const strictContext = await resolvePresence({ selector, templateBackedItemRefs, tuple, rules: [gap] });
  const strict = apply(strictContext, 'directional-destination-strict');
  assert.equal(strict.presence_gaps.length, 1);
  assert.equal(strict.presence_gaps[0].rule_ref, `${gap.rule_id}@${gap.rule_version}`);
  assert.deepEqual(strict.aggregate.presence_resolutions, []);

  // A generated G5 reached through a directional exit has no canonical selector identity.
  // Feed its real generated-site shape through the same production resolver/materializer path;
  // keep the exact rule and PF binding so only O1 applicability differs.
  const genericContext = await resolvePresence({ selector, templateBackedItemRefs,
    tuple, rules: [gap], origin: 'generated' });
  assert.equal(genericContext.o1Applicability, undefined);
  const generic = apply(genericContext, 'directional-destination-generic');
  assert.deepEqual(generic.presence_gaps, []);
  assert.ok(generic.aggregate.presence_resolutions.some(({ rule_ref }) =>
    rule_ref === `${gap.rule_id}@${gap.rule_version}`));
});

test('generated first-entry owner prepares complete generic aggregate outside O1 tuple', async () => {
  const { selector, gap } = await o1Inputs();
  const tuple = selector.applicability.selectors[0];
  const fixture = await targetCanonicalStartFixture();
  const finiteCatalog = await targetFiniteProfileCatalogFixture();
  const verifiedItemCatalog = { ...fixture.domain_catalog,
    records_by_table: { ...fixture.domain_catalog.records_by_table, ...finiteCatalog.records_by_table } };
  const profiles = await loadTargetRuntimeProfiles({ worldRevisionId, verifiedCatalog: verifiedItemCatalog });
  const itemPin = verifiedItemCatalog.pin;
  const actorProfile = fixture.actor_base_attributes_runtime_profile;
  const actorPin = { ...itemPin, ...Object.fromEntries(['catalog_scope', 'catalog_revision_id', 'catalog_digest',
    'activation_event_id', 'import_id', 'import_audit_digest', 'record_registry_digest', 'runtime_contract_digest']
    .map((key) => [key, actorProfile[key]])) };
  const m2cManifestPath = 'data/world-catalogs/novgorod/m2c-npc-import-manifest.json';
  const m2cManifest = JSON.parse(await readFile(m2cManifestPath, 'utf8'));
  const readM2cTable = async (table) => JSON.parse(await readFile(resolve(dirname(m2cManifestPath),
    m2cManifest.datasets.find((row) => row.table === table).file), 'utf8'));
  const readSceneClosure = async (sceneTemplateId, sceneTemplateVersion) => {
    const header = (await readM2cTable('spatial_v3_scene_templates')).find((row) =>
      row.id === sceneTemplateId && row.version === sceneTemplateVersion);
    assert.ok(header, `approved scene template ${sceneTemplateId}@${sceneTemplateVersion}`);
    const closure = { header };
    for (const [key, table] of Object.entries({ g6_slots: 'spatial_v3_g6_template_slots',
      position_slots: 'spatial_v3_scene_position_templates',
      endpoint_slots: 'spatial_v3_scene_endpoint_slots',
      movement_edges: 'spatial_v3_scene_movement_edge_templates' })) {
      closure[key] = (await readM2cTable(table)).filter((row) =>
        row.scene_template_id === header.id && row.scene_template_version === header.version);
    }
    return closure;
  };
  const compositions = await readM2cTable('spatial_v3_g4_npc_composition_bindings');
  const composition = compositions.find((row) => row.g4_id === tuple.g4_ref.split('@')[0]
    && row.generation_template_id);
  assert.ok(composition, 'selected O1 parent G4 needs an approved generated template');
  const generationTemplate = (await readM2cTable('spatial_v3_g5_generation_templates'))
    .find((row) => row.id === composition.generation_template_id);
  assert.ok(generationTemplate);
  const npcClosure = { ...fixture.canonical_npc_closure,
    g4_ref: { id: tuple.g4_ref.split('@')[0], version: Number(tuple.g4_ref.split('@')[1]) },
    canonical_g5_ref: undefined,
    composition, generation_template_ref: { id: composition.generation_template_id,
      version: composition.generation_template_version },
    runtime_profiles: await readM2cTable('spatial_v3_npc_runtime_profiles'),
    regional_context_profiles: await readM2cTable('spatial_v3_npc_regional_context_profiles') };
  const g4 = { ...npcClosure.g4_ref, world_revision_id: fixture.world_revision_id };
  const generatedSiteId = 'generated-o1-first-entry';
  const habitationClosure = await readSceneClosure('stfv3__g5_habitation_v1', 1);
  const acousticManifest = JSON.parse(await readFile('data/world-catalogs/novgorod/m2c-acoustic-import-manifest.json', 'utf8'));
  const acousticPath = resolve(dirname('data/world-catalogs/novgorod/m2c-acoustic-import-manifest.json'),
    acousticManifest.datasets.find((row) => row.table === 'spatial_v3_g6_acoustic_baselines').file);
  const acousticRows = JSON.parse(await readFile(acousticPath, 'utf8'))
    .filter((row) => row.g5_template_id === generationTemplate.id)
    .map((row) => ({ ...row, authoring_digest: row.canonical_digest }));
  const preparedScene = materializeSpatialV3GeneratedScene({ party_id: 'target-o1-generated-entry',
    site_id: generatedSiteId, baseline_id: `baseline:${generatedSiteId}`, change_set_id: 'entry-change',
    materializer_version: 'm2c', materialization_trace_id: 'trace:entry-change',
    generation_template: generationTemplate,
    scene_closure: habitationClosure,
    acoustic_rows: acousticRows });
  assert.equal(preparedScene.ok, true, JSON.stringify(preparedScene.error));
  const generatedSite = { id: generatedSiteId, party_id: 'target-o1-generated-entry', origin: 'generated',
    parent_g4_id: g4.id, status: 'active', generated_template_ref: { entity_id: generationTemplate.id,
      authoring_version: String(generationTemplate.version) } };
  const proposal = { target_site_id: generatedSiteId, inserts: [
    { target_table: 'party_g5_sites', id: generatedSiteId, record: generatedSite },
    ...preparedScene.proposal.rows,
  ] };
  const rowsByTable = new Map(proposal.inserts.map((row) => [row.target_table, row.record]));
  assert.ok(rowsByTable.get('party_g6_instances')?.scene_slot_key === 'main');
  assert.ok(proposal.inserts.some((row) => row.target_table === 'scene_position_nodes'
    && row.record.template_slot_key === 'focus'));

  const worldBaseReader = gateAwareReader({ tuple, rules: [gap] });
  worldBaseReader.readPinnedG4NpcCompositionClosure = async ({ g4: requestedG4 }) => {
    assert.deepEqual(requestedG4, g4);
    return { ok: true, value: npcClosure };
  };
  const resolver = createTargetPresenceRulesFirstArrivalResolver({ worldBaseReader,
    spatialWorldPin: { world_revision_id: worldRevisionId, catalog_digest: digest },
    worldPin: { world_revision_id: worldRevisionId, world_catalog_digest: digest },
    runtimeCatalogPin, o1Selector: selector,
    templateBackedItemRefs: createApprovedO1TemplateBackedItemRefs(verifiedItemCatalog),
    readPartyPresenceCalendar: async () => ({ season: 'summer', periodNumber: 4920 }) });
  const finitePorts = createTargetFiniteFirstEntryPorts(profiles.finite_first_entry,
    { resolvePresenceRulesFirstArrival: resolver });
  const start = fixture.scenario_bundle.canonical_start.start.initial_environment_inputs;
  const temporal = fixture.approved_actor_temporal_bundle.temporal_records;
  const environment = deriveApprovedInitialEnvironment({
    calendar_record: temporal.find((row) => row.record_id === start.calendar_record_ref.id),
    weather_record: temporal.find((row) => row.record_id === start.weather_record_ref.id),
    calendar_date: start.calendar_date, local_minute_of_day: start.local_minute_of_day,
    random: createRandomSource({ seed: 31 }),
  });
  const transaction = { query: async (sql) => ({ rows: sql.includes('FROM party_runtime.parties')
    ? [{ world_revision_id: worldRevisionId }]
    : sql.includes('ANY($2::text[])') ? [itemPin, actorPin] : [itemPin] }) };
  const owner = createTargetGeneratedFirstEntry({ worldBaseReader,
    verifiedItemCatalog,
    actorBaseAttributesBinding: { schema: 'rus.actor_base_attributes_runtime_binding.v1',
      pin: actorPin, runtime_profile: actorProfile },
    approvedActorTemporalBundle: fixture.approved_actor_temporal_bundle,
    prepareNaturalFirstEntry: finitePorts.prepareFirstEntry,
    resolvePresenceRulesFirstArrival: resolver,
    finiteFirstEntryProfile: profiles.finite_first_entry.profile,
    canonicalFiniteApplicability: profiles.finite_first_entry.canonicalNaturalApplicability,
    readFactualContext: async () => ({ ok: true, party_id: 'target-o1-generated-entry',
      world_revision_id: worldRevisionId, environment, calendar_profile: fixture.calendar_profile,
      started_at: { whole_minutes: '0', subminute_numerator: '0', subminute_denominator: '1' },
      recheck: async () => ({ ok: true }) }) });
  const result = await owner({ transaction,
    request: { party_id: 'target-o1-generated-entry', g4 },
    change_set_id: 'entry-change', dependency_pins: { pins: [], canonical_digest: canonicalDigest([]) },
    selection: { selected_template: { template_id: generationTemplate.id,
      template_version: generationTemplate.version, template_digest: generationTemplate.canonical_digest } },
    proposal });
  assert.equal(result.ok, true, JSON.stringify(result.error));
  assert.ok(result.approved_write_sets.length > 0, 'whole generated first-entry must prepare writes');
  const aggregateWrite = result.approved_write_sets.flatMap((set) => set.inserts ?? [])
    .find((row) => row.target_table === 'party_ordinary_materialization_aggregates');
  assert.ok(aggregateWrite, 'generated first-entry must include ordinary aggregate');
  assert.ok(aggregateWrite.record.aggregate_payload.presence_resolutions.some(({ rule_ref }) =>
    rule_ref === `${gap.rule_id}@${gap.rule_version}`), 'outside-tuple rule must use generic path');
  assert.equal(JSON.stringify(result).includes('PRESENCE_RULE_ITEM_TEMPLATE_DATA_GAP'), false);
});

test('O1 tuple mismatches keep the generic PF path independent of each tuple field', async () => {
  const { selector, templateBackedItemRefs, supported } = await o1Inputs();
  const tuple = selector.applicability.selectors[0];
  const variants = [
    ['G1', (value) => { value.o1Applicability.tuple.g1_ref += '-other'; }],
    ['G4', (value) => { value.o1Applicability.tuple.g4_ref += '-other'; }],
    ['G5', (value) => { value.o1Applicability.tuple.canonical_g5_ref += '-other'; }],
    ['PF id', (value) => { value.o1Applicability.tuple.place_family_refs[0].source_pf_id = 'pf_other'; }],
    ['PF version', (value) => { value.o1Applicability.tuple.place_family_refs[0].place_family_ref = 'pf_peasant_homestead@2'; }],
    ['rule version', (value) => { value.rules[0].rule_version += 1; }],
  ];
  for (const [name, mutate] of variants) {
    const strictContext = await resolvePresence({ selector, templateBackedItemRefs: new Set(),
      tuple, rules: [supported] });
    const strict = apply(strictContext, `strict-control-${name}`);
    assert.equal(strict.presence_gaps.length, 1, name);
    assert.equal(strict.presence_gaps[0].reason, 'template_missing', name);
    assert.deepEqual(strict.aggregate.presence_resolutions, [], name);

    const altered = structuredClone(strictContext);
    mutate(altered);
    const generic = apply(altered, `generic-mismatch-${name}`);
    assert.deepEqual(generic.presence_gaps, [], name);
    assert.ok(generic.aggregate.presence_resolutions.some(({ rule_ref }) =>
      rule_ref === `${supported.rule_id}@${supported.rule_version + Number(name === 'rule version')}`), name);
  }

  const otherApproved = selector.applicability.selectors[1];
  const foreign = await resolvePresence({ selector, templateBackedItemRefs: new Set(),
    tuple: otherApproved, rules: [supported] });
  assert.deepEqual(foreign.o1Applicability.tuple.place_family_refs, [{
    source_pf_id: supported.scope_ref,
    place_family_ref: otherApproved.place_family_ref,
  }], 'resolver preserves the normalized source PF id for a foreign approved tuple');
  const foreignSelected = apply(foreign, 'other-approved-normalized-pf');
  assert.equal(foreignSelected.presence_gaps.length, 1,
    'approved foreign tuple retains normalized source PF id and stays strict');
  assert.deepEqual(foreignSelected.aggregate.presence_resolutions, []);

  await assert.rejects(resolvePresence({ selector, templateBackedItemRefs, tuple,
    rules: [supported], runtimeCatalogPinOverride: { ...runtimeCatalogPin,
      catalog_digest: '0'.repeat(64) } }),
  { code: 'M2C_NPC_WAVE_ACTIVATION_PIN_MISMATCH' });
});
