import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildNpcReactionPolicySnapshotFromAuthoringRow
} from '@rus/npc-runtime';
import { TEMPORAL_REQUIRED_DATA_FAMILIES } from '../spatial-v3/temporal-data-readiness.mjs';

const DATA_ROOT = 'data/world-catalogs/novgorod/temporal-v4';
const DECISION_ROOT = 'docs/work/temporal-world-v4/external-data-audit/decisions';
const TARGET_TABLE = 'temporal_authoring_records';
const ADVISORY_LOCK_KEY = '-748013240124003114';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function rowDigest(value) {
  return digest(canonicalJson(value));
}

function omit(row, keys) {
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    if (!keys.has(key)) result[key] = value;
  }
  return result;
}

function sameSet(left, right) {
  return Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    left.every((value) => right.includes(value));
}

function nonEmptyStrings(value) {
  return Array.isArray(value) &&
    value.length > 0 &&
    new Set(value).size === value.length &&
    value.every((item) => typeof item === 'string' && item.length > 0);
}

async function readJson(root, path) {
  return JSON.parse(await readFile(resolve(root, path), 'utf8'));
}

function addUnique(rows, idField, seen, errors, familyId, kind) {
  for (const row of rows) {
    const id = row?.[idField];
    if (typeof id !== 'string' || id.length === 0) {
      errors.push(`${familyId}:${kind}:missing_${idField}`);
    } else if (seen.has(id)) {
      errors.push(`${familyId}:${kind}:duplicate_${idField}:${id}`);
    } else {
      seen.add(id);
    }
  }
}

function validateFamily({
  familyId,
  records,
  references,
  provenance,
  sources,
  decision,
  errors
}) {
  const recordIds = records.map((row) => row?.record_id);
  const referenceIds = new Set(references.map((row) => row?.reference_id));
  const provenanceIds = new Set(provenance.map((row) => row?.provenance_id));
  const sourceIds = new Set(sources.map((row) => row?.source_id));

  if (provenance.length === 0) errors.push(`${familyId}:provenance:expected_nonempty_rows`);
  if (decision?.schema !== 'rus.temporal-world-v4.external-auditor-family-decision.v1' ||
      decision?.version !== 1 ||
      decision?.family_id !== familyId ||
      decision?.verdict !== 'approved' ||
      !Array.isArray(decision?.data_gaps) ||
      decision.data_gaps.length !== 0 ||
      !sameSet(decision?.approved_record_ids, recordIds) ||
      !sameSet(decision?.source_ids_reviewed, [...sourceIds])) {
    errors.push(`${familyId}:external_audit_decision_invalid`);
  }

  for (const row of records) {
    if (row?.family_id !== familyId ||
        row?.status !== 'approved' ||
        !/^[1-9][0-9]*$/u.test(row?.version ?? '') ||
        typeof row?.record_kind !== 'string' ||
        !nonEmptyStrings(row?.applicability) ||
        !nonEmptyStrings(row?.provenance_refs) ||
        row.provenance_refs.some((id) => !provenanceIds.has(id)) ||
        !nonEmptyStrings(row?.normalized_reference_ids) ||
        row.normalized_reference_ids.some((id) => !referenceIds.has(id)) ||
        !nonEmptyStrings(row?.source_history_refs) ||
        row.source_history_refs.some((id) => !sourceIds.has(id)) ||
        !row?.payload ||
        typeof row.payload !== 'object' ||
        Array.isArray(row.payload)) {
      errors.push(`${familyId}:record_invalid:${row?.record_id ?? 'missing'}`);
    }
  }

  for (const row of references) {
    if (row?.status !== 'approved' ||
        row?.table !== TARGET_TABLE ||
        row?.record_id !== row?.source_record_key ||
        !recordIds.includes(row?.record_id) ||
        !nonEmptyStrings(row?.source_ids) ||
        row.source_ids.some((id) => !sourceIds.has(id))) {
      errors.push(`${familyId}:normalized_reference_invalid:${row?.reference_id ?? 'missing'}`);
    }
  }

  for (const row of provenance) {
    const allowedDecisionIds = new Set([
      decision?.decision_id,
      ...(decision?.prior_decisions ?? []).map((item) => item?.decision_id)
    ]);
    if (row?.status !== 'approved' ||
        !nonEmptyStrings(row?.source_ids) ||
        row.source_ids.some((id) => !sourceIds.has(id)) ||
        !allowedDecisionIds.has(row?.decision_id)) {
      errors.push(`${familyId}:provenance_invalid:${row?.provenance_id ?? 'missing'}`);
    }
  }

  for (const row of sources) {
    if (row?.status !== 'approved' ||
        typeof row?.source_path !== 'string' ||
        !row.source_path.startsWith(`${DATA_ROOT}/sources/`) ||
        !/^[a-f0-9]{64}$/u.test(row?.source_sha256 ?? '')) {
      errors.push(`${familyId}:source_invalid:${row?.source_id ?? 'missing'}`);
    }
  }
}

