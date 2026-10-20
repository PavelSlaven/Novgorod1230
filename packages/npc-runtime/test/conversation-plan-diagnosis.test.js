import assert from 'node:assert/strict';
import test from 'node:test';
import {
  diagnoseConversationPlan,
  diagnoseMixedScriptRepair,
  projectNpcConversationSubject,
  validateConversationContributionPlan,
  validateNpcConversationResponseRequest
} from '../src/index.js';

const ref = (entity_kind, entity_id) => ({ entity_kind, entity_id });
const copy = (value) => structuredClone(value);

const MIXED = 'протoku';
const FIXED = 'протоку';
const MIXED_MESSAGE = 'This word mixes Latin and Cyrillic letters.';
const REPAIR_MESSAGE = 'Format repair may change only the spelling of the listed mixed-script words.';

function request() {
  const subject = projectNpcConversationSubject({
    npc_ref: ref('npc', 'speaker'),
    npc_snapshot: { instance_id: 'speaker' },
    current_activity_snapshot: { status: 'idle', can_continue_automatically: false },
    additional_knowledge_refs: [ref('known_fact', 'fact-1')]
  });
  return {
    schema: 'npc_conversation_response_request_v1',
    request_id: 'request-2',
    boundary_id: 'boundary-2',
    conversation_id: 'conversation-1',
    exchange_id: 'exchange-1',
    state_version: 2,
    requested_at: { whole_minutes: '10', subminute_numerator: '0', subminute_denominator: '1' },
    npc_ref: ref('npc', 'speaker'),
    decision_reasons: {
      significance: 'critical',
      categories: ['self', 'communication'],
      signal_refs: [ref('npc_decision_signal', 'signal-a'), ref('npc_decision_signal', 'signal-z')],
      perceived_changes: ['Услышан прямой вопрос.']
    },
    npc: subject.npc,
    perceived_message: {
      source_statement_ref: ref('conversation_statement', 'statement-1'),
      perception_result_ref: ref('perception_result', 'perception-1')
    },
    public_conversation_history: [],
    knowledge: subject.knowledge,
    memory: subject.memory,
    social_context: {},
    available_resources: subject.available_resources,
    allowed_references: {
      actor_refs: [ref('npc', 'listener'), ref('npc', 'speaker'), ref('player_character', 'player')],
      entity_refs: [ref('place', 'abc')],
      knowledge_refs: subject.knowledge_refs,
      combat_target_refs: []
    },
    decision_scope: {
      conversation_mode: true,
      action_handoff_available: true,
      combat_handoff_available: false,
      allowed_attribute_refs: ['influence'],
      allowed_skill_refs: ['communication'],
      allowed_check_profile_refs: ['risky'],
      allowed_duration_classes: ['brief'],
      operation_contract: { emit_interaction: {} }
    }
  };
}

function plan() {
  return {
    schema: 'conversation_contribution_plan_v1',
    request_id: 'request-2',
    boundary_id: 'boundary-2',
    conversation_id: 'conversation-1',
    exchange_id: 'exchange-1',
    state_version: 2,
    speaker_ref: ref('npc', 'speaker'),
    contribution_kind: 'speech',
    primary_addressee_ref: ref('npc', 'listener'),
    intended_addressee_refs: [ref('npc', 'listener')],
    affected_actor_refs: [],
    speech: {
      utterance_text: 'Слушай меня внимательно.',
      dominant_act: 'inform',
      interaction_tags: [],
      topic_refs: [],
      claims: [{
        claim_id: 'c1',
        content_summary: 'Протока замёрзла.',
        form: 'statement',
        speaker_posture: 'believed_true',
        source_knowledge_refs: [ref('known_fact', 'fact-1')],
        mentioned_entity_refs: [ref('place', 'abc')]
      }],
      response_expectation: { kind: 'none', target_refs: [] }
    },
    interpretation: {
      intent: 'сообщить сведения',
      grounded_contribution: 'обратиться к собеседнику',
      adaptation: 'literal'
    },
    resolution: 'automatic',
    activity: { duration_class: 'brief', effort: 'none' },
    supporting_operations: [],
    check: null,
    handoff: null,
    reason: 'NPC решил ответить.'
  };
}

