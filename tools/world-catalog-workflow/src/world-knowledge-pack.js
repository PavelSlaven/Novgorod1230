import { stableStringify } from './digest.js';

const AUTHORING_SCHEMA = 'world_knowledge_authoring_pack_v1';
const MANIFEST_SCHEMA = 'world_knowledge_pack_manifest_v1';
const RUNTIME_SCHEMA = 'world_knowledge_runtime_bundle_v1';
const SOURCE_SCHEMA = 'world_knowledge_source_v1';
const EVIDENCE_SCHEMA = 'world_knowledge_evidence_v1';
const CONCEPT_SCHEMA = 'world_knowledge_concept_v1';
const CLAIM_SCHEMA = 'world_knowledge_claim_v1';
const PROFILE_SCHEMA = 'world_knowledge_profile_v1';
const CONCEPT_LOCALIZATION_SCHEMA = 'world_knowledge_concept_localization_v1';
const CLAIM_LOCALIZATION_SCHEMA = 'world_knowledge_claim_localization_v1';

const CLAIM_POLARITIES = new Set(['support', 'exclude']);
const CLAIM_OBJECT_KINDS = new Set(['concept_ref', 'literal', 'boolean', 'quantity', 'range']);
const PACK_STATUSES = new Set(['experimental', 'reviewed', 'production']);
const PROFILE_STATUSES = new Set(['experimental', 'reviewed', 'production']);
const SOURCE_KINDS = new Set(['primary_object', 'primary_text', 'excavation', 'catalogue', 'scholarship', 'technical_reference', 'trusted_structured_dataset', 'official_documentation']);
const QUALIFIER_VALUES = Object.freeze({
  typicality: new Set(['common', 'attested', 'uncommon', 'exceptional', 'unknown']),
  confidence: new Set(['high', 'medium', 'low', 'unknown']),
  directness: new Set(['direct', 'inferred', 'analogical', 'editorial', 'unknown'])
});
const KNOWLEDGE_ACCESS_CLASSES = new Set(['general_physical', 'common_cultural', 'occupation_bound', 'role_bound', 'specialist_bound', 'domain_internal_only']);
const TIME_PRECISIONS = new Set(['exact', 'range', 'circa', 'century_part', 'before', 'after', 'unknown']);
const PLACE_RELATIONS = new Set(['used_in', 'produced_in', 'origin_in', 'trade_available_in', 'found_in']);
const PROFILE_PURPOSES = new Set(['semantic_resolution', 'materialization_support', 'source_grounded_qa', 'npc_decision', 'conversation', 'narration']);
const RUNTIME_REQUIREMENTS = new Set(['not_active', 'optional', 'required_when_selected']);
const GUARD_MODES = new Set(['advisory', 'explicit_exclusion', 'reference_required']);
const ACTOR_FACETS = new Set(['occupation_ref', 'role_ref', 'social_status', 'sex_category', 'age_category']);
const CONDITION_FACETS = new Set(['season', 'climate', 'location_type', 'material_state', 'temperature_state', 'moisture_state', 'process_ref']);
const ACCESS_FACETS_BY_CLASS = Object.freeze({
  general_physical: new Set(),
  common_cultural: new Set(),
  domain_internal_only: new Set(),
  occupation_bound: new Set(['occupation_ref']),
  role_bound: new Set(['role_ref']),
  specialist_bound: new Set(['specialist_domain'])
});
const HARD_EXCLUSION_BASES = new Set([
  'introduced_after_context',
  'ceased_before_context',
  'not_available_in_region',
  'institution_not_existing',
  'explicit_domain_incompatibility'
]);

export class WorldKnowledgePackValidationError extends Error {
  constructor(errors) {
    super(`World Knowledge authoring pack is invalid: ${errors.join('; ')}`);
    this.name = 'WorldKnowledgePackValidationError';
    this.code = 'WORLD_KNOWLEDGE_PACK_INVALID';
    this.errors = Object.freeze([...errors]);
  }
}

