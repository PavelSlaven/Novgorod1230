import test from 'node:test';
import assert from 'node:assert/strict';

import { computeSpatialV3CanonicalDigest } from '@rus/contracts/spatial-v3/registry';
import {
  SPATIAL_V3_COMMAND_KINDS,
  SPATIAL_V3_TURN_STAGE_IDS,
  createSpatialV3CommandRegistry,
  createSpatialV3TurnOrchestrator
} from '../src/spatial-v3-orchestration.js';

const seal = (value) => ({ ...structuredClone(value), canonical_digest: computeSpatialV3CanonicalDigest(value) });
const dependencyPins = (() => {
  const pins = [{
    dependency_role: 'source_authoring',
    entity_ref: { entity_kind: 'world_revision', entity_id: 'temporal-v4' },
    version_pin: { pin_kind: 'authoring_version', authoring_version: '4.3.0-target.1', state_version: null }
  }];
  return { pins, canonical_digest: computeSpatialV3CanonicalDigest(pins).replace('sha256:', '') };
})();
const command = seal({
  party_id: 'party-1',
  command_id: 'command-1',
  command_kind: 'immediate_action',
  idempotency_key: 'idem-1'
});
const snapshot = seal({
  party_id: 'party-1',
  kind: 'turn_factual_snapshot',
  state_version: 1,
  dependency_pins: dependencyPins
});
const proposal = seal({
  party_id: 'party-1',
  kind: 'immediate_action_proposal',
  command_id: 'command-1',
  idempotency_key: 'idem-1',
  dependency_pins: dependencyPins
});
const validationReport = seal({
  party_id: 'party-1',
  kind: 'turn_validation_report',
  command_id: 'command-1',
  proposal_digest: proposal.canonical_digest,
  dependency_pins: dependencyPins
});
const temporalResult = seal({
  party_id: 'party-1',
  kind: 'temporal_advance_not_required',
  command_id: 'command-1',
  dependency_pins: dependencyPins
});
const combinedChangeSet = seal({
  party_id: 'party-1',
  kind: 'combined_change_set_candidate',
  id: 'change-1',
  proposal_digest: proposal.canonical_digest,
  dependency_pins: dependencyPins
});
const visiblePayload = {
  schema: 'temporal_visible_package.v1',
  perceived_scene: 'Телега стоит у ворот.',
  perceived_changes: ['На оглобле видна свежая полоса грязи.'],
  sensory_details: [],
  visible_npcs: [],
  visible_objects: [{
    entity_ref: { entity_kind: 'item', entity_id: 'cart-1' },
    display_label: 'телега',
    recognition: 'known',
    visible_status: 'осмотрена'
  }],
  known_context: [],
  uncertainties: [],
  hypotheses: [],
  player_safe_interruption: null,
  allowed_action_affordances: [{
    action_id: 'inspect-wheels',
    label: 'Осмотреть колёса.',
    command_kind: 'immediate_action'
  }]
};
const visibleEnvelope = {
  package_id: 'visible-1',
  party_id: 'party-1',
  turn_id: 'request-1',
  committed_state_version: '2',
  change_set_id: 'change-1',
  package_digest: computeSpatialV3CanonicalDigest(visiblePayload),
  visible_payload: visiblePayload,
  presentation_status: 'pending',
  projection_policy_ref: {
    entity_ref: { entity_kind: 'visibility_modifier', entity_id: 'player-safe-v1' },
    authoring_version: '4.3.0-target.1'
  },
  dependency_pins: dependencyPins,
  idempotency_record_id: 'idem-record-1'
};
const plan = seal({
  party_id: 'party-1',
  kind: 'combined_write_plan',
  command_id: 'command-1',
  validation_report_digest: validationReport.canonical_digest,
  combined_change_set_digest: combinedChangeSet.canonical_digest,
  visible_package_envelope: visibleEnvelope,
  dependency_pins: dependencyPins
});
const committedChangeSet = seal({
  party_id: 'party-1',
  kind: 'committed_change_set',
  id: 'change-1',
  write_plan_digest: plan.canonical_digest,
  dependency_pins: dependencyPins
});
const narration = seal({
  party_id: 'party-1',
  kind: 'approved_narration',
  package_digest: visibleEnvelope.package_digest,
  text: 'На оглобле темнеет свежая полоса грязи.',
  dependency_pins: dependencyPins
});