function combatPlan(targetRef) {
  return {
    ...plan(),
    contribution_kind: 'combat_handoff',
    primary_addressee_ref: null,
    intended_addressee_refs: [],
    speech: null,
    handoff: { kind: 'combat', intent: 'передать управление бою', target_actor_refs: [targetRef] }
  };
}

function diagnose(mutate = () => {}, requestMutate = () => {}) {
  const candidate = plan();
  const scope = request();
  mutate(candidate);
  requestMutate(scope);
  return diagnoseConversationPlan(candidate, scope);
}

const codes = (errors) => errors.map(({ code }) => code);
const only = (errors, code) => errors.filter((error) => error.code === code);

test('fixtures are valid and the mixed word really mixes scripts', () => {
  assert.equal(validateNpcConversationResponseRequest(request()), true);
  assert.equal(validateConversationContributionPlan(plan(), request()), true);
  assert.equal(validateConversationContributionPlan(combatPlan(ref('npc', 'listener')), {
    ...request(),
    decision_scope: { ...request().decision_scope, combat_handoff_available: true },
    allowed_references: { ...request().allowed_references, combat_target_refs: [ref('npc', 'listener')] }
  }), true);
  assert.match(MIXED, /\p{Script=Cyrillic}/u);
  assert.match(MIXED, /\p{Script=Latin}/u);
  assert.doesNotMatch(FIXED, /\p{Script=Latin}/u);
});

test('a valid plan yields an empty frozen array', () => {
  const errors = diagnoseConversationPlan(plan(), request());
  assert.deepEqual(errors, []);
  assert.equal(Object.isFrozen(errors), true);
});

test('a mixed-script word in utterance_text is reported once with its path and quote', () => {
  const errors = diagnose((candidate) => { candidate.speech.utterance_text = `Не ходи по ${MIXED} зимой.`; });
  assert.deepEqual(errors, [{
    code: 'mixed_script_word',
    category: 'format',
    path: '$.speech.utterance_text',
    message: MIXED_MESSAGE,
    quote: MIXED
  }]);
  assert.equal(Object.isFrozen(errors), true);
  assert.equal(Object.isFrozen(errors[0]), true);
});

test('a mixed-script word in a claim content_summary and in grounded_contribution is reported at its path', () => {
  const inClaim = diagnose((candidate) => { candidate.speech.claims[0].content_summary = `Про ${MIXED} никто не знает.`; });
  assert.deepEqual(inClaim, [{
    code: 'mixed_script_word',
    category: 'format',
    path: '$.speech.claims[0].content_summary',
    message: MIXED_MESSAGE,
    quote: MIXED
  }]);
  const inGrounded = diagnose((candidate) => { candidate.interpretation.grounded_contribution = `Предупредить про ${MIXED}.`; });
  assert.deepEqual(inGrounded, [{
    code: 'mixed_script_word',
    category: 'format',
    path: '$.interpretation.grounded_contribution',
    message: MIXED_MESSAGE,
    quote: MIXED
  }]);
});

test('every occurrence is reported, in text order across the three scanned paths', () => {
  const errors = diagnose((candidate) => {
    candidate.speech.utterance_text = `${MIXED} и снова ${MIXED}.`;
    candidate.speech.claims[0].content_summary = MIXED;
    candidate.interpretation.grounded_contribution = MIXED;
  });
  assert.deepEqual(errors.map(({ path }) => path), [
    '$.speech.utterance_text',
    '$.speech.utterance_text',
    '$.speech.claims[0].content_summary',
    '$.interpretation.grounded_contribution'
  ]);
  assert.ok(errors.every(({ quote }) => quote === MIXED));
});

test('a mixed word is a maximal letter run, so punctuation and digits split words', () => {
  const errors = diagnose((candidate) => {
    candidate.speech.utterance_text = `Что-то, ok, ${MIXED}! да 2fast и б${'a'}`;
  });
  assert.deepEqual(errors.map(({ quote }) => quote), [MIXED, 'бa']);
});

test('clean Russian text, Latin ids and keys, and a purely Latin word are not reported', () => {
  assert.deepEqual(diagnose((candidate) => {
    candidate.speech.utterance_text = 'Всё хорошо, OK? Ёлка и ещё.';
    candidate.speech.claims[0].content_summary = 'Слышал это от Ивана.';
    candidate.interpretation.grounded_contribution = 'Подтвердить, что всё OK.';
  }), []);
  assert.deepEqual(diagnose((candidate) => {
    candidate.speech.claims[0].claim_id = 'c1-abc';
    candidate.speech.claims[0].form = 'statement';
  }), []);
});

