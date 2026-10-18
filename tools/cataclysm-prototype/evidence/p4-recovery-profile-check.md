# P4 profile runtime check — 2026-10-19

Status: PASSED. No repository/native source edits and no build were performed.

Selected accepted generation:
- Root: `/home/slaven/cataclysm-recovery-evidence/uid-rng/preload-metrics-20261019/metrics-baseline`
- `current.json`: generation `75f5737dc3ff417aa0485b68e512bd8d`, world `p4_metrics_preload`
- Accepted userdir: `generations/75f5737dc3ff417aa0485b68e512bd8d/userdir`
- SHA-256 tree before and after: `2d996e47f6e02d0db890d8b123ef20ab9cd11ff97055b1cb2e70f48c333ab5e2`

Runtime:
- Frozen executable: `/home/slaven/cataclysm-recovery-evidence/p4-frozen-20261019/cata_test`
- SHA-256: `8afcda2ec94bac7469a2bb85f7c40c8f3357c91c48b40f4d57de2f06b5a3ac8a`
- Native root: `/home/slaven/cataclysm-recovery`; HEAD before/after `0d8843f1c500052c3e026e3da6f8edaf5e00b626`
- Profile base (native data revision, binary hash), before and after: `8de5285c1c41de195a1988b8b904e2a23a55f0095d7293c327131647a2b64ba3`, `8afcda2ec94bac7469a2bb85f7c40c8f3357c91c48b40f4d57de2f06b5a3ac8a`
- Coordinator source: `/mnt/c/Users/Slaven/.codex/worktrees/cataclysm-recovery/Novgorod/tools/cataclysm-prototype/generations.py`; SHA-256 `0f1b58d00f8c6b3cf8de32e085396a823337b5afa58777ae730380cca968f4c5`.

Evidence under `/home/slaven/cataclysm-recovery-evidence/p4-profile-check-20261019`:
- Writable disposable normal clone: `normal-read/userdir`
- Writable disposable altered clone: `mismatch/userdir`
- Started one `NativeHost` with the baseline static profile and frozen executable.
- Normal clone native read succeeded (`p4=true`, `mode=read`, `world=p4_metrics_preload`; child elapsed 1294.2 ms).
- Changed only ordered world mods in the altered clone: `save/p4_metrics_preload/mods.json`, `["dda", "test_data"]` → `["test_data", "dda"]`. Profile key changed from `6f3d21510602bb8075170eb69ef779b96f1b7eb555357db9a5adf6c2a84d1c33` to `7038eb5c40790bd17ebf1e698919e1854879fba94fdfd39a810cb1191897be53`.
- `NativeHost.request("read", altered_clone)` rejected before sending/applying to native child with `preload host profile mismatch; cold restart required`.
- Then sent a raw request carrying a deliberately wrong key to test native private protocol; retained exact returned frame: `NOVGOROD_PRELOAD_REJECT\tprofile_mismatch`. Host remained alive after rejection. No child was requested by either rejection path.
- Accepted snapshot tree hash was identical before and after. Native HEAD and data revision profile base were identical before and after.

One initial read attempt failed because `copytree` preserved the accepted snapshot's read-only permissions; the resulting fresh child exited 122. The disposable clones were then made writable using the existing `_make_writable` helper, and the read and both mismatch checks passed. The accepted snapshot itself remained read-only and unchanged.

Commands actually run included Python `import generations`, `_profile_base`, `_profile_key`, `NativeHost` initialization/request/close, direct raw preload request over the host pipe, SHA-256 tree calculation, and post-run `_profile_base`/HEAD checks. No metrics run or fault suite was run.
