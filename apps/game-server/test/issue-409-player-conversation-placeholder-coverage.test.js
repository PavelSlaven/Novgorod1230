import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const testDirectory = path.dirname(new URL(import.meta.url).pathname);
const gameServerDirectory = path.resolve(testDirectory, '..');
const contractPath = path.join(gameServerDirectory, 'src/runtime/lower-dvina-trace-phase-2-conversation-prompt-contract.js');
const productionBuilderPath = path.join(gameServerDirectory, 'src/runtime/lower-dvina-trace-phase-2-player-conversation-prompts.js');
const selectedBuilderPath = path.resolve(process.env.ISSUE_409_BUILDER_MODULE || productionBuilderPath);

async function createBuilderFixture(mappingOverride = null) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'issue-409-player-conversation-'));
  const originalContractSource = await readFile(contractPath, 'utf8');
  const builderSource = await readFile(selectedBuilderPath, 'utf8');
  const contract = await import(pathToFileURL(contractPath));
  const mappings = mappingOverride ?? JSON.parse(contract.CONVERSATION_PLAN_MAPPINGS);
  const declarationStart = originalContractSource.indexOf(
    'export const CONVERSATION_PLAN_MAPPINGS = JSON.stringify({');
  const declarationEnd = originalContractSource.indexOf('\n});', declarationStart) + 4;
  assert.ok(declarationStart >= 0 && declarationEnd > declarationStart,
    'contract mapping declaration must be available for fixture substitution');
  const fixtureContractSource = originalContractSource.slice(0, declarationStart)
    + `export const CONVERSATION_PLAN_MAPPINGS = ${JSON.stringify(JSON.stringify(mappings))};`
    + originalContractSource.slice(declarationEnd);
  const fixtureContractPath = path.join(directory,
    'lower-dvina-trace-phase-2-conversation-prompt-contract.js');
  const fixtureBuilderPath = path.join(directory,
    'lower-dvina-trace-phase-2-player-conversation-prompts.js');
  await Promise.all([
    writeFile(fixtureContractPath, fixtureContractSource),
    writeFile(fixtureBuilderPath, builderSource)
  ]);
  const builder = await import(`${pathToFileURL(fixtureBuilderPath).href}?fixture=${Date.now()}`);
  return { directory, playerConversationInstructions: builder.playerConversationInstructions };
}

function mappingFromInstructions(instructions) {
  const match = instructions.match(/Для подходящих случаев используй эти соответствия:\n(\{[^\n]+\})/u);
  assert.ok(match, 'player instructions must include serialized conversation mappings');
  return JSON.parse(match[1]);
}

test('issue 409: normal player conversation mapping remains usable', async (t) => {
  const fixture = await createBuilderFixture();
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));

  const instructions = fixture.playerConversationInstructions(false);
  const mappings = mappingFromInstructions(instructions);
  assert.equal(mappings.social_check.check.purpose, '<краткое назначение проверки>');
  assert.equal(mappings.action_handoff.handoff.intent,
    '<обоснованное намерение для передачи>');
});

for (const drift of ['renamed', 'added']) {
test(`issue 409: ${drift} English placeholder never reaches model instructions`, async (t) => {
  const contract = await import(pathToFileURL(contractPath));
  const mappings = JSON.parse(contract.CONVERSATION_PLAN_MAPPINGS);
  if (drift === 'renamed') mappings.social_check.check.purpose = '<short purpose>';
  else mappings.supporting_interaction.supporting_operations.push(
    '<copy additional permitted operation from request>');
  const fixture = await createBuilderFixture(mappings);
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));

  let instructions;
  try {
    instructions = fixture.playerConversationInstructions(false);
  } catch (error) {
    assert.equal(error.code, 'PLAYER_CONVERSATION_PROMPT_MAPPING_INCOMPLETE');
    return;
  }

  assert.doesNotMatch(JSON.stringify(mappingFromInstructions(instructions)), /<[A-Za-z][^<>]*>/u,
    'every English mapping placeholder must be handled or explicitly rejected');
});
}
