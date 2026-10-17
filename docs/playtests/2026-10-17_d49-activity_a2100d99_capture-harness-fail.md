# D49 NPC activity: initial snapshot diagnostic

Result: **FAIL — capture harness**, before LOOK. This run does not qualify activity projection, reload, or literary quality.

## Identity and conditions

- Source: `a2100d99abafa944849d271f4d53591cec8d46fd`; tree `9627104ac59254114c629505abe6b681b2e81b92`.
- Temporary harness SHA-256: `718e1020e77e845ede5de70182452d05f747e12e06ae4a6b640b7df47d417558`.
- Node `v24.15.0`; own isolated PostgreSQL fixture; fake provider only, real model calls **0**.
- Scenario: `novgorod_vikhtuy_work_storage_v1`; start request: `issue-566-fisher-seed-000005`.
- One run, exit 1. Only the first of six planned fresh starts ran. Earlier no-match preflight was not counted as a passed test.

## Actual opening

`startNewGame` returned a first-game screen. Its `main_prose`, produced by the fake provider, was:

> Микула — лесной промысловик. Текущее место: На хозяйственном дворе. Пол героя: мужской. Ранений нет; сил достаточно для работы; сильного голода нет. Различима вода. Различима кромка берега. Различимы очертания деревьев. У героя: нижняя рубаха.
>
> У героя: штаны. У героя: низкая кожаная обувь. Состояние неба меняется. Осадков нет. Видимость обычная или сниженная. Сильный ветер. Лето. День.

No ACK, LOOK, turn writer, or reload was reached. Two actual fake-provider requests were captured: opening writer and opening audit. This verbatim fixture output is delivery evidence, not a model-quality result.

## Failure and readback

The harness incorrectly required `party_state.scenario_id` immediately after opening. The initial materialization snapshot stores it in `request_identity.scenario_id`; the post-turn snapshot has a different shape. The assertion failed before gameplay.

The saved initial snapshot and SQL readback contained zero NPCs and zero fishing nets. Visibility observations were not obtained: the harness also looked for post-turn actor/position fields in the initial snapshot. The selected runtime did contain the approved activity observation record.

The materialization trace establishes the effective composition as canonical Vikhtuy composition **@2**, digest `67ebf28a3c7877cca80782f8e35243ace35ba3a2e2e4d59947ad10e8d30aa00f`. Its actual RNG selected `npc_count = 0` (draw `3922159146`, seed digest `b75f1d4695d27fdc2fa92602c43a80b0aaa569637e89033fc9ae472ec911c74e`). No NPC was missing from the writer's input in this party.

The earlier seed prediction used the pending candidate dataset digest, `ef26a77f4d30996ce45da2ea2221d9f1c4f0428db51e6e03cd948ab06f5025da`. The production importer promotes approved data and recomputes its digest; that digest participates in RNG. Therefore the six predicted Fisher seeds were not validated production initial conditions. Future derivation must use the importer output and first reproduce this captured draw.

## Evidence and limits

Private opening responses, materialization/readback snapshots, full requests, metadata, log and exit code are retained in the task's OS Temp evidence directory. Wire SHA-256: `1fde898900f452681e5611624247ff4b3888b55f4b86cbb82df0c2c952ad4e66`. Private traces are not published here. The run's two PostgreSQL containers were removed; unrelated resources were preserved. No retry was performed as part of this run.

Fisher @4 materialization, clear perception, activity in writer input, and persistence/reload remain unverified by this run.
