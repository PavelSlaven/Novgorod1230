import { loadRegionCatalog } from './region-catalog.js';
import { migrateSkillKeys } from './social-generation-gate.js';

export function explainJsonObjectParse(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, kind: 'json_parse', error: 'empty or non-string response' };
  }

  let data;
  try {
    data = JSON.parse(text.trim());
  } catch {
    const extracted = extractJsonObjectText(text);
    if (!extracted) {
      return { ok: false, kind: 'json_parse', error: 'response was not parseable' };
    }
    try {
      data = JSON.parse(extracted);
    } catch {
      return { ok: false, kind: 'json_parse', error: 'response was not parseable' };
    }
  }

  if (!isPlainObject(data)) {
    return {
      ok: false,
      kind: 'json_not_object',
      error: `root is ${describeValueKind(data)}, expected object`
    };
  }

  return { ok: true, data };
}

export function parseJsonObject(text) {
  const parsed = explainJsonObjectParse(text);
  return parsed.ok ? parsed.data : null;
}

export function explainPlayerSeedEnvelope(data) {
  if (!isPlainObject(data)) {
    return {
      ok: false,
      kind: 'json_not_object',
      errors: [`root: expected object, got ${describeValueKind(data)}`]
    };
  }
  if (data.schema !== 'player_seed') {
    return {
      ok: false,
      kind: 'wrong_schema',
      errors: [`wrong_schema: expected schema "player_seed", got ${describeValueSummary(data.schema)}`]
    };
  }
  if (data.version !== 1) {
    return {
      ok: false,
      kind: 'wrong_schema',
      errors: [`wrong_schema: expected version 1, got ${describeValueSummary(data.version)}`]
    };
  }
  return { ok: true, kind: 'envelope_ok', errors: [] };
}

export function resolvePlayerSeedDisplayName(identity = {}, legacyName = null) {
  const given = trimPlayerSeedName(identity.given_name ?? identity.givenName);
  const nickname = trimPlayerSeedName(identity.nickname);
  const display = trimPlayerSeedName(identity.display_name ?? identity.displayName);
  const legacy = trimPlayerSeedName(legacyName ?? identity.name);
  return display || given || nickname || legacy || 'безымянный человек';
}

export const PLAYER_SEED_COMPACT_ROOT_KEYS = [
  'version',
  'schema',
  'identity',
  'status',
  'body',
  'states',
  'attributes',
  'skills',
  'items',
  'position',
  'start_scene'
];

function extractJsonObjectText(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced && fenced[1]) {
    const fencedText = fenced[1].trim();
    if (fencedText) return fencedText;
  }

  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }

  return null;
}

export function validateMasterNarrative(data) {
  return validateContract(data, {
    schema: 'master_narrative',
    fields: {
      scene: 'string',
      consequence: 'string',
      visible_details: 'array',
      npc_reactions: 'array',
      next_pressure: 'string',
      state_delta: 'object?',
      historical_audit: 'audit?'
    }
  });
}

export function explainMasterNarrativeValidation(data) {
  return describeContractValidation(data, {
    schema: 'master_narrative',
    fields: {
      scene: 'string',
      consequence: 'string',
      visible_details: 'array',
      npc_reactions: 'array',
      next_pressure: 'string',
      state_delta: 'object?',
      historical_audit: 'audit?'
    }
  });
}

export function validateRiskAudit(data) {
  return validateContract(data, {
    schema: 'risk_audit',
    fields: {
      required: 'boolean',
      reason: 'string',
      factors: 'array',
      complexity: 'string',
      visibility: 'string'
    },
    enums: {
      complexity: ['low', 'medium', 'high', 'Low', 'Mid', 'Medium', 'High', 'Низкая', 'Средняя', 'Высокая'],
      required: [true, false]
    }
  });
}

export function explainRiskAuditValidation(data) {
  return describeContractValidation(data, {
    schema: 'risk_audit',
    fields: {
      required: 'boolean',
      reason: 'string',
      factors: 'array',
      complexity: 'string',
      visibility: 'string'
    },
    enums: {
      complexity: ['low', 'medium', 'high', 'Low', 'Mid', 'Medium', 'High', 'Низкая', 'Средняя', 'Высокая'],
      required: [true, false]
    }
  });
}

const ACTION_HINTS_CONTRACT = {
  schema: 'action_hints',
  fields: {
    hints: 'array'
  }
};

export function validateActionHintsResponse(data) {
  const envelope = normalizeActionHintsEnvelope(data);
  if (!envelope) return null;
  const validation = explainActionHintsValidation(envelope);
  if (!validation.ok) return null;
  return envelope;
}

