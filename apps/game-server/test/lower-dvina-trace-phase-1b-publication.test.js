import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  cp,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadLowerDvinaTracePhase1BPublication
} from '../src/internal/lower-dvina-trace-phase-1b-publication.js';
import {
  loadHistoricalLowerDvinaTracePhase1BPublication
} from '../src/internal/lower-dvina-trace-phase-1b-historical-publication.js';
import { TRACE_REVISION27_PHASE_1A_MANIFEST_DIGEST } from
  '../src/internal/lower-dvina-trace-revision-27-publication.js';

test('publication loader rejects an exact binding digest mismatch', async (t) => {
  const root = await copyPublicationClosure();
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root,
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v20',
    'publication-binding.json');
  const binding = JSON.parse(await readFile(path, 'utf8'));
  binding.public_metadata.title = 'Подменённое название';
  await writeFile(path, `${JSON.stringify(binding, null, 2)}\n`);
  await assert.rejects(
    () => loadLowerDvinaTracePhase1BPublication({ rootDir: root }),
    { code: 'TRACE_NPC_ACTOR_STEP_PUBLICATION_INVALID' }
  );
});

test('publication root pin rejects resealed semantic mutations', async (t) => {
  for (const [label, mutate] of [
    [
      'opening prose',
      (binding) => {
        binding.opening_projection.opening_prose =
          'Подменённая смысловая проза.';
      }
    ],
    [
      'public metadata',
      (binding) => {
        binding.public_metadata.description =
          'Подменённое описание сценария.';
      }
    ],
    [
      'materializer version',
      (binding) => {
        binding.execution_identity.materializer_version =
          'code_materializer_v3';
      }
    ],
    [
      'RNG version',
      (binding) => {
        binding.execution_identity.rng_algorithm_id =
          'future_rng_v2';
      }
    ]
  ]) {
    const root = await copyPublicationClosure();
    t.after(() => rm(root, { recursive: true, force: true }));
    await mutateAndResealPublication(root, mutate);
    await assert.rejects(
      () => loadLowerDvinaTracePhase1BPublication({ rootDir: root }),
      { code: 'TRACE_NPC_ACTOR_STEP_PUBLICATION_INVALID' },
      label
    );
  }
});

test('current publication pins exact v20 -> Phase 1A v21 -> revision 25 NPC actor-step chain', async () => {
  const publication = await loadLowerDvinaTracePhase1BPublication();
  assert.equal(publication.manifest.package_id, 'lower_dvina_trace_phase_1b_v20');
  assert.equal(publication.manifest.revision, 20);
  assert.equal(publication.manifest_digest,
    '9a11bf0d2976df85bd5f9d6871e8fed7793ba3cf89da8b57bcae529a425459ce');
  assert.deepEqual(publication.manifest.superseded_package_ref, {
    path: 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v19/manifest.json',
    id: 'lower_dvina_trace_phase_1b_v19',
    revision: 19,
    schema: 'rus.lower_dvina_trace_phase_1b_manifest.v1',
    digest: '1184e6dad56bed75b1b7bbaf700b9fe606109074d361a862249da7cb5c8ffcf7'
  });
  assert.equal(publication.binding.binding_id,
    'lower_dvina_trace_phase_1b_publication_v20');
  assert.equal(publication.binding.revision, 20);
  assert.equal(publication.binding_digest,
    '88e319f2e0b020c4eeb2c1cae3e287a2e1edb3a604859d3ad5c78efd035236a8');
  assert.equal(publication.binding.superseded_binding_ref.digest,
    '8c8b7dd7410de91735f70809c05a95a9272a6a3555c3f7e2901c952f2e099228');
  assert.equal(publication.phase_1a_manifest.package_id,
    'lower_dvina_trace_phase_1a_v21');
  assert.equal(publication.phase_1a_manifest.revision, 21);
  assert.equal(publication.binding.phase_1a_manifest_ref.digest,
    '0baa2032acba1b72ad1c6144f7fce0a428a6d02fa03fc12d6a0b77303bf8af2c');
  assert.equal(publication.phase_1a_manifest.superseded_package_ref.digest,
    'd11563d81d0249fcd8efe95a99cb53ace6f8ecb76ffab42a6bb8c16b5eb2cd6b');
  assert.equal(publication.definition.revision, 25);
  assert.equal(publication.binding.scenario_definition_ref.digest,
    '3d025b3fef625dfd41426dfc0f2862791ccc9bb5d7ad6659e16205f98da09711');
  assert.equal(
    publication.binding.materializer_binding_id,
    'lower_dvina_trace_phase_1a_materialization_bindings_v21'
  );
});

