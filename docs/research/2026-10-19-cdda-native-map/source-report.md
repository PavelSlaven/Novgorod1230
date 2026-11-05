# Отчёт: публикация карты родных механизмов CDDA

PR: https://github.com/PavelSlaven/Novgorod1230/pull/778 (открыт, не слит). Ветка `docs/cdda-native-map`, worktree `C:/Users/Slaven/wt-cdda-map`, база `origin/main` (25e705074). Head: 9a06f082c.

## Коммиты (4)
1. `docs(context): add CDDA native mechanisms map` — `docs/context/cdda-native-map/INDEX.md` + `areas/01..12-*.md` (LF).
2. `tools(docs): cdda-native-map table generator with test` — `tools/docs-tools/src/cdda-native-map-table.js`, `tools/docs-tools/test/cdda-native-map-table.test.js`, `package.json`, `generated/generated-manifest.json`.
3. `docs: link CDDA native mechanisms map from docs README` — `docs/README.md`.
4. `docs(changelog): CDDA native mechanisms map (#778)` — `CHANGELOG.md` (+1 строка, CRLF как у соседей; `git diff origin/main --stat -- CHANGELOG.md` = `1 insertion`).

`git diff origin/main --stat`: 19 files changed, 1997 insertions(+), 4 deletions(-).

## package.json
- `docs:check` += `&& node tools/docs-tools/src/cdda-native-map-table.js --check`
- `test:docs` += `tools/docs-tools/test/cdda-native-map-table.test.js`
- имена скриптов не менялись. `generated/generated-manifest.json`: изменился только `input_digest` (вывод `docs:generate`; вход включает `package.json`). Примечание: `generate --help` в CLI не показывает справку, а запускает генерацию; побочных изменений, кроме манифеста, не было.

## Проверки (в worktree, node_modules нет, зависимости не нужны)
- `npm run docs:check` — OK: "Documentation/generated data: OK (8 generated files)", граница активации: finding_count 0, "CDDA native map needs table: OK (236 rows {полное:119, частичное:104, нет:10, иное:3})". До `docs:generate` манифест был устаревшим из-за правки package.json — обновлён штатно.
- `npm run test:docs` — tests 17, pass 17, fail 0 (5 новых + 12 прежних).
- `npm run check:syntax` — 4 file(s), 0 failure(s).
- `npm run architecture:check` — Architecture boundaries: OK.
- `git diff --check` — чисто, кроме CR на добавленной строке CHANGELOG (то же окончание CRLF, что у соседних строк).
- 340 относительных ссылок в карте проверены скриптом (чтение): битых 0. `rg` по карте: VERDICT, абсолютных путей, `.claude`, `draft/`, `index_table.py` — нет.
- Node-генератор сверен с Python-оригиналом на копиях вне репо: вывод идентичен побайтно (236 строк).

## Замены в ссылках
- Планы Cataclysm и стратегия reuse — относительные ссылки на `docs/plans/Novgorod1230_Cataclysm_*_2026-10-1[89].md` (12 файлов существуют).
- Шапки областей: ссылка на индекс `../INDEX.md`; состояние на 2026-10-19; пин upstream `0d8843f1c500052c3e026e3da6f8edaf5e00b626`.
- D215/D216 определены один раз в INDEX §1 п.1; «разбор сохранения» вместо внутреннего VERDICT (вне репо).
- Команда пересборки таблицы — `node tools/docs-tools/src/cdda-native-map-table.js`; таблица §6 перегенерирована, изменилась ровно одна строка (D216, `08-save-state:25`).
- `draft/` и Python-скрипт в репозиторий не переносились.

## Не сделано / открыто
- `tools/docs-tools/MODULE.md` не менял (его правка — триггер Contract Auditor; список «Владеет» не упоминает новый скрипт). Решает владелец модуля.
- Игру не запускали; ~1500 ссылок проверены проверяющими областей, 15 — Opus по снимку; машинной сверки с upstream в CI нет.
- Основной checkout `C:/Users/Slaven/Documents/Novgorod` не тронут (только прежний untracked `.claude/settings.local.json.bak-20261014-tools`).
- PR не слит. Локальные ошибки `git: failed to delete .git/worktrees/...: Permission denied` — старые чужие worktree, безвредны.

Расход: порядка 350-450K токенов на сессию (включая сверку и резюме).
