import { createLowerDvinaTracePhase1ARepository } from
  '@rus/party-store/internal/lower-dvina-trace-phase-1a';
import { createLowerDvinaTracePhase1APostcommitProjector,
  materializeLowerDvinaTraceParty } from '../../internal/lower-dvina-trace-phase-1a.js';
import { createPostgresStage25Ports } from './stage25.js';
import { assertLowerDvinaTraceExecutionSupport } from
  './lower-dvina-trace-execution-support.js';
import {
  readPartyDatabaseSchemaSnapshot,
  readWorldBaseReferenceSnapshot
} from './lower-dvina-trace-phase-1b-snapshots.js';
import { materializeAuthoredStartPartyInstance } from '@rus/materialization';
import { createRuntimeCatalogLoader, loadApprovedProceduralCompiledCatalog } from '@rus/runtime-catalog';
import { createPostgresWorldBaseReader } from './world-base.js';
export {
  readPartyDatabaseSchemaSnapshot,
  readWorldBaseReferenceSnapshot
} from './lower-dvina-trace-phase-1b-snapshots.js';

export function createLowerDvinaTracePhase1BProductionAdapter({
  partyPool,
  worldPool,
  release,
  runtimeCatalogPin,
  initialOrdinaryProvisioner = null,
  worldKnowledge = null,
  authoredStartResolver = null,
  approvedActorCatalog = null,
  actorBaseAttributesBinding = null,
  runtimeCatalogLoader = null,
  rootDir = process.cwd()
} = {}) {
  requirePool(partyPool, 'partyPool');
  requirePool(worldPool, 'worldPool');
  assertProductionPin(release, runtimeCatalogPin);
  const repository = createLowerDvinaTracePhase1ARepository({
    query: partyPool.query.bind(partyPool)
  });
  const stage25Ports = createPostgresStage25Ports({
    pool: partyPool,
    postcommitProjector:
      createLowerDvinaTracePhase1APostcommitProjector({ repository })
  });
  if (initialOrdinaryProvisioner != null
      && typeof initialOrdinaryProvisioner.provision !== 'function') {
    throw new TypeError('initialOrdinaryProvisioner.provision is required');
  }
  return Object.freeze({
    assertExecutionSupport(executionIdentity) {
      assertLowerDvinaTraceExecutionSupport(executionIdentity);
    },
    async materialize(request) {
      assertLowerDvinaTraceExecutionSupport(request);
      assertRequestWorldBinding(request, release, runtimeCatalogPin);
      const authoredProfile = await authoredStartResolver?.(
        request.scenario_id
      ) ?? null;
      const catalogLoader = runtimeCatalogLoader ?? createRuntimeCatalogLoader({
          worldBaseReader: createPostgresWorldBaseReader({ pool: worldPool }),
          supportedRuntimeContractDigests: [
            runtimeCatalogPin.runtime_contract_digest
          ]
        });
      const [partyDatabaseSchema, worldBaseReferenceSnapshot,
        domainCatalog] =
        await Promise.all([
          readPartyDatabaseSchemaSnapshot(partyPool),
          readWorldBaseReferenceSnapshot(
            worldPool,
            request.world_compatibility
          ),
          catalogLoader.loadApprovedItemCatalog({ pin: runtimeCatalogPin })
        ]);
      if (actorBaseAttributesBinding != null) {
        assertActorBaseAttributesBinding(actorBaseAttributesBinding, release);
      }
      const verifiedProceduralCatalog = domainCatalog != null
        && runtimeCatalogPin.catalog_revision_id
          === 'procedural_scene_final_candidate_v2_001'
        ? loadApprovedProceduralCompiledCatalog({
          verifiedCatalog: domainCatalog, pin: runtimeCatalogPin
        })
        : null;
      return materializeLowerDvinaTraceParty({
        request,
        domainCatalogPinLoader: async (identity) => {
          if (identity?.catalog_scope !== runtimeCatalogPin.catalog_scope
            || identity.world_revision_id
              !== runtimeCatalogPin.compatible_world_revision_id
            || identity.world_catalog_digest
              !== runtimeCatalogPin.compatible_world_catalog_digest) {
            fail(
              'TRACE_PHASE_1B_RUNTIME_CATALOG_PIN_MISMATCH',
              'Active runtime catalog pin is incompatible with the trace party world tuple.'
            );
          }
          return runtimeCatalogPin;
        },
        partyDatabaseSchema,
        worldBaseReferenceSnapshot,
        domainCatalog,
        actorBaseAttributesBinding,
        approvedActorCatalog,
        verified_procedural_compiled_catalog: verifiedProceduralCatalog,
        repository,
        stage25Ports,
        worldKnowledge,
        ...(authoredProfile == null ? {} : {
          scenarioBundleLoader: async () => ({
            ...structuredClone(authoredProfile),
            definition: {
              schema: 'rus.live_world_runtime.authored_start_definition.v1',
              ...structuredClone(authoredProfile)
            }
          }),
          materializePartyInstance: materializeAuthoredStartPartyInstance,
          validatePlayerDossier: (result) => result.validation_report
        }),
        rootDir
      });
    },
    ...(initialOrdinaryProvisioner == null ? {} : {
      async provisionInitialOrdinary(partyId) {
        if (!text(partyId) || typeof partyPool.connect !== 'function') {
          fail('TRACE_INITIAL_ORDINARY_PROVISIONING_INVALID',
            'Initial ordinary party identity is invalid.');
        }
        const transaction = await partyPool.connect();
        try {
          await transaction.query('BEGIN');
          const loaded = await transaction.query(
            `SELECT snapshot.state_payload#>>
                      '{immediate,spatial,node,state,location_profile_ref}'
                      AS location_ref,
                    journey.scene_position_id AS position_id,
                    position.g6_instance_id AS g6_instance_id,
                    change_set.id AS change_set_id
               FROM party_runtime.parties party
               JOIN party_runtime.party_state_snapshots snapshot
                 ON snapshot.party_id=party.party_id
                AND snapshot.state_version=party.state_version
               JOIN party_runtime.party_player_characters player
                 ON player.party_id=party.party_id
               JOIN party_runtime.party_journey_locations journey
                 ON journey.party_id=party.party_id
                AND journey.owner_kind='actor'
                AND journey.owner_id=player.character_id
                AND journey.location_kind='scene'
               JOIN party_runtime.scene_position_nodes position
                 ON position.party_id=party.party_id
                AND position.id=journey.scene_position_id
                AND position.status='active'
               JOIN LATERAL (
                 SELECT id FROM party_runtime.party_v3_change_sets
                  WHERE party_id=party.party_id AND operation_kind='new_game'
                  ORDER BY id LIMIT 1
               ) change_set ON TRUE
              WHERE party.party_id=$1
              FOR UPDATE OF party`, [partyId]);
          const row = loaded.rows[0];
          if (loaded.rowCount !== 1
              || !text(row?.position_id) || !text(row?.g6_instance_id)
              || !text(row.change_set_id)) {
            fail('TRACE_INITIAL_ORDINARY_PROVISIONING_INVALID',
              'Committed initial ordinary scope is incomplete.');
          }
          const result = await initialOrdinaryProvisioner.provision({
            transaction, partyId, changeSetId: row.change_set_id,
            firstEntryBinding: {
              g6_instance_id: row.g6_instance_id,
              position_id: row.position_id
            }
          });
          await transaction.query('COMMIT');
          return result;
        } catch (error) {
          try { await transaction.query('ROLLBACK'); } catch {}
          throw error;
        } finally {
          transaction.release();
        }
      }
    }),
    loadInternal: (partyId) => repository.loadInternal(partyId),
    loadVisible: (partyId) => repository.loadVisible(partyId)
  });
}

