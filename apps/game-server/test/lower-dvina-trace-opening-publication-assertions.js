import assert from 'node:assert/strict';
import { loadLowerDvinaTraceRevision32Publication } from
  '../src/internal/lower-dvina-trace-revision-32-publication.js';

export async function assertOpeningPublication({ fixture, createRuntime, release }) {
  const oldPublication = await loadLowerDvinaTraceRevision32Publication();
  const current = await loadLowerDvinaTraceRevision32Publication({
    publicationRevision: 28 });
  assert.equal(current.definition.revision, oldPublication.definition.revision);
  assert.equal(current.scene_presentation.presentation_id,
    oldPublication.scene_presentation.presentation_id);
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
  assert.equal(fresh.repository.sessions.get(next.party_id).stage26_result
    .publication_binding_revision, 28);
  assert.deepEqual((await createRuntime(fresh).getPartyScreen(next.party_id)).screen,
    next.screen);
}
