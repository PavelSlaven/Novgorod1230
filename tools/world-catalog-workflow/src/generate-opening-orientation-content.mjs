import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

// Editorial refresh of the current unpublished successor; historical prose stays pinned.
const root = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const bindingPath = `${root}/phase-1b-v28/publication-binding.json`;
const manifestPath = `${root}/phase-1b-v28/manifest.json`;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const write = async (path, value) => {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(path, bytes);
  return digest(bytes);
};
const before = await Promise.all([bindingPath, manifestPath].map(async path => digest(await readFile(path))));
const binding = await read(bindingPath);
const profile = await read(`${root}/phase-m7-content/player-profile.json`);
// Identity and work come from this profile; the inherited Phase-1A v7 dossier
// goals provide recovery after the wreck and the danger of hypothermia.
if (profile.profile_id !== 'lower_dvina_trace_player_profile_mikula_v1' || profile.revision !== 2
    || profile.name_candidates.length !== 1) throw new Error('Opening player profile is not the approved source');
binding.opening_projection.projection_id = 'lower_dvina_trace_phase_1b_opening_projection_v17';
binding.opening_projection.opening_prose = `Вас зовут ${profile.name_candidates[0].display_name}. Вы ${profile.role.display_name}: в торговых поездках помогаете старшим со счётом товара и простыми записями.

Теперь вы приходите в себя на берегу Нижней Двины после крушения. Одежда промокла; вас знобит, голова болит, плечо ушиблено. Сначала бы согреться и прийти в себя.

Под низким сырым небом вдоль реки тянутся мокрый песок и ивняк. У воды лежат разбитые доски и обрывки снастей, тянется полоса камыша и осоки; среди обломков — вынесенные течением ветви.`;
const bindingDigest = await write(bindingPath, binding);
const manifest = await read(manifestPath);
manifest.content_refs.publication_binding.digest = bindingDigest;
const manifestDigest = await write(manifestPath, manifest);
for (const file of [
  'apps/game-server/src/internal/lower-dvina-trace-revision-32-publication.js',
  'apps/game-server/src/internal/lower-dvina-trace-phase-1b-identities.js',
  'apps/game-server/src/composition/production-spatial-v3-release.js',
  'apps/game-server/src/runtime/releases/spatial-v3-production-v15-bindings.js',
  'test/spatial-v3/pr8-production-v3-composition.test.js'
]) {
  let source = await readFile(file, 'utf8');
  for (const [index, value] of [bindingDigest, manifestDigest].entries()) source = source.replaceAll(before[index], value);
  await writeFile(file, source);
}
console.log('Current opening orientation and exact publication consumers refreshed.');
