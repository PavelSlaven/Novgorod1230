# Поиск существующих issue для восьми падений `[novgorod_live]`

Источник: `R/part1/fix04d/logs/test-clean-head-seed-17.log`, где `R = C:/Users/Slaven/.claude/projects/C--Users-Slaven-Documents-Novgorod/codex-direct`. Итог прогона: 25 случаев, 17 успешных, 8 упавших; 19 неуспешных проверок. В задании CI783 указан HEAD `da8f91947f2eedb6a614062e49326d62f8acb5aa`; эта рабочая папка не является Git-репозиторием, поэтому HEAD здесь независимо не подтверждён.

| Упавший `TEST_CASE` | Первое место падения в журнале |
| --- | --- |
| `Novgorod live speech preserves tags and uses actual native hearing` | `novgorod_semantic_test.cpp:661` (дважды) |
| `Novgorod semantic NPC speech shares native CHAT candidates` | `novgorod_semantic_test.cpp:1350` |
| `Novgorod NPC speech keeps native variable tags literal` | `novgorod_semantic_test.cpp:1500` |
| `Novgorod NPC silence is visible behaviour without sound` | `novgorod_semantic_test.cpp:1572` |
| `Novgorod speech refusals leave the native world unchanged` | `novgorod_semantic_test.cpp:468` |
| `Novgorod conversation memory records what was heard said and kept silent` | `novgorod_semantic_test.cpp:1677` |
| `Novgorod frame exports NPC identity opinion memory and visible items` | `novgorod_semantic_test.cpp:1876` |
| `Novgorod whispered avatar speech is heard only as far as native sound reaches` | `novgorod_semantic_test.cpp:468` |

Команды чтения GitHub для `PavelSlaven/Novgorod1230`:

```text
gh issue list --repo PavelSlaven/Novgorod1230 --state all --limit 100 --json number,title,state,url,body
gh issue list --repo PavelSlaven/Novgorod1230 --state all --search 'память' --limit 100 --json number,title,state,url
gh issue list --repo PavelSlaven/Novgorod1230 --state all --search 'memory' --limit 100 --json number,title,state,url
```

Первая команда вернула `HTTP 401: Requires authentication` (GraphQL). Оба поисковых запроса вернули `401 Unauthorized: Requires authentication` (REST). Следовательно, наличие или отсутствие соответствующих issue **не проверено**; отсутствие выдачи не означает отсутствия issue. Issue не создавались и не комментировались, workflow не запускались.
