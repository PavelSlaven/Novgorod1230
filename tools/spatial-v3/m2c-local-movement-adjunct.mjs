import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { computeSpatialV3CanonicalDigest } from '../../packages/contracts/src/spatial-v3/registry.js';

const directory = 'data/world-catalogs/novgorod/m2c-scene-movement-edges';
const spatial = 'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1';
const paths = [
  `${directory}/candidate.json`,
  `${spatial}/datasets/spatial_v3_scene_templates.json`,
  `${spatial}/datasets/spatial_v3_scene_movement_edge_templates.json`,
  `${spatial}/datasets/spatial_v3_scene_position_templates.json`,
  `${spatial}/import-manifest.json`
];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const key = (row) => `${row.scene_template_id}@${row.scene_template_version}/${row.edge_slot_key}`;

/** Add eligibility to existing directed edges; never rewrite their relation fields. */
export function buildLocalMovementEligibilityCandidate({ mechanics, scenes, edges, positions, source_refs }) {
  const byEdge = new Map(edges.map((row) => [key(row), row]));
  assert.equal(byEdge.size, edges.length, 'unique original directed edges');
  const records = mechanics.scene_movement_edge_templates.map((proposal) => {
    const source = byEdge.get(key(proposal));
    const scene = scenes.find((row) => row.id === proposal.scene_template_id
      && row.version === proposal.scene_template_version);
    const counterpart = byEdge.get(`${scene?.id}@${scene?.version}/${proposal.reverse_edge_slot_key}`);
    assert.ok(source && counterpart && source !== counterpart, 'two independently authored directed rows');
    assert.equal(scene.status, 'approved');
    assert.equal(scene.world_revision_id, mechanics.world_revision_id);
    assert.equal(source.from_position_slot_key, counterpart.to_position_slot_key);
    assert.equal(source.to_position_slot_key, counterpart.from_position_slot_key);
    assert.equal(proposal.from_position_slot_key, source.from_position_slot_key);
    assert.equal(proposal.to_position_slot_key, source.to_position_slot_key);
    for (const edge of [source, counterpart]) {
      assert.equal(edge.cost_kind, 'action');
      assert.equal(edge.action_units, 1);
      for (const field of ['reverse_edge_slot_key', 'capacity', 'portal_template_id', 'availability_condition_set_id']) {
        assert.equal(edge[field] ?? null, null, `original ${field} is unchanged`);
      }
      for (const slot of [edge.from_position_slot_key, edge.to_position_slot_key]) {
        const position = positions.filter((row) => row.scene_template_id === scene.id
          && row.scene_template_version === scene.version && row.position_slot_key === slot);
        assert.equal(position.length, 1);
        assert.equal(position[0].capacity, 1, 'position capacity is not enlarged');
      }
    }
    assert.equal(proposal.capacity, 1, 'reviewed single-root transition bound');
    return {
      id: `m2c_local_move__${scene.id}__${source.edge_slot_key}`, version: 1,
      world_revision_id: mechanics.world_revision_id,
      scene_template_id: scene.id, scene_template_version: scene.version,
      scene_template_digest: scene.canonical_digest,
      edge_slot_key: source.edge_slot_key,
      opposing_edge_slot_key: counterpart.edge_slot_key,
      from_position_slot_key: source.from_position_slot_key,
      to_position_slot_key: source.to_position_slot_key,
      eligibility_kind: 'two_approved_directed_edges',
      max_root_owners_per_transition: proposal.capacity,
      directness: 'editorial_mechanical_policy_on_direct_authoring', confidence: 'high'
    };
  });
  assert.equal(records.length, edges.length, 'every approved edge receives one adjunct');
  assert.equal(new Set(records.map((row) => row.id)).size, records.length);
  return {
    artifact_type: 'spatial_v3_local_movement_eligibility_candidate',
    candidate_id: 'novgorod_m2c_local_movement_eligibility_v1', version: 1,
    status: 'candidate_pending_independent_data_approval', approved: false,
    import_authorized: false, activation_authorized: false,
    world_revision_id: mechanics.world_revision_id,
    source_refs,
    provenance: {
      topology: 'Exact two existing independently approved directed edge rows with swapped endpoint slots. Opposing edge is eligibility evidence, not an inferred reverse relation.',
      transition_limit: 'Editorial mechanical policy derived from the independently reviewed 68-edge candidate. One root movement owner per atomic action; no historical capacity claim.',
      original_relation: 'Existing reverse_edge_slot_key/reverse_edge_id null remains authoritative one-way semantics; existing edge capacity null remains no relation limit. Neither authoring nor party rows are rewritten.',
      destination_capacity: 'Existing position capacity remains one. Actual committed occupancy must be read under P16 locks; the adjunct does not grant vacancy or passage through occupants.'
    },
    runtime_requirements: {
      publication: 'Separate mapped-data approval, P12 import/readback and exact release-selected adjunct version are required before runtime use.',
      current_edges: 'Both original directed rows must be active in the same committed scene baseline with exact source template/slot pins and swapped endpoints. Missing or changed counterpart blocks admission.',
      current_visibility: 'Existing authoritative visibility owner must disclose the selected directed edge to the current actor. Default-clear topology alone is insufficient; missing observation is a typed gap.',
      capacity: 'Enforce the separate policy transition limit and unchanged current destination capacity against locked authoritative occupancy.',
      recheck: 'P16 rechecks the imported policy pin, party world tuple, actual edge/node versions, journey source and destination occupancy before position write.',
      replay: 'Existing request identity and P16 replay return the committed result without a second movement.'
    },
    excluded: ['G0-G4 topology/routes/exits', 'new edges or inferred reverse references',
      'source scene-template mutation', 'position capacity changes', 'NPC displacement',
      'portal/time-cost movement', 'visibility or recognition authoring',
      'historical party migration', 'runtime activation'],
    records
  };
}

