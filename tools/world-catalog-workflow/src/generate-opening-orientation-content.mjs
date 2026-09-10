import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

// Editorial refresh of the current unpublished successor; historical prose stays pinned.
const root = 'data/world-catalogs/novgorod/lower-dvina-trace-v1';
const bindingPath = `${root}/phase-1b-v28/publication-binding.json`;
const manifestPath = `${root}/phase-1b-v28/manifest.json`;
const dossierPath = `${root}/phase-1a-v24/materialization-bindings.json`;
const materializationManifestPath = `${root}/phase-1a-v24/manifest.json`;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const write = async (path, value) => {
  const bytes = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(path, bytes);
  return digest(bytes);
};
const paths = [bindingPath, manifestPath, dossierPath, materializationManifestPath];
const before = await Promise.all(paths.map(async path => digest(await readFile(path))));
const binding = await read(bindingPath);
const profile = await read(`${root}/phase-m7-content/player-profile.json`);
// Identity and work come from this profile; the inherited Phase-1A v7 dossier
// goals provide recovery after the wreck and the danger of hypothermia.
if (profile.profile_id !== 'lower_dvina_trace_player_profile_mikula_v1' || profile.revision !== 2
    || profile.name_candidates.length !== 1) throw new Error('Opening player profile is not the approved source');
const materialization = await read(dossierPath);
const inherited = await read(`${root}/phase-1a-v7/materialization-bindings.json`);
const dossier = structuredClone(inherited.player_dossier_projection);
dossier.origin = { biography: 'Вы — сын разорившегося кожевника. В семье вы помогали с сырьём и товаром, участвовали в погрузке и выполняли хозяйственные поручения. Ремесло отца вам знакомо, но самостоятельным мастером вы не стали. После разорения отцовского дела вы зарабатываете, помогая торговым людям.' };
dossier.memory = { records: [
  { id: 'trace_ld_v1_player_trade_experience', knowledge_state: 'known',
    category: 'own_experience', source_class: 'own_action',
    text: 'Вы сопровождали старших в торговых поездках: следили за счётом товара, различали владельческие знаки, переписывали простые записи и выполняли поручения.' },
  { id: 'trace_ld_v1_player_boat_journey', knowledge_state: 'known',
    category: 'own_experience', source_class: 'prior_admitted_perception_or_message',
    text: 'В нынешней поездке нанятый лодочник Онисим вёз вас и порученное имущество по реке. Вы помните его по совместной поездке. Путь оборвало крушение; вы пришли в себя на берегу Нижней Двины.' }
] };
dossier.knowledge.initial_records = [
  { id: 'trace_ld_v1_player_received_assignment', knowledge_state: 'known',
    category: 'received_instruction', source_class: 'received_instruction',
    text: 'В нынешнюю торговую поездку вас отправил купец Савва Твердич. Вы выполняли его поручение, сопровождая доверенное вам имущество.' }
];
dossier.relations = [
  { relation_mode: 'abstract_background_relation',
    external_owner_ref: 'trace_ld_v1_external_owner_savva_tverdich',
    display_name: 'Савва Твердич', relation: 'купец, давший нынешнее поручение' },
  { npc_candidate_id: 'onisim_boatman', display_name: 'Онисим',
    relation: 'нанятый лодочник в нынешней поездке',
    recognition_basis: 'prior_admitted_perception', knowledge_state: 'known' }
];
dossier.start_place_connection.reason = 'Вы ехали по реке с нанятым лодочником Онисимом, выполняя поручение купца Саввы Твердича. После крушения лодки вы пришли в себя на берегу Нижней Двины.';
dossier.approved_empty_collections = dossier.approved_empty_collections.filter(value => value !== 'relations');
dossier.source_refs.participant_profiles = 'trace_ld_v1_participant_profile_set';
dossier.source_refs.external_owner = 'trace_ld_v1_external_owner_savva_tverdich';
dossier.audit_self_check.evidence = [materialization.binding_set_id,
  profile.profile_id, dossier.source_refs.participant_profiles];
materialization.player_dossier_projection = dossier;
const dossierDigest = await write(dossierPath, materialization);
const materializationManifest = await read(materializationManifestPath);
materializationManifest.content_refs.materialization_bindings.digest = dossierDigest;
const materializationDigest = await write(materializationManifestPath, materializationManifest);
binding.phase_1a_manifest_ref.digest = materializationDigest;
binding.execution_identity.phase_1a_manifest_digest = materializationDigest;
binding.opening_projection.projection_id = 'lower_dvina_trace_phase_1b_opening_projection_v18';
binding.opening_projection.opening_prose = `Вас зовут ${profile.name_candidates[0].display_name}. Вы — ${profile.role.display_name}, сын разорившегося кожевника. Ремесло отца вам знакомо: в семье вы помогали с сырьём и товаром, участвовали в погрузке, выполняли хозяйственные поручения. Самостоятельным мастером вы не стали. Когда отцовское дело разорилось, пришлось искать заработок у торговых людей. Теперь вы сопровождаете старших в поездках, следите за счётом товара, различаете владельческие знаки и переписываете простые записи.

В эту поездку вас отправил купец Савва Твердич. Нанятый лодочник Онисим вёз вас и порученное имущество по реке. Путь оборвало крушение.

Вы приходите в себя на берегу Нижней Двины. Одежда промокла насквозь, вас знобит. Голова отзывается тупой болью, ушибленное плечо ноет. Прежде всего надо бы согреться. А дальше — решить, что делать.

Над рекой висит низкое сырое небо. Вдоль берега тянется мокрый песок, за ним темнеет ивняк. У самой воды разбросаны разбитые доски и обрывки снастей. Полоса камыша и осоки уходит вдоль берега; среди обломков лежат ветви, вынесенные сюда течением.`;
const bindingDigest = await write(bindingPath, binding);
const manifest = await read(manifestPath);
manifest.content_refs.publication_binding.digest = bindingDigest;
const manifestDigest = await write(manifestPath, manifest);
for (const file of [
  'packages/materialization/src/lower-dvina-trace-phase-1a-validation.js',
  'apps/game-server/src/internal/lower-dvina-trace-revision-33-bundle.js',
  'apps/game-server/src/internal/lower-dvina-trace-revision-32-publication.js',
  'apps/game-server/src/internal/lower-dvina-trace-phase-1b-identities.js',
  'apps/game-server/src/composition/production-spatial-v3-release.js',
  'apps/game-server/src/runtime/releases/spatial-v3-production-v15-bindings.js',
  'test/spatial-v3/pr8-production-v3-composition.test.js'
]) {
  let source = await readFile(file, 'utf8');
  for (const [index, value] of [bindingDigest, manifestDigest, dossierDigest, materializationDigest].entries()) source = source.replaceAll(before[index], value);
  await writeFile(file, source);
}
console.log('Current opening orientation and exact publication consumers refreshed.');
