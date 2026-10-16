import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalCandidateDigest, canonicalDigest, canonicalRequestDigest,
  ACTOR_BASE_ATTRIBUTE_KEYS, validateActorBaseAttributesCandidate } from
  '../../../../../packages/materialization/src/index.js';

const root = resolve(import.meta.dirname);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const EXPECTED = Object.freeze({
  reviewedHead: '64a9ed747a05e20611632715897accea7e84df1e',
  profile: '5643edda6b0993cfe100bee8c1366928167b3b487d6c51d91a70e546644965b7',
  candidate: '7c0916640715c9c48bd023676b3268deccdc0c83a66c980835ae25173f04d309',
  request: 'fc362bb73f60ad87595d0ca51a2080bff7c970907fa8f2ca5f94e5acae155c89',
  taskSource: '671f6b94d857fe492de213ff116d841567e5ebc3cc0830a7866d5a94591aff2d',
  characterSource: 'cf8bc8f515e6c6758886e1532ae60a8dccf01f3804f52728cf3a89f609e728c8',
  occupationSource: 'a81d1d1626be6ae97c930032ea70b0cc93a0146adccf5508b066494b50e816c6'
});
const candidateRef = 'data/world-catalogs/novgorod/procedural-scene-v2/'
  + 'actor-base-attributes-v1/candidate.json';
const requestRef = 'data/world-catalogs/novgorod/procedural-scene-v2/'
  + 'actor-base-attributes-v1/approval-request.json';
const authority = Object.freeze({
  authoring_approved: true,
  runtime_authorized: false,
  import_authorized: false,
  activation_authorized: false,
  equipment_allocation_activation_authorized: false,
  functional_allocation_runtime_selection_authorized: false,
  runtime_item_creation_authorized: false,
  production_authorized: false,
  new_development_party_activation_authorized: false,
  existing_party_migration_authorized: false,
  old_save_rematerialization_authorized: false
});

export async function loadActorBaseAttributesAuthoringArtifacts() {
  const [candidate, request, attestation, characterParameters,
    occupations] = await Promise.all([
    readJson('candidate.json'), readJson('approval-request.json'),
    readJson('authoring-approval-attestation.json'),
    readFile(resolve(root,
      '../../../../knowledge-source/corpus/DOCUMENTS/character_parameters.txt')),
    readFile(resolve(root,
      '../../../../novgorod-region/novgorod_occupations_v1_enriched.tsv'))
  ]);
  assert.equal(sha256(characterParameters), EXPECTED.characterSource);
  assert.equal(sha256(occupations), EXPECTED.occupationSource);
  validateActorBaseAttributesAuthoringAttestation({ candidate, request,
    attestation });
  validateOccupationMappings(candidate, occupations.toString('utf8'));
  return Object.freeze({ candidate, request, attestation });
}

