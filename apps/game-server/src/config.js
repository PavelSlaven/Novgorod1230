import { serverError } from './errors.js';

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
    runtimeRoute,
    cutoverStage: integer(env.RUS_CUTOVER_STAGE, modularDefault ? 13 : 0, { min: 0, max: 13 }),
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
    compositionModule: text(env.RUS_COMPOSITION_MODULE) || 'builtin:production',
    runtimeBindingsModule: text(env.RUS_RUNTIME_BINDINGS_MODULE) || null,
    runMigrations: bool(env.RUS_RUN_PARTY_MIGRATIONS, true),
    probeProvider: bool(env.RUS_PROBE_LLM_PROVIDER_ON_STARTUP, false),
    developerMode: bool(env.RUS_DEVELOPER_MODE, false)
  };
  return Object.freeze({ ...config, modularEnabled: config.modulesEnabled });
}

const STARTUP_FLAGS = Object.freeze(MODULAR_FLAGS.filter((name) => name !== 'toolsModulesEnabled'));

export function assertModularStartupConfig(config) {
  if (config.runtimeRoute === 'legacy') return config;
  const disabled = STARTUP_FLAGS.filter((name) => config[name] !== true);
  if (disabled.length) throw serverError('MODULAR_FEATURE_FLAGS_INCOMPLETE', `Modular runtime requires all cutover flags; disabled: ${disabled.join(', ')}.`, { status: 500, details: { disabled } });
  if (config.cutoverStage < 12) throw serverError('CUTOVER_STAGE_INCOMPLETE', 'Modular runtime cannot become default before cutover step 12.', { status: 500 });
  if (!config.compositionModule) throw serverError('COMPOSITION_MODULE_REQUIRED', 'Composition module is required.', { status: 500 });
  if (config.compositionModule !== 'builtin:production') {
    throw serverError(
      'COMPOSITION_MODULE_INACTIVE',
      'Only production v2 may be selected before versioned production activation cutover.',
      { status: 500 }
    );
  }
  if (config.compositionModule === 'builtin:production' && !config.runtimeBindingsModule) {
    throw serverError('RUNTIME_BINDINGS_MODULE_REQUIRED', 'RUS_RUNTIME_BINDINGS_MODULE is required for builtin production composition.', { status: 500 });
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