export function validateWorldKnowledgeAuthoringPack(value) {
  const errors = [];
  if (!isObject(value) || value.schema !== AUTHORING_SCHEMA) {
    errors.push(`schema must be ${AUTHORING_SCHEMA}`);
    return frozenValidation(errors);
  }
  exactKeys(value, ['schema', 'manifest', 'predicate_registry', 'sources', 'evidence', 'concepts', 'claims', 'coverage_profiles', 'concept_localizations', 'claim_localizations'], 'authoring pack', errors);

  const manifest = value.manifest;
  if (!isObject(manifest) || manifest.schema !== MANIFEST_SCHEMA) errors.push(`manifest.schema must be ${MANIFEST_SCHEMA}`);
  const packRef = text(manifest?.pack_ref);
  const revisionId = text(manifest?.revision_id);
  const defaultLocale = text(manifest?.default_locale);
  const locales = uniqueStrings(manifest?.supported_locales, 'manifest.supported_locales', errors);
  const domains = uniqueStrings(manifest?.domains, 'manifest.domains', errors);
  if (!packRef) errors.push('manifest.pack_ref is required');
  if (!revisionId) errors.push('manifest.revision_id is required');
  if (!PACK_STATUSES.has(manifest?.status)) errors.push('manifest.status must be experimental, reviewed or production');
  if (!defaultLocale) errors.push('manifest.default_locale is required');
  if (defaultLocale && !locales.includes(defaultLocale)) errors.push('manifest.default_locale must be supported');
  if (!requiredText(manifest?.context_schema_ref)) errors.push('manifest.context_schema_ref is required');
  if (manifest?.embedding_profile_ref !== null && !prefixedText(manifest?.embedding_profile_ref, 'wk-embedding:')) {
    errors.push('manifest.embedding_profile_ref must be null or a wk-embedding ref');
  }
  if (isObject(manifest)) exactKeys(manifest, ['schema', 'pack_ref', 'revision_id', 'status', 'default_locale', 'supported_locales', 'domains', 'context_schema_ref', 'embedding_profile_ref'], 'manifest', errors);
  if (!prefixedText(packRef, 'wk-pack:')) errors.push('manifest.pack_ref must be a wk-pack ref');
  if (!prefixedText(revisionId, 'revision:')) errors.push('manifest.revision_id must be a revision ref');

  const sources = records(value.sources, 'sources', errors);
  const evidence = records(value.evidence, 'evidence', errors);
  const concepts = records(value.concepts, 'concepts', errors);
  const claims = records(value.claims, 'claims', errors);
  const profiles = records(value.coverage_profiles, 'coverage_profiles', errors);
  const conceptLocalizations = records(value.concept_localizations, 'concept_localizations', errors);
  const claimLocalizations = records(value.claim_localizations, 'claim_localizations', errors);

  const sourceByRef = indexed(sources, 'source_ref', 'source', errors);
  const evidenceByRef = indexed(evidence, 'evidence_ref', 'evidence', errors);
  const conceptByRef = indexed(concepts, 'concept_ref', 'concept', errors);
  const claimByRef = indexed(claims, 'claim_ref', 'claim', errors);
  indexed(profiles, 'profile_ref', 'coverage profile', errors);

  for (const source of sources) {
    if (!isObject(source)) { errors.push('source record must be an object'); continue; }
    exactKeys(source, ['schema', 'source_ref', 'title', 'authors', 'publication', 'source_kind', 'citation', 'rights', 'review_status'], source.source_ref ?? '<source>', errors);
    if (source.schema !== SOURCE_SCHEMA) errors.push(`${source.source_ref ?? '<source>'}: invalid source schema`);
    if (!prefixedText(source.source_ref, 'source:')) errors.push(`${source.source_ref ?? '<source>'}: invalid source_ref`);
    if (!requiredText(source.title)) errors.push(`${source.source_ref ?? '<source>'}: title is required`);
    stringArray(source.authors, `${source.source_ref ?? '<source>'}.authors`, errors, { allowEmpty: true });
    if (!requiredText(source.publication)) errors.push(`${source.source_ref ?? '<source>'}: publication is required`);
    if (!requiredText(source.citation)) errors.push(`${source.source_ref ?? '<source>'}: citation is required`);
    if (!SOURCE_KINDS.has(source.source_kind)) errors.push(`${source.source_ref ?? '<source>'}: invalid source_kind`);
    if (source.review_status !== 'approved') errors.push(`${source.source_ref ?? '<source>'}: source must be approved`);
    if (!isObject(source.rights) || source.rights.status !== 'approved' || !requiredText(source.rights.redistribution)) {
      errors.push(`${source.source_ref ?? '<source>'}: approved rights metadata is required`);
    } else exactKeys(source.rights, ['status', 'redistribution'], `${source.source_ref}.rights`, errors);
  }

  for (const record of evidence) {
    if (!isObject(record)) { errors.push('evidence record must be an object'); continue; }
    exactKeys(record, ['schema', 'evidence_ref', 'source_ref', 'anchor', 'note', 'review_status'], record.evidence_ref ?? '<evidence>', errors);
    if (record.schema !== EVIDENCE_SCHEMA) errors.push(`${record.evidence_ref ?? '<evidence>'}: invalid evidence schema`);
    if (!prefixedText(record.evidence_ref, 'evidence:')) errors.push(`${record.evidence_ref ?? '<evidence>'}: invalid evidence_ref`);
    if (!sourceByRef.has(text(record.source_ref))) errors.push(`${record.evidence_ref ?? '<evidence>'}: unknown source_ref`);
    if (record.review_status !== 'approved') errors.push(`${record.evidence_ref ?? '<evidence>'}: evidence must be approved`);
    if (!requiredText(record.note)) errors.push(`${record.evidence_ref ?? '<evidence>'}: note is required`);
    validateAnchor(record.anchor, record.evidence_ref ?? '<evidence>', errors);
  }

  const predicateRegistry = isObject(value.predicate_registry) ? value.predicate_registry : {};
  if (!isObject(value.predicate_registry)) errors.push('predicate_registry must be an object');
  const predicatesByDomain = new Map();
  for (const [domain, predicateValues] of Object.entries(predicateRegistry)) {
    if (!domains.includes(domain)) errors.push(`predicate_registry contains undeclared domain ${domain}`);
    if (!isObject(predicateValues)) { errors.push(`predicate_registry.${domain} must be an object`); continue; }
    const signatures = new Map();
    for (const [name, signature] of Object.entries(predicateValues)) {
      validatePredicateSignature(domain, name, signature, domains, errors);
      signatures.set(name, signature);
    }
    predicatesByDomain.set(domain, signatures);
  }
  for (const domain of domains) if (!predicatesByDomain.has(domain)) errors.push(`predicate_registry is missing domain ${domain}`);

  for (const concept of concepts) {
    if (!isObject(concept)) { errors.push('concept record must be an object'); continue; }
    exactKeys(concept, ['schema', 'concept_ref', 'domain', 'broader_refs', 'related_refs', 'external_mappings', 'review_status'], concept.concept_ref ?? '<concept>', errors);
    if (concept.schema !== CONCEPT_SCHEMA) errors.push(`${concept.concept_ref ?? '<concept>'}: invalid concept schema`);
    if (!prefixedText(concept.concept_ref, 'wk:')) errors.push(`${concept.concept_ref ?? '<concept>'}: invalid concept_ref`);
    if (!domains.includes(text(concept.domain))) errors.push(`${concept.concept_ref ?? '<concept>'}: undeclared domain`);
    if (concept.review_status !== 'approved') errors.push(`${concept.concept_ref ?? '<concept>'}: concept must be approved`);
    const broaderRefs = uniqueStrings(concept.broader_refs, `${concept.concept_ref}.broader_refs`, errors, { allowEmpty: true });
    const relatedRefs = uniqueStrings(concept.related_refs, `${concept.concept_ref}.related_refs`, errors, { allowEmpty: true });
    validateExternalMappings(concept.external_mappings, concept.concept_ref ?? '<concept>', errors);
    for (const ref of [...broaderRefs, ...relatedRefs]) {
      if (!conceptByRef.has(text(ref))) errors.push(`${concept.concept_ref ?? '<concept>'}: unknown related concept ${text(ref)}`);
      if (ref === concept.concept_ref) errors.push(`${concept.concept_ref}: self-reference is forbidden`);
    }
  }

  for (const claim of claims) {
    if (!isObject(claim)) { errors.push('claim record must be an object'); continue; }
    const ref = claim.claim_ref ?? '<claim>';
    exactKeys(claim, ['schema', 'claim_ref', 'domain', 'subject_ref', 'predicate', 'object', 'polarity', 'applicability', 'qualifiers', 'knowledge_access', 'hard_exclusion', 'evidence_refs', 'review_status', 'conflict_group_ref'], ref, errors);
    if (claim.schema !== CLAIM_SCHEMA) errors.push(`${ref}: invalid claim schema`);
    if (!prefixedText(claim.claim_ref, 'claim:')) errors.push(`${ref}: invalid claim_ref`);
    const domain = text(claim.domain);
    if (!domains.includes(domain)) errors.push(`${ref}: undeclared domain`);
    const subject = conceptByRef.get(text(claim.subject_ref));
    if (!subject) errors.push(`${ref}: unknown subject_ref`);
    const signature = predicatesByDomain.get(domain)?.get(text(claim.predicate));
    if (!signature) errors.push(`${ref}: predicate is not registered for ${domain}`);
    if (!CLAIM_POLARITIES.has(claim.polarity)) errors.push(`${ref}: invalid polarity`);
    if (claim.review_status !== 'approved') errors.push(`${ref}: claim must be approved`);
    validateClaimObject(claim.object, signature, conceptByRef, ref, errors);
    if (signature && subject && !array(signature.subject_domains).includes(subject.domain)) errors.push(`${ref}: subject domain is not allowed by predicate`);
    if (signature && !array(signature.polarities).includes(claim.polarity)) errors.push(`${ref}: polarity is not allowed by predicate`);
    validateApplicability(claim.applicability, ref, errors);
    if (signature?.applicability === 'universal' && claim.applicability?.context_scope !== 'universal') errors.push(`${ref}: predicate requires universal applicability`);
    if (signature?.applicability === 'contextual' && claim.applicability?.context_scope === 'universal') errors.push(`${ref}: predicate requires contextual applicability`);
    validateQualifiers(claim.qualifiers, ref, errors);
    validateKnowledgeAccess(claim.knowledge_access, ref, errors);
    const evidenceRefs = uniqueStrings(claim.evidence_refs, `${ref}.evidence_refs`, errors);
    if (evidenceRefs.length === 0) errors.push(`${ref}: at least one evidence_ref is required`);
    for (const evidenceRef of evidenceRefs) if (!evidenceByRef.has(evidenceRef)) errors.push(`${ref}: unknown evidence_ref ${evidenceRef}`);
    if (claim.hard_exclusion != null) {
      if (!isObject(claim.hard_exclusion)) errors.push(`${ref}: hard_exclusion must be an object`);
      else exactKeys(claim.hard_exclusion, ['eligible', 'basis_kind'], `${ref}.hard_exclusion`, errors);
      if (claim.polarity !== 'exclude') errors.push(`${ref}: hard_exclusion requires exclude polarity`);
      if (claim.hard_exclusion?.eligible !== true || !HARD_EXCLUSION_BASES.has(text(claim.hard_exclusion?.basis_kind))) {
        errors.push(`${ref}: invalid hard_exclusion basis`);
      }
    }
  }
  validateConflictGroups(claims, predicatesByDomain, errors);

  for (const profile of profiles) {
    if (!isObject(profile)) { errors.push('coverage profile record must be an object'); continue; }
    const ref = profile.profile_ref ?? '<profile>';
    exactKeys(profile, ['schema', 'profile_ref', 'domain', 'status', 'scope', 'purposes', 'question_classes', 'runtime_requirement', 'guard'], ref, errors);
    if (profile.schema !== PROFILE_SCHEMA) errors.push(`${ref}: invalid profile schema`);
    if (!prefixedText(profile.profile_ref, 'wk-profile:')) errors.push(`${ref}: invalid profile_ref`);
    if (!domains.includes(text(profile.domain))) errors.push(`${ref}: undeclared domain`);
    if (!PROFILE_STATUSES.has(profile.status)) errors.push(`${ref}: invalid status`);
    const purposes = uniqueStrings(profile.purposes, `${ref}.purposes`, errors);
    if (purposes.length === 0 || purposes.some((purpose) => !PROFILE_PURPOSES.has(purpose))) errors.push(`${ref}: invalid purposes`);
    const questionClasses = uniqueStrings(profile.question_classes, `${ref}.question_classes`, errors);
    if (questionClasses.length === 0) errors.push(`${ref}: question_classes are required`);
    validateProfileScope(profile.scope, ref, errors);
    if (!RUNTIME_REQUIREMENTS.has(profile.runtime_requirement)) errors.push(`${ref}: invalid runtime_requirement`);
    if (!isObject(profile.guard) || !GUARD_MODES.has(profile.guard.mode)) errors.push(`${ref}: invalid guard`);
    else exactKeys(profile.guard, ['mode'], `${ref}.guard`, errors);
  }

  validateLocalizations({
    records: conceptLocalizations,
    schema: CONCEPT_LOCALIZATION_SCHEMA,
    refField: 'concept_ref',
    canonicalRefs: conceptByRef,
    locales,
    label: 'concept localization',
    errors
  });
  validateLocalizations({
    records: claimLocalizations,
    schema: CLAIM_LOCALIZATION_SCHEMA,
    refField: 'claim_ref',
    canonicalRefs: claimByRef,
    locales,
    label: 'claim localization',
    errors
  });

  for (const conceptRef of conceptByRef.keys()) for (const locale of locales) {
    if (!conceptLocalizations.some((record) => record.concept_ref === conceptRef && record.locale === locale)) {
      errors.push(`${conceptRef}: missing ${locale} concept localization`);
    }
  }
  for (const claimRef of claimByRef.keys()) for (const locale of locales) {
    if (!claimLocalizations.some((record) => record.claim_ref === claimRef && record.locale === locale)) {
      errors.push(`${claimRef}: missing ${locale} claim localization`);
    }
  }

  return frozenValidation(errors);
}

