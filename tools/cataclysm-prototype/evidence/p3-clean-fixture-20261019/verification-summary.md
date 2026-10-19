P3 clean-fixture native run evidence

Native HEAD: 0d8843f1c500052c3e026e3da6f8edaf5e00b626
Build command: cmake --build build-clang-release --target cata_test --parallel 8
Build result: ninja: no work to do.

Focused test results:
- RLE nested UID roundtrip: PASS, 3 assertions / 1 case(s); filter [novgorod_semantic][json][item].
- pickup identity cases: PASS, 35 assertions / 5 case(s); filter [novgorod_semantic][pickup].
- P2/P4 item UID: PASS, 36 assertions / 4 case(s); filter [novgorod_item_uid].
- P2/P4 slice: PASS, 541 assertions / 4 case(s); filter [novgorod_slice].
- P4 RNG sidecar roundtrip: PASS, 9 assertions / 1 case(s); filter hidden Catch filter.

Runtime evidence: primary world p3-clean-fixture-primary-20261019 under world-primary; separate idle flashlight world p3-clean-fixture-flashlight-20261019 under world-flashlight. Each operation has request JSON, readback JSON, apply/reload logs and post-reload observation JSON in this directory.
