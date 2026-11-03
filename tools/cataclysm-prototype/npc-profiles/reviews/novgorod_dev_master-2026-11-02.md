# Утверждение данных профиля novgorod_dev_master — 2026-11-02

- Профиль: `tools/cataclysm-prototype/npc-profiles/novgorod_dev_master.json`, одна запись `knowledge_snapshot.known_facts`: `novgorod-dev-master-habit-hewing`.
- Автор данных: Claude Sonnet 5.5 high, роль «14 Подключение данных», шаг 6 CR npc-talk. Запись заменила `novgorod-dev-master-work-now` («У двери бревно лежит — его и тешу.»), которая утверждением 2026-10-22 не покрывалась.
- Кто утвердил: Claude Opus 5.5, распорядитель — итоговое утверждение (решение владельца D383). Приёмку шага до этого провёл исполнитель npc-talk (Claude Sonnet 5.5): ПРИНЯТЬ.
- Когда (UTC): 2026-11-02T20:27:15Z.
- База проверки: `e878b86cc1e13cdf3ea77910c3346a62f8cff9e8`.
- Коммит утверждённых данных: a43537622.
- Вердикт: APPROVE. Любое изменение записи снимает утверждение.

## Запись

| `fact_ref.entity_id` | `summary` | Источник | `confidence` |
|---|---|---|---|
| `novgorod-dev-master-habit-hewing` | Брёвна на дворе обтёсываю — дело у меня привычное. | брёвна — данные двора `tools/cataclysm-prototype/dev-world/courtyard.json:67–70`; орудия обтёсывания — утверждённые 2026-10-22 записи `claim:population-woodwork-axe` и `claim:population-woodwork-adze`; привычность — авторский выбор в рамке занятия плотника | medium |

## Пределы

Запись — привычное занятие, а не текущее действие и не число брёвен: число брёвен на дворе меняется по ходу игры (Жирко их режет), поэтому в знание NPC оно не входит. Что Жирко делает сейчас, NPC берёт из кадра наблюдения, а не из профиля.
