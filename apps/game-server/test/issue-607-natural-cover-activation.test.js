import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(testDir, '../../..');
const runtimeData = 'data/world-catalogs/novgorod/live-world-runtime-v17';
const candidateRelative = `${runtimeData}/natural-source-stable-cover-candidate.json`;
const approvalRelative = `${runtimeData}/natural-source-stable-cover-approval.json`;
const activationRelative = `${runtimeData}/natural-source-stable-cover-runtime-activation-approval.json`;
const readerRelative = 'apps/game-server/src/infrastructure/postgres/g4-natural-perception-reader.js';
const candidateBytes = readFileSync(join(repoRoot, candidateRelative));
const coverCandidate = JSON.parse(candidateBytes);
const coverApproval = JSON.parse(readFileSync(join(repoRoot, approvalRelative), 'utf8'));
const naturalCandidate = JSON.parse(readFileSync(join(repoRoot, 'data/world-catalogs/novgorod/m2c-natural/candidate.json'), 'utf8'));
const knownProfile = naturalCandidate.natural_profiles.find((profile) =>
  profile.profile_id === 'm2c_natural_g4_central_current_split');
const expectedCandidateSha = '5b2fc71f25042e64ea5de8b3256caa33f264baeac4712af49207982a7f1ae41b';
const activationRecord = ({ authorized = true, subject = coverCandidate.candidate_id,
  candidateSha = expectedCandidateSha } = {}) => ({
  schema: 'rus.live_world_runtime.natural_source_stable_cover_runtime_activation_approval.v1',
  decision: 'ACTIVATE',
  decided_by: 'isolated proof fixture for the fixc2-09 PLAN-OK decision',
  subject,
  candidate_sha256: candidateSha,
  runtime_activation_authorized: authorized,
  limits: 'Proof-only fixture; no import, PostgreSQL readback, runtime or release activation.',
});
const typedGap = (error) => {
  assert.equal(error.code, 'NATURAL_SCENE_PERCEPTION_DATA_GAP');
  assert.equal(error.details.reason, 'approved_natural_stable_cover_required');
  return true;
};

function makeCaseCopy(caseName) {
  const tempRoot = mkdtempSync(join(repoRoot, '.issue-607-proof-'));
  cpSync(join(repoRoot, 'apps/game-server/src'), join(tempRoot, 'apps/game-server/src'), { recursive: true });
  for (const relative of [candidateRelative, approvalRelative,
    'data/world-catalogs/novgorod/m2c-natural/candidate.json',
    'data/world-catalogs/novgorod/m2c-place-labels/approved-labels.mjs',
    'data/world-catalogs/novgorod/m2c-pass-target-labels/approved-labels.mjs',
    'data/world-catalogs/novgorod/m2c-pass-target-labels/candidate.json']) {
    const source = join(repoRoot, relative);
    const target = join(tempRoot, relative);
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target);
  }
  if (caseName !== 'missing') {
    const record = caseName === 'false' ? activationRecord({ authorized: false })
      : caseName === 'wrong-subject' ? activationRecord({ subject: 'another_candidate' })
        : caseName === 'wrong-hash' ? activationRecord({ candidateSha: '0'.repeat(64) })
          : activationRecord();
    const target = join(tempRoot, activationRelative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(record, null, 2)}\n`);
  }
  return { tempRoot, readerUrl: pathToFileURL(join(tempRoot, readerRelative)).href };
}

test('issue #607: runtime activation gate covers the full authority matrix', async (t) => {
  assert.ok(knownProfile, 'candidate contains central_current_split');
  assert.equal(coverCandidate.candidate_id, 'novgorod_natural_source_stable_cover_v1');
  assert.equal(createHash('sha256').update(candidateBytes).digest('hex'), expectedCandidateSha);
  assert.equal(coverApproval.decision, 'APPROVE_DATA_ONLY');
  assert.equal(coverApproval.runtime_activation_authorized, false);

  const cases = [
    ['exact active record returns known cover', 'active'],
    ['missing record is a typed gap', 'missing'],
    ['false runtime flag is a typed gap', 'false'],
    ['wrong subject is a typed gap', 'wrong-subject'],
    ['wrong candidate SHA is a typed gap', 'wrong-hash'],
    ['unknown profile remains a typed gap', 'unknown'],
  ];
  for (const [name, caseName] of cases) {
    await t.test(name, async () => {
      const { tempRoot, readerUrl } = makeCaseCopy(caseName);
      try {
        const { approvedNaturalStableCover } = await import(readerUrl);
        if (caseName === 'active') {
          const record = JSON.parse(readFileSync(join(tempRoot, activationRelative), 'utf8'));
          assert.equal(record.subject, coverCandidate.candidate_id);
          assert.equal(record.candidate_sha256, expectedCandidateSha);
          assert.equal(record.runtime_activation_authorized, true);
          assert.equal(approvedNaturalStableCover(knownProfile), 'partial');
        } else if (caseName === 'missing') {
          assert.equal(existsSync(join(tempRoot, activationRelative)), false);
          assert.throws(() => approvedNaturalStableCover(knownProfile), typedGap);
        } else if (caseName === 'false') {
          const record = JSON.parse(readFileSync(join(tempRoot, activationRelative), 'utf8'));
          assert.equal(record.runtime_activation_authorized, false);
          assert.throws(() => approvedNaturalStableCover(knownProfile), typedGap);
        } else if (caseName === 'wrong-subject') {
          const record = JSON.parse(readFileSync(join(tempRoot, activationRelative), 'utf8'));
          assert.notEqual(record.subject, coverCandidate.candidate_id);
          assert.throws(() => approvedNaturalStableCover(knownProfile), typedGap);
        } else if (caseName === 'wrong-hash') {
          const record = JSON.parse(readFileSync(join(tempRoot, activationRelative), 'utf8'));
          assert.notEqual(record.candidate_sha256, expectedCandidateSha);
          assert.throws(() => approvedNaturalStableCover(knownProfile), typedGap);
        } else {
          assert.throws(() => approvedNaturalStableCover({ ...knownProfile,
            profile_id: 'unknown-natural-profile' }), typedGap);
        }
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });
  }
});
