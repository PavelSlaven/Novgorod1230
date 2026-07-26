import { serverError } from '../../errors.js';
import {
  resolveBoundaryApproachJourney,
  resolveBoundaryTraversal
} from './boundary-command.js';
import {
  resolveBoundaryResume
} from './boundary-paused-execution.js';
import {
  LOCAL_RISK_PROFILE, NPC_PROFILE_SET, choose, hash, resolveEquipmentProfile,
  resolveNpcProfile
} from './shared.js';

export function applyCommand(state, command, context) {
  const next = structuredClone(state);
  const verb = command.verb;
  let prose = 'Действие выполнено.';
  let mode = 'attention';
  let elapsed = 0;
  const summary = { outcome: verb };
  if (verb === 'look') {
    prose = next.location === 'high_platform'
      ? 'С площадки виден безопасный спуск к воде и посадочному месту.'
      : 'У воды стоит сезонный рыбацкий стан. Рыбак перебирает сеть; вода остаётся непроверенной.';
  } else if (verb === 'move') {
    const expectedDestination = next.location === 'high_platform'
      ? 'landing_edge'
      : 'high_platform';
    if (command.destination_ref?.entity_id !== expectedDestination) {
      throw serverError(
        'LOCAL_ROUTE_NOT_APPLICABLE',
        'The selected local route does not start at the current position.',
        { status: 409 }
      );
    }
    const traversal = resolveLocalTraversal(command, next);
    if (traversal.success) {
      next.location = expectedDestination;
    } else {
      elapsed = traversal.elapsed_minutes;
      next.player.energy = Math.max(
        0,
        next.player.energy + traversal.energy_delta
      );
      if (traversal.condition_candidate
          && !next.player.conditions.includes(
            traversal.condition_candidate
          )) {
        next.player.conditions.push(traversal.condition_candidate);
      }
    }
    if (next.location === 'landing_edge' && !next.landing_materialized) {
      next.landing_materialized = true;
      const npcId = `npc:${next.party_id}:fisher`;
      next.npc = {
        id: npcId,
        name: null,
        enriched: false,
        equipment_profile: resolveEquipmentProfile(
          choose(
            NPC_PROFILE_SET.equipment_profile_candidates,
            `${npcId}:npc:equipment`
          ),
          `${npcId}:npc:equipment`
        )
      };
    }
    prose = traversal.success
      ? (next.location === 'landing_edge'
          ? 'Ты спускаешься по проходу к посадочной кромке.'
          : 'Ты возвращаешься на защищённую высокую площадку.')
      : 'Нога соскальзывает у кромки. Ты остаёшься на площадке, тратишь пять минут и промокаешь, но можешь вернуться, подождать или повторить попытку.';
    mode = 'movement';
    summary.traversal = traversal;
  } else if (verb === 'talk') {
    elapsed = context.activityProfile.fixed_duration_minutes;
    if (!next.npc.enriched) {
      Object.assign(next.npc, resolveNpcProfile(next.npc.id), {
        enriched: true
      });
    }
    next.journal.push(`Разговор с рыбаком ${next.npc.name}: он работает здесь с сетью сезонно.`);
    prose = `${next.npc.name} отвечает на приветствие и объясняет, что вода у берега не проверена.`;
    mode = 'social';
  } else if (verb === 'collect_resource') {
    elapsed = context.activityProfile.fixed_duration_minutes;
    if (command.quantity.unit === 'millilitre') {
      next.water_ml += 1000;
      prose = 'Ты набираешь ровно 1000 мл поверхностной воды. Её качество остаётся непроверенным.';
    } else {
      prose = 'Ты собираешь одну связку сухого валежника.';
    }
    mode = 'resource';
  } else if (verb === 'give') {
    next.rope.holder = 'fisher';
    next.rope.controller = 'fisher';
    prose = 'Рыбак принимает верёвку во временное пользование; владельцем остаёшься ты.';
    mode = 'social';
  } else if (verb === 'perform_simple_work') {
    if (next.rope.owner !== 'player'
        || next.rope.holder !== 'fisher'
        || next.rope.controller !== 'fisher') {
      throw serverError(
        'RESOURCE_BINDING_RECHECK_FAILED',
        'Для помощи с сетью рыбак должен держать и контролировать верёвку.',
        { status: 409 }
      );
    }
    elapsed = context.activityProfile.fixed_duration_minutes;
    next.player.energy = Math.max(0, next.player.energy - 8);
    next.relation += 1;
    if (next.rope.holder === 'fisher') {
      next.rope.holder = 'player';
      next.rope.controller = 'player';
    }
    prose = 'Ты полчаса помогаешь с сетью. Рыбак благодарен; верёвка возвращена после проверки владения.';
    mode = 'work';
  } else if (verb === 'rest') {
    elapsed = command.duration_minutes;
    next.player.energy = Math.min(100, next.player.energy + Math.floor(elapsed / 10));
    prose = `Ты отдыхаешь ${elapsed} минут.`;
    mode = 'rest';
  } else if (verb === 'board') {
    next.boat.boarded = true;
    prose = 'Ты садишься в малую гребную лодку и принимаешь управление.';
    mode = 'movement';
  } else if (verb === 'alight') {
    next.boat.boarded = false;
    prose = 'Ты выходишь из лодки на проверенную посадочную кромку.';
    mode = 'movement';
  } else if (verb === 'journey_to_boundary') {
    const traversal = resolveBoundaryApproachJourney(next, command);
    elapsed = traversal.elapsed_minutes;
    next.location = traversal.destination;
    next.boat.location = traversal.destination;
    next.boundary_anchor_materialized ||= traversal.success;
    next.boundary_dispatch_direction = traversal.direction;
    next.boundary_paused_execution =
      traversal.paused_execution;
    next.boundary_traversals.push(structuredClone(traversal));
    applyBoundaryConsequence(next, traversal.consequence);
    prose = traversal.success
      ? 'Ты проходишь на лодке утверждённую цепочку внутренних речных маршрутов и останавливаешься у южного пограничного якоря.'
      : 'После уже пройденного участка проверка условий блокирует продолжение. Лодка остаётся в пути; пройденное время и расстояние сохранены.';
    mode = 'movement';
    summary.traversal = traversal;
  } else if (verb === 'cross_boundary') {
    const traversal = resolveBoundaryTraversal(next, command);
    elapsed = traversal.elapsed_minutes;
    next.location = traversal.destination;
    next.boat.location = traversal.destination;
    next.boundary_dispatch_direction = traversal.success
      ? null
      : traversal.direction;
    next.boundary_paused_execution =
      traversal.paused_execution;
    next.receiving_materialized ||=
      traversal.success && traversal.direction === 'forward';
    next.source_boundary_materialized ||=
      traversal.success && traversal.direction === 'reverse';
    next.boundary_traversals.push(structuredClone(traversal));
    applyBoundaryConsequence(next, traversal.consequence);
    prose = traversal.success
      ? (traversal.direction === 'forward'
          ? 'Ты проходишь на лодке два утверждённых речных сегмента и прибываешь в принимающий водный плёс соседней ячейки.'
          : 'Ты проходишь обратный направленный маршрут и возвращаешься к южному входу yp026.')
      : 'После переключения пограничного контекста ты проходишь часть сегмента, но повторная проверка блокирует продолжение. Лодка остаётся в пути; время и прогресс сохранены.';
    mode = 'movement';
    summary.traversal = traversal;
  } else if (verb === 'resume_boundary_traversal') {
    const traversal = resolveBoundaryResume(next, command);
    elapsed = traversal.elapsed_minutes;
    next.location = traversal.destination;
    next.boat.location = traversal.destination;
    next.boundary_dispatch_direction = null;
    next.boundary_paused_execution = null;
    next.receiving_materialized ||=
      traversal.direction === 'forward';
    next.source_boundary_materialized ||=
      traversal.direction === 'reverse'
      && traversal.destination === 'yp026_south_entry_reach';
    next.boundary_traversals.push(structuredClone(traversal));
    prose = traversal.direction === 'forward'
      ? 'Ты продолжаешь тот же переход, завершаешь оставшийся интервал и прибываешь в принимающий водный плёс.'
      : 'Ты продолжаешь тот же обратный переход и достигаешь его утверждённого endpoint.';
    mode = 'movement';
    summary.traversal = traversal;
  } else if (verb === 'save') {
    prose = 'Состояние партии сохранено.';
    mode = 'save';
  }
  next.clock_minutes += elapsed;
  return {
    state: next,
    prose,
    mode,
    elapsed,
    summary,
    activity_profile: context.activityProfile
  };
}