test('mixed words outside the three scanned texts are never reported', () => {
  assert.deepEqual(diagnose((candidate) => {
    candidate.reason = `Причина ${MIXED}.`;
    candidate.interpretation.intent = `намерение ${MIXED}`;
    candidate.speech.topic_refs = [MIXED];
    candidate.activity.effort = MIXED;
    candidate.speech.claims[0].claim_id = MIXED;
  }), []);
});

test('a reference outside allowed_references is a semantic_grounding error with the ref JSON as quote', () => {
  const missing = ref('known_fact', 'nonexistent');
  const errors = diagnose((candidate) => { candidate.speech.claims[0].source_knowledge_refs = [missing]; });
  assert.deepEqual(errors, [{
    code: 'reference_not_allowed',
    category: 'semantic_grounding',
    path: '$.speech.claims[0].source_knowledge_refs[0]',
    message: errors[0].message,
    quote: JSON.stringify(missing)
  }]);
  assert.equal(typeof errors[0].message, 'string');
});

test('reference membership follows the validator rules for every reference slot', () => {
  const stranger = ref('npc', 'stranger');
  const strangerJson = JSON.stringify(stranger);
  const actorSlots = diagnose((candidate) => {
    candidate.primary_addressee_ref = stranger;
    candidate.intended_addressee_refs = [stranger];
    candidate.affected_actor_refs = [ref('npc', 'listener'), stranger];
    candidate.speech.response_expectation = { kind: 'answer', target_refs: [stranger] };
  });
  assert.deepEqual(actorSlots.map(({ path }) => path), [
    '$.primary_addressee_ref',
    '$.intended_addressee_refs[0]',
    '$.affected_actor_refs[1]',
    '$.speech.response_expectation.target_refs[0]'
  ]);
  assert.ok(actorSlots.every(({ code, category, quote }) =>
    code === 'reference_not_allowed' && category === 'semantic_grounding' && quote === strangerJson));

  const entityErrors = diagnose((candidate) => {
    candidate.speech.claims[0].mentioned_entity_refs = [ref('place', 'abc'), ref('npc', 'listener'), ref('item', 'hidden')];
  });
  assert.deepEqual(entityErrors.map(({ path, quote }) => [path, quote]), [
    ['$.speech.claims[0].mentioned_entity_refs[2]', JSON.stringify(ref('item', 'hidden'))]
  ]);

  const request_ = request();
  request_.decision_scope.combat_handoff_available = true;
  request_.allowed_references.combat_target_refs = [ref('player_character', 'player')];
  const combatErrors = diagnoseConversationPlan(combatPlan(ref('npc', 'listener')), request_);
  assert.deepEqual(combatErrors.map(({ code, category, path }) => [code, category, path]), [
    ['reference_not_allowed', 'semantic_grounding', '$.handoff.target_actor_refs[0]']
  ]);
  assert.deepEqual(diagnoseConversationPlan(combatPlan(ref('player_character', 'player')), request_), []);
});

test('an unknown enum value reports invalid_enum with allowed_values', () => {
  const errors = diagnose((candidate) => { candidate.speech.dominant_act = 'sing'; });
  assert.equal(errors.length, 1);
  assert.equal(errors[0].code, 'invalid_enum');
  assert.equal(errors[0].category, 'format');
  assert.equal(errors[0].path, '$.speech.dominant_act');
  assert.ok(errors[0].allowed_values.includes('inform'));
  assert.ok(!errors[0].allowed_values.includes('sing'));

  const others = [
    ['$.contribution_kind', (candidate) => { candidate.contribution_kind = 'shout'; }],
    ['$.speech.claims[0].speaker_posture', (candidate) => { candidate.speech.claims[0].speaker_posture = 'sure'; }],
    ['$.interpretation.adaptation', (candidate) => { candidate.interpretation.adaptation = 'free'; }],
    ['$.resolution', (candidate) => { candidate.resolution = 'maybe'; }],
    ['$.activity.duration_class', (candidate) => { candidate.activity.duration_class = 'forever'; }]
  ];
  for (const [path, mutate] of others) {
    const [error] = only(diagnose(mutate), 'invalid_enum').filter((entry) => entry.path === path);
    assert.ok(error, path);
    assert.equal(error.category, 'format');
    assert.ok(Array.isArray(error.allowed_values) && error.allowed_values.length > 0, path);
  }
});