export function compileWorldKnowledgePack(value) {
  const validation = validateWorldKnowledgeAuthoringPack(value);
  if (!validation.ok) throw new WorldKnowledgePackValidationError(validation.errors);

  const concepts = sorted(value.concepts, 'concept_ref');
  const claims = sorted(value.claims, 'claim_ref');
  const profiles = sorted(value.coverage_profiles, 'profile_ref');
  const conceptLocalizations = groupLocalizations(value.concept_localizations, 'concept_ref');
  const claimLocalizations = groupLocalizations(value.claim_localizations, 'claim_ref');

  const exactIndexes = {
    concept_by_ref: Object.fromEntries(concepts.map((concept) => [concept.concept_ref, structuredClone(concept)])),
    concept_to_claim_refs: indexClaims(claims, (claim) => [claim.subject_ref, ...(claim.object?.kind === 'concept_ref' ? [claim.object.value] : [])]),
    domain_to_claim_refs: indexClaims(claims, (claim) => [claim.domain]),
    predicate_to_claim_refs: indexClaims(claims, (claim) => [claim.predicate])
  };
  const structuredIndexes = {
    time_to_claim_refs: indexClaims(claims, (claim) => [applicabilityTimeKey(claim.applicability)]),
    place_to_claim_refs: indexClaims(claims, (claim) => array(claim.applicability?.places).map((place) => place.place_ref)),
    actor_facet_to_claim_refs: indexClaims(claims, (claim) => objectEntries(claim.applicability?.actors).flatMap(([key, value]) => arrayOrValue(value).map((item) => `${key}=${String(item)}`))),
    question_class_to_profile_refs: indexRecords(profiles, 'profile_ref', (profile) => profile.question_classes),
    conflict_group_to_claim_refs: indexClaims(claims, (claim) => [claim.conflict_group_ref])
  };

  const lexicalIndexes = {};
  for (const locale of value.manifest.supported_locales) {
    const entries = new Map();
    for (const concept of concepts) {
      const localization = conceptLocalizations.get(concept.concept_ref)?.[locale];
      addLexical(entries, concept.concept_ref, [
        ...array(localization?.labels),
        localization?.short_definition,
        ...array(localization?.search_aliases)
      ]);
    }
    for (const claim of claims) {
      const localization = claimLocalizations.get(claim.claim_ref)?.[locale];
      addLexical(entries, claim.claim_ref, [localization?.runtime_text, ...array(localization?.search_aliases)]);
    }
    lexicalIndexes[locale] = Object.fromEntries([...entries.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([term, refs]) => [term, [...refs].sort()]));
  }

  return deepFreeze({
    schema: RUNTIME_SCHEMA,
    manifest: structuredClone(value.manifest),
    predicate_registry: structuredClone(value.predicate_registry),
    sources: sorted(value.sources, 'source_ref'),
    evidence: sorted(value.evidence, 'evidence_ref'),
    concepts: concepts.map((concept) => ({ ...structuredClone(concept), localizations: conceptLocalizations.get(concept.concept_ref) })),
    claims: claims.map((claim) => ({ ...structuredClone(claim), localizations: claimLocalizations.get(claim.claim_ref) })),
    coverage_profiles: profiles,
    exact_indexes: exactIndexes,
    structured_indexes: structuredIndexes,
    lexical_indexes: lexicalIndexes
  });
}

