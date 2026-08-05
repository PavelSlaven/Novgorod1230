import {
  loadLowerDvinaTraceRevision8Bundle,
  loadLowerDvinaTraceRevision9Bundle
} from './lower-dvina-trace-phase-3-bundle.js';
import { loadLowerDvinaTraceRevision10Bundle } from './lower-dvina-trace-phase-4-bundle.js';
import { loadLowerDvinaTraceRevision11Bundle } from './lower-dvina-trace-phase-5-bundle.js';
import { loadLowerDvinaTraceRevision12Bundle } from './lower-dvina-trace-phase-6-bundle.js';
import { loadLowerDvinaTraceRevision13Bundle } from
  './lower-dvina-trace-turn-step-bundle.js';
import { loadLowerDvinaTraceRevision14Bundle } from
  './lower-dvina-trace-conversation-bundle.js';

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
  const revision10 = async () => loadLowerDvinaTraceRevision10Bundle({
    rootDir,
    historicalBundle: await revision9(),
    fail,
    freezeDeep,
    validateDefinitionPins
  });
  if (scenarioDefinitionRevision === 10) return revision10();
  const revision11 = async () => loadLowerDvinaTraceRevision11Bundle({
    rootDir,
    historicalBundle: await revision10(),
    fail,
    freezeDeep,
    validateDefinitionPins
  });
  if (scenarioDefinitionRevision === 11) return revision11();
  const revision12 = async () => loadLowerDvinaTraceRevision12Bundle({
    rootDir,
    historicalBundle: await revision11(),
    fail,
    freezeDeep,
    validateDefinitionPins
  });
  if (scenarioDefinitionRevision === 12) return revision12();
  const revision13 = async () => loadLowerDvinaTraceRevision13Bundle({
    rootDir,
    historicalBundle: await revision12(),
    fail,
    freezeDeep,
    validateDefinitionPins
  });
  if (scenarioDefinitionRevision === 13) return revision13();
  if (scenarioDefinitionRevision === 14) {
    return loadLowerDvinaTraceRevision14Bundle({
      rootDir,
      historicalBundle: await revision13(),
      fail,
      freezeDeep,
      validateDefinitionPins
    });
  }
  fail(
    'TRACE_SCENARIO_REVISION_UNSUPPORTED',
    `Unsupported Lower Dvina scenario revision: ${scenarioDefinitionRevision}.`
  );
}
