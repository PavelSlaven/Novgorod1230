import { mkdir, readFile, writeFile } from 'node:fs/promises';

const standardSource = 'data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md';
const temporalSource = 'data/knowledge-source/corpus/DOCUMENTS/temporal_world_and_interruptible_activities.md';
const npcCombatSource = 'data/knowledge-source/corpus/DOCUMENTS/npc_combat_and_trigger_contract.md';
const npcAutonomousSource = 'data/knowledge-source/corpus/DOCUMENTS/npc_autonomous_decision_contract.md';
const npcConversationSource = 'data/knowledge-source/corpus/DOCUMENTS/npc_conversation_mode_contract.md';
const output = 'packages/contracts/src/spatial-v3/specifications.json';
const baselineOutput = 'packages/contracts/src/spatial-v3/specifications-4.2.0-target.1.json';
const temporalBaselineOutput = 'packages/contracts/src/spatial-v3/specifications-4.3.0-target.1.json';
const check = process.argv.includes('--check');
const standard = await readFile(standardSource, 'utf8');
const temporal = await readFile(temporalSource, 'utf8');
const npcCombat = await readFile(npcCombatSource, 'utf8');
const npcAutonomous = await readFile(npcAutonomousSource, 'utf8');
const npcConversation = await readFile(npcConversationSource, 'utf8');
const appendix = standard.slice(standard.indexOf('# Приложение B.'), standard.indexOf('# Приложение C.'));
const temporalAppendix = temporal.slice(temporal.indexOf('# Приложение A.'), temporal.indexOf('# Приложение B.'));
const pr8AmendmentIndex = temporalAppendix.indexOf('## A.7.');
if (pr8AmendmentIndex < 0) throw new Error('Temporal Appendix A.7 PR8 handoff amendment is missing');
const acceptedTemporalAppendix = temporalAppendix.slice(0, pr8AmendmentIndex);
const machineAppendixHeading = '# Приложение A. Machine contract specifications';

function machineAppendix(text, source) {
  const index = text.indexOf(machineAppendixHeading);
  if (index < 0) throw new Error(`${source} machine contract appendix is missing`);
  return text.slice(index);
}

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
    relations: (() => {
      const entries = list(lines, 'relations');
      const start = lines.indexOf('relations:');
      for (let cursor = start + 1; start >= 0 && cursor < lines.length && /^  /.test(lines[cursor]); cursor += 1) {
        const match = lines[cursor].match(/^  ([a-z0-9_]+): (.+)$/);
        if (match) entries.push(`${match[1]}: ${match[2]}`);
      }
      return entries.map((entry) => {
        const match = entry.match(/^([a-z0-9_]+): (.+)$/);
        return match ? { name: match[1], type: match[2] } : { name: entry, type: null };
      });
    })(),
    invariants: list(lines, 'invariants')
  };
}

function parseSpecifications(text) {
  return [...text.matchAll(/```yaml\r?\n([\s\S]*?)```/g)].map((match) => parse(match[1]));
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

const baselineSpecifications = parseSpecifications(appendix);
const acceptedTemporalSpecifications = parseSpecifications(acceptedTemporalAppendix);
const temporalSpecifications = parseSpecifications(temporalAppendix);
const npcCombatSpecifications = parseSpecifications(machineAppendix(npcCombat, npcCombatSource));
const npcAutonomousSpecifications = parseSpecifications(machineAppendix(npcAutonomous, npcAutonomousSource));
const npcConversationSpecifications = parseSpecifications(machineAppendix(npcConversation, npcConversationSource));
if (baselineSpecifications.length !== 160 || baselineSpecifications.some((specification) => !specification.contract_name || !specification.storage)) throw new Error('Appendix B contract specification parse failed');
if (acceptedTemporalSpecifications.length !== 35 || acceptedTemporalSpecifications.some((specification) => !specification.contract_name || !specification.storage)) throw new Error('Accepted Temporal Appendix A.1-A.6 parse failed');
if (temporalSpecifications.length !== 62 || temporalSpecifications.some((specification) => !specification.contract_name || !specification.storage)) throw new Error('Current Temporal Appendix A contract specification parse failed');
if (npcCombatSpecifications.length !== 2 || npcCombatSpecifications.some((specification) => !specification.contract_name || !specification.storage)) throw new Error('NPC combat machine contract appendix parse failed');
if (npcAutonomousSpecifications.length !== 3 || npcAutonomousSpecifications.some((specification) => !specification.contract_name || !specification.storage)) throw new Error('NPC autonomous machine contract appendix parse failed');
if (npcConversationSpecifications.length !== 7 || npcConversationSpecifications.some((specification) => !specification.contract_name || !specification.storage)) throw new Error('NPC conversation machine contract appendix parse failed');
const merge = (amendment) => {
  const byName = new Map(baselineSpecifications.map((specification) => [specification.contract_name, specification]));
  for (const specification of amendment) byName.set(specification.contract_name, specification);
  return [...byName.values()];
};
const acceptedSpecifications = merge(acceptedTemporalSpecifications);
const specifications = merge([
  ...temporalSpecifications,
  ...npcCombatSpecifications,
  ...npcAutonomousSpecifications,
  ...npcConversationSpecifications
]);
if (acceptedSpecifications.length !== 188) throw new Error(`Expected 188 accepted 4.3 contract specifications, got ${acceptedSpecifications.length}`);
if (specifications.length !== 225) throw new Error(`Expected 225 current 4.5 contract specifications, got ${specifications.length}`);
await mkdir('packages/contracts/src/spatial-v3', { recursive: true });
await writeArtifact(baselineOutput, { source: standardSource, source_version: '4.2.0-target.1', specifications: baselineSpecifications });
await writeArtifact(temporalBaselineOutput, {
  source: standardSource,
  amendment_source: temporalSource,
  source_version: '4.3.0-target.1',
  specifications: acceptedSpecifications
});
await writeArtifact(output, {
  source: standardSource,
  amendment_source: temporalSource,
  amendment_scope: 'Appendix A.1-A.7',
  additional_amendment_sources: [
    { source: npcCombatSource, scope: 'Appendix A' },
    { source: npcAutonomousSource, scope: 'Appendix A' },
    { source: npcConversationSource, scope: 'Appendix A' }
  ],
  source_version: '4.5.0-target.1',
  specifications
});
console.log(`Generated ${output}: ${specifications.length} merged Spatial v4.2 + Temporal v4/PR8 handoff + M2 NPC contract specifications.`);
