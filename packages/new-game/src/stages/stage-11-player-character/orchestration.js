import { STAGE11_OUTPUT_SCHEMA } from './constants.js';
import { validateStage11PlayerCharacterInput } from './validation.js';
import { canonicalDigest, createRandomSource, deriveSeed, materializeActorBaseAppearance, RNG_VERSION } from '@rus/materialization';

export async function runStage11PlayerCharacterBlock({ input, executor }) {
  const inputConcerns = validateStage11PlayerCharacterInput(input);
  if (inputConcerns.length > 0) {
    return {
      version: 1,
      schema: STAGE11_OUTPUT_SCHEMA,
      request_id: input?.request_id ?? null,
      generation_status: 'blocked',
      audit_self_check: { pass: false, concerns: inputConcerns, evidence: [] }
    };
  }
  if (typeof executor !== 'function') {
    throw new Error('runStage11PlayerCharacterBlock requires executor.');
  }
  const artifact = await executor({ input, stage: { id: 11, slug: 'player_character', output_schema: STAGE11_OUTPUT_SCHEMA } });
  return completePlayerAppearance(artifact, input);
}

function completePlayerAppearance(artifact, input) {
  const candidateSet = input.character_generation_policy?.actor_base_appearance;
  if (candidateSet == null || artifact?.generation_status !== 'generated') return artifact;
  const approvedEntries = candidateSet.approved_entries;
  const candidateSetDigest = canonicalDigest(approvedEntries);
  if (!Array.isArray(approvedEntries) || (candidateSet.candidate_set_digest != null && candidateSet.candidate_set_digest !== candidateSetDigest)) {
    throw new Error('Stage 11 actor_base_appearance candidate set is missing or its digest is invalid.');
  }
  const seed = deriveSeed({
    request_id: input.request_id,
    world_revision_id: candidateSet.world_revision_id,
    profile_id: candidateSet.profile_id,
    candidate_set_digest: candidateSetDigest,
    domain: 'stage_11_player_actor_base_appearance'
  });
  const materialized = materializeActorBaseAppearance({
    identity: artifact.identity,
    approved_entries: approvedEntries,
    random: createRandomSource({ seed: seed.uint32 }),
    choice_key_prefix: `player:${artifact.identity?.character_id ?? input.request_id}`,
    rule_id: candidateSet.profile_id ?? 'player_actor_base_appearance'
  });
  return {
    ...structuredClone(artifact),
    identity: structuredClone(materialized.identity),
    appearance_contract_version: 'actor_base_appearance_v1',
    source_trace: [
      ...(artifact.source_trace ?? []).map((entry) => structuredClone(entry)),
      {
        source_kind: 'actor_base_appearance_completion',
        profile_id: candidateSet.profile_id ?? null,
        world_revision_id: candidateSet.world_revision_id ?? null,
        candidate_set_digest: candidateSetDigest,
        rng_version: RNG_VERSION,
        seed_digest: seed.digest,
        choices: materialized.choices.map((choice) => structuredClone(choice))
      }
    ]
  };
}