export async function collectApprovedTemporalBundle({ root = process.cwd() } = {}) {
  const errors = [];
  const seen = {
    records: new Set(),
    references: new Set(),
    provenance: new Set(),
    sources: new Set()
  };
  const families = [];

  for (const required of TEMPORAL_REQUIRED_DATA_FAMILIES) {
    const familyId = required.id;
    const paths = {
      dataset: `${DATA_ROOT}/datasets/${familyId}.json`,
      references: `${DATA_ROOT}/datasets/${familyId}.references.json`,
      provenance: `${DATA_ROOT}/source-approval/${familyId}.provenance.json`,
      sources: `${DATA_ROOT}/source-approval/${familyId}.sources.json`,
      decision: `${DECISION_ROOT}/${familyId}.decision.json`
    };
    let records;
    let references;
    let provenance;
    let sources;
    let decision;
    try {
      [records, references, provenance, sources, decision] = await Promise.all([
        readJson(root, paths.dataset),
        readJson(root, paths.references),
        readJson(root, paths.provenance),
        readJson(root, paths.sources),
        readJson(root, paths.decision)
      ]);
    } catch (error) {
      errors.push(`${familyId}:artifact_missing_or_invalid:${error.code ?? error.name}`);
      continue;
    }
    if (![records, references, provenance, sources].every(Array.isArray)) {
      errors.push(`${familyId}:artifact_root_must_be_array`);
      continue;
    }

    addUnique(records, 'record_id', seen.records, errors, familyId, 'record');
    addUnique(references, 'reference_id', seen.references, errors, familyId, 'reference');
    addUnique(provenance, 'provenance_id', seen.provenance, errors, familyId, 'provenance');
    addUnique(sources, 'source_id', seen.sources, errors, familyId, 'source');
    validateFamily({
      familyId,
      records,
      references,
      provenance,
      sources,
      decision,
      errors
    });

    await Promise.all(sources.map(async (source) => {
      try {
        const bytes = await readFile(resolve(root, source.source_path));
        if (digest(bytes) !== source.source_sha256) {
          errors.push(`${familyId}:source_digest_mismatch:${source.source_id}`);
        }
      } catch (error) {
        errors.push(`${familyId}:source_missing:${source.source_id}:${error.code ?? error.name}`);
      }
    }));
    await Promise.all((decision.prior_decisions ?? []).map(async (prior) => {
      try {
        const priorBytes = await readFile(resolve(root, prior.path));
        const priorDecision = JSON.parse(priorBytes.toString('utf8'));
        if (digest(priorBytes) !== prior.sha256 ||
            priorDecision.decision_id !== prior.decision_id ||
            priorDecision.family_id !== familyId) {
          errors.push(`${familyId}:prior_decision_invalid:${prior.decision_id ?? 'missing'}`);
        }
      } catch (error) {
        errors.push(`${familyId}:prior_decision_missing:${prior?.decision_id ?? 'missing'}:${error.code ?? error.name}`);
      }
    }));

    families.push(Object.freeze({
      family_id: familyId,
      paths: Object.freeze(paths),
      records: Object.freeze(records),
      references: Object.freeze(references),
      provenance: Object.freeze(provenance),
      sources: Object.freeze(sources),
      decision: Object.freeze(decision)
    }));
  }

  const developerTableBindingCount = families
    .flatMap((family) => family.references)
    .filter((row) => row.table !== TARGET_TABLE).length;
  if (developerTableBindingCount > 0) {
    errors.push(`developer_table_bindings_remaining:${developerTableBindingCount}`);
  }

  return Object.freeze({
    schema: 'rus.temporal-world-v4.approved-import-bundle.v1',
    family_count: families.length,
    record_count: seen.records.size,
    reference_count: seen.references.size,
    provenance_count: seen.provenance.size,
    source_count: seen.sources.size,
    developer_table_binding_count: developerTableBindingCount,
    families: Object.freeze(families),
    errors: Object.freeze(errors)
  });
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlJson(value) {
  return `${sqlText(canonicalJson(value))}::jsonb`;
}

function sqlArray(value) {
  return `ARRAY[${value.map(sqlText).join(', ')}]::text[]`;
}

function emitInsert({ table, idColumn, columns, row, values }) {
  const serialized = Object.fromEntries(
    columns.map((column) => [column, values[column](row[column])])
  );
  const comparisons = columns
    .map((column) => `${column} = ${serialized[column]}`)
    .join('\n        AND ');
  return [
    `INSERT INTO world_base.${table} (${columns.join(', ')})`,
    `VALUES (${columns.map((column) => serialized[column]).join(', ')})`,
    `ON CONFLICT (${idColumn}) DO NOTHING;`,
    'DO $temporal_import$',
    'BEGIN',
    `  IF NOT EXISTS (`,
    `    SELECT 1 FROM world_base.${table}`,
    `    WHERE ${comparisons}`,
    '  ) THEN',
    `    RAISE EXCEPTION ${sqlText(`TEMPORAL_APPROVED_ROW_MISMATCH:${table}:${row[idColumn]}`)};`,
    '  END IF;',
    'END',
    '$temporal_import$;'
  ].join('\n');
}

function normalizeRows(bundle) {
  const sourceRows = [];
  const provenanceRows = [];
  const recordRows = [];
  const referenceRows = [];
  for (const family of bundle.families) {
    for (const source of family.sources) {
      const row = {
        source_id: source.source_id,
        family_id: family.family_id,
        status: source.status,
        source_path: source.source_path,
        source_sha256: source.source_sha256,
        metadata: omit(source, new Set(['source_id', 'status', 'source_path', 'source_sha256']))
      };
      row.canonical_digest = rowDigest(row);
      sourceRows.push(row);
    }
    for (const provenance of family.provenance) {
      const row = {
        provenance_id: provenance.provenance_id,
        family_id: family.family_id,
        status: provenance.status,
        source_ids: provenance.source_ids,
        approval: omit(provenance, new Set(['provenance_id', 'status', 'source_ids']))
      };
      row.canonical_digest = rowDigest(row);
      provenanceRows.push(row);
    }
    for (const record of family.records) {
      const row = {
        record_id: record.record_id,
        family_id: family.family_id,
        record_kind: record.record_kind,
        record_version: record.version,
        applicability: record.applicability,
        status: record.status,
        provenance_refs: record.provenance_refs,
        normalized_reference_ids: record.normalized_reference_ids,
        source_history_refs: record.source_history_refs,
        payload: record.payload
      };
      row.canonical_digest = rowDigest(row);
      recordRows.push(row);
    }
    for (const reference of family.references) {
      const row = {
        reference_id: reference.reference_id,
        family_id: family.family_id,
        status: reference.status,
        source_record_id: reference.source_record_key,
        target_table: reference.table,
        target_record_id: reference.record_id,
        binding: omit(reference, new Set([
          'reference_id',
          'status',
          'source_record_key',
          'table',
          'record_id'
        ]))
      };
      row.canonical_digest = rowDigest(row);
      referenceRows.push(row);
    }
  }
  const byId = (field) => (left, right) => left[field].localeCompare(right[field]);
  return {
    sourceRows: sourceRows.sort(byId('source_id')),
    provenanceRows: provenanceRows.sort(byId('provenance_id')),
    recordRows: recordRows.sort(byId('record_id')),
    referenceRows: referenceRows.sort(byId('reference_id'))
  };
}

export async function buildApprovedTemporalImportSql({
  root = process.cwd(),
  rollback = false
} = {}) {
  const bundle = await collectApprovedTemporalBundle({ root });
  if (bundle.errors.length > 0 ||
      bundle.family_count !== TEMPORAL_REQUIRED_DATA_FAMILIES.length ||
      bundle.record_count !== 22 ||
      bundle.reference_count !== 22 ||
      bundle.provenance_count !== 14 ||
      bundle.source_count !== 46) {
    throw new Error(`Temporal approved import is not closed:\n- ${bundle.errors.join('\n- ')}`);
  }
  const { sourceRows, provenanceRows, recordRows, referenceRows } = normalizeRows(bundle);
  const reactionPolicyRows = recordRows.filter(
    ({ record_kind }) => record_kind === 'npc_reaction_policy'
  );
  if (reactionPolicyRows.length !== 1) {
    throw new Error(
      `Temporal approved import requires exactly one npc_reaction_policy; received ${reactionPolicyRows.length}.`
    );
  }
  const reactionProjection =
    buildNpcReactionPolicySnapshotFromAuthoringRow(reactionPolicyRows[0]);
  if (!reactionProjection.ok) {
    throw new Error(
      `Temporal approved reaction policy projection is invalid: ${JSON.stringify(reactionProjection.error)}`
    );
  }
  const statements = [
    'BEGIN;',
    `SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEY});`
  ];
  for (const row of sourceRows) {
    statements.push(emitInsert({
      table: 'temporal_source_history',
      idColumn: 'source_id',
      columns: ['source_id', 'family_id', 'status', 'source_path', 'source_sha256', 'metadata', 'canonical_digest'],
      row,
      values: {
        source_id: sqlText,
        family_id: sqlText,
        status: sqlText,
        source_path: sqlText,
        source_sha256: sqlText,
        metadata: sqlJson,
        canonical_digest: sqlText
      }
    }));
  }
  for (const row of provenanceRows) {
    statements.push(emitInsert({
      table: 'temporal_provenance',
      idColumn: 'provenance_id',
      columns: ['provenance_id', 'family_id', 'status', 'source_ids', 'approval', 'canonical_digest'],
      row,
      values: {
        provenance_id: sqlText,
        family_id: sqlText,
        status: sqlText,
        source_ids: sqlArray,
        approval: sqlJson,
        canonical_digest: sqlText
      }
    }));
  }
  for (const row of recordRows) {
    statements.push(emitInsert({
      table: 'temporal_authoring_records',
      idColumn: 'record_id',
      columns: [
        'record_id',
        'family_id',
        'record_kind',
        'record_version',
        'applicability',
        'status',
        'provenance_refs',
        'normalized_reference_ids',
        'source_history_refs',
        'payload',
        'canonical_digest'
      ],
      row,
      values: {
        record_id: sqlText,
        family_id: sqlText,
        record_kind: sqlText,
        record_version: sqlText,
        applicability: sqlArray,
        status: sqlText,
        provenance_refs: sqlArray,
        normalized_reference_ids: sqlArray,
        source_history_refs: sqlArray,
        payload: sqlJson,
        canonical_digest: sqlText
      }
    }));
  }
  for (const row of referenceRows) {
    statements.push(emitInsert({
      table: 'temporal_normalized_references',
      idColumn: 'reference_id',
      columns: [
        'reference_id',
        'family_id',
        'status',
        'source_record_id',
        'target_table',
        'target_record_id',
        'binding',
        'canonical_digest'
      ],
      row,
      values: {
        reference_id: sqlText,
        family_id: sqlText,
        status: sqlText,
        source_record_id: sqlText,
        target_table: sqlText,
        target_record_id: sqlText,
        binding: sqlJson,
        canonical_digest: sqlText
      }
    }));
  }
  statements.push(rollback ? 'ROLLBACK;' : 'COMMIT;');
  return `${statements.join('\n')}\n`;
}

const isCli = process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isCli) {
  const emitSql = process.argv.includes('--sql');
  const rollback = process.argv.includes('--rollback');
  try {
    if (emitSql) {
      process.stdout.write(await buildApprovedTemporalImportSql({ rollback }));
    } else {
      const bundle = await collectApprovedTemporalBundle();
      process.stdout.write(`${JSON.stringify({
        schema: bundle.schema,
        family_count: bundle.family_count,
        record_count: bundle.record_count,
        reference_count: bundle.reference_count,
        provenance_count: bundle.provenance_count,
        source_count: bundle.source_count,
        developer_table_binding_count: bundle.developer_table_binding_count,
        errors: bundle.errors
      }, null, 2)}\n`);
      if (bundle.errors.length > 0) process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}
