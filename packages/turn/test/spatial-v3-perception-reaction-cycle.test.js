import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  buildNpcReactionPolicySnapshotFromAuthoringRow,
} from '@rus/npc-runtime';
import {
  computeSpatialV3CanonicalDigest,
  validateSpatialV3Contract
} from '@rus/contracts/spatial-v3/registry';
import {
  resolveSpatialV3PerceptionReactionBoundary,
  resolveSpatialV3PerceptionReactionCycle
} from '../src/spatial-v3-perception-reaction-cycle.js';
import {
  buildSpatialV3PerceptionReactionWriteSet,
  buildSpatialV3ReactionDecisionCompletionWriteSet
} from '../src/spatial-v3-perception-reaction-write-set.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const vr = (entity_kind, entity_id, authoring_version = '1') => ({
  entity_ref: ref(entity_kind, entity_id),
  authoring_version
});
const digest = (value) => computeSpatialV3CanonicalDigest(value);
const seal = (value) => ({ ...value, canonical_digest: digest(value) });
const pin = (dependency_role, reference) => ({
  dependency_role,
  entity_ref: reference.entity_ref,
  version_pin: {
    pin_kind: 'authoring_version',
    authoring_version: reference.authoring_version
  }
});
const pinSet = (...pins) => seal({ pins });
const at = (whole_minutes) => ({
  whole_minutes,
  subminute_numerator: '0',
  subminute_denominator: '1'
});

const npcRef = ref('npc', 'npc-cycle-1');
const sourceScope = ref('canonical_spatial_node', 'market');
const targetScope = ref('canonical_spatial_node', 'gatehouse');
const recognitionPolicy = vr('action_contract', 'recognition-standard');
const visibilityPolicy = vr('action_contract', 'perception-visible');
const provenance = vr('source_record', 'perception-policy-source');
const dependencyPins = pinSet(
  pin('condition', visibilityPolicy),
  pin('profile', recognitionPolicy),
  pin('source_dependency', provenance)
);

function perceptionRequest(overrides = {}) {
  const expected = seal({
    entries: [{ entity_ref: npcRef, state_version: 4 }]
  });
  const payload = {
    perception_id: 'perception-cycle-1',
    perceiver_ref: npcRef,
    event_ref: ref('action_contract', 'event-cycle-1'),
    perceived_at: at('10'),
    target_scope_ref: targetScope,
    factual_signal: seal({
      signal_ref: ref('sound_event', 'signal-cycle-1'),
      channel: 'visual',
      source_scope_ref: sourceScope,
      source_ref: ref('actor', 'actor-cycle-1'),
      emission_strength: 3,
      signal_state_version: 4,
      player_visibility_class: 'visible_if_perceived'
    }),
    propagation_snapshot: seal({
      source_scope_ref: sourceScope,
      target_scope_ref: targetScope,
      edges: [seal({
        edge_ref: ref('visibility_link', 'market-gate'),
        from_ref: sourceScope,
        to_ref: targetScope,
        permitted_channels: ['visual'],
        relation_kind: 'visibility_link',
        relation_state_version: 3,
        visibility_quality: 'clear',
        distance_band: 'short'
      })]
    }),
    environment_snapshot: seal({
      light_state_id: 'bright',
      environment_state_ref: ref('environment_overlay_state', 'environment-1'),
      environment_state_version: 5,
      weather_state_ref: ref('weather_state', 'weather-1'),
      weather_state_version: 6,
      weather_visibility_result: 'clear',
      weather_acoustic_loss: '0',
      target_acoustic_profile_ref:
        ref('g6_acoustic_profile', 'acoustic-gatehouse'),
      target_acoustic_profile_state_version: 2,
      target_ambient_noise: '0',
      transient_visibility_result: 'clear',
      transient_acoustic_loss: '0',
      transient_modifier_dependency_pins: dependencyPins,
      visibility_modifiers: []
    }),
    attention_snapshot: seal({
      attention_state_ref: ref('condition_set', 'npc-attention'),
      status: 'awake',
      attended_channels: ['visual', 'acoustic'],
      observer_position_ref: {
        endpoint_kind: 'scene_position',
        endpoint_id: 'npc-position'
      },
      observer_position_state_version: 8,
      observer_azimuth_mdeg: 0,
      observer_vertical_direction: 'level',
      visual_capability_level: 3,
      acoustic_capability_level: 3,
      orientation_digest: digest({ azimuth: 0, vertical: 'level' })
    }),
    recognition_snapshot: seal({
      recognition_state_ref: ref('condition_set', 'recognition-current'),
      outcome: 'recognized'
    }),
    perception_profile: seal({
      recognition_policy_ref: recognitionPolicy,
      visibility_policy_ref: visibilityPolicy,
      acoustic_policy_ref: null,
      provenance_ref: provenance,
      status: 'approved',
      darkness_visual_result_cap: 'perceived_partial',
      sleeping_attention_channels: ['acoustic']
    }),
    expected_state_versions: expected,
    idempotency_key: 'perception-cycle-1',
    known_fact_refs: [],
    candidate_knowledge_fact_refs: [
      ref('knowledge_fact', 'event-cycle-1-observed')
    ],
    dependency_pins: dependencyPins,
    ...overrides
  };
  return {
    ...payload,
    canonical_input_digest: digest(payload)
  };
}

