import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { computeSpatialV3CanonicalDigest } from
  '@rus/contracts/spatial-v3/registry';
import { createLowerDvinaTracePostAppliedActorStepOwner } from
  '../src/runtime/lower-dvina-trace-post-applied-actor-step.js';
import { perceptionContext } from
  '../src/runtime/lower-dvina-trace-post-action-perception-context.js';
import { validPostActionPerceptionProfile } from
  '../src/internal/post-action-perception-profile.js';
import { legacyPostActionPerceptionAdapter } from
  '../src/internal/lower-dvina-trace-post-action-perception-legacy.js';

const at = { whole_minutes: '10', subminute_numerator: '0',
  subminute_denominator: '1' };
const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
async function perceptionPolicy() {
  return JSON.parse(await readFile(
    'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m22-content/post-action-perception-profile.json',
    'utf8'
  ));
}
async function generalPerceptionPolicy() {
  const profile = JSON.parse(await readFile(
    'data/world-catalogs/novgorod/live-world-runtime-v17/post-action-perception-profile.json',
    'utf8'
  ));
  return { ...profile, status: 'approved', approval: {
    approved_by: 'test-reviewer', approved_on: '2026-10-01',
    approved_path: 'test/d66-perception', approved_commit: 'test-commit'
  } };
}

async function state(runtimeStatus = 'available') {
  return {
    party_id: 'party-1',
    party_state: { state_version: 3, turn_number: 3 },
    environment_snapshot: {
      environment_profile_id: 'environment-1'
    },
    npcs: [{ instance_id: 'npc-1', anchor_id: 'anchor-1',
      check_body_state: { health: 10 },
      machine_state: { runtime_status: runtimeStatus } }],
    npc_schedule_runtime: [{ npc_id: 'npc-1', status: 'active',
      state_version: 2, current_position_node_id: 'position:anchor-1',
      attention_state_ref: ref('condition_set', 'attention-1'),
      knowledge_state_ref: ref('knowledge_fact', 'knowledge-1') }],
    post_action_perception_sources: [{ npc_id: 'npc-1',
      current_position_node_id: 'position:anchor-1', schedule_state_version: 2,
      attention_state_ref: ref('condition_set', 'attention-1'),
      knowledge_state_ref: ref('knowledge_fact', 'knowledge-1'),
      g6_instance_id: 'g6-1', position_state_version: 2,
      ambient_noise: 0, acoustic_uniformity: 'uniform',
      acoustic_state_version: 1 }],
    post_action_knowledge_states: [{ npc_id: 'npc-1', exists: false,
      state_version: null, fact_refs: [], hypothesis_refs: [] }]
  };
}

function event(channel = 'acoustic', eventId = 'event-1', position = 'position:anchor-1') {
  return {
    version: 1, schema: 'turn_step_factual_event_v1',
    event_ref: ref(channel === 'acoustic' ? 'sound_event' : 'action_contract',
      eventId),
    source_activity_ref: ref('semantic_activity', 'activity-1'),
    occurred_at: at,
    source_ref: ref('player_character', 'player-1'),
    source_scope_ref: ref('canonical_spatial_node', position),
    rule_ref: { entity_kind: 'activity_profile', entity_id: 'activity-rule',
      authoring_version: '1' },
    policy_ref: { entity_kind: 'turn_step_owner_profile_set',
      entity_id: 'turn-profile', authoring_version: '1' },
    profile_pin: { artifact_id: 'turn-profile', revision: 1,
      digest: 'a'.repeat(64) },
    perceptible_signal: { channel, emission_strength: 3,
      duration_class: 'brief' }
  };
}