export function validateActorBaseAttributesAuthoringAttestation({ candidate,
  request, attestation }) {
  if (!validateActorBaseAttributesCandidate(candidate)
      || candidate.profile_digest !== EXPECTED.profile
      || candidate.candidate_digest !== EXPECTED.candidate
      || request?.schema !== 'rus.actor_base_attributes_approval_request.v1'
      || !exact(request, ['schema','version','status','candidate_ref',
        'subject_commit','candidate_digest','profile_digest','decision','scope',
        'requested_runtime_activation',
        'requested_equipment_allocation_activation','requested_import',
        'requested_activation','request_digest'])
      || request.version !== 1 || request.status !== 'approval_requested'
      || request.decision !== 'pending'
      || request.candidate_ref !== 'actor-base-attributes-v1/candidate.json'
      || request.scope !== 'ordinary NPC actor_base_attributes_v1 only'
      || request.subject_commit !== candidate.subject_commit
      || request.candidate_digest !== candidate.candidate_digest
      || request.profile_digest !== candidate.profile_digest
      || request.request_digest !== EXPECTED.request
      || request.request_digest !== canonicalRequestDigest(request)
      || request.requested_runtime_activation !== false
      || request.requested_equipment_allocation_activation !== false
      || request.requested_import !== false
      || request.requested_activation !== false) {
    throw new Error('ACTOR_BASE_ATTRIBUTES_PENDING_ARTIFACT_INVALID');
  }
  const approvedScope = {
    profile_id: candidate.profile.profile_id,
    algorithm_version: candidate.profile.algorithm_version,
    rng_version: candidate.profile.rng_version,
    attribute_keys: ACTOR_BASE_ATTRIBUTE_KEYS,
    ordinary_array: candidate.profile.ordinary_array,
    occupation_archetype_ids: candidate.profile
      .occupation_archetype_priorities.map(
        ({ occupation_archetype_id: id }) => id)
  };
  const sourceBindings = {
    task_attachment_sha256: EXPECTED.taskSource,
    character_parameters_sha256: EXPECTED.characterSource,
    occupation_tsv_sha256: EXPECTED.occupationSource
  };
  if (!exact(attestation, ['schema','version','status','decision',
    'reviewed_repository_head','candidate_subject_commit','candidate_ref',
    'approval_request_ref','request_digest','candidate_digest','profile_digest',
    'approved_scope','source_bindings','authority','activation_request',
    'auditor_ref','independence_basis','reviewed_at','attestation_digest'])
      || attestation.schema !==
        'rus.actor_base_attributes_authoring_approval_attestation.v1'
      || attestation.version !== 1
      || attestation.status !== 'approved_authoring_only'
      || attestation.decision !==
        'approve_actor_base_attributes_authoring_only'
      || attestation.reviewed_repository_head !== EXPECTED.reviewedHead
      || attestation.candidate_subject_commit !== candidate.subject_commit
      || attestation.candidate_ref !== candidateRef
      || attestation.approval_request_ref !== requestRef
      || attestation.request_digest !== request.request_digest
      || attestation.candidate_digest !== candidate.candidate_digest
      || attestation.profile_digest !== candidate.profile_digest
      || canonicalDigest(attestation.approved_scope) !==
        canonicalDigest(approvedScope)
      || canonicalDigest(attestation.source_bindings) !==
        canonicalDigest(sourceBindings)
      || canonicalDigest(attestation.authority) !== canonicalDigest(authority)
      || attestation.activation_request !== null
      || attestation.auditor_ref !== '/root/m3_chain_auditor'
      || typeof attestation.independence_basis !== 'string'
      || attestation.independence_basis.length === 0
      || attestation.reviewed_at !== '2026-09-21') {
    throw new Error('ACTOR_BASE_ATTRIBUTES_AUTHORING_ATTESTATION_INVALID');
  }
  const { attestation_digest: claimed, ...core } = attestation;
  if (claimed !== canonicalDigest(core)) {
    throw new Error('ACTOR_BASE_ATTRIBUTES_AUTHORING_ATTESTATION_DIGEST_INVALID');
  }
  return true;
}

function validateOccupationMappings(candidate, source) {
  const [header, ...lines] = source.trim().split(/\r?\n/u);
  const columns = header.split('\t');
  const occupationId = columns.indexOf('occupation_id');
  const archetypeId = columns.indexOf('occupation_archetype_id');
  const status = columns.indexOf('status');
  const actual = new Map();
  for (const line of lines) {
    const row = line.split('\t');
    if (row[status] !== 'approved') continue;
    const values = actual.get(row[archetypeId]) ?? [];
    values.push(row[occupationId]);
    actual.set(row[archetypeId], values);
  }
  for (const mapping of candidate.source_provenance.priority_mappings) {
    assert.deepEqual(mapping.occupation_ids,
      (actual.get(mapping.occupation_archetype_id) ?? []).sort());
  }
}

function exact(value, keys) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

async function readJson(name) {
  return JSON.parse(await readFile(resolve(root, name), 'utf8'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { candidate, request, attestation } =
    await loadActorBaseAttributesAuthoringArtifacts();
  assert.equal(candidate.profile_digest, canonicalDigest(candidate.profile));
  assert.equal(candidate.candidate_digest, canonicalCandidateDigest(candidate));
  console.log(JSON.stringify({ pass: true,
    profile_digest: candidate.profile_digest,
    candidate_digest: candidate.candidate_digest,
    request_digest: request.request_digest,
    attestation_digest: attestation.attestation_digest }));
}
