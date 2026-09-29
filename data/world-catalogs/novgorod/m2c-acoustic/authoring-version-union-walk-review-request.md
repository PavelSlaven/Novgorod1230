# Acoustic union repin (canonical-walk): independent review request

Review as an independent Contract Auditor. Return `APPROVE_DATA_ONLY` or reject with exact findings. Do not self-approve. This request grants no import and no activation.

[authoring-version-union-walk-data-approval.json](authoring-version-union-walk-data-approval.json) is generated with `decision: PENDING_INDEPENDENT_APPROVAL`. To approve, replace `decision`, `reviewer` and `reviewed_on`, then re-run `node scripts/promote-m2c-acoustic-packages.mjs`: it re-pins the approval SHA in [the P12 walk request](../m2c-p12-v17-walk-acoustics-v1/request.json).

- Acoustic baselines: 218 rows = base 25 + canonical-terminal 46 + canonical-walk 147. Each package approval pins its candidate and authoring-rows SHA; the script asserts both.
- Authoring versions: 2761 rows; the acoustic block is regenerated from the baselines in place, all other rows are byte-identical.
- Acoustic manifest SHA-256: `4d468e68cbdecca4d2ae43a0ea9b07101ca17d4be2abb9c016b69f366535daad`. Authoring versions SHA-256: `186c178c0cc8225a19be9c643303ecaaf01fdc219cc3963aeabbdc6937d29f7b`. Connection profile, binding and dependency-edge SHAs are unchanged and are asserted to be present in the manifest.
- Regenerate and verify: `node scripts/promote-m2c-acoustic-packages.mjs --check`.
