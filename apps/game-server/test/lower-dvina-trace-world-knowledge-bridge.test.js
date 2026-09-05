import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createWorldKnowledgeCore } from '@rus/world-knowledge';
import {
  loadLowerDvinaTraceMaterializationBundle,
  materializeLowerDvinaTraceParty
} from '../src/internal/lower-dvina-trace-phase-1a.js';
import {
  assertLowerDvinaTraceWorldKnowledgePreflight,
  LOCATION_PROFILE_MAPPING_SYSTEM
} from '../src/internal/lower-dvina-trace-world-knowledge-bridge.js';

const rootDir = process.cwd();

test('WK bridge preserves required profile support when linked facts exceed the bounded slice', async () => {
  const [bundle, scenarioBundle] = await Promise.all([
    runtimeBundle(),
    loadLowerDvinaTraceMaterializationBundle({ rootDir, scenarioDefinitionRevision: 32 })
  ]);
  const worldKnowledge = { bundle, core: createWorldKnowledgeCore(bundle) };
  const result = assertLowerDvinaTraceWorldKnowledgePreflight({
    worldKnowledge, scenarioBundle
  });
  assert.equal(result.length, 7);
  assert.deepEqual(result, [...result].sort());
});

test('WK materialization substrate covers real trace location and participant premise families', async () => {
  const [bundle, scenarioBundle] = await Promise.all([runtimeBundle(), scenario32()]);
  const core = createWorldKnowledgeCore(bundle);
  // These are acceptance probes, not a production vocabulary: each query keeps
  // its real revision-32 profile context and checks only its stated premise.
  const probes = [
    { family: 'natural_resource', location: 'trace_ld_v1_loc_wreck_shore',
      domains: ['environment'], hints: ['river', 'willow', 'fish'],
      expected_claim_refs: ['claim:regional-fish-exploitation',
        'claim:white-willow-depends-on-moist-lit-riparian-habitat'] },
    { family: 'work_tools', location: 'trace_ld_v1_loc_fishing_camp',
      domains: ['craft_technology', 'material_culture'], hints: ['fishing', 'net', 'hook'],
      expected_claim_refs: ['claim:population-net-cord', 'claim:population-iron-hook'] },
    { family: 'heat_light', location: 'trace_ld_v1_loc_old_drying_shed',
      domains: ['craft_technology', 'material_culture'], hints: ['drying', 'fire', 'light'],
      expected_claim_refs: ['claim:ha-firesteel-ignition', 'claim:fuel-iron-candlestick-form'] },
    { family: 'storage_food', location: 'trace_ld_v1_loc_zhdanko_storehouse',
      domains: ['architecture_settlement', 'material_culture', 'biology_physiology'],
      hints: ['storage', 'fish', 'grain'],
      expected_claim_refs: ['claim:population-household-storage',
        'claim:population-storage-vessels',
        'claim:stored-grain-condition-depends-on-temperature-moisture'] },
    // Food availability is a separate need from storage conditions. A single
    // broad top-12 slice need not retain every premise as the corpus grows.
    { family: 'fish_as_food', location: 'trace_ld_v1_loc_zhdanko_storehouse',
      domains: ['material_culture', 'biology_physiology'], hints: ['fish', 'food'],
      expected_claim_refs: ['claim:population-fish-food'] },
    { family: 'boat_transport', participant: 'trace_ld_v1_onisim_hired_boatman_v1',
      domains: ['craft_technology', 'material_culture'], hints: ['boat', 'transport'],
      expected_claim_refs: ['claim:population-boat-context', 'claim:population-wood-boat'] },
    { family: 'ordinary_clothing_material', participant: 'trace_ld_v1_eremey_local_fisher_v1',
      domains: ['material_culture'], hints: ['clothing', 'shirt', 'wool'],
      expected_claim_refs: ['claim:clothing-wool-shirt'] },
    { family: 'garment_fastening', participant: 'trace_ld_v1_eremey_local_fisher_v1',
      domains: ['material_culture'], hints: ['shirt', 'collar', 'button'],
      expected_claim_refs: ['claim:clothing-button-shirt'] },
    { family: 'garment_underarm_construction', participant: 'trace_ld_v1_eremey_local_fisher_v1',
      domains: ['material_culture'], hints: ['shirt', 'underarm', 'gusset'],
      expected_claim_refs: ['claim:clothing-shirt-gussets'] },
    { family: 'storage_worker', participant: 'trace_ld_v1_ratsha_storehouse_helper_v1',
      domains: ['architecture_settlement', 'material_culture', 'biology_physiology',
        'npc_daily_life'], hints: ['storage', 'grain'],
      expected_claim_refs: ['claim:population-storage-role',
        'claim:stored-grain-condition-depends-on-temperature-moisture'] }
  ];
  const results = probes.map((probe) => substrateProbe({ bundle, core,
    scenarioBundle, probe }));
  const missing = results.filter(({ missing_claim_refs }) =>
    missing_claim_refs.length > 0);
  assert.deepEqual(missing, [], `Missing substrate families: ${JSON.stringify(results)}`);
});

