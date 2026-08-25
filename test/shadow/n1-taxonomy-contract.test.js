import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('reviewed N1 taxonomy remains separate from active autonomous actor-step', async () => {
  const [umbrella, npc] = await Promise.all([
    source('data/knowledge-source/corpus/DOCUMENTS/semantic_world_actions_materialization_and_processes_contract.md'),
    source('data/knowledge-source/corpus/DOCUMENTS/npc_autonomous_decision_contract.md')
  ]);

  assert.match(umbrella, /^# .* v2\.1$/mu);
  assert.match(umbrella, /N1 — ordinary NPC semantic remainder/u);
  assert.match(npc, /current actor-step cutover/u);
  assert.doesNotMatch(npc, /current N1 cutover|approved N1 profile|Runtime N1/u);
});
