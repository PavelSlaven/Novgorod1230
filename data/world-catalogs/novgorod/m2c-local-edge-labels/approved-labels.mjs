import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const key = (row) => `${row.scene_template_id ?? row.scene_template_ref.id}/${row.edge_slot_key}`;

export function loadApprovedLocalEdgeLabels() {
  const bytes = read('./candidate.json');
  const candidate = JSON.parse(bytes);
  const approval = JSON.parse(read('./approval-attestation.json'));
  if (approval.decision !== 'APPROVE_DATA_ONLY'
    || approval.candidate_ref !== `${candidate.candidate_id}@${candidate.version}`
    || approval.candidate_sha256 !== hash(bytes)) throw new Error('LOCAL_EDGE_LABEL_APPROVAL_REQUIRED');

  const base = '../m2c-scene-movement-edges/';
  const oldBytes = read(`${base}candidate.json`);
  const old = JSON.parse(oldBytes).scene_movement_edge_templates;
  const oldApproval = JSON.parse(read(`${base}repin-data-approval.json`));
  const nextBytes = read(`${base}open-capacity-v2-candidate.json`);
  const next = JSON.parse(nextBytes).scene_movement_edge_templates;
  const nextApproval = JSON.parse(read(`${base}open-capacity-v2-data-approval.json`));
  const importBytes = read(`${base}open-capacity-v2-import/spatial_v3_scene_movement_edge_templates.json`);
  const imported = JSON.parse(importBytes);
  const manifest = JSON.parse(read('../m2c-open-capacity-v2-import-manifest.json'));
  const edgeDataset = manifest.datasets.find((row) => row.table === 'spatial_v3_scene_movement_edge_templates');
  if (oldApproval.decision !== 'APPROVE_DATA_ONLY'
    || oldApproval.candidate_sha256 !== hash(oldBytes)
    || nextApproval.decision !== 'APPROVE_DATA_ONLY'
    || nextApproval.exact_candidate?.sha256 !== hash(nextBytes)
    || manifest.status !== 'approved' || edgeDataset?.sha256 !== hash(importBytes)
    || old.length !== 68 || next.length !== old.length || imported.length !== old.length
    || candidate.labels.length !== old.length) throw new Error('LOCAL_EDGE_LABEL_SUCCESSOR_SOURCE_REQUIRED');

  const oldByKey = new Map(old.map((row) => [key(row), row]));
  const nextByKey = new Map(next.map((row) => [key(row), row]));
  const importedByKey = new Map(imported.map((row) => [key(row), row]));
  const labelsByKey = new Map(candidate.labels.map((row) => [key(row), row]));
  if ([oldByKey, nextByKey, importedByKey, labelsByKey].some((map) => map.size !== old.length))
    throw new Error('LOCAL_EDGE_LABEL_SUCCESSOR_SOURCE_REQUIRED');
  for (const [edgeKey, previous] of oldByKey) {
    const successor = nextByKey.get(edgeKey);
    const label = labelsByKey.get(edgeKey);
    if (!successor || !label || label.scene_template_ref.version !== previous.scene_template_version
      || successor.scene_template_version !== 2 || successor.capacity !== null
      || previous.capacity !== 1
      || JSON.stringify(successor) !== JSON.stringify(importedByKey.get(edgeKey))
      || Object.keys(previous).length !== Object.keys(successor).length
      || Object.keys(previous).some((field) => !['scene_template_version', 'capacity'].includes(field)
        && JSON.stringify(previous[field]) !== JSON.stringify(successor[field]))) {
      throw new Error(`LOCAL_EDGE_LABEL_SUCCESSOR_MISMATCH:${edgeKey}`);
    }
  }
  return [...candidate.labels, ...candidate.labels.map((label) => ({
    ...label, version: 2, scene_template_ref: { ...label.scene_template_ref, version: 2 }
  }))];
}
