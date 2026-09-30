import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
export const IDENTITY_DIR = 'data/world-catalogs/novgorod/npc-identity-v17/v1';
export const IDENTITY_REQUEST_PATH = `${IDENTITY_DIR}/import-request.json`;
export const IDENTITY_REVIEW_PATH = `${IDENTITY_DIR}/review-request.md`;
export const IDENTITY_ATTESTATION_SCHEMA = 'rus.npc_identity_v17_import_approval.v1';
const ATTESTATION_VERDICTS = new Set(['APPROVE', 'APPROVE_CONDITIONAL']);
const GAME_BASE = 'data/world-catalogs/novgorod/game-base-v1';
const NAMES = `${GAME_BASE}/names-peoples/personal_names`;
const PSYCHOLOGY = `${GAME_BASE}/households-psychology-speech/npc_psychology`;
export const IDENTITY_SOURCES = Object.freeze([`${NAMES}/name_pools.csv`, `${NAMES}/name_pool_entries.csv`,
  `${PSYCHOLOGY}/psychology_scales.json`, `${PSYCHOLOGY}/occupation_goals.csv`,
  `${PSYCHOLOGY}/occupation_fears.csv`, `${IDENTITY_DIR}/context-bindings.json`]);
const TAG = '$npc_identity$';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonicalize = (value) => value === null || typeof value !== 'object' ? value
  : Array.isArray(value) ? value.map(canonicalize)
    : Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));

export function computeIdentityRequestDigest(request) {
  const { request_digest: _claimed, ...body } = request;
  return sha256(JSON.stringify(canonicalize(body)));
}

export async function readIdentityRequest(root = ROOT) {
  return JSON.parse(await readFile(resolve(root, IDENTITY_REQUEST_PATH), 'utf8'));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 1; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [headers, ...cells] = rows;
  return cells.map((line) => Object.fromEntries(headers.map((name, index) => [name, line[index] ?? ''])));
}

const nullable = (value) => (value === '' ? null : value);

/**
 * Rows of the five world_base tables, derived from the reviewed game-base files. The repository data
 * stay draft/candidate: only this stage marks the runtime-selectable subset `approved` — the bound
 * pool, its ordinary name entries, the context binding, the D29 scales and the goal/fear items.
 */
export async function buildIdentityRows({ root = ROOT } = {}) {
  const read = (path) => readFile(resolve(root, path), 'utf8');
  const bindings = JSON.parse(await read(`${IDENTITY_DIR}/context-bindings.json`));
  const revision = bindings.world_revision_id;
  const bound = new Set(bindings.bindings.map((binding) => binding.name_pool_id));
  const boundKeys = new Set(bindings.bindings.map((binding) => `${binding.name_pool_id}\u0000${binding.people_ref}`));
  const pools = parseCsv(await read(`${NAMES}/name_pools.csv`)).map((row) => ({ id: row.id,
    world_revision_id: revision, region_id: row.region_id, valid_from: nullable(row.valid_from),
    valid_to: nullable(row.valid_to), status: bound.has(row.id) ? 'approved' : 'draft' }));
  const entries = parseCsv(await read(`${NAMES}/name_pool_entries.csv`)).map((row) => ({ id: row.id,
    name_pool_id: row.name_pool_id, name_form: row.name_form, name_category_id: nullable(row.name_category_id),
    weight: Number(row.weight), sex_category: row.sex_category, people_ref: row.people_ref,
    selection_class: row.selection_class,
    social_position_archetype_id: nullable(row.social_position_archetype_id),
    derivation_class: nullable(row.derivation_class), derivation: nullable(row.derivation),
    people_derivation: nullable(row.people_derivation), evidence_period: nullable(row.evidence_period),
    status: row.selection_class === 'ordinary' && boundKeys.has(`${row.name_pool_id}\u0000${row.people_ref}`)
      ? 'approved' : 'draft',
    provenance_ref: nullable(row.provenance_ref) }));
  const scales = JSON.parse(await read(`${PSYCHOLOGY}/psychology_scales.json`));
  const scaleRows = [['trait', scales.traits], ['value', scales.values]].flatMap(([kind, list]) =>
    list.map((entry) => ({ world_revision_id: revision, scale_kind: kind, entry_id: entry.id,
      label_ru: entry.label_ru, weight: scales.default_weight, status: 'approved',
      provenance_ref: `game-base:households-psychology-speech/npc_psychology/psychology_scales.json#${entry.id}` })));
  const items = [];
  for (const [kind, file] of [['goal', 'occupation_goals.csv'], ['fear', 'occupation_fears.csv']]) {
    for (const row of parseCsv(await read(`${PSYCHOLOGY}/${file}`))) {
      items.push({ world_revision_id: revision, occupation_id: row.occupation_id, item_kind: kind,
        item_id: row.item_id, text_ru: row.text_ru, basis: row.basis, confidence: row.confidence,
        status: 'approved', provenance_ref: row.source_refs });
    }
  }
  return [
    { table: 'region_name_pools', rows: pools },
    { table: 'region_name_pool_entries', rows: entries },
    { table: 'npc_regional_context_name_bindings', rows: bindings.bindings.map((binding) => ({
      regional_context_id: binding.regional_context_id, world_revision_id: revision,
      name_pool_id: binding.name_pool_id, people_ref: binding.people_ref, status: 'approved',
      provenance_ref: `npc-identity-v17/v1/context-bindings.json#${binding.regional_context_id}` })) },
    { table: 'npc_psychology_scale_entries', rows: scaleRows },
    { table: 'occupation_character_items', rows: items }
  ];
}

