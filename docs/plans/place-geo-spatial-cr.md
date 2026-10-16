## Цель

Попросить Spatial owner решить, как согласовать геометрию и черновую калибровку авторских маршрутов `gn_nov_g1_xp017_yp026`. Наблюдения ниже не утверждают значения и не разрешают импорт или активацию.

## Тип задачи

spatial

## Уровень качества и допустимый долг

Рабочий CR до изменения норм, данных и кода; расхождения остаются до решения owner. Новый долг не предлагается.

## Владельцы и MODULE.md

Spatial owner следует назначить domain owner авторских G0–G5 данных и минут. `@rus/world-catalog-workflow` ([MODULE.md](../../tools/world-catalog-workflow/MODULE.md)) — возможный редакторский инструмент, сам по себе не owner данных; `@rus/movement-routes` ([MODULE.md](../../packages/movement-routes/MODULE.md)) владеет исполнением маршрутов и времени, не авторской топологией.

## Context pack

AGENTS.md «spatial»; CONTRACT_INDEX §8.1; active Spatial standard §0.9/§4.7.2/§11.1, четыре Spatial v3 specializations, manifest/bindings; [G0–G5 workflow](../../data/knowledge-source/corpus/DOCUMENTS/spatial_v3_target_map_g0_g4_workflow.txt); `world-catalog-workflow`/`movement-routes` MODULEs; `docs/domain/OWNERSHIP_MAP.md`; approval attestation.

Attestation одобряет геометрию/топологию с ограничениями; минуты — draft, `import_authorized`/`activation_authorized: false`. `owner_findings.line_names` закрыты продолжением 2026-09-30. Производный отчёт пересобран с текущими одобренными именами: изменились только 24 поля `lines[].line_name`. Пересборка не обновляет аттестацию и не утверждает минуты, импорт или активацию; решение о фиксации нового отчёта остаётся Spatial owner/reviewer.

## Не трогать

Active-нормы, словари, bindings, кандидаты, `world_base`, импорт, activation и runtime. Минуты не считать действующими и не просить их импортировать/активировать до решения Spatial owner и требуемых утверждений.

## Критерии готовности

- Spatial owner отвечает, кто владеет авторскими картографическими данными и кто принимает решение по калибровке минут.
- Для каждого расхождения owner выбирает: уточнить геометрию/топологию, пересмотреть draft-минуты или принять с обоснованием; CR не предрешает выбор.
- Изменение нормы, contract, каталога или профиля получает отдельный scope и review/approval до исполнения.
- unseen-equivalent: такое же существенное расхождение на другой линии выявляется и передаётся owner на решение без нового enum или allowlist.

`owner_findings.spatial` (attestation, не игровые значения): `cross_g4_10` 16,8 км по болоту, 741/90 мин; `_11` ~15 км, 302/120; `_09` shore-transfer 15 мин против обхода 4,1 км/108 мин (водный переход ~0,5 км — вариант); `_14` 15 против 121 мин/4,6 км. Водные базы 60 против 142–344 (`cross_g4_04/05/07/12/21`); локальные: `flooded_interior_basin_3/5/cycle`, `forest_stream_route_cross/cycle`, `wet_conifer_tract_1/cycle`, `vikhtuy_resource_edge_1/cycle` — 6–8 против 29–48 мин. Обратные случаи `zaostrovye_archaeological_area_1/cycle`, `vikhtuy_local_area_1`: 60–75 против 10–17; `central_current_split_1/cycle`: 5/7 против 10–22. Решить направление течения у `isc` и трактовку тупикового `chb` (~500 м шириной).

## Стенд

Не нужен: CR не меняет поведение нейросети, промпт, модель или игровые данные.

## Проверки

`npm run test:docs`; `npm run docs:check`; `git diff --check`.

## Contract Auditor

Нет: CR не меняет behavior, contract, owner boundary, persistence или active profile. Реализацию проверить по AGENTS.md §25.1; изменение нормы/status требует аудита.

## Техдолг

LW-097 учитывать: v17 расходится с active spatial norm; частичная активация запрещена. Новых LW нет.