function applyBoundaryConsequence(state, consequence) {
  if (consequence == null) return;
  state.player.energy = Math.max(
    0,
    state.player.energy + consequence.energyDelta
  );
  if (consequence.conditionCandidate
      && !state.player.conditions.includes(
        consequence.conditionCandidate
      )) {
    state.player.conditions.push(consequence.conditionCandidate);
  }
}

function resolveLocalTraversal(command, state) {
  const riskProfile = command.risk_profile_ref == null
    ? null
    : LOCAL_RISK_PROFILE;
  if (command.risk_profile_ref
      && riskProfile?.risk_profile_id
        !== command.risk_profile_ref.entity_id) {
    throw serverError(
      'LOCAL_RISK_PROFILE_GAP',
      'The exact approved local risk profile is unavailable.',
      { status: 409 }
    );
  }
  if (riskProfile == null) {
    return {
      success: true,
      route_binding_ref: structuredClone(command.route_binding_ref),
      risk_profile_ref: null,
      elapsed_minutes: 0,
      energy_delta: 0,
      condition_candidate: null,
      roll: null
    };
  }
  const rollInputDigest = hash(
    `${command.canonical_digest}:local-traversal-d20`
  );
  const rollValue =
    (Number.parseInt(rollInputDigest.slice(0, 8), 16) % 20) + 1;
  const modifier = Number(
    state.player.skills[
      riskProfile.check_policy.modifier_skill_id
    ] ?? 0
  );
  const success =
    rollValue + modifier >= riskProfile.check_policy.target_value;
  const consequence = success
    ? {
        elapsed_minutes: 0,
        energy_delta: 0,
        condition_candidate: null
      }
    : riskProfile.failure_consequence;
  return {
    success,
    route_binding_ref: structuredClone(command.route_binding_ref),
    risk_profile_ref: structuredClone(command.risk_profile_ref),
    elapsed_minutes: consequence.elapsed_minutes,
    energy_delta: consequence.energy_delta,
    condition_candidate: consequence.condition_candidate,
    roll: {
      input_digest: rollInputDigest,
      value: rollValue,
      modifier_skill_id:
        riskProfile.check_policy.modifier_skill_id,
      modifier,
      target: riskProfile.check_policy.target_value,
      result_kind: success ? 'success' : 'failure'
    }
  };
}
