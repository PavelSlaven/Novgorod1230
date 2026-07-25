import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const inputPath = 'data/contracts/spatial-v3/controlled-vocabularies.v2.json';
const outputPath = 'data/contracts/spatial-v3/controlled-vocabularies.v3.json';
const base = JSON.parse(await readFile(inputPath, 'utf8'));
const check = process.argv.includes('--check');

const vocabularies = base.vocabularies.map((entry, index) => {
  const next = structuredClone(entry);
  next.path = `${outputPath}#/vocabularies/${index}`;
  next.version = '3.0.0';
  if (next.pseudo_type === 'controlled_entity_kind') {
    next.source_ranges = [...next.source_ranges, 'Temporal World v4 Appendix A.7 PR8 handoff amendment'];
    next.consumers = [...next.consumers, {
      contract: 'npc_decision_option',
      field: 'command_ref.entity_ref.entity_kind',
      rule: 'Approved bounded-decision command records use exactly the decision_command entity kind.'
    }];
    next.values = appendValue(next.values, {
      id: 'decision_command',
      label: 'decision command',
      description: 'Approved bounded-decision command record backed by world_base.decision_command_catalog.',
      metadata: {
        derivation: 'pr8_reaction_command_contract_gap',
        normative_source: 'Temporal World v4 Appendix A.7'
      }
    });
  }
  delete next.digest;
  return { ...next, digest: canonicalDigest(next) };
});

const registry = {
  ...structuredClone(base),
  version: '3.0.0',
  approval_basis: 'Temporal World v4 Appendix A.7 PR8 handoff amendment over the immutable approved 2.0.0 registry.',
  vocabulary_count: vocabularies.length,
  value_count: vocabularies.reduce((sum, entry) => sum + entry.values.length, 0),
  vocabularies
};
delete registry.aggregate_digest;
registry.aggregate_digest = canonicalDigest(registry);

const rendered = `${JSON.stringify(registry, null, 2)}\n`;
if (check) {
  const current = await readFile(outputPath, 'utf8').catch(() => null);
  if (current !== rendered) throw new Error(`${outputPath} is stale`);
  console.log(`PR8 vocabulary registry is reproducible: ${registry.vocabulary_count}/${registry.value_count}.`);
} else {
  await writeFile(outputPath, rendered, 'utf8');
  console.log(`Wrote ${outputPath}: ${registry.vocabulary_count}/${registry.value_count}.`);
}

function appendValue(existing, added) {
  if (existing.some(({ id }) => id === added.id)) throw new Error(`Vocabulary value ${added.id} already exists.`);
  return [...existing.map((entry) => structuredClone(entry)), added]
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function canonicalDigest(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