export async function loadLocalMovementEligibilityCandidate({ root = process.cwd() } = {}) {
  const bytes = await Promise.all(paths.map((path) => readFile(resolve(root, path))));
  const [mechanics, scenes, edges, positions, manifest] = bytes.map((value) => JSON.parse(value));
  const approval = JSON.parse(await readFile(resolve(root,
    'data/world-catalogs/novgorod/m2c-sol-data-approval.json')));
  assert.equal(approval.scene_movement_edge_candidate_approval?.candidate_sha256, hash(bytes[0]));
  assert.equal(manifest.status, 'approved');
  for (const index of [1, 2, 3]) {
    const table = paths[index].split('/').at(-1).replace('.json', '');
    assert.equal(manifest.datasets.find((row) => row.table === table)?.sha256, hash(bytes[index]));
  }
  return buildLocalMovementEligibilityCandidate({ mechanics, scenes, edges, positions,
    source_refs: paths.map((path, index) => ({ path, sha256: hash(bytes[index]),
      directness: index === 0 ? 'independently_approved_editorial_mechanics' : 'exact_approved_authoring',
      confidence: 'high' })) });
}

export async function promoteLocalMovementEligibility({ root = process.cwd() } = {}) {
  const rawBytes = await readFile(resolve(root, directory, 'local-movement-eligibility-candidate.json'));
  const candidate = JSON.parse(rawBytes);
  const approval = JSON.parse(await readFile(resolve(root, 'data/world-catalogs/novgorod/m2c-sol-data-approval.json')));
  assert.equal(approval.local_movement_eligibility_candidate_approval?.candidate_sha256, hash(rawBytes));
  assert.deepEqual(candidate, await loadLocalMovementEligibilityCandidate({ root }));
  const provenance = 'm2c_local_movement_eligibility_editorial_v1';
  const records = candidate.records.map((record) => {
    const row = { entity_kind: 'local_movement_eligibility_profile', ...record,
      status: 'approved', provenance_ref: provenance };
    return { ...row, canonical_digest: computeSpatialV3CanonicalDigest(row).replace('sha256:', '') };
  });
  const datasets = new Map([
    ['source_records', [{ id: provenance, title: 'M2c local movement eligibility adjunct',
      source_type: 'project_note', file_reference: `${directory}/local-movement-eligibility-candidate.json`,
      page_or_section: `candidate_sha256:${hash(rawBytes)}`,
      summary: 'Editorial single-root action eligibility on two independently authored directed edges. Original reverse and capacity facts remain unchanged.',
      limitations: 'No historical capacity, visibility, occupancy, migration or activation authority.',
      status: 'approved', confidence: 'high', checked_by: approval.local_movement_eligibility_candidate_approval.reviewer }]],
    ['spatial_v3_authoring_versions', records.map((row) => ({ entity_kind: row.entity_kind,
      entity_id: row.id, version: row.version, world_revision_id: row.world_revision_id,
      canonical_digest: row.canonical_digest, status: row.status, provenance_ref: provenance }))],
    // P12 dependency-closure bundles retain their approved canonical inventory.
    ['spatial_v3_nodes', JSON.parse(await readFile(resolve(root, spatial, 'datasets/spatial_v3_nodes.json')))],
    ['spatial_v3_local_movement_eligibility_profiles', records]
  ]);
  const output = resolve(root, directory, 'local-movement-eligibility-v1');
  await mkdir(resolve(output, 'datasets'), { recursive: true });
  const manifest = { schema_version: 'rus.spatial-v3.world-base-authoring-bundle.v1',
    bundle_id: 'novgorod_m2c_local_movement_eligibility_v1', bundle_kind: 'dependency_closure',
    world_revision_id: candidate.world_revision_id, status: 'approved', provenance_ref: provenance,
    delete_policy: 'forbid', datasets: [], data_gaps: [] };
  for (const [table, rows] of datasets) {
    const file = `datasets/${table}.json`;
    const bytes = `${JSON.stringify(rows, null, 2)}\n`;
    await writeFile(resolve(output, file), bytes);
    manifest.datasets.push({ table, file, sha256: hash(bytes), status: 'approved',
      provenance_ref: provenance, delete_policy: 'forbid',
      depends_on: table === 'spatial_v3_authoring_versions' ? ['source_records']
        : table === 'spatial_v3_local_movement_eligibility_profiles' ? ['spatial_v3_authoring_versions'] : [] });
  }
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(resolve(output, 'manifest.json'), manifestBytes);
  return { manifest_sha256: hash(manifestBytes), dataset_sha256: manifest.datasets.at(-1).sha256,
    counts: Object.fromEntries([...datasets].map(([table, rows]) => [table, rows.length])) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href && process.argv.includes('--promote')) {
  console.log(JSON.stringify(await promoteLocalMovementEligibility()));
} else if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const candidate = await loadLocalMovementEligibilityCandidate();
  const bytes = `${JSON.stringify(candidate, null, 2)}\n`;
  const path = `${directory}/local-movement-eligibility-candidate.json`;
  await writeFile(resolve(path), bytes);
  console.log(`${path} ${hash(bytes)} records=${candidate.records.length}`);
}
