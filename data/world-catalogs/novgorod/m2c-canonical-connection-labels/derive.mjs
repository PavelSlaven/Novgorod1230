import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../../../');
const read = (relative) => readFileSync(new URL(relative, import.meta.url));
const readRepo = (relative) => readFileSync(path.join(repoRoot, relative));
const bindingFile = '../spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_canonical_g5_connection_bindings.json';
const bindingSourceRef = 'data/world-catalogs/novgorod/spatial-v3/candidates/m2c-g4-expansion-v1/datasets/spatial_v3_canonical_g5_connection_bindings.json';
const lineNamesFile = '../m2c-line-names/candidate.json';
const lineNamesApprovalFile = '../m2c-line-names/approval-attestation.json';
const targetSuffixes = ['work_storage', 'water_access', 'forest_path', 'meeting_area',
  'household_cluster', 'landing_candidate', 'river_approach'];
const targetPrefix = 'cg5v3__gn_nov_g4_xp017_yp026_r2_vikhtuy_locality_';
const excludedPairSuffixes = ['vikhtuy_locality_7', 'vikhtuy_locality_cross'];
const labelId = (bindingId) => `m2c_connection_label__${bindingId}`;

function deriveOrdinalLabels() {
  const bindingBytes = read(bindingFile);
  const manifest = JSON.parse(read('../spatial-v3/candidates/m2c-g4-expansion-v1/import-manifest.json'));
  const dataset = manifest.datasets.find((row) => row.file === 'datasets/spatial_v3_canonical_g5_connection_bindings.json');
  if (manifest.status !== 'approved' || dataset?.status !== 'approved'
      || dataset.sha256 !== createHash('sha256').update(bindingBytes).digest('hex')) {
    throw new Error('CANONICAL_CONNECTION_LABEL_SOURCE_REQUIRED');
  }
  const localOrdinal = Math.max(...JSON.parse(read('../m2c-local-edge-labels/candidate.json'))
    .labels.map((row) => row.editorial_choice_ordinal));
  const byId = new Map();
  for (const row of JSON.parse(bindingBytes)) {
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
      provenance: { directness: 'editorial', confidence: 'medium', source_refs: [`${bindingSourceRef}#${row.id}`],
        applicability: 'Binding id only; every version of the binding inherits the label.',
        limits: 'The ordinal distinguishes passage choices at one source position only. It asserts no destination name, direction, distance, safety, hidden topology, visibility, knowledge or movement capability. Exact current disclosure is mandatory.' } };
  })).sort((a, b) => a.id.localeCompare(b.id));
}

function targetG5Nodes() {
  const manifest = JSON.parse(read('../live-world-runtime-v17/target-starts-manifest.v1.json'));
  const nodes = new Set();
  for (const start of manifest.starts) {
    const startData = JSON.parse(readRepo(start.start.path));
    nodes.add(startData.initial_placement.canonical_g5_ref.id);
  }
  for (const suffix of targetSuffixes) nodes.add(`${targetPrefix}${suffix}`);
  return nodes;
}

export function deriveConnectionLabels() {
  const lineNamesBytes = read(lineNamesFile);
  const lineNames = JSON.parse(lineNamesBytes);
  const approval = JSON.parse(read(lineNamesApprovalFile));
  if (approval.decision !== 'APPROVE_WITH_LIMITS'
      || approval.candidate_ref !== 'data/world-catalogs/novgorod/m2c-line-names/candidate.json'
      || approval.candidate_sha256 !== createHash('sha256').update(lineNamesBytes).digest('hex')
      || approval.import_authorized !== false || approval.activation_authorized !== false) {
    throw new Error('M2C_LINE_NAME_APPROVAL_NOT_VALID');
  }
  const targets = targetG5Nodes();
  const excluded = new Set(lineNames.local_pairs.filter((row) => excludedPairSuffixes
    .some((suffix) => row.source_pair_id.endsWith(suffix))).map((row) => row.source_pair_id));
  const pairs = new Map(lineNames.local_pairs.map((row) => [row.source_pair_id, row]));
  const bindings = JSON.parse(read(bindingFile));
  const selected = new Map();
  for (const binding of bindings) {
    if (binding.status !== 'approved'
        || (!targets.has(binding.from_canonical_g5_id) && !targets.has(binding.to_canonical_g5_id))
        || excluded.has(binding.source_pair_id)) continue;
    const pair = pairs.get(binding.source_pair_id);
    if (!pair?.name_ru || pair.qualifier?.from_to !== null || pair.qualifier?.to_from !== null) {
      throw new Error(`APPROVED_LINE_NAME_REQUIRED:${binding.source_pair_id}`);
    }
    selected.set(binding.id, pair);
  }
  const pairCount = new Set([...selected.values()].map((row) => row.source_pair_id)).size;
  if (selected.size !== 34 || pairCount !== 17) {
    throw new Error(`TARGET_G5_LABEL_SCOPE_MISMATCH:${pairCount}/${selected.size}`);
  }
  const labels = deriveOrdinalLabels();
  const byId = new Map(labels.map((row) => [row.binding_ref.id, row]));
  for (const [bindingId, pair] of selected) {
    const row = byId.get(bindingId);
    if (!row) throw new Error(`CANONICAL_LABEL_ROW_MISSING:${bindingId}`);
    row.display_label = `Уйти ${pair.name_ru}`;
    row.provenance = {
      directness: 'approved_line_name_with_D49_action_word',
      confidence: 'APPROVE_WITH_LIMITS covers name_ru; action prefix remains candidate',
      source_refs: [
        `${bindingSourceRef}#${bindingId}:source_pair_id,from_canonical_g5_id,to_canonical_g5_id,reverse_binding_id`,
        `data/world-catalogs/novgorod/m2c-line-names/candidate.json#local_pairs[${pair.source_pair_id}]:line_kind,name_ru,qualifier`,
        'data/world-catalogs/novgorod/m2c-line-names/approval-attestation.json#scope',
        'docs/work/CURRENT_SPRINT.md#D49'
      ],
      applicability: `Binding id ${bindingId}; physical source pair ${pair.source_pair_id}; both directions share this line name.`,
      limits: 'Авторское игровое название, не исторический топоним. APPROVE_WITH_LIMITS относится к name_ru; префикс «Уйти» остаётся кандидатом. Импорт и активация не разрешены.'
    };
  }
  return labels;
}

export function buildCandidate() {
  return { artifact_type: 'canonical_g5_connection_presentation_authoring_candidate',
    candidate_id: 'novgorod_m2c_canonical_connection_labels_v1', version: 1,
    status: 'candidate_approval_pending', approved: false, import_authorized: false,
    activation_authorized: false,
    world_revision_id: 'novgorod_spatial_v3_target_contract_approval_001',
    authoring_policy: 'Для 17 пар G5 выбранного scope v17 подпись равна «Уйти » + APPROVE_WITH_LIMITS m2c-line-names.name_ru с сохранением binding id. Остальные строки каталога пока сохраняют прежнюю форму; две пары Вихтуя с неразличимыми line names исключены до отдельной правки источника. Имена — авторские игровые, не исторические топонимы. Кандидат не утверждён, не импортирован и не активирован.',
    labels: deriveConnectionLabels() };
}

if (process.argv[2] === '--write') {
  writeFileSync(path.join(here, 'candidate.json'), `${JSON.stringify(buildCandidate(), null, 2)}\n`);
}
