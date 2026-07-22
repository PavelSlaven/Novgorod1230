# P27 final critic report — release candidate `29e5e1d`

## Verdict

**PASS**

Дата аудита: 2026-07-22.

Аудит выполнен read-only по committed bytes. Dirty worktree и прежний
release-candidate `e4f8854…` не использовались как предмет проверки.

## Subject и scope

- Репозиторий: `PavelSlaven/Novgorod1230`
- Ветка: `codex/spatial-architecture-g0-g6-v4-2`
- Functional subject: `11c9f0c1de2d510c29be51546d16851f0d719f76`
- Docs/policy release-candidate: `29e5e1dbcf5e4b58d1c036308262f0e68bc562e4`
- Родитель release-candidate: `557172fc8af6d41912c615d077c3d9fe106513f5`

Сам `29e5e1d…` меняет только:

- `AGENTS.md`
- `.github/AGENTS.md`
- `README.md`
- `docs/migration/spatial-v3/p28-evidence-scope.v1.json`
- `generated/generated-manifest.json`

Полный delta `11c9f0c…29e5e1d` дополнительно содержит P28 evidence-документы
из промежуточного direct evidence child. Изменений runtime-кода, contracts,
DDL, importer, игровых данных или production composition нет.

`git diff --check` прошёл для release-candidate и полного рассматриваемого
delta.

## Нормативная база

Сверены committed-версии:

- `AGENTS.md`
- `.github/AGENTS.md`
- `data/knowledge-source/corpus/DOCUMENTS/code_critic_invocation_rule.txt`
- `data/knowledge-source/corpus/DOCUMENTS/spatial_architecture_standard_g0_g6.md`, включая activation boundary и Appendix D

Нормативный RAG и Graphify использовались как независимые навигационные
каналы. Нормативные выводы сделаны по committed-документам, а не по inferred
graph relations.

## Функциональная готовность

GitHub Actions run `29908936914` подтверждает exact functional subject:

- `headSha`: `11c9f0c1de2d510c29be51546d16851f0d719f76`
- workflow: `test`
- conclusion: `success`
- full test profile: выполнен успешно
- evidence-only profile: пропущен

Полный clean-clone CI включал PostgreSQL, проверку актуального DDL, generated
reproducibility, Repository Graph и полный набор тестов.

После `11c9f0c…` runtime/code/DDL/import/game-data не менялись, поэтому
повторный тяжёлый acceptance для документационного release-candidate
нормативно не требуется.

## Проверка исправлений прошлого аудита

### Repository Intelligence

Предыдущее замечание `REPOSITORY_GRAPH_STALE` устранено.

`repo-intel:status` на exact `29e5e1d…` возвращает:

- `ok: true`
- Repository Graph: `ready`
- Graphify: `ready`
- Graphify version: `0.9.17`
- `source_commit`: `29e5e1dbcf5e4b58d1c036308262f0e68bc562e4`
- `errors: []`

После commit также был выполнен `repo-intel:ensure`.

### Risk-based checks

Предыдущее расхождение README и фактической CI-модели устранено.

README теперь явно различает:

- локальные профильные проверки docs/policy/generated release-candidate;
- облегчённый GitHub CI только для следующего strict evidence child.

Таким образом, README больше не утверждает, что сам пятифайловый policy
release-candidate обязан классифицироваться как `evidence_only`.

Оба `AGENTS.md` согласованно закрепляют:

- профильные проверки по риску изменения;
- один полный clean-clone acceptance функционального кандидата;
- отсутствие повторного PostgreSQL/browser/full-suite цикла для неизменившихся code/data;
- отдельный strict evidence commit;
- обязательный `fork_turns: "none"` для каждого `spawn_agent`;
- один итоговый независимый critic вместо отдельных аудиторов для мелких служебных стадий.

## P12 и DDL

Подтверждённые ранее committed-факты не изменены:

- P12 manifest: `status: approved`
- datasets: 37
- все dataset SHA-256 совпадают
- `data_gaps: []`
- 195 canonical G5 records
- 358 physical source pairs
- 600 typed source edge mappings
- 17 scene families
- 195 profiles
- 195 candidates

По committed DDL:

- SQL parts: 17
- `world_base` tables: 186
- expanded DDL SHA-256: `fccc625773089749ca676831ee69f8b3656e914f5f0e53cbbfaff8773df905fe`

P12 остаётся approved authoring compilation и не активирует production v3.

## P28 boundary

`p28-evidence-scope.v1.json` в release-candidate разрешает следующему evidence
child только три evidence-документа:

- `docs/migration/spatial-v3/p27-candidate-evidence.md`
- `docs/migration/spatial-v3/p27-final-critic-report.md`
- `docs/migration/spatial-v3/p28-appendix-d-evidence-ledger.md`

Release manifest добавляется classifier/gate отдельно. Scope принадлежит
immutable candidate `29e5e1d…`; evidence child не может самостоятельно
расширить его.

P28 по-прежнему требует:

- required CI exact evidence HEAD;
- exact-head GitHub approval;
- merge completion либо trusted signed annotated tag.

Отдельного `p28_fresh_checkout` authority object и старых Ed25519 role
signatures нет. До полного live proof сохраняются:

- `production_v2`
- `production_writes: 0`
- `composition_changed: false`
- deferred v3 activation

## Generated metadata

`generated/generated-manifest.json` меняет только generator input digest:

`e92ee35d18076438764da24867ab9ddb7753a319d3123945f0f34aba65cf5442`

Содержательные generated outputs и их SHA-256 не изменены.

## Фактические проверки

Для functional subject:

- GitHub Actions `29908936914` — **PASS**, exact `11c9f0c…`, full profile.

Для release-candidate зафиксированы:

- `npm run docs:check` — **PASS**
- `npm run knowledge:check` — **PASS**
- P28 targeted tests — **7/7 PASS**
- `repo-intel:ensure` — completed
- `repo-intel:status` — **ready**, exact `29e5e1d…`
- Graphify `0.9.17`
- `git diff --check` — **PASS**

В этом повторном аудите тяжёлые тесты и PostgreSQL не запускались.

## Findings

Blocking, major или minor findings не обнаружены.

Оба замечания предыдущего `CHANGES REQUIRED` устранены без расширения
runtime/data scope.

## Notes

- Knowledge source сохраняет известный статус `degraded` из-за semantic coverage gaps, но blocker document IDs отсутствуют; Repository Graph полностью готов.
- `29e5e1d…` является release-candidate, а не evidence child. Следующий commit должен быть его строгим прямым потомком, содержать итоговый critic report и обновлённый hash-bound manifest/ledger, после чего пройти evidence-only CI и live GitHub approval/completion proof.
- PASS подтверждает готовность release-candidate к этому следующему evidence-шагу. Он не является разрешением production activation.

## Итог

Functional subject `11c9f0c…` подтверждён полным exact-subject CI.
Release-candidate `29e5e1d…` ограничен документацией, policy, immutable evidence
scope и generated metadata; Repository Graph актуален, policy согласована с
фактической CI-моделью, нормативные P12/DDL/P28 утверждения подтверждены.

**Final verdict: PASS.**
