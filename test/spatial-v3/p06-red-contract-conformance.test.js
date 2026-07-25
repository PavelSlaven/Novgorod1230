import assert from 'node:assert/strict';
import test from 'node:test';
import { collectConformanceReport, loadHistoricalTarget } from '../../tools/spatial-v3/red-contract-harness.mjs';

test('P05 historical snapshot remains 160 contracts / 58 errors independently of v3 artifacts', async () => {
  const target = await loadHistoricalTarget();
  assert.equal(target.contracts.length, 160);
  assert.equal(target.errors.length, 58);
});

test('P06 harness parses the current 213-contract / 82-error union independently of runtime artifacts', async () => {
  const report = await collectConformanceReport();
  assert.equal(report.target.contracts.length, 213);
  assert.equal(report.target.errors.length, 82);
  assert.equal(report.target.stateMachines.executionTransitions.length, 16);
  assert.equal(report.target.stateMachines.executionEvents.length, 12);
});

test('P07: every current contract has schema/DTO and validator evidence, and every typed error is registered', async () => {
  const report = await collectConformanceReport();
  assert.deepEqual(report.missing.jsonSchemaOrDto, []);
  assert.deepEqual(report.missing.validator, []);
  assert.deepEqual(report.missing.typedError, []);
});

test('P27 release gate records all target contracts as implemented outside the obsolete P06 red DDL probe', async () => {
  const report = await collectConformanceReport();
  assert.equal(report.artifacts.ddlRegistry.missing, true, 'the historical P06 DDL registry was intentionally never a source of release truth');
  assert.deepEqual(report.missing.ddl, report.target.contracts, 'the obsolete P06 probe must not be used as a release DDL assertion');
});