test('co-located loud speech persists perception, first knowledge and exact summary', async () => {
  const owner = createLowerDvinaTracePostAppliedActorStepOwner({
    committedState: await state(), idempotencyKey: 'idem-1',
    perceptionProfile: await generalPerceptionPolicy(),
    environmentPort: () => environmentSnapshot()
  });
  const result = await owner({
    working_projection: {}, factual_events: [event()],
    actor_step_plan: { direct_result_kind: 'player_utterance', utterance: {
      speaker_ref: 'player-1', utterance_text: 'Эй, отзовитесь!',
      input_mode: 'verbatim'
    } }
  });
  const writes = result.temporal_results[0].combined_change_set.proposals
    .flatMap(({ write_set }) => [
      ...(write_set.appends ?? []), ...(write_set.inserts ?? []),
      ...(write_set.updates ?? [])
    ]);

  assert.equal(writes.some(({ target_table }) =>
    target_table === 'party_perception_records'), true);
  assert.equal(writes.some(({ target_table }) =>
    target_table === 'party_npc_knowledge_merge_states'), true);
  assert.equal(result.working_projection.npc_decision_signal_descriptors[0]
    .perceived_change_summary, 'Игрок произнёс: Эй, отзовитесь!');
  assert.deepEqual(result.consequence_fragment.visible_seed
    .turn_step_post_applied_perception_window, {
      kind: 'post_applied_perception_window', status: 'pending_npc_decision',
      observable_response_event_refs: [],
      moments: [{ occurred_at: at,
        event_refs: [ref('sound_event', 'event-1')],
        pending_npc_decision_refs: ['npc-1'] }],
      pending_npc_decision_refs: ['npc-1']
    });
});

function environmentSnapshot({ weather = 'weather-rain', light = 'dim' } = {}) {
  const transientPins = { pins: [{ dependency_role: 'source_dependency',
    entity_ref: ref('source_record', 'environment-transient-policy'),
    version_pin: { pin_kind: 'authoring_version', authoring_version: '1' } }] };
  transientPins.canonical_digest = computeSpatialV3CanonicalDigest(transientPins);
  return {
    light_state_id: light,
    environment_state_ref: ref('environment_overlay_state', 'environment-1'),
    environment_state_version: 4,
    weather_state_ref: ref('weather_state', weather),
    weather_state_version: 2,
    weather_visibility_result: 'partial',
    weather_acoustic_loss: 0,
    transient_visibility_result: 'clear',
    transient_acoustic_loss: 0,
    transient_modifier_dependency_pins: transientPins,
    visibility_modifiers: []
  };
}

test('general perception uses committed environment at the event timestamp', async () => {
  const committed = await state();
  let projected;
  const owner = createLowerDvinaTracePostAppliedActorStepOwner({
    committedState: committed, idempotencyKey: 'idem-environment',
    perceptionProfile: await generalPerceptionPolicy(),
    environmentPort: ({ committed_environment, event_time }) => {
      assert.deepEqual(committed_environment,
        committed.environment_snapshot);
      projected = event_time;
      return environmentSnapshot({ light: 'dim' });
    }
  });
  const result = await owner({ working_projection: {}, factual_events: [event()] });
  assert.deepEqual(result.consequence_fragment.visible_seed
    .turn_step_post_applied_perception_window.pending_npc_decision_refs,
  ['npc-1']);
  assert.equal(result.temporal_results[0].combined_change_set.proposals
    .some(({ perception_reaction_result: value }) =>
      value?.perception_result?.result === 'perceived_unidentified'), true);
  const perception = perceptionContext({ state: committed,
    npc: committed.npcs[0], source: committed.post_action_perception_sources[0],
    profile: await generalPerceptionPolicy(), eventTime: at,
    environmentPort: () => environmentSnapshot() });

  assert.deepEqual(projected, at);
  assert.deepEqual(perception.environment_snapshot.environment_state_ref,
    ref('environment_overlay_state', 'environment-1'));
  assert.equal(perception.environment_snapshot.environment_state_version, 4);
  assert.equal(perception.environment_snapshot.light_state_id, 'dim');
  assert.equal(perception.environment_snapshot.weather_state_ref.entity_id,
    'weather-rain');
  assert.equal(perception.environment_snapshot.weather_state_version, 2);
  assert.equal(perception.environment_snapshot.weather_visibility_result,
    'partial');
  assert.equal(perception.environment_snapshot.weather_acoustic_loss, 0);
});

