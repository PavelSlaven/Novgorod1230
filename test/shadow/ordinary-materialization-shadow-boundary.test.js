import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('ordinary foundation remains shadow-only: discovery has no ordinary model or ledger route', async () => {
  const [actorStep, runtimePorts, bindings, agents, contract] = await Promise.all([
    source('packages/turn/src/turn-step-actor-step.js'),
    source('apps/game-server/src/runtime/lower-dvina-trace-turn-step-runtime-ports.js'),
    source('apps/game-server/src/runtime/lower-dvina-trace-turn-step-bindings.js'),
    source('AGENTS.md'),
    source('data/knowledge-source/corpus/DOCUMENTS/semantic_world_actions_materialization_and_processes_contract.md')
  ]);

  assert.match(bindings, /operation: 'request_discovery'/u);
  assert.match(actorStep, /'request_discovery'/u);
  for (const productionSource of [actorStep, runtimePorts, bindings]) {
    assert.doesNotMatch(productionSource, /@rus\/materialization\/eval|ordinary[_ -]semantic|ordinary.*(?:model|ledger)|party_ordinary_materialization_aggregates/iu);
  }
  assert.match(runtimePorts, /request_container_access:/u);
  assert.doesNotMatch(runtimePorts, /request_discovery:/u);
  assert.doesNotMatch(agents, /\bO1\b[^\n]*\bactive\b/iu);
  assert.match(contract, /\*\*Статус:\*\*\s*`proposed umbrella target`/u);
});
