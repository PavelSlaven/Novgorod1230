import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT =
  'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m10-content';
const MANIFEST_DIGEST =
  'ff8b46488392011d03965ea5b815f7fbb0e794370c42b46dd3aaf755c3bd40c8';

export async function loadLowerDvinaTraceLocalFireProfile({
  rootDir = process.cwd()
} = {}) {
  const [manifestRaw, profileRaw] = await Promise.all([
    readFile(resolve(rootDir, ROOT, 'manifest.json')),
    readFile(resolve(rootDir, ROOT, 'local-fire-profile.json'))
  ]);
  const manifest = JSON.parse(manifestRaw);
  const profile = JSON.parse(profileRaw);
  const profileDigest = hash(profileRaw);
  const ref = manifest?.content_refs?.local_fire_profile;
  if (hash(manifestRaw) !== MANIFEST_DIGEST
      || manifest.schema !== 'rus.lower_dvina_trace_m10_content_manifest.v1'
      || manifest.scenario_definition_revision !== 22
      || ref?.path !== 'local-fire-profile.json'
      || ref.digest !== profileDigest || ref.id !== profile.profile_id
      || ref.revision !== profile.revision || ref.schema !== profile.schema
      || profile?.schema !== 'rus.lower_dvina_trace_local_fire_profile.v1'
      || profile.status !== 'approved' || profile.revision !== 1) {
    throw Object.assign(new Error('TRACE_LOCAL_FIRE_PROFILE_INVALID'), {
      code: 'TRACE_LOCAL_FIRE_PROFILE_INVALID'
    });
  }
  return freeze({ schema: 'rus.lower_dvina_trace_f1_loaded_profile.v1',
    artifact_digest: profileDigest, profile });
}
function hash(value) { return createHash('sha256').update(value).digest('hex'); }
function freeze(value) { if (value && typeof value === 'object'
    && !Object.isFrozen(value)) { Object.values(value).forEach(freeze);
  Object.freeze(value); } return value; }
