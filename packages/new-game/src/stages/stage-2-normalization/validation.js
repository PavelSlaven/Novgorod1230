import {
  STAGE_2_SELECTION_MODES,
  STAGE_2_SOURCES,
  STAGE_2_CONFIDENCE,
  REQUEST_BLOCK_FIELDS,
  FORBIDDEN_WORLD_ID_KEYS,
  FORBIDDEN_ENTITY_KEYS,
  RANDOM_WORD_RE
} from './constants.js';
import { normalizeStage2UiFields, normalizeStage2ClientDefaults } from './input.js';

export function validateStage2NormalizedRequest(output, input = {}) {
  const concerns = [];
  const inputText = String(input.player_text ?? input.start_text ?? '');
  const uiFields = normalizeStage2UiFields(input.ui_fields);
  const clientDefaults = normalizeStage2ClientDefaults(input.client_defaults);

  if (output?.version !== 1) {
    concerns.push(makeConcern('NORMALIZER_VERSION_MISMATCH', 'Stage 2 version must be exactly 1.', { field: 'version' }));
  }

  if (output?.request_id !== input.request_id) {
    concerns.push(makeConcern('NORMALIZER_REQUEST_ID_MISMATCH', 'Stage 2 request_id must match input request_id.', { field: 'request_id' }));
  }

  if (output?.start_mode !== 'new_party') {
    concerns.push(makeConcern('NORMALIZER_START_MODE_INVALID', 'Stage 2 start_mode must be new_party.', { field: 'start_mode' }));
  }

  if (typeof output?.player_intent_summary !== 'string' || output.player_intent_summary.trim().length === 0) {
    concerns.push(makeConcern('NORMALIZER_MISSING_INTENT_SUMMARY', 'Stage 2 must include a non-empty player_intent_summary.', { field: 'player_intent_summary' }));
  }

  for (const field of REQUEST_BLOCK_FIELDS) {
    concerns.push(...validateRequestValueBlock(output?.[field], {
      field,
      inputText,
      uiFields,
      clientDefaults
    }));
  }

  concerns.push(...validateCharacterRequest(output?.character_request));
  concerns.push(...validateArrayField(output, 'hard_constraints'));
  concerns.push(...validateArrayField(output, 'soft_preferences'));
  concerns.push(...validateArrayField(output, 'forbidden_content'));
  concerns.push(...validateArrayField(output, 'unknowns_to_resolve'));
  concerns.push(...validateArrayField(output, 'clarification_questions'));
  concerns.push(...validateArrayField(output, 'invalid_or_unsafe_literals'));
  concerns.push(...validateAdaptationFlags(output?.adaptation_flags));
  concerns.push(...validateAuditSelfReport(output?.audit));
  concerns.push(...validateUnknownResolutionLinks(output));
  concerns.push(...validateForbiddenKeys(output));
  concerns.push(...validateClarificationState(output));
  concerns.push(...validateEmptyOrRandomInputPolicy(output, { inputText, uiFields, clientDefaults }));

  return concerns;
}


function validateRequestValueBlock(block, { field, inputText, uiFields, clientDefaults }) {
  const concerns = [];
  if (!isPlainObject(block)) {
    return [makeConcern('NORMALIZER_REQUEST_BLOCK_NOT_OBJECT', `${field} must be an object.`, { field })];
  }

  concerns.push(...validateEnum(block.selection_mode, STAGE_2_SELECTION_MODES, `${field}.selection_mode`, 'NORMALIZER_INVALID_SELECTION_MODE'));
  concerns.push(...validateEnum(block.source, STAGE_2_SOURCES, `${field}.source`, 'NORMALIZER_INVALID_SOURCE'));
  concerns.push(...validateEnum(block.confidence, STAGE_2_CONFIDENCE, `${field}.confidence`, 'NORMALIZER_INVALID_CONFIDENCE'));

  const playerProvidedField = didPlayerProvideField(field, inputText, uiFields);
  if (!playerProvidedField && block.selection_mode === 'explicit') {
    concerns.push(makeConcern(
      'NORMALIZER_MISSING_FIELD_MARKED_EXPLICIT',
      `${field} is explicit, but the player did not provide this field. Missing values must remain random/unresolved.`,
      { field }
    ));
  }

  const explicitRandom = block.source === 'explicit_player_random';
  const missingRandom = block.source === 'missing' && block.selection_mode === 'random';
  if ((explicitRandom || missingRandom) && block.value !== null) {
    concerns.push(makeConcern(
      'NORMALIZER_RANDOM_FIELD_FILLED_WITH_INVENTED_VALUE',
      `${field} is random/missing but contains a concrete value. Stage 2 must not choose concrete content.`,
      { field }
    ));
  }

  if (clientDefaults.allow_random_if_missing === true && block.source === 'missing' && block.selection_mode === 'unresolved') {
    concerns.push(makeConcern(
      'NORMALIZER_MISSING_FIELD_UNRESOLVED_INSTEAD_OF_RANDOM',
      `${field} is missing, but allow_random_if_missing=true; use random unless there is a real conflict.`,
      { field }
    ));
  }

  return concerns;
}

