import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  GENERIC_BODY_EFFECT_REF,
  createLowerDvinaTraceCompositeBodyEffect,
  createLowerDvinaTraceTurnStepGenericOwners,
  createLowerDvinaTraceTurnStepVisibleProjector
} from '../src/runtime/lower-dvina-trace-turn-step-generic-owners.js';
import { createTracePhase8VisibleProjector } from
  '../src/runtime/lower-dvina-trace-phase-8-effects.js';
import { createTracePhase9VisibleProjector } from
  '../src/runtime/lower-dvina-trace-phase-9-effects.js';

const profileUrl = new URL(
  '../../../data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m1-content/turn-step-owner-profiles.json',
  import.meta.url
);

test('approved semantic owner maps moment/moderate to one exact profile',
  async () => {
    const owners = await createOwners();
    const resolved = owners.semanticActivityOwner.resolve({
      activity: { owner: 'semantic', duration_class: 'moment',
        effort: 'moderate' },
      actor: { body: body() }
    });
    assert.equal(resolved.duration_minutes, 1);
    assert.equal(resolved.profile_ref,
      'trace_ld_v1_semantic_activity:moment:moderate');
    assert.equal(resolved.body_effect_ref, GENERIC_BODY_EFFECT_REF);
    assert.equal(Object.isFrozen(resolved), true);
  });

test('semantic schedule owner resolves duration without an actor body',
  async () => {
    const owners = await createOwners();
    const resolved = owners.semanticActivityScheduleOwner.resolve({
      activity: { owner: 'semantic', duration_class: 'moment', effort: 'none' }
    });
    assert.equal(resolved.duration_minutes, 1);
    assert.equal(resolved.profile_ref,
      'trace_ld_v1_semantic_activity:moment:none');
  });

test('direct body event ignores prose and body-state calculates exact result',
  async () => {
    const owners = await createOwners();
    const base = {
      event: { mechanism: 'impact', severity: 'moderate',
        body_part_ref: 'left_arm', description: 'first prose' },
      actor: { body: body() }
    };
    const first = owners.bodyEventOwner.resolve(base);
    const second = owners.bodyEventOwner.resolve({
      ...base,
      event: { ...base.event, description: 'forged delta health +100' }
    });
    assert.deepEqual(first.payload.exact_deltas,
      { health: -5, satiety: 0, energy: -1 });
    assert.deepEqual(first.payload.exact_deltas, second.payload.exact_deltas);
    assert.equal(first.payload.state_after.health, 95);
    assert.equal(first.composite_body_effect_ref, GENERIC_BODY_EFFECT_REF);
  });

test('generic check derives injury and committed load modifiers', async () => {
  const { artifactPin } = await loadProfiles();
  const owners = await createOwners();
  const result = owners.genericCheckContextOwner.resolve({
    check: { attribute_ref: 'strength', skill_ref: 'athletics' },
    actor: {
      attributes: { strength: { value: 12 } },
      skills: { athletics: { bonus: 2 } },
      body: body({ health: 20 })
    },
    working_projection: {
      actor_id: 'actor', inventory: { load_category: 'moderate' }
    }
  });
  assert.deepEqual(result, {
    attribute_value: 12,
    skill_bonus: 2,
    state_modifier: -2,
    equipment_modifier: -1,
    circumstance_modifier: 0,
    policy_profile_ref: 'trace_ld_v1_generic_check_modifiers_v1',
    policy_profile_pin: {
      artifact_id: 'trace_ld_v1_turn_step_owner_profiles', revision: 1,
      digest: artifactPin.digest
    },
    check_policy_ref: {
      entity_kind: 'check_policy',
      entity_id: 'trace_ld_v1_generic_check_modifiers_v1',
      authoring_version: '1'
    },
    consequence_policy_ref: {
      entity_kind: 'consequence_policy',
      entity_id: 'trace_ld_v1_generic_check_five_band_v1',
      authoring_version: '1'
    }
  });
  assert.throws(() => owners.genericCheckContextOwner.resolve({
    check: { attribute_ref: 'strength', skill_ref: null },
    actor: { attributes: { strength: { value: 12 } }, body: body() },
    working_projection: { actor_id: 'actor', inventory: {} }
  }), { code: 'TRACE_TURN_STEP_CHECK_EQUIPMENT_DATA_GAP' });
});

