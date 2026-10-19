# Нативные свидетельства P3 на чистом fixture — 2026-10-19

Ограниченный набор из `/home/slaven/cataclysm-recovery-evidence/p3-clean-fixture-20261019/`, скопированного после исправления fixture на `NPC_debug`/`spawn_npc`. Содержит выбранные исходные JSON request/readback, reload logs, native test logs и SHA-256 манифест. Сохраняет raw файлы побайтно. Не содержит userdir, saves, бинарника, caches или credentials. Старые наборы evidence и неудачные попытки не удалялись.

Свидетельства охватывают три подготовленных ground items, pickup, firestarter по наблюдаемой цели, NPC progress/interrupt и физическую речь с 3 секундами и фактическими heard IDs. В отдельном idle сценарии flashlight перешёл в `flashlight_on` с новым UID. Этот UID остаётся открытой находкой, не принятой ведущим; T07/identity acceptance не PASS.

Native сборка и сценарный preflight запускались до публикации. Публикационный запуск проверил манифест/файлы, но native повторно не запускался. Эти данные подтверждают только ограниченный native preflight; они не доказывают semantic/model acceptance, social conversation-owner commit/replay, P3/P4 acceptance или разрешение на P5/P6.

`evidence-sha256.txt` содержит SHA-256 файлов этого набора (сам манифест исключён). Хеши бинарника, native test source и core patch приведены в [отчёте](../../../../docs/implementation/cataclysm-p3-progress-2026-10-19.md).
