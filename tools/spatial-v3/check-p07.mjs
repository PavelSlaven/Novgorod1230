import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { collectConformanceReport, collectStateMachineReport } from './red-contract-harness.mjs';

const report = await collectConformanceReport();
const machines = await collectStateMachineReport();
if (report.target.historical.contracts.length !== 160 || report.target.historical.errors.length !== 58) throw new Error('Frozen P05 target totals changed');
if (report.target.contracts.length !== 225 || report.target.errors.length !== 82) throw new Error('Current 4.5 target totals changed');
if (report.missing.jsonSchemaOrDto.length || report.missing.validator.length || report.missing.typedError.length) throw new Error('P07 registry coverage is incomplete');
if (!report.artifacts.ddlRegistry.missing) throw new Error('P07 must not introduce P09 DDL evidence');
if (!machines.definitions || machines.definitions.executionTransitions.length !== 16 || machines.definitions.executionEvents.length !== 12) throw new Error('Appendix A registry is incomplete');
const result = spawnSync(process.execPath, ['--test', 'packages/contracts/test/spatial-v3-registry.test.js', 'test/spatial-v3/p06-red-state-machines.test.js', 'test/spatial-v3/p07-controlled-vocabulary-integration.test.js'], { encoding: 'utf8' });
if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}`);
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
if (!packageJson.scripts['spatial-v3:check-p07']) throw new Error('package.json lacks spatial-v3:check-p07');
console.log('P07 checks passed: 225 schema/validator definitions, 21 closed vocabulary registries, 82 typed errors and Appendix A state machines.');
