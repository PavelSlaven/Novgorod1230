import assert from 'node:assert/strict';
import test from 'node:test';
import {
  bundle, COMPOUND_TURN_10, fixture, npcPlan, playerPlan, ref, turn10State,
  turn10StepPlan
} from './lower-dvina-trace-turn-10-conversation-fixture.js';
import {
  createTemporalAdvanceOwner,
  npcTemporalEffectRegistrations
} from '@rus/turn/temporal-advance';
import { lowerDvinaTracePhase7TemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-phase-7-temporal-effect-owner.js';
import { lowerDvinaTraceConversationTemporalEffectRegistrations } from
  '../src/runtime/lower-dvina-trace-m2-conversation-temporal-effect-owner.js';
import { phase7AutonomousPlan } from
  './lower-dvina-trace-phase-7-contract-fixture.js';

test('a stale Phase 7 response restarts the whole root turn on current state',
  async () => {
    const { state } = turn10State({ completedRest: false });
    const initialVersion = state.party_state.state_version;
    const requestedVersions = [];
    let runtimeFixture;
    runtimeFixture = fixture({
      scenarioBundle: bundle,
      materializationBundle: bundle,
      committedState: state,
      temporalAdvanceOwner: createTemporalAdvanceOwner({
        effect_registrations: [
          ...npcTemporalEffectRegistrations(),
          ...lowerDvinaTracePhase7TemporalEffectRegistrations()
        ]
      }),
      npcAutonomousModel(request) {
        requestedVersions.push(request.committed_state_version);
        if (requestedVersions.length === 1) {
          runtimeFixture.state.party_state.state_version += 1;
        }
        return phase7AutonomousPlan(request, 'wait');
      }
    });

    await runtimeFixture.runtime.submitTurn({
      partyId: runtimeFixture.partyId,
      input: {
        request_id: 'phase7-stale-root-retry',
        idempotency_key: 'phase7-stale-root-retry',
        raw_text: 'Отдохнуть у огня полчаса и подсушить одежду.'
      }
    });

    assert.deepEqual(requestedVersions, [initialVersion, initialVersion + 1]);
    assert.equal(runtimeFixture.commitCount(), 1);
    const factual = runtimeFixture.lastWritePlan().write_targets.find(
      ({ target }) => target === 'party_state').value;
    assert.equal(factual.mode_resolution.decision_trace.state_version,
      initialVersion + 1);
    assert.equal(factual.consequence.phase7.autonomous.request
      .committed_state_version, initialVersion + 1);
    assert.equal(factual.consequence.duration_minutes, 30);
  });