test('duration_class and contribution_kind are also bounded by the request scope', () => {
  const duration = diagnose((candidate) => { candidate.activity.duration_class = 'short'; });
  assert.deepEqual(duration, [{
    code: 'invalid_enum',
    category: 'format',
    path: '$.activity.duration_class',
    message: duration[0].message,
    allowed_values: ['brief']
  }]);

  const kinds = diagnose(() => {}, (scope) => { scope.decision_scope.allowed_contribution_kinds = ['silence']; });
  assert.deepEqual(kinds.map(({ code, path, allowed_values }) => [code, path, allowed_values]), [
    ['invalid_enum', '$.contribution_kind', ['silence']]
  ]);
});

test('every allowed value listed by an invalid_enum error is accepted by the validator and the diagnosis', () => {
  const fields = [
    ['$.speech.dominant_act', (candidate, value) => { candidate.speech.dominant_act = value; }],
    ['$.speech.claims[0].speaker_posture', (candidate, value) => { candidate.speech.claims[0].speaker_posture = value; }],
    ['$.interpretation.adaptation', (candidate, value) => { candidate.interpretation.adaptation = value; }],
    ['$.activity.duration_class', (candidate, value) => { candidate.activity.duration_class = value; }]
  ];
  for (const [path, set] of fields) {
    const broken = plan();
    set(broken, 'bogus');
    const error = diagnoseConversationPlan(broken, null).find((entry) => entry.path === path);
    assert.ok(error, path);
    for (const value of error.allowed_values) {
      const candidate = plan();
      set(candidate, value);
      assert.equal(validateConversationContributionPlan(candidate, null), true, `${path}=${value}`);
      assert.deepEqual(diagnoseConversationPlan(candidate, null), [], `${path}=${value}`);
    }
  }
  const kinds = diagnoseConversationPlan({ ...plan(), contribution_kind: 'shout' }, null)
    .find(({ path }) => path === '$.contribution_kind');
  assert.deepEqual(kinds.allowed_values, ['speech', 'silence', 'leave_conversation', 'action_handoff', 'combat_handoff']);
  const resolution = diagnoseConversationPlan({ ...plan(), resolution: 'maybe' }, null).find(({ path }) => path === '$.resolution');
  assert.deepEqual(resolution.allowed_values, ['automatic', 'check_required']);
});

test('missing and unexpected fields are reported with the field path', () => {
  const missingForm = diagnose((candidate) => { delete candidate.speech.claims[0].form; });
  assert.deepEqual(missingForm.map(({ code, category, path }) => [code, category, path]), [
    ['missing_field', 'format', '$.speech.claims[0].form']
  ]);

  const missingMany = diagnose((candidate) => {
    delete candidate.reason;
    delete candidate.speech.response_expectation;
    delete candidate.interpretation.intent;
    delete candidate.activity.effort;
  });
  assert.deepEqual(missingMany.map(({ code, path }) => [code, path]), [
    ['missing_field', '$.reason'],
    ['missing_field', '$.speech.response_expectation'],
    ['missing_field', '$.interpretation.intent'],
    ['missing_field', '$.activity.effort']
  ]);

  const extra = diagnose((candidate) => { candidate.bonus = 1; });
  assert.deepEqual(extra.map(({ code, category, path }) => [code, category, path]), [
    ['unexpected_field', 'format', '$.bonus']
  ]);

  const nestedExtra = diagnose((candidate) => {
    candidate.speech.mood = 'x';
    candidate.speech.claims[0].weight = 1;
    candidate.speech.response_expectation.note = 'x';
    candidate.interpretation.why = 'x';
    candidate.activity.pace = 'x';
  });
  assert.deepEqual(nestedExtra.map(({ code, path }) => [code, path]), [
    ['unexpected_field', '$.speech.mood'],
    ['unexpected_field', '$.speech.claims[0].weight'],
    ['unexpected_field', '$.speech.response_expectation.note'],
    ['unexpected_field', '$.interpretation.why'],
    ['unexpected_field', '$.activity.pace']
  ]);
});

