import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { collectConformanceReport, collectStateMachineReport, collectCompatibilityReport, targetArtifactPaths } from './red-contract-harness.mjs';

const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
for (const script of ['spatial-v3:red', 'spatial-v3:verify-red', 'spatial-v3:check-p06']) {
  if (!packageJson.scripts[script]) throw new Error(`package.json lacks ${script}`);
}
const conformance = await collectConformanceReport();
if (conformance.target.historical.contracts.length !== 160 || conformance.target.historical.errors.length !== 58) throw new Error('P06 harness did not preserve frozen P05 totals');
if (conformance.target.contracts.length !== 225 || conformance.target.errors.length !== 82) throw new Error('P06 harness did not parse the current 4.5 target union');
if (conformance.target.stateMachines.executionTransitions.length !== 16 || conformance.target.stateMachines.executionEvents.length !== 12) throw new Error('P06 harness did not parse Appendix A execution matrices');
const stateMachines = await collectStateMachineReport();
const compatibility = await collectCompatibilityReport();
if (conformance.artifacts.contractRegistry.missing || stateMachines.artifact.missing) throw new Error('P07-owned registry artifacts are missing');
if (compatibility.artifact.missing || typeof compatibility.validateRuntimeComposition !== 'function') throw new Error('the release boundary requires the explicit no-mixing compatibility evaluator');
if (conformance.missing.jsonSchemaOrDto.length || conformance.missing.validator.length || conformance.missing.typedError.length) throw new Error('P07 contract or typed-error registry is incomplete');
const result = spawnSync(process.execPath, [
  '--test',
  'test/spatial-v3/p06-red-contract-conformance.test.js',
  'test/spatial-v3/p06-red-state-machines.test.js',
  'test/spatial-v3/p06-red-no-mixing.test.js'
], { encoding: 'utf8' });
const output = `${result.stdout}\n${result.stderr}`;
if (result.status !== 0) throw new Error(`P27 legacy-contract regression suite failed:\n${output}`);
console.log('P06/P27 contract handoff passed: historical P05 160/58, current 4.5 225/82, Appendix A 16/12 and explicit no-mixing composition are green.');