test('general profile mechanically matches the approved M22 source', async () => {
  const source = await perceptionPolicy();
  const profile = await generalPerceptionPolicy();
  const mechanics = (value) => Object.fromEntries([
    'channels', 'listener_scope_relation', 'required_schedule_status',
    'runtime_attention', 'attention', 'recognition_outcome',
    'perception_policy'
  ].map((key) => [key, value[key]]));

  assert.deepEqual(mechanics(profile), mechanics(source));
});

test('general validator uses binding profile id and treats provenance as descriptive',
  async () => {
    const profile = await generalPerceptionPolicy();
    profile.profile_id = 'another-neutral-perception-profile-v1';
    profile.provenance.transfer_basis = 'approved by another source';

    assert.equal(validPostActionPerceptionProfile(profile, {
      expectedProfileId: 'another-neutral-perception-profile-v1'
    }), true);
    assert.equal(validPostActionPerceptionProfile(profile, {
      expectedProfileId: 'live_world_post_action_perception_v1'
    }), false);
  });

test('common perception modules exclude scenario identifiers and legacy revision',
  async () => {
    const paths = [
      new URL('../src/internal/post-action-perception-profile.js', import.meta.url),
      new URL('../src/runtime/lower-dvina-trace-post-action-perception-context.js', import.meta.url),
      new URL('../src/runtime/lower-dvina-trace-post-applied-actor-step.js', import.meta.url)
    ];
    const source = (await Promise.all(paths.map((path) =>
      readFile(path, 'utf8')))).join('\n');
    assert.doesNotMatch(source, /lower_dvina_trace_v1|scenario_definition_revision\s*===\s*34/);
    assert.equal(validPostActionPerceptionProfile(await perceptionPolicy()), false);
    assert.equal(legacyPostActionPerceptionAdapter.validProfile(
      await perceptionPolicy()), true);
  });

test('legacy adapter preserves M22 environment without general-profile routing',
  async () => {
    const committed = await state();
    const legacy = await perceptionPolicy();
    const context = legacyPostActionPerceptionAdapter.context({
      state: committed, npc: committed.npcs[0],
      source: committed.post_action_perception_sources[0], profile: legacy
    });
    assert.equal(context.environment_snapshot.light_state_id, 'bright');
    assert.equal(context.environment_snapshot.weather_visibility_result,
      'clear');
    assert.equal(context.environment_snapshot.weather_acoustic_loss, '0');
    assert.equal(context.environment_snapshot.environment_state_ref, null);
    assert.equal(context.environment_snapshot.environment_state_version, null);
    assert.equal(context.environment_snapshot.weather_state_ref.entity_id,
      'lower_dvina_trace_post_action_perception_v1:weather');
  });

test('approved general profile excludes sleeping listeners and other positions',
  async () => {
    const profile = await generalPerceptionPolicy();
    for (const [name, runtimeStatus, position] of [
      ['sleeping', 'sleeping', 'position:anchor-1'],
      ['other position', 'available', 'position:elsewhere']
    ]) {
      const committed = await state(runtimeStatus);
      const owner = createLowerDvinaTracePostAppliedActorStepOwner({
        committedState: committed,
        idempotencyKey: `idem-general-${name}`,
        perceptionProfile: profile,
        environmentPort: () => environmentSnapshot({ weather: 'weather-clear',
          light: 'bright' })
      });
      const result = await owner({ working_projection: {},
        factual_events: [event('acoustic', `event-${name}`, position)] });
      const proposals = result.temporal_results[0].combined_change_set.proposals;
      const outcomes = proposals.flatMap(({ perception_reaction_result: value }) =>
        value?.perception_result == null ? [] : [value.perception_result.result]);
      if (runtimeStatus === 'sleeping') {
        assert.deepEqual(outcomes, ['not_perceived'], name);
      } else {
        assert.deepEqual(outcomes, [], name);
      }
      assert.deepEqual(result.consequence_fragment.visible_seed
        .turn_step_post_applied_perception_window.pending_npc_decision_refs ?? [],
      [], name);
    }
  });