test('a missing field is not also reported as an enum or type error', () => {
  const errors = diagnose((candidate) => {
    delete candidate.speech.dominant_act;
    delete candidate.speech.utterance_text;
    delete candidate.resolution;
  });
  assert.ok(errors.every(({ code }) => code === 'missing_field'));
  assert.deepEqual(errors.map(({ path }) => path).sort(), [
    '$.resolution', '$.speech.dominant_act', '$.speech.utterance_text'
  ]);
});

test('a plan that is not a plain object yields a single conversation_plan_not_object error', () => {
  for (const value of [null, undefined, [], 'plan', 5, new Map()]) {
    const errors = diagnoseConversationPlan(value, request());
    assert.equal(errors.length, 1);
    assert.deepEqual(Object.keys(errors[0]).sort(), ['category', 'code', 'message', 'path']);
    assert.equal(errors[0].code, 'conversation_plan_not_object');
    assert.equal(errors[0].category, 'format');
    assert.equal(errors[0].path, '$');
  }
});

test('wrong types of text fields and malformed entity refs report invalid_type', () => {
  const cases = [
    ['$.speech.utterance_text', (candidate) => { candidate.speech.utterance_text = ''; }],
    ['$.speech.utterance_text', (candidate) => { candidate.speech.utterance_text = 5; }],
    ['$.speech.claims[0].content_summary', (candidate) => { candidate.speech.claims[0].content_summary = '   '; }],
    ['$.interpretation.intent', (candidate) => { candidate.interpretation.intent = ''; }],
    ['$.interpretation.grounded_contribution', (candidate) => { candidate.interpretation.grounded_contribution = null; }],
    ['$.primary_addressee_ref', (candidate) => { candidate.primary_addressee_ref = { entity_kind: 'npc' }; }],
    ['$.intended_addressee_refs[0]', (candidate) => {
      candidate.intended_addressee_refs = [{ entity_kind: 'npc', entity_id: 'listener', extra: 1 }];
    }],
    ['$.affected_actor_refs[0]', (candidate) => { candidate.affected_actor_refs = [ref('npc', '')]; }],
    ['$.speech.claims[0].source_knowledge_refs', (candidate) => { candidate.speech.claims[0].source_knowledge_refs = 'fact-1'; }],
    ['$.speech.claims[0].mentioned_entity_refs[0]', (candidate) => { candidate.speech.claims[0].mentioned_entity_refs = ['abc']; }],
    ['$.speech', (candidate) => { candidate.speech = 'text'; }],
    ['$.speech.claims[0]', (candidate) => { candidate.speech.claims = ['claim']; }],
    ['$.speaker_ref', (candidate) => { candidate.speaker_ref = 'speaker'; }]
  ];
  for (const [path, mutate] of cases) {
    const errors = diagnose(mutate);
    const found = errors.filter((error) => error.path === path);
    assert.deepEqual(found.map(({ code, category }) => [code, category]), [['invalid_type', 'format']], path);
    assert.equal(only(errors, 'reference_not_allowed').length, 0, path);
  }
});

test('envelope identity fields that differ from the request report envelope_mismatch', () => {
  const cases = [
    ['$.schema', (candidate) => { candidate.schema = 'conversation_contribution_plan_v2'; }],
    ['$.request_id', (candidate) => { candidate.request_id = 'request-9'; }],
    ['$.boundary_id', (candidate) => { candidate.boundary_id = 'boundary-9'; }],
    ['$.conversation_id', (candidate) => { candidate.conversation_id = 'conversation-9'; }],
    ['$.exchange_id', (candidate) => { candidate.exchange_id = 'exchange-9'; }],
    ['$.state_version', (candidate) => { candidate.state_version = 3; }],
    ['$.speaker_ref', (candidate) => { candidate.speaker_ref = ref('npc', 'listener'); }]
  ];
  for (const [path, mutate] of cases) {
    assert.deepEqual(diagnose(mutate).map(({ code, category, path: at }) => [code, category, at]),
      [['envelope_mismatch', 'format', path]], path);
  }
});

