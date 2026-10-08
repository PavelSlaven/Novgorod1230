# M2c v17: real UI movement run 7708

**BLOCKED before generated G5.** The normal game-web UI, production HTTP
handler and real configured model ran against isolated PostgreSQL with test
approvals. The owner's production database was not used.

The forest start opened and acknowledged. The UI observation
`Осматриваюсь вокруг, оставаясь на месте.` committed one turn. An identical
HTTP retry returned the same result without another gameplay write. Reload
and Continue displayed the same screen. Its Path panel offered `Проход 1`
and `Продолжить путь — выход 2` as known routes.

Submitting each displayed label verbatim through the UI committed a turn but
returned `movement: null`; position and site counts remained unchanged. The
screen said the goal could not be reached. No generated G5 was created.
The turn response kept `action_panel.suggested_actions: []` while
`panels.route.data.movement.options` contained both labels. The browser smoke
fixture currently reads the former and failed its route assertion. This
fixture mismatch does not explain the movement failure.

Party `party:6d021735212850a7e34156c7`. Isolated report:
`%TEMP%/novgorod-target-http-smoke-7708.json`, SHA-256
`7b949c1ec4cd041039df3c7e28884d7742d415a912736afacc5784e0d19dc551`.
The isolated test ended **0/1 FAIL** at the route assertion. Q-051 requests
the authoritative movement-flow diagnosis; no production activation follows
from this run.
