import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

import { canonicalJsonBytes } from './p12-canonical-manifest.mjs';

const OUTPUTS = [
  {
    cell_id: 'gn_nov_g1_xp017_yp026',
    revision_id: 'content_revision_004_first_playable_candidate',
    parent_revision_id: 'content_revision_003_production_candidate',
    parent_path:
      'data/world-catalogs/novgorod/staging/cells/gn_nov_g1_xp017_yp026/' +
      'content_revision_003_production_candidate/' +
      'gn_nov_g1_xp017_yp026_content_revision_003_production_candidate.zip',
    output_path:
      'data/world-catalogs/novgorod/staging/cells/gn_nov_g1_xp017_yp026/' +
      'content_revision_004_first_playable_candidate'
  },
  {
    cell_id: 'gn_nov_g1_xp017_yp025',
    revision_id: 'content_revision_001_first_playable_candidate',
    parent_revision_id: 'novgorod_1230_research_revision_002_approved_local_package',
    parent_path:
      'data/world-catalogs/novgorod/staging/cells/gn_nov_g1_xp017_yp025/' +
      'gn_nov_g1_xp017_yp025_approved_local.zip',
    output_path:
      'data/world-catalogs/novgorod/staging/cells/gn_nov_g1_xp017_yp025/' +
      'content_revision_001_first_playable_candidate'
  }
];

const SHARED_INPUTS = [
  'data/world-catalogs/novgorod/first-playable-v1/catalog.json',
  'data/world-catalogs/novgorod/first-playable-v1/scenario.json',
  'data/world-catalogs/novgorod/first-playable-v1/manifest.json',
  'data/world-catalogs/novgorod/spatial-v3/staging/lower-dvina-boundary-v2/staging-candidate.json'
];

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function deterministicZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of [...entries].sort((left, right) =>
    Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)))) {
    const name = Buffer.from(entry.path.replaceAll('\\', '/'), 'utf8');
    const compressed = deflateRawSync(entry.bytes, { level: 9 });
    const crc = crc32(entry.bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x0021, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.bytes.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.bytes.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

export async function buildFirstPlayableRevisions(root = process.cwd()) {
  const results = [];
  const shared = await Promise.all(SHARED_INPUTS.map(async (path) => ({
    source_path: path,
    archive_path: `first-playable/${basename(path)}`,
    bytes: await readFile(resolve(root, path))
  })));
  for (const output of OUTPUTS) {
    const parentBytes = await readFile(resolve(root, output.parent_path));
    const entries = [
      {
        source_path: output.parent_path,
        archive_path: `parent/${basename(output.parent_path)}`,
        bytes: parentBytes
      },
      ...shared
    ];
    const manifestWithoutDigest = {
      schema: 'rus.lower_dvina.first_playable_content_revision.v1',
      version: 1,
      cell_id: output.cell_id,
      revision_id: output.revision_id,
      status: 'validated_candidate_not_active',
      lineage: {
        parent_revision_id: output.parent_revision_id,
        parent_package_path: output.parent_path,
        parent_package_sha256: sha256(parentBytes),
        inheritance_lookup: 'forbidden',
        supersession: 'explicit_candidate_transition'
      },
      capability_gates: {
        local_scene: 'ready',
        boundary_crossing: 'blocked_typed_gaps'
      },
      package_files: entries.map(({ source_path, archive_path, bytes }) => ({
        source_path,
        archive_path,
        size: bytes.length,
        sha256: sha256(bytes)
      })),
      runtime_import: 'not_performed',
      production_activation: false
    };
    const manifest = {
      ...manifestWithoutDigest,
      canonical_digest: sha256(canonicalJsonBytes(manifestWithoutDigest))
    };
    const manifestBytes = canonicalJsonBytes(manifest);
    const archiveEntries = [
      ...entries.map(({ archive_path: path, bytes }) => ({ path, bytes })),
      { path: 'revision-manifest.json', bytes: manifestBytes }
    ];
    const zipBytes = deterministicZip(archiveEntries);
    const outputRoot = resolve(root, output.output_path);
    await mkdir(outputRoot, { recursive: true });
    await writeFile(resolve(outputRoot, 'revision-manifest.json'), manifestBytes);
    for (const entry of entries) {
      const destination = resolve(outputRoot, entry.archive_path);
      await mkdir(resolve(destination, '..'), { recursive: true });
      await copyFile(resolve(root, entry.source_path), destination);
    }
    const archiveName = `${output.cell_id}_${output.revision_id}.zip`;
    await writeFile(resolve(outputRoot, archiveName), zipBytes);
    const result = {
      cell_id: output.cell_id,
      revision_id: output.revision_id,
      manifest_digest: manifest.canonical_digest,
      archive_path: `${output.output_path}/${archiveName}`,
      archive_sha256: sha256(zipBytes)
    };
    await writeFile(
      resolve(outputRoot, 'SHA256SUMS.json'),
      canonicalJsonBytes({
        schema: 'rus.sha256_sums.v1',
        files: [
          { path: 'revision-manifest.json', sha256: sha256(manifestBytes) },
          { path: archiveName, sha256: result.archive_sha256 }
        ]
      })
    );
    results.push(result);
  }
  return results;
}

async function main() {
  const rootArgument = process.argv.slice(2).find((argument) => !argument.startsWith('--'));
  const results = await buildFirstPlayableRevisions(resolve(rootArgument ?? process.cwd()));
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
