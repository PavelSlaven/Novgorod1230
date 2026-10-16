import assert from 'node:assert/strict';
import test from 'node:test';
import { approvedNaturalPerceptionFixture } from './g4-natural-perception-fixture.js';
import { prepareG4NaturalScenePerceptionInput } from
  '../src/runtime/g4-natural-perception.js';
import { projectSpatialV3CurrentVisibleContext } from
  '../src/runtime/spatial-v3-current-visible-context.js';
import { projectVisibleContextForPlayerPackage } from
  '../src/runtime/lower-dvina-trace-player-safe-visible-context.js';
import { stripPublicInternals } from
  '../src/infrastructure/postgres/lower-dvina-trace-public-projection-filter.js';
import { successEnvelope } from '../src/http/contracts.js';

test('ожидаемо красный, issue #330: serialized public visible context omits internal entity IDs',
  async (t) => {
    const { input } = await approvedNaturalPerceptionFixture();
    const naturalInput = prepareG4NaturalScenePerceptionInput(input);
    const shared = { naturalInput, partyId: naturalInput.observer.party_id,
      actorId: naturalInput.observer.actor_id, positionId: naturalInput.observer.position_id,
      entityObservations: [], localEdges: [], directionalExits: [], siteConnections: [] };
    const cases = [
      { name: 'item', id: 'item:internal-issue-330', kind: 'item',
        select: (context) => context.visible_objects[0],
        patch: { entityObservations: [{ entity_kind: 'item',
          entity_id: 'item:internal-issue-330', visibility: 'clear',
          display_label: 'клочок шерсти', display_name: 'клочок шерсти',
          exterior: { condition_state: 'у берега' } }] } },
      { name: 'NPC', id: 'npc:internal-issue-330', kind: 'npc',
        select: (context) => context.visible_npc[0],
        patch: { entityObservations: [{ entity_kind: 'npc',
          entity_id: 'npc:internal-issue-330', visibility: 'clear',
          display_label: 'Еремей', display_name: 'Еремей',
          exterior: { sex_category: 'male', age_category: 'adult',
            appearance: { build: 'thin' }, visible_equipment: [] } }] } },
      { name: 'local edge', id: 'edge:internal-issue-330', kind: 'scene_movement_edge',
        select: (context) => context.visible_objects[0],
        patch: { localEdges: [{ edge_id: 'edge:internal-issue-330',
          display_label: 'проход во двор' }] } },
      { name: 'G4 exit', id: 'exit:internal-issue-330', kind: 'g4_directional_exit',
        select: (context) => context.visible_objects[0],
        patch: { directionalExits: [{ directional_exit_id: 'exit:internal-issue-330',
          display_label: 'тропа к реке' }] } },
      { name: 'G5 connection', id: 'binding:internal-issue-330', kind: 'g5_site_connection',
        select: (context) => context.visible_objects[0],
        patch: { siteConnections: [{ connection_binding_id: 'binding:internal-issue-330',
          display_label: 'проход к пристани' }] } }
    ];

    for (const entry of cases) {
      await t.test(entry.name, () => {
        const current = projectSpatialV3CurrentVisibleContext({ ...shared, ...entry.patch });
        const playerContext = projectVisibleContextForPlayerPackage(current,
          { requireScene: true }).visible_context;
        const response = JSON.parse(JSON.stringify(successEnvelope(stripPublicInternals({
          visible_context: playerContext
        }))));
        const path = entry.kind === 'npc'
          ? 'visible_context.visible_npc[0]' : 'visible_context.visible_objects[0]';
        const row = entry.select(response.data.visible_context);
        assert.ok(row && typeof row === 'object',
          `${path} must survive public projection`);
        assert.match(row?.display_label ?? '', /\S/u,
          `${path}.display_label must retain a player-safe label`);
        if (entry.kind === 'npc') {
          assert.ok(Object.keys(row.observable_cues ?? {}).length > 0,
            `${path}.observable_cues must retain visible NPC cues`);
        }
        const leaksInternalId = Object.hasOwn(row.entity_ref ?? {}, 'entity_id')
          || JSON.stringify(response).includes(entry.id);
        assert.equal(leaksInternalId, false,
          `${path}.entity_ref.entity_id exposes internal ID ${entry.id}`);
      });
    }
  });
