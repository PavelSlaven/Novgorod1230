import assert from 'node:assert/strict';
import { loadLowerDvinaTraceRevision32Publication, loadLowerDvinaTraceRevision33Publication } from
  '../src/internal/lower-dvina-trace-revision-32-publication.js';

export async function assertOpeningPublication({ fixture, createRuntime, release }) {
  const oldPublication = await loadLowerDvinaTraceRevision32Publication();
  const current = await loadLowerDvinaTraceRevision33Publication();
  assert.equal(current.definition.revision, 33);
  assert.equal(oldPublication.definition.revision, 32);
  assert.equal(current.scene_presentation.presentation_id,
    'lower_dvina_trace_scene_presentation_v3');
  assert.equal(oldPublication.scene_presentation.presentation_id,
    'lower_dvina_trace_scene_presentation_v2');
  assert.equal(current.manifest.superseded_package_ref.digest,
    oldPublication.manifest_digest);
  const previous = fixture({ publicationLoader: async () => oldPublication });
  const world = current.binding.world_compatibility;
  previous.release = { ...release,
    world_revision_id: world.production_world_revision_id,
    world_catalog_digest: world.production_world_catalog_digest };
  const request = { scenario_id: 'lower_dvina_trace_v1', request_id: 'v27-replay' };
  const started = await createRuntime(previous).startNewGame(request);
  previous.publicationLoader = async () => current;
  assert.deepEqual(await createRuntime(previous).startNewGame(request), started);
  assert.equal(previous.materializeCalls.length, 1);
  const fresh = fixture({ publicationLoader: async () => current });
  fresh.release = previous.release;
  const next = await createRuntime(fresh).startNewGame({ ...request,
    request_id: 'v28-start' });
  assert.equal(next.screen.main_prose,
    current.public_projection.opening_projection.opening_prose);
  assert.notEqual(next.screen.main_prose, started.screen.main_prose);
  assert.match(next.screen.main_prose, /^Вас зовут Микула\. Вы — младший приказчик,/u);
  for (const detail of ['сын разорившегося кожевника', 'купец Савва Твердич',
    'Нанятый лодочник Онисим', 'Путь оборвало крушение', 'вас знобит', 'Прежде всего надо бы согреться']) {
    assert.equal(next.screen.main_prose.includes(detail), true);
  }
  assert.doesNotMatch(started.screen.main_prose, /Вас зовут Микула/u);
  assert.equal(fresh.repository.sessions.get(next.party_id).stage26_result
    .publication_binding_revision, 28);
  assert.deepEqual((await createRuntime(fresh).getPartyScreen(next.party_id)).screen,
    next.screen);
}
