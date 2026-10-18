# Нативный P3 preflight — 2026-10-19

Это ограниченный набор фактических файлов из `/home/slaven/cataclysm-recovery-evidence/p3-native-identity-fresh-20261019/`. JSON request/readback/observation и логи скопированы побайтно; `final-sha256.txt` — исходный манифест хешей. `evidence-sha256.txt` фиксирует содержимое опубликованного набора (кроме самого манифеста контрольных сумм).

Включены контрольные логи сборки и выборочных тестов: `build-final.log`, `build-focused-final.log`, `rle-final.log`, `pickup-final.log`, `p2-p4-final.log`, `p4-rng-final.log`. Итого: сборка успешна; RLE 3 assertions/1 case, pickup 35/5, P2/P4 577/8, RNG 10/1 — PASS.

Runtime файлы содержат выбранные реальные native запросы и ответы для создания/строгого чтения, pickup UID `3585155`, firestarter с наблюдаемой целью, flashlight без цели в чистом мире, NPC assignment/progress и interrupt после reload, а также речь ровно 3 секунды с фактическим набором слышавших listener IDs. NPC прерывание — именно `run4-npc-interrupt-player-block-*`; соседний `run4-npc-interrupt-correct-expected-*` описывает успешное движение и не является свидетельством прерывания.

Результаты ограничены native preflight. Они не подтверждают semantic/model acceptance, реальный разговор T11/T12, social conversation-owner запись или P3 acceptance. Модель не вызывалась. Просмотрены исходные JSON; credential-like значения не обнаружены. `userdir`, saves, бинарники и caches не публикуются.

Ранее неудачные попытки сохранены локально в исходном каталоге свидетельств и не удалены. Их причины перечислены в [отчёте о ходе P3](../../../../docs/implementation/cataclysm-p3-progress-2026-10-19.md): stale UID из-за повторно использованного мира; отсутствие цели у firestarter; flashlight при ещё активном `ACT_START_FIRE`; неверные actor/target ожидания у NPC. Исправления core ради этих случаев не понадобились; корректные запросы на свежих мирах прошли.