test('composite body owner applies semantic and direct effects once',
  async () => {
    const owners = await createOwners();
    const pin = owners.semanticActivityOwner.resolve({
      activity: { duration_class: 'moment', effort: 'moderate' },
      actor: { body: body() }
    }).profile_pin;
    const result = owners.bodyEffect.apply({
      committed_state: { body_state: body() },
      consequence: {
        body_effect_ref: GENERIC_BODY_EFFECT_REF,
        state_changes: [{
          kind: 'semantic_activity',
          body_effect_profile_ref:
            'trace_ld_v1_semantic_activity:body:moment:moderate',
          profile_pin: pin,
          body_effect_context: { kind: 'semantic_activity',
            duration_class: 'moment', effort: 'moderate' }
        }, {
          kind: 'direct_body_event',
          body_effect_profile_ref:
            'trace_ld_v1_direct_body_event:impact:moderate',
          profile_pin: pin,
          body_effect_context: { kind: 'direct_body_event',
            mechanism: 'impact', severity: 'moderate',
            body_part_ref: 'left_arm' }
        }, {
          kind: 'direct_body_event',
          body_effect_profile_ref:
            'trace_ld_v1_direct_body_event:impact:moderate',
          profile_pin: pin,
          body_effect_context: { kind: 'direct_body_event',
            mechanism: 'impact', severity: 'moderate',
            body_part_ref: 'left_arm' }
        }]
      }
    });
    assert.deepEqual(result.proposal.exact_deltas,
      { health: -10, satiety: -1, energy: -4 });
    assert.deepEqual(result.proposal.component_proposals.map(
      ({ state_after: stateAfter }) => stateAfter), [
      body({ satiety: 99, energy: 98 }),
      body({ health: 95, satiety: 99, energy: 97 }),
      body({ health: 90, satiety: 99, energy: 96 })
    ]);
    assert.equal(result.state_after.health, 90);
    assert.equal(result.state_after.satiety, 99);
    assert.equal(result.state_after.energy, 96);
    const tampered = structuredClone(pin);
    tampered.digest = '0'.repeat(64);
    assert.throws(() => owners.bodyEffect.apply({
      committed_state: { body_state: body() },
      consequence: { body_effect_ref: GENERIC_BODY_EFFECT_REF,
        state_changes: [{ kind: 'semantic_activity',
          body_effect_profile_ref:
            'trace_ld_v1_semantic_activity:body:moment:moderate',
          profile_pin: tampered,
          body_effect_context: { kind: 'semantic_activity',
            duration_class: 'moment', effort: 'moderate' } }] }
    }), { code: 'TRACE_TURN_STEP_BODY_EFFECT_PROFILE_MISMATCH' });
  });