/** One transaction; the in-transaction readback raises when any inserted row differs. */
export function buildIdentityImportSql(tables) {
  const statements = ['BEGIN;\n'];
  for (const { table, rows } of tables) {
    const json = JSON.stringify(rows);
    if (json.includes(TAG)) throw new Error(`V17_NPC_IDENTITY_DOLLAR_TAG:${table}`);
    const columns = Object.keys(rows[0]).join(',');
    const source = `npc_identity_src_${table}`;
    statements.push(`CREATE TEMP TABLE ${source} ON COMMIT DROP AS SELECT * FROM jsonb_populate_recordset(NULL::world_base.${table}, ${TAG}${json}${TAG}::jsonb);\n`,
      `INSERT INTO world_base.${table} (${columns}) SELECT ${columns} FROM ${source};\n`,
      `DO ${TAG} BEGIN IF EXISTS (SELECT 1 FROM ${source} s WHERE NOT EXISTS (SELECT 1 FROM world_base.${table} t WHERE to_jsonb(t) @> to_jsonb(s))) THEN RAISE EXCEPTION 'V17_NPC_IDENTITY_READBACK_MISMATCH:${table}'; END IF; END ${TAG};\n`);
  }
  const body = statements.join('');
  return { commit: `${body}COMMIT;\n`, rollback: `${body}ROLLBACK;\n` };
}

async function sourcePins(root) {
  return Promise.all(IDENTITY_SOURCES.map(async (path) => ({ path,
    sha256: sha256(await readFile(resolve(root, path))) })));
}

const count = (rows, predicate) => rows.filter(predicate).length;

