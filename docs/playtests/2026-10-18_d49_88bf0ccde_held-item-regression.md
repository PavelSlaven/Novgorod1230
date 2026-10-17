# D49: held-item PostgreSQL regression after profile succession

## Identity

2026-10-18. Runtime HEAD `88bf0ccde6cb359a4afde5a1ea0cfac5d0493919`; fresh isolated PostgreSQL, scenario `novgorod_vikhtuy_work_storage_v1`, request `issue-566-fisher-seed-000007`. This is an automated production-composition regression with a deterministic fake provider, not a browser playtest or an assessment of generated literary prose. Real model calls: 0.

The remote test had temporary diagnostic reads and capture writes; it was not the clean committed test file. Instrumented test SHA-256: `95a2302a347656d0821e640f8a78bcfdad0382473afbec4cfef6f47711fc6539`. Runtime source was the exact HEAD above, and the original assertions were unchanged. Clean exact-HEAD execution remains a CI gate.

## Preconditions

The approved composition successor changes the deterministic NPC selection. The old request `000091` now creates zero NPCs: this was confirmed in the committed materialization trace, not inferred from an empty writer input. The importer changes candidate status to approved and recalculates its digest without losing payload fields. Its approved digest, rather than the raw candidate digest, must be used when calculating fixture preconditions.

Request `000005` selected Fisher with the net, but its approved starting weather reduced visibility. Its earlier regression run failed the unchanged `clear` assertion. Request `000007` was calculated offline through the actual owner importer and initial-environment builder to satisfy both preconditions: Fisher with the held net, and clear daylight/weather. No assertion, runtime rule, data weight or approved profile was weakened. Independent review of the first seed correction accepted the fixture rationale under WR §24.2; it did not claim PG or D49 acceptance.

One invocation ran `node --test --test-isolation=none --test-concurrency=1 --test-reporter=tap test/integration/held-item-visible-npc-production-postgres.test.js` through the isolated PG runner. Dependency install, source syntax and diff checks passed. The fake provider captured 14 requests.

## Gameplay transcript

The following text is the exact screen text captured from the fake provider. Its intentionally mechanical wording is not a literary-quality result.

Opening:

```text
Микула — лесной промысловик. Текущее место: На хозяйственном дворе. Пол героя: мужской. Ранений нет; сил достаточно для работы; сильного голода нет. Поверхность покрыта илистым и глинистым грунтом. Местность низкая и ровная. Виден речной проток. Видна кромка берега. Видны отдельные деревья. Виден нижний ярус растительности. Землю покрывают трава, осоки и кустарник. У воды видна растительность. На поверхности видны остатки трав и осок, обломки кустарниковых ветвей. У героя: нижняя рубаха. У героя: низкая кожаная обувь. У героя: штаны. Небо затянуто облаками.

Осадков нет. Видимость обычная. Ветер отсутствует или слабый. Лето. День. человек Осматривает рыболовную сеть. Видна молодая женщина. Телосложение: стройное. Кожа: коричневая. Черты лица: круглые. Глаза: тёмные. Волосы: короткие тёмно-каштановые прямые. В руках — рыболовная сеть. Нижняя одежда: длинная одежда, закрывающая ноги, тонкий лён, круглый вырез с разрезом, узкие рукава, цвета неокрашенного льна. Обувь: низкие кожаные башмаки, кожа, коричневого цвета.
```

After acknowledging the opening, input: `Осматриваюсь вокруг.`

```text
Обстановка внимательно изучена.

В поле зрения — человек: Осматривает рыболовную сеть..
```

After constructing a fresh production runtime over the same isolated databases, input: `Осматриваюсь вокруг.`

```text
Обстановка внимательно изучена.

В поле зрения — человек: Осматривает рыболовную сеть..
```

Both turns completed through production composition and showed the NPC. The writer retained the opening sensory facts as available support, without requiring the unchanged background to be repeated as new events. The observation outcome and visible NPC remained required in both turns.

## Persistence/readback

The committed materialization trace selected one Fisher @5. The fishing net remained in that NPC's hands. After reload, current time was local minute 482, daylight, approved weather `overcast_dry_calm`, normal visibility; the observer's visual capability was clear. The production visibility provider returned the holder as `clear`. Safe context contained the same held net identity, and writer input included `В руках — рыболовная сеть.` Both final checks were true.

A diagnostic screen probe before opening acknowledgment recorded `OPENING_ACK_REQUIRED`; the normal acknowledgment and test continued successfully. This diagnostic did not change gameplay state. The owned PG container was removed after the test; existing games and model services were untouched.

## Findings

- The two earlier red runs exposed missing fixture preconditions after approved profile succession, not evidence of a new visibility-owner defect.
- This run verifies NPC/held-item persistence, visibility, safe projection and writer input after runtime reload. It does not verify the browser save/load controls, a substantive conversation, taking/making an item or production-model prose.
- The broader architecture review is recorded separately in [the independent audit](../work/audits/d49-ci-recovery-cd7847c-full-architecture-audit.md). Literary preflight remains [FAIL](2026-10-18_d49_75eebb20_actual91-codex-preflight.md).

Private captures are not published. SHA-256: diagnostic trace `dd8af83469ac8e7a8be63d7616a68248c17969d91321df1e91e012ec5649dc7a`; TAP `481abc3d884339792a24890a2469e167891155f153b986c7475068a973d86492`; provider wire `39e703f0bc9edf9cff616fb97de15081215e53d9204d9dbac9e39eb7cbb698c6`.

## Result

**PASS for this instrumented PostgreSQL regression:** exit 0, 1 test passed, 0 failed, 0 skipped, 534602 ms. Full exact-HEAD CI and live D49 with accepted post-audit prose remain open.
