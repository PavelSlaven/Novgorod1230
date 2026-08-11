import { deepFreeze } from '@rus/kernel';

export function combatBodyThresholdSignalProfile() {
  return deepFreeze({
    profile_id: 'combat_body_threshold_signals_v1',
    status: 'approved',
    thresholds: [
      threshold(75, 'material',
        'Полученная рана заметно ограничивает дальнейшие действия.'),
      threshold(50, 'material',
        'Состояние участника существенно ухудшилось.'),
      threshold(25, 'critical',
        'Тяжёлая рана резко ограничивает способность продолжать бой.'),
      threshold(0, 'critical',
        'Участник больше не способен продолжать сопротивление.')
    ]
  });
}

function threshold(value, significance, summary) {
  return { threshold_id: `health-${value}`, metric: 'health',
    direction: 'decrease', value, decision_signal: {
      category: 'self', significance, perception_required: false,
      perceived_change_summary: summary
    } };
}
