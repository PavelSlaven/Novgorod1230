import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const candidate = JSON.parse(fs.readFileSync(path.join(here, 'candidate.json'), 'utf8'));
const sourceRecords = JSON.parse(fs.readFileSync(path.join(here, 'source-records.json'), 'utf8')).records;
const links = JSON.parse(fs.readFileSync(path.join(here, 'record-sources.json'), 'utf8')).records;
const attestation = JSON.parse(fs.readFileSync(path.join(here, 'independent-authoring-attestation.json'), 'utf8'));
const fail = message => { throw new Error(message); };
const sha256 = name => createHash('sha256').update(fs.readFileSync(path.join(here, name))).digest('hex');

if (candidate.status !== 'candidate_not_approved' || candidate.import_enabled || candidate.activation_enabled) fail('candidate must remain inactive');
if (candidate.coverage.social_position_count !== 30 || new Set(candidate.coverage.social_position_archetype_ids).size !== 30) fail('expected 30/30 positions');
if (candidate.coverage.role_count !== 71 || new Set(candidate.coverage.role_ids).size !== 71) fail('expected 71/71 roles');
if (candidate.names.some(row => !['A1', 'A2'].includes(row.evidence_grade) || row.status !== 'evidence_bound')) fail('compiled subset contains non-A1/A2 entry');
if (candidate.names.some(row => row.editorial_weight !== 1 || row.weight_basis !== 'editorial_equal_weight')) fail('weights must be explicit editorial equal weight');
if (candidate.names.some(row => !row.name_id || !row.canonical_tradition || !Array.isArray(row.variants) || !row.sex || !row.origin || !row.special_state || !row.valid_from || !row.valid_to || !row.limits)) fail('compiled entry incomplete');
if (candidate.names.some(row => !links.some(link => link.record_id === row.name_id && sourceRecords.some(source => source.source_id === link.source_id)))) fail('source binding missing');
if (candidate.names.some(row => row.variants.includes(row.canonical_tradition))) fail('canonical form duplicated as variant');
const allForms = candidate.names.flatMap(row => [row.canonical_tradition, ...row.variants]);
if (new Set(allForms).size !== allForms.length) fail('variant double-weighted across traditions');
for (const forbidden of ['Ростислав (Михаил)', 'Мстислав (Георгий)', 'Rolf', 'Марена', 'Милуша', 'Милослава', 'Онцифор', 'Ольга', 'Елена']) {
  if (candidate.names.some(row => row.canonical_tradition === forbidden || row.variants.includes(forbidden))) fail(`forbidden/pending entry compiled: ${forbidden}`);
}
if (!candidate.contextual_authoring_only.some(row => row.origin === 'baltic_west') || candidate.pools.baltic_west_contextual.length) fail('Baltic-West must remain authoring-only');
if (attestation.verdict !== 'APPROVE_AUTHORING_ONLY' || attestation.import_enabled || attestation.activation_enabled) fail('attestation must remain authoring-only');
for (const [field, file] of Object.entries({ candidate_sha256: 'candidate.json', approval_request_sha256: 'approval-request.json', source_authoring_sha256: 'source-authoring.json', source_records_sha256: 'source-records.json', record_sources_sha256: 'record-sources.json' })) {
  if (attestation[field] !== sha256(file)) fail(`attestation digest mismatch: ${file}`);
}
if (attestation.compiled_name_count !== candidate.names.length || attestation.source_record_count !== sourceRecords.length || attestation.record_source_count !== links.length || attestation.contextual_authoring_only_count !== candidate.contextual_authoring_only.length || attestation.excluded_count !== candidate.excluded.length) fail('attestation count mismatch');
console.log(`onomastic candidate valid: ${candidate.names.length} compiled names, 30/30 positions, 71/71 roles`);