test('explicit revision 27 identity resolves only the revision 27 publication', async () => {
  const publication = await loadLowerDvinaTracePhase1BPublication({
    phase1AManifestDigest: TRACE_REVISION27_PHASE_1A_MANIFEST_DIGEST,
    scenarioDefinitionRevision: 27
  });
  assert.equal(publication.manifest.package_id, 'lower_dvina_trace_phase_1b_v22');
  assert.equal(publication.binding.execution_identity.scenario_definition_revision, 27);
  assert.equal(publication.definition.resolved_policy_refs.body_environment_profiles.revision, 7);
});

test('revision 28 selects the new public presentation over the shared Phase 1A pin', async () => {
  const publication = await loadLowerDvinaTracePhase1BPublication({
    phase1AManifestDigest: TRACE_REVISION27_PHASE_1A_MANIFEST_DIGEST,
    scenarioDefinitionRevision: 28
  });
  assert.equal(publication.manifest.package_id, 'lower_dvina_trace_phase_1b_v23');
  assert.equal(publication.definition.revision, 28);
  assert.deepEqual(publication.scene_presentation.locations.map(
    ({ player_visible_physical_facts: facts }) => facts
  ).flat().some((fact) => /cold|wet|exposed|landscape_basis|economic_basis/i.test(fact)), false);
});

test('revision 31 pins scene presentation v2 without scene authority', async () => {
  const publication = await loadLowerDvinaTracePhase1BPublication({
    scenarioDefinitionRevision: 31
  });
  const camp = publication.scene_presentation.locations.find(
    ({ location_ref }) => location_ref === 'trace_ld_v1_loc_fishing_camp'
  );
  assert.equal(publication.manifest.package_id, 'lower_dvina_trace_phase_1b_v26');
  assert.equal(publication.definition.revision, 31);
  assert.equal(publication.scene_presentation.presentation_id,
    'lower_dvina_trace_scene_presentation_v2');
  assert.deepEqual(camp.player_visible_physical_facts.slice(-5), [
    'Сухой песчаный берег тянется вдоль воды.',
    'Сети развешены на кольях и между навесами.',
    'Лодки стоят у воды.',
    'Под навесом сложены свёрнутые снасти.',
    'В воздухе держится речная сырость.'
  ]);
  assert.equal(/entity|inventory|affordance/i.test(JSON.stringify(camp)), false);
});

test('current publication rejects tampered Phase 1A v21 or revision 25 content', async (t) => {
  for (const [relative, code] of [
    [
      'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v21/manifest.json',
      'TRACE_NPC_ACTOR_STEP_PUBLICATION_INVALID'
    ],
    [
      'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m13-content/definition.json',
      'TRACE_NPC_ACTOR_STEP_PUBLICATION_INVALID'
    ]
  ]) {
    const root = await copyPublicationClosure();
    t.after(() => rm(root, { recursive: true, force: true }));
    const path = join(root, relative);
    await writeFile(path, `${await readFile(path, 'utf8')} `);
    await assert.rejects(
      () => loadLowerDvinaTracePhase1BPublication({ rootDir: root }),
      { code },
      relative
    );
  }
});

test('publication loader rejects resealed dependency and lineage mutations', async (t) => {
  for (const [label, mutate] of [
    [
      'Phase 1A manifest ref',
      (binding) => {
        binding.phase_1a_manifest_ref.digest = '0'.repeat(64);
      }
    ],
    [
      'definition ref',
      (binding) => {
        binding.scenario_definition_ref.revision = 4;
      }
    ],
    [
      'production lineage',
      (binding) => {
        binding.world_compatibility.lineage[1].parent_revision_id =
          'unknown-parent';
      }
    ]
  ]) {
    const root = await copyPublicationClosure();
    t.after(() => rm(root, { recursive: true, force: true }));
    await mutateAndResealPublication(root, mutate);
    await assert.rejects(
      () => loadLowerDvinaTracePhase1BPublication({ rootDir: root }),
      { code: 'TRACE_NPC_ACTOR_STEP_PUBLICATION_INVALID' },
      label
    );
  }
});

