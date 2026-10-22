# Утверждение данных профиля novgorod_dev_master — 2026-10-22

- Профиль: `tools/cataclysm-prototype/npc-profiles/novgorod_dev_master.json`, раздел `knowledge_snapshot.known_facts`.
- Кто утвердил: Claude Opus 5.5 high, независимый проход. Автор данных — исполнитель Codex (шаг D1 плана FIX-04e, #820).
- Когда (UTC): 2026-10-22T08:52:56Z.
- База проверки: `3c01ea80990abbb67f3e003c79328fd53861ef2e`.
- Коммит утверждённых данных: 351b67c34f988d53c1fa9bb6c9731e762182e9c4.
- Вердикт: APPROVE_WITH_CHANGES; запись действительна для текстов ниже. Любое изменение этих записей снимает утверждение.

## Удалено

- `claim:ordinary-life-carpenter-works-wood-with-tools` (`confidence: medium`). Источник — `data/world-catalogs/novgorod/world-knowledge/production-v1/reconstructed-ordinary-lifeways-v1.json` (claim `supported_fact`, `directness: editorial`, `confidence: medium`, русский текст «Плотник может работать с древесиной топором, теслом, долотом и разметкой; остаются стружка и обрезки.»). Текст профиля добавлял пазы, гнёзда и порядок работ, которых в источнике нет.

## Утверждённые факты

| `fact_ref.entity_id` | `summary` | Источник | `confidence` профиль / claim |
|---|---|---|---|
| `claim:population-woodwork-axe` | Топор мне знаком: у нас им по дереву работают. | `data/world-catalogs/novgorod/world-knowledge/production-v1/woodwork-ceramics.json`, claim `attested_use` → `wk:craft_technology:woodworking`, Новгородская земля, 1000–1500, `direct`, `approved`; «Топоры входили в новгородский деревообрабатывающий инструментарий.»; верификация `data/world-catalogs/novgorod/world-knowledge/verification/verification-woodwork-ceramics.md` W01 `APPROVE_WITH_LIMITS`; evidence `evidence:museum-woodwork` (каталог Новгородского музея, коллекция X–XV вв.) | high / high |
| `claim:population-woodwork-adze` | Тесло мне знакомо: у нас им по дереву работают. | тот же файл, claim того же вида; «Тёсла засвидетельствованы среди новгородских деревообрабатывающих инструментов.»; верификация W02 `APPROVE_WITH_LIMITS`; тот же evidence | high / high |
| `claim:population-woodwork-chisel` | Долото я знаю: у нас оно идёт в работу по дереву. | тот же файл, claim того же вида; «Долота засвидетельствованы среди новгородских деревообрабатывающих инструментов.»; верификация W05 `APPROVE_WITH_LIMITS`; тот же evidence | high / high |

У всех трёх: `state: known`, `source_event_ref`, `resource_ref`, `process_ref` — `null`.

## Пределы

Факты — знание уровня населения о засвидетельствованных орудиях новгородской деревообработки X–XV веков. Они не утверждают наличие орудия во дворе или в сцене, владение, личный навык, конкретную операцию (пазы, гнёзда, сглаживание, козлы) или последовательность работ.