test('a failure with no named check yields the single residual schema error', () => {
  const duplicated = diagnose((candidate) => {
    candidate.intended_addressee_refs = [ref('npc', 'listener'), ref('npc', 'listener')];
  });
  assert.deepEqual(duplicated, [{
    code: 'conversation_contribution_schema_invalid',
    category: 'format',
    path: '$',
    message: 'Response does not satisfy conversation_contribution_plan_v1 rules not covered by a named check.'
  }]);

  const primaryOutsideIntended = diagnose((candidate) => { candidate.intended_addressee_refs = []; });
  assert.deepEqual(codes(primaryOutsideIntended), ['conversation_contribution_schema_invalid']);
});

test('a shape that makes the request-bound validator throw is reported as the residual error', () => {
  const candidate = plan();
  candidate.primary_addressee_ref = null;
  candidate.intended_addressee_refs = new Array(1);
  assert.throws(() => validateConversationContributionPlan(candidate, request()));
  assert.deepEqual(codes(diagnoseConversationPlan(candidate, request())), ['conversation_contribution_schema_invalid']);
});

test('all errors are collected in check order and the residual error is not added after a named one', () => {
  const errors = diagnose((candidate) => {
    candidate.bonus = 1;
    candidate.speech.dominant_act = 'sing';
    candidate.reason = '';
    candidate.request_id = 'request-9';
    candidate.speech.claims[0].source_knowledge_refs = [ref('known_fact', 'nonexistent')];
    candidate.interpretation.grounded_contribution = `Про ${MIXED}.`;
  });
  assert.deepEqual(codes(errors), [
    'unexpected_field',
    'invalid_enum',
    'invalid_type',
    'envelope_mismatch',
    'reference_not_allowed',
    'mixed_script_word'
  ]);
  for (const error of errors) {
    const extra = Object.keys(error).filter((key) => !['code', 'category', 'path', 'message', 'quote', 'allowed_values'].includes(key));
    assert.deepEqual(extra, []);
    assert.ok(['format', 'semantic_grounding'].includes(error.category));
    assert.match(error.path, /^\$/u);
    assert.equal(typeof error.message, 'string');
  }
});

test('the diagnosis does not mutate its inputs', () => {
  const candidate = plan();
  candidate.speech.utterance_text = `Про ${MIXED}.`;
  const scope = request();
  const before = [copy(candidate), copy(scope)];
  diagnoseConversationPlan(candidate, scope);
  assert.deepEqual([candidate, scope], before);
});

function repairFixture() {
  const original = plan();
  original.speech.utterance_text = `Не ходи по ${MIXED} зимой.`;
  original.speech.claims[0].content_summary = `Про ${MIXED} никто не знает.`;
  original.interpretation.grounded_contribution = `Предупредить про ${MIXED}.`;
  const errors = diagnoseConversationPlan(original, request());
  const repaired = copy(original);
  repaired.speech.utterance_text = original.speech.utterance_text.replace(MIXED, FIXED);
  repaired.speech.claims[0].content_summary = original.speech.claims[0].content_summary.replace(MIXED, FIXED);
  repaired.interpretation.grounded_contribution = original.interpretation.grounded_contribution.replace(MIXED, FIXED);
  return { original, repaired, errors };
}

const failedPaths = (result) => result.map(({ path }) => path);

test('a Cyrillic respelling of every listed mixed word is an acceptable repair', () => {
  const { original, repaired, errors } = repairFixture();
  assert.equal(errors.length, 3);
  const result = diagnoseMixedScriptRepair(original, repaired, errors);
  assert.deepEqual(result, []);
  assert.equal(Object.isFrozen(result), true);
});

test('repeated occurrences may be respelled independently', () => {
  const original = plan();
  original.speech.utterance_text = `${MIXED} и ещё раз ${MIXED}`;
  const errors = diagnoseConversationPlan(original, request());
  const repaired = copy(original);
  repaired.speech.utterance_text = 'протоку и ещё раз протоки';
  assert.deepEqual(diagnoseMixedScriptRepair(original, repaired, errors), []);
});

