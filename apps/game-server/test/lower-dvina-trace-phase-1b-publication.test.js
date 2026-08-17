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
import { loadLowerDvinaTraceMaterializationBundle } from
  '../src/internal/lower-dvina-trace-phase-1a-bundle.js';
import { loadLowerDvinaTraceSpatialSemanticProfile } from
  '../src/internal/lower-dvina-trace-spatial-semantic-profile.js';
import { loadLowerDvinaTraceNpcSemanticProfile } from
  '../src/internal/lower-dvina-trace-npc-semantic-profile.js';

test('publication loader rejects an exact binding digest mismatch', async (t) => {
  const root = await copyPublicationClosure();
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root,
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v19',
    'publication-binding.json');
  const binding = JSON.parse(await readFile(path, 'utf8'));
  binding.public_metadata.title = 'Подменённое название';
  await writeFile(path, `${JSON.stringify(binding, null, 2)}\n`);
  await assert.rejects(
    () => loadLowerDvinaTracePhase1BPublication({ rootDir: root }),
    { code: 'TRACE_PHASE_1B_N1_INVALID' }
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
      { code: 'TRACE_PHASE_1B_N1_INVALID' },
      label
    );
  }
});

test('current publication pins the exact v19 -> Phase 1A v20 -> revision 24 chain', async () => {
  const publication = await loadLowerDvinaTracePhase1BPublication();
  assert.equal(publication.manifest.package_id, 'lower_dvina_trace_phase_1b_v19');
  assert.equal(publication.manifest.revision, 19);
  assert.equal(publication.manifest_digest,
    '7de7a6ffe20750755e7654ad00461ab6c2f4244df5220c1ba862aad6ce99c306');
  assert.deepEqual(publication.manifest.superseded_package_ref, {
    path: 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v18/manifest.json',
    id: 'lower_dvina_trace_phase_1b_v18',
    revision: 18,
    schema: 'rus.lower_dvina_trace_phase_1b_manifest.v1',
    digest: '7a872ccd602cb83c56f4f717a6d424e4d79dbf6f4d1f9ca1ba31f6358c0a88bf'
  });
  assert.equal(publication.binding.binding_id,
    'lower_dvina_trace_phase_1b_publication_v19');
  assert.equal(publication.binding.revision, 19);
  assert.equal(publication.binding_digest,
    '3a64bdc5f22db19417d2ca09d70bc43a68ec4fdb052aa518e8aa728b1db84127');
  assert.equal(publication.binding.superseded_binding_ref.digest,
    '8efc7da30734ce05c357760bd62eb344e90b923825c0755652e61d0c7c156ee1');
  assert.equal(publication.phase_1a_manifest.package_id,
    'lower_dvina_trace_phase_1a_v20');
  assert.equal(publication.phase_1a_manifest.revision, 20);
  assert.equal(publication.binding.phase_1a_manifest_ref.digest,
    '60ebc56de5d04bf91ccd61899d8206d016b3d182157dd523d311aafd244460fd');
  assert.equal(publication.phase_1a_manifest.superseded_package_ref.digest,
    '3ced300f893f659c7a601f995d288ca5bef604e12e9c72352f6386cb9120d2d8');
  assert.equal(publication.definition.revision, 24);
  assert.equal(publication.binding.scenario_definition_ref.digest,
    '996a3106bfccc2f1b2ae131fd1b723cd9e10abcf9ef97b8733f2b31199941065');
  assert.equal(
    publication.binding.materializer_binding_id,
    'lower_dvina_trace_phase_1a_materialization_bindings_v20'
  );
});