test('12 deterministic cases cover general profile outcomes and M22 parity', async () => {
  const cases = [
    { name: 'co-located acoustic event', make: () => ({}) },
    { name: 'ambient noise 1', make: () => ({ noise: 1 }) },
    { name: 'ambient noise 2', make: () => ({ noise: 2 }) },
    { name: 'sleeping listener', make: () => ({ runtimeStatus: 'sleeping' }) },
    { name: 'unavailable listener', make: () => ({ runtimeStatus: 'unavailable' }) },
    { name: 'acoustic event at another position', make: () => ({
      position: 'position:elsewhere' }) },
    { name: 'unsupported visual event', make: () => ({ channel: 'visual' }) },
    { name: 'two co-located listeners', make: () => ({ listenerCount: 2 }) },
    { name: 'same-time event batch', make: () => ({ eventCount: 2 }) },
    { name: 'events at distinct times', make: () => ({ eventCount: 2,
      distinctTimes: true }) },
    { name: 'night with poor weather', make: () => ({ light: 'night',
      visibility: 'poor' }) },
    { name: 'unwired v17 null profile', make: () => ({ profile: null }) }
  ];
  const generalized = await generalPerceptionPolicy();

  for (const [index, probe] of cases.entries()) {
    const options = probe.make();
    const committed = await state(options.runtimeStatus ?? 'available');
    if (options.noise != null) {
      committed.post_action_perception_sources[0].ambient_noise = options.noise;
    }
    if (options.listenerCount === 2) {
      committed.npcs.push({ ...structuredClone(committed.npcs[0]),
        instance_id: 'npc-2' });
      committed.npc_schedule_runtime.push({
        ...structuredClone(committed.npc_schedule_runtime[0]), npc_id: 'npc-2' });
      committed.post_action_perception_sources.push({
        ...structuredClone(committed.post_action_perception_sources[0]),
        npc_id: 'npc-2' });
      committed.post_action_knowledge_states.push({
        ...structuredClone(committed.post_action_knowledge_states[0]),
        npc_id: 'npc-2' });
    }
    const events = Array.from({ length: options.eventCount ?? 1 }, (_, eventIndex) => {
      const item = event(options.channel ?? 'acoustic', `case-${index}-event-${eventIndex}`,
        options.position ?? 'position:anchor-1');
      if (options.distinctTimes && eventIndex > 0) {
        item.occurred_at = { ...at, whole_minutes: '11' };
      }
      return item;
    });
    const projectEnvironment = ({ event_time }) => ({
      ...environmentSnapshot({ weather: `weather-${index}`,
        light: options.light === 'night' ? 'dark' : 'bright' }),
      observed_at: event_time
    });
    const run = async (profile) => {
      const result = await createLowerDvinaTracePostAppliedActorStepOwner({
        committedState: structuredClone(committed),
        idempotencyKey: `case-${index}`, perceptionProfile: profile,
        environmentPort: projectEnvironment
      })({ working_projection: {}, factual_events: events });
      const window = result.consequence_fragment?.visible_seed
        ?.turn_step_post_applied_perception_window;
      return {
        outcomes: result.temporal_results[0].combined_change_set.proposals
          .flatMap(({ perception_reaction_result: reaction }) =>
            reaction == null ? [] : [reaction.perception_result.result]),
        pending: window?.pending_npc_decision_refs ?? [],
        moments: window?.moments ?? []
      };
    };

    if (options.profile === null) {
      const negativeControl = await run(null);
      assert.deepEqual(negativeControl, { outcomes: [], pending: [], moments: [] }, probe.name);
      continue;
    }
    const result = await run(generalized);
    if (options.runtimeStatus === 'sleeping') {
      assert.deepEqual(result.outcomes, ['not_perceived'], probe.name);
    } else if (options.runtimeStatus === 'unavailable'
        || options.position === 'position:elsewhere'
        || options.channel === 'visual') {
      assert.deepEqual(result.outcomes, [], probe.name);
    } else if (options.listenerCount === 2) {
      assert.equal(result.outcomes.length, 2, probe.name);
    } else {
      assert.equal(result.outcomes.length, options.eventCount ?? 1, probe.name);
    }
    if (options.distinctTimes) assert.equal(result.moments.length, 2, probe.name);
  }
});