function validateLocalizations({ records, schema, refField, canonicalRefs, locales, label, errors }) {
  const seen = new Set();
  for (const record of records) {
    if (!isObject(record)) { errors.push(`${label} record must be an object`); continue; }
    const ref = text(record[refField]);
    const locale = text(record.locale);
    const key = `${ref}:${locale}`;
    exactKeys(record, refField === 'concept_ref'
      ? ['schema', 'concept_ref', 'locale', 'labels', 'short_definition', 'search_aliases']
      : ['schema', 'claim_ref', 'locale', 'runtime_text', 'search_aliases'], key, errors);
    if (record.schema !== schema) errors.push(`${key}: invalid ${label} schema`);
    if (!canonicalRefs.has(ref)) errors.push(`${key}: unknown canonical ref`);
    if (!locales.includes(locale)) errors.push(`${key}: unsupported locale`);
    if (seen.has(key)) errors.push(`${key}: duplicate ${label}`);
    seen.add(key);
    if (refField === 'concept_ref') {
      if (stringArray(record.labels, `${key}.labels`, errors).length === 0) errors.push(`${key}: labels are required`);
      if (!requiredText(record.short_definition)) errors.push(`${key}: short_definition is required`);
    }
    if (refField === 'claim_ref' && !requiredText(record.runtime_text)) errors.push(`${key}: runtime_text is required`);
    stringArray(record.search_aliases, `${key}.search_aliases`, errors, { allowEmpty: true });
  }
}

