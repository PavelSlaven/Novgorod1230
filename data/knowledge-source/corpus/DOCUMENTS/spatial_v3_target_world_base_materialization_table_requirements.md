# Требования к таблицам materialization и spatial v3

**Статус:** target technical normative; активная физическая схема остаётся v2
до отдельного `versioned production activation cutover`; историческое P28
evidence не меняло loader или production composition.
**Назначение:** логический table-purpose contract для target v3; физические имена, типы и constraints определяются только будущими DDL и generated `SCHEMA_REFERENCE.md`.

Current Temporal amendment `temporal-world-v1.1` / `4.4.0-target.1` с
immutable baseline `temporal-world-v1` / `4.3.0-target.1` определяется active
target-нормативом `temporal_world_and_interruptible_activities.md`. Он расширяет
существующие owners/tables, а не создаёт параллельный temporal store.

## 1. Граница хранилищ

`world_base` является read-only canonical authoring store: world revision, G0–G5, directed world topology/routes, historical provenance, approved templates, expansion profiles/capacities, controlled vocabularies и readiness evidence. `party_runtime` — mutable party store: generated G5, G6/positions, scene/route plans and executions, dynamic entities, perception и append-only history.

Cross-database relation хранит exact versioned ref, revision and digest; bare ID не является достаточной ссылкой. V3 до cutover не становится production writer. V2/v3 rows могут сосуществовать только без dual write и mixed authoritative read.

## 2. Canonical world authoring

Логические группы таблиц должны нормализованно описывать:

- world revision, sources, provenance, approvals и dependency pins;
- canonical containment G0–G5 с unique class/parent compatibility;
- G4 directional exits, route topology, route segments/points, endpoint and physical-segment ownership;
- canonical G5 inventory, site connections и exact route bindings;
- G4 expansion profile, frontier, finite capacities, candidate/template slots и terminal resolution;
- scene templates, G6 slots, scene-position slots, directed scene edges, portal/state policies, visibility/acoustic relations;
- controlled versioned vocabularies; каждый `controlled_*` contract type имеет ровно один finite registry mapping.

Queryable plural relations (candidates, dependencies, route members, slots, exits, capacity rules) — отдельные rows, а не embedded JSON arrays. JSONB допустим лишь как validated versioned expression/snapshot без hidden IDs.

## 3. Party runtime authoring-derived state

`party_runtime` нормализованно хранит party/version pins, expansion
reservations and committed generated G5, scene baselines/G6/positions,
physical/perception overlays, carriers/attachments, plans, executions,
activities/participants/resources, exact rational `GameTimestamp`, boundary
candidates/results, domain/NPC/remote traces, factual visible packages, change
sets, idempotency records и append-only results/history.

Все потенциально неограниченные integral temporal components хранятся как
PostgreSQL `NUMERIC` с `scale=0`, не `BIGINT`, и проходят application-level
canonical decimal-string/GCD validation. Gameplay due times не используют
`TIMESTAMPTZ`; wall-clock timestamps остаются только technical metadata/leases.

Dynamic NPC, items, containers, ownership, access and blockers принадлежат party state и никогда не становятся authoring rows. Active uniqueness, lock order, idempotency and state-version constraints реализуются в physical DDL, а не только в application convention.

## 4. Import и readiness

Import order: revisions/provenance → controlled vocabularies → G0–G5 containment → topology/routes/exits → canonical G5 → templates/scenes → expansion profiles/capacities → normalized bindings → readiness evidence. Каждый import проходит manifest/digest/schema/cross-reference validation, FK-derived dry-run, explicit approval, transactional apply и readback audit.

Required candidate gap, unresolved ref, ambiguous active binding, invalid route endpoint, missing controlled vocabulary, absent terminal target или incomplete scene endpoint — hard block. Logical readiness не заменяется физическим DDL; физический DDL не заменяет semantic readiness.

## 5. Activation boundary

Этот норматив не разрешает применять v3 DDL или importer в production до
`versioned production activation cutover`. Его статус может стать active
только вместе с canonical architecture после совпадения DDL, generated
reference, schemas/DTO/validators, importer/readiness, persistence/save-load,
migration evidence и PASS независимого критика.

## 6. Migration history

V2 table-purpose использовал canonical G0–G4 и party G5. Он остаётся migration/rollback source до cutover, не target schema и не fallback для v3 request.