function validateCharacterRequest(block) {
  const concerns = [];
  if (!isPlainObject(block)) {
    return [makeConcern('NORMALIZER_CHARACTER_REQUEST_NOT_OBJECT', 'character_request must be an object.', { field: 'character_request' })];
  }

  concerns.push(...validateEnum(block.selection_mode, STAGE_2_SELECTION_MODES, 'character_request.selection_mode', 'NORMALIZER_INVALID_SELECTION_MODE'));
  concerns.push(...validateEnum(block.source, STAGE_2_SOURCES, 'character_request.source', 'NORMALIZER_INVALID_SOURCE'));
  concerns.push(...validateEnum(block.confidence, STAGE_2_CONFIDENCE, 'character_request.confidence', 'NORMALIZER_INVALID_CONFIDENCE'));

  for (const legacyField of ['type', 'status', 'role', 'occupation', 'wealth', 'gender', 'age_band', 'origin', 'goal']) {
    if (Object.prototype.hasOwnProperty.call(block, legacyField)) {
      concerns.push(makeConcern(
        'NORMALIZER_CHARACTER_LEGACY_FACT_FIELD',
        `character_request.${legacyField} is ambiguous. Use ${legacyField}_text or ${legacyField}_category_hint so it remains a request, not a resolved fact.`,
        { field: `character_request.${legacyField}` }
      ));
    }
  }

  for (const arrayField of ['skills_text', 'property_text', 'relationships_text']) {
    if (block[arrayField] !== undefined && !Array.isArray(block[arrayField])) {
      concerns.push(makeConcern(
        'NORMALIZER_CHARACTER_TEXT_LIST_NOT_ARRAY',
        `character_request.${arrayField} must be an array when present.`,
        { field: `character_request.${arrayField}` }
      ));
    }
  }

  if ((block.source === 'explicit_player_random' || block.source === 'missing') && block.selection_mode === 'random') {
    const concreteKeys = Object.keys(block).filter((key) => (
      !['selection_mode', 'source', 'confidence', 'notes'].includes(key)
      && hasConcreteValue(block[key])
    ));
    if (concreteKeys.length > 0) {
      concerns.push(makeConcern(
        'NORMALIZER_RANDOM_CHARACTER_FILLED_WITH_INVENTED_VALUE',
        'Random character request must not contain concrete character facts at stage 2.',
        { field: 'character_request', concrete_keys: concreteKeys }
      ));
    }
  }

  return concerns;
}

function validateAdaptationFlags(value) {
  const concerns = [];
  if (!isPlainObject(value)) {
    return [makeConcern('NORMALIZER_ADAPTATION_FLAGS_NOT_OBJECT', 'adaptation_flags must be an object.', { field: 'adaptation_flags' })];
  }
  for (const key of [
    'requires_historical_adaptation',
    'modern_terms_present',
    'fantasy_or_impossible_terms_present',
    'too_powerful_or_elite',
    'requires_social_downgrade',
    'requires_item_rights_check',
    'requires_weapon_rights_check'
  ]) {
    if (typeof value[key] !== 'boolean') {
      concerns.push(makeConcern('NORMALIZER_ADAPTATION_FLAG_NOT_BOOLEAN', `adaptation_flags.${key} must be boolean.`, { field: `adaptation_flags.${key}` }));
    }
  }
  return concerns;
}

