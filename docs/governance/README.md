# Governance: преамбула и карта разделов

> Часть governing-корпуса `AGENTS.md` (см. [AGENTS.md](../../AGENTS.md) §1.3). Защита — AGENTS.md §1.1: менять только по прямому явному запросу администратора. Слова «этот файл», «здесь» и «раздел N» внутри перенесённого текста означают весь governing-корпус. Текст перенесён из `AGENTS.md` без изменений, кроме относительных ссылок; нумерация разделов сохранена.

## Карта старых разделов AGENTS.md

Историческая ссылка «AGENTS.md §N» ведёт в файл из этой таблицы.

| Раздел | Файл |
|---|---|
| преамбула | этот файл |
| §1.1, §1.3 | [AGENTS.md](../../AGENTS.md) (роутер) |
| §1.2 | этот файл |
| 2. Источники истины и порядок инструкций | [WR — WORKFLOW_RULES.md](WORKFLOW_RULES.md) |
| 3. Назначение проекта | [PC — PRODUCT_CONSTITUTION.md](PRODUCT_CONSTITUTION.md) |
| 4. Главный принцип свободного действия | [PC — PRODUCT_CONSTITUTION.md](PRODUCT_CONSTITUTION.md) |
| 5. Не подгоняй игру под примеры и тесты | [PC — PRODUCT_CONSTITUTION.md](PRODUCT_CONSTITUTION.md) |
| 6. Роль LLM | [PC — PRODUCT_CONSTITUTION.md](PRODUCT_CONSTITUTION.md) |
| 7. Роль кода | [PC — PRODUCT_CONSTITUTION.md](PRODUCT_CONSTITUTION.md) |
| 8. Самостоятельный мир, NPC и время | [PC — PRODUCT_CONSTITUTION.md](PRODUCT_CONSTITUTION.md) |
| 9. Реализм и историческая рамка | [PC — PRODUCT_CONSTITUTION.md](PRODUCT_CONSTITUTION.md) |
| 9.1. Материализуемый мир (добавлен после переноса) | [PC — PRODUCT_CONSTITUTION.md](PRODUCT_CONSTITUTION.md) |
| 10. Материализация мира | [AI — ARCHITECTURE_INVARIANTS.md](ARCHITECTURE_INVARIANTS.md) |
| 11. Каноническая география и semantic freedom | [AI — ARCHITECTURE_INVARIANTS.md](ARCHITECTURE_INVARIANTS.md) |
| 12. Свободный крафт и физические результаты действий | [AI — ARCHITECTURE_INVARIANTS.md](ARCHITECTURE_INVARIANTS.md) |
| 13. Граница authoritative truth | [AI — ARCHITECTURE_INVARIANTS.md](ARCHITECTURE_INVARIANTS.md) |
| 14. Сохранение причинности | [AI — ARCHITECTURE_INVARIANTS.md](ARCHITECTURE_INVARIANTS.md) |
| 15. Архитектурные владельцы и разделение ответственности | [AI — ARCHITECTURE_INVARIANTS.md](ARCHITECTURE_INVARIANTS.md) |
| 16. Минимальность и YAGNI | [AI — ARCHITECTURE_INVARIANTS.md](ARCHITECTURE_INVARIANTS.md) |
| 17. Жёсткий запрет гипотетической integrity/security-инфраструктуры | [AI — ARCHITECTURE_INVARIANTS.md](ARCHITECTURE_INVARIANTS.md) |
| 18. Начало работы над задачей | [WR — WORKFLOW_RULES.md](WORKFLOW_RULES.md) |
| 18.1. Обязательные навыки `caveman` и `ponytail` (добавлен после переноса) | [WR — WORKFLOW_RULES.md](WORKFLOW_RULES.md) |
| 19. Изучение репозитория и инструменты | [WR — WORKFLOW_RULES.md](WORKFLOW_RULES.md) |
| 20. Документация и её владельцы | [WR — WORKFLOW_RULES.md](WORKFLOW_RULES.md) |
| 21. Реализация и изменение контрактов | [WR — WORKFLOW_RULES.md](WORKFLOW_RULES.md) |
| 21.1. Утверждение данных (добавлен после переноса) | [WR — WORKFLOW_RULES.md](WORKFLOW_RULES.md) |
| 22. Отладка | [WR — WORKFLOW_RULES.md](WORKFLOW_RULES.md) |
| 23. Persistence, concurrency и БД | [AI — ARCHITECTURE_INVARIANTS.md](ARCHITECTURE_INVARIANTS.md) |
| 24. Тестирование и проверки | [WR — WORKFLOW_RULES.md](WORKFLOW_RULES.md) |
| 24.1. Обязательный отчёт настоящего gameplay run (добавлен после переноса) | [WR — WORKFLOW_RULES.md](WORKFLOW_RULES.md) |
| 24.2. Проверки не подгоняются под реализацию (добавлен после переноса) | [WR — WORKFLOW_RULES.md](WORKFLOW_RULES.md) |
| 25. Субагенты и независимый аудит | [AR — AUDIT_RULES.md](AUDIT_RULES.md) |
| 26. Git, GitHub и stacked PR | [GS — GIT_SAFETY_RULES.md](GIT_SAFETY_RULES.md) |
| 27. Защита пользовательской работы и опасные действия | [GS — GIT_SAFETY_RULES.md](GIT_SAFETY_RULES.md) |
| 28. Критерии архитектурной ревизии | [AI — ARCHITECTURE_INVARIANTS.md](ARCHITECTURE_INVARIANTS.md) |
| 29. Завершение задачи | [WR — WORKFLOW_RULES.md](WORKFLOW_RULES.md) |
| 30. Краткая формула проекта | [PC — PRODUCT_CONSTITUTION.md](PRODUCT_CONSTITUTION.md) |

---

## Преамбула

Этот файл — каноническая и исчерпывающая инструкция по работе агентов разработки с репозиторием `PavelSlaven/Novgorod1230`, а также фиксация архиважных и устойчивых продуктовых и архитектурных инвариантов проекта.

`AGENTS.md` не является журналом изменений, release notes, implementation plan, PR checklist, рабочим блокнотом, evidence package или местом для временных ограничений конкретного сценария. Здесь находятся только правила, которые должны переживать отдельные релизы, сценарии и PR.

---

## 1. Статус и защита `AGENTS.md` (часть)

§1.1 и §1.3 — в [AGENTS.md](../../AGENTS.md).

### 1.2. Что разрешено хранить в `AGENTS.md`

Здесь уместны:

- стабильная продуктовая конституция;
- правила работы с репозиторием;
- критические архитектурные границы;
- правила разделения ответственности кода и LLM;
- правила persistence, причинности и сохранения;
- правила простоты и запрет гипотетического усложнения;
- правила тестирования, ревью, Git, БД и документации.

Здесь неуместны:

- номера текущих scenario revision и production release;
- история переходов между релизами;
- конкретные PR и их состояние;
- конкретные персонажи, предметы, контейнеры, источники, инструменты или locations сценария;
- временные profile limits и activation flags;
- точные capability конкретного текущего сценария;
- описание того, что «в этом PR включено, а в следующем выключено»;
- результаты текущего прогона тестов;
- временные TODO, review findings и audit notes;
- промежуточные implementation plans.

Точное текущее production-поведение определяется кодом, active bindings, versioned profiles, профильными нормативными контрактами и тестами, а не этим файлом.