export function explainActionHintsValidation(data) {
  const envelope = normalizeActionHintsEnvelope(data);
  if (!envelope) {
    return { ok: false, errors: ['root: expected action_hints envelope or hints array'] };
  }
  const base = describeContractValidation(envelope, ACTION_HINTS_CONTRACT);
  const errors = [...base.errors];
  const hints = Array.isArray(envelope.hints) ? envelope.hints : [];
  if (hints.length < 1 || hints.length > 5) {
    errors.push(`root.hints: expected 1..5 items, got ${hints.length}`);
  }
  for (const [index, hint] of hints.entries()) {
    const path = `root.hints[${index}]`;
    if (!isPlainObject(hint)) {
      errors.push(`${path}: expected object, got ${describeValueKind(hint)}`);
      continue;
    }
    if (findForbiddenPublicKeys(hint, path).length > 0) {
      errors.push(`${path}: contains forbidden keys`);
    }
    const text = typeof hint.text === 'string' ? hint.text.trim() : '';
    if (!text) {
      errors.push(`${path}.text: expected non-empty string`);
    }
    for (const [key, value] of Object.entries(hint)) {
      if (key === 'text' || value === null || value === undefined) continue;
      if (key !== 'tone' && key !== 'risk_hint' && key !== 'action') {
        errors.push(`${path}.${key}: unexpected field`);
        continue;
      }
      if (typeof value !== 'string') {
        errors.push(`${path}.${key}: expected string`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

function normalizeActionHintsEnvelope(data) {
  if (Array.isArray(data)) {
    return { version: 1, schema: 'action_hints', hints: data };
  }
  if (!isPlainObject(data)) return null;
  if (data.schema === 'action_hints' && Array.isArray(data.hints)) {
    return data;
  }
  return null;
}

export function validateSemanticAudit(data) {
  return describeSemanticAuditValidation(data).ok ? data : null;
}

export function explainSemanticAuditValidation(data) {
  return describeSemanticAuditValidation(data);
}

function describeSemanticAuditValidation(data) {
  const base = describeContractValidation(data, {
    schema: 'semantic_audit',
    fields: {
      pass: 'boolean',
      concerns: 'array',
      evidence: 'array'
    }
  });

  if (!base.ok) return base;

  const errors = [];
  const concerns = Array.isArray(data?.concerns) ? data.concerns : [];
  const evidence = Array.isArray(data?.evidence) ? data.evidence : [];

  if (concerns.some((item) => typeof item !== 'string' || !item.trim())) {
    errors.push('root.concerns: expected array of non-empty strings');
  }
  if (evidence.some((item) => typeof item !== 'string' || !item.trim())) {
    errors.push('root.evidence: expected array of non-empty strings');
  }
  if (data?.pass === true && concerns.length > 0) {
    errors.push('root.concerns: expected empty array when pass is true');
  }
  if (data?.pass === false && concerns.length === 0) {
    errors.push('root.concerns: expected at least 1 item when pass is false');
  }
  if (data?.pass === false && evidence.length === 0) {
    errors.push('root.evidence: expected at least 1 item when pass is false');
  }

  return errors.length ? { ok: false, errors } : base;
}

export function buildSemanticAuditOutputContract() {
  return {
    schema: 'semantic_audit',
    version: 1,
    allowedRootKeys: ['version', 'schema', 'pass', 'concerns', 'evidence'],
    requiredKeys: ['version', 'schema', 'pass', 'concerns', 'evidence'],
    fields: {
      version: { type: 'number', required: true, value: 1 },
      schema: { type: 'string', required: true, value: 'semantic_audit' },
      pass: { type: 'boolean', required: true },
      concerns: { type: 'array', required: true, itemType: 'string' },
      evidence: { type: 'array', required: true, itemType: 'string' }
    }
  };
}

export function getSemanticAuditCanonicalExample() {
  return {
    version: 1,
    schema: 'semantic_audit',
    pass: true,
    concerns: [],
    evidence: ['dossier stays within approved visible context']
  };
}

export function evaluateSemanticAuditCandidate(normalizedObject) {
  const validation = explainSemanticAuditValidation(normalizedObject);
  return {
    ok: validation.ok === true && Boolean(validateSemanticAudit(normalizedObject)),
    validation
  };
}

export function buildSemanticAuditRepairMessages(context = {}) {
  const outputContract = buildSemanticAuditOutputContract();
  const canonicalExample = getSemanticAuditCanonicalExample();
  return [
    {
      role: 'system',
      content: [
        'Ты SemanticAuditRepairer для исторической RPG XIII века.',
        'Верни полный исправленный JSON object semantic_audit.',
        'Не объясняй. Не возвращай markdown.',
        'Исправь все validationErrors одновременно.',
        'Если pass=true, concerns должен быть пустым массивом, а evidence может быть пустым.',
        'Если pass=false, concerns и evidence должны быть непустыми массивами строк.',
        'schema must be exactly "semantic_audit", version must be 1.'
      ].join('\n')
    },
    {
      role: 'user',
      content: JSON.stringify({
        version: 1,
        schema: 'semantic_audit_repair',
        kind: context.kind ?? 'semantic_audit',
        dossier: context.dossier ?? null,
        visiblePackage: context.visiblePackage ?? null,
        previousAudit: context.previousAudit ?? null,
        auditText: context.auditText ?? null,
        validationErrors: Array.isArray(context.validationErrors) ? context.validationErrors : [],
        outputContract,
        canonicalExample,
        antiRegressionRules: [
          'schema must be exactly "semantic_audit"',
          'version must be 1',
          'pass is boolean',
          'pass=true requires concerns=[]',
          'pass=false requires non-empty concerns and evidence string arrays'
        ]
      })
    }
  ];
}

export function validateActorProfiles(data) {
  return describeActorProfilesValidation(data).ok ? data : null;
}

export function explainActorProfilesValidation(data) {
  return describeActorProfilesValidation(data);
}

function describeActorProfilesValidation(data) {
  const base = describeContractValidation(data, {
    schema: 'actor_profiles',
    exact: true,
    fields: {
      player: 'object?',
      npcs: 'array'
    }
  });

  if (!base.ok) return base;

  const errors = [];

  if (isPlainObject(data?.player) && data.player.profileLevel !== undefined && !isActorProfileLevel(data.player.profileLevel)) {
    errors.push(`root.player.profileLevel: expected one of ${ACTOR_PROFILE_LEVELS.join(', ')}, got ${describeValueSummary(data.player.profileLevel)}`);
  }

  const npcs = Array.isArray(data?.npcs) ? data.npcs : [];
  for (const [index, npc] of npcs.entries()) {
    const path = `root.npcs[${index}]`;
    if (!isPlainObject(npc)) {
      errors.push(`${path}: expected object, got ${describeValueKind(npc)}`);
      continue;
    }
    if (npc.profileLevel === undefined || npc.profileLevel === null) {
      errors.push(`${path}.profileLevel: expected one of ${ACTOR_PROFILE_LEVELS.join(', ')}, got ${npc.profileLevel === undefined ? 'missing' : 'null'}`);
      continue;
    }
    if (!isActorProfileLevel(npc.profileLevel)) {
      errors.push(`${path}.profileLevel: expected one of ${ACTOR_PROFILE_LEVELS.join(', ')}, got ${describeValueSummary(npc.profileLevel)}`);
    }
  }

  return errors.length ? { ok: false, errors } : base;
}

const ACTOR_PROFILE_LEVELS = ['background', 'scene', 'key'];

function isActorProfileLevel(value) {
  return typeof value === 'string' && ACTOR_PROFILE_LEVELS.includes(value);
}

export function validateLocationProfiles(data) {
  return validateContract(data, {
    schema: 'location_profiles',
    exact: true,
    fields: {
      locations: 'array'
    }
  });
}

export function explainLocationProfilesValidation(data) {
  return describeContractValidation(data, {
    schema: 'location_profiles',
    exact: true,
    fields: {
      locations: 'array'
    }
  });
}

export function validateSocialTissue(data) {
  const parsed = validateContract(data, {
    schema: 'social_tissue',
    fields: {
      formalOwner: 'string',
      actualManager: 'string',
      dependentGroups: 'array',
      families: 'array',
      trade: 'array',
      rumors: 'array',
      tensions: 'array',
      obligations: 'array',
      rhythm: 'string',
      accessRules: 'array'
    }
  });
  if (!parsed) return null;
  for (const key of ['families', 'rumors', 'tensions', 'obligations', 'trade', 'dependentGroups']) {
    if (!validateSocialFactEntries(parsed[key])) return null;
  }
  return parsed;
}

function validateSocialFactEntries(entries) {
  if (!Array.isArray(entries)) return true;
  for (const entry of entries) {
    if (typeof entry !== 'string' || !entry.trim()) return false;
    if (entry && typeof entry === 'object') return false;
  }
  return true;
}

export function explainSocialTissueValidation(data) {
  const base = describeContractValidation(data, {
    schema: 'social_tissue',
    fields: {
      formalOwner: 'string',
      actualManager: 'string',
      dependentGroups: 'array',
      families: 'array',
      trade: 'array',
      rumors: 'array',
      tensions: 'array',
      obligations: 'array',
      rhythm: 'string',
      accessRules: 'array'
    }
  });
  if (!base.ok) return base;
  const errors = [];
  for (const key of ['families', 'rumors', 'tensions', 'obligations', 'trade', 'dependentGroups', 'accessRules']) {
    const entries = data?.[key];
    if (!Array.isArray(entries)) continue;
    for (const [index, entry] of entries.entries()) {
      if (typeof entry !== 'string' || !entry.trim()) {
        errors.push(`root.${key}[${index}]: expected non-empty string, got ${describeValueKind(entry)}`);
      }
    }
  }
  return errors.length ? { ok: false, errors } : base;
}

export function validateStateDiffContract(data) {
  return validateContract(data, {
    schema: 'state_delta',
    fields: {
      patch: 'object',
      handles: 'object?',
      source: 'string?',
      createdAt: 'string?'
    }
  });
}

export function explainStateDiffValidation(data) {
  return describeContractValidation(data, {
    schema: 'state_delta',
    fields: {
      patch: 'object',
      handles: 'object?',
      source: 'string?',
      createdAt: 'string?'
    }
  });
}

const HISTORICAL_FRAME_CONTRACT = {
  schema: 'historical_frame',
  fields: {
    year: 'number',
    season: 'string',
    regionName: 'string',
    regionHint: 'string',
    settlementType: 'string',
    pressure: 'string',
    conflict: 'string',
    startTextHint: 'string'
  }
};

const HISTORICAL_FRAME_YEAR_MIN = 1230;
const HISTORICAL_FRAME_YEAR_MAX = 1250;
const HISTORICAL_FRAME_SEASONS = new Set([
  'весна', 'лето', 'осень', 'зима', 'половодье', 'распутица',
  'spring', 'summer', 'autumn', 'fall', 'winter', 'flood', 'mud'
]);

const HISTORICAL_FRAME_DISPUTED_FIELD_EXAMPLES = {
  pressure: {
    type: 'string',
    note: 'single compact phrase; merge multiple dossier pressure items into one string; never array',
    example: 'поток беженцев и нехватка припасов после монгольского нашествия',
    wrongExample: ['беженцы', 'нехватка припасов']
  },
  conflict: {
    type: 'string',
    note: 'single compact phrase; merge multiple dossier conflict items into one string; never array',
    example: 'противостояние посадников и купеческих кругов',
    wrongExample: ['посадники vs оборона', 'купцы vs торговля']
  },
  regionHint: {
    type: 'string',
    note: 'catalog-compatible region name or subregion hint; never settlement type like "сельское поселение"',
    example: 'Новгородская земля',
    wrongExample: 'сельское поселение'
  },
  settlementType: {
    type: 'string',
    note: 'settlement category only; may contain "сельское поселение"; never use as regionHint',
    example: 'сельское поселение'
  }
};

export function explainHistoricalFrameEnvelope(data) {
  if (!isPlainObject(data)) {
    return {
      ok: false,
      kind: 'json_not_object',
      errors: [`root: expected object, got ${describeValueKind(data)}`]
    };
  }
  if (data.schema !== 'historical_frame') {
    return {
      ok: false,
      kind: 'wrong_schema',
      errors: [`wrong_schema: expected schema "historical_frame", got ${describeValueSummary(data.schema)}`]
    };
  }
  if (data.version !== 1) {
    return {
      ok: false,
      kind: 'wrong_schema',
      errors: [`wrong_schema: expected version 1, got ${describeValueSummary(data.version)}`]
    };
  }
  return { ok: true, kind: 'envelope_ok', errors: [] };
}

export function buildHistoricalFrameOutputContract() {
  const allowedRootKeys = ['version', 'schema', ...Object.keys(HISTORICAL_FRAME_CONTRACT.fields)];
  const fields = {
    version: { type: 'number', required: true, value: 1 },
    schema: { type: 'string', required: true, value: 'historical_frame' },
    year: {
      type: 'number',
      required: true,
      min: HISTORICAL_FRAME_YEAR_MIN,
      max: HISTORICAL_FRAME_YEAR_MAX
    },
    season: {
      type: 'string',
      required: true,
      enum: [...HISTORICAL_FRAME_SEASONS]
    },
    regionName: {
      type: 'string',
      required: true,
      note: 'exact world_regions catalog name'
    },
    regionHint: {
      type: 'string',
      required: true,
      note: HISTORICAL_FRAME_DISPUTED_FIELD_EXAMPLES.regionHint.note
    },
    settlementType: {
      type: 'string',
      required: true,
      note: HISTORICAL_FRAME_DISPUTED_FIELD_EXAMPLES.settlementType.note
    },
    pressure: {
      type: 'string',
      required: true,
      note: HISTORICAL_FRAME_DISPUTED_FIELD_EXAMPLES.pressure.note
    },
    conflict: {
      type: 'string',
      required: true,
      note: HISTORICAL_FRAME_DISPUTED_FIELD_EXAMPLES.conflict.note
    },
    startTextHint: { type: 'string', required: true }
  };

  return {
    schema: 'historical_frame',
    version: 1,
    allowedRootKeys,
    requiredKeys: Object.entries(fields).filter(([, spec]) => spec.required).map(([key]) => key),
    fields,
    disputedFields: { ...HISTORICAL_FRAME_DISPUTED_FIELD_EXAMPLES }
  };
}

export function getHistoricalFrameCanonicalExample() {
  return {
    version: 1,
    schema: 'historical_frame',
    year: 1238,
    season: 'осень',
    regionName: 'Новгородская земля',
    regionHint: 'Новгородская земля',
    settlementType: 'сельское поселение',
    pressure: 'поток беженцев и нехватка припасов после монгольского нашествия',
    conflict: 'противостояние посадников и купеческих кругов',
    startTextHint: '1238 год, Новгородская земля, осень'
  };
}

export function buildHistoricalFrameAntiRegressionRules() {
  return [
    'pressure: string, never array; merge multiple dossier items into one compact string',
    'conflict: string, never array; merge multiple dossier items into one compact string',
    'regionName: must exactly match world_regions catalog entry name',
    'regionHint: catalog-compatible region hint; never settlement type',
    'settlementType: may contain "сельское поселение"; never copy into regionHint',
    'year: integer 1230..1250',
    'season: known season enum only'
  ];
}

export function mergeHistoricalFrameValidationErrors(accumulated = [], fresh = []) {
  const merged = [...(Array.isArray(accumulated) ? accumulated : []), ...(Array.isArray(fresh) ? fresh : [])].filter(Boolean);
  return [...new Set(merged)];
}

export function validateHistoricalFrame(data) {
  return explainHistoricalFrameValidation(data).ok ? data : null;
}

export function explainHistoricalFrameValidation(data) {
  const shape = describeContractValidation(data, HISTORICAL_FRAME_CONTRACT);
  if (!shape.ok) return shape;
  return describeHistoricalFrameSemanticValidation(data);
}

function describeHistoricalFrameSemanticValidation(data) {
  const errors = [];
  const year = data?.year;
  if (!Number.isInteger(year) || year < HISTORICAL_FRAME_YEAR_MIN || year > HISTORICAL_FRAME_YEAR_MAX) {
    errors.push(`root.year: expected integer ${HISTORICAL_FRAME_YEAR_MIN}..${HISTORICAL_FRAME_YEAR_MAX}, got ${describeValueSummary(year)}`);
  }

  const season = normalizeHistoricalSeason(data?.season);
  if (!season || !HISTORICAL_FRAME_SEASONS.has(season)) {
    errors.push(`root.season: expected known season, got ${describeValueSummary(data?.season)}`);
  }

  if (!matchesHistoricalRegionCatalog(data?.regionName, data?.regionHint)) {
    errors.push('root.regionName: regionName/regionHint must match world_regions catalog');
  }

  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

function normalizeHistoricalSeason(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function normalizeHistoricalRegionName(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function matchesHistoricalRegionCatalog(regionName, regionHint) {
  const names = loadRegionCatalog()
    .map((entry) => normalizeHistoricalRegionName(entry?.name))
    .filter(Boolean);
  if (!names.length) return true;
  const candidates = [regionName, regionHint]
    .map((value) => normalizeHistoricalRegionName(value))
    .filter(Boolean);
  if (!candidates.length) return false;
  return candidates.some((candidate) => names.some((name) => regionNamesMatch(candidate, name)));
}

function regionNamesMatch(candidate, catalogName) {
  if (!candidate || !catalogName) return false;
  if (catalogName.includes(candidate) || candidate.includes(catalogName)) return true;
  const stopWords = new Set(['регион', 'земля', 'побережье', 'пограничье', 'область', 'край']);
  const words = candidate.split(' ').filter((word) => word.length >= 5 && !stopWords.has(word));
  return words.some((word) => {
    const stem = word.slice(0, Math.min(word.length, 8));
    return stem.length >= 5 && catalogName.includes(stem);
  });
}

export function validatePlaceSeed(data) {
  return validateContract(data, {
    schema: 'place_seed',
    exact: true,
    fields: {
      placeName: 'string',
      placeKind: 'string',
      purpose: 'string',
      formalOwner: 'string',
      actualManager: 'string',
      dependentGroups: 'array',
      livelihood: 'array',
      roads: 'array',
      accessRules: 'array',
      hazards: 'array',
      rhythm: 'string'
    }
  });
}

export function explainPlaceSeedValidation(data) {
  return describeContractValidation(data, {
    schema: 'place_seed',
    exact: true,
    fields: {
      placeName: 'string',
      placeKind: 'string',
      purpose: 'string',
      formalOwner: 'string',
      actualManager: 'string',
      dependentGroups: 'array',
      livelihood: 'array',
      roads: 'array',
      accessRules: 'array',
      hazards: 'array',
      rhythm: 'string'
    }
  });
}

const PLACE_SEED_CONTRACT_FIELDS = {
  placeName: 'string',
  placeKind: 'string',
  purpose: 'string',
  formalOwner: 'string',
  actualManager: 'string',
  dependentGroups: 'array',
  livelihood: 'array',
  roads: 'array',
  accessRules: 'array',
  hazards: 'array',
  rhythm: 'string'
};

export function buildPlaceSeedOutputContract() {
  const allowedRootKeys = ['version', 'schema', ...Object.keys(PLACE_SEED_CONTRACT_FIELDS)];
  const fields = {
    version: { type: 'number', required: true, value: 1 },
    schema: { type: 'string', required: true, value: 'place_seed' }
  };
  for (const [key, kind] of Object.entries(PLACE_SEED_CONTRACT_FIELDS)) {
    fields[key] = { type: kind === 'array' ? 'array' : 'string', required: true, itemType: kind === 'array' ? 'string' : undefined };
  }
  return {
    schema: 'place_seed',
    version: 1,
    allowedRootKeys,
    requiredKeys: Object.entries(fields).filter(([, spec]) => spec.required).map(([key]) => key),
    fields,
    disputedFields: {
      rhythm: { type: 'string', note: 'single compact string; collapse dossier RHYTHM lines into one sentence', wrongExample: ['утро', 'вечер'] },
      dependentGroups: { type: 'array', itemType: 'string', note: 'string[] only; never structured objects' }
    }
  };
}

export function getPlaceSeedCanonicalExample() {
  return {
    version: 1,
    schema: 'place_seed',
    placeName: 'Переправа на Шелони',
    placeKind: 'дорожный двор',
    purpose: 'переправа и ночлег для путников',
    formalOwner: 'княжеский наместник',
    actualManager: 'дворовой староста',
    dependentGroups: ['плотники', 'перевозчики'],
    livelihood: ['переправа', 'ремонт мостов'],
    roads: ['шлях на Новгород', 'тропа к реке'],
    accessRules: ['ночной проход только с разрешения'],
    hazards: ['половодье', 'разбойники на тракте'],
    rhythm: 'утром суета у воды, к вечеру двор затихает'
  };
}

export function buildPlaceSeedAntiRegressionRules() {
  return [
    'schema must be exactly "place_seed" and version must be 1',
    'placeName, placeKind, purpose, formalOwner, actualManager, rhythm: strings only',
    'dependentGroups, livelihood, roads, accessRules, hazards: string[] only; never objects',
    'rhythm: one compact string, never array',
    'do not invent placeName/placeKind when fragments omit them'
  ];
}

export function mergePlaceSeedValidationErrors(accumulated = [], fresh = []) {
  const merged = [...(Array.isArray(accumulated) ? accumulated : []), ...(Array.isArray(fresh) ? fresh : [])].filter(Boolean);
  return [...new Set(merged)];
}

export function evaluatePlaceSeedCandidate(normalizedObject) {
  const validation = explainPlaceSeedValidation(normalizedObject);
  return {
    ok: validation.ok === true,
    validation
  };
}

const SOCIAL_TISSUE_CONTRACT_FIELDS = {
  formalOwner: 'string',
  actualManager: 'string',
  dependentGroups: 'array',
  families: 'array',
  trade: 'array',
  rumors: 'array',
  tensions: 'array',
  obligations: 'array',
  rhythm: 'string',
  accessRules: 'array'
};

export function buildSocialTissueOutputContract() {
  const allowedRootKeys = ['version', 'schema', ...Object.keys(SOCIAL_TISSUE_CONTRACT_FIELDS)];
  const fields = {
    version: { type: 'number', required: true, value: 1 },
    schema: { type: 'string', required: true, value: 'social_tissue' }
  };
  for (const [key, kind] of Object.entries(SOCIAL_TISSUE_CONTRACT_FIELDS)) {
    fields[key] = { type: kind === 'array' ? 'array' : 'string', required: true, itemType: kind === 'array' ? 'string' : undefined };
  }
  return {
    schema: 'social_tissue',
    version: 1,
    allowedRootKeys,
    requiredKeys: Object.entries(fields).filter(([, spec]) => spec.required).map(([key]) => key),
    fields,
    disputedFields: {
      families: { type: 'array', itemType: 'string', note: 'string[] only; visibility/source belong in dossier, not JSON objects' },
      rumors: { type: 'array', itemType: 'string', note: 'string[] only' },
      tensions: { type: 'array', itemType: 'string', note: 'string[] only' }
    }
  };
}

export function getSocialTissueCanonicalExample() {
  return {
    version: 1,
    schema: 'social_tissue',
    formalOwner: 'княжеский наместник',
    actualManager: 'дворовой староста',
    dependentGroups: ['плотники', 'перевозчики'],
    families: ['семья перевозчика у воды'],
    trade: ['плата за переправу'],
    rumors: ['ходят слухи о разбойниках на шляхе'],
    tensions: ['спор о праве сбора пошлины'],
    obligations: ['двор обязан принимать княжеских гонцов'],
    rhythm: 'утром суета, к вечеру двор затихает',
    accessRules: ['ночной проход только с разрешения']
  };
}

export function buildSocialTissueAntiRegressionRules() {
  return [
    'families, trade, rumors, tensions, obligations, dependentGroups, accessRules: string[] only; never objects with visibility/source',
    'formalOwner, actualManager, rhythm: strings only',
    'do not return frame, sourceDossier, audit as root keys'
  ];
}

export function mergeSocialTissueValidationErrors(accumulated = [], fresh = []) {
  return mergePlaceSeedValidationErrors(accumulated, fresh);
}

export function evaluateSocialTissueCandidate(normalizedObject) {
  const validation = explainSocialTissueValidation(normalizedObject);
  return {
    ok: validation.ok === true && Boolean(validateSocialTissue(normalizedObject)),
    validation
  };
}

export function buildActorProfilesOutputContract() {
  return {
    schema: 'actor_profiles',
    version: 1,
    allowedRootKeys: ['version', 'schema', 'player', 'npcs'],
    requiredKeys: ['version', 'schema', 'npcs'],
    fields: {
      version: { type: 'number', required: true, value: 1 },
      schema: { type: 'string', required: true, value: 'actor_profiles' },
      player: { type: 'object', required: false },
      npcs: { type: 'array', required: true, itemType: 'object', note: 'each npc must include profileLevel: background|scene|key' }
    },
    disputedFields: {
      profileLevel: { type: 'string', enum: ['background', 'scene', 'key'], note: 'required on every npc' }
    }
  };
}

export function getActorProfilesCanonicalExample() {
  return {
    version: 1,
    schema: 'actor_profiles',
    player: { name: 'Олех', profileLevel: 'key', role: 'плотник' },
    npcs: [
      { id: 'npc:loc:yard:0', name: 'Мирон', profileLevel: 'scene', role: 'перевозчик', neighbors: [], enemies: [] }
    ]
  };
}

export function buildActorProfilesAntiRegressionRules() {
  return [
    'schema must be exactly "actor_profiles"',
    'every npc needs profileLevel background|scene|key',
    'do not invent neighbors, enemies, manner, speech when dossier omits them'
  ];
}

export function mergeActorProfilesValidationErrors(accumulated = [], fresh = []) {
  return mergePlaceSeedValidationErrors(accumulated, fresh);
}

export function evaluateActorProfilesCandidate(normalizedObject) {
  const validation = explainActorProfilesValidation(normalizedObject);
  return {
    ok: validation.ok === true && Boolean(validateActorProfiles(normalizedObject)),
    validation
  };
}

export function buildLocationProfilesOutputContract() {
  return {
    schema: 'location_profiles',
    version: 1,
    allowedRootKeys: ['version', 'schema', 'locations'],
    requiredKeys: ['version', 'schema', 'locations'],
    fields: {
      version: { type: 'number', required: true, value: 1 },
      schema: { type: 'string', required: true, value: 'location_profiles' },
      locations: {
        type: 'array',
        required: true,
        itemType: 'object',
        note: 'each location: id, purpose, access, ownership, hazards, rhythm, materialScene'
      }
    }
  };
}

export function getLocationProfilesCanonicalExample() {
  return {
    version: 1,
    schema: 'location_profiles',
    locations: [{
      id: 'loc:yard',
      purpose: 'переправа и ночлег',
      access: 'свободный днём, ночью по звонку',
      ownership: 'княжеский двор',
      hazards: ['скользкий наст'],
      rhythm: 'утренняя суета у воды',
      materialScene: 'мостки, сарай, кострище'
    }]
  };
}

export function buildLocationProfilesAntiRegressionRules() {
  return [
    'locations[] items must include id',
    'do not invent purpose/ownership when dossier omits them',
    'partial profiles must surface as validation errors, not code infer*'
  ];
}

export function mergeLocationProfilesValidationErrors(accumulated = [], fresh = []) {
  return mergePlaceSeedValidationErrors(accumulated, fresh);
}

export function evaluateLocationProfilesCandidate(normalizedObject) {
  const validation = explainLocationProfilesValidation(normalizedObject);
  return {
    ok: validation.ok === true && Boolean(validateLocationProfiles(normalizedObject)),
    validation
  };
}

export function buildMasterNarrativeOutputContract() {
  return {
    schema: 'master_narrative',
    version: 1,
    allowedRootKeys: ['version', 'schema', 'scene', 'consequence', 'visible_details', 'npc_reactions', 'npc_reaction_refs', 'next_pressure', 'state_delta', 'historical_audit'],
    requiredKeys: ['version', 'schema', 'scene', 'consequence', 'visible_details', 'npc_reactions', 'next_pressure'],
    fields: {
      version: { type: 'number', required: true, value: 1 },
      schema: { type: 'string', required: true, value: 'master_narrative' },
      scene: { type: 'string', required: true },
      consequence: { type: 'string', required: true },
      visible_details: { type: 'array', required: true, itemType: 'string' },
      npc_reactions: { type: 'array', required: true, itemType: 'string' },
      npc_reaction_refs: {
        type: 'array',
        required: false,
        itemType: 'object',
        note: 'internal refs only: actor_ref, reaction_text, source_stage, visibility_status, approved'
      },
      next_pressure: { type: 'string', required: true },
      state_delta: { type: 'object', required: false, note: 'no unapproved NPC ids or facts not in frame' }
    },
    disputedFields: {
      state_delta: { note: 'patch only approved handles; no new npc ids without frame approval' }
    }
  };
}

export function getMasterNarrativeCanonicalExample() {
  return {
    version: 1,
    schema: 'master_narrative',
    scene: 'Двор у переправы живёт своим утренним порядком.',
    consequence: 'Персонаж видит только то, что доступно с места.',
    visible_details: ['мокрые мостки', 'дым из сарая'],
    npc_reactions: ['перевозчик кивает молча'],
    next_pressure: 'очередь к воде сгущается',
    npc_reaction_refs: [{
      actor_ref: 'npc:ferryman',
      reaction_text: 'перевозчик кивает молча',
      source_stage: 'npc_materialization',
      visibility_status: 'visible',
      approved: true
    }],
    state_delta: {}
  };
}

export function buildMasterNarrativeAntiRegressionRules() {
  return [
    'visible_details and npc_reactions: string[] only',
    'state_delta must not introduce unapproved npc ids or facts',
    'no procedural fallback scene strings'
  ];
}

export function mergeMasterNarrativeValidationErrors(accumulated = [], fresh = []) {
  return mergePlaceSeedValidationErrors(accumulated, fresh);
}

export function evaluateMasterNarrativeCandidate(normalizedObject) {
  const validation = explainMasterNarrativeValidation(normalizedObject);
  return {
    ok: validation.ok === true && Boolean(validateMasterNarrative(normalizedObject)),
    validation
  };
}

export function buildVisibleContextOutputContract() {
  return {
    schema: 'visible_context_package',
    version: 1,
    allowedRootKeys: [
      'version',
      'schema',
      'visible_scene',
      'visible_changes',
      'sensory_details',
      'visible_npc',
      'visible_objects',
      'known_context',
      'uncertainties',
      'allowed_tensions',
      'do_not_imply'
    ],
    requiredKeys: ['version', 'schema', 'visible_scene'],
    fields: {
      version: { type: 'number', required: true, value: 1 },
      schema: { type: 'string', required: true, value: 'visible_context_package' },
      visible_scene: { type: 'string', required: true },
      visible_changes: { type: 'array', required: false, itemType: 'string' },
      sensory_details: { type: 'array', required: false, itemType: 'string' },
      visible_npc: {
        type: 'array',
        required: false,
        itemType: 'object',
        note: 'each: name_or_label, source_ref, visible_status?, known_to_character?, possible_interaction?'
      },
      visible_objects: { type: 'array', required: false },
      known_context: { type: 'array', required: false, itemType: 'string' },
      uncertainties: { type: 'array', required: false, itemType: 'string' },
      allowed_tensions: { type: 'array', required: false, itemType: 'string' },
      do_not_imply: { type: 'array', required: false, itemType: 'string' }
    },
    disputedFields: {
      visible_npc: { note: 'only npc visible in scene; no hidden motives' },
      do_not_imply: { note: 'future events and hidden facts stay out of prose' }
    }
  };
}

export function getVisibleContextCanonicalExample() {
  return {
    version: 1,
    schema: 'visible_context_package',
    visible_scene: 'Двор у переправы живёт утренним порядком.',
    visible_changes: ['дым из сарая'],
    sensory_details: ['мокрые мостки', 'холодный ветер'],
    visible_npc: [{ name_or_label: 'перевозчик', visible_status: 'у воды', known_to_character: true }],
    visible_objects: ['ворота', 'кострище'],
    known_context: ['переправа платная днём'],
    uncertainties: ['кто сегодня сторожит ворота — неясно'],
    allowed_tensions: ['очередь к воде сгущается'],
    do_not_imply: ['скрытые мотивы хозяина', 'будущие набеги']
  };
}

export function buildVisibleContextAntiRegressionRules() {
  return [
    'schema must be exactly "visible_context_package"',
    'visible_scene required; string arrays only in visible_changes, sensory_details, known_context, uncertainties, allowed_tensions, do_not_imply',
    'do not return dossier, audit, hidden, state_delta as root keys'
  ];
}

export function mergeVisibleContextValidationErrors(accumulated = [], fresh = []) {
  return mergePlaceSeedValidationErrors(accumulated, fresh);
}

export function explainVisibleContextValidation(data) {
  const errors = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, errors: ['visible_context_package must be an object'] };
  }
  if (data.version !== 1) errors.push('version must be 1');
  if (data.schema !== 'visible_context_package') errors.push('schema must be visible_context_package');
  if (!String(data.visible_scene ?? '').trim()) errors.push('visible_scene is required');
  const contract = buildVisibleContextOutputContract();
  for (const key of Object.keys(data)) {
    if (!contract.allowedRootKeys.includes(key)) {
      errors.push(`forbidden key: ${key}`);
    }
  }
  for (const [field, spec] of Object.entries({
    visible_changes: 'string',
    sensory_details: 'string',
    known_context: 'string',
    uncertainties: 'string',
    allowed_tensions: 'string',
    do_not_imply: 'string'
  })) {
    if (data[field] === undefined || data[field] === null) continue;
    if (!Array.isArray(data[field])) {
      errors.push(`${field}: expected array`);
      continue;
    }
    for (const [index, item] of data[field].entries()) {
      if (typeof item !== 'string' || !String(item).trim()) {
        errors.push(`${field}[${index}]: expected non-empty string`);
      }
    }
  }
  if (data.visible_npc !== undefined && data.visible_npc !== null && !Array.isArray(data.visible_npc)) {
    errors.push('visible_npc: expected array');
  }
  if (Array.isArray(data.visible_npc)) {
    for (const [index, item] of data.visible_npc.entries()) {
      const path = `visible_npc[${index}]`;
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        errors.push(`${path}: expected object`);
        continue;
      }
      if (!String(item.name_or_label ?? item.name ?? item.label ?? '').trim()) {
        errors.push(`${path}.name_or_label: expected non-empty string`);
      }
      if (!String(item.source_ref ?? '').trim()) {
        errors.push(`${path}.source_ref: expected non-empty string`);
      }
    }
  }
  if (data.visible_objects !== undefined && data.visible_objects !== null && !Array.isArray(data.visible_objects)) {
    errors.push('visible_objects: expected array');
  }
  const serialized = JSON.stringify(data).toLowerCase();
  for (const token of ['hidden_state', 'hidden', 'sourceDossier', 'audit', 'state_delta', 'dossier']) {
    if (serialized.includes(token.toLowerCase())) {
      errors.push(`package must not contain ${token}`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

export function evaluateVisibleContextCandidate(normalizedObject) {
  const validation = explainVisibleContextValidation(normalizedObject);
  return {
    ok: validation.ok === true,
    validation
  };
}

export function validatePlayerSeed(data) {
  return describePlayerSeedValidation(data).ok ? data : null;
}

export function validatePlayerSeedCompact(data) {
  return explainPlayerSeedCompactValidation(data).ok ? data : null;
}

export function explainPlayerSeedValidation(data) {
  return describePlayerSeedValidation(data);
}

export function explainPlayerSeedCompactValidation(data) {
  const envelope = explainPlayerSeedEnvelope(data);
  if (!envelope.ok) {
    return { ok: false, kind: envelope.kind, errors: envelope.errors };
  }

  const errors = [];
  if (!hasTextValue(data?.status)) {
    errors.push('root.status: expected non-empty string');
  }
  if (data?.skills !== undefined && data?.skills !== null && !Array.isArray(data.skills)) {
    errors.push('root.skills: expected array');
  }
  errors.push(...describePlayerSeedIdentityValidation(data?.identity, data?.name).errors);
  errors.push(...describePlayerSeedCompactBodyValidation(data?.body).errors);
  errors.push(...describePlayerSeedCompactStatesValidation(data?.states).errors);
  errors.push(...describePlayerSeedAttributesValidation(data?.attributes).errors);
  errors.push(...describePlayerSeedPositionValidation('root.position', data?.position).errors);
  errors.push(...describePlayerSeedStartSceneValidation(data?.start_scene).errors);
  if (!isPlainObject(data?.items)) {
    errors.push('root.items: expected object');
  }

  return errors.length
    ? { ok: false, kind: 'validation', errors }
    : { ok: true, kind: 'validation_ok', errors: [] };
}

function describePlayerSeedValidation(data) {
  const base = describeContractValidation(data, {
    schema: 'player_seed',
    exact: true,
    fields: {
      name: 'string',
      role: 'string',
      status: 'string',
      socialClass: 'string',
      ageRange: 'string',
      origin: 'string',
      visibleStatus: 'string',
      trueStatus: 'string',
      reasonHere: 'string',
      occupation: 'string?',
      skills: 'array?',
      bodyState: 'string',
      language: 'string',
      literacy: 'string',
      clothing: 'string',
      inventory: 'array?',
      family: 'array',
      property: 'array?',
      memory: 'array',
      knowledge: 'array',
      fears: 'array',
      goals: 'array',
      obligations: 'array',
      identity: 'object',
      body: 'object',
      states: 'object',
      activeStates: 'array?',
      attributes: 'object',
      skill_bonuses: 'object',
      knowledge_map: 'object',
      memory_profile: 'object',
      goals_profile: 'object',
      items: 'object',
      property_and_access: 'object',
      relations: 'object',
      position: 'object',
      current_position: 'object',
      start_scene: 'object'
    }
  });

  if (!base.ok) {
    const errors = base.errors.map((error) => (
      error === 'root.skill_bonuses: expected object, got array'
        ? 'root.skill_bonuses: expected object (canonical mechanical map), got array; skills is legacy display adapter (string[]), skill_bonuses must never be array'
        : error
    ));
    return { ok: false, errors };
  }

  const errors = [];
  if (Array.isArray(data?.inventory)) {
    errors.push('root.inventory: legacy inventory array is not allowed when canonical items block is present');
  }
  if (Array.isArray(data?.property)) {
    errors.push('root.property: legacy property array is not allowed when canonical property_and_access block is present');
  }

  errors.push(...describePlayerSeedCanonicalValidation(data).errors);

  return errors.length ? { ok: false, errors } : base;
}

const PLAYER_ATTRIBUTE_KEYS = ['strength', 'agility', 'endurance', 'reason', 'attention', 'influence'];
const PLAYER_SKILL_KEYS = ['athletics', 'stealth', 'melee_combat', 'ranged_combat', 'craft', 'household', 'survival', 'travel_transport', 'healing', 'observation', 'communication_trade', 'custom_law_literacy'];
const PLAYER_COMBAT_SKILL_KEYS = ['athletics', 'stealth', 'melee_combat', 'ranged_combat'];
const PLAYER_KNOWLEDGE_MAP_KEYS = ['known_facts', 'rumors', 'mistakes', 'unavailable_knowledge', 'known_places', 'known_routes', 'known_people'];
const PLAYER_MEMORY_PROFILE_KEYS = ['key_memories', 'debts', 'fears', 'obligations', 'unresolved_unknowns'];
const PLAYER_GOALS_PROFILE_KEYS = ['immediate_need', 'long_term_desire', 'fear', 'obligation', 'reason_to_act', 'consequence_of_inaction'];
const PLAYER_RELATION_KEYS = ['known_npcs', 'patrons', 'debtors', 'creditors', 'enemies', 'witnesses', 'helpers', 'blockers'];
const PLAYER_POSITION_KEYS = ['region_id', 'place_id', 'location_id', 'minilocation_id', 'anchor_id', 'last_route_id'];
const PLAYER_START_SCENE_KEYS = ['reason_here', 'visible_situation', 'nearby_people', 'immediate_tension', 'intro_prose'];

const PLAYER_SEED_LEGACY_ROOT_FIELDS = {
  name: 'string',
  role: 'string',
  status: 'string',
  socialClass: 'string',
  ageRange: 'string',
  origin: 'string',
  visibleStatus: 'string',
  trueStatus: 'string',
  reasonHere: 'string',
  occupation: 'string?',
  skills: 'array?',
  bodyState: 'string',
  language: 'string',
  literacy: 'string',
  clothing: 'string',
  inventory: 'array?',
  family: 'array',
  property: 'array?',
  memory: 'array',
  knowledge: 'array',
  fears: 'array',
  goals: 'array',
  obligations: 'array'
};

const PLAYER_SEED_CANONICAL_ROOT_FIELDS = {
  identity: 'object',
  body: 'object',
  states: 'object',
  activeStates: 'array?',
  attributes: 'object',
  skill_bonuses: 'object',
  knowledge_map: 'object',
  memory_profile: 'object',
  goals_profile: 'object',
  items: 'object',
  property_and_access: 'object',
  relations: 'object',
  position: 'object',
  current_position: 'object',
  start_scene: 'object'
};

const PLAYER_SEED_DISPUTED_FIELD_EXAMPLES = {
  skills: {
    type: 'array',
    itemType: 'string',
    note: 'legacy display adapter; may be string[] when contract allows array; never use for mechanical bonuses',
    example: ['Хозяйство +3', 'Атлетика +2', 'Выживание +2']
  },
  skill_bonuses: {
    type: 'object',
    note: 'canonical mechanical data; must be object with numeric values; never array',
    example: {
      athletics: 2,
      stealth: 0,
      melee_combat: 0,
      ranged_combat: 0,
      craft: 1,
      household: 3,
      survival: 2,
      travel_transport: 0,
      healing: 0,
      observation: 1,
      communication_trade: 0,
      custom_law_literacy: 1
    }
  },
  knowledge_map: {
    type: 'object',
    note: 'canonical knowledge block; never array',
    example: {
      known_facts: ['князь велел чинить мосты'],
      rumors: ['слух о дороге'],
      mistakes: [],
      unavailable_knowledge: [],
      known_places: ['тракт'],
      known_routes: ['переправа'],
      known_people: ['староста']
    }
  },
  memory_profile: {
    type: 'object',
    note: 'canonical memory block; never array',
    example: {
      key_memories: ['весна 1241 — сожгли соседнее село'],
      debts: ['долг хозяину'],
      fears: ['продажа в холопы'],
      obligations: ['отработать долг'],
      unresolved_unknowns: ['что будет после расчёта']
    }
  },
  goals_profile: {
    type: 'object',
    note: 'canonical goals block; never array',
    example: {
      immediate_need: 'выплатить долг',
      long_term_desire: 'удержаться на дворе',
      fear: 'потеря свободы',
      obligation: 'отработать долг',
      reason_to_act: 'иначе лишится имущества',
      consequence_of_inaction: 'потеряет имущество и свободу'
    }
  },
  relations: {
    type: 'object',
    note: 'canonical relations block; never array',
    example: {
      known_npcs: ['староста'],
      patrons: [],
      debtors: [],
      creditors: [],
      enemies: [],
      witnesses: [],
      helpers: ['жена'],
      blockers: []
    }
  },
  position: {
    type: 'object',
    note: 'canonical position block; never string',
    example: {
      region_id: 'novgorod',
      place_id: 'yard',
      location_id: 'yard',
      minilocation_id: 'yard:entry',
      anchor_id: 'yard:entry:0',
      last_route_id: null
    }
  },
  current_position: {
    type: 'object',
    note: 'canonical current position block; never string',
    example: {
      region_id: 'novgorod',
      place_id: 'yard',
      location_id: 'yard',
      minilocation_id: 'yard:entry',
      anchor_id: 'yard:entry:0',
      last_route_id: null
    }
  },
  start_scene: {
    type: 'object',
    note: 'canonical start scene block; never string',
    example: {
      reason_here: 'пришёл по приказу тиуна',
      visible_situation: 'двор у переправы',
      nearby_people: ['староста'],
      immediate_tension: 'долг и работа',
      intro_prose: 'Он стоит у переправы.'
    }
  },
  bodyState: {
    type: 'string',
    note: 'legacy body summary string; never object when contract requires string',
    example: 'здоров, но к осени ломота в пояснице'
  }
};

function playerSeedFieldSpec(kind) {
  const optional = kind.endsWith('?');
  const type = optional ? kind.slice(0, -1) : kind;
  return { type, required: !optional };
}

function buildPlayerSeedNestedFieldSpec(keys, valueType) {
  const nested = {};
  for (const key of keys) nested[key] = valueType;
  return nested;
}

export function buildPlayerSeedOutputContract({ compact = false } = {}) {
  const allowedRootKeys = compact
    ? PLAYER_SEED_COMPACT_ROOT_KEYS.slice()
    : ['version', 'schema', ...Object.keys(PLAYER_SEED_LEGACY_ROOT_FIELDS), ...Object.keys(PLAYER_SEED_CANONICAL_ROOT_FIELDS)];

  const fields = {
    version: { type: 'number', required: true },
    schema: { type: 'string', required: true, value: 'player_seed' }
  };

  for (const [key, kind] of Object.entries(PLAYER_SEED_LEGACY_ROOT_FIELDS)) {
    if (compact && !allowedRootKeys.includes(key)) continue;
    fields[key] = playerSeedFieldSpec(kind);
  }
  for (const [key, kind] of Object.entries(PLAYER_SEED_CANONICAL_ROOT_FIELDS)) {
    if (compact && !allowedRootKeys.includes(key)) continue;
    fields[key] = playerSeedFieldSpec(kind);
  }

  fields.attributes = {
    ...fields.attributes,
    nested: buildPlayerSeedNestedFieldSpec(PLAYER_ATTRIBUTE_KEYS, 'number')
  };
  fields.skill_bonuses = {
    ...fields.skill_bonuses,
    nested: buildPlayerSeedNestedFieldSpec(PLAYER_SKILL_KEYS, 'number'),
    note: PLAYER_SEED_DISPUTED_FIELD_EXAMPLES.skill_bonuses.note
  };
  fields.skills = {
    ...fields.skills,
    itemType: 'string',
    note: PLAYER_SEED_DISPUTED_FIELD_EXAMPLES.skills.note
  };
  fields.knowledge_map = {
    ...fields.knowledge_map,
    nested: buildPlayerSeedNestedFieldSpec(PLAYER_KNOWLEDGE_MAP_KEYS, 'array')
  };
  fields.memory_profile = {
    ...fields.memory_profile,
    nested: buildPlayerSeedNestedFieldSpec(PLAYER_MEMORY_PROFILE_KEYS, 'array')
  };
  fields.goals_profile = {
    ...fields.goals_profile,
    nested: buildPlayerSeedNestedFieldSpec(PLAYER_GOALS_PROFILE_KEYS, 'string')
  };
  fields.relations = {
    ...fields.relations,
    nested: buildPlayerSeedNestedFieldSpec(PLAYER_RELATION_KEYS, 'array')
  };
  fields.position = {
    ...fields.position,
    nested: buildPlayerSeedNestedFieldSpec(PLAYER_POSITION_KEYS, 'string|null')
  };
  fields.current_position = {
    ...fields.current_position,
    nested: buildPlayerSeedNestedFieldSpec(PLAYER_POSITION_KEYS, 'string|null')
  };
  fields.start_scene = {
    ...fields.start_scene,
    nested: {
      ...buildPlayerSeedNestedFieldSpec(PLAYER_START_SCENE_KEYS.filter((key) => key !== 'nearby_people'), 'string'),
      nearby_people: 'array'
    }
  };

  const disputedFields = {};
  for (const key of Object.keys(PLAYER_SEED_DISPUTED_FIELD_EXAMPLES)) {
    if (!allowedRootKeys.includes(key)) continue;
    disputedFields[key] = PLAYER_SEED_DISPUTED_FIELD_EXAMPLES[key];
  }

  return {
    schema: 'player_seed',
    version: 1,
    allowedRootKeys,
    requiredKeys: Object.entries(fields).filter(([, spec]) => spec.required).map(([key]) => key),
    fields,
    disputedFields
  };
}

export function getPlayerSeedCanonicalExample({ compact = false } = {}) {
  const skillBonuses = Object.fromEntries(PLAYER_SKILL_KEYS.map((key) => [key, key === 'household' ? 3 : key === 'athletics' || key === 'survival' ? 2 : key === 'craft' || key === 'observation' || key === 'custom_law_literacy' ? 1 : 0]));
  const base = {
    version: 1,
    schema: 'player_seed',
    name: 'Олех',
    role: 'плотник',
    status: 'зависимый ремесленник',
    socialClass: 'крестьянин',
    ageRange: '30 лет',
    origin: 'село на реке Шелонь',
    visibleStatus: 'отрабатывает долг на переправе',
    trueStatus: 'должен хозяину двора',
    reasonHere: 'чинит паром',
    occupation: 'плотник',
    skills: ['Хозяйство +3', 'Атлетика +2', 'Выживание +2'],
    bodyState: 'коренастый, сильные руки',
    language: 'древнерусский',
    literacy: 'неграмотен',
    clothing: 'льняная рубаха, лапти',
    family: ['жена в лесу'],
    memory: ['весна 1241 — сожгли соседнее село'],
    knowledge: ['князь велел чинить мосты'],
    fears: ['продажа в холопы'],
    goals: ['выплатить долг'],
    obligations: ['отработать долг'],
    identity: {
      name: 'Олех',
      age_range: '30 лет',
      origin: 'село на реке Шелонь',
      social_status: 'крестьянин',
      occupation_or_role: 'плотник',
      visible_status: 'отрабатывает долг на переправе',
      true_status: 'должен хозяину двора',
      reason_here: 'чинит паром'
    },
    body: {
      description: 'коренастый, сильные руки',
      visible_marks: [],
      clothing: 'льняная рубаха, лапти',
      health: 74,
      satiety: 74,
      vigor: 61,
      active_conditions: []
    },
    states: { health: 74, satiety: 74, vigor: 61 },
    attributes: {
      strength: 12,
      agility: 10,
      endurance: 11,
      reason: 9,
      attention: 10,
      influence: 8
    },
    skill_bonuses: skillBonuses,
    knowledge_map: PLAYER_SEED_DISPUTED_FIELD_EXAMPLES.knowledge_map.example,
    memory_profile: PLAYER_SEED_DISPUTED_FIELD_EXAMPLES.memory_profile.example,
    goals_profile: PLAYER_SEED_DISPUTED_FIELD_EXAMPLES.goals_profile.example,
    relations: PLAYER_SEED_DISPUTED_FIELD_EXAMPLES.relations.example,
    items: { carried_items: [], equipment: [], weapons: [], armor: [], property_not_carried: [], borrowed_items: [], foreign_items_with_character: [] },
    property_and_access: {
      property_not_carried: ['клеть при дворе'],
      borrowed_items: [],
      foreign_items_with_character: [],
      accessible_resources: ['двор переправы'],
      return_obligations: ['отработать долг']
    },
    position: PLAYER_SEED_DISPUTED_FIELD_EXAMPLES.position.example,
    current_position: PLAYER_SEED_DISPUTED_FIELD_EXAMPLES.current_position.example,
    start_scene: PLAYER_SEED_DISPUTED_FIELD_EXAMPLES.start_scene.example
  };

  if (compact) {
    const compactKeys = new Set(PLAYER_SEED_COMPACT_ROOT_KEYS);
    return Object.fromEntries(Object.entries(base).filter(([key]) => compactKeys.has(key)));
  }
  return base;
}

export function buildPlayerSeedAntiRegressionRules() {
  return [
    'skill_bonuses: object, not array, numeric values',
    'skills: legacy display adapter; may be string[] only when contract allows array',
    'knowledge_map: object, not array',
    'memory_profile: object, not array',
    'goals_profile: object, not array',
    'relations: object, not array',
    'position: object with region_id, place_id, location_id, minilocation_id, anchor_id, last_route_id',
    'current_position: object',
    'start_scene: object',
    'bodyState: string'
  ];
}

export function mergePlayerSeedValidationErrors(accumulated = [], fresh = []) {
  const merged = [...(Array.isArray(accumulated) ? accumulated : []), ...(Array.isArray(fresh) ? fresh : [])].filter(Boolean);
  return [...new Set(merged)];
}

function describePlayerSeedIdentityValidation(identity, rootName = null) {
  const errors = [];
  if (!isPlainObject(identity)) {
    errors.push('root.identity: expected object');
    return { ok: false, errors };
  }

  if (!hasTextValue(resolvePlayerSeedDisplayName(identity, rootName))) {
    errors.push('root.identity: expected display_name, name, nickname, or given_name');
  }
  if (identity.given_name !== undefined && identity.given_name !== null && typeof identity.given_name !== 'string') {
    errors.push('root.identity.given_name: expected string or null');
  }
  if (identity.givenName !== undefined && identity.givenName !== null && typeof identity.givenName !== 'string') {
    errors.push('root.identity.givenName: expected string or null');
  }
  if (identity.nickname !== undefined && identity.nickname !== null && typeof identity.nickname !== 'string') {
    errors.push('root.identity.nickname: expected string or null');
  }
  if (identity.display_name !== undefined && identity.display_name !== null && typeof identity.display_name !== 'string') {
    errors.push('root.identity.display_name: expected string or null');
  }
  if (identity.displayName !== undefined && identity.displayName !== null && typeof identity.displayName !== 'string') {
    errors.push('root.identity.displayName: expected string or null');
  }

  for (const key of ['age_range', 'origin', 'social_status', 'occupation_or_role', 'visible_status', 'true_status', 'reason_here']) {
    if (!hasTextValue(identity[key])) {
      errors.push(`root.identity.${key}: expected non-empty string`);
    }
  }

  return { ok: errors.length === 0, errors };
}

function describePlayerSeedCompactBodyValidation(body) {
  const errors = [];
  if (!isPlainObject(body)) {
    errors.push('root.body: expected object');
    return { ok: false, errors };
  }
  for (const key of ['description', 'clothing']) {
    if (!hasTextValue(body[key])) {
      errors.push(`root.body.${key}: expected non-empty string`);
    }
  }
  for (const key of ['health', 'satiety', 'vigor']) {
    if (!isNullableNumber(body[key]) || body[key] === null) {
      errors.push(`root.body.${key}: expected number`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function describePlayerSeedCompactStatesValidation(states) {
  const errors = [];
  if (!isPlainObject(states)) {
    errors.push('root.states: expected object');
    return { ok: false, errors };
  }
  for (const key of ['health', 'satiety', 'vigor']) {
    if (!isNullableNumber(states[key]) || states[key] === null) {
      errors.push(`root.states.${key}: expected number`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function describePlayerSeedCanonicalValidation(data) {
  const errors = [];
  errors.push(...describePlayerSeedIdentityValidation(data?.identity, data?.name).errors);

  const body = data?.body;
  if (isPlainObject(body)) {
    for (const key of ['description', 'clothing']) {
      if (!hasTextValue(body[key])) {
        errors.push(`root.body.${key}: expected non-empty string`);
      }
    }
    for (const key of ['health', 'satiety', 'vigor']) {
      if (!isNullableNumber(body[key]) || body[key] === null) {
        errors.push(`root.body.${key}: expected number`);
      }
    }
    if (!Array.isArray(body.visible_marks)) {
      errors.push('root.body.visible_marks: expected array');
    }
    if (!Array.isArray(body.active_conditions)) {
      errors.push('root.body.active_conditions: expected array');
    }
  }

  if (isPlainObject(data?.states)) {
    for (const key of ['health', 'satiety', 'vigor']) {
      if (!isNullableNumber(data.states[key]) || data.states[key] === null) {
        errors.push(`root.states.${key}: expected number`);
      }
    }
  }

  errors.push(...describePlayerSeedAttributesValidation(data?.attributes).errors);
  errors.push(...describePlayerSeedSkillBonusesValidation(data?.skill_bonuses).errors);
  errors.push(...describePlayerSeedKnowledgeMapValidation(data?.knowledge_map).errors);
  errors.push(...describePlayerSeedMemoryProfileValidation(data?.memory_profile).errors);
  errors.push(...describePlayerSeedGoalsProfileValidation(data?.goals_profile).errors);
  errors.push(...describePlayerSeedRelationsValidation(data?.relations).errors);
  errors.push(...describePlayerSeedPositionValidation('root.position', data?.position).errors);
  errors.push(...describePlayerSeedPositionValidation('root.current_position', data?.current_position).errors);
  errors.push(...describePlayerSeedStartSceneValidation(data?.start_scene).errors);
  errors.push(...describePlayerSeedStringItemsValidation(data?.items).errors);

  return { ok: errors.length === 0, errors };
}

function describePlayerSeedAttributesValidation(attributes) {
  const errors = [];
  if (!isPlainObject(attributes)) {
    return { ok: false, errors: ['root.attributes: expected object'] };
  }
  for (const key of PLAYER_ATTRIBUTE_KEYS) {
    const value = Number(attributes[key]);
    if (!Number.isFinite(value)) {
      errors.push(`root.attributes.${key}: expected number`);
      continue;
    }
    if (value < 3 || value > 18) {
      errors.push(`root.attributes.${key}: expected 3-18, got ${value}`);
    }
  }
  for (const key of Object.keys(attributes)) {
    if (!PLAYER_ATTRIBUTE_KEYS.includes(key)) {
      errors.push(`root.attributes.${key}: unexpected attribute key`);
    }
  }
  const values = PLAYER_ATTRIBUTE_KEYS.map((key) => Number(attributes[key])).filter((value) => Number.isFinite(value));
  const highCount = values.filter((value) => value >= 14).length;
  const hasHigh = values.some((value) => value >= 15);
  const hasWeakSpot = values.some((value) => value <= 8);
  if (highCount > 2) {
    errors.push('root.attributes: more than two attributes at 14+');
  }
  if ((hasHigh || highCount >= 2) && !hasWeakSpot) {
    errors.push('root.attributes: missing weak attribute <= 8 for high spread');
  }
  return { ok: errors.length === 0, errors };
}

function describePlayerSeedSkillBonusesValidation(skillBonusesInput) {
  const errors = [];
  if (!isPlainObject(skillBonusesInput)) {
    const kind = Array.isArray(skillBonusesInput) ? 'array' : describeValueKind(skillBonusesInput);
    return {
      ok: false,
      errors: [`root.skill_bonuses: expected object (canonical mechanical map), got ${kind}; skills is legacy display adapter (string[]), skill_bonuses must never be array`]
    };
  }
  const skillBonuses = migrateSkillKeys(skillBonusesInput);
  for (const key of PLAYER_SKILL_KEYS) {
    const value = Number(skillBonuses[key]);
    if (!Number.isFinite(value)) {
      errors.push(`root.skill_bonuses.${key}: expected number`);
      continue;
    }
    if (value < 0 || value > 4) {
      errors.push(`root.skill_bonuses.${key}: expected 0-4, got ${value}`);
    }
  }
  for (const key of Object.keys(skillBonuses)) {
    if (!PLAYER_SKILL_KEYS.includes(key)) {
      errors.push(`root.skill_bonuses.${key}: unexpected skill key`);
    }
  }
  const plusFourCount = PLAYER_SKILL_KEYS.filter((key) => Number(skillBonuses[key]) >= 4).length;
  if (plusFourCount > 1) {
    errors.push('root.skill_bonuses: more than one skill at +4');
  }
  return { ok: errors.length === 0, errors };
}

function describePlayerSeedKnowledgeMapValidation(knowledgeMap) {
  const errors = [];
  if (!isPlainObject(knowledgeMap)) {
    return { ok: false, errors: ['root.knowledge_map: expected object'] };
  }
  for (const key of PLAYER_KNOWLEDGE_MAP_KEYS) {
    if (!Array.isArray(knowledgeMap[key])) {
      errors.push(`root.knowledge_map.${key}: expected array`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function describePlayerSeedMemoryProfileValidation(memoryProfile) {
  const errors = [];
  if (!isPlainObject(memoryProfile)) {
    return { ok: false, errors: ['root.memory_profile: expected object'] };
  }
  for (const key of PLAYER_MEMORY_PROFILE_KEYS) {
    if (!Array.isArray(memoryProfile[key])) {
      errors.push(`root.memory_profile.${key}: expected array`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function describePlayerSeedGoalsProfileValidation(goalsProfile) {
  const errors = [];
  if (!isPlainObject(goalsProfile)) {
    return { ok: false, errors: ['root.goals_profile: expected object'] };
  }
  for (const key of PLAYER_GOALS_PROFILE_KEYS) {
    if (!hasTextValue(goalsProfile[key])) {
      errors.push(`root.goals_profile.${key}: expected non-empty string`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function describePlayerSeedRelationsValidation(relations) {
  const errors = [];
  if (!isPlainObject(relations)) {
    return { ok: false, errors: ['root.relations: expected object'] };
  }
  for (const key of PLAYER_RELATION_KEYS) {
    if (!Array.isArray(relations[key])) {
      errors.push(`root.relations.${key}: expected array`);
    }
  }
  return { ok: errors.length === 0, errors };
}

function describePlayerSeedPositionValidation(path, position) {
  const errors = [];
  if (!isPlainObject(position)) {
    return { ok: false, errors: [`${path}: expected object`] };
  }
  for (const key of ['region_id', 'place_id', 'location_id', 'minilocation_id', 'anchor_id']) {
    if (!hasTextValue(position[key])) {
      errors.push(`${path}.${key}: expected non-empty string`);
    }
  }
  if (!('last_route_id' in position)) {
    errors.push(`${path}.last_route_id: expected string or null`);
  } else if (position.last_route_id !== null && typeof position.last_route_id !== 'string') {
    errors.push(`${path}.last_route_id: expected string or null`);
  }
  return { ok: errors.length === 0, errors };
}

function describePlayerSeedStartSceneValidation(startScene) {
  const errors = [];
  if (!isPlainObject(startScene)) {
    return { ok: false, errors: ['root.start_scene: expected object'] };
  }
  for (const key of ['reason_here', 'visible_situation', 'immediate_tension', 'intro_prose']) {
    if (!hasTextValue(startScene[key])) {
      errors.push(`root.start_scene.${key}: expected non-empty string`);
    }
  }
  if (!Array.isArray(startScene.nearby_people)) {
    errors.push('root.start_scene.nearby_people: expected array');
  }
  return { ok: errors.length === 0, errors };
}

function describePlayerSeedStringItemsValidation(items) {
  const errors = [];
  if (!isPlainObject(items)) return { ok: true, errors };
  for (const [blockName, blockValue] of Object.entries(items)) {
    if (!Array.isArray(blockValue)) continue;
    for (const [index, item] of blockValue.entries()) {
      if (typeof item === 'string') {
        errors.push(`root.items.${blockName}[${index}]: string-only item is not allowed in production player_seed`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validatePlayerSeedItemBlocks(data) {
  return describePlayerSeedItemBlocksValidation(data).ok ? data : null;
}

export function explainPlayerSeedItemBlocksValidation(data) {
  return describePlayerSeedItemBlocksValidation(data);
}

function validateContract(data, contract) {
  return describeContractValidation(data, contract).ok ? data : null;
}

function describeContractValidation(data, contract) {
  const errors = [];
  if (!isPlainObject(data)) {
    return { ok: false, errors: [`root: expected object, got ${describeValueKind(data)}`] };
  }
  if (data.version !== 1) {
    errors.push(`root.version: expected 1, got ${describeValueSummary(data.version)}`);
  }
  if (data.schema !== contract.schema) {
    errors.push(`root.schema: expected ${contract.schema}, got ${describeValueSummary(data.schema)}`);
  }

  for (const [key, kind] of Object.entries(contract.fields)) {
    const optional = kind.endsWith('?');
    const actualKind = optional ? kind.slice(0, -1) : kind;
    const value = data[key];
    const path = `root.${key}`;
    if (value === undefined || value === null) {
      if (optional) continue;
      errors.push(`${path}: expected ${actualKind}, got ${value === undefined ? 'missing' : 'null'}`);
      continue;
    }
    if (!checkKind(value, actualKind)) {
      errors.push(`${path}: expected ${actualKind}, got ${describeValueKind(value)}`);
    }
  }

  if (contract.enums) {
    for (const [key, allowed] of Object.entries(contract.enums)) {
      if (!Array.isArray(allowed) || !allowed.length) continue;
      if (data[key] === undefined) continue;
      if (!allowed.some((item) => Object.is(item, data[key]))) {
        errors.push(`root.${key}: expected one of ${allowed.join(', ')}, got ${describeValueSummary(data[key])}`);
      }
    }
  }

  if (contract.exact) {
    const allowedKeys = new Set(['version', 'schema', ...Object.keys(contract.fields), ...(contract.enums ? Object.keys(contract.enums) : [])]);
    for (const key of Object.keys(data)) {
      if (!allowedKeys.has(key)) {
        errors.push(`root.${key}: unexpected field`);
      }
    }
  }

  if (contract.fields.historical_audit && data.historical_audit !== undefined) {
    if (!validateAuditObject(data.historical_audit)) {
      errors.push('root.historical_audit: expected audit, got invalid');
    }
  }

  return { ok: errors.length === 0, errors };
}

function describeValueKind(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function describeValueSummary(value) {
  if (value === null) return 'null';
  if (value === undefined) return 'missing';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object') return 'object';
  return typeof value;
}

function checkKind(value, kind) {
  switch (kind) {
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'array':
      return Array.isArray(value);
    case 'object':
      return isPlainObject(value);
    case 'audit':
      return validateAuditObject(value);
    default:
      return false;
  }
}

function validateAuditObject(value) {
  return isPlainObject(value)
    && typeof value.pass === 'boolean'
    && Array.isArray(value.concerns)
    && Array.isArray(value.evidence);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function describePlayerSeedItemBlocksValidation(data) {
  const errors = [];
  const items = data?.items && isPlainObject(data.items) ? data.items : null;
  if (!items) {
    return { ok: true, errors: [] };
  }

  for (const [blockName, blockValue] of Object.entries(items)) {
    if (!Array.isArray(blockValue)) continue;
    for (const [index, item] of blockValue.entries()) {
      const path = `root.items.${blockName}[${index}]`;
      const validation = describeSignificantItemValidation(item, path);
      errors.push(...validation.errors);
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

function describeSignificantItemValidation(item, path) {
  const errors = [];
  const normalized = normalizeSignificantItemContract(item);
  if (!isPlainObject(normalized)) {
    errors.push(`${path}: expected object, got ${describeValueKind(item)}`);
    return { ok: false, errors };
  }
  item = normalized;

  const requiredStringFields = ['label', 'type', 'material', 'condition', 'size', 'placement', 'access', 'visibility', 'legal_status', 'function'];
  for (const key of requiredStringFields) {
    if (!hasTextValue(item[key])) {
      errors.push(`${path}.${key}: expected string, got ${describeMissingValue(item[key])}`);
    }
  }

  const stringOrNullFields = ['material', 'condition', 'size', 'function', 'owner_id', 'holder_id', 'container_id'];
  for (const key of stringOrNullFields) {
    if (item[key] === undefined) continue;
    if (item[key] !== null && typeof item[key] !== 'string') {
      errors.push(`${path}.${key}: expected string or null, got ${describeValueKind(item[key])}`);
    }
  }

  if (item.weight !== undefined && !isNullableNumber(item.weight)) {
    errors.push(`${path}.weight: expected number or null, got ${describeValueKind(item.weight)}`);
  }
  if (!isNullableNumber(item.weight)) {
    errors.push(`${path}.weight: expected number, got ${describeMissingValue(item.weight)}`);
  }
  if (item.discoverability !== undefined && !isNullableNumber(item.discoverability)) {
    errors.push(`${path}.discoverability: expected number or null, got ${describeValueKind(item.discoverability)}`);
  }
  if (!isNullableNumber(item.discoverability)) {
    errors.push(`${path}.discoverability: expected number, got ${describeMissingValue(item.discoverability)}`);
  }
  if (item.plausibility !== undefined && !isNullableNumber(item.plausibility)) {
    errors.push(`${path}.plausibility: expected number or null, got ${describeValueKind(item.plausibility)}`);
  }
  if (!isNullableNumber(item.plausibility)) {
    errors.push(`${path}.plausibility: expected number, got ${describeMissingValue(item.plausibility)}`);
  }
  if (item.risk !== undefined && !isNullableNumber(item.risk)) {
    errors.push(`${path}.risk: expected number or null, got ${describeValueKind(item.risk)}`);
  }
  if (!isNullableNumber(item.risk)) {
    errors.push(`${path}.risk: expected number, got ${describeMissingValue(item.risk)}`);
  }
  if (item.visible !== undefined && typeof item.visible !== 'boolean') {
    errors.push(`${path}.visible: expected boolean, got ${describeValueKind(item.visible)}`);
  }
  if (typeof item.visible !== 'boolean') {
    errors.push(`${path}.visible: expected boolean, got ${describeMissingValue(item.visible)}`);
  }
  if (!Array.isArray(item.marks)) {
    errors.push(`${path}.marks: expected array, got ${describeMissingValue(item.marks)}`);
  }
  if (item.contents !== undefined) {
    if (!Array.isArray(item.contents)) {
      errors.push(`${path}.contents: expected array, got ${describeValueKind(item.contents)}`);
    } else {
      for (const [index, nested] of item.contents.entries()) {
        const nestedValidation = describeSignificantItemValidation(nested, `${path}.contents[${index}]`);
        errors.push(...nestedValidation.errors);
      }
    }
  }
  if (item.value !== undefined && !isPlainObject(item.value) && !isNullableNumber(item.value)) {
    errors.push(`${path}.value: expected object or number, got ${describeValueKind(item.value)}`);
  }
  if (isPlainObject(item.value)) {
    for (const [facet, facetValue] of Object.entries(item.value)) {
      const numeric = Number(facetValue);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 5) {
        errors.push(`${path}.value.${facet}: expected 0..5, got ${describeValueKind(facetValue)}`);
      }
    }
  }

  const ownerId = readNullableField(item, 'owner_id', 'ownerId');
  const holderId = readNullableField(item, 'holder_id', 'holderId');
  const ownershipStatus = String(item.ownership_status ?? item.ownershipStatus ?? '').trim().toLowerCase();
  const holderStatus = String(item.holder_status ?? item.holderStatus ?? '').trim();
  const unknownReason = String(item.unknown_reason ?? item.unknownReason ?? '').trim();

  if (ownerId === undefined) {
    errors.push(`${path}.owner_id: expected string or null, got missing`);
  }
  if (holderId === undefined) {
    errors.push(`${path}.holder_id: expected string or null, got missing`);
  }
  const placement = String(item.placement ?? '').trim().toLowerCase();
  if (ownershipStatus === 'owned') {
    if (ownerId === null && holderId === null) {
      errors.push(`${path}: ownership_status=owned requires owner_id and holder_id`);
    } else if (ownerId === null) {
      errors.push(`${path}: ownership_status=owned requires owner_id`);
    } else if (holderId === null) {
      const holderStatusNorm = holderStatus.toLowerCase();
      const storedProperty = placement === 'property' || holderStatusNorm === 'stored' || holderStatusNorm === 'visible_in_scene';
      if (!storedProperty) {
        errors.push(`${path}: ownership_status=owned requires holder_id or stored property placement`);
      }
    }
  }
  if ((ownerId === null || holderId === null) && ownershipStatus !== 'unknown' && ownershipStatus !== 'owned' && !unknownReason) {
    errors.push(`${path}: null owner/holder requires ownership_status=unknown and unknown_reason`);
  }
  if (!holderStatus) {
    errors.push(`${path}.holder_status: expected non-empty string`);
  }
  if (!ownershipStatus) {
    errors.push(`${path}.ownership_status: expected non-empty string`);
  }

  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

function normalizeSignificantItemContract(item) {
  if (!isPlainObject(item)) return item;
  const next = { ...item };
  if (next.owner_id === undefined) next.owner_id = next.ownerId ?? null;
  if (next.holder_id === undefined) next.holder_id = next.holderId ?? null;
  const ownershipStatus = String(next.ownership_status ?? next.ownershipStatus ?? '').trim().toLowerCase();
  const holderStatus = String(next.holder_status ?? next.holderStatus ?? '').trim().toLowerCase();
  const placement = String(next.placement ?? '').trim().toLowerCase();
  if (!ownershipStatus) {
    if (placement === 'property' && next.holder_id === null && next.owner_id) {
      next.ownership_status = 'owned';
    } else {
      next.ownership_status = (next.owner_id === null && next.holder_id === null) ? 'unknown' : 'owned';
    }
  } else {
    next.ownership_status = ownershipStatus;
  }
  if (!holderStatus) {
    if (placement === 'property') next.holder_status = 'stored';
    else if (placement === 'equipped') next.holder_status = 'worn';
    else next.holder_status = 'carried';
  } else {
    next.holder_status = holderStatus;
  }
  if (next.ownership_status === 'unknown' && !String(next.unknown_reason ?? next.unknownReason ?? '').trim()) {
    next.unknown_reason = 'не указано';
  }
  return next;
}

function readNullableField(item, ...keys) {
  for (const key of keys) {
    if (item[key] !== undefined) return item[key];
  }
  return undefined;
}

function hasTextValue(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function trimPlayerSeedName(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || null;
}

function describeMissingValue(value) {
  if (value === undefined) return 'missing';
  if (value === null) return 'null';
  return describeValueKind(value);
}

function isNullableNumber(value) {
  return value === null || (typeof value === 'number' && Number.isFinite(value));
}

export function validateItemRecord(item) {
  return describeSignificantItemValidation(item, 'item').ok ? item : null;
}

export function explainItemRecordValidation(item) {
  return describeSignificantItemValidation(item, 'item');
}

export function validateContainerRecord(container) {
  const errors = [];
  const base = describeSignificantItemValidation(container, 'container');
  errors.push(...base.errors);
  if (base.ok && container && typeof container === 'object') {
    if (container.is_container === false && Array.isArray(container.contents) && container.contents.length > 0) {
      errors.push('container: contents require is_container');
    }
    if (container.contents_policy && typeof container.contents_policy !== 'string') {
      errors.push('container.contents_policy: expected string');
    }
  }
  return errors.length ? null : container;
}

export function validateInventoryRecord(item) {
  const result = describeSignificantItemValidation(item, 'inventory');
  if (!result.ok) return null;
  if (item?.placement === 'property') return null;
  return item;
}

export function validateEquipmentSlots(equipment = []) {
  if (!Array.isArray(equipment)) return null;
  for (const [index, item] of equipment.entries()) {
    const result = describeSignificantItemValidation(item, `equipment[${index}]`);
    if (!result.ok) return null;
    if (item?.placement && item.placement !== 'equipped') return null;
  }
  return equipment;
}

export function validatePropertyLedger(ledger = []) {
  if (!Array.isArray(ledger)) return null;
  for (const [index, item] of ledger.entries()) {
    const result = describeSignificantItemValidation(item, `ledger[${index}]`);
    if (!result.ok) return null;
  }
  return ledger;
}

export function validateStateDeltaItemChange(change) {
  if (!change || typeof change !== 'object') return null;
  const op = String(change.op ?? change.action ?? '').toLowerCase();
  if (!op) return null;
  if (change.item && typeof change.item === 'object' && !change.item_id && !change.itemId && op !== 'discover') {
    return null;
  }
  return change;
}

export function validateActorPublicProfile(actor) {
  if (!isPlainObject(actor)) return null;
  if (findForbiddenPublicKeys(actor).length) return null;
  if (isActorProfileShape(actor) && findDisallowedPublicKeys(actor).length) return null;
  return actor;
}

export function assertActorPublicProfile(actor) {
  return validateActorPublicProfile(actor);
}

export function sanitizeActorPublicProfile(actor) {
  if (!isPlainObject(actor)) return null;
  if (isActorProfileShape(actor)) return pickPublicActorProfile(actor);
  const clean = structuredClone(actor);
  stripForbiddenPublicKeys(clean);
  return clean;
}

function isActorProfileShape(value) {
  return isPlainObject(value) && (
    isPlainObject(value.identity)
    || isPlainObject(value.body)
    || isPlainObject(value.mind)
    || isPlainObject(value.work)
    || isPlainObject(value.kinship)
    || isPlainObject(value.property)
  );
}

function pickPublicActorProfile(value, schemaKey = '') {
  if (Array.isArray(value)) {
    return value.map((item) => (isPlainObject(item) ? pickPublicActorProfile(item, schemaKey) : item));
  }
  if (!isPlainObject(value)) return value;

  const allowed = PUBLIC_ACTOR_ALLOWLIST[schemaKey] ?? PUBLIC_ACTOR_ALLOWLIST[''];
  const clean = {};
  for (const key of allowed) {
    if (!(key in value) || isForbiddenPublicKey(key)) continue;
    const nested = value[key];
    if (PUBLIC_ACTOR_ALLOWLIST[key]) {
      clean[key] = pickPublicActorProfile(nested, key);
    } else {
      clean[key] = nested;
    }
  }
  return clean;
}

export function validateActorHiddenProfile(actor) {
  if (!isPlainObject(actor)) return null;
  if (!actor.id && !actor.displayName && !actor.name) return null;
  return actor;
}

const FORBIDDEN_PUBLIC_KEYS = new Set([
  'hidden',
  'hidden_motives',
  'hiddenMotives',
  'trueStatus',
  'secret',
  'secrets',
  'private',
  'futureEvents',
  'objectiveMap',
  'rawPrompt',
  'rawResponse',
  'requestRaw',
  'responseRaw',
  'sourceDossier',
  'internal_goal',
  'internalGoal',
  'unseen_reason',
  'unseenReason',
  'real_loyalty',
  'realLoyalty',
  'future_knowledge',
  'futureKnowledge',
  'private_notes',
  'privateNotes',
  'knowledgeHidden',
  'motivation',
  'character'
]);

const FORBIDDEN_PUBLIC_KEY_PATTERN = /(?:^|_)(hidden|secret|private|internal|unseen|real_loyalty|future_knowledge|objective|rawprompt|rawresponse|sourcedossier)(?:_|$)|^truestatus$|^futureevents$|^objectivemap$|^requestraw$|^responseraw$/i;

const PUBLIC_ACTOR_ALLOWLIST = {
  '': ['version', 'kind', 'source', 'profileLevel', 'identity', 'body', 'mind'],
  identity: ['id', 'name', 'displayName', 'ageRange', 'visibleStatus', 'role'],
  body: ['bodyState', 'health', 'bleeding', 'pain', 'intoxication', 'visible_marks', 'visibleMarks', 'active_conditions', 'activeConditions', 'clothing', 'language', 'literacy'],
  mind: ['seen', 'heard', 'misunderstood', 'manner', 'speech']
};

export const PUBLIC_UI_ROOT_KEYS = new Set([
  'clock',
  'clockText',
  'history',
  'region',
  'historical',
  'legal',
  'place',
  'visibleScene',
  'microPlace',
  'player',
  'orientation',
  'npcs',
  'visibleNpcs',
  'knowledgeMap',
  'propertyView',
  'socialTrace',
  'socialSummary',
  'routeContext',
  'memory',
  'events',
  'journal',
  'journalSections',
  'delayedEvents',
  'routeArchive',
  'medicalContext',
  'fieldCareContext'
]);

export function assertPublicUiRootKeys(uiState) {
  for (const key of Object.keys(uiState ?? {})) {
    if (!PUBLIC_UI_ROOT_KEYS.has(key)) {
      throw new Error(`Public UI state has unexpected root key: ${key}`);
    }
  }
  return true;
}

export function isForbiddenPublicKey(key) {
  if (typeof key !== 'string' || !key) return false;
  return FORBIDDEN_PUBLIC_KEYS.has(key) || FORBIDDEN_PUBLIC_KEY_PATTERN.test(key);
}

export function findDisallowedPublicKeys(value, path = '', schemaKey = '') {
  const violations = [];
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      violations.push(...findDisallowedPublicKeys(item, `${path}[${index}]`, schemaKey));
    }
    return violations;
  }
  if (!isPlainObject(value)) return violations;

  const allowed = PUBLIC_ACTOR_ALLOWLIST[schemaKey] ?? PUBLIC_ACTOR_ALLOWLIST[''];
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (isForbiddenPublicKey(key)) {
      violations.push(nextPath);
      continue;
    }
    if (!allowed.includes(key)) {
      violations.push(`${nextPath}: key not in public allowlist`);
      continue;
    }
    const nestedSchema = PUBLIC_ACTOR_ALLOWLIST[key] ? key : schemaKey;
    violations.push(...findDisallowedPublicKeys(nested, nextPath, nestedSchema));
  }
  return violations;
}

export function findForbiddenPublicKeys(value, path = '') {
  const violations = [];
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      violations.push(...findForbiddenPublicKeys(item, `${path}[${index}]`));
    }
    return violations;
  }
  if (!isPlainObject(value)) return violations;
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (isForbiddenPublicKey(key)) violations.push(nextPath);
    else violations.push(...findForbiddenPublicKeys(nested, nextPath));
  }
  return violations;
}

function stripForbiddenPublicKeys(value) {
  if (Array.isArray(value)) {
    for (const item of value) stripForbiddenPublicKeys(item);
    return;
  }
  if (!isPlainObject(value)) return;
  for (const key of Object.keys(value)) {
    if (isForbiddenPublicKey(key)) delete value[key];
    else stripForbiddenPublicKeys(value[key]);
  }
}

export function validateLocationMaterialState(location) {
  if (!isPlainObject(location)) return null;
  const locationId = location.location_id ?? location.locationId ?? location.id;
  if (!locationId) return null;
  const materialState = location.material_state ?? location.materialState;
  const hasMaterial = isPlainObject(materialState)
    || Array.isArray(location.landmarks)
    || Array.isArray(location.objects)
    || Array.isArray(location.containers);
  if (!hasMaterial) return null;
  if (location.visibility === undefined && location.access === undefined) return null;
  const hasRoutes = Array.isArray(location.exits)
    || Array.isArray(location.routes)
    || Array.isArray(location.occupants);
  if (!hasRoutes) return null;
  return location;
}
