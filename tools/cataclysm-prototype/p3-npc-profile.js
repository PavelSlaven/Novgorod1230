import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PROFILES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)),
  'npc-profiles');

function invalid(message) {
  const error = new Error('P3_NPC_PROFILE_INVALID');
  error.code = 'P3_NPC_PROFILE_INVALID';
  error.detail = message;
  return error;
}

export async function loadP3NpcProfile(templateId, { profilesDir = DEFAULT_PROFILES_DIR } = {}) {
  if (typeof templateId !== 'string' || !/^[a-z0-9_]+$/u.test(templateId)) {
    throw invalid('template id');
  }
  let text;
  try {
    text = await readFile(path.join(profilesDir, `${templateId}.json`), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw invalid('unreadable');
  }
  let profile;
  try {
    profile = JSON.parse(text);
  } catch {
    throw invalid('json');
  }
  if (profile === null || typeof profile !== 'object' || Array.isArray(profile)
      || profile.template_id !== templateId) throw invalid('template_id');
  return profile;
}
