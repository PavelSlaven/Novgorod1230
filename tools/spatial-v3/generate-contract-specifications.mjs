import { mkdir, readFile, writeFile } from 'node:fs/promises';

const source = 'data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md';
const output = 'packages/contracts/src/spatial-v3/specifications.json';
const standard = await readFile(source, 'utf8');
const appendix = standard.slice(standard.indexOf('# Приложение B.'), standard.indexOf('# Приложение C.'));

function list(lines, heading) {
  const index = lines.findIndex((line) => line === `${heading}:`);
  if (index < 0) return [];
  const values = [];
  for (let cursor = index + 1; cursor < lines.length && /^  - /.test(lines[cursor]); cursor += 1) values.push(lines[cursor].slice(4).trim());
  return values;
}

function parse(block) {
  const lines = block.split(/\r?\n/);
  const fields = [];
  const start = lines.indexOf('fields:');
  for (let cursor = start + 1; start >= 0 && cursor < lines.length && /^  /.test(lines[cursor]); cursor += 1) {
    const match = lines[cursor].match(/^  ([a-z0-9_]+): (required|optional) (.+)$/);
    if (match) fields.push({ name: match[1], required: match[2] === 'required', type: match[3] });
  }
  return {
    contract_name: lines.find((line) => line.startsWith('contract_name: '))?.slice('contract_name: '.length),
    storage: lines.find((line) => line.startsWith('storage: '))?.slice('storage: '.length),
    identity: list(lines, 'identity'),
    fields,
    relations: list(lines, 'relations').map((entry) => {
      const match = entry.match(/^([a-z0-9_]+): (.+)$/);
      return match ? { name: match[1], type: match[2] } : { name: entry, type: null };
    }),
    invariants: list(lines, 'invariants')
  };
}

const specifications = [...appendix.matchAll(/```yaml\r?\n([\s\S]*?)```/g)].map((match) => parse(match[1]));
if (specifications.length !== 160 || specifications.some((specification) => !specification.contract_name || !specification.storage)) throw new Error('Appendix B contract specification parse failed');
await mkdir('packages/contracts/src/spatial-v3', { recursive: true });
await writeFile(output, `${JSON.stringify({ source, source_version: '4.2.0', specifications }, null, 2)}\n`);
console.log(`Generated ${output}: ${specifications.length} exact Appendix B contract specifications.`);