test('current publication rejects tampered Phase 1A v20 or revision 24 content', async (t) => {
  for (const [relative, code] of [
    [
      'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v20/manifest.json',
      'TRACE_PHASE_1B_N1_INVALID'
    ],
    [
      'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m12-content/definition.json',
      'TRACE_PHASE_1B_N1_INVALID'
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

test('revision 23 remains S1-only while revision 24 pins N1 and rejects profile drift', async(t)=>{
  const old=await loadLowerDvinaTraceMaterializationBundle({scenarioDefinitionRevision:23});
  assert.equal(Object.hasOwn(old,'npc_semantic_profile'),false);
  const active=await loadLowerDvinaTraceMaterializationBundle({scenarioDefinitionRevision:24});
  assert.equal(active.npc_semantic_profile.profile_id,
    'lower_dvina_trace_n1_zhdanko_o1_profile_v1');
  const root=await copyPublicationClosure();t.after(()=>rm(root,{recursive:true,force:true}));
  const path=join(root,'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m12-content/npc-semantic-profile.json');
  await writeFile(path,`${await readFile(path,'utf8')} `);
  await assert.rejects(()=>loadLowerDvinaTraceNpcSemanticProfile({rootDir:root}),
    {code:'TRACE_N1_PROFILE_INVALID'});
});

test('revision 22 remains an explicit historical F1 pin while revision 23 activates S1 and rejects profile drift', async (t) => {
  const revision22 = await loadLowerDvinaTraceMaterializationBundle({
    scenarioDefinitionRevision: 22
  });
  assert.equal(Object.hasOwn(revision22, 'spatial_semantic_profile'), false);
  const revision23 = await loadLowerDvinaTraceMaterializationBundle({
    scenarioDefinitionRevision: 23
  });
  assert.equal(revision23.spatial_semantic_profile.profile_id,
    'lower_dvina_trace_s1_spatial_semantic_profile_v1');
  const root = await copyPublicationClosure();
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = join(root,
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m11-content/spatial-semantic-profile.json');
  await writeFile(path, `${await readFile(path, 'utf8')} `);
  await assert.rejects(() => loadLowerDvinaTraceSpatialSemanticProfile({
    rootDir: root
  }), { code: 'TRACE_S1_PROFILE_INVALID' });
});

test('production S1 loader rejects a jointly resealed profile outside the active publication chain', async (t) => {
  const root = await copyPublicationClosure();
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = join(root,
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m11-content');
  const profilePath = join(directory, 'spatial-semantic-profile.json');
  const manifestPath = join(directory, 'manifest.json');
  const profile = JSON.parse(await readFile(profilePath, 'utf8'));
  profile.envelopes[1].allowed_descriptors[0].description =
    'Подменённая, но локально переподписанная семантика.';
  const profileRaw = `${JSON.stringify(profile, null, 2)}\n`;
  const profileDigest = createHash('sha256').update(profileRaw).digest('hex');
  await writeFile(profilePath, profileRaw);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.files['spatial-semantic-profile.json'] = profileDigest;
  manifest.content_refs.spatial_semantic_profile.digest = profileDigest;
  manifest.content_digest = digestM11Files(manifest.files);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  await assert.rejects(() => loadLowerDvinaTraceSpatialSemanticProfile({
    rootDir: root
  }), { code: 'TRACE_S1_PROFILE_INVALID' });
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
      { code: 'TRACE_PHASE_1B_N1_INVALID' },
      label
    );
  }
});

test('publication cutover rejects mutations of exact superseded packages', async (t) => {
  for (const relative of [
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v18/manifest.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v18/publication-binding.json',
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1a-v19/manifest.json'
  ]) {
    const root = await copyPublicationClosure();
    t.after(() => rm(root, { recursive: true, force: true }));
    const path = join(root, relative);
    const raw = await readFile(path, 'utf8');
    await writeFile(path, `${raw} `);
    await assert.rejects(
      () => loadLowerDvinaTracePhase1BPublication({ rootDir: root }),
      { code: 'TRACE_PHASE_1B_N1_INVALID' },
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
    'data/world-catalogs/novgorod/spatial-v3/candidates/spatial-v3-production-v4/manifest.json'
  ]) {
    await cp(relative, join(root, relative), { recursive: true });
  }
  return root;
}

async function mutateAndResealPublication(root, mutate) {
  const directory = join(
    root,
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-1b-v19'
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

function digestM11Files(files) {
  return createHash('sha256').update([
    'definition.json', 'local-fire-profile.json',
    'spatial-semantic-profile.json'
  ].map((name) => `${name}:${files[name]}`).join('\n').concat('\n')).digest('hex');
}