async function policySnapshot() {
  const records = JSON.parse(await readFile(
    'data/world-catalogs/novgorod/temporal-v4/datasets/npc_temporal_profiles_policies.json',
    'utf8'
  ));
  const source = records.find(
    ({ record_kind }) => record_kind === 'npc_reaction_policy'
  );
  const row = {
    record_id: source.record_id,
    family_id: source.family_id,
    record_kind: source.record_kind,
    record_version: source.version,
    applicability: source.applicability,
    status: source.status,
    provenance_refs: source.provenance_refs,
    normalized_reference_ids: source.normalized_reference_ids,
    source_history_refs: source.source_history_refs,
    payload: source.payload
  };
  row.canonical_digest = digest(row).replace('sha256:', '');
  const projected = buildNpcReactionPolicySnapshotFromAuthoringRow(row);
  assert.equal(projected.ok, true, JSON.stringify(projected));
  return projected.value;
}

function contextFactory({
  investigate = true,
  seekSafety = false,
  report = false
} = {}) {
  return ({ perception_result, dependency_pins }) => {
    const payload = {
      source_perception: perception_result,
      npc_ref: npcRef,
      reaction_scope_ref: targetScope,
      npc_state_version: '4',
      can_investigate_signal: investigate,
      can_seek_safety: seekSafety,
      can_report_to_authority: report,
      threat_level: seekSafety ? 'direct' : 'none',
      expected_state_versions: seal({
        entries: [{ entity_ref: npcRef, state_version: 4 }]
      }),
      dependency_pins,
      ...(seekSafety ? {
        safe_anchor_ref: {
          endpoint_kind: 'route_anchor_scene',
          endpoint_id: 'safe-gate'
        }
      } : {}),
      ...(report ? {
        authority_recipient_ref: ref('npc', 'authority-1')
      } : {})
    };
    return seal(payload);
  };
}

test('single approved option completes perception, knowledge merge and code-owned reaction without LLM', async () => {
  const request = perceptionRequest();
  const policy = await policySnapshot();
  let decisionCalls = 0;
  const result = await resolveSpatialV3PerceptionReactionCycle({
    perception_request: request,
    reaction_policy_snapshot: policy,
    knowledge_state_before: {
      fact_refs: [],
      hypothesis_refs: [],
      state_version: 4
    },
    build_reaction_context: contextFactory(),
    select_bounded_option: async () => {
      decisionCalls += 1;
      throw new Error('single option must not call a decision service');
    }
  });

  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.status, 'completed');
  assert.equal(result.decision_mode, 'code_owned_without_llm');
  assert.equal(decisionCalls, 0);
  assert.equal(result.reaction_proposal.option_id, 'investigate_signal');
  assert.deepEqual(
    validateSpatialV3Contract(
      'knowledge_memory_merge_result',
      result.knowledge_merge_result
    ),
    []
  );
  assert.deepEqual(
    validateSpatialV3Contract(
      'npc_reaction_consequence_proposal',
      result.reaction_proposal
    ),
    []
  );
  const synchronousBoundary = resolveSpatialV3PerceptionReactionBoundary({
    perception_request: request,
    reaction_policy_snapshot: policy,
    knowledge_state_before: {
      fact_refs: [],
      hypothesis_refs: [],
      state_version: 4
    },
    reaction_context_snapshot: result.reaction_context_snapshot
  });
  assert.equal(synchronousBoundary.ok, true, JSON.stringify(synchronousBoundary));
  assert.equal(synchronousBoundary.status, 'completed');
  assert.equal(
    synchronousBoundary.reaction_proposal.canonical_digest,
    result.reaction_proposal.canonical_digest
  );
  const mapped = buildSpatialV3PerceptionReactionWriteSet({
    party_id: 'party-cycle',
    change_set_id: 'change-cycle',
    idempotency_record_id: 'idem-cycle',
    perception_result: result.perception_result,
    perception_replay_evidence: result.perception_replay_evidence,
    knowledge_merge_result: result.knowledge_merge_result,
    reaction_option_proposal: result.reaction_option_proposal,
    reaction_proposal: result.reaction_proposal
  });
  assert.equal(mapped.ok, true, JSON.stringify(mapped));
  assert.equal(
    mapped.write_set.appends.some(
      ({ target_table }) =>
        target_table === 'party_npc_reaction_option_proposals'
    ),
    true
  );
});

