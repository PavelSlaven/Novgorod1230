import { buildApprovedTemporalImportSql } from
  '../../tools/temporal-v4/import-approved-data.mjs';

export async function installApprovedTemporalDataForTest({
  worldPool,
  repositoryRoot = process.cwd()
}) {
  await worldPool.query(await buildApprovedTemporalImportSql({
    root: repositoryRoot
  }));
}
