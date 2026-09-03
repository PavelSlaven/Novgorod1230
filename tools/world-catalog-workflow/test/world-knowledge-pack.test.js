import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { loadWorldKnowledgeAuthoringInput } from '../src/world-knowledge-authoring-loader.js';
import {
  WorldKnowledgePackValidationError,
  compileWorldKnowledgePack,
  validateWorldKnowledgeAuthoringPack
} from '../src/world-knowledge-pack.js';

const PILOT_URL = new URL('../../../data/world-catalogs/novgorod/world-knowledge/pilot-v1/authoring.json', import.meta.url);
const PILOT_RUNTIME_URL = new URL('../../../data/world-catalogs/novgorod/world-knowledge/pilot-v1/runtime-bundle.json', import.meta.url);

async function pilotPack() {
  return JSON.parse(await readFile(PILOT_URL, 'utf8'));
}

async function invalidPack(mutator, expected) {
  const pack = await pilotPack();
  mutator(pack);
  assert.equal(validateWorldKnowledgeAuthoringPack(pack).ok, false);
  assert.match(validateWorldKnowledgeAuthoringPack(pack).errors.join('\n'), expected);
}

test('World Knowledge pilot pack compiles deterministically without runtime activation', async () => {
  const pack = await pilotPack();
  const validation = validateWorldKnowledgeAuthoringPack(pack);
  assert.deepEqual(validation, { ok: true, errors: [] });

  const first = compileWorldKnowledgePack(pack);
  const second = compileWorldKnowledgePack(pack);
  assert.deepEqual(first, second);
  assert.equal(first.schema, 'world_knowledge_runtime_bundle_v1');
  assert.equal(first.manifest.status, 'reviewed');
  assert.equal(first.manifest.embedding_profile_ref, null);
  assert.deepEqual(first.exact_indexes.domain_to_claim_refs.economy_trade, [
    'claim:novgorod-1220-1240-debt-record-attested'
  ]);
  assert.deepEqual(first.exact_indexes.domain_to_claim_refs.law_institutions, [
    'claim:novgorod-1220-1240-judicial-record-attested'
  ]);
  assert.equal(Object.isFrozen(first), true);
  assert.deepEqual(JSON.parse(await readFile(PILOT_RUNTIME_URL, 'utf8')), first);
});

test('ru and en retrieval surfaces point to the same canonical World Knowledge claim', async () => {
  const bundle = compileWorldKnowledgePack(await pilotPack());
  const claimRef = 'claim:novgorod-1220-1240-debt-record-attested';

  assert.ok(bundle.lexical_indexes.ru['долговая'].includes(claimRef));
  assert.ok(bundle.lexical_indexes.en.debt.includes(claimRef));
  assert.equal(bundle.claims.find((claim) => claim.claim_ref === claimRef)?.claim_ref, claimRef);
});

test('World Knowledge validation rejects unknown predicates and ungrounded hard exclusions', async () => {
  const pack = await pilotPack();
  pack.claims[0].predicate = 'invented_predicate';
  pack.claims[1].polarity = 'support';
  pack.claims[1].hard_exclusion = {
    eligible: true,
    basis_kind: 'introduced_after_context'
  };

  const validation = validateWorldKnowledgeAuthoringPack(pack);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes('predicate is not registered')));
  assert.ok(validation.errors.some((error) => error.includes('hard_exclusion requires exclude polarity')));
  assert.throws(() => compileWorldKnowledgePack(pack), (error) => {
    assert.ok(error instanceof WorldKnowledgePackValidationError);
    assert.equal(error.code, 'WORLD_KNOWLEDGE_PACK_INVALID');
    return true;
  });
});

test('World Knowledge records describe facts, not an action whitelist', async () => {
  const bundle = compileWorldKnowledgePack(await pilotPack());
  assert.equal('actions' in bundle, false);
  assert.equal('commands' in bundle, false);
  assert.equal('recipes' in bundle, false);
});

