import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAuthoringBundle, buildTransactionalImportSql } from './p12-authoring-importer.mjs';
import { validateP12SourceApproval } from './p12-source-approval.mjs';
import { validateP12TargetMaterializationApprovalV11 } from './p12-target-materialization-approval-v1_1.mjs';
import { assessP12V11PhysicalProjection, buildP12V11PhysicalProjectionSql } from './p12-v1_1-physical-projection.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const CLOSURE_MANIFEST = 'data/world-catalogs/novgorod/spatial-v3/target-materialization-approval/dependency-closure/v1/import-manifest.json';

const failure = (stage, errors) => {
  const codes = errors.map((entry) => entry.code ?? entry).join(', ');
  return new Error(`P12 target import refuses ${stage}: ${codes || 'validation failed'}`);
};

/**
 * Builds the only target-v3 authoring import transaction.  This is deliberately
 * an offline world_base authoring operation: approval remains non-production and
 * it cannot activate P28 or the runtime.
 */
export async function buildP12TargetImportPlan({
  root = ROOT,
  rollback = false,
  validateApproval = validateP12TargetMaterializationApprovalV11,
  validateSource = validateP12SourceApproval,
  validateBundle = validateAuthoringBundle,
  assessProjection = assessP12V11PhysicalProjection,
  buildClosureSql = buildTransactionalImportSql,
  buildProjectionSql = buildP12V11PhysicalProjectionSql
} = {}) {
  const projectRoot = resolve(root);
  const approval = await validateApproval({ root: projectRoot });
  if (!approval.ok || approval.materialization_authorized !== false || approval.p28_activation !== 'not_authorized') throw failure('V1.1 approval gate', approval.errors ?? []);
  const source = await validateSource({ root: projectRoot });
  if (!source.ok || source.activation !== 'not_authorized') throw failure('approved source gate', source.errors ?? []);
  const closure = await validateBundle({ root: projectRoot, manifestPath: CLOSURE_MANIFEST, validateTargetApproval: async () => approval });
  if (!closure.ok || closure.errors.length || closure.data_gaps.length) throw failure('complete dependency-closure bundle', [...closure.errors, ...closure.data_gaps]);
  const projection = await assessProjection({ root: projectRoot });
  if (!projection.ok || !projection.compilation_authorized) throw failure('compiled physical target bundle', projection.errors ?? []);
  const [closureSql, projectionSql] = await Promise.all([
    buildClosureSql({ root: projectRoot, manifestPath: CLOSURE_MANIFEST, wrapTransaction: false, temporaryTablePrefix: 'p12_closure_candidate' }),
    buildProjectionSql({ root: projectRoot, wrapTransaction: false, temporaryTablePrefix: 'p12_projection_candidate' })
  ]);
  return Object.freeze({
    ok: true,
    target_import_authorized: true,
    materialization_authorized: false,
    p28_activation: 'not_authorized',
    source_manifest: CLOSURE_MANIFEST,
    source_dataset_counts: closure.dataset_counts,
    projection_dataset_counts: projection.coverage.filter((row) => row.table).reduce((counts, row) => ({ ...counts, [row.table]: row.actual_rows }), {}),
    sql: `BEGIN;\n${closureSql}${projectionSql}${rollback ? 'ROLLBACK;' : 'COMMIT;'}\n`
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildP12TargetImportPlan({ rollback: process.argv.includes('--rollback') });
  process.stdout.write(`${JSON.stringify({ ...result, sql: undefined }, null, 2)}\n`);
}
