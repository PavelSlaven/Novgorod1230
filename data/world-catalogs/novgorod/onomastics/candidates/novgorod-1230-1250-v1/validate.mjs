import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const candidate = JSON.parse(fs.readFileSync(path.join(here, 'candidate.json'), 'utf8'));
const sourceRecords = JSON.parse(fs.readFileSync(path.join(here, 'source-records.json'), 'utf8')).records;
const links = JSON.parse(fs.readFileSync(path.join(here, 'record-sources.json'), 'utf8')).records;
const fail = message => { throw new Error(message); };

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
console.log(`onomastic candidate valid: ${candidate.names.length} compiled names, 30/30 positions, 71/71 roles`);