/** Request for the independent reviewer; the digest covers the whole body. */
export async function buildIdentityRequest({ root = ROOT } = {}) {
  const tables = await buildIdentityRows({ root });
  const sql = buildIdentityImportSql(tables);
  const rowsOf = (name) => tables.find((entry) => entry.table === name).rows;
  const entries = rowsOf('region_name_pool_entries');
  const items = rowsOf('occupation_character_items');
  const bindings = rowsOf('npc_regional_context_name_bindings');
  const perPeopleSex = {};
  for (const row of entries.filter((entry) => entry.status === 'approved')) {
    const key = `${row.people_ref}/${row.sex_category}`;
    perPeopleSex[key] = (perPeopleSex[key] ?? 0) + 1;
  }
  const request = {
    schema: 'rus.npc_identity_v17_import_request.v1',
    request_id: 'novgorod_npc_identity_v17_import_001',
    status: 'pending_independent_review',
    operation: 'insert_only',
    transaction: 'single_world_base_transaction',
    target: { database: 'novgorod_world_v17', schema: 'world_base',
      created_by: 'scripts/bootstrap-live-world-v17.mjs (fresh pair only)' },
    approved_data: {
      source_commit: execFileSync('git', ['log', '-1', '--format=%H', '--', ...IDENTITY_SOURCES],
        { cwd: root, encoding: 'utf8' }).trim(),
      world_revision_id: bindings[0].world_revision_id,
      sources_in_repository: 'draft/candidate; this stage sets status=approved only on the subset below',
      sources: await sourcePins(root),
      approved_subset: {
        name_pool_entries_approved: count(entries, (row) => row.status === 'approved'),
        name_pool_entries_left_draft: count(entries, (row) => row.status === 'draft'),
        name_entries_approved_by_people_and_sex: perPeopleSex,
        context_bindings: bindings.map((row) => `${row.regional_context_id} -> ${row.name_pool_id} / ${row.people_ref}`),
        goal_items: count(items, (row) => row.item_kind === 'goal'),
        fear_items: count(items, (row) => row.item_kind === 'fear'),
        analogy_basis_items: count(items, (row) => row.basis === 'analogy'),
        occupations_with_items: new Set(items.map((row) => row.occupation_id)).size
      },
      limits: [
        'Only pools bound to a regional context are selectable; contexts without a binding (Gotland, German towns, Karelia, Ingria) leave NPC unnamed (LW-107).',
        'Approval is per (pool, people) and a pool is approved only when a context binding names it: the six pools of other peoples (Gotland, German, Korela, Izhora, Chud/Est, Smolyane) are imported draft with all their rows and are not selectable (ordinary rows: pp_fg002 16 male, pp_fg001 and pp_izhora 1 each, no female); their authoring is a separate data task (D51, LW-107).',
        'Every name entry keeps evidence_period as authored: medieval_general is XI-XIV evidence, not an individual 1230-1250 attestation.',
        'Goal/fear items have confidence C; basis=analogy items are archive-process analogies, not direct Novgorod evidence.',
        'D29 scales are a game assumption (even weights), not a historical distribution; psychology_profiles.csv is not imported.'
      ],
      datasets: tables.map(({ table, rows }) => ({ table, rows: rows.length })),
      decision_refs: ['D49', 'PLAN-OK-rt-names']
    },
    sql: { commit_sha256: sha256(Buffer.from(sql.commit)), commit_bytes: Buffer.byteLength(sql.commit),
      rollback_sha256: sha256(Buffer.from(sql.rollback)), rollback_bytes: Buffer.byteLength(sql.rollback) },
    expected_readback: { by_table: Object.fromEntries(tables.map(({ table, rows }) => [table, rows.length])) }
  };
  return { ...request, request_digest: computeIdentityRequestDigest(request) };
}

export async function assertIdentityInputs({ root = ROOT, request }) {
  if (request?.schema !== 'rus.npc_identity_v17_import_request.v1') throw new Error('V17_NPC_IDENTITY_REQUEST_SCHEMA_MISMATCH');
  if (request.request_digest !== computeIdentityRequestDigest(request)) throw new Error('V17_NPC_IDENTITY_REQUEST_DIGEST_MISMATCH');
  const pinned = request.approved_data.sources;
  for (const actual of await sourcePins(root)) {
    if (pinned.find((row) => row.path === actual.path)?.sha256 !== actual.sha256) {
      throw new Error(`V17_NPC_IDENTITY_PIN_MISMATCH:${actual.path}`);
    }
  }
  const tables = await buildIdentityRows({ root });
  for (const { table, rows } of tables) {
    if (request.expected_readback.by_table[table] !== rows.length) throw new Error(`V17_NPC_IDENTITY_PIN_MISMATCH:rows:${table}`);
  }
  const sql = buildIdentityImportSql(tables);
  for (const kind of ['commit', 'rollback']) {
    const bytes = Buffer.from(sql[kind]);
    if (sha256(bytes) !== request.sql[`${kind}_sha256`] || bytes.length !== request.sql[`${kind}_bytes`]) {
      throw new Error(`V17_NPC_IDENTITY_SQL_MISMATCH:${kind}`);
    }
  }
  return sql;
}

export function assertIdentityAttestation(request, attestation) {
  if (!attestation) throw new Error('V17_NPC_IDENTITY_ATTESTATION_REQUIRED');
  if (typeof attestation.attested_by !== 'string' || attestation.attested_by.length === 0
      || typeof attestation.independence_basis !== 'string' || attestation.independence_basis.length === 0) {
    throw new Error('V17_NPC_IDENTITY_ATTESTATION_INDEPENDENCE_REQUIRED');
  }
  if (attestation.schema !== IDENTITY_ATTESTATION_SCHEMA) throw new Error('V17_NPC_IDENTITY_ATTESTATION_SCHEMA_MISMATCH');
  if (!ATTESTATION_VERDICTS.has(attestation.verdict)) throw new Error('V17_NPC_IDENTITY_ATTESTATION_VERDICT_REJECTED');
  if (attestation.request_digest !== request.request_digest) throw new Error('V17_NPC_IDENTITY_ATTESTATION_DIGEST_MISMATCH');
  return attestation;
}

