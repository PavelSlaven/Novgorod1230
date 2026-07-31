import {
  loadLowerDvinaTraceRevision8Bundle,
  loadLowerDvinaTraceRevision9Bundle
} from './lower-dvina-trace-phase-3-bundle.js';
import { loadLowerDvinaTraceRevision10Bundle } from './lower-dvina-trace-phase-4-bundle.js';

export async function loadLowerDvinaTraceRevisionBundle({
  scenarioDefinitionRevision,
  rootDir,
  loadRevision7Bundle,
  fail,
  freezeDeep,
  validateDefinitionPins
}) {
  const revision7 = () => loadRevision7Bundle({ rootDir });
  const revision8 = async () => loadLowerDvinaTraceRevision8Bundle({
    rootDir,
    historicalBundle: await revision7(),
    fail,
    freezeDeep,
    validateDefinitionPins
  });
  const revision9 = async () => loadLowerDvinaTraceRevision9Bundle({
    rootDir,
    historicalBundle: await revision8(),
    fail,
    freezeDeep,
    validateDefinitionPins
  });
  if (scenarioDefinitionRevision === 8) return revision8();
  if (scenarioDefinitionRevision === 9) return revision9();
  return loadLowerDvinaTraceRevision10Bundle({
    rootDir,
    historicalBundle: await revision9(),
    fail,
    freezeDeep,
    validateDefinitionPins
  });
}
