import { buildStage2NormalizationPolicy } from './policy.js';

export function buildStage2NormalizationInput(context) {
  return {
    version: 1,
    schema: 'new_game_raw_request',
    request_id: context.requestId,
    player_text: context.startText,
    player_name: context.playerName || null,
    // ui_fields are intentionally optional technical inputs. The normal game UI
    // must remain a free-text start form; these fields are for legacy/dev/API use.
    ui_fields: normalizeStage2UiFields(context.uiFields),
    client_defaults: normalizeStage2ClientDefaults(context.clientDefaults),
    normalization_policy: buildStage2NormalizationPolicy()
  };
}


export function normalizeStage2UiFields(value = null) {
  const source = isPlainObject(value) ? value : {};
  return {
    era: nullableString(source.era),
    region: nullableString(source.region),
    character_type: nullableString(source.character_type),
    start_place: nullableString(source.start_place),
    tone: nullableString(source.tone),
    difficulty: nullableString(source.difficulty),
    additional_constraints: nullableString(source.additional_constraints)
  };
}

export function normalizeStage2ClientDefaults(value = null) {
  const source = isPlainObject(value) ? value : {};
  return {
    language: nullableString(source.language) ?? 'ru',
    allow_random_if_missing: source.allow_random_if_missing !== false,
    default_unknown_policy: nullableString(source.default_unknown_policy) ?? 'random'
  };
}

function nullableString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
