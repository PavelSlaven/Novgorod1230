export function reviewedNarration(segments, coverage = {}) {
  return {
    reviewed_segments: segments.map(({ segment_id }) => segment_id),
    source_reviews: Object.entries(coverage).map(([ref, segment_choices]) => ({ ref, segment_choices })),
    unsupported: [], literary_failures: [], evidence: ['Grounded current beat.']
  };
}


export function compatNarrationWire(wire) {
  const lines = wire['Обязательные положения текущего эпизода'] ?? [];
  const sources = lines.map((text, index) => {
    const match = /^(visible_change|uncertainty)_([0-9]+): (.*)$/u.exec(text);
    return { ref: match ? `${match[1]}_${match[2]}` : `visible_change_${index + 1}`,
      text: match ? match[3] : text };
  });
  const support = wire['Переданные сведения об обстановке'] ?? {};
  const old = {
    required_current_beat: {
      changes: sources.filter(({ ref }) => ref.startsWith('visible_change_')),
      uncertainties: sources.filter(({ ref }) => ref.startsWith('uncertainty_'))
    },
    optional_support: {
      ...(support['Место'] == null ? {} : { visible_scene: support['Место'] }),
      sensory_details: support['Ощущения'] ?? [],
      known_context: support['Известное герою'] ?? [],
      visible_npc: support['Люди'] ?? [],
      visible_objects: support['Предметы и ориентиры'] ?? []
    },
    segments: wire['Отрывки прозы'] ?? wire['Отрывки исходной прозы'] ?? [],
    output: wire['Проверяемая проза'] == null ? undefined
      : { prose: wire['Проверяемая проза'] },
    concerns: (wire['Замечания'] ?? []).map((reason) => ({ reason })),
    action_intent_context: wire['Контекст намерения для проверки'] == null
      ? undefined : { attempt: { text: wire['Контекст намерения для проверки'] } },
    confirmed_outcome: wire['Подтверждённый исход']
  };
  for (const [key, value] of Object.entries(old)) {
    Object.defineProperty(wire, key, { value, configurable: true });
  }
  return wire;
}
