import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyTonsure, AUTHORING_ATTESTATION, eligible, identityProjection, selectBySeed } from './generator.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const candidate = JSON.parse(fs.readFileSync(path.join(here, 'candidate.json'), 'utf8'));
const attestationBytes = fs.readFileSync(path.join(here, 'independent-authoring-attestation.json'), 'utf8');
const base = { origin: 'novgorod_rus', sex: 'male', dynastic_state: false, monastic_state: false };

assert.equal(selectBySeed(candidate, base, 17), selectBySeed(candidate, { ...base, occupation: 'fisher' }, 17));
assert.equal(selectBySeed(candidate, base, 17), selectBySeed(candidate, { ...base, occupation: 'boyar' }, 17));
assert.deepEqual(eligible(candidate, { ...base, monastic_state: true }), candidate.pools.monastic_male);
assert.deepEqual(eligible(candidate, { ...base, dynastic_state: true }), candidate.pools.dynastic_male);
assert.throws(() => selectBySeed(candidate, { ...base, sex: 'female', dynastic_state: true }, 1), error => error.code === 'ONOMASTIC_CANDIDATE_GAP');
assert.throws(() => eligible(candidate, { ...base, origin: 'karelian' }), error => error.code === 'ONOMASTIC_ORIGIN_GAP');
assert.throws(() => selectBySeed(candidate, { ...base, origin: 'baltic_west' }, 1), error => error.code === 'ONOMASTIC_CANDIDATE_GAP');

const identity = { current_name: 'Иван', father_relation: { status: 'committed', patronymic: 'Семёнович' } };
assert.deepEqual(identityProjection(identity, []), { name: 'Иван' });
assert.deepEqual(identityProjection(identity, ['patronymic']), { name: 'Иван', patronymic: 'Семёнович' });
assert.deepEqual(identityProjection({ current_name: 'Иван' }, ['patronymic']), { name: 'Иван' });
assert.deepEqual(applyTonsure(identity, 'Спиридон').prior_names, ['Иван']);

const serialized = JSON.stringify(candidate);
assert(!serialized.includes('novgorod_npc_name_pools_v1.json"'));
assert.equal(attestationBytes, `${JSON.stringify(AUTHORING_ATTESTATION, null, 2)}\n`);
console.log('onomastic candidate policy tests passed');
