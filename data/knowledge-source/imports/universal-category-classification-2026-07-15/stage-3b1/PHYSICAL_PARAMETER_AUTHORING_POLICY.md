# Stage 3B-1 — policy физических параметров

Статус: `draft_authoring_policy`; это проектный норматив, а не исторический источник.

## Граница доказательств

Историческое основание каталога подтверждает только широкий тип. `mass_grams`, `carry_form`, `external_hand_cost`, packing slots и вместимость контейнера в этом пакете — игровые инженерные оценки. Они не доказывают массу археологической находки, распространённость или социальную норму.

## Процедура

1. Каждая оценка имеет `derivation_kind = gameplay_estimate`, `source_id = src_project_stage_3b1_physical_parameter_policy`, `status = draft` и отдельную строку review table.
2. `carry_form` выбирается по габаритному классу: `compact` для мелкой принадлежности, `regular` для обычной вещи, `long` для длинной вещи, `bulky` для тяжёлой/объёмной вещи.
3. `external_hand_cost` описывает переноску, а не число рук при использовании; он не выводится runtime.
4. Capacity контейнера измеряется только в packing slots. Значение определяется его authoring-классом (specialized, personal, portable, stationary) и всегда требует review перед promotion.
5. Количество bulk goods не выводится из `mass_grams` template. Для воды, зерна, муки, крупы, соли, мёда, воска, свежей/сушёной рыбы и мяса сохраняется `BULK_GOOD_QUANTITY_UNIT_MODEL_REQUIRED`; promotion их profiles заблокирована.
6. Неточность или отсутствие основания фиксируется typed gap; запрещены скрытый fallback и выдача оценки за историческое измерение.

## Promotion gate

Ни одна строка с `gameplay_estimate` не может стать `approved`, пока редактор отдельно не проверит representative mass, контейнерную вместимость, quantity policy и профиль применения. Weight всегда означает нейтральный технический draft‑вес, а не historical commonness.
