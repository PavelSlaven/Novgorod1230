import { mkdir, readFile, writeFile } from 'node:fs/promises';

const source = 'data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md';
const output = 'packages/contracts/src/spatial-v3/typed-error-specifications.json';
const standard = await readFile(source, 'utf8');
const appendix = standard.slice(standard.indexOf('# Приложение C.'), standard.indexOf('# Приложение D.'));
const errors = appendix.split(/\r?\n/).flatMap((line) => {
  const match = line.match(/^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
  return match ? [{ error_code: match[1], meaning: match[2], required_reaction: match[3] }] : [];
});
if (errors.length !== 58 || new Set(errors.map(({ error_code }) => error_code)).size !== 58) throw new Error('Appendix C typed error parse failed');
await mkdir('packages/contracts/src/spatial-v3', { recursive: true });
await writeFile(output, `${JSON.stringify({ source, source_version: '4.2.0', errors }, null, 2)}\n`);
console.log(`Generated ${output}: ${errors.length} exact Appendix C typed errors.`);