function validateAuditSelfReport(value) {
  const concerns = [];
  if (!isPlainObject(value)) {
    return [makeConcern('NORMALIZER_AUDIT_NOT_OBJECT', 'audit must be an object. It is a self-report, not the authoritative gate.', { field: 'audit' })];
  }
  if (typeof value.pass !== 'boolean') {
    concerns.push(makeConcern('NORMALIZER_AUDIT_PASS_NOT_BOOLEAN', 'audit.pass must be boolean.', { field: 'audit.pass' }));
  }
  if (!Array.isArray(value.concerns)) {
    concerns.push(makeConcern('NORMALIZER_AUDIT_CONCERNS_NOT_ARRAY', 'audit.concerns must be an array.', { field: 'audit.concerns' }));
  }
  if (!Array.isArray(value.evidence)) {
    concerns.push(makeConcern('NORMALIZER_AUDIT_EVIDENCE_NOT_ARRAY', 'audit.evidence must be an array.', { field: 'audit.evidence' }));
  }
  if (value.pass === false && (!Array.isArray(value.concerns) || value.concerns.length === 0 || !Array.isArray(value.evidence) || value.evidence.length === 0)) {
    concerns.push(makeConcern('NORMALIZER_FAILED_AUDIT_WITHOUT_EVIDENCE', 'If audit.pass=false, concerns and evidence must not be empty.', { field: 'audit' }));
  }
  return concerns;
}

function validateUnknownResolutionLinks(output) {
  const concerns = [];
  const unknowns = Array.isArray(output?.unknowns_to_resolve) ? output.unknowns_to_resolve : [];
  for (const [index, item] of unknowns.entries()) {
    if (!isPlainObject(item)) {
      concerns.push(makeConcern('NORMALIZER_UNKNOWN_NOT_OBJECT', `unknowns_to_resolve[${index}] must be an object.`, { field: `unknowns_to_resolve[${index}]` }));
      continue;
    }
    if (typeof item.field !== 'string' || item.field.trim().length === 0) {
      concerns.push(makeConcern('NORMALIZER_UNKNOWN_FIELD_MISSING', `unknowns_to_resolve[${index}].field is required.`, { field: `unknowns_to_resolve[${index}].field` }));
    }
    if (typeof item.resolution_stage !== 'string' || item.resolution_stage.trim().length === 0) {
      concerns.push(makeConcern('NORMALIZER_UNKNOWN_STAGE_MISSING', `unknowns_to_resolve[${index}].resolution_stage is required.`, { field: `unknowns_to_resolve[${index}].resolution_stage` }));
    }
    if (typeof item.policy !== 'string' || item.policy.trim().length === 0) {
      concerns.push(makeConcern('NORMALIZER_UNKNOWN_POLICY_MISSING', `unknowns_to_resolve[${index}].policy is required.`, { field: `unknowns_to_resolve[${index}].policy` }));
    }
  }

  for (const field of [...REQUEST_BLOCK_FIELDS, 'character_request']) {
    const block = output?.[field];
    if (!isPlainObject(block)) continue;
    if (['random', 'constrained_random', 'unresolved'].includes(block.selection_mode)) {
      const present = unknowns.some((item) => item?.field === field);
      if (!present) {
        concerns.push(makeConcern(
          'NORMALIZER_UNKNOWN_NOT_LINKED_TO_RESOLUTION_STAGE',
          `${field} is ${block.selection_mode} and must be listed in unknowns_to_resolve.`,
          { field }
        ));
      }
    }
  }

  return concerns;
}

function validateForbiddenKeys(output) {
  const concerns = [];
  for (const { path, key } of walkObjectKeys(output)) {
    if (FORBIDDEN_WORLD_ID_KEYS.includes(key)) {
      concerns.push(makeConcern(
        'NORMALIZER_CREATED_OR_RESOLVED_WORLD_ID',
        `Stage 2 must not emit ${key}. Preserve raw player text only; resolve ids after world_base candidate loading.`,
        { field: path }
      ));
    }
    if (FORBIDDEN_ENTITY_KEYS.includes(key)) {
      concerns.push(makeConcern(
        'NORMALIZER_CREATED_WORLD_ENTITY',
        `Stage 2 must not create ${key}. It only normalizes the player request.`,
        { field: path }
      ));
    }
  }
  return concerns;
}

function validateClarificationState(output) {
  const concerns = [];
  if (typeof output?.requires_clarification !== 'boolean') {
    concerns.push(makeConcern('NORMALIZER_CLARIFICATION_FLAG_NOT_BOOLEAN', 'requires_clarification must be boolean.', { field: 'requires_clarification' }));
  }
  if (output?.requires_clarification === false && Array.isArray(output?.clarification_questions) && output.clarification_questions.length > 0) {
    concerns.push(makeConcern('NORMALIZER_CLARIFICATION_QUESTIONS_WITH_FALSE_FLAG', 'clarification_questions must be empty when requires_clarification=false.', { field: 'clarification_questions' }));
  }
  if (output?.requires_clarification === true && Array.isArray(output?.clarification_questions) && output.clarification_questions.length === 0) {
    concerns.push(makeConcern('NORMALIZER_CLARIFICATION_TRUE_WITHOUT_QUESTIONS', 'clarification_questions must not be empty when requires_clarification=true.', { field: 'clarification_questions' }));
  }
  return concerns;
}

