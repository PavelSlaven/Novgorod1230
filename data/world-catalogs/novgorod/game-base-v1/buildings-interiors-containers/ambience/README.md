# ambience — людской слой места для рассказчика (candidate)

Домен: `settlement_ambience_texts`. Аналог природных текстов `natural_presentation_texts` для людского слоя G4.

## Файлы и счёт

| Файл | Строк | Что |
|---|---|---|
| `settlement_ambience_texts.csv` | 168 | тексты: семейство места × слой × сезон (× часть суток), канал, ясный и частичный текст, громкость, `requires_presence_ref` |
| `presence_tokens.csv` | 9 | токены наличия (`presence:people`, `presence:livestock`, `presence:dog`, `presence:poultry`, `presence:boats`, `presence:fishing_activity`, `presence:woodcutting`, `presence:market_day`, `presence:famine_1230`) |
| `g4_human_layer_binding.csv` | 7 | 7 G4 стартовой территории с людским семейством → pf (Вихтуй: местность, промысловый край, речной подход; укрытая терраса-высадка; Заостровье: центр, высадка, погребальная зона) |

Семейства: peasant_homestead 28, village_lane 16, ferry_landing 16, churchyard 16, town_street 16, market_square 16, riverbank 12, river_wharf 12, forest_edge 12, fishing_camp 12, town_courtyard 12. Слои: traces 36, work_sounds 32, smells 32, voices 32, smoke 16, animals 16, bells 4. Уверенность: B 32, C 136.

## Правила

- Текст показывается только если наличие уже установлено (D3): `requires_presence_ref` — это `bt_*` (любой из списка) или токен `presence:*`; нет звука кузницы без кузницы, нет голоса торга без торгового дня.
- Сезоны: `winter | spring_rasputitsa | summer | autumn` (календарь time-events-history).
- `partial_text` — для частичного восприятия (даль, туман, ночь, стена).
- Тексты авторские (C), основания — claims WK о дыме, сырости, следах, работе на берегу, предметы matcult, nov1230db. B — где текст пересказывает прямой источник: жальники (ref:pravenc_zhalnik), мостовые (nov1230db B026), голод 1230–1231 (НПЛ через nov1230db S01).
- Голодные тексты (`presence:famine_1230`) включаются только фазой голода (осень 1230 – 1231).

## Приёмка (validate.py)

- у каждого из 7 G4 с людским семейством есть тексты по 4 сезонам и ≥3 слоям (через pf привязки);
- каждый `requires_presence_ref` разрешается в bt или объявленный токен;
- denylist анахронизмов по текстам.

## Известные пробелы

- Привязка G4 → pf авторская (C) по `source_place_type` из pr98 m2c-natural; нужна сверка с доменом `place_binding`.
- Погребальная зона Заостровья описана как жальник (B для типа, C для конкретного памятника) — нужна сверка с археологическим паспортом.
- Колокол/било у сельской церкви — C: наличие колоколов в сельских храмах 1230 г. источниками группы не установлено; слой bells есть только у churchyard.
- Нет вариантов по части суток для большинства слоёв (day_part=any); ночных текстов мало.
- Носителя в v17 нет: нужен CR на людской слой профиля представления.
