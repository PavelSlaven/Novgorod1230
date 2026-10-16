# M2c expansion availability @2: exact data review request

The M2c expansion import manifest changed from `1899e9b286dcd163b9879e90698fca5dd86899fc4e5c410a4d298f05304d49ce` to `2779a279227b206e5a5f268e2c670f9c2b18a105288cfd29f2ab343592427133`. Review this change and the following exact repinned bytes independently at `gpt-6-sol` high. The prior approvals in `m2c-sol-data-approval.json` remain historical and do not approve these new SHAs.

| Artifact | New SHA-256 | Review scope |
| --- | --- | --- |
| `target-start-candidate.json` | `fd448da3e194aa8563fffacdcfa870be4eb5e004c2da61a4bdc9e0dd767d3412` | Expansion manifest pin, unchanged initial-state authoring |
| `player-transfer-candidate.json` | `e01496e772e9eb8b624491b181c915441da8930c87521723d9c4e3a7b5042c37` | Updated target-start pin, unchanged body, attributes and clothing |
| `player-basis-candidate.json` | `7a5c9f76a28e9aa6a5820ff83a60a17ebb467a3b48841d0798d3588e3c3e65e1` | Updated start and transfer pins, unchanged appearance, skills, language and knowledge |
| `target-runtime-profiles-candidate.json` | `b92313c0bf625f7413ef09e62df9960e76aed09c82bd8c4d9534e8e3c99b7506` | Updated target-start source pin, unchanged profile mechanics and applicability |
| `target-runtime-profiles-approved.json` | `ed1f27c48bdf4c496c4c70588701ac13f9ae340b16e7cb1a61a50489111eccdb` | Deterministic approved-status mapping bytes; separate mapped-data review required |
| `target-runtime-profiles-manifest.json` | `8a0b2881e63cd0a87f67ac347748cf9aab5f5d514c8893f83b473a41e039b2ae` | New candidate and mapped-dataset pins; separate mapped-data review required |

Approval sequence: review the changed expansion manifest and exact start proposal, then the player transfer and basis, then the runtime-profile candidate, then its approved-status mapping and manifest. Issue fresh high-review verdicts with exact SHAs before using approval-gated generators or runtime compilation. No import or activation is authorized by this request.

Additional downstream exact pins still refer to the old start or basis: `appearance-transfer-v2-candidate.json`, `appearance-transfer-v2-import-manifest.json`, `m2c-initial-entity-perception/candidate-v2.json`, and `m2c-scene-movement-edges/candidate.json`. Their owners must repin and obtain separate review before those artifacts can be used with this start.