test('general profile fails closed when environment projection is missing', async () => {
  const owner = createLowerDvinaTracePostAppliedActorStepOwner({
    committedState: await state(), idempotencyKey: 'idem-no-environment',
    perceptionProfile: await generalPerceptionPolicy()
  });

  await assert.rejects(owner({ working_projection: {}, factual_events: [event()] }),
    ({ code }) => code === 'TRACE_POST_ACTION_ENVIRONMENT_STATE_GAP');
});

test('same-time perceived events create only pending references for wave 2', async () => {
  const owner = createLowerDvinaTracePostAppliedActorStepOwner({
    committedState: await state(), idempotencyKey: 'idem-batch',
    perceptionProfile: await generalPerceptionPolicy(),
    environmentPort: () => environmentSnapshot()
  });
  const input = { working_projection: {},
    factual_events: [event('acoustic', 'event-1'),
      event('acoustic', 'event-2')] };

  const first = await owner(input);
  const second = await owner(input);
  assert.deepEqual(first.consequence_fragment.visible_seed
    .turn_step_post_applied_perception_window.pending_npc_decision_refs,
  ['npc-1']);
  assert.deepEqual(second.consequence_fragment.visible_seed
    .turn_step_post_applied_perception_window.pending_npc_decision_refs,
  ['npc-1']);
});

test('one event gives every co-located listener a distinct idempotency identity', async () => {
  const committed = await state();
  committed.npcs.push({ ...structuredClone(committed.npcs[0]),
    instance_id: 'npc-2' });
  committed.npc_schedule_runtime.push({
    ...structuredClone(committed.npc_schedule_runtime[0]), npc_id: 'npc-2' });
  committed.post_action_perception_sources.push({
    ...structuredClone(committed.post_action_perception_sources[0]),
    npc_id: 'npc-2' });
  committed.post_action_knowledge_states.push({
    ...structuredClone(committed.post_action_knowledge_states[0]),
    npc_id: 'npc-2' });
  const owner = createLowerDvinaTracePostAppliedActorStepOwner({
    committedState: committed, idempotencyKey: 'idem-multi',
    perceptionProfile: await generalPerceptionPolicy(),
    environmentPort: () => environmentSnapshot()
  });

  const result = await owner({ working_projection: {},
    factual_events: [event()] });
  const identities = result.temporal_results[0].combined_change_set.proposals
    .flatMap(({ write_set: writes }) => writes.appends ?? [])
    .filter(({ target_table }) => target_table === 'party_perception_records')
    .map(({ record }) => record.idempotency_record_id);

  assert.deepEqual(identities.sort(), [
    'idem-multi:perception:event-1:npc-1',
    'idem-multi:perception:event-1:npc-2'
  ]);
  assert.deepEqual(result.consequence_fragment.visible_seed
    .turn_step_post_applied_perception_window.pending_npc_decision_refs,
  ['npc-1', 'npc-2']);
  assert.equal(Object.hasOwn(result.consequence_fragment.visible_seed
    .turn_step_post_applied_perception_window, 'npc_decision_boundaries'), false);
});

test('sleeping co-located NPC persists not-perceived without signal or knowledge', async () => {
  const owner = createLowerDvinaTracePostAppliedActorStepOwner({
    committedState: await state('sleeping'), idempotencyKey: 'idem-2',
    perceptionProfile: await generalPerceptionPolicy(),
    environmentPort: () => environmentSnapshot()
  });
  const result = await owner({
    working_projection: {}, factual_events: [event()]
  });
  const proposal = result.temporal_results[0].combined_change_set.proposals[1];
  const perception = proposal.perception_reaction_result.perception_result;

  assert.equal(perception.result, 'not_perceived');
  assert.equal(result.working_projection.npc_decision_signal_descriptors,
    undefined);
  assert.equal(proposal.write_set.inserts.some(({ target_table }) =>
    target_table === 'party_npc_knowledge'), false);
  assert.equal(result.consequence_fragment.visible_seed
    .turn_step_post_applied_perception_window.status, 'completed');
  assert.equal(Object.hasOwn(result.consequence_fragment.visible_seed
    .turn_step_post_applied_perception_window, 'npc_decision_boundaries'), false);
});