function assertActorBaseAttributesBinding(binding, release) {
  const pin = binding?.pin;
  if (binding?.schema !== 'rus.actor_base_attributes_runtime_binding.v1'
      || pin?.schema !== 'rus.runtime_catalog_pin.v2'
      || pin.catalog_scope !== 'actor_base_attributes_v1'
      || pin.compatible_world_revision_id !== release.world_revision_id
      || pin.compatible_world_catalog_digest !== release.world_catalog_digest) {
    fail('ACTOR_BASE_ATTRIBUTES_RUNTIME_PROFILE_INVALID',
      'Active actor base attribute profile does not match production world.');
  }
}

function assertProductionPin(release, pin) {
  if (!release?.world_revision_id
    || pin?.schema !== 'rus.runtime_catalog_pin.v2'
    || pin.catalog_scope !== 'item_container_materialization_v2'
    || pin.compatible_world_revision_id !== release.world_revision_id
    || pin.compatible_world_catalog_digest !== release.world_catalog_digest
    || pin.compatible_world_pin_manifest_digest
      !== release.compatible_world_pin_manifest_digest) {
    fail(
      'TRACE_PHASE_1B_RUNTIME_CATALOG_PIN_MISMATCH',
      'Exact active production runtime catalog pin is required.'
    );
  }
}

function assertRequestWorldBinding(request, release, pin) {
  if (request?.world_revision_id !== release.world_revision_id
    || request.world_catalog_digest !== release.world_catalog_digest
    || request.world_revision_id !== pin.compatible_world_revision_id
    || request.world_catalog_digest !== pin.compatible_world_catalog_digest
    || request.world_compatibility?.production_world_revision_id
      !== release.world_revision_id
    || request.world_compatibility?.production_world_catalog_digest
      !== release.world_catalog_digest) {
    fail(
      'TRACE_PHASE_1B_WORLD_TUPLE_MISMATCH',
      'Trace request, publication lineage and active production tuple differ.'
    );
  }
}

function requirePool(pool, name) {
  if (!pool?.query) throw new TypeError(`${name} is required.`);
}

function text(value) {
  return typeof value === 'string' && value.trim() === value
    && value.length > 0;
}

function fail(code, message) {
  throw Object.assign(new Error(message), { code, status: 409 });
}
