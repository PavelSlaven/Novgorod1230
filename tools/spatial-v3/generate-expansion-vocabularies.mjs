import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { canonicalDigest } from '../../packages/contracts/src/spatial-v3/controlled-vocabularies.js';

const path = 'data/contracts/spatial-v3/controlled-vocabularies.v4.json';
const base = JSON.parse(await readFile('data/contracts/spatial-v3/controlled-vocabularies.v3.json', 'utf8'));
const version = '4.0.0';
const vocabularies = base.vocabularies.map((row, index) => {
  const value = { ...structuredClone(row), version, path: `${path}#/vocabularies/${index}` };
  if (value.pseudo_type === 'controlled_entity_kind') {
    value.values.push(...[
      ['expansion_rule_set', 'Expansion rule set', 'Versioned approved adjacency, connectivity or seed strategy of a finite G4 expansion profile.'],
      ['g6_acoustic_baseline', 'G6 acoustic baseline', 'Versioned approved ambient-noise authoring bound to exactly one source: a generated G5 template or a canonical G5, with its exact scene template and G6 slot.']
    ].map(([id, label, description]) => ({ id, label, description,
      metadata: { derivation: 'm2c_authoring_schema', normative_source: 'issue #133 M2c owner authoring instructions; World Base schemas 22 and 23' } })));
    value.values.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }
  delete value.digest;
  return { ...value, digest: canonicalDigest(value) };
});
const registry = { ...base, version,
  approval_basis: 'M2c owner-authorized authoring in issue #133: technical identities for exact expansion rules and G6 acoustic baselines with exactly one source, generated G5 template or canonical G5; historical v1-v3 registries remain immutable.',
  vocabularies, value_count: vocabularies.reduce((count, row) => count + row.values.length, 0) };
delete registry.aggregate_digest;
registry.aggregate_digest = canonicalDigest(registry);
const serialized = `${JSON.stringify(registry, null, 2)}\n`;
if (process.argv.includes('--check')) assert.equal(await readFile(path, 'utf8'), serialized);
else await writeFile(path, serialized);
console.log(`Expansion vocabulary registry ${version}: ${registry.value_count} values.`);
