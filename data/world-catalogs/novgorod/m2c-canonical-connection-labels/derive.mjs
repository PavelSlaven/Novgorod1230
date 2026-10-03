import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url));
const base = '../spatial-v3/candidates/m2c-g4-expansion-v1/';
const sourceFile = 'datasets/spatial_v3_canonical_g5_connection_bindings.json';
const sourceRef = `data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/${sourceFile}`;
const labelId = (bindingId) => `m2c_connection_label__${bindingId}`;

/** Neutral ordinals, the local-edge policy extended: one source position, one running number.
 * Connection numbers start after the largest local-edge ordinal, so a label never repeats
 * a local label of the same scene. Binding versions share the id and the label. */
export function deriveConnectionLabels() {
  const bytes = read(base + sourceFile);
  const manifest = JSON.parse(read(base + 'import-manifest.json'));
  const dataset = manifest.datasets.find((row) => row.file === sourceFile);
  if (manifest.status !== 'approved' || dataset?.status !== 'approved'
    || dataset.sha256 !== createHash('sha256').update(bytes).digest('hex')) {
    throw new Error('CANONICAL_CONNECTION_LABEL_SOURCE_REQUIRED');
  }
  const localOrdinal = Math.max(...JSON.parse(read('../m2c-local-edge-labels/candidate.json'))
    .labels.map((row) => row.editorial_choice_ordinal));
  const byId = new Map();
  for (const row of JSON.parse(bytes)) {
    if (row.status !== 'approved') continue;
    const known = byId.get(row.id);
    if (known && (known.from_canonical_g5_id !== row.from_canonical_g5_id
      || known.to_canonical_g5_id !== row.to_canonical_g5_id
      || known.from_scene_endpoint_slot_key !== row.from_scene_endpoint_slot_key)) {
      throw new Error(`CANONICAL_CONNECTION_LABEL_VERSION_MISMATCH:${row.id}`);
    }
    byId.set(row.id, row);
  }
  const bySource = new Map();
  for (const row of [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    const key = `${row.from_canonical_g5_id}|${row.from_scene_endpoint_slot_key}`;
    bySource.set(key, [...(bySource.get(key) ?? []), row]);
  }
  return [...bySource.values()].flatMap((rows) => rows.map((row, index) => {
    const ordinal = localOrdinal + index + 1;
    return { id: labelId(row.id), version: 1, status: 'candidate_approval_pending',
      binding_ref: { id: row.id }, source_canonical_g5_ref: { id: row.from_canonical_g5_id,
        version: row.from_canonical_g5_version },
      display_label: `Проход ${ordinal}`, editorial_choice_ordinal: ordinal,
      visibility_rule: 'require_current_authoritative_visible_or_known_exit_projection',
      provenance: { directness: 'editorial', confidence: 'medium', source_refs: [`${sourceRef}#${row.id}`],
        applicability: 'Binding id only; every version of the binding inherits the label.',
        limits: 'The ordinal distinguishes passage choices at one source position only. It asserts no destination name, direction, distance, safety, hidden topology, visibility, knowledge or movement capability. Exact current disclosure is mandatory.' } };
  })).sort((a, b) => a.id.localeCompare(b.id));
}

export function buildCandidate() {
  return { artifact_type: 'canonical_g5_connection_presentation_authoring_candidate',
    candidate_id: 'novgorod_m2c_canonical_connection_labels_v1', version: 1,
    status: 'candidate_approval_pending', approved: false, import_authorized: false,
    activation_authorized: false, world_revision_id: 'novgorod_spatial_v3_target_contract_approval_001',
    authoring_policy: 'Neutral editorial ordinals distinguish the passages that leave one canonical place. Numbers continue after the local-edge ordinals of the same scene, so no label repeats. The label asserts no destination, direction, distance, visibility, knowledge or movement capability. Class-based wording replaces this catalog row by row with the same binding ids.',
    labels: deriveConnectionLabels() };
}

if (process.argv[2] === '--write') {
  writeFileSync(new URL('./candidate.json', import.meta.url),
    `${JSON.stringify(buildCandidate(), null, 2)}\n`);
}