test('WK bridge fails closed for absent, unknown, expired, universal, source-less, excluded, and disputed support', async (t) => {
  await expectGap(t, 'mapping missing', 'TRACE_WORLD_KNOWLEDGE_MAPPING_MISSING',
    (bundle) => removeMapping(bundle));
  await expectGap(t, 'unknown qualifier', 'TRACE_WORLD_KNOWLEDGE_CONTEXTUAL_CLAIM_MISSING',
    (bundle) => contextualClaim(bundle).qualifiers.confidence = 'unknown');
  await expectGap(t, 'expired year', 'TRACE_WORLD_KNOWLEDGE_CONTEXTUAL_CLAIM_MISSING',
    (bundle) => contextualClaim(bundle).applicability.time = {
      from: 1100, to: 1200, precision: 'range'
    });
  await expectGap(t, 'universal-only', 'TRACE_WORLD_KNOWLEDGE_CONTEXTUAL_CLAIM_MISSING',
    (bundle) => contextualClaim(bundle).applicability = { context_scope: 'universal' });
  await expectGap(t, 'source missing', 'TRACE_WORLD_KNOWLEDGE_CONTEXTUAL_CLAIM_MISSING',
    (bundle) => {
      const claim = contextualClaim(bundle);
      const evidence = bundle.evidence.find((entry) =>
        entry.evidence_ref === claim.evidence_refs[0]);
      bundle.sources = bundle.sources.filter((entry) =>
        entry.source_ref !== evidence.source_ref);
    });
  await expectGap(t, 'excluded slice', 'TRACE_WORLD_KNOWLEDGE_CONTEXTUAL_CLAIM_MISSING',
    null, (core) => ({ resolveWorldKnowledge(query) {
      return { ...core.resolveWorldKnowledge(query), verdict: 'excluded' };
    } }));
  await expectGap(t, 'disputed slice', 'TRACE_WORLD_KNOWLEDGE_CONTEXTUAL_CLAIM_MISSING',
    null, (core) => ({ resolveWorldKnowledge(query) {
      return { ...core.resolveWorldKnowledge(query), disputes: [{ claim_ref: 'x' }] };
    } }));
});

test('Phase 1A checks WK before a materialization commit and skips it for an exact replay', async () => {
  const request = phase1ARequest();
  const bundle = await runtimeBundle();
  removeMapping(bundle);
  let queryCount = 0;
  let commitCount = 0;
  const unavailable = { bundle, core: { resolveWorldKnowledge() {
    queryCount += 1;
    throw new Error('must not query an unmapped bundle');
  } } };
  await assert.rejects(() => materializeLowerDvinaTraceParty({
    request,
    domainCatalogPinLoader: async () => ({}),
    partyDatabaseSchema: {}, worldBaseReferenceSnapshot: {},
    repository: emptyRepository(),
    stage25Ports: { commit: async () => { commitCount += 1; } },
    worldKnowledge: unavailable, rootDir
  }), { code: 'TRACE_WORLD_KNOWLEDGE_MAPPING_MISSING' });
  assert.equal(queryCount, 0);
  assert.equal(commitCount, 0);

  const replay = { request_identity: structuredClone(request) };
  const result = await materializeLowerDvinaTraceParty({
    request,
    repository: { async loadInternal() { return replay; } },
    stage25Ports: {}, worldKnowledge: unavailable
  });
  assert.equal(result.status, 'replayed');
  assert.equal(queryCount, 0);
});

