# Gameplay reports

Этот каталог — canonical owner санитизированных отчётов реальных gameplay runs
по правилу [`AGENTS.md` §24.1](../../AGENTS.md).

Имя: `YYYY-MM-DD_<stage-or-scope>_<short-head>_<run-id>.md`. Один файл — один
логический run/campaign. Обязательные разделы: Identity, Preconditions,
Gameplay transcript, Persistence/readback, Findings, Result.

Каждый ход содержит точный player input, существенный player-visible результат,
domain outcome и commit-state. Не публикуются secrets, private endpoints,
Authorization, hidden-state dumps или private provider traces. Failed evidence
не переписывается; новый run ссылается на старый как superseded.
