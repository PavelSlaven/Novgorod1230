# occupations_additions.csv

33 кандидатных занятия: 19 прежних локальных строк и 14 архивных владельцев.
Колонки pinned TSV присутствуют; исходные `occ_*` остаются отдельным
кандидатным пространством ID. Прежние локальные строки переносят общую
региональную основу роли, типа места и расписания из указанного
`runtime_basis_analog_ref`. Сезонные поля архивных владельцев содержат только
source patterns, относящиеся к конкретному занятию, и остаются кандидатным
контекстом; общие patterns заменены на `no_source` (включая PRO0209).
Дополнительные расписания `normal/market_day/church_day/crisis`, социальные
роли, места и runtime-поля без основания заполнены `no_source`. Значимые для
`compileApprovedNpcRuntimeBasis` поля заполнены из строк кандидатов.

14 архивных владельцев используют смысловые IDs из `semantic_ids`;
PRO0210 — отдельное `occ_household_stove_maker`, а не вариант каменщика.
43 активных варианта хранят provenance у candidate owner либо у существующего
NPC profile. 15 недоступных pinned-target mappings — отдельный typed backlog
`deferred_variants` с причиной `pinned_target_variant_unavailable`; они не
попадают в generated runtime-facing CSV. PRO0104 и PRO0071 привязаны к
`profile:m2c_npc_forest_worker_v1`.

Archive seasonal fields, `how_to_materialize_as_*` и `common_relationships`
содержат typed `no_source`, если источник описывает общий workflow, а не факт
конкретного занятия. `region_id=region_novgorod_land` берётся из archive scope.
Archetypes следуют reviewer mappings; музыкальные owners сохраняют
`no_source:occupation_archetype`. Context-only policy вариантов находится в
archive variant provenance token; owner policy не выводится из варианта.
`basis` сохраняет `sourced` только для PRO0448, PRO0107, PRO0109, PRO0111 и
PRO0119; A-confidence overrides заданы OA-6.
PRO0448, PRO0454 и PRO0455 ссылаются на `nov_role_skomorokh` как на отдельную
связанную роль — без слияния occupation IDs и role ID.

У семи строк без прямой ссылки на книгу или WK стоит
`no_source:direct_book_or_wk_occupation_attestation`; ссылка на master
остаётся кандидатной. `candidate` нельзя непосредственно передавать как
`approved` в runtime. Нужны отдельная проверка аналогий, утверждение и
контролируемый перенос ID в approved namespace.

Для известежога, иконописца, пивовара, мясника и рыночного хлебника
лесопромысловые, писцовые и домашне-служебные аналогии роли/места сняты.
Первая роль в `allowed_social_role_ids` — кандидатная базовая роль профиля;
прочие роли допустимы при отдельном обосновании статуса конкретного NPC.
Для известеобжигательной ямы нет точного семейства места (`no_source`),
расписание остаётся аналогией. Историческая confidence не выше B при книжном
свидетельстве уровня B; для верёвочника ссылка ¶1447 удалена (там иглы для
сетей). Летний распорядок — явно записанная летняя строка, а не правило
«normal = summer» для всех дней.