async function expectGap(parent, name, code, mutate, coreWrapper = null) {
  await parent.test(name, async () => {
    const bundle = await runtimeBundle();
    mutate?.(bundle);
    const core = createWorldKnowledgeCore(bundle);
    const worldKnowledge = { bundle, core: coreWrapper ? coreWrapper(core) : core };
    const scenarioBundle = await scenario32();
    assert.throws(() => assertLowerDvinaTraceWorldKnowledgePreflight({
      worldKnowledge, scenarioBundle
    }), { code });
  });
}

function removeMapping(bundle) {
  const concept = bundle.concepts.find((entry) => entry.external_mappings?.some((mapping) =>
    mapping.system === LOCATION_PROFILE_MAPPING_SYSTEM
      && mapping.ref === 'trace_ld_v1_loc_fishing_camp'));
  concept.external_mappings = concept.external_mappings.filter((entry) =>
    entry.system !== LOCATION_PROFILE_MAPPING_SYSTEM);
}

function contextualClaim(bundle) {
  const concept = mappedLocationConcept(bundle);
  return bundle.claims.find((claim) => claim.subject_ref === concept.concept_ref
    && claim.polarity === 'support'
    && claim.applicability?.context_scope !== 'universal');
}

function mappedLocationConcept(bundle) {
  return bundle.concepts.find((concept) => concept.external_mappings?.some((entry) =>
    entry.system === LOCATION_PROFILE_MAPPING_SYSTEM));
}

async function runtimeBundle() {
  return JSON.parse(await readFile(
    'data/world-catalogs/novgorod/world-knowledge/production-v1/runtime-bundle.json', 'utf8'
  ));
}

async function scenario32() {
  return loadLowerDvinaTraceMaterializationBundle({ rootDir, scenarioDefinitionRevision: 32 });
}

function substrateProbe({ bundle, core, scenarioBundle, probe }) {
  const year = scenarioBundle.materialization_bindings.player_dossier_projection.historical_year;
  const location = probe.location == null ? null
    : scenarioBundle.location_topology_set.location_profiles.find(({ location_profile_id }) =>
      location_profile_id === probe.location);
  const participant = probe.participant == null ? null
    : scenarioBundle.participant_profile_set.profiles.find(({ profile_id }) =>
      profile_id === probe.participant);
  assert.ok(location ?? participant, `missing profile for ${probe.family}`);
  const context = location == null ? {
    time: { year },
    place_refs: ['region_novgorod_land',
      scenarioBundle.materialization_bindings.player_dossier_projection.knowledge.region_id],
    actor_facets: { role_ref: participant.social_role_id,
      occupation_ref: participant.occupation_id },
    conditions: {}
  } : {
    time: { year },
    place_refs: ['region_novgorod_land', location.region_ref,
      location.location_profile_id],
    actor_facets: {},
    conditions: { location_type: location.location_profile_id }
  };
  const slice = core.resolveWorldKnowledge({
    schema: 'world_knowledge_query_v1', pack_ref: bundle.manifest.pack_ref,
    pack_revision: bundle.manifest.revision_id, purpose: 'materialization_support',
    query_locale: 'en', domains: probe.domains, focus_refs: [],
    requested_predicates: [], search_hints: probe.hints, context,
    budget: { max_facts: 12, max_candidates: 12, max_context_chars: 5000 }
  });
  const returned_claim_refs = slice.facts.map(({ claim_ref }) => claim_ref);
  return { family: probe.family, expected_claim_refs: probe.expected_claim_refs,
    returned_claim_refs, missing_claim_refs: probe.expected_claim_refs.filter((ref) =>
      !returned_claim_refs.includes(ref)) };
}

function phase1ARequest() {
  return {
    party_id: 'party-wk-preflight-test', scenario_id: 'lower_dvina_trace_v1',
    scenario_definition_revision: 32, scenario_manifest_digest: 'manifest-test',
    world_revision_id: 'world-test', world_catalog_digest: 'catalog-test',
    materializer_version: 'test', rng_algorithm_id: 'test', seed_context: 'test',
    idempotency_key: 'wk-preflight-key', trigger: 'new_game', occurrence: 0,
    world_compatibility: null
  };
}

function emptyRepository() {
  return { async loadInternal() { return null; }, async loadIdempotency() { return null; } };
}
