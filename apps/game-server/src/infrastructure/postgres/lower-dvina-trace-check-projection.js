const CHECK_MODIFIER_LABELS = Object.freeze({
  attribute: 'Характеристика', skill: 'Навык', state: 'Состояние',
  equipment: 'Снаряжение и нагрузка', circumstances: 'Обстоятельства'
});
const ATTRIBUTE_LABELS = Object.freeze({
  strength: 'Сила', dexterity: 'Ловкость', endurance: 'Выносливость',
  reason: 'Разум', attention: 'Внимание', influence: 'Влияние'
});
const SKILL_LABELS = Object.freeze({
  athletics: 'Атлетика', stealth: 'Скрытность', melee: 'Ближний бой',
  ranged_combat: 'Дальний бой', craft: 'Ремесло', household: 'Хозяйство',
  survival: 'Выживание', riding: 'Верховая езда', healing: 'Лечение',
  observation: 'Наблюдение', communication: 'Общение',
  custom_and_law: 'Обычай и право'
});

export function projectPlayerSafeChecks(payload) {
  const projected = [];
  const seen = new Set();
  const actorLabel = cleanText(payload.player_profile?.identity?.name) ?? 'Вы';
  const actionFallback = cleanText(payload.last_turn?.raw_text)
    ?? 'Проверка действия';
  const add = (result, labels = {}, actionLabel = actionFallback) => {
    if (result == null || seen.has(result.check_id)) return;
    seen.add(result.check_id);
    projected.push(playerSafeCheck({
      result, ordinal: projected.length + 1, actorLabel, actionLabel, labels
    }));
  };

  const commit = payload.last_turn?.turn_step_commit;
  if (commit?.checks?.results?.length) {
    for (const result of commit.checks.results) {
      const trace = commit.loop_trace?.step_traces?.find((candidate) =>
        candidate?.applied === true
        && candidate.check_binding?.check_id === result.check_id);
      add(result, checkSourceLabels(trace?.approved_plan?.check),
        cleanText(trace?.approved_plan?.interpretation?.grounded_attempt)
          ?? actionFallback);
    }
  } else {
    add(payload.last_turn?.check_result);
  }
  add(payload.last_turn?.consequence?.conversation?.check_result);

  const combat = payload.last_turn?.consequence?.combat;
  for (const result of combat?.check_results ?? []) {
    const step = combat.exchange?.technical_steps?.find((candidate) =>
      result.check_id === `combat-check:${candidate.proposal_id}`);
    if (step?.actor_ref?.entity_kind !== 'player_character'
        || step.actor_ref.entity_id !== payload.actor_id) continue;
    add(result, {}, actionFallback);
  }
  return projected;
}

function playerSafeCheck({ result, ordinal, actorLabel, actionLabel, labels }) {
  const modifierKinds = Object.keys(CHECK_MODIFIER_LABELS);
  return {
    ordinal,
    actor_label: actorLabel,
    action_label: actionLabel,
    die: 'd20',
    formula: 'd20 + характеристика + навык + состояние + снаряжение + обстоятельства',
    roll: result.roll,
    difficulty: result.difficulty,
    modifiers: modifierKinds.map((kind) => ({
      kind,
      label: labels[kind] ?? CHECK_MODIFIER_LABELS[kind],
      value: result.modifiers[kind]
    })),
    total: result.total,
    outcome: {
      band: result.outcome.band,
      margin: result.outcome.margin,
      success: result.outcome.success,
      cost_required: result.outcome.cost_required,
      severe_failure: result.outcome.severe_failure,
      roll_note: result.outcome.roll_note
    },
    consequence_label: null
  };
}

function checkSourceLabels(check) {
  const attribute = ATTRIBUTE_LABELS[check?.attribute_ref];
  const skill = check?.skill_ref == null ? 'без подходящего навыка'
    : SKILL_LABELS[check.skill_ref];
  return {
    ...(attribute ? { attribute: `Характеристика: ${attribute}` } : {}),
    ...(skill ? { skill: `Навык: ${skill}` } : {})
  };
}

function cleanText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
