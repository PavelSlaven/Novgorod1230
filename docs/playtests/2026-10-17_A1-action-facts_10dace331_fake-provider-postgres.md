# A1 action-production facts — deterministic integration capture

## Identity

- Date: 2026-10-17
- Issue: #748
- Production candidate: `2d6ffbf78e1a732f52f9d28e4c8f53b2c95a1443`
- Regression harness and changelog: `10dace331`
- Campaign: fresh `novgorod_vikhtuy_work_storage_v1` party, followed by LOOK and one A1 MAKE turn.
- Interface: production game runtime and isolated PostgreSQL, with a deterministic fake provider at the provider boundary. This is an integration capture, not a live model run or artistic acceptance.

## Preconditions

- P12 authoring-bundle validation passed in an independent no-hardlinks checkout at the production candidate commit.
- The one permitted after-run used `/srv/novgorod-work/fleet/bin/pg-slot` and `node --test --test-concurrency=1 test/integration/action-production-episode-facts-postgres.test.js`.
- No real model calls were made. The provider stub used the existing acceptance harness; endpoint and credentials are omitted.
- Sanitized full writer inputs (system, player-safe user, generation parameters) before and after are attached in [`writer-wire.json`](2026-10-17_A1-action-facts_10dace331_fake-provider-postgres-writer-wire.json). Auditor and repair raw traces remain outside the repository.

## Gameplay transcript

1. Fresh game opened and acknowledged; player looked around with `Осматриваюсь вокруг.` to establish the existing player-safe scene context.
2. Input: `Оторву полосу от подола рубахи.`
   Visible result: «Уже выполнено: Действие изменило исходную вещь. отрезанная полоса льняной ткани. отделена от подола. рубаха с укороченным подолом. подол укорочен.»
   Domain outcome: the scripted planner submitted one accepted A1 source-to-output operation; the runtime committed one output and the corresponding source change.

## Persistence/readback

- Isolated PostgreSQL readback: 8 items before MAKE, 9 after; exactly one A1 result item was added and the source item's state version advanced.
- The regression test also checked the committed visible-package readback and that the delivery contained non-empty prose.

## Findings

- Writer required facts include the performed transformation, output description and qualitative fact, and the source description and qualitative fact when the shirt is present in player-safe visible context.
- The first factual audit, one semantic repair, and final audit receive the same ordered atomic facts. The writer input contains neither raw player intent nor mechanics references or entity IDs; the test also checks that unrelated persisted hidden source facts do not enter writer evidence.
- Before evidence is the previously saved candidate-predecessor wire. It contains one actual Russian required fact (`отрезанная полоса льняной ткани.`). The first harness attempt was a **harness FAIL**, because its helper read obsolete `required_current_beat` instead of the actual Russian wire field. Offline parsing of that saved wire confirms the target source delta and performed relation were absent, but the malformed helper failure is not reported as a target RED run.
- A separate corrected-snapshot setup attempt stopped before the scenario because its first isolated copy lacked the Git ancestry required by P12 (`P12_V11_SUBJECT_COMMIT_NOT_REACHABLE`). It ran no target assertion and produced no wire. The final run used an independent candidate checkout; its P12 validation passed before PostgreSQL startup.
- No artistic or live-model quality judgment is made from the scripted prose.

## Result

**PASS** — the deterministic production-wire and commit/readback assertions passed (1 test, 0 failed; exit code 0). This records the regression gate only, not live D49 acceptance.

Artifact hashes: writer request attachment `5A7EC741391EE7F938166C760D9FC6AB016A7C7D5D2540D60B5983754D7E4B78`; before full wire `9B32E47448CA0191782E964EE71B57E06294955E1C85C582C985C21A851DD8BA`; after full wire `55E6C9A4A66166323C9E7FD36CDF5DBAF7729F6809ABAB220DC804D5D3F3E65E`; private auditor/repair request capture (Temp only) `65FD00B7A1B5F7FA4A24094E7870D6469845CB2CC09EB218BD02A6BBD9A32AC7`.
