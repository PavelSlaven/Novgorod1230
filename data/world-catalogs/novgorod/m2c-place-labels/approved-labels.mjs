import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { stableStringify } from '@rus/kernel';

const read = (path) => readFileSync(new URL(path, import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const stableHash = (value) => hash(stableStringify(value));
const g5Key = (ref) => `${ref.id}@${ref.version}`;
const validRef = (ref) => typeof ref?.id === 'string' && ref.id.trim()
  && Number.isSafeInteger(ref.version) && ref.version >= 1;
const NATURAL_SOURCE_PATH = 'data/world-catalogs/novgorod/m2c-natural/candidate.json';
const NATURAL_SUCCESSOR_PATH = 'data/world-catalogs/novgorod/m2c-natural/nature-successor-candidate-v2.json';
const APPROVED_NATURAL_SUCCESSOR_SHA256 =
  '3fc9f2e539dcb5d5e1f52e49100044f19d5810316f2798c6993936f45bc379ea';
const APPROVED_NATURAL_SUCCESSOR_IDENTITY_SHA256 =
  '68c61cb44dffa6a70bbb9e08b6b9ecab9a3dd7cd7be0f7e2ea1106576646f700';
const APPROVED_NATURAL_CANDIDATE_ID = 'novgorod_m2c_natural_baseline_g4_v1';
const APPROVED_NATURAL_SUCCESSOR_ID = 'novgorod_m2c_natural_baseline_g4_v2';
let successorDiagnosticLogged = false;
let approvedLabelsCache = null;
const LABEL_FILES = [
  ['./candidate.json', true],
  ['./approval-attestation.json', true],
  ['../m2c-natural/candidate.json', false],
  ['../m2c-natural/nature-successor-candidate-v2.json', false],
  ['../m2c-natural/nature-successor-data-approval.json', false]
];
const readLabelSources = () => {
  const candidateBytes = read(LABEL_FILES[0][0]);
  const approvalBytes = read(LABEL_FILES[1][0]);
  const approval = JSON.parse(approvalBytes);
  const sources = [candidateBytes, approvalBytes];
  for (const [path] of LABEL_FILES.slice(2)) sources.push(readOptional(path));
  const signature = createHash('sha256');
  for (const [index, [path]] of LABEL_FILES.entries()) {
    const bytes = sources[index];
    signature.update(path).update('\0');
    if (bytes == null) signature.update('missing\0');
    else signature.update('present\0').update(String(bytes.length)).update('\0').update(bytes);
  }
  return { signature: signature.digest('hex'), sources, approval };
};
const copyLabels = (labels) => {
  const copy = new Map([...labels].map(([key, row]) => [key, structuredClone(row)]));
  Object.defineProperty(copy, 'diagnostics', {
    value: Object.freeze(labels.diagnostics.map((diagnostic) => Object.freeze(structuredClone(diagnostic)))),
    enumerable: false
  });
  return copy;
};
const logSuccessorDiagnostic = (labels) => {
  if (labels.diagnostics.length && !successorDiagnosticLogged) {
    console.warn('[PLACE_LABEL_SUCCESSOR_LINEAGE_UNVERIFIED] Natural successor labels unavailable.');
    successorDiagnosticLogged = true;
  }
};
const naturalKey = (ref) => {
  if (!validRef(ref?.natural_profile_ref) || !validRef(ref?.scene_template_ref)) return null;
  return `natural:${g5Key(ref.natural_profile_ref)}|${g5Key(ref.scene_template_ref)}`;
};
const candidateKey = (row) => {
  const hasG5 = row?.canonical_g5_ref != null;
  const hasNatural = row?.natural_place_ref != null;
  if (hasG5 === hasNatural) return null;
  if (hasG5 && validRef(row.canonical_g5_ref)) return g5Key(row.canonical_g5_ref);
  if (hasNatural) return naturalKey(row.natural_place_ref);
  return null;
};
const approvalKey = (row) => {
  const hasG5 = row?.canonical_g5_id != null || row?.canonical_g5_version != null;
  const hasNatural = row?.natural_place_ref != null;
  if (hasG5 === hasNatural) return null;
  if (hasG5 && typeof row.canonical_g5_id === 'string' && row.canonical_g5_id.trim()
    && Number.isSafeInteger(row.canonical_g5_version) && row.canonical_g5_version >= 1) {
    return `${row.canonical_g5_id}@${row.canonical_g5_version}`;
  }
  return hasNatural ? naturalKey(row.natural_place_ref) : null;
};

export function loadApprovedPlaceLabels() {
  try {
    const { signature, sources, approval } = readLabelSources();
    if (approvedLabelsCache?.signature === signature) {
      logSuccessorDiagnostic(approvedLabelsCache.labels);
      return copyLabels(approvedLabelsCache.labels);
    }
    approvedLabelsCache = null;
    const labels = approvedPlaceLabelsWithNaturalSuccessors(sources[0], approval, {
        naturalCandidateBytes: sources[2],
        successorCandidateBytes: sources[3],
        successorApproval: parseOptionalJson(sources[4])
      });
    if (!(labels instanceof Map)) return null;
    logSuccessorDiagnostic(labels);
    approvedLabelsCache = { signature, labels };
    return copyLabels(labels);
  } catch (error) {
    if (error.code === 'ENOENT' || error instanceof SyntaxError) return null;
    throw error;
  }
}

export function approvedPlaceLabelsWithNaturalSuccessors(candidateBytes, approval,
  { naturalCandidateBytes, successorCandidateBytes, successorApproval } = {}) {
  const labels = approvedPlaceLabelsFromAttestation(candidateBytes, approval);
  if (!(labels instanceof Map)) return null;
  const diagnostics = [];
  const aliases = approvedNaturalSuccessorAliases(labels, {
    naturalCandidateBytes, successorCandidateBytes, successorApproval
  });
  if (aliases == null) diagnostics.push(Object.freeze({
    code: 'natural_successor_lineage_unverified'
  }));
  else for (const [key, value] of aliases) labels.set(key, value);
  Object.defineProperty(labels, 'diagnostics', {
    value: Object.freeze(diagnostics), enumerable: false
  });
  return labels;
}

export function naturalSuccessorIdentitySha256(candidateBytes) {
  const candidate = parseJson(candidateBytes);
  if (candidate == null || !Array.isArray(candidate.natural_profiles)) return null;
  const identity = {
    candidate_id: candidate.candidate_id,
    version: candidate.version,
    source_pins: candidate.source_pins,
    natural_profiles: candidate.natural_profiles.map((profile) => ({
      profile_id: profile.profile_id,
      profile_version: profile.profile_version,
      g4_ref: profile.g4_ref,
      exact_scene_features: profile.exact_scene_features,
      template_refs: profile.template_refs
    }))
  };
  return stableHash(identity);
}

function approvedNaturalSuccessorAliases(labels, {
  naturalCandidateBytes, successorCandidateBytes, successorApproval
} = {}) {
  const natural = parseJson(naturalCandidateBytes);
  const successor = parseJson(successorCandidateBytes);
  if (natural == null || successor == null
    || hash(naturalCandidateBytes) !== successor.source_pins?.natural?.sha256
    || successor.source_pins?.natural?.path !== NATURAL_SOURCE_PATH
    || successor.candidate_id !== APPROVED_NATURAL_SUCCESSOR_ID || successor.version !== 2
    || successorApproval?.decision !== 'APPROVE_AUTHORING_DATA_ONLY'
    || successorApproval.candidates?.natural?.path !== NATURAL_SUCCESSOR_PATH
    || successorApproval.candidates?.natural?.sha256 !== APPROVED_NATURAL_SUCCESSOR_SHA256
    || natural.candidate_id !== APPROVED_NATURAL_CANDIDATE_ID || natural.version !== 1
    || naturalSuccessorIdentitySha256(successorCandidateBytes)
      !== APPROVED_NATURAL_SUCCESSOR_IDENTITY_SHA256) return null;

  const sourceProfiles = uniqueProfiles(natural.natural_profiles, 1);
  const successorProfiles = uniqueProfiles(successor.natural_profiles, 2);
  if (sourceProfiles == null || successorProfiles == null
    || sourceProfiles.size !== successorProfiles.size) return null;
  for (const [profileId, profile] of successorProfiles) {
    const source = sourceProfiles.get(profileId);
    if (source == null || stableHash(source.g4_ref) !== stableHash(profile.g4_ref)) return null;
  }

  const aliases = new Map();
  for (const row of labels.values()) {
    const ref = row?.natural_place_ref;
    if (ref == null) continue;
    const profile = ref.natural_profile_ref;
    const template = ref.scene_template_ref;
    if (!validRef(profile) || profile.version !== 1 || !validRef(template)
      || sourceProfiles.get(profile.id) == null || successorProfiles.get(profile.id) == null) {
      return null;
    }
    const key = `natural:${profile.id}@2|${g5Key(template)}`;
    if (labels.has(key) || aliases.has(key)) return null;
    aliases.set(key, { ...row, natural_place_ref: {
      ...ref, natural_profile_ref: { id: profile.id, version: 2 }
    } });
  }
  return aliases;
}

function uniqueProfiles(profiles, version) {
  if (!Array.isArray(profiles)) return null;
  const result = new Map();
  for (const profile of profiles) {
    if (typeof profile?.profile_id !== 'string' || profile.profile_version !== version
      || !profile.g4_ref || result.has(profile.profile_id)) return null;
    result.set(profile.profile_id, profile);
  }
  return result;
}

function parseJson(bytes) {
  if (bytes == null) return null;
  try { return JSON.parse(bytes); } catch { return null; }
}

function parseOptionalJson(bytes) { return parseJson(bytes); }

function readOptional(path) {
  try { return read(path); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export function approvedPlaceLabelsFromAttestation(candidateBytes, approval) {
  let candidate;
  try { candidate = JSON.parse(candidateBytes); } catch { return null; }
  if (approval?.decision !== 'APPROVE_DATA_ONLY'
    || approval.decision_ref !== candidate?.decision_reference?.id
    || JSON.stringify(approval.decision_refs) !== JSON.stringify(candidate?.decision_references)
    || JSON.stringify(approval.natural_label_decision_refs)
      !== JSON.stringify(candidate?.natural_label_decision_references)
    || approval.candidate_ref !== `${candidate?.candidate_id}@${candidate?.version}`
    || approval.candidate_sha256 !== hash(candidateBytes)
    || candidate?.status !== 'candidate_approval_pending'
    || candidate?.approved !== false || candidate?.activation_authorized !== false
    || !Array.isArray(candidate?.labels) || !Array.isArray(approval.approved_rows)
    || approval.approved_rows.length !== candidate.labels.length) return null;

  const candidates = new Map();
  for (const row of candidate.labels) {
    const key = candidateKey(row);
    const isG5 = row?.canonical_g5_ref != null;
    const validDecisionBasis = isG5
      ? row.decision_ref === candidate.decision_reference.id
        && row.approval_basis == null
      : row.approval_basis === 'approved_natural_label_source'
        && Array.isArray(candidate.natural_label_decision_references)
        && candidate.natural_label_decision_references.length > 0;
    if (!key || row.status !== 'candidate_approval_pending' || !validDecisionBasis
      || typeof row.display_label !== 'string' || !row.display_label.trim()) return null;
    if (candidates.has(key)) return null;
    candidates.set(key, row);
  }

  const approved = new Map();
  for (const row of approval.approved_rows) {
    const key = approvalKey(row);
    if (!key || typeof row.display_label !== 'string') return null;
    const candidateRow = candidates.get(key);
    if (!candidateRow || candidateRow.display_label !== row.display_label || approved.has(key)) return null;
    approved.set(key, candidateRow);
  }
  if (approved.size !== candidates.size) return null;
  return approved;
}
