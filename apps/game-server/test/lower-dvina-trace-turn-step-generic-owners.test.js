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
    assert.deepEqual(projected.visible_changes, ['turn_step_x']);
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