function validateEmptyOrRandomInputPolicy(output, { inputText, uiFields, clientDefaults }) {
  const concerns = [];
  const hasText = inputText.trim().length > 0;
  const hasUi = Object.values(uiFields).some((value) => value !== null);
  const explicitRandom = RANDOM_WORD_RE.test(inputText);

  if (!hasText && !hasUi && clientDefaults.allow_random_if_missing === true) {
    for (const field of [...REQUEST_BLOCK_FIELDS, 'character_request']) {
      const block = output?.[field];
      if (!isPlainObject(block)) continue;
      if (block.selection_mode !== 'random' || block.source !== 'missing') {
        concerns.push(makeConcern(
          'NORMALIZER_EMPTY_INPUT_NOT_RANDOM',
          `${field} must be random/missing for an empty request when allow_random_if_missing=true.`,
          { field }
        ));
      }
    }
    if (output?.requires_clarification === true) {
      concerns.push(makeConcern(
        'NORMALIZER_EMPTY_INPUT_SHOULD_NOT_REQUIRE_CLARIFICATION',
        'Empty input must not require clarification when allow_random_if_missing=true.',
        { field: 'requires_clarification' }
      ));
    }
  }

  if (explicitRandom) {
    for (const field of [...REQUEST_BLOCK_FIELDS, 'character_request']) {
      const block = output?.[field];
      if (!isPlainObject(block)) continue;
      if (block.source === 'explicit_player_random' && block.selection_mode !== 'random') {
        concerns.push(makeConcern(
          'NORMALIZER_EXPLICIT_RANDOM_NOT_RANDOM',
          `${field} has source=explicit_player_random but selection_mode is not random.`,
          { field }
        ));
      }
    }
  }

  return concerns;
}

function validateArrayField(output, field) {
  return Array.isArray(output?.[field])
    ? []
    : [makeConcern('NORMALIZER_ARRAY_FIELD_REQUIRED', `${field} must be an array.`, { field })];
}

function validateEnum(value, allowed, field, code) {
  if (allowed.includes(value)) return [];
  return [makeConcern(code, `${field} must be one of: ${allowed.join(', ')}.`, { field, value })];
}

function didPlayerProvideField(field, inputText, uiFields) {
  const text = inputText.toLowerCase();
  const hasUiValue = {
    era_request: uiFields.era,
    year_request: uiFields.era,
    season_request: null,
    time_of_day_request: null,
    region_request: uiFields.region,
    start_place_request: uiFields.start_place,
    tone_request: uiFields.tone,
    difficulty_request: uiFields.difficulty
  }[field];
  if (hasUiValue !== null && hasUiValue !== undefined && String(hasUiValue).trim().length > 0) return true;

  // This is deliberately conservative: it prevents the normalizer from marking
  // absent fields as explicit, but does not try to solve the player request.
  const regexByField = {
    era_request: /(?:xiii|13|123\d|124\d|1250|век|эпох|средневек)/iu,
    year_request: /(?:123\d|124\d|1250|год)/iu,
    season_request: /(?:зим|весн|лет|осен|сезон)/iu,
    time_of_day_request: /(?:утр|день|вечер|ноч|рассвет|сумерк)/iu,
    region_request: /(?:новгород|псков|ладог|суздал|киев|смоленск|регион|земл)/iu,
    start_place_request: /(?:город|деревн|дорог|лес|торг|монастыр|река|пристан|погост|мест|локац)/iu,
    tone_request: /(?:историч|быт|выжив|торгов|полит|бой|спокойн|тон)/iu,
    difficulty_request: /(?:сложн|трудн|суров|лёгк|легк|нормальн|хард)/iu
  };
  return Boolean(regexByField[field]?.test(text));
}

function* walkObjectKeys(value, path = 'root') {
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      yield* walkObjectKeys(item, `${path}[${index}]`);
    }
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    yield { path: nextPath, key };
    yield* walkObjectKeys(nested, nextPath);
  }
}

function hasConcreteValue(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.some((item) => hasConcreteValue(item));
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  return true;
}

function nullableString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function makeConcern(code, message, extra = {}) {
  return { code, message, ...extra };
}
