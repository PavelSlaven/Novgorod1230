# D49: диагностическое сравнение reasoning для аудита речи NPC

**Результат: FAIL по полноте набора, production не меняется.** Low прошёл все критерии в 12/14 случаях; записанная базовая рука — в 9/14. Это аудит фактов речи NPC, не оценка художественности и не приёмка D49.

Дата: 2026-10-17. Исполнен один разрешённый прогон из 14 запросов на штатной Qwen 3.8 27B в TP2. Единственная разница запроса: вместо `enable_thinking=false` задан `reasoning_effort=low`; сообщения сохранены. Базовая рука взята из ранее записанного прогона; повторных базовых запросов не было. Настоящих запросов в этом прогоне — 14, retries — 0. Проверка схемы и host outcomes затем выполнена без модели на обеих руках. Судье переданы одинаковые входы и анонимизированные ответы; mapping раскрыт сборщику после оценки.

Сначала полнота наблюдаемого входа реального хода, затем единая свобода D158 и аудит, затем настройка модели. Новые параметры не активированы. Ниже сохранён отчёт сверки; исправления ошибок самого измерения явно отмечены, исходные результаты сохранены.
## Диагностический отчёт и сверка

## Provenance and scope

One approved TP2 run produced 14 candidate responses; no further model or bench calls were made in this collection/replay work. Provider worktree HEAD: a7e58d44f6e9131348f6d1fba583890cf12e63d8. The live candidate used for every mechanical replay was semantic source HEAD 982d20e603e2951e4d5218bbf6de8587d9613b06; validator SHA-256 FDC87F9E8BC25885937672F44B2DC7772CA8440643A94AB152AC3AFE1BF80ACC. All 14 exact captured request/plan message pairs matched on replay. Production was not activated or modified.

Full real episode input remains the priority. This isolated NPC bench compares grounding-auditor behavior on prepared NPC inputs; it does not demonstrate the complete Vikhtuy episode, conversation, item outcome, save, or reload.

## Mechanical replay of both anonymous arms

The 28 raw model JSON outputs were replayed through the candidate's actual auditFreshNpcSpeech with a fake role runner. No output was repaired. The blind mapping was used only after the independent judge returned its corrected assessment.

| Arm | Responses | Valid | Invalid | Host pass | Host unsupported | Typed failure | Messages matched |
|---|---:|---:|---:|---:|---:|---:|---:|
| recorded | 14 | 12 | 2 | 7 | 5 | 2 | 14 |
| candidate | 14 | 14 | 0 | 8 | 6 | 0 | 14 |

Invalid recorded responses: R-b7febd119e18 and R-8dfadd3f7282. Both produce TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID in the candidate module. R-8dfadd3f7282 lacks required concerns. R-b7febd119e18 has the expected top-level keys but fails the exact fragment validation; the independent judge identifies the fragment text typo «острогогом.» against «острогом.». Candidate outputs are accepted by the production schema and host logic 14/14. Actual host decisions are 8 pass and 6 unsupported.

## Independent blind judgment, mapped after completion

Corrected independent judgment agrees with mechanical validity for all 28 IDs and with all 26 non-failing host decisions. It records 26/28 structurally valid, 26/28 expected pass/reject decisions (the two recorded typed failures count as failures), 22/28 complete semantic diagnoses, 28/28 retention, and 21/28 passing all criteria.

| Arm | Schema valid | Decision correct | Semantic complete | Retention correct | All criteria | Mean score / 5 |
|---|---:|---:|---:|---:|---:|---:|
| recorded | 12/14 | 12/14 | 10/14 | 14/14 | 9/14 | 4.29 |
| candidate | 14/14 | 14/14 | 12/14 | 14/14 | 12/14 | 4.86 |

No schema or decision discrepancies remain between corrected judgment and production replay. The initial judgment files are preserved unchanged. Its initial discrepancy is documented in the corrected judgment and does not affect the assessment.

## Semantic findings retained as judged

The candidate arm more often completes the compound diagnosis, though it still mislabels absence of evidence as contradiction in some boat/bark cases. The independent judge also notes a missed “without a boat” clause in one net-work case. The candidate arm's decision, schema, and retention scores improved over the recorded arm; this remains a diagnostic comparison, not acceptance or proof of production prose quality.

## Artifacts

Server request directory: /srv/novgorod-work/fleet/tasks/codex-d49-conversation/out/bench-requests/npc-thinking-low-20261017/

- blind-mechanical-checks.json SHA-256 2f0a7b0f9e80a0f1eee980bdcab501698a8d76fca624cbf4f604630f8243bd80
- blind-judge-mapping.json SHA-256 2b56a7633588f00f21b480c33a3238c3333a9e549a706514c599490776a6a91a
- corrected judgment Markdown SHA-256 CBE09366C95532BC9D9C87A83DB2D030987DC2A2CFD21DA9A7A82EC90EE05FBA
- corrected judgment JSON SHA-256 B26EF2BF53AE488FD47E83393326BC8DD515248966E27DC6BBBB5E70978D7076
- initial judgment Markdown SHA-256 FDFE90EDDE1A804F0A5A96637C53877ED06AB61BF1AA6DD42A6C9D698407FEF6
- initial judgment JSON SHA-256 BB0DBD2DFD37DA17120913B3760A0C005860916E66F6980692A164A293B5F8F8