function registry(calls) {
  const handlers = Object.fromEntries(SPATIAL_V3_COMMAND_KINDS.map((kind) => [
    kind,
    async () => {
      calls.push('resolve_mode');
      return { ok: true, proposal };
    }
  ]));
  return createSpatialV3CommandRegistry(handlers);
}

function presentationStore(calls) {
  let status = 'pending';
  let nextAttempt = 1;
  let activeAttempt = null;
  let storedNarration = null;
  let deliveredOutcome = null;
  return {
    claimPresentationAttempt: async ({ package_id, package_digest }) => {
      calls.push('presentation:claim');
      assert.equal(package_id, visibleEnvelope.package_id);
      assert.equal(package_digest, visibleEnvelope.package_digest);
      if (status === 'delivered') {
        return {
          ok: true,
          disposition: 'delivered',
          attempt_id: deliveredOutcome.attempt_id,
          output_digest: deliveredOutcome.output_digest,
          narration_result: storedNarration,
          presentation_outcome: deliveredOutcome
        };
      }
      if (status === 'output_ready') {
        return {
          ok: true,
          disposition: 'output_ready',
          attempt_id: activeAttempt.attempt_id,
          claim_token: activeAttempt.claim_token,
          output_digest: storedNarration.canonical_digest,
          narration_result: storedNarration
        };
      }
      if (status === 'in_progress') {
        return {
          ok: true,
          disposition: 'in_progress',
          attempt_id: activeAttempt.attempt_id
        };
      }
      activeAttempt = {
        attempt_id: `attempt-${nextAttempt}`,
        claim_token: `claim-${nextAttempt}`
      };
      nextAttempt += 1;
      status = 'in_progress';
      return {
        ok: true,
        disposition: 'claimed',
        ...activeAttempt
      };
    },
    persistNarrationOutput: async ({ attempt_id, claim_token, narration_result }) => {
      calls.push('presentation:output_ready');
      assert.equal(status, 'in_progress');
      assert.equal(attempt_id, activeAttempt.attempt_id);
      assert.equal(claim_token, activeAttempt.claim_token);
      storedNarration = narration_result;
      status = 'output_ready';
      return {
        ok: true,
        disposition: 'output_ready',
        attempt_id,
        claim_token,
        output_digest: narration_result.canonical_digest,
        narration_result
      };
    },
    finalizePresentationAttempt: async ({
      attempt_id,
      claim_token,
      presentation_status,
      output_digest,
      failure
    }) => {
      calls.push(`presentation:${presentation_status}`);
      assert.equal(attempt_id, activeAttempt.attempt_id);
      if (presentation_status === 'delivered') {
        assert.equal(status, 'output_ready');
        assert.equal(output_digest, storedNarration.canonical_digest);
        deliveredOutcome = {
          ok: true,
          presentation_status,
          attempt_id,
          output_digest
        };
        status = 'delivered';
        return deliveredOutcome;
      }
      assert.equal(presentation_status, 'failed_retryable');
      assert.equal(status, 'in_progress');
      assert.equal(claim_token, activeAttempt.claim_token);
      assert.equal(output_digest, null);
      assert.equal(typeof failure?.message, 'string');
      status = 'failed_retryable';
      return {
        ok: true,
        presentation_status,
        attempt_id,
        output_digest: null
      };
    }
  };
}

