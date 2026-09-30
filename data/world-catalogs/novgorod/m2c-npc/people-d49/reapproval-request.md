# people-d49 — запрос на переутверждение (D53, ferry-guard)

Статус: **на переутверждение независимым проходом Opus**. `approval.json`: `verdict`, `approved_by`, `approved_on`, `approved_commit` — подпись под **старым** candidate (`sha256 44651daa…`); для новых данных недействительна до переутверждения (метка `resign_required`). Автор правки не утверждает.

## Что изменилось (детерминированно)
Решение владельца D53: на `pf_ferry_landing` остаётся только перевозчик; группа `crossing_guard` снята из D-2 (game-base, пин 81d96576, волна перегенерирована — `m2c-npc-wave/v1/repin-review-request.md`).
- `candidate.json`: `not_created` `[ {crossing guard} ]` → `[]`. Больше ничего (профили, clothing, regional_context, successors, g4_overrides — байт в байт как были; проверить `git diff`).
- `approval.json`: убраны review_point «Crossing guard profile is not created…» и limit «The crossing guard stays a typed gap…» (сторожа в составе больше нет, не «типизированный пробел»); `exact_candidate.sha256` = `6d6e5c9ea3a876168600a47c1e9bd9c4889b6022b6e822435555f8bc488df83c`; добавлен `resign_required`. Остальные limits, включая «D-2 is not seasonal: the ferryman is at the landing in winter too», без изменений (проверено по коду: `wantPlacePeople` сезон не учитывает).
- Каскад промоушена (`scripts/promote-m2c-open-capacity-v2.mjs`, `--check` зелёный): `m2c-scene-movement-edges/open-capacity-v2-import/source_records.json` (только `candidate_sha256` в строке `m2c_people_d49_editorial_001`) → `m2c-open-capacity-v2-import-manifest.json` → пин `capacityManifestSha256` (`5ee70086…` → `1e7afc22…`) в `scripts/bootstrap-live-world-v17.mjs:49` и `test/integration/bootstrap-live-world-v17-postgres.test.js:140`. Строки профилей и G4 v2 не менялись.

## Что проверить
1. `sha256(candidate.json)` = `approval.exact_candidate.sha256`; `git diff` candidate — только `not_created`.
2. Все группы D-2 на местах среза резолвятся в материализуемый профиль: `test/spatial-v3/people-d49-slice-coverage.test.js` (исключение для сторожа удалено, `assert.ok(profile)` на каждом субъекте) и `route-people-postgres` (`landing_candidate`: gaps `[]`, один перевозчик).
3. Занятие `nov_occ_crossing_guard` остаётся в каталоге (D38, `usable_with_caution`), актёрский каталог не менялся; термин «сторож брода» помечен `not_attested` (game-base `occupation_term_status.csv`, LW-121).
Как переутвердить: заменить `approved_by`/`approved_on` (и при необходимости `approved_commit`), удалить `resign_required`.