function validatePredicateSignature(domain, name, signature, domains, errors) {
  const label = `predicate_registry.${domain}.${name}`;
  if (!requiredText(name) || !isObject(signature)) { errors.push(`${label}: signature must be an object`); return; }
  exactKeys(signature, ['subject_domains', 'object_kinds', 'object_concept_domains', 'unit_family', 'allowed_units', 'polarities', 'cardinality', 'applicability', 'consumer_meaning'], label, errors);
  const subjectDomains = uniqueStrings(signature.subject_domains, `${label}.subject_domains`, errors);
  const objectKinds = uniqueStrings(signature.object_kinds, `${label}.object_kinds`, errors);
  const objectDomains = uniqueStrings(signature.object_concept_domains, `${label}.object_concept_domains`, errors, { allowEmpty: true });
  const units = uniqueStrings(signature.allowed_units, `${label}.allowed_units`, errors, { allowEmpty: true });
  const polarities = uniqueStrings(signature.polarities, `${label}.polarities`, errors);
  if (subjectDomains.length === 0 || subjectDomains.some((item) => !domains.includes(item))) errors.push(`${label}: invalid subject_domains`);
  if (objectKinds.length === 0 || objectKinds.some((item) => !CLAIM_OBJECT_KINDS.has(item))) errors.push(`${label}: invalid object_kinds`);
  if (objectDomains.some((item) => !domains.includes(item))) errors.push(`${label}: invalid object_concept_domains`);
  if (objectKinds.includes('concept_ref') !== (objectDomains.length > 0)) errors.push(`${label}: concept_ref requires object_concept_domains and other kinds forbid them`);
  if (signature.unit_family !== null && !requiredText(signature.unit_family)) errors.push(`${label}: unit_family must be null or non-empty`);
  const quantityAllowed = objectKinds.some((kind) => kind === 'quantity' || kind === 'range');
  if (quantityAllowed !== (text(signature.unit_family).length > 0 && units.length > 0)) errors.push(`${label}: quantities require unit_family and allowed_units`);
  if (polarities.length === 0 || polarities.some((item) => !CLAIM_POLARITIES.has(item))) errors.push(`${label}: invalid polarities`);
  if (!['single_assertion', 'multi_valued'].includes(signature.cardinality)) errors.push(`${label}: invalid cardinality`);
  if (!['universal', 'contextual', 'either'].includes(signature.applicability)) errors.push(`${label}: invalid applicability`);
  if (!requiredText(signature.consumer_meaning)) errors.push(`${label}: consumer_meaning is required`);
}

function validateClaimObject(object, signature, concepts, ref, errors) {
  if (!isObject(object) || !CLAIM_OBJECT_KINDS.has(object.kind)) { errors.push(`${ref}: invalid object kind`); return; }
  if (signature && !array(signature.object_kinds).includes(object.kind)) errors.push(`${ref}: object kind is not allowed by predicate`);
  if (object.kind === 'concept_ref') {
    exactKeys(object, ['kind', 'value'], `${ref}.object`, errors);
    const concept = concepts.get(text(object.value));
    if (!concept) errors.push(`${ref}: unknown object concept_ref`);
    else if (signature && !array(signature.object_concept_domains).includes(concept.domain)) errors.push(`${ref}: object concept domain is not allowed by predicate`);
  } else if (object.kind === 'literal') {
    exactKeys(object, ['kind', 'value'], `${ref}.object`, errors);
    if (!['string', 'number'].includes(typeof object.value) || (typeof object.value === 'string' && !text(object.value)) || (typeof object.value === 'number' && !Number.isFinite(object.value))) errors.push(`${ref}: literal object value is invalid`);
  } else if (object.kind === 'boolean') {
    exactKeys(object, ['kind', 'value'], `${ref}.object`, errors);
    if (typeof object.value !== 'boolean') errors.push(`${ref}: boolean object value is required`);
  } else if (object.kind === 'quantity') {
    exactKeys(object, ['kind', 'value', 'unit'], `${ref}.object`, errors);
    validateQuantity(object.value, object.unit, signature, ref, errors);
  } else {
    exactKeys(object, ['kind', 'min', 'max', 'unit'], `${ref}.object`, errors);
    if (!Number.isFinite(object.min) || !Number.isFinite(object.max) || object.min > object.max) errors.push(`${ref}: range must have finite min <= max`);
    validateUnit(object.unit, signature, ref, errors);
  }
}