test('NPC actor-step loader leaves historical v12 and revision 24 artifacts untouched', async (t) => {
  const root = await copyPublicationClosure();
  t.after(() => rm(root, { recursive: true, force: true }));
  const historical = [
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v12/manifest.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v20/manifest.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m12-content/definition.json'
  ];
  const before = await Promise.all(historical.map((path) => readFile(join(root, path), 'utf8')));
  await loadLowerDvinaTracePhase1BPublication({ rootDir: root });
  assert.deepEqual(await Promise.all(historical.map((path) => readFile(join(root, path), 'utf8'))), before);
});

test('publication cutover rejects mutations of exact superseded packages', async (t) => {
  for (const relative of [
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v19/manifest.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v19/publication-binding.json'
  ]) {
    const root = await copyPublicationClosure();
    t.after(() => rm(root, { recursive: true, force: true }));
    const path = join(root, relative);
    const raw = await readFile(path, 'utf8');
    await writeFile(path, `${raw} `);
    await assert.rejects(
      () => loadLowerDvinaTracePhase1BPublication({ rootDir: root }),
      { code: 'TRACE_NPC_ACTOR_STEP_PUBLICATION_INVALID' },
      relative
    );
  }
});

test('historical recovery resolves only the exact immutable v1 publication', async (t) => {
  const digest =
    'b458b646afe745e4f3eda6308eb3fa18ceeb6867d3f16fe87088d3a96c46e605';
  const root = await copyPublicationClosure();
  t.after(() => rm(root, { recursive: true, force: true }));
  const historical = await loadLowerDvinaTracePhase1BPublication({
    rootDir: root,
    phase1AManifestDigest: digest
  });
  assert.equal(historical.binding.revision, 1);
  const definitionPath = join(
    root,
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d-v2/definition.json'
  );
  const raw = await readFile(definitionPath, 'utf8');
  await writeFile(definitionPath, `${raw} `);
  await assert.rejects(
    () => loadLowerDvinaTracePhase1BPublication({
      rootDir: root,
      phase1AManifestDigest: digest
    }),
    { code: 'TRACE_PHASE_1B_HISTORICAL_ROOT_MISMATCH' }
  );
  await assert.rejects(
    () => loadLowerDvinaTracePhase1BPublication({
      rootDir: root,
      phase1AManifestDigest: '0'.repeat(64)
    }),
    { code: 'TRACE_PHASE_1B_PUBLICATION_IDENTITY_UNKNOWN' }
  );
});

test('historical recovery resolves the exact immutable v2 publication', async (t) => {
  const digest =
    'c6fcf966ff9638d6649eca90fd7ec45c8252620ce02908c4354e9bd934d0f895';
  const root = await copyPublicationClosure();
  t.after(() => rm(root, { recursive: true, force: true }));
  const historical = await loadLowerDvinaTracePhase1BPublication({
    rootDir: root,
    phase1AManifestDigest: digest
  });
  assert.equal(historical.binding.revision, 2);
  assert.equal(historical.definition.revision, 6);
  const definitionPath = join(
    root,
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d-v3/definition.json'
  );
  await writeFile(definitionPath, `${await readFile(definitionPath, 'utf8')} `);
  await assert.rejects(
    () => loadLowerDvinaTracePhase1BPublication({
      rootDir: root,
      phase1AManifestDigest: digest
    }),
    { code: 'TRACE_PHASE_1B_HISTORICAL_ROOT_MISMATCH' }
  );
});

test('historical recovery resolves only the exact immutable v4 publication', async (t) => {
  const digest =
    'dc7e58dfa3382a2a91dd1954c645ad630c8de3b4fb42bdc68888cd72d5fff44f';
  const root = await copyPublicationClosure();
  t.after(() => rm(root, { recursive: true, force: true }));
  const historical = await loadLowerDvinaTracePhase1BPublication({
    rootDir: root,
    phase1AManifestDigest: digest
  });
  assert.equal(historical.binding.revision, 4);
  assert.equal(historical.definition.revision, 9);
  const manifestPath = join(
    root,
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v4/manifest.json'
  );
  await writeFile(manifestPath, `${await readFile(manifestPath, 'utf8')} `);
  await assert.rejects(
    () => loadLowerDvinaTracePhase1BPublication({
      rootDir: root,
      phase1AManifestDigest: digest
    }),
    { code: 'TRACE_PHASE_1B_HISTORICAL_ROOT_MISMATCH' }
  );
});