test('generic composition preserves domain body and handles direct visible',
  async () => {
    const owners = await createOwners();
    let fallbackCalls = 0;
    const fallback = { apply() { fallbackCalls += 1; return { domain: true }; } };
    const composite = createLowerDvinaTraceCompositeBodyEffect({
      genericBodyEffect: owners.bodyEffect, fallback
    });
    assert.deepEqual(composite.apply({ consequence: {
      body_effect_ref: 'phase5-domain-effect' } }), { domain: true });
    assert.equal(fallbackCalls, 1);

    const visible = createLowerDvinaTraceTurnStepVisibleProjector({
      fallback: { project() { throw new Error('unexpected fallback'); } }
    });
    const projected = await visible.project({
      consequence: { visible_seed: { completed_steps: [],
        clarification: null, turn_step_x: { kind: 'body_event' } } },
      body_update: { state_after: body({ health: 95 }) }
    });
    assert.equal(projected.visible_scene, 'Заявленное действие завершено.');
    assert.deepEqual(projected.visible_changes,
      ['Вы ощутили перемену в своём состоянии.']);

    const physical = await visible.project({
      consequence: { visible_seed: { completed_steps: [],
        clarification: null,
        turn_step_move: { change: 'moved', relation: 'held_by',
          display_label: 'длинную доску' },
        turn_step_action_production_2: { change: 'physical_change',
          entity_ref: 'board', physical_description:
            'Доска с обрывком снасти приспособлена как опора для плеча',
          qualitative_facts: ['опора поддерживает плечо'] } } },
      body_update: { state_after: body() }
    });
    assert.deepEqual(physical.visible_changes, [
      'Вы взяли в руки длинную доску.',
      'Доска с обрывком снасти приспособлена как опора для плеча.'
    ]);

    const scene = await visible.project({
      mode_resolution: { decision_trace: { step_traces: [{
        approved_plan: {
          resolution: 'direct', operations: [], check: null
        }
      }] } },
      retrieved_state: { current_visible_context: {
        version: 1,
        schema: 'visible_context_package',
        visible_scene: 'Уже видимый берег.',
        visible_changes: [],
        sensory_details: ['cold', 'wet'],
        visible_npc: [],
        visible_objects: [],
        known_context: ['берег'],
        uncertainties: [],
        allowed_tensions: [],
        do_not_imply: []
      } },
      consequence: { visible_seed: { completed_steps: [],
        clarification: null, turn_step_y: { kind: 'semantic_activity' } } },
      body_update: { state_after: body({ health: 95 }) }
    });
    assert.equal(scene.visible_scene, 'Уже видимый берег.');
    assert.deepEqual(scene.sensory_details, ['cold', 'wet']);
    assert.deepEqual(scene.visible_changes,
      ['Прошло некоторое время.']);
    assert.equal(scene.known_context.includes('health:95'), true);
  });

test('generic visible projector preserves ordered player F1 facts',
  async () => {
    const visible = createLowerDvinaTraceTurnStepVisibleProjector({
      fallback: { project() { throw new Error('unexpected fallback'); } }
    });
    const result = await visible.project({
      retrieved_state: { current_visible_context: currentVisibleContext() },
      consequence: { visible_seed: {
        completed_steps: [], clarification: 'Что делать дальше?',
        turn_step_world_process_5:
          fireVisible('affect', 'complete', 'completed'),
        turn_step_world_process_1: fireVisible('start', 'started', 'active'),
        turn_step_world_process_4:
          fireVisible('affect', 'continue', 'active'),
        turn_step_world_process_2:
          fireVisible('add_fuel', 'fuel_added', 'active'),
        turn_step_world_process_3:
          fireVisible('affect', 'no_effect', 'active')
      } }, body_update: { state_after: body() } });
    assert.equal(result.visible_scene,
      'Уже видимый берег. Огонь разгорелся. В огонь добавлено топливо. '
      + 'Воздействие не изменило огонь. '
      + 'Огонь изменился, но продолжает гореть. Огонь погас. '
      + 'Требуется уточнение дальнейшего действия.');
    assert.deepEqual(result.visible_npc,
      currentVisibleContext().visible_npc);
    assert.deepEqual(result.visible_objects,
      currentVisibleContext().visible_objects);
    assert.deepEqual(result.sensory_details, ['cold', 'wet']);
    assert.equal(result.known_context.includes('берег'), true);
    assert.deepEqual(result.visible_changes, [
      'turn_step_world_process_1:local_fire:started',
      'turn_step_world_process_2:local_fire:fuel_added',
      'turn_step_world_process_3:local_fire:no_effect',
      'turn_step_world_process_4:local_fire:continue',
      'turn_step_world_process_5:local_fire:complete'
    ]);
  });

