import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { validLowerDvinaTraceActionProductionProfile } from
  './lower-dvina-trace-a1-bundle.js';

const ROOT = 'data/world-catalogs/novgorod/lower-dvina-trace-v1/phase-m9-content';
const MANIFEST_DIGEST =
  '71ee4b062dfe17ebcb3647ffe65d0d9afd58bca3d8762fb3a9a51cb7962c049b';

export async function loadLowerDvinaTraceA1Profile({
  rootDir = process.cwd()
} = {}) {
  const [manifestRaw, profileRaw] = await Promise.all([
    readFile(resolve(rootDir, ROOT, 'manifest.json')),
    readFile(resolve(rootDir, ROOT, 'action-production-profile.json'))
  ]);
  const manifestDigest = hash(manifestRaw);
  const profileDigest = hash(profileRaw);
  const manifest = JSON.parse(manifestRaw);
  const profile = JSON.parse(profileRaw);
  const ref = manifest?.content_refs?.action_production_profile;
  if (manifestDigest !== MANIFEST_DIGEST
      || manifest.schema !== 'rus.lower_dvina_trace_m9_content_manifest.v1'
      || manifest.scenario_definition_revision !== 21
      || ref?.path !== 'action-production-profile.json'
      || ref.digest !== profileDigest || ref.id !== profile.profile_id
      || ref.revision !== profile.revision || ref.schema !== profile.schema
      || !validLowerDvinaTraceActionProductionProfile(profile)) {
    throw Object.assign(new Error('TRACE_A1_PROFILE_INVALID'), {
      code: 'TRACE_A1_PROFILE_INVALID'
    });
  }
  return freeze({ schema: 'rus.lower_dvina_trace_a1_loaded_profile.v1',
    artifact_digest: profileDigest, profile });
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
