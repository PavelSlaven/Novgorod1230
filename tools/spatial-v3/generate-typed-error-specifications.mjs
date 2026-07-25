import { mkdir, readFile, writeFile } from 'node:fs/promises';

const standardSource = 'data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md';
const temporalSource = 'data/knowledge-source/corpus/DOCUMENTS/temporal_world_and_interruptible_activities.md';
const output = 'packages/contracts/src/spatial-v3/typed-error-specifications.json';
const baselineOutput = 'packages/contracts/src/spatial-v3/typed-error-specifications-4.2.0-target.1.json';
const temporalBaselineOutput = 'packages/contracts/src/spatial-v3/typed-error-specifications-4.3.0-target.1.json';
const check = process.argv.includes('--check');
const standard = await readFile(standardSource, 'utf8');
const temporal = await readFile(temporalSource, 'utf8');
const appendix = standard.slice(standard.indexOf('# Приложение C.'), standard.indexOf('# Приложение D.'));
const temporalAppendix = temporal.slice(temporal.indexOf('# Приложение B.'));

function parseErrors(text) {
  return text.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|(?:\s*([^|]+?)\s*\|)?$/);
    return match ? [{
      error_code: match[1],
      meaning: match[2],
      required_reaction: match[3],
      ...(match[4] ? { retryability: match[4] } : {})
    }] : [];
  });
}

async function writeArtifact(path, artifact) {
  const content = `${JSON.stringify(artifact, null, 2)}\n`;
  if (check) {
    const current = await readFile(path, 'utf8').catch(() => null);
    if (current !== content) throw new Error(`${path} is stale; run ${process.argv[1]}`);
    return;
  }
  await writeFile(path, content);
}

const baselineErrors = parseErrors(appendix);
const temporalErrors = parseErrors(temporalAppendix);
if (baselineErrors.length !== 58 || new Set(baselineErrors.map(({ error_code }) => error_code)).size !== 58) throw new Error('Appendix C typed error parse failed');
if (temporalErrors.length !== 24 || new Set(temporalErrors.map(({ error_code }) => error_code)).size !== 24) throw new Error('Temporal Appendix B typed error parse failed');
const byCode = new Map(baselineErrors.map((error) => [error.error_code, error]));
for (const error of temporalErrors) byCode.set(error.error_code, error);
const errors = [...byCode.values()];
if (errors.length !== 82) throw new Error(`Expected 82 merged typed errors, got ${errors.length}`);
await mkdir('packages/contracts/src/spatial-v3', { recursive: true });
await writeArtifact(baselineOutput, { source: standardSource, source_version: '4.2.0-target.1', errors: baselineErrors });
const acceptedTemporalArtifact = {
  source: standardSource,
  amendment_source: temporalSource,
  source_version: '4.3.0-target.1',
  errors
};
await writeArtifact(temporalBaselineOutput, acceptedTemporalArtifact);
await writeArtifact(output, { ...acceptedTemporalArtifact, source_version: '4.4.0-target.1' });
console.log(`Generated ${output}: ${errors.length} merged Spatial v4.2 + Temporal v4 typed errors.`);
