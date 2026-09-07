import { serverError } from './errors.js';
import {
  SPATIAL_V3_PRODUCTION_BINDINGS_MODULE
} from './runtime/load-spatial-v3-bindings.js';

const MODULAR_FLAGS = Object.freeze([
  'modulesEnabled',
  'llmRuntimeModulesEnabled',
  'dataModulesEnabled',
  'partyStoreModulesEnabled',
  'newGameWave2426Enabled',
  'newGameWave2023Enabled',
  'newGameAllStagesEnabled',
  'newGameModulesEnabled',
  'turnModulesEnabled',
  'presentationModulesEnabled',
  'gameServerModulesEnabled',
  'modularUiEnabled',
  'toolsModulesEnabled'
]);

export function readServerConfig(env = process.env) {
  const host = text(env.RUS_SERVER_HOST) || '127.0.0.1';
  const port = integer(env.RUS_SERVER_PORT ?? env.PORT, 3000, { min: 0, max: 65535 });
  const maxBodyBytes = integer(env.RUS_MAX_JSON_BODY_BYTES, 1024 * 1024, { min: 1024, max: 10 * 1024 * 1024 });
  const runtimeRoute = route(env.RUS_RUNTIME_ROUTE, bool(env.RUS_LEGACY_RUNTIME_ENABLED, false) ? 'legacy' : 'modular');
  const modularDefault = runtimeRoute === 'modular';
  const config = {
    host,
    port,
    maxBodyBytes,
    logDirectory: text(env.LOG_DIRECTORY) || null,
    runtimeRoute,
    cutoverStage: strictInteger(
      env.RUS_CUTOVER_STAGE,
      modularDefault ? 13 : 0,
      { min: 0, max: 13 }
    ),
    modulesEnabled: bool(env.RUS_MODULES_ENABLED, modularDefault),
    llmRuntimeModulesEnabled: bool(env.RUS_LLM_RUNTIME_MODULES_ENABLED, modularDefault),
    dataModulesEnabled: bool(env.RUS_DATA_MODULES_ENABLED, modularDefault),
    partyStoreModulesEnabled: bool(env.RUS_PARTY_STORE_MODULES_ENABLED, modularDefault),
    newGameWave2426Enabled: bool(env.RUS_NEW_GAME_WAVE_24_26_ENABLED, modularDefault),
    newGameWave2023Enabled: bool(env.RUS_NEW_GAME_WAVE_20_23_ENABLED, modularDefault),
    newGameAllStagesEnabled: bool(env.RUS_NEW_GAME_ALL_STAGES_ENABLED, modularDefault),
    newGameModulesEnabled: bool(env.RUS_NEW_GAME_MODULES_ENABLED, modularDefault),
    turnModulesEnabled: bool(env.RUS_TURN_MODULES_ENABLED, modularDefault),
    presentationModulesEnabled: bool(env.RUS_PRESENTATION_MODULES_ENABLED, modularDefault),
    gameServerModulesEnabled: bool(env.RUS_GAME_SERVER_MODULES_ENABLED, modularDefault),
    modularUiEnabled: bool(env.RUS_UI_MODULES_ENABLED, modularDefault),
    toolsModulesEnabled: bool(env.RUS_TOOLS_MODULES_ENABLED, modularDefault),
    compositionModule:
      text(env.RUS_COMPOSITION_MODULE) || 'builtin:production-spatial-v3',
    spatialV3BindingsModule:
      text(env.RUS_SPATIAL_V3_BINDINGS_MODULE)
        || SPATIAL_V3_PRODUCTION_BINDINGS_MODULE,
    runtimeCatalogPinManifestDigest: digestText(
      env.RUS_SPATIAL_V3_RUNTIME_CATALOG_PIN_MANIFEST_DIGEST
    ),
    probeProvider: bool(env.RUS_PROBE_LLM_PROVIDER_ON_STARTUP, false),
    developerMode: bool(env.RUS_DEVELOPER_MODE, false)
  };
  return Object.freeze({ ...config, modularEnabled: config.modulesEnabled });
}

const STARTUP_FLAGS = Object.freeze(MODULAR_FLAGS.filter((name) => name !== 'toolsModulesEnabled'));

export function assertModularStartupConfig(config) {
  if (config.runtimeRoute !== 'modular') {
    throw serverError(
      'RUNTIME_ROUTE_INACTIVE',
      'Legacy runtime is not selectable after spatial-v3 production cutover.',
      { status: 500 }
    );
  }
  const disabled = STARTUP_FLAGS.filter((name) => config[name] !== true);
  if (disabled.length) throw serverError('MODULAR_FEATURE_FLAGS_INCOMPLETE', `Modular runtime requires all cutover flags; disabled: ${disabled.join(', ')}.`, { status: 500, details: { disabled } });
  if (config.cutoverStage !== 13) throw serverError('CUTOVER_STAGE_INCOMPLETE', 'Spatial-v3 production requires the completed atomic cutover stage 13.', { status: 500 });
  if (!config.compositionModule) throw serverError('COMPOSITION_MODULE_REQUIRED', 'Composition module is required.', { status: 500 });
  if (config.compositionModule !== 'builtin:production-spatial-v3') {
    throw serverError(
      'COMPOSITION_MODULE_INACTIVE',
      'Only the activated spatial-v3 production composition may be selected.',
      { status: 500 }
    );
  }
  if (config.spatialV3BindingsModule
      !== SPATIAL_V3_PRODUCTION_BINDINGS_MODULE) {
    throw serverError(
      'RUNTIME_BINDINGS_MODULE_INACTIVE',
      'Only the production-v15 spatial-v3 runtime binding may be selected.',
      { status: 500 }
    );
  }
  if (!config.runtimeCatalogPinManifestDigest) {
    throw serverError(
      'RUNTIME_CATALOG_PIN_MANIFEST_DIGEST_REQUIRED',
      'Spatial-v3 production requires one exact compatible-world pin manifest digest.',
      { status: 500 }
    );
  }
  return config;
}

export function featureFlagProfile(config) {
  return Object.freeze(Object.fromEntries(MODULAR_FLAGS.map((name) => [name, config[name] === true])));
}

function route(value, fallback) {
  const selected = text(value || fallback).toLowerCase();
  if (!['legacy', 'modular'].includes(selected)) throw serverError('RUNTIME_ROUTE_INVALID', `Unsupported RUS_RUNTIME_ROUTE: ${selected}.`, { status: 500 });
  return selected;
}
function bool(value, fallback) { if (value == null || value === '') return fallback; return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase()); }
function text(value) { return String(value ?? '').trim(); }
function integer(value, fallback, { min, max }) { const parsed = Number(value); if (!Number.isInteger(parsed)) return fallback; return Math.max(min, Math.min(max, parsed)); }
function strictInteger(value, fallback, { min, max }) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
}
function digestText(value) {
  const normalized = text(value).toLowerCase();
  return /^[a-f0-9]{64}$/u.test(normalized) ? normalized : null;
}
