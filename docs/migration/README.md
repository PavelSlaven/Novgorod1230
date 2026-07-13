# Документы миграции

Канонические пути определены в `CANONICAL_PATHS.json`.

- `plans/` — утверждённые планы фаз;
- `reports/` — отчёты, parity и release evidence;
- `contracts/` — карты межмодульных контрактов;
- `parity/` — stage parity reports;
- `finalization/` — manual delete checklist и operator review;
- `SOURCE_PROVENANCE.md` — происхождение исходного кода, корпуса и архивов.

Фаза `0.23.0` переносит нормативный corpus из legacy, создаёт `@rus/knowledge-source` и закрепляет graph/RAG как generated representations. Unique-file review находится в `reports/LEGACY_DOCUMENTS_UNIQUE_FILE_REVIEW.md`.

Наличие завершённой автоматической фазы не является разрешением удалить legacy.
