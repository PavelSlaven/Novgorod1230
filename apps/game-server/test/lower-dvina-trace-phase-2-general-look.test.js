import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fixture,
  loadScenarioBundle
} from './lower-dvina-trace-phase-2-fixture.js';
import { createLowerDvinaTraceTurnStepTestModel } from
  './lower-dvina-trace-turn-step-model-fixture.js';

const bundle13 = await loadScenarioBundle(13);

test('revision 13 general look stays a generic player-safe turn',
  async (t) => {
    for (const [index, rawText] of [
      'Осмотреться',
      'Осматриваюсь вокруг.'
    ].entries()) {
      await t.test(rawText, async () => {
        const f = fixture({
          scenarioBundle: bundle13,
          materializationBundle: bundle13,
          turnStepModel: createLowerDvinaTraceTurnStepTestModel()
        });
        const before = structuredClone(f.state);
        const result = await f.runtime.submitTurn({
          partyId: f.partyId,
          input: {
            request_id: `turn-step-general-look-${index}`,
            idempotency_key: `turn-step-general-look-${index}`,
            raw_text: rawText
          }
        });
        const envelope = f.lastWritePlan().turn_step_commit;

        assert.equal(f.turnStepCount(), 1);
        assert.equal(f.rollCount(), 0);
        assert.equal(f.lastWritePlan().write_targets.some(
          ({ target }) => target === 'party_state'), false);
        assert.equal(envelope.consequence.duration_minutes, 1);
        assert.notEqual(envelope.consequence.duration_minutes, 15);
        assert.deepEqual(envelope.checks.requests, []);
        assert.deepEqual(envelope.checks.results, []);
        assert.equal(envelope.body_update.applied, false);
        assert.equal(
          BigInt(f.state.clock.whole_minutes)
            - BigInt(before.clock.whole_minutes),
          1n
        );
        assert.deepEqual(f.state.body_state, before.body_state);
        assert.deepEqual(f.state.knowledge, before.knowledge);
        assert.deepEqual(
          f.state.items.map(({ template_id: id }) => id).sort(),
          before.items.map(({ template_id: id }) => id).sort()
        );
        assert.equal(result.check, undefined);
        const narratorInput = f.narratorInput();
        assert.match(narratorInput.visible_context.visible_scene, /\S/);
        assert.notEqual(
          narratorInput.visible_context.visible_scene,
          'Заявленное действие завершено.'
        );
        assert.deepEqual(
          [...narratorInput.visible_context.sensory_details].sort(),
          [...before.environment_snapshot.facts].sort()
        );
        const playerSafe = JSON.stringify({ result,
          narrator: narratorInput });
        assert.equal(playerSafe.includes('visible:road_bag_missing'), false);
        assert.equal(playerSafe.includes(
          'trace_ld_v1_item_blue_wool_fragment'), false);
      });
    }
  });
