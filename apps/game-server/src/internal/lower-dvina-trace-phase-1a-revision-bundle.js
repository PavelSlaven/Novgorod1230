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
import { loadLowerDvinaTraceRevision15Bundle } from
  './lower-dvina-trace-autonomous-bundle.js';
import { loadLowerDvinaTraceRevision16CombatBundle } from
  './lower-dvina-trace-combat-bundle.js';
import { loadLowerDvinaTraceRevision17Bundle } from
  './lower-dvina-trace-phase9-bundle.js';
import { loadLowerDvinaTraceRevision18Bundle } from
  './lower-dvina-trace-phase10-bundle.js';
import { loadLowerDvinaTraceRevision19Bundle } from
  './lower-dvina-trace-character-appearance-bundle.js';
import { loadLowerDvinaTraceRevision20Bundle } from
  './lower-dvina-trace-o2b-bundle.js';
import { loadLowerDvinaTraceRevision21Bundle } from
  './lower-dvina-trace-a1-bundle.js';
import { loadLowerDvinaTraceRevision22Bundle } from
  './lower-dvina-trace-f1-bundle.js';

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
  const revision14 = async () => loadLowerDvinaTraceRevision14Bundle({
      rootDir,
      historicalBundle: await revision13(),
      fail,
      freezeDeep,
      validateDefinitionPins
    });
  if (scenarioDefinitionRevision === 14) return revision14();
  const revision15 = async () => loadLowerDvinaTraceRevision15Bundle({
      rootDir,
      historicalBundle: await revision14(),
      fail,
      freezeDeep,
      validateDefinitionPins
    });
  if (scenarioDefinitionRevision === 15) return revision15();
  const revision16 = async () => loadLowerDvinaTraceRevision16CombatBundle({
      rootDir,
      historicalBundle: await revision15(),
      fail,
      freezeDeep,
      validateDefinitionPins
    });
  if (scenarioDefinitionRevision === 16) return revision16();
  const revision17 = async () => loadLowerDvinaTraceRevision17Bundle({
    rootDir, historicalBundle: await revision16(), fail, freezeDeep,
    validateDefinitionPins });
  if (scenarioDefinitionRevision === 17) return revision17();
  const revision18 = async () => loadLowerDvinaTraceRevision18Bundle({ rootDir,
      historicalBundle: await revision17(), fail, freezeDeep,
      validateDefinitionPins });
  if (scenarioDefinitionRevision === 18) return revision18();
  const revision19 = async () => loadLowerDvinaTraceRevision19Bundle({
    rootDir, historicalBundle: await revision18(), fail, freezeDeep,
    validateDefinitionPins
  });
  if (scenarioDefinitionRevision === 19) return revision19();
  const revision20 = async () => loadLowerDvinaTraceRevision20Bundle({
    rootDir,historicalBundle:await revision19(),fail,freezeDeep,
    validateDefinitionPins});
  if (scenarioDefinitionRevision === 20) return revision20();
  const revision21 = async () => loadLowerDvinaTraceRevision21Bundle({
    rootDir, historicalBundle: await revision20(), fail, freezeDeep,
    validateDefinitionPins });
  if (scenarioDefinitionRevision === 21) return revision21();
  if (scenarioDefinitionRevision === 22) return loadLowerDvinaTraceRevision22Bundle({
    rootDir, historicalBundle: await revision21(), fail, freezeDeep,
    validateDefinitionPins });
  fail(
    'TRACE_SCENARIO_REVISION_UNSUPPORTED',
    `Unsupported Lower Dvina scenario revision: ${scenarioDefinitionRevision}.`
  );
}
