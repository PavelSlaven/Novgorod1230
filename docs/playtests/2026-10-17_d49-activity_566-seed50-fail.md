# Issue #566: неудачный production fake capture для seed 000050

Дата: 2026-10-17. Source checkout: Linux clone `/srv/novgorod-work/tmp/d49-566-activity-capture-d4f3948-20261017/clone`, HEAD `a2100d99abafa944849d271f4d53591cec8d46fd`. Harness на момент запуска имел SHA-256 `9a0c873efe2e4a1b8737ffb67fe5e730460b3bd9d9a4b7d60a9a3d401fdebc89`. Run directory: `/srv/novgorod-work/tmp/d49-566-activity-capture-d4f3948-20261017/pg-run-a2100d99-final-20261017`; копия в Windows Temp: `C:\Users\Slaven\AppData\Local\Temp\d49-activity-capture-a2100d99-final-20261017`. Команда: `/srv/novgorod-work/fleet/bin/pg-slot node --test --test-isolation=none --test-reporter=tap test/integration/held-item-visible-npc-production-capture-a2100d99-corrected.test.js`; Node `v24.15.0`; exit `1`; длительность теста `496720 ms`; model calls `0`.

Первый запуск seed `issue-566-fisher-seed-000050` создал party `party:845d022426fab88c877051a9` и получил два ответа через fake provider. Сохранённый `first_game_screen.main_prose` дословно:

> Микула — лесной промысловик. Текущее место: На хозяйственном дворе. Пол героя: мужской. Ранений нет; сил достаточно для работы; сильного голода нет. У героя: нижняя рубаха. У героя: штаны. У героя: низкая кожаная обувь.
>
> Небо не видно. Осадков нет. Видимость плохая. Ветер отсутствует или слабый. Лето. День.

Это зафиксированный fake-provider ответ, а не оценка художественности. В partial snapshot подтверждены выбранный сценарий `novgorod_vikhtuy_work_storage_v1` и присутствие целевой записи в approved activity records. Полный SQL/Phase1A/visibility readback не был сохранён: visibility probe завершился исключением до соответствующей записи. Первый failure был `OPENING_ACK_REQUIRED` в `visibilityProvider.readEntityObservations()` при текущем чтении natural-perception. LOOK, writer assertions, reload и проверка visible status не выполнялись. Этот прогон не подтверждает или опровергает качество opening prose.

Артефакты: `run.log`, `run.exit`, `metadata.json`, `argv.txt`, `production-wire.ndjson` и `issue-566-fisher-seed-000050.opening-partial-private.json` в указанном run directory. SHA-256: run log `629a63b258dba564627895b7957480564bb498a7e8ce7b8fc4f1b4a56fd47681`; wire `9c40284681d0e4f0fab3b12948d2f082fc9950245b566200888933c342c3b118`; partial snapshot `ba00a04e8531e10f8ef69150d31674b5f5625c5d0d05844622b1a97e31ad843e`. После выхода `pg-slot` контейнеров `novgorod-test-pg` не осталось.