function ports(calls, overrides = {}) {
  const presentation = overrides.presentationStore ?? presentationStore(calls);
  const { presentationStore: ignoredPresentationStore, ...portOverrides } = overrides;
  return {
    registry: registry(calls),
    loadSnapshots: async () => {
      calls.push('load_context');
      return { ok: true, snapshot };
    },
    validateProposal: async () => {
      calls.push('availability_checks');
      return { ok: true, report: validationReport };
    },
    advanceTemporal: async () => {
      calls.push('temporal_advance');
      return { ok: true, result: temporalResult };
    },
    buildCombinedChangeSet: async () => {
      calls.push('combined_change_set');
      return { ok: true, change_set: combinedChangeSet };
    },
    deriveVisiblePackage: async () => {
      calls.push('visible_package');
      return { ok: true, envelope: visibleEnvelope };
    },
    buildWritePlan: async (input) => {
      calls.push('persistence_plan');
      assert.deepEqual(input.visible_package_envelope, visibleEnvelope);
      assert.equal('narration' in input, false);
      return { ok: true, plan };
    },
    commit: async () => {
      calls.push('commit');
      return {
        ok: true,
        change_set: committedChangeSet,
        visible_package_envelope: visibleEnvelope
      };
    },
    loadCommittedVisiblePackage: async ({ package_id, package_digest }) => {
      calls.push('read_committed_package');
      assert.equal(package_id, visibleEnvelope.package_id);
      assert.equal(package_digest, visibleEnvelope.package_digest);
      return { ok: true, envelope: visibleEnvelope };
    },
    narrate: async ({ visible_package }) => {
      calls.push('narration');
      assert.deepEqual(visible_package, visibleEnvelope);
      return { ok: true, result: narration };
    },
    ...presentation,
    projectScreen: async ({ visible_package, narration_result, outer_status }) => {
      calls.push('screen_projection');
      assert.deepEqual(visible_package, visibleEnvelope);
      return { ok: true, screen: { visible_payload: visible_package.visible_payload, narration: narration_result?.text ?? null, outer_status } };
    },
    ...portOverrides
  };
}

test('WP10 target stage order is exact and narration is post-commit only', async () => {
  assert.deepEqual(SPATIAL_V3_TURN_STAGE_IDS, [
    'normalize_intent',
    'resolve_mode',
    'load_context',
    'availability',
    'checks',
    'resolve_consequence_or_execution_plan',
    'temporal_advance_if_required',
    'build_combined_change_set',
    'derive_and_validate_visible_package',
    'build_persistence_plan',
    'commit_factual_state_and_visible_package',
    'narration_from_persisted_package',
    'screen_projection'
  ]);
  const calls = [];
  const result = await createSpatialV3TurnOrchestrator(ports(calls)).run({
    party_id: 'party-1',
    request_id: 'request-1',
    command
  });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.outer_status, 'resolved');
  assert.deepEqual(result.stage_trace, SPATIAL_V3_TURN_STAGE_IDS);
  assert.deepEqual(calls, [
    'resolve_mode',
    'load_context',
    'availability_checks',
    'temporal_advance',
    'combined_change_set',
    'visible_package',
    'persistence_plan',
    'commit',
    'read_committed_package',
    'presentation:claim',
    'narration',
    'presentation:output_ready',
    'presentation:delivered',
    'screen_projection'
  ]);
});

test('WP10 narration failure preserves factual commit and retry is factual-free', async () => {
  const calls = [];
  let narrationAttempt = 0;
  const orchestrator = createSpatialV3TurnOrchestrator(ports(calls, {
    narrate: async () => {
      calls.push('narration');
      narrationAttempt += 1;
      if (narrationAttempt === 1) throw new Error('narrator unavailable');
      return { ok: true, result: narration };
    }
  }));
  const first = await orchestrator.run({ party_id: 'party-1', request_id: 'request-1', command });
  assert.equal(first.ok, true);
  assert.equal(first.outer_status, 'committed_presentation_pending');
  assert.equal(first.change_set.id, 'change-1');
  assert.equal(first.visible_package.package_id, 'visible-1');
  assert.equal(calls.filter((entry) => entry === 'commit').length, 1);
  assert.equal(calls.includes('presentation:failed_retryable'), true);

  const factualCallsBeforeRetry = calls.filter((entry) => [
    'resolve_mode',
    'load_context',
    'availability_checks',
    'temporal_advance',
    'combined_change_set',
    'visible_package',
    'persistence_plan',
    'commit'
  ].includes(entry)).length;
  const retried = await orchestrator.retryPresentation({
    party_id: 'party-1',
    package_id: visibleEnvelope.package_id,
    package_digest: visibleEnvelope.package_digest
  });
  assert.equal(retried.ok, true);
  assert.equal(retried.outer_status, 'resolved');
  assert.equal(calls.filter((entry) => entry === 'commit').length, 1);
  assert.equal(calls.filter((entry) => [
    'resolve_mode',
    'load_context',
    'availability_checks',
    'temporal_advance',
    'combined_change_set',
    'visible_package',
    'persistence_plan',
    'commit'
  ].includes(entry)).length, factualCallsBeforeRetry);
  assert.equal(calls.includes('presentation:delivered'), true);
});

