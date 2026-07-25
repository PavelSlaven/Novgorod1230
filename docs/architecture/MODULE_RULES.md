# Правила модулей

1. `apps` только собирают приложение и подключают публичные API пакетов.
2. `packages` не импортируют `apps`.
3. Прямой импорт `legacy` разрешён только именованным compatibility adapters.
4. Модуль владеет своими контрактами, но межмодульные нейтральные контракты размещаются в `@rus/contracts`.
5. `world-base` предоставляет только чтение. Запись состояния партии выполняется только через `party-store`.
6. Код не придумывает категории, исторические факты и отсутствующие варианты, но детерминированно материализует конкретные instances из approved categories/templates/profiles/rules. LLM получает только формально ограниченные решения, аудит и прозу и не пишет runtime-state напрямую.
7. Целевой файл — 100–300 строк; жёсткий предел нового исходника — 25 КБ.
8. Публичный API пакета — не более 15 экспортов.
9. Соседние стадии не импортируют реализации друг друга. Передача выполняется через артефакты и контракты.
10. `legacy` является временной карантинной зоной: новые функции в нём не создаются.
11. Temporal World v4 до отдельного versioned production activation cutover — target-only: new pure owners receive frozen,
   pinned inputs and emit proposals or typed gaps; they do not read DB/network/
   LLM/global state, mutate input, persist facts or invoke peer owners.
12. Exact time, boundary ordering and same-time cascade belong only to
   `@rus/time-events-history`; `@rus/turn` owns orchestration and deterministic
   merge, not temporal arithmetic. A separate place/access package is forbidden
   by ADR-004.
