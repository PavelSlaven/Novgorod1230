import {
  TRACE_PHASE_1B_APPROVED_PHASE_1A_MANIFEST_DIGEST,
  TRACE_PHASE_1B_REVISION22_PHASE_1A_MANIFEST_DIGEST,
  TRACE_PHASE_1B_REVISION16_PHASE_1A_MANIFEST_DIGEST,
  TRACE_PHASE_1B_REVISION17_PHASE_1A_MANIFEST_DIGEST
} from './lower-dvina-trace-phase-1b-identities.js';
import { isHistoricalLowerDvinaTracePhase1AManifestDigest, loadHistoricalLowerDvinaTracePhase1BPublication } from './lower-dvina-trace-phase-1b-historical-publication.js';
import { loadCurrentLowerDvinaTracePhase1BPublication } from
  './lower-dvina-trace-phase-1b-current-publication.js';
import { loadLowerDvinaTraceRevision17Publication } from './lower-dvina-trace-phase-1b-revision17-publication.js';
import { loadLowerDvinaTraceCharacterAppearancePublication, TRACE_CHARACTER_APPEARANCE_PHASE_1A_MANIFEST_DIGEST } from './lower-dvina-trace-character-appearance-publication.js';
import { loadLowerDvinaTraceRevision19Publication, TRACE_REVISION19_PHASE_1A_MANIFEST_DIGEST } from './lower-dvina-trace-revision19-publication.js'; import { loadLowerDvinaTraceNpcActorStepPublication, TRACE_NPC_ACTOR_STEP_PHASE_1A_MANIFEST_DIGEST } from './lower-dvina-trace-npc-actor-step-publication.js'; export * from './lower-dvina-trace-phase-1b-identities.js';
import { loadLowerDvinaTraceActionProductionPublication, TRACE_ACTION_PRODUCTION_PHASE_1A_MANIFEST_DIGEST } from './lower-dvina-trace-action-production-publication.js';
import { loadLowerDvinaTraceLocalFirePublication, TRACE_LOCAL_FIRE_PHASE_1A_MANIFEST_DIGEST } from './lower-dvina-trace-local-fire-publication.js';
import { loadLowerDvinaTraceSpatialSemanticPublication, loadLowerDvinaTraceRevision23SpatialSemanticPublication, TRACE_SPATIAL_SEMANTIC_PHASE_1A_MANIFEST_DIGEST, TRACE_SPATIAL_SEMANTIC_REVISION23_PHASE_1A_MANIFEST_DIGEST } from './lower-dvina-trace-spatial-semantic-publication.js';
import { loadLowerDvinaTraceRevision26Publication, TRACE_REVISION26_PHASE_1A_MANIFEST_DIGEST } from './lower-dvina-trace-revision-26-publication.js';
import { loadLowerDvinaTraceRevision27Publication, TRACE_REVISION27_PHASE_1A_MANIFEST_DIGEST } from './lower-dvina-trace-revision-27-publication.js';
import { loadLowerDvinaTraceRevision28Publication,
  TRACE_REVISION28_PHASE_1A_MANIFEST_DIGEST } from './lower-dvina-trace-revision-28-publication.js';
export async function loadLowerDvinaTracePhase1BPublication({ rootDir = process.cwd(),
  phase1AManifestDigest = null, scenarioDefinitionRevision = null } = {}) {
  if (scenarioDefinitionRevision === 27) {
    return loadLowerDvinaTraceRevision27Publication({ rootDir, phase1AManifestDigest });
  }
  if (scenarioDefinitionRevision === 28
      || phase1AManifestDigest === TRACE_REVISION28_PHASE_1A_MANIFEST_DIGEST) {
    return loadLowerDvinaTraceRevision28Publication({ rootDir, phase1AManifestDigest });
  }
  if (phase1AManifestDigest === TRACE_REVISION26_PHASE_1A_MANIFEST_DIGEST) return loadLowerDvinaTraceRevision26Publication({ rootDir, phase1AManifestDigest });
  if (phase1AManifestDigest == null || phase1AManifestDigest === TRACE_NPC_ACTOR_STEP_PHASE_1A_MANIFEST_DIGEST) return loadLowerDvinaTraceNpcActorStepPublication({ rootDir, phase1AManifestDigest }); if (phase1AManifestDigest === TRACE_SPATIAL_SEMANTIC_PHASE_1A_MANIFEST_DIGEST) return loadLowerDvinaTraceSpatialSemanticPublication({ rootDir, phase1AManifestDigest }); if (phase1AManifestDigest === TRACE_SPATIAL_SEMANTIC_REVISION23_PHASE_1A_MANIFEST_DIGEST) return loadLowerDvinaTraceRevision23SpatialSemanticPublication({ rootDir, phase1AManifestDigest });
  if (phase1AManifestDigest === TRACE_LOCAL_FIRE_PHASE_1A_MANIFEST_DIGEST
      || phase1AManifestDigest === TRACE_PHASE_1B_REVISION22_PHASE_1A_MANIFEST_DIGEST) return loadLowerDvinaTraceLocalFirePublication({ rootDir, phase1AManifestDigest });
  if (phase1AManifestDigest === TRACE_ACTION_PRODUCTION_PHASE_1A_MANIFEST_DIGEST) return loadLowerDvinaTraceActionProductionPublication({ rootDir, phase1AManifestDigest });
  if (phase1AManifestDigest
      === TRACE_CHARACTER_APPEARANCE_PHASE_1A_MANIFEST_DIGEST) {
    return loadLowerDvinaTraceCharacterAppearancePublication(
      { rootDir, phase1AManifestDigest });
  }
  if (phase1AManifestDigest === TRACE_REVISION19_PHASE_1A_MANIFEST_DIGEST) {
    return loadLowerDvinaTraceRevision19Publication({rootDir,
      phase1AManifestDigest});
  }
  if (isHistoricalLowerDvinaTracePhase1AManifestDigest(
    phase1AManifestDigest
  ) || phase1AManifestDigest
      === TRACE_PHASE_1B_REVISION16_PHASE_1A_MANIFEST_DIGEST
  ) {
    return loadHistoricalLowerDvinaTracePhase1BPublication({
      rootDir,
      phase1AManifestDigest
    });
  }
  if (phase1AManifestDigest
      === TRACE_PHASE_1B_REVISION17_PHASE_1A_MANIFEST_DIGEST) {
    return loadLowerDvinaTraceRevision17Publication({ rootDir,
      phase1AManifestDigest });
  }
  if (phase1AManifestDigest != null
    && phase1AManifestDigest
      !== TRACE_PHASE_1B_APPROVED_PHASE_1A_MANIFEST_DIGEST) {
    fail(
      'TRACE_PHASE_1B_PUBLICATION_IDENTITY_UNKNOWN',
      'No exact Phase 1B publication matches the persisted Phase 1A identity.'
    );
  }
  return loadCurrentLowerDvinaTracePhase1BPublication({ rootDir });
}

function fail(code, message, details = {}) {
  throw Object.assign(new Error(message), { code, status: 409, details });
}