test('WP10 concurrent presentation retries claim one durable attempt before narration', async () => {
  const calls = [];
  let releaseNarration;
  let narrationStarted;
  const started = new Promise((resolve) => { narrationStarted = resolve; });
  const waitForRelease = new Promise((resolve) => { releaseNarration = resolve; });
  let narrationCalls = 0;
  const orchestrator = createSpatialV3TurnOrchestrator(ports(calls, {
    narrate: async () => {
      calls.push('narration');
      narrationCalls += 1;
      narrationStarted();
      await waitForRelease;
      return { ok: true, result: narration };
    }
  }));
  const first = orchestrator.retryPresentation({
    party_id: 'party-1',
    package_id: visibleEnvelope.package_id,
    package_digest: visibleEnvelope.package_digest
  });
  await started;
  const concurrent = await orchestrator.retryPresentation({
    party_id: 'party-1',
    package_id: visibleEnvelope.package_id,
    package_digest: visibleEnvelope.package_digest
  });
  assert.equal(concurrent.ok, true);
  assert.equal(concurrent.outer_status, 'committed_presentation_pending');
  assert.equal(narrationCalls, 1);
  releaseNarration();
  assert.equal((await first).outer_status, 'resolved');
  assert.equal(narrationCalls, 1);
});

test('WP10 retry reuses persisted output_ready narration when final delivery recording failed', async () => {
  const calls = [];
  const store = presentationStore(calls);
  let finalizeCalls = 0;
  let narrationCalls = 0;
  const orchestrator = createSpatialV3TurnOrchestrator(ports(calls, {
    presentationStore: {
      ...store,
      finalizePresentationAttempt: async (input) => {
        finalizeCalls += 1;
        if (finalizeCalls === 1) throw new Error('delivery status unavailable');
        return store.finalizePresentationAttempt(input);
      }
    },
    narrate: async () => {
      calls.push('narration');
      narrationCalls += 1;
      return { ok: true, result: narration };
    }
  }));
  const first = await orchestrator.retryPresentation({
    party_id: 'party-1',
    package_id: visibleEnvelope.package_id,
    package_digest: visibleEnvelope.package_digest
  });
  assert.equal(first.outer_status, 'committed_presentation_pending');
  assert.equal(narrationCalls, 1);

  const retried = await orchestrator.retryPresentation({
    party_id: 'party-1',
    package_id: visibleEnvelope.package_id,
    package_digest: visibleEnvelope.package_digest
  });
  assert.equal(retried.outer_status, 'resolved');
  assert.equal(narrationCalls, 1);
  assert.equal(calls.filter((entry) => entry === 'presentation:output_ready').length, 1);
});

