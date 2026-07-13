# Data policy

`data/` не является местом для generated output или промежуточных редакторских файлов.

- `seeds/APPROVED_SOURCES.json` — единственный registry разрешённых seed sources.
- `seeds/IMPORT_HISTORY.json` — история импорта approved sources.
- `LEGACY_RUNTIME_DATA.json` — manifest временно сохраняемых legacy runtime snapshots/caches.

Файлы `*.xlsx`, `*.xls`, `*.ods` и варианты имён `final`, `fixed`, `v2` запрещены внутри `data/seeds/`. Generated data хранится в `generated/`, временные результаты — в `artifacts/<date>/`.