test('historical revision 11 resolves by its saved Phase 1A manifest digest', async (t) => {
  const root = await copyPublicationClosure();
  t.after(() => rm(root, { recursive: true, force: true }));
  const historical = await loadLowerDvinaTracePhase1BPublication({
    rootDir: root,
    phase1AManifestDigest:
      '5cc5a06136b2f4cbdb8b842558b0d749a2c70c3eff0f1c088aca9a7e0395d1a9'
  });
  assert.equal(historical.binding.revision, 6);
  assert.equal(historical.phase_1a_manifest.revision, 7);
  assert.equal(historical.definition.revision, 11);
});

test('historical v7 publication and revision 12 resolve by their immutable pin', async (t) => {
  const root = await copyPublicationClosure();
  t.after(() => rm(root, { recursive: true, force: true }));
  const digest =
    'b696a7420a3331915a2c00827f455671e54b005fbe29bf6749fa90482f73a10b';
  const historical = await loadLowerDvinaTracePhase1BPublication({
    rootDir: root,
    phase1AManifestDigest: digest
  });
  assert.equal(historical.manifest.revision, 7);
  assert.equal(historical.binding.revision, 7);
  assert.equal(historical.phase_1a_manifest.revision, 8);
  assert.equal(historical.definition.revision, 12);
  assert.equal(historical.manifest_digest,
    'a7393882ab5528fb3d78115b159f5d9486de9e91b3934eaba5cc694f87125e8d');
  assert.equal(historical.binding_digest,
    'f9e10a38b349ab1ce4136185754acea0a2bae22f626f84ab6d8ce128eeabe4e4');

  const definitionPath = join(root,
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-6-content/definition.json');
  await writeFile(definitionPath,
    `${await readFile(definitionPath, 'utf8')} `);
  await assert.rejects(
    () => loadLowerDvinaTracePhase1BPublication({
      rootDir: root,
      phase1AManifestDigest: digest
    }),
    { code: 'TRACE_PHASE_1B_HISTORICAL_ROOT_MISMATCH' }
  );
});

test('historical recovery rejects an absent or unknown persisted identity', async (t) => {
  const root = await copyPublicationClosure();
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const phase1AManifestDigest of [undefined, '0'.repeat(64)]) {
    await assert.rejects(
      () => loadHistoricalLowerDvinaTracePhase1BPublication({
        rootDir: root,
        phase1AManifestDigest
      }),
      { code: 'TRACE_PHASE_1B_HISTORICAL_IDENTITY_UNKNOWN' }
    );
  }
});

async function copyPublicationClosure() {
  const root = await mkdtemp(join(tmpdir(), 'trace-phase-1b-'));
  for (const relative of [
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v20',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v19',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v18',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v17',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v16',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v15',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v14',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v13',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v12',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v11',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v10',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v9',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v8',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v6',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v5',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v4',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v3',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v2',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v7',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v15',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v16',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v17',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v18',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v19',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v20',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v21',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v12/manifest.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v14/manifest.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v13/manifest.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v11/manifest.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v10/manifest.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v9/manifest.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v8/manifest.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v7/manifest.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v6/manifest.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v5/manifest.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v4/manifest.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v3/manifest.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v2/manifest.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a/manifest.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m7-content',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m8-content',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m9-content',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m10-content',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m11-content',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m12-content',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m13-content',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-6-content/definition.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m4-content/definition.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m6-content/definition.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m5-content/definition.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m3-content/definition.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m2-content/definition.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m1-content/definition.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-5-content/definition.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d-v4/definition.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d-v3/definition.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-0d-v2/definition.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-4-content/definition.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-3-content-v2/definition.json',
    'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v2/manifest.json',
    'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v3/manifest.json',
    'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v4/manifest.json',
    'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v5/manifest.json'
  ]) {
    await cp(relative, join(root, relative), { recursive: true });
  }
  return root;
}

async function mutateAndResealPublication(root, mutate) {
  const directory = join(
    root,
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v20'
  );
  const bindingPath = join(directory, 'publication-binding.json');
  const manifestPath = join(directory, 'manifest.json');
  const binding = JSON.parse(await readFile(bindingPath, 'utf8'));
  mutate(binding);
  const raw = `${JSON.stringify(binding, null, 2)}\n`;
  await writeFile(bindingPath, raw);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.content_refs.publication_binding.digest =
    createHash('sha256').update(raw).digest('hex');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