test('generic visible projector overlays F1 facts on domain projection',
  async () => {
    let fallbackCalls = 0;
    const base = {
      ...currentVisibleContext(),
      visible_scene: 'Микула пришёл в рыбацкий стан.',
      visible_changes: ['route'],
      known_context: ['стан']
    };
    const visible = createLowerDvinaTraceTurnStepVisibleProjector({
      fallback: { project() { fallbackCalls += 1; return base; } }
    });
    const result = await visible.project({ consequence: {
      activity_attempt_id: 'attempt:phase3-movement',
      phase3_kind: 'movement',
      visible_seed: { completed_steps: [], clarification: null,
        turn_step_world_process_1:
          fireVisible('start', 'started', 'active') }
    } });
    assert.equal(fallbackCalls, 1);
    assert.deepEqual(result, {
      ...base,
      visible_scene: 'Микула пришёл в рыбацкий стан. Огонь разгорелся.',
      visible_changes: [
        'route', 'turn_step_world_process_1:local_fire:started'
      ]
    });
  });

test('generic visible projector overlays F1 facts through Phase 8 and 9',
  async () => {
    const normal = { project() { throw new Error('unexpected fallback'); } };
    const phase8 = createTracePhase8VisibleProjector({
      contracts: { actors: {
        zhdanko: { instance_id: 'npc-zhdanko' },
        eremey: { instance_id: 'npc-eremey' },
        ratsha: { instance_id: 'npc-ratsha' }
      }, participatingFishers: [{ instance_id: 'npc-fisher' }] }, fallback: normal
    });
    const visible = createLowerDvinaTraceTurnStepVisibleProjector({
      fallback: createTracePhase9VisibleProjector({
        contracts: { packet: { item_id: 'packet-1' } }, fallback: phase8
      })
    });
    const movement = await visible.project({ consequence: {
      activity_attempt_id: 'attempt:phase8-movement', phase8_kind: 'movement',
      visible_seed: { completed_steps: [], clarification: null,
        turn_step_world_process_1:
        fireVisible('start', 'started', 'active') }
    } });
    assert.equal(movement.visible_scene,
      'Группа пришла во двор клети. Огонь разгорелся.');
    assert.deepEqual(movement.visible_changes, [
      'Группа дошла от рыбацкого стана до двора клети.',
      'turn_step_world_process_1:local_fire:started'
    ]);

    const recovery = await visible.project({ consequence: {
      activity_attempt_id: 'attempt:phase9-recovery', phase9_kind: 'bag_recovery',
      phase9: {},
      visible_seed: { completed_steps: [], clarification: null,
        turn_step_world_process_1:
        fireVisible('add_fuel', 'fuel_added', 'active') }
    } });
    assert.equal(recovery.visible_scene,
      'Дорожная сумка теперь под вашим контролем. В огонь добавлено топливо.');
    assert.deepEqual(recovery.visible_changes, [
      'Вы забрали дорожную сумку.',
      'turn_step_world_process_1:local_fire:fuel_added'
    ]);

    const combat = await visible.project({ retrieved_state: {
      actor_id: 'player'
    }, consequence: { combat_kind: 'exchange', combat: {
      exchange: { technical_steps: [{ actor_ref: {
        entity_kind: 'player_character', entity_id: 'player' },
      check_request: { target_id: 'npc-zhdanko' } }] },
      harm_packages: [{ target_id: 'npc-zhdanko', health_loss: 5,
        injury: { label: 'лёгкая рана' } }],
      session_before: { participant_states: [{ actor_ref: {
        entity_kind: 'npc', entity_id: 'npc-zhdanko' }, combat_status: 'active' }] },
      session_after: { status: 'ended', participant_states: [{ actor_ref: {
        entity_kind: 'npc', entity_id: 'npc-zhdanko' },
      combat_status: 'incapacitated' }] }
    }, visible_seed: { completed_steps: [], clarification: null } } });
    assert.equal(combat.visible_scene,
      'У вашего противника — лёгкая рана. Ваш противник больше не может продолжать бой. Схватка закончилась.');

    const fallback = await visible.project({ consequence: {
      activity_attempt_id: 'attempt:phase8-no-f1', phase8_kind: 'movement',
      visible_seed: { completed_steps: [], clarification: null }
    } });
    assert.equal(fallback.visible_scene, 'Группа пришла во двор клети.');
    assert.deepEqual(fallback.visible_changes,
      ['Группа дошла от рыбацкого стана до двора клети.']);
  });

