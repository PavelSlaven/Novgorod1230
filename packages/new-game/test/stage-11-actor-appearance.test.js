import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalDigest } from '@rus/materialization';
import { runStage11PlayerCharacterBlock } from '../src/stages/stage-11-player-character/orchestration.js';
import { validateStage11PlayerCharacterOutput } from '../src/stages/stage-11-player-character/validation.js';
import { buildStage12CodePrecheck } from '../src/stages/stage-12-player-character-audit/precheck.js';
import { buildStage11PlayerCharacterInput } from '../src/stages/stage-11-player-character/contract.js';

const values = {
  sex_category: ['male'], age_category: ['adult'], build: ['average'], skin_tone: ['light'], face_shape: ['oval'],
  hair_color: ['dark_brown'], hair_length: ['short'], hair_style: ['straight'], facial_hair: ['none'], eye_color: ['gray']
};
const approvedEntries = Object.entries(values).flatMap(([facet, options]) => options.map((option, index) => ({ entry_id: `${facet}_${index}`, facet, option_value: option, weight: 1, status: 'approved', applicability: {} })));
const actorBaseAppearance = { profile_id: 'player-appearance-v1', world_revision_id: 'world-v4', approved_entries: approvedEntries, candidate_set_digest: canonicalDigest(approvedEntries) };

function input() {
  return {
    version: 1, schema: 'player_character_generator_input', request_id: 'request-1', normalized_request: {}, historical_frame: {}, regional_context_package: {}, selected_start_node: {},
    start_place_audit: { pass: true }, npc_candidate_set: {}, item_profile_candidate_set: {}, character_generation_policy: { actor_base_appearance: actorBaseAppearance }
  };
}

test('Stage 11 preserves explicit player appearance intent and completes only missing fields in code', async () => {
  const executor = async () => ({
    schema: 'player_character_dossier', version: 1, generation_status: 'generated',
    identity: { character_id: 'player-1', sex_category: 'male', appearance: { hair: { color: 'dark_brown' }, eyes: { color: 'gray' } } },
    body: {}, source_trace: [{ source_kind: 'llm_player_intent' }]
  });
  const left = await runStage11PlayerCharacterBlock({ input: input(), executor });
  const right = await runStage11PlayerCharacterBlock({ input: input(), executor });
  assert.deepEqual(left, right);
  assert.equal(left.identity.sex_category, 'male');
  assert.equal(left.identity.appearance.hair.color, 'dark_brown');
  assert.equal(left.identity.appearance.build, 'average');
  assert.equal(left.appearance_contract_version, 'actor_base_appearance_v1');
  assert.equal(left.source_trace.at(-1).choices.find((choice) => choice.slot_key === 'sex_category').rng_draw, 0);
});

test('Stage 11 derives the player completion set from the exact Stage 7 actor snapshot', () => {
  const demographicEntries = approvedEntries.filter(({ facet }) =>
    ['sex_category', 'age_category'].includes(facet));
  const appearanceEntries = approvedEntries.filter(({ facet }) =>
    !['sex_category', 'age_category'].includes(facet));
  const outputs = new Map([
    [2, {}], [3, {}], [4, {}], [7, {
      actor_profile_snapshot: {
        version: 1,
        schema: 'approved_actor_profile_snapshot',
        world_revision_id: 'world-v4',
        source_catalog_digest: 'e'.repeat(64),
        catalog_digest: 'f'.repeat(64),
        demographic_profiles: [{ id: 'demographics-v1', entries: demographicEntries }],
        appearance_profiles: [{ id: 'appearance-v1', entries: appearanceEntries }]
      }
    }], [8, {}], [9, {}], [10, { pass: true }]
  ]);
  const built = buildStage11PlayerCharacterInput({
    requestId: 'request-1',
    getStageOutput: (stage) => outputs.get(stage),
    requireStageOutput: (stage) => outputs.get(stage)
  });

  assert.equal(
    built.character_generation_policy.actor_base_appearance.profile_id,
    'player:demographics-v1:appearance-v1'
  );
  assert.deepEqual(
    built.character_generation_policy.actor_base_appearance.approved_entries,
    approvedEntries
  );
});

test('Stage 11 and Stage 12 reject an incomplete marked actor and duplicate body ownership', () => {
  const dossier = {
    schema: 'player_character_dossier', version: 1, generation_status: 'generated', appearance_contract_version: 'actor_base_appearance_v1',
    identity: { sex_category: 'male', body: { age_category: 'adult' } }
  };
  const stage11Codes = validateStage11PlayerCharacterOutput(dossier, input()).map((item) => item.code);
  assert.ok(stage11Codes.includes('PLAYER_CHARACTER_APPEARANCE_INVALID'));
  const precheck = buildStage12CodePrecheck({ player_character_dossier: dossier, start_place_audit: { pass: true }, regional_context_package: {}, item_profile_candidate_set: {}, npc_candidate_set: {}, audit_policy: {} });
  assert.equal(precheck.checks.actor_base_appearance_valid, false);
  assert.ok(precheck.concerns.some((item) => item.code === 'PLAYER_AUDIT_APPEARANCE_INVALID'));
});

test('Stage 11 rejects legacy body appearance aliases beside canonical identity', () => {
  const dossier = {
    schema: 'player_character_dossier', version: 1,
    generation_status: 'generated',
    appearance_contract_version: 'actor_base_appearance_v1',
    identity: {
      sex_category: 'male', age_category: 'adult',
      appearance: {
        build: 'average', skin_tone: 'light', face_shape: 'oval',
        hair: {
          color: 'dark_brown', length: 'short', style: 'straight',
          facial_hair: 'none'
        },
        eyes: { color: 'gray' }
      }
    },
    body: { build: 'slim', hair_color: 'black' }
  };
  const errors = validateStage11PlayerCharacterOutput(dossier, input());
  assert.ok(errors.some((item) =>
    item.code === 'PLAYER_CHARACTER_APPEARANCE_INVALID'));
});

test('Stage 12 requires the appearance marker for a newly generated player', () => {
  const dossier = {
    schema: 'player_character_dossier', version: 1, generation_status: 'generated',
    identity: {
      sex_category: 'male', age_category: 'adult',
      appearance: {
        build: 'average', skin_tone: 'light', face_shape: 'oval',
        hair: { color: 'dark_brown', length: 'short', style: 'straight', facial_hair: 'none' },
        eyes: { color: 'gray' }
      }
    }
  };
  const precheck = buildStage12CodePrecheck({
    player_character_dossier: dossier,
    start_place_audit: { pass: true },
    regional_context_package: {},
    item_profile_candidate_set: {},
    npc_candidate_set: {},
    audit_policy: { require_actor_base_appearance: true }
  });

  assert.equal(precheck.checks.actor_base_appearance_valid, false);
  assert.ok(precheck.concerns.some((item) =>
    item.code === 'PLAYER_AUDIT_APPEARANCE_INVALID'
      && item.field === 'player_character_dossier.appearance_contract_version'));
});
