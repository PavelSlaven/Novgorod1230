# Issue #566: bounded capture plan and result

## Source and derivation

Linux clone: `/srv/novgorod-work/tmp/d49-566-activity-capture-d4f3948-20261017/clone`, HEAD `a2100d99abafa944849d271f4d53591cec8d46fd`. Current temporary harness `test/integration/held-item-visible-npc-production-capture-a2100d99-corrected.test.js`, SHA-256 `bb02ad2726a0b412d3de8835c581a27f53575a798a8d37f41b48a6406f765e1d`. Derivation script `/srv/novgorod-work/tmp/d49-566-activity-capture-d4f3948-20261017/derive-seed-corrected.mjs`, SHA-256 `73a7fd20de4666ce267c38fabdbde98e187b993650be6aa325b49b3a5f725b70`; composition comes from `buildAdditionalStartOwnerRows()`.

Reproduce derivation from the task directory with its required snapshot argument:

```sh
cd /srv/novgorod-work/tmp/d49-566-activity-capture-d4f3948-20261017
node derive-seed-corrected.mjs actual-000005-opening-private.json
```

The actual `issue-566-fisher-seed-000005` readback matched party `party:e8d364a7e59d2988f2b5fafe`, run `authored_f2f35dca8f6d504d7fb0a68e`, site `g5:g5_node_11258a18eba734bf61641ba8`, composition `m2c_g4_npc_composition_canonical_initial_novgorod_vikhtuy_work_storage_v1@2` digest `67ebf28a3c7877cca80782f8e35243ace35ba3a2e2e4d59947ad10e8d30aa00f`, selection seed digest `b75f1d4695d27fdc2fa92602c43a80b0aaa569637e89033fc9ae472ec911c74e`, count `0`, first RNG draw `3922159146`.

The bounded request IDs were `issue-566-fisher-seed-000050`, `000051`, `000080`, `000086`, `000088`, and `000091`. Each derived to one Fisher@4 under composition@2.

## Harness behavior

The harness acknowledges each real opening after saving its response. It stores SQL and `Phase1ARepository.loadInternal` readbacks in a separate private snapshot before visibility probing. It selects the first clear Fisher holding the authored fishing net, then sends LOOK and checks activity in opening and turn writer inputs, `visible_status`, held-item cues, repeated screen, and new-runtime reload. It keeps exact Fisher@4 and composition@2 assertions, allows at most six fresh starts, and does not modify party state.

## Bounded PG result

Command:

```sh
/srv/novgorod-work/fleet/bin/pg-slot node --test --test-isolation=none --test-reporter=tap test/integration/held-item-visible-npc-production-capture-a2100d99-corrected.test.js
```

Node `v24.15.0`; test timeout `3,600,000 ms`; source/harness matched the identities above. The one run exited `1` after `521044 ms` test duration. It used an isolated `pg-slot` and fake provider; model calls were `0`.

Six opening readbacks were captured. Seeds `000050` and `000086` had no visibility observation; `000051`, `000080`, and `000088` were partial; `000091` was the first clear Fisher+net. Its party was `party:ffd603c9cfa485c88f4c58be`; NPC `npc_2cefb52cacd76ebbbf8984e8` was Fisher@4 under composition@2; fishing net `item_d9739fb0bde20d0d1792c19e` was held by that NPC in `hands`. The committed machine state had active activity ref `activity_m2c_npc_fisher_initial_work_observation_v1`, summary “Inspects one fishing net authored in the same NPC materialization transaction; descriptive mending only, with no net-condition change, fishing, catch, fish stock, or yield.”

The test completed LOOK and passed the opening and turn writer-input assertions that each contained “Осматривает рыболовную сеть.” The post-LOOK screen contained the holder, but `holder.visible_status` was `undefined`; the assertion expected “Осматривает рыболовную сеть.” and failed at line 297. The repeated-screen and new-runtime reload assertions were not reached. No reload result is claimed.

Run artifacts, including metadata, argv, source/harness hashes, log, wire, and all six opening, readback, and partial-private snapshots, are in `/srv/novgorod-work/tmp/d49-566-activity-capture-d4f3948-20261017/pg-run-a2100d99-ack-readback-20261017` and copied to `C:\Users\Slaven\AppData\Local\Temp\d49-activity-capture-a2100d99-ack-readback-20261017`. `pg-slot` cleanup left no `novgorod-test-pg` containers. The earlier seed-000050 `OPENING_ACK_REQUIRED` run and its verbatim fake opening are documented in [the first failed capture report](2026-10-17_d49-activity_566-seed50-fail.md).