function validateQuantity(value, unit, signature, ref, errors) {
  if (!Number.isFinite(value)) errors.push(`${ref}: quantity value must be finite`);
  validateUnit(unit, signature, ref, errors);
}

function validateUnit(unit, signature, ref, errors) {
  if (!text(unit)) errors.push(`${ref}: unit is required`);
  else if (signature && !array(signature.allowed_units).includes(unit)) errors.push(`${ref}: unit is not allowed by predicate`);
}

function validateApplicability(value, ref, errors) {
  if (!isObject(value) || Object.keys(value).length === 0) { errors.push(`${ref}: explicit applicability is required`); return; }
  exactKeys(value, ['context_scope', 'time', 'places', 'actors', 'conditions'], `${ref}.applicability`, errors);
  if (value.context_scope === 'universal') {
    if (Object.keys(value).length !== 1) errors.push(`${ref}: universal applicability cannot include contextual dimensions`);
    return;
  }
  if (value.context_scope != null) errors.push(`${ref}: invalid context_scope`);
  if (!value.time && !value.places && !value.actors && !value.conditions) errors.push(`${ref}: contextual applicability requires a dimension`);
  if (value.time != null) validateTime(value.time, `${ref}.applicability.time`, errors, true);
  if (value.places != null) {
    if (!Array.isArray(value.places)) errors.push(`${ref}.applicability.places must be an array`);
    else if (value.places.length === 0) errors.push(`${ref}.applicability.places must not be empty`);
    else for (const [index, place] of value.places.entries()) {
      const label = `${ref}.applicability.places[${index}]`;
      if (!isObject(place)) { errors.push(`${label} must be an object`); continue; }
      exactKeys(place, ['place_ref', 'relation'], label, errors);
      if (!requiredText(place.place_ref)) errors.push(`${label}.place_ref is required`);
      if (!PLACE_RELATIONS.has(place.relation)) errors.push(`${label}.relation is invalid`);
    }
  }
  if (value.actors != null) validateFacets(value.actors, `${ref}.applicability.actors`, ACTOR_FACETS, errors);
  if (value.conditions != null) validateConditions(value.conditions, `${ref}.applicability.conditions`, errors);
}

function validateTime(value, label, errors, requirePrecision) {
  if (!isObject(value)) { errors.push(`${label} must be an object`); return; }
  exactKeys(value, ['from', 'to', 'year', 'precision'], label, errors);
  if (!requirePrecision && value.precision == null) {
    const validSimple = (Number.isInteger(value.year) && value.from == null && value.to == null)
      || (Number.isInteger(value.from) && Number.isInteger(value.to) && value.year == null && value.from <= value.to);
    if (!validSimple) errors.push(`${label} requires year or from/to`);
    return;
  }
  if (!TIME_PRECISIONS.has(value.precision)) { errors.push(`${label}.precision is invalid`); return; }
  const numbers = [value.from, value.to, value.year].filter((item) => item != null);
  if (numbers.some((item) => !Number.isInteger(item))) errors.push(`${label} values must be integers`);
  if (value.from != null && value.to != null && value.from > value.to) errors.push(`${label}.from must be <= to`);
  const yearOnly = Number.isInteger(value.year) && value.from == null && value.to == null;
  const rangeOnly = Number.isInteger(value.from) && Number.isInteger(value.to) && value.year == null;
  if (['exact', 'circa', 'before', 'after'].includes(value.precision) && !yearOnly) errors.push(`${label}.${value.precision} requires only year`);
  if (['range', 'century_part'].includes(value.precision) && !rangeOnly) errors.push(`${label}.${value.precision} requires only from/to`);
  if (value.precision === 'unknown' && numbers.length > 0) errors.push(`${label}.unknown forbids date values`);
}

function validateQualifiers(value, ref, errors) {
  if (!isObject(value)) { errors.push(`${ref}: qualifiers are required`); return; }
  exactKeys(value, ['typicality', 'confidence', 'directness'], `${ref}.qualifiers`, errors);
  for (const [key, allowed] of Object.entries(QUALIFIER_VALUES)) if (!allowed.has(value[key])) errors.push(`${ref}.qualifiers.${key} is invalid`);
}