test('unavailable co-located NPC gets no perception, knowledge, signal or boundary', async () => {
  const owner = createLowerDvinaTracePostAppliedActorStepOwner({
    committedState: await state('unavailable'), idempotencyKey: 'idem-unavailable',
    perceptionProfile: await generalPerceptionPolicy(),
    environmentPort: () => environmentSnapshot()
  });
  const result = await owner({ working_projection: {}, factual_events: [event()] });

  assert.equal(result.temporal_results[0].combined_change_set.proposals.length, 1);
  assert.equal(result.working_projection.npc_decision_signal_descriptors,
    undefined);
  assert.equal(Object.hasOwn(result.consequence_fragment.visible_seed
    .turn_step_post_applied_perception_window, 'npc_decision_boundaries'), false);
});

test('acoustic event at another position creates no perception or knowledge', async () => {
  const owner = createLowerDvinaTracePostAppliedActorStepOwner({
    committedState: await state(), idempotencyKey: 'idem-other-position',
    perceptionProfile: await generalPerceptionPolicy(),
    environmentPort: () => environmentSnapshot()
  });

  const result = await owner({
    working_projection: {}, factual_events: [event('acoustic', 'event-1', 'position:elsewhere')]
  });
  const proposals = result.temporal_results[0].combined_change_set.proposals;

  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].write_set.inserts[0].target_table,
    'party_temporal_events');
  assert.equal(result.working_projection.npc_decision_signal_descriptors,
    undefined);
  assert.equal(Object.hasOwn(result.consequence_fragment.visible_seed
    .turn_step_post_applied_perception_window, 'npc_decision_boundaries'), false);
});

test('unsupported visual channel at the same position creates no perception', async () => {
  const owner = createLowerDvinaTracePostAppliedActorStepOwner({
    committedState: await state(), idempotencyKey: 'idem-visual-channel',
    perceptionProfile: await generalPerceptionPolicy(),
    environmentPort: () => environmentSnapshot()
  });
  const result = await owner({ working_projection: {},
    factual_events: [event('visual')] });

  assert.equal(result.temporal_results[0].combined_change_set.proposals.length, 1);
  assert.equal(result.working_projection.npc_decision_signal_descriptors,
    undefined);
  assert.equal(Object.hasOwn(result.consequence_fragment.visible_seed
    .turn_step_post_applied_perception_window, 'npc_decision_boundaries'), false);
});

test('v17 null profile is negative control and creates no perception window', async () => {
  const owner = createLowerDvinaTracePostAppliedActorStepOwner({
    committedState: await state(), idempotencyKey: 'idem-null-profile'
  });
  const result = await owner({ working_projection: {}, factual_events: [event()] });

  assert.equal(result.temporal_results[0].combined_change_set.proposals.length, 1);
  assert.equal(result.consequence_fragment, null);
  assert.equal(result.working_projection.npc_decision_signal_descriptors,
    undefined);
});

test('co-located NPC without committed acoustic context fails closed', async () => {
  const committed = await state();
  committed.post_action_perception_sources[0].g6_instance_id = null;
  const owner = createLowerDvinaTracePostAppliedActorStepOwner({
    committedState: committed, idempotencyKey: 'idem-4',
    perceptionProfile: await generalPerceptionPolicy(),
    environmentPort: () => environmentSnapshot()
  });

  await assert.rejects(owner({
    working_projection: {}, factual_events: [event()]
  }), ({ code }) => code === 'TRACE_POST_ACTION_PERCEPTION_CONTEXT_GAP');
});
