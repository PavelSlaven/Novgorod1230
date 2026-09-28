# Закреплённые входные данные places-binding

`m2c-nature-coverage-entries.json` — копия списка типов из `codex/live-world-runtime@7cc0d341b9ac40ba30486f67a07f18ecf136e413`, `data/world-catalogs/novgorod/m2c-nature-coverage.json`, blob `c8968f65d7567d30b5073a991bbe3357eaf5249f`. В `entries` находятся ровно 128 региональных связей: 34 landscape, 24 water_body, 31 land_use, 39 place. Их масштаб G1–G3 — черновое региональное свидетельство, а `exact_m2c_g4` отмечает только прямо названные G4.

`start_only_water_entries` добавляет два отличных от регионального списка типа (`wb_estuary`, `wb_nearshore_sea`) по стартовым узлам M2c. Это явное расширение области входа, а не изменение исходного регионального снимка. Файл служит входом сборщика `scripts/build-region-type-pf-manifest.mjs`; второго слоя региональных решений здесь нет.