function validateKnowledgeAccess(value, ref, errors) {
  if (!isObject(value)) { errors.push(`${ref}: knowledge_access is required`); return; }
  exactKeys(value, ['class', 'required_facets', 'required_values'], `${ref}.knowledge_access`, errors);
  if (!KNOWLEDGE_ACCESS_CLASSES.has(value.class)) errors.push(`${ref}.knowledge_access.class is invalid`);
  const facets = uniqueStrings(value.required_facets, `${ref}.knowledge_access.required_facets`, errors, { allowEmpty: true });
  const allowed = ACCESS_FACETS_BY_CLASS[value.class];
  if (allowed && facets.some((facet) => !allowed.has(facet))) errors.push(`${ref}.knowledge_access.required_facets are incompatible with class`);
  if (allowed && allowed.size > 0 && facets.length === 0) errors.push(`${ref}.knowledge_access.required_facets are required for class`);
  if (value.required_values == null) return;
  if (!isObject(value.required_values)
      || Object.keys(value.required_values).length === 0) {
    errors.push(`${ref}.knowledge_access.required_values must be a non-empty object`);
    return;
  }
  for (const [facet, expected] of Object.entries(value.required_values)) {
    if (!facets.includes(facet)) errors.push(`${ref}.knowledge_access.required_values.${facet} requires a declared facet`);
    const values = Array.isArray(expected) ? expected : [expected];
    if (values.length === 0 || values.some((item) => !requiredText(item))) {
      errors.push(`${ref}.knowledge_access.required_values.${facet} must be a non-empty string or string array`);
    }
  }
}

function validateProfileScope(value, ref, errors) {
  if (!isObject(value) || Object.keys(value).length === 0) { errors.push(`${ref}: scope is required`); return; }
  exactKeys(value, ['context_scope', 'time', 'places', 'actor_facets'], `${ref}.scope`, errors);
  if (value.context_scope === 'universal') {
    if (Object.keys(value).length !== 1) errors.push(`${ref}: universal scope cannot include contextual dimensions`);
    return;
  }
  if (value.context_scope != null) errors.push(`${ref}: invalid scope context_scope`);
  if (!value.time && !value.places && !value.actor_facets) errors.push(`${ref}: contextual scope requires a dimension`);
  if (value.time != null) validateTime(value.time, `${ref}.scope.time`, errors, false);
  if (value.places != null) uniqueStrings(value.places, `${ref}.scope.places`, errors);
  if (value.actor_facets != null) validateFacets(value.actor_facets, `${ref}.scope.actor_facets`, ACTOR_FACETS, errors);
}

function validateFacets(value, label, allowedKeys, errors) {
  if (!isObject(value)) { errors.push(`${label} must be an object`); return; }
  if (Object.keys(value).length === 0) errors.push(`${label} must not be empty`);
  for (const [key, facet] of Object.entries(value)) {
    if (!allowedKeys.has(key)) errors.push(`${label}.${key} is unknown`);
    const valid = (typeof facet === 'string' && requiredText(facet)) || typeof facet === 'boolean' || (Array.isArray(facet) && facet.length > 0 && facet.every(requiredText));
    if (!valid) errors.push(`${label}.${key} is invalid`);
  }
}

function validateConditions(value, label, errors) {
  if (!Array.isArray(value)) { errors.push(`${label} must be an array`); return; }
  if (value.length === 0) errors.push(`${label} must not be empty`);
  for (const [index, condition] of value.entries()) {
    const itemLabel = `${label}[${index}]`;
    if (!isObject(condition)) { errors.push(`${itemLabel} must be an object`); continue; }
    exactKeys(condition, ['facet', 'operator', 'value'], itemLabel, errors);
    if (!CONDITION_FACETS.has(condition.facet) || !['equals', 'includes', 'present'].includes(condition.operator)) errors.push(`${itemLabel} is invalid`);
    if (condition.operator === 'present' && condition.value != null) errors.push(`${itemLabel}.present forbids value`);
    if (condition.operator !== 'present') {
      const validValue = requiredText(condition.value) || typeof condition.value === 'boolean' || Number.isFinite(condition.value)
        || (Array.isArray(condition.value) && condition.value.length > 0 && condition.value.every(requiredText));
      if (!validValue) errors.push(`${itemLabel}.value is invalid`);
    }
  }
}

function validateAnchor(value, ref, errors) {
  if (!isObject(value)) { errors.push(`${ref}: anchor must be an object`); return; }
  exactKeys(value, ['page', 'section', 'record_id'], `${ref}.anchor`, errors);
  const anchors = [value.page, value.section, value.record_id];
  if (anchors.some((item) => item != null && !requiredText(item))) errors.push(`${ref}: anchor values must be strings`);
  if (!anchors.some(requiredText)) errors.push(`${ref}: anchor needs page, section or record_id`);
}

function validateExternalMappings(value, ref, errors) {
  if (!Array.isArray(value)) { errors.push(`${ref}.external_mappings must be an array`); return; }
  const seen = new Set();
  for (const [index, mapping] of value.entries()) {
    const label = `${ref}.external_mappings[${index}]`;
    if (!isObject(mapping)) { errors.push(`${label} must be an object`); continue; }
    exactKeys(mapping, ['system', 'ref'], label, errors);
    if (!requiredText(mapping.system) || !requiredText(mapping.ref)) errors.push(`${label} system/ref are required`);
    const key = `${mapping.system}:${mapping.ref}`;
    if (seen.has(key)) errors.push(`${label} is duplicate`);
    seen.add(key);
  }
}