test('WP10 never exposes narration that failed durable output persistence', async () => {
  const calls = [];
  let attemptOrdinal = 0;
  let persistenceAttempts = 0;
  let narrationCalls = 0;
  const presentation = {
    claimPresentationAttempt: async () => {
      attemptOrdinal += 1;
      return {
        ok: true,
        disposition: 'claimed',
        attempt_id: `attempt-${attemptOrdinal}`,
        claim_token: `claim-${attemptOrdinal}`
      };
    },
    persistNarrationOutput: async ({ attempt_id, claim_token, narration_result }) => {
      persistenceAttempts += 1;
      if (persistenceAttempts === 1) throw new Error('output store unavailable');
      return {
        ok: true,
        disposition: 'output_ready',
        attempt_id,
        claim_token,
        output_digest: narration_result.canonical_digest,
        narration_result
      };
    },
    finalizePresentationAttempt: async ({ attempt_id, output_digest }) => ({
      ok: true,
      presentation_status: 'delivered',
      attempt_id,
      output_digest
    })
  };
  const orchestrator = createSpatialV3TurnOrchestrator(ports(calls, {
    presentationStore: presentation,
    narrate: async () => {
      narrationCalls += 1;
      return { ok: true, result: narration };
    }
  }));
  const first = await orchestrator.retryPresentation({
    party_id: 'party-1',
    package_id: visibleEnvelope.package_id,
    package_digest: visibleEnvelope.package_digest
  });
  assert.equal(first.outer_status, 'committed_presentation_pending');
  assert.equal(first.narration, null);
  assert.equal(first.screen.narration, null);

  const retried = await orchestrator.retryPresentation({
    party_id: 'party-1',
    package_id: visibleEnvelope.package_id,
    package_digest: visibleEnvelope.package_digest
  });
  assert.equal(retried.outer_status, 'resolved');
  assert.equal(retried.screen.narration, narration.text);
  assert.equal(narrationCalls, 2);
});

test('WP10 invalid persisted envelope cannot leak hidden fields through fallback projection', async () => {
  const calls = [];
  const hostileEnvelope = {
    ...visibleEnvelope,
    visible_payload: { hidden_motive: 'secret' }
  };
  const orchestrator = createSpatialV3TurnOrchestrator(ports(calls, {
    loadCommittedVisiblePackage: async () => {
      calls.push('read_committed_package');
      return { ok: true, envelope: hostileEnvelope };
    },
    projectScreen: async () => {
      calls.push('screen_projection');
      throw new Error('projection unavailable');
    }
  }));

  const result = await orchestrator.retryPresentation({
    party_id: 'party-1',
    package_id: visibleEnvelope.package_id,
    package_digest: visibleEnvelope.package_digest
  });

  assert.equal(result.ok, true);
  assert.equal(result.outer_status, 'committed_presentation_pending');
  assert.deepEqual(result.visible_package.visible_payload, {});
  assert.deepEqual(result.screen.visible_payload, {});
  assert.doesNotMatch(JSON.stringify(result), /hidden_motive|secret/u);
  assert.equal(calls.includes('presentation:claim'), false);
  assert.equal(calls.includes('narration'), false);
});

test('WP10 rejects hidden visible payload before write-plan construction and commit', async () => {
  const calls = [];
  const hiddenEnvelope = {
    ...visibleEnvelope,
    visible_payload: { hidden_state: { future_event: 'secret' } },
    package_digest: computeSpatialV3CanonicalDigest({ hidden_state: { future_event: 'secret' } })
  };
  const result = await createSpatialV3TurnOrchestrator(ports(calls, {
    deriveVisiblePackage: async () => {
      calls.push('visible_package');
      return { ok: true, envelope: hiddenEnvelope };
    }
  })).run({ party_id: 'party-1', request_id: 'request-1', command });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'hidden_information_leak');
  assert.equal(calls.includes('persistence_plan'), false);
  assert.equal(calls.includes('commit'), false);
  assert.equal(calls.includes('narration'), false);
});

test('WP10 rejects neutral-named fields outside the player-safe payload allowlist', async () => {
  const calls = [];
  const unsafePayload = {
    ...visiblePayload,
    visible_npcs: [{
      entity_ref: { entity_kind: 'npc', entity_id: 'npc-1' },
      display_label: 'Возница',
      recognition: 'recognized',
      faction_disposition: 'hostile'
    }]
  };
  const unsafeEnvelope = {
    ...visibleEnvelope,
    visible_payload: unsafePayload,
    package_digest: computeSpatialV3CanonicalDigest(unsafePayload)
  };
  const result = await createSpatialV3TurnOrchestrator(ports(calls, {
    deriveVisiblePackage: async () => {
      calls.push('visible_package');
      return { ok: true, envelope: unsafeEnvelope };
    }
  })).run({ party_id: 'party-1', request_id: 'request-1', command });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'hidden_information_leak');
  assert.equal(calls.includes('persistence_plan'), false);
  assert.equal(calls.includes('commit'), false);
});
