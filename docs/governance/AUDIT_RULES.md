# Субагенты и Contract Auditor

> Часть governing-корпуса `AGENTS.md` (см. [AGENTS.md](../../AGENTS.md) §1.3). Защита — AGENTS.md §1.1: менять только по прямому явному запросу администратора. Слова «этот файл», «здесь» и «раздел N» внутри перенесённого текста означают весь governing-корпус. Текст перенесён из `AGENTS.md` без изменений, кроме относительных ссылок; нумерация разделов сохранена.

## 25. Субагенты и независимый аудит

Используй субагентов только для самостоятельных частей задачи, когда разделение действительно ускоряет работу или даёт полезную независимую проверку.

Главный агент остаётся ответственным за:

- исходную цель;
- scope;
- integration;
- критерии готовности;
- итоговый результат.

Передавай субагенту короткое самостоятельное описание текущего шага, а не весь диалог.

При поддержке параметра используй:

```text
fork_turns: "none"
```

Не создавай субагента для каждого мелкого последовательного действия.

Независимый read-only audit обязателен для изменений повышенного риска:

- public contracts нескольких подсистем;
- DDL/migrations/persistence;
- code/LLM boundary;
- возможность повреждения или потери данных;
- critical orchestration;
- сложная логика, для которой профильных тестов недостаточно.

Для обычного локального исправления отдельный critic не нужен.

### 25.1. Contract Auditor

`CONTRACT AUDITOR` — read-only specialist, который устанавливает applicable source set, статусы документов, precedence и соответствие между governing/active contracts, bindings, schemas, implementation и tests. Он не изменяет production code, не создаёт нового owner и не меняет контракт только для того, чтобы узаконить implementation bug.

Contract Auditor проводится на границе логического изменения: по завершении этапа или самостоятельной части работы, при изменении нормы, контракта, schema, persistence или LLM boundary и перед merge. Он не повторяется после каждой отдельной правки внутри уже начатого логического изменения.

Contract Auditor обязателен, если:

- создаётся, изменяется, перемещается, переименовывается, удаляется или повышается в статусе governing/normative документ, этот индекс, `AGENTS.md`, nested `AGENTS.md` или `MODULE.md`;
- меняется active release, profile, manifest, binding или document status;
- меняется public schema, operation, API, package export, DDL, persistence, transaction, idempotency или replay boundary;
- меняется domain owner либо handoff между owners;
- меняется LLM authority, prompt, request/plan contract, model-call topology или repair policy;
- меняются free actions, ordinary materialization, items/property, Spatial G0–G6, NPC decisions/conversation/combat, time/processes, visibility/knowledge/perception, direct speech или narration boundary;
- implementation plan ссылается на proposed, target, migration или historical документ;
- `AGENTS.md`, contract index, профильный контракт, `MODULE.md`, schema, code или tests расходятся в описании current behavior;
- проводится final acceptance cross-module либо иного изменения повышенного риска.

Для обычного локального fix отдельный Contract Auditor не обязателен только если главный агент доказал, что не меняются public behavior, contracts, owner boundary, persistence/schema, LLM authority и active profile status.

Contract Auditor всегда читает:

1. root `AGENTS.md`;
2. [Канонический индекс контрактов](../../data/knowledge-source/corpus/DOCUMENTS/CONTRACT_INDEX.md);
3. applicable nested `AGENTS.md`;
4. `MODULE.md` владельцев, затронутых проверяемым diff;
5. active release/profile/manifest/bindings, которые затрагивает diff;
6. active contracts и schemas, применимые к затронутым владельцам и границам;
7. production code, callers и tests затронутой области;
8. proposed/target/migration документы только когда текущая задача явно реализует или аудирует соответствующий target.

Весь корпус нормативных документов не перечитывается для каждого аудита. Scope аудита определяется затронутыми owners и границами diff и указывается в поле `scope` результата.

Точный contract set по player semantic action, materialization, ordinary items/resources/containers, Spatial, NPC, conversation, combat, time/processes, persistence, historical grounding и narration/UI определён в `CONTRACT_INDEX.md`, раздел 8. Proposed, migration, historical и reference документы не становятся production contract без explicit versioned cutover и active binding.

Формат результата:

```text
CONTRACT AUDIT FINDING

scope:
source_set:
source_statuses:
observed_implementation:
required_by_active_contract:
target_if_any:
conflict:
precedence_resolution:
first_bad_boundary:
correct_owner:
required_code_delta:
required_docs_delta:
required_tests:
severity: P0 | P1 | P2 | P3
verdict: PASS | PASS_WITH_NOTES | BLOCK
```

`BLOCK` обязателен, если diff нарушает governing/active contract, создаёт mixed semantics или duplicate ownership либо выдаёт proposed behavior за current production.

После замечаний повторяй audit только после содержательного изменения.

Не создавай evidence package для самого факта аудита, если это прямо не требуется.

Выбор модели и reasoning level определяется средой выполнения и не является политикой репозитория.

---