test('literal text with regular expression metacharacters is compared literally', () => {
  const original = plan();
  original.speech.utterance_text = `(Что?) [да] $1 .* ${MIXED} \\d+ {2} | ^x$ -a`;
  const errors = diagnoseConversationPlan(original, request());
  const repaired = copy(original);
  repaired.speech.utterance_text = original.speech.utterance_text.replace(MIXED, FIXED);
  assert.deepEqual(diagnoseMixedScriptRepair(original, repaired, errors), []);
  repaired.speech.utterance_text = repaired.speech.utterance_text.replace('(Что?)', '(Что!)');
  assert.deepEqual(failedPaths(diagnoseMixedScriptRepair(original, repaired, errors)), ['$.speech.utterance_text']);
});

test('a repair that also changes another word of the same text fails', () => {
  const { original, repaired, errors } = repairFixture();
  repaired.speech.utterance_text = `Иди по ${FIXED} зимой.`;
  const result = diagnoseMixedScriptRepair(original, repaired, errors);
  assert.deepEqual(result, [{
    code: 'mixed_script_repair_changed_text',
    category: 'format',
    path: '$.speech.utterance_text',
    message: REPAIR_MESSAGE
  }]);
});

test('a repair that changes a text path with no listed mixed word fails', () => {
  const { original, repaired, errors } = repairFixture();
  const onlyUtterance = errors.filter(({ path }) => path === '$.speech.utterance_text');
  assert.deepEqual(failedPaths(diagnoseMixedScriptRepair(original, repaired, onlyUtterance)), [
    '$.speech.claims[0].content_summary',
    '$.interpretation.grounded_contribution'
  ]);

  const untouched = copy(original);
  untouched.speech.utterance_text = repaired.speech.utterance_text;
  untouched.speech.claims[0].content_summary = 'Совсем другой текст.';
  assert.deepEqual(failedPaths(diagnoseMixedScriptRepair(original, untouched, errors)), [
    '$.speech.claims[0].content_summary',
    '$.interpretation.grounded_contribution'
  ]);
});

test('with no mixed-script errors the texts must stay exactly the same', () => {
  const original = plan();
  assert.deepEqual(diagnoseMixedScriptRepair(original, copy(original), []), []);
  const changed = copy(original);
  changed.speech.utterance_text = 'Слушай меня очень внимательно.';
  assert.deepEqual(failedPaths(diagnoseMixedScriptRepair(original, changed, [])), ['$.speech.utterance_text']);
  const unrelated = [{ code: 'missing_field', category: 'format', path: '$.reason', message: 'x' }];
  assert.deepEqual(failedPaths(diagnoseMixedScriptRepair(original, changed, unrelated)), ['$.speech.utterance_text']);
});

test('a replacement that is still mixed, Latin, empty or not a string fails', () => {
  const { original, errors } = repairFixture();
  const variants = [
    MIXED,
    'protoku',
    `${FIXED}x`,
    'про току',
    '',
    null,
    42
  ];
  for (const replacement of variants) {
    const repaired = copy(original);
    repaired.speech.utterance_text = typeof replacement === 'string'
      ? original.speech.utterance_text.replace(MIXED, replacement)
      : replacement;
    repaired.speech.claims[0].content_summary = original.speech.claims[0].content_summary.replace(MIXED, FIXED);
    repaired.interpretation.grounded_contribution = original.interpretation.grounded_contribution.replace(MIXED, FIXED);
    assert.deepEqual(failedPaths(diagnoseMixedScriptRepair(original, repaired, errors)), ['$.speech.utterance_text'],
      String(replacement));
  }
});

test('a missing text path or a missing repaired object fails every original text path', () => {
  const { original, repaired, errors } = repairFixture();
  delete repaired.speech.claims[0].content_summary;
  assert.deepEqual(failedPaths(diagnoseMixedScriptRepair(original, repaired, errors)), ['$.speech.claims[0].content_summary']);
  assert.deepEqual(failedPaths(diagnoseMixedScriptRepair(original, null, errors)), [
    '$.speech.utterance_text',
    '$.speech.claims[0].content_summary',
    '$.interpretation.grounded_contribution'
  ]);
});

test('text that does not exist as a string in the original is not checked', () => {
  const original = plan();
  original.interpretation.grounded_contribution = null;
  const repaired = copy(original);
  repaired.interpretation.grounded_contribution = 'что угодно';
  assert.deepEqual(diagnoseMixedScriptRepair(original, repaired, []), []);
});