test('World Knowledge validation rejects malformed typed claims and factual policy fields', async () => {
  await invalidPack((pack) => { pack.claims[0].object.kind = 'arbitrary_json'; }, /invalid object kind/u);
  await invalidPack((pack) => { pack.claims[0].applicability = {}; }, /explicit applicability/u);
  await invalidPack((pack) => { pack.claims[0].qualifiers.confidence = 'certain'; }, /confidence is invalid/u);
  await invalidPack((pack) => { pack.claims[0].knowledge_access.class = 'omniscient'; }, /class is invalid/u);
  await invalidPack((pack) => { pack.claims[0].knowledge_access.required_facets = [{ unsafe: true }]; }, /non-empty strings/u);
  await invalidPack((pack) => { pack.sources[0].authors = [7]; }, /non-empty strings/u);
  await invalidPack((pack) => { pack.sources[0].rights.redistribution = 7; }, /rights metadata/u);
  await invalidPack((pack) => { pack.evidence[0].anchor.record_id = 7; }, /anchor values must be strings/u);
  await invalidPack((pack) => { pack.claims[0].applicability = { places: [] }; }, /places must not be empty/u);
  await invalidPack((pack) => { pack.claims[0].applicability = { actors: { unregistered_facet: 'x' } }; }, /unregistered_facet is unknown/u);
  await invalidPack((pack) => { pack.claims[0].applicability = { conditions: [{ facet: 'season', operator: 'equals', value: { arbitrary: true } }] }; }, /value is invalid/u);
  await invalidPack((pack) => { pack.claims[0].applicability.time = { from: 1230, precision: 'before' }; }, /before requires only year/u);
  await invalidPack((pack) => { pack.coverage_profiles[0].question_classes = []; }, /question_classes/u);
  await invalidPack((pack) => { pack.coverage_profiles[0].scope = { places: [] }; }, /must not be empty/u);
  await invalidPack((pack) => { pack.claims[0].hard_exclusion = { eligible: true, basis_kind: 'not_attested' }; pack.claims[0].polarity = 'exclude'; }, /hard_exclusion basis/u);
  await invalidPack((pack) => { pack.claims[0].conflict_group_ref = { arbitrary: true }; }, /invalid conflict_group_ref/u);
  await invalidPack((pack) => {
    const second = structuredClone(pack.claims[0]);
    second.claim_ref = 'claim:ungrouped-conflict';
    second.object = { kind: 'literal', value: 'different_assertion' };
    pack.claims.push(second);
    for (const locale of pack.manifest.supported_locales) {
      const localization = structuredClone(pack.claim_localizations.find((item) => item.claim_ref === pack.claims[0].claim_ref && item.locale === locale));
      localization.claim_ref = second.claim_ref;
      pack.claim_localizations.push(localization);
    }
  }, /require one explicit conflict group/u);
});

test('World Knowledge conflict groups are explicit and deterministic', async () => {
  const pack = await pilotPack();
  const first = pack.claims[0];
  first.conflict_group_ref = 'wk-conflict:debt-attestation';
  const second = structuredClone(first);
  second.claim_ref = 'claim:novgorod-1220-1240-debt-record-disputed';
  second.object = { kind: 'literal', value: 'not_attested_in_context' };
  second.evidence_refs = [pack.evidence[0].evidence_ref];
  pack.claims.push(second);
  for (const locale of pack.manifest.supported_locales) {
    const localization = structuredClone(pack.claim_localizations.find((item) => item.claim_ref === first.claim_ref && item.locale === locale));
    localization.claim_ref = second.claim_ref;
    localization.runtime_text = locale === 'ru' ? 'Свидетельство оспаривается.' : 'The attestation is disputed.';
    pack.claim_localizations.push(localization);
  }
  const bundle = compileWorldKnowledgePack(pack);
  assert.deepEqual(bundle.structured_indexes.conflict_group_to_claim_refs['wk-conflict:debt-attestation'], [first.claim_ref, second.claim_ref]);
});

