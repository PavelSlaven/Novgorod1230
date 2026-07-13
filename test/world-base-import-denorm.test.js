import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const importerScript = resolve(
  'tools/rus13-world-base-importer/world_base_importer_v1/scripts/import_world_base.py'
);

test('importer dry-run reports denorm mismatch as error', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wb-denorm-'));
  const reportPath = join(root, 'report.json');
  const manifestPath = join(root, 'manifest.json');
  try {
    await seedMinimalUniversal(root);
    await writeFile(manifestPath, JSON.stringify(minimalManifest(), null, 2), 'utf8');
    await writeFile(join(root, 'novgorod-region/novgorod_social_roles_v1_enriched.tsv'), [
      'role_id\trole_title\trole_group\tregion_id\tstatus\tsocial_position_archetype_id\tsocial_class_id\trole_archetype_id\tmapping_review_status',
      'nov_role_test_mismatch\tтест\tгород\tregion_novgorod_land\tapproved\tfree_rural_householder_commoner\tdependent_commoners\trural_householder\tapproved'
    ].join('\n') + '\n', 'utf8');

    const result = spawnSync('python', [
      importerScript,
      '--input-root', root,
      '--manifest', manifestPath,
      '--mode', 'dry-run',
      '--report', reportPath
    ], { encoding: 'utf8' });

    assert.equal(result.status, 1, result.stderr || result.stdout);
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    const denormErrors = report.errors.filter((e) => String(e.error).includes('denorm mismatch'));
    assert.ok(denormErrors.length >= 1, JSON.stringify(report.errors));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('importer dry-run auto-fills empty denorm fields from position archetype', async () => {
  const root = await mkdtemp(join(tmpdir(), 'wb-denorm-fill-'));
  const reportPath = join(root, 'report-fill.json');
  const manifestPath = join(root, 'manifest.json');
  try {
    await seedMinimalUniversal(root);
    await writeFile(manifestPath, JSON.stringify(minimalManifest(), null, 2), 'utf8');
    await writeFile(join(root, 'novgorod-region/novgorod_social_roles_v1_enriched.tsv'), [
      'role_id\trole_title\trole_group\tregion_id\tstatus\tsocial_position_archetype_id\tmapping_review_status',
      'nov_role_test_fill\tтест\tгород\tregion_novgorod_land\tapproved\tfree_rural_householder_commoner\tapproved'
    ].join('\n') + '\n', 'utf8');

    const result = spawnSync('python', [
      importerScript,
      '--input-root', root,
      '--manifest', manifestPath,
      '--mode', 'dry-run',
      '--report', reportPath
    ], { encoding: 'utf8' });

    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    const denormErrors = report.errors.filter((e) => String(e.error).includes('denorm mismatch'));
    const gateErrors = report.errors.filter((e) => String(e.error).includes('generation gate'));
    assert.equal(denormErrors.length, 0, JSON.stringify(denormErrors));
    assert.equal(gateErrors.length, 0, JSON.stringify(gateErrors));
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function minimalManifest() {
  const seeds = (table, path, priority) => ({ table, path: `world-base-seeds/${path}`, format: 'csv', priority, name: table });
  return {
    version: '1.0.0',
    default_region_id: 'region_novgorod_land',
    datasets: [
      {
        name: 'regions_novgorod',
        table: 'regions',
        path: 'nov_region_audit/novgorod_region_profile_v1.json',
        format: 'json_region_profile',
        priority: 90
      },
      seeds('social_classes', 'social_classes_v1.csv', 141),
      seeds('social_role_archetypes', 'social_role_archetypes_v1.csv', 142),
      seeds('legal_status_archetypes', 'legal_status_archetypes_v1.csv', 143),
      seeds('dependency_archetypes', 'dependency_archetypes_v1.csv', 144),
      seeds('mobility_archetypes', 'mobility_archetypes_v1.csv', 145),
      seeds('social_position_archetypes', 'social_position_archetypes_v1.csv', 146),
      {
        name: 'region_social_roles_novgorod',
        table: 'region_social_roles',
        path: 'novgorod-region/novgorod_social_roles_v1_enriched.tsv',
        format: 'tsv',
        priority: 160
      }
    ]
  };
}

async function seedMinimalUniversal(root) {
  const seeds = join(root, 'world-base-seeds');
  await mkdir(seeds, { recursive: true });
  await mkdir(join(root, 'novgorod-region'), { recursive: true });
  await mkdir(join(root, 'nov_region_audit'), { recursive: true });
  await writeFile(join(root, 'nov_region_audit/novgorod_region_profile_v1.json'), JSON.stringify({
    region_id: 'region_novgorod_land',
    region_title: 'Новгород',
    status: 'approved',
    confidence: 'high'
  }), 'utf8');

  const copies = [
    'social_classes_v1.csv',
    'social_role_archetypes_v1.csv',
    'legal_status_archetypes_v1.csv',
    'dependency_archetypes_v1.csv',
    'mobility_archetypes_v1.csv',
    'social_position_archetypes_v1.csv'
  ];
  const repoSeeds = resolve('data/world-base-seeds');
  for (const name of copies) {
    const content = await readFile(join(repoSeeds, name), 'utf8');
    await writeFile(join(seeds, name), content, 'utf8');
  }
}