test('generic visible projector rejects malformed player F1 facts',
  async () => {
    let fallbackCalls = 0;
    const visible = createLowerDvinaTraceTurnStepVisibleProjector({
      fallback: { project() { fallbackCalls += 1; return {}; } }
    });
    const project = (seed, phase3_kind) => visible.project({ consequence: {
      phase3_kind, visible_seed: {
      completed_steps: [], clarification: null,
      turn_step_world_process_1: seed
    } }, body_update: { state_after: body() } });
    await assert.rejects(project(fireVisible('start', 'complete', 'completed')),
      { code: 'TRACE_TURN_STEP_WORLD_PROCESS_VISIBLE_SEED_INVALID' });
    await assert.rejects(project({ ...fireVisible('start', 'started', 'active'),
      process_ref: 'hidden-process' }),
    { code: 'TRACE_TURN_STEP_WORLD_PROCESS_VISIBLE_SEED_INVALID' });
    await assert.rejects(project(null),
      { code: 'TRACE_TURN_STEP_WORLD_PROCESS_VISIBLE_SEED_INVALID' });
    await assert.rejects(project(Object.assign(Object.create({}),
      fireVisible('start', 'started', 'active'))),
    { code: 'TRACE_TURN_STEP_WORLD_PROCESS_VISIBLE_SEED_INVALID' });
    await assert.rejects(project(
      fireVisible('start', 'complete', 'completed'), 'movement'),
    { code: 'TRACE_TURN_STEP_WORLD_PROCESS_VISIBLE_SEED_INVALID' });
    await assert.rejects(project(
      fireVisible('start', 'started', 'active')),
    { code: 'TRACE_CURRENT_SCENE_PROJECTION_INVALID' });
    assert.equal(fallbackCalls, 0);
  });

test('missing or tampered owner profiles fail closed', async () => {
  const { profiles, artifactPin } = await loadProfiles();
  assert.throws(() => createLowerDvinaTraceTurnStepGenericOwners({
    profiles: { ...profiles, status: 'draft' }, artifactPin
  }), { code: 'TRACE_TURN_STEP_OWNER_PROFILES_INVALID' });
  assert.throws(() => createLowerDvinaTraceTurnStepGenericOwners({
    profiles, artifactPin: { ...artifactPin, digest: 'tampered' }
  }), { code: 'TRACE_TURN_STEP_OWNER_PROFILES_INVALID' });
  const zeroDuration = structuredClone(profiles);
  zeroDuration.semantic_duration_profiles[0].duration_minutes = 0;
  assert.throws(() => createLowerDvinaTraceTurnStepGenericOwners({
    profiles: zeroDuration, artifactPin
  }), { code: 'TRACE_TURN_STEP_OWNER_PROFILES_INVALID' });
});

async function createOwners() {
  return createLowerDvinaTraceTurnStepGenericOwners(await loadProfiles());
}

async function loadProfiles() {
  const raw = await readFile(profileUrl);
  return {
    profiles: JSON.parse(raw),
    artifactPin: {
      digest: createHash('sha256').update(raw).digest('hex')
    }
  };
}

function body(overrides = {}) {
  return {
    health: 100,
    satiety: 100,
    energy: 100,
    active_conditions: [],
    body_parts: { left_arm: { id: 'left_arm' } },
    ...overrides
  };
}

function fireVisible(action, outcome, status) {
  return {
    schema:
      'rus.lower_dvina_trace_turn_step_world_process_visible_result.v1',
    process_kind: 'fire', action, outcome, status
  };
}

function currentVisibleContext() {
  return {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: 'Уже видимый берег.',
    visible_changes: [],
    sensory_details: ['cold', 'wet'],
    visible_npc: [{ entity_ref: { entity_kind: 'npc', entity_id: 'npc-1' },
      display_label: 'Еремей' }],
    visible_objects: [{ entity_ref: {
      entity_kind: 'item', entity_id: 'fuel-1' } }],
    known_context: ['берег'],
    uncertainties: [],
    allowed_tensions: [],
    do_not_imply: ['hidden_fact']
  };
}