async function tableCounts(world, tables) {
  const counts = {};
  for (const table of tables) {
    if (!/^[a-z_0-9]+$/u.test(table)) throw new Error(`V17_NPC_IDENTITY_TABLE_INVALID:${table}`);
    counts[table] = Number((await world.query(`SELECT count(*) FROM world_base.${table}`)).rows[0].count);
  }
  return counts;
}

/** Rollback probe, independent attestation, commit, exact readback (in-transaction and by counts). */
export async function runIdentityImportStage({ world, root = ROOT, requireAttestation }) {
  const request = await readIdentityRequest(root);
  const sql = await assertIdentityInputs({ root, request });
  const expected = request.expected_readback.by_table;
  const tables = Object.keys(expected);
  const before = await tableCounts(world, tables);
  await world.query(sql.rollback);
  const afterRollback = await tableCounts(world, tables);
  if (tables.some((table) => before[table] !== afterRollback[table])) throw new Error('V17_NPC_IDENTITY_ROLLBACK_MISMATCH');
  const attestation = assertIdentityAttestation(request, await requireAttestation('npc_identity_import', request));
  await world.query(sql.commit);
  const after = await tableCounts(world, tables);
  for (const table of tables) {
    if (after[table] - before[table] !== expected[table]) {
      throw new Error(`V17_NPC_IDENTITY_READBACK_MISMATCH:${table}:${after[table] - before[table]}!=${expected[table]}`);
    }
  }
  return { request_id: request.request_id, request_digest: request.request_digest, request, attestation,
    added: expected, rollback: 'pass', readback: 'exact' };
}

/** Text for the independent reviewer, derived from the request so it cannot drift from it. */
export function renderIdentityReviewRequest(request) {
  const data = request.approved_data;
  const subset = data.approved_subset;
  const rows = Object.entries(request.expected_readback.by_table).map(([table, count]) => `- \`${table}\`: ${count}`);
  return `# NPC identity v17 import: review request

Attest [import-request.json](import-request.json) (request digest \`${request.request_digest}\`, sources at
\`${data.source_commit}\`) with an independent pass that is not the author (WR 21.1). The request is a candidate:
no attestation exists. The stage \`npc_identity_import\` of \`scripts/bootstrap-live-world-v17.mjs\` stops before COMMIT
without \`npc_identity_import.json\` (schema \`rus.npc_identity_v17_import_approval.v1\`).

What becomes runtime-selectable (status \`approved\` set only by the stage SQL; repository files stay draft/candidate):
- ${subset.name_pool_entries_approved} ordinary name entries of the bound (pool, people) pairs (${JSON.stringify(subset.name_entries_approved_by_people_and_sex)}); ${subset.name_pool_entries_left_draft} other entries are imported \`draft\` and never selected;
- context bindings: ${subset.context_bindings.join('; ')};
- the D29 psychology scales (6 traits, 7 values, even weight);
- ${subset.goal_items} goal and ${subset.fear_items} fear items for ${subset.occupations_with_items} occupations (${subset.analogy_basis_items} with \`basis=analogy\`).

Rows inserted (insert-only, one transaction, in-transaction exact readback):
${rows.join('\n')}

Limits carried into the approval:
${data.limits.map((limit) => `- ${limit}`).join('\n')}

Also for review: DDL \`infra/world-base/schema/29.sql\` (key change of \`region_name_pool_entries\`, three new tables) needs the
Contract Auditor (AR 25.1: DDL, persistence, NPC) and the fresh-schema v5 attestation (\`live-world-runtime-v17/fresh-schema-review-request.md\`).
`;
}

if (process.argv[1] === import.meta.filename && process.argv.includes('--write')) {
  const request = await buildIdentityRequest();
  await writeFile(resolve(ROOT, IDENTITY_REQUEST_PATH), `${JSON.stringify(request, null, 2)}\n`);
  await writeFile(resolve(ROOT, IDENTITY_REVIEW_PATH), renderIdentityReviewRequest(request));
  console.log(JSON.stringify({ request_id: request.request_id, request_digest: request.request_digest,
    added: request.expected_readback.by_table }, null, 2));
}