The initial incorrect collection-schema report is retained as SUPERSEDED_ERROR, with the correction appended. No semantic grades were edited. The full response outputs remain unchanged; hidden reasoning was neither read nor included.

## Authoritative per-response reconciliation

This table is computed mechanically from blind-judgment-corrected.json, blind-mechanical-checks.json, and blind-judge-mapping.json. It does not revise any judge score or semantic flag. The corrected judge Markdown narrative and summary are preserved, but its row table contains stale cells: R-8dfadd3f7282 is recorded, schema-invalid, and typed_failure (its JSON score is 1), while four category-defect rows R-771a286e8bbc, R-158a5f6d4c20, R-ec5629a90716, and R-631f05d0c8a6 have semantic_complete=false in JSON, not true as printed in Markdown.

| Response ID | Arm | Input ID | Schema judge/prod | Expected → derived | Semantic complete | Retention | Score /5 | Production host / error |
|---|---|---|---|---|---:|---:|---:|---|
| R-bbe4822cbf07 | recorded | I-2ff2876f9641 | yes/yes | reject → reject | no | yes | 4 | unsupported |
| R-6d3e2eda2412 | recorded | I-0d65e32886dc | yes/yes | pass → pass | yes | yes | 5 | pass |
| R-771a286e8bbc | candidate | I-7e4a442aea1b | yes/yes | reject → reject | no | yes | 4 | unsupported |
| R-760826168abb | candidate | I-a9b021b3557f | yes/yes | pass → pass | yes | yes | 5 | pass |
| R-158a5f6d4c20 | candidate | I-09a8474aa4f6 | yes/yes | reject → reject | no | yes | 4 | unsupported |
| R-ea91c1b3f769 | candidate | I-3ce5dd6d3eda | yes/yes | reject → reject | yes | yes | 5 | unsupported |
| R-d60ef35cb271 | recorded | I-6966711ab659 | yes/yes | pass → pass | yes | yes | 5 | pass |
| R-95e2ec9ba20a | recorded | I-66b5bf4457bf | yes/yes | reject → reject | yes | yes | 5 | unsupported |
| R-8dfadd3f7282 | recorded | I-b0836e51a5e9 | no/no | pass → typed_failure | yes | yes | 1 | typed_failure/TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID |
| R-9c176b4d24e6 | candidate | I-0d65e32886dc | yes/yes | pass → pass | yes | yes | 5 | pass |
| R-90eda4cf60e8 | candidate | I-8888388ef92c | yes/yes | pass → pass | yes | yes | 5 | pass |
| R-a8cd39ea703a | candidate | I-2ff2876f9641 | yes/yes | reject → reject | yes | yes | 5 | unsupported |
| R-ec5629a90716 | recorded | I-7e4a442aea1b | yes/yes | reject → reject | no | yes | 4 | unsupported |
| R-3d1dc59a81b1 | candidate | I-f03b59afbee3 | yes/yes | pass → pass | yes | yes | 5 | pass |
| R-768f2de89f33 | recorded | I-f03b59afbee3 | yes/yes | pass → pass | yes | yes | 5 | pass |
| R-5087e3e3fee2 | candidate | I-9e63fb7be9ab | yes/yes | pass → pass | yes | yes | 5 | pass |
| R-6376b7dd96b9 | recorded | I-ab742946acde | yes/yes | reject → reject | yes | yes | 5 | unsupported |
| R-b7febd119e18 | recorded | I-3ce5dd6d3eda | no/no | reject → typed_failure | no | yes | 2 | typed_failure/TRACE_NPC_SPEECH_GROUNDING_AUDIT_INVALID |
| R-631f05d0c8a6 | recorded | I-09a8474aa4f6 | yes/yes | reject → reject | no | yes | 4 | unsupported |
| R-48bb6c5e658b | recorded | I-5f47e7707800 | yes/yes | pass → pass | yes | yes | 5 | pass |
| R-5fe251b288bb | candidate | I-b0836e51a5e9 | yes/yes | pass → pass | yes | yes | 5 | pass |
| R-ca0e9038db61 | candidate | I-6966711ab659 | yes/yes | pass → pass | yes | yes | 5 | pass |
| R-3f2607d0765a | recorded | I-8888388ef92c | yes/yes | pass → pass | yes | yes | 5 | pass |
| R-390f561eaa4d | candidate | I-66b5bf4457bf | yes/yes | reject → reject | yes | yes | 5 | unsupported |
| R-6b2bdea1af07 | candidate | I-ab742946acde | yes/yes | reject → reject | yes | yes | 5 | unsupported |
| R-5b1eb4ce1053 | recorded | I-a9b021b3557f | yes/yes | pass → pass | yes | yes | 5 | pass |
| R-13664620e460 | candidate | I-5f47e7707800 | yes/yes | pass → pass | yes | yes | 5 | pass |
| R-abd4fc9e5fa6 | recorded | I-9e63fb7be9ab | yes/yes | pass → pass | yes | yes | 5 | pass |

Totals recomputed from judge JSON: schema-valid 26/28; expected decision derived correctly 26/28; full semantic diagnosis 22/28; retention correct 28/28; all four criteria 21/28. These agree with the corrected judge JSON/summary. Production replay independently agrees on schema validity and host outcomes; its two recorded typed failures are not successful expected decisions.