test('World Knowledge validation enforces quantity/range units through predicate signatures', async () => {
  await invalidPack((pack) => {
    const signature = pack.predicate_registry.economy_trade.attested_use;
    signature.object_kinds = ['quantity'];
    signature.unit_family = 'mass';
    signature.allowed_units = ['kg'];
    pack.claims[0].object = { kind: 'quantity', value: 1, unit: 'm' };
  }, /unit is not allowed/u);
  await invalidPack((pack) => {
    const signature = pack.predicate_registry.economy_trade.attested_use;
    signature.object_kinds = ['range'];
    signature.unit_family = 'mass';
    signature.allowed_units = ['kg'];
    pack.claims[0].object = { kind: 'range', min: 2, max: 1, unit: 'kg' };
  }, /finite min <= max/u);
});

test('World Knowledge compiler emits deterministic structured indexes', async () => {
  const bundle = compileWorldKnowledgePack(await pilotPack());
  assert.deepEqual(bundle.structured_indexes.place_to_claim_refs.region_novgorod_land, [
    'claim:novgorod-1220-1240-debt-record-attested',
    'claim:novgorod-1220-1240-judicial-record-attested'
  ]);
  assert.deepEqual(bundle.structured_indexes.question_class_to_profile_refs.legal_norm, ['wk-profile:law-novgorod-pilot:v1']);
});

test('sharded World Knowledge authoring is order-independent and validates global refs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wk-shards-'));
  try {
    const pack = await pilotPack();
    const first = { schema: 'world_knowledge_authoring_fragment_v1', manifest: pack.manifest, predicate_registry: pack.predicate_registry, sources: pack.sources, evidence: pack.evidence, concepts: pack.concepts };
    const second = { schema: 'world_knowledge_authoring_fragment_v1', claims: pack.claims, coverage_profiles: pack.coverage_profiles, concept_localizations: pack.concept_localizations, claim_localizations: pack.claim_localizations };
    await writeFile(join(directory, 'a.json'), JSON.stringify(first));
    await writeFile(join(directory, 'b.json'), JSON.stringify(second));
    await writeFile(join(directory, 'one.json'), JSON.stringify({ schema: 'world_knowledge_authoring_descriptor_v1', includes: ['a.json', 'b.json'] }));
    await writeFile(join(directory, 'two.json'), JSON.stringify({ schema: 'world_knowledge_authoring_descriptor_v1', includes: ['b.json', 'a.json'] }));
    const one = await loadWorldKnowledgeAuthoringInput(join(directory, 'one.json'));
    const two = await loadWorldKnowledgeAuthoringInput(join(directory, 'two.json'));
    assert.deepEqual(compileWorldKnowledgePack(one), compileWorldKnowledgePack(two));

    second.concepts = [pack.concepts[0]];
    await writeFile(join(directory, 'b.json'), JSON.stringify(second));
    assert.match(validateWorldKnowledgeAuthoringPack(await loadWorldKnowledgeAuthoringInput(join(directory, 'one.json'))).errors.join('\n'), /duplicate concept_ref/u);

    delete second.concepts;
    second.claims[0].subject_ref = 'wk:missing:subject';
    await writeFile(join(directory, 'b.json'), JSON.stringify(second));
    assert.match(validateWorldKnowledgeAuthoringPack(await loadWorldKnowledgeAuthoringInput(join(directory, 'one.json'))).errors.join('\n'), /unknown subject_ref/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('sharded World Knowledge loader rejects traversal outside descriptor root', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wk-traversal-'));
  try {
    const descriptor = join(directory, 'pack.json');
    await writeFile(descriptor, JSON.stringify({ schema: 'world_knowledge_authoring_descriptor_v1', includes: ['../outside.json'] }));
    await assert.rejects(loadWorldKnowledgeAuthoringInput(descriptor), /escapes pack root/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
