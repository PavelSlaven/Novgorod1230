# M2c v17 UI: riverbank first screen

**BLOCKED after first screen.** Normal game-web, production HTTP handler, real configured model, and isolated PostgreSQL with fixture approvals. Production data was not changed.

Scenario `novgorod_riverbank_approach_v1`, party `party:07420e78791839f21c33ae8d`. The first screen was delivered through Chrome:

```text
Вы — Микула, лодочник. Тело не знает ран, и в нём достаточно сил для работы, а сильного голода нет. На ногах — низкая кожаная обувь, на теле — нижняя рубаха и штаны. Летний день 1230 года освещает всё вокруг, и вы стоите на южном входе, где различима вода, кромка берега и очертания деревьев.
```

The browser submitted the ordinary observation action. The first turn returned `NATURAL_SCENE_PERCEPTION_DATA_GAP` with reason `canonical_initial_perception_required`. No generated G5 or stock action was reached.

Isolated report: `%TEMP%/novgorod-target-http-smoke-55856.json`, SHA-256 `5876c8723c5e10196eb15f6763772c632f209f0201c9d822a32b98eeb6f9709c`. The isolated browser test ended **0/1 FAIL** as expected for this blocked run.