test('multiple approved options persist a pending request and resume only from a closed selection', async () => {
  const input = {
    perception_request: perceptionRequest(),
    reaction_policy_snapshot: await policySnapshot(),
    knowledge_state_before: {
      fact_refs: [],
      hypothesis_refs: [],
      state_version: 4
    },
    build_reaction_context: contextFactory({
      investigate: true,
      seekSafety: true,
      report: true
    })
  };
  const pending = await resolveSpatialV3PerceptionReactionCycle(input);
  assert.equal(pending.ok, true, JSON.stringify(pending));
  assert.equal(pending.status, 'awaiting_bounded_decision');
  assert.equal(pending.decision_request.options.length, 3);
  assert.equal(pending.reaction_proposal, null);
  const pendingWrites = buildSpatialV3PerceptionReactionWriteSet({
    party_id: 'party-cycle',
    change_set_id: 'change-cycle-pending',
    idempotency_record_id: 'idem-cycle-pending',
    perception_result: pending.perception_result,
    perception_replay_evidence: pending.perception_replay_evidence,
    knowledge_merge_result: pending.knowledge_merge_result,
    reaction_option_proposal: pending.reaction_option_proposal
  });
  assert.equal(pendingWrites.ok, true, JSON.stringify(pendingWrites));
  assert.equal(
    pendingWrites.write_set.appends.some(
      ({ target_table }) =>
        target_table === 'party_npc_reaction_option_proposals'
    ),
    true
  );

  const selected = pending.decision_request.options.find(
    ({ option_id }) => option_id === 'report_to_authority'
  );
  let calls = 0;
  const completed = await resolveSpatialV3PerceptionReactionCycle({
    ...input,
    persisted_perception: pending.perception_result,
    persisted_perception_replay_evidence:
      pending.perception_replay_evidence,
    persisted_reaction_option_proposal:
      pending.reaction_option_proposal,
    select_bounded_option: async (request) => {
      calls += 1;
      assert.equal(request.request_id, pending.decision_request.request_id);
      return {
        request_id: request.request_id,
        state_version: request.state_version,
        option_id: selected.option_id,
        command_token: selected.command_token
      };
    }
  });
  assert.equal(completed.ok, true, JSON.stringify(completed));
  assert.equal(completed.status, 'completed');
  assert.equal(completed.reaction_proposal.option_id, 'report_to_authority');
  assert.equal(calls, 1);
  const completionWrites = buildSpatialV3ReactionDecisionCompletionWriteSet({
    party_id: 'party-cycle',
    change_set_id: 'change-cycle-completed',
    persisted_perception_result: pending.perception_result,
    persisted_reaction_option_proposal:
      pending.reaction_option_proposal,
    reaction_proposal: completed.reaction_proposal
  });
  assert.equal(completionWrites.ok, true, JSON.stringify(completionWrites));
  assert.deepEqual(
    completionWrites.write_set.appends.map(({ target_table }) => target_table),
    [
      'party_npc_decision_traces',
      'party_npc_reaction_consequences'
    ]
  );
  assert.deepEqual(completionWrites.write_set.inserts, []);
  assert.deepEqual(completionWrites.write_set.updates, []);

  const rejected = await resolveSpatialV3PerceptionReactionCycle({
    ...input,
    select_bounded_option: async (request) => ({
      request_id: request.request_id,
      state_version: request.state_version,
      option_id: 'forged',
      command_token: 'cmd.v1:forged'
    })
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, 'npc_decision_policy_gap');
});

test('changed light creates a new valid perception identity instead of observer/event deduplication', async () => {
  const policy = await policySnapshot();
  const bright = await resolveSpatialV3PerceptionReactionCycle({
    perception_request: perceptionRequest(),
    reaction_policy_snapshot: policy,
    knowledge_state_before: {
      fact_refs: [],
      hypothesis_refs: [],
      state_version: 4
    },
    build_reaction_context: contextFactory()
  });
  const darkEnvironment = {
    ...perceptionRequest().environment_snapshot,
    light_state_id: 'dark'
  };
  delete darkEnvironment.canonical_digest;
  const dark = await resolveSpatialV3PerceptionReactionCycle({
    perception_request: perceptionRequest({
      perception_id: 'perception-cycle-2',
      idempotency_key: 'perception-cycle-2',
      environment_snapshot: seal(darkEnvironment)
    }),
    reaction_policy_snapshot: policy,
    knowledge_state_before: {
      fact_refs: [],
      hypothesis_refs: [],
      state_version: 4
    },
    build_reaction_context: contextFactory()
  });

  assert.equal(bright.ok, true, JSON.stringify(bright));
  assert.equal(dark.ok, true, JSON.stringify(dark));
  assert.equal(bright.perception_result.event_ref.entity_id,
    dark.perception_result.event_ref.entity_id);
  assert.notEqual(bright.perception_result.canonical_digest,
    dark.perception_result.canonical_digest);
  assert.equal(dark.perception_result.result, 'perceived_partial');
});
