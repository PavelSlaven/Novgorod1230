import { spawnSync } from 'node:child_process';
import { collectConformanceReport, collectStateMachineReport } from './red-contract-harness.mjs';

const report = await collectConformanceReport();
const machines = await collectStateMachineReport();
if (report.target.historical.contracts.length !== 160 || report.target.historical.errors.length !== 58) throw new Error('Frozen P05 target totals changed');
if (report.target.contracts.length !== 228 || report.target.errors.length !== 86) throw new Error('Current 4.7 target totals changed');
if (report.missing.jsonSchemaOrDto.length || report.missing.validator.length || report.missing.typedError.length) throw new Error('Non-vocabulary P07 registry coverage is incomplete');
if (!machines.definitions || machines.definitions.executionTransitions.length !== 16 || machines.definitions.executionEvents.length !== 12) throw new Error('Appendix A registry is incomplete');
const result = spawnSync(process.execPath, ['--test', 'test/spatial-v3/p06-red-state-machines.test.js'], { encoding: 'utf8' });
if (result.status !== 0) throw new Error(`${result.stdout}\n${result.stderr}`);
console.log('P07 non-vocabulary checks passed: historical P05 160/58 preserved; current 4.7 has 228 validators, 86 typed errors and Appendix A state machines.');