function validateConflictGroups(claims, predicatesByDomain, errors) {
  const groups = new Map();
  const assertionsByBoundary = new Map();
  for (const claim of claims) {
    if (!isObject(claim)) continue;
    const signature = predicatesByDomain.get(claim.domain)?.get(claim.predicate);
    if (signature?.cardinality === 'single_assertion') {
      const boundary = stableStringify({ domain: claim.domain, subject_ref: claim.subject_ref, predicate: claim.predicate, applicability: claim.applicability });
      const members = assertionsByBoundary.get(boundary) ?? [];
      members.push(claim);
      assertionsByBoundary.set(boundary, members);
    }
    if (claim.conflict_group_ref == null) continue;
    if (!prefixedText(claim.conflict_group_ref, 'wk-conflict:')) {
      errors.push(`${claim.claim_ref ?? '<claim>'}: invalid conflict_group_ref`);
      continue;
    }
    const members = groups.get(claim.conflict_group_ref) ?? [];
    members.push(claim);
    groups.set(claim.conflict_group_ref, members);
  }
  for (const [groupRef, members] of groups) {
    if (members.length < 2) { errors.push(`${groupRef}: conflict group needs at least two claims`); continue; }
    const boundary = new Set(members.map((claim) => stableStringify({ domain: claim.domain, subject_ref: claim.subject_ref, predicate: claim.predicate, applicability: claim.applicability })));
    if (boundary.size !== 1) errors.push(`${groupRef}: claims must share domain, subject, predicate and applicability`);
    const assertions = new Set(members.map((claim) => stableStringify({ object: claim.object, polarity: claim.polarity })));
    if (assertions.size < 2) errors.push(`${groupRef}: claims must contain distinct assertions`);
  }
  for (const members of assertionsByBoundary.values()) {
    const assertions = new Set(members.map((claim) => stableStringify({ object: claim.object, polarity: claim.polarity })));
    if (assertions.size < 2) continue;
    const groupRefs = new Set(members.map((claim) => claim.conflict_group_ref).filter(Boolean));
    if (groupRefs.size !== 1 || members.some((claim) => !claim.conflict_group_ref)) {
      errors.push(`${members[0].claim_ref ?? '<claim>'}: incompatible single-assertion claims require one explicit conflict group`);
    }
  }
}

function indexed(values, field, label, errors) {
  const result = new Map();
  for (const record of values) {
    if (!isObject(record)) { errors.push(`${label} record must be an object`); continue; }
    const ref = text(record[field]);
    if (!ref) { errors.push(`${label}: ${field} is required`); continue; }
    if (result.has(ref)) errors.push(`${label}: duplicate ${field} ${ref}`);
    result.set(ref, record);
  }
  return result;
}

function records(value, label, errors) {
  if (!Array.isArray(value)) { errors.push(`${label} must be an array`); return []; }
  return value;
}

function uniqueStrings(value, label, errors, { allowEmpty = false } = {}) {
  if (!Array.isArray(value)) { errors.push(`${label} must be an array`); return []; }
  const result = value.filter(requiredText).map((item) => item.trim());
  if (result.length !== value.length) errors.push(`${label} must contain non-empty strings`);
  if (new Set(result).size !== result.length) errors.push(`${label} contains duplicates`);
  if (!allowEmpty && value.length === 0) errors.push(`${label} must not be empty`);
  return [...new Set(result)];
}

function stringArray(value, label, errors, options) {
  return uniqueStrings(value, label, errors, options);
}

function exactKeys(value, allowed, label, errors) {
  if (!isObject(value)) return;
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(value)) if (!allowedSet.has(key)) errors.push(`${label}: unknown field ${key}`);
}

function groupLocalizations(values, refField) {
  const grouped = new Map();
  for (const record of values) {
    const byLocale = grouped.get(record[refField]) ?? {};
    byLocale[record.locale] = structuredClone(record);
    grouped.set(record[refField], byLocale);
  }
  return grouped;
}

function indexClaims(claims, keysForClaim) {
  const index = new Map();
  for (const claim of claims) for (const key of new Set(keysForClaim(claim).map(text).filter(Boolean))) {
    const refs = index.get(key) ?? [];
    refs.push(claim.claim_ref);
    index.set(key, refs);
  }
  return Object.fromEntries([...index.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, refs]) => [key, refs.sort()]));
}

function indexRecords(values, refField, keysForRecord) {
  const index = new Map();
  for (const value of values) for (const key of new Set(array(keysForRecord(value)).map(text).filter(Boolean))) {
    const refs = index.get(key) ?? [];
    refs.push(value[refField]);
    index.set(key, refs);
  }
  return Object.fromEntries([...index.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([key, refs]) => [key, refs.sort()]));
}

function applicabilityTimeKey(value) {
  if (value?.context_scope === 'universal') return 'universal';
  const time = value?.time;
  if (!time) return '';
  return `${time.precision}:${time.year ?? ''}:${time.from ?? ''}:${time.to ?? ''}`;
}

function addLexical(index, targetRef, texts) {
  for (const value of texts) for (const token of tokenize(value)) {
    const refs = index.get(token) ?? new Set();
    refs.add(targetRef);
    index.set(token, refs);
  }
}

function tokenize(value) {
  return text(value).toLocaleLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]{2,}/gu) ?? [];
}

function sorted(values, field) {
  return values.map((value) => structuredClone(value)).sort((a, b) => text(a[field]).localeCompare(text(b[field])));
}

function frozenValidation(errors) {
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze([...errors]) });
}

function array(value) { return Array.isArray(value) ? value : []; }
function arrayOrValue(value) { return Array.isArray(value) ? value : [value]; }
function objectEntries(value) { return isObject(value) ? Object.entries(value) : []; }
function text(value) { return String(value ?? '').trim(); }
function requiredText(value) { return typeof value === 'string' && value.trim().length > 0; }
function prefixedText(value, prefix) { return requiredText(value) && value.trim().startsWith(prefix) && value.trim().length > prefix.length; }
function isObject(value) { return value != null && typeof value === 'object' && !Array.isArray(value); }

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
