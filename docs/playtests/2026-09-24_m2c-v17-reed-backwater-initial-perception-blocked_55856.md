# M2c v17 UI: reed-backwater first screen

**BLOCKED after first screen.** Normal game-web, production HTTP handler, real configured model, and isolated PostgreSQL with fixture approvals. Production data was not changed.

Scenario `novgorod_reed_backwater_entrance_v1`, party `party:17cb4d4a046b18ac56b5dc29`. The first screen was delivered through Chrome:

```text
Вы стоите на низкой земле, где грязь и ил покрывают поверхность. Вокруг раскинулась заводь, и кромка берега видна вблизи. Нижний ярус растительности, состоящий из осок, тростника и болотных трав, окружает вас, а у самой воды растения тянутся к воде. На поверхности заметны остатки осок, тростника и болотных трав.

Вы — Микула, рыбак. Ваше тело не ранено, сил достаточно для работы, и сильного голода нет. При вас штаны, нижняя рубаха и низкая кожаная обувь. День светит, и лето стоит в разгаре, но вы не знаете, как оказались здесь или что вас сюда привело.

Местность низкая, и заводь простирается перед вами. Растительность у воды и остатки болотных трав на поверхности создают ощущение тишины, но это не значит, что место пустое или беззвучное. Вы стоите, и время идет, но нет ни цели, ни обязанности, ни пути, который вы могли бы назвать своим.
```

The browser submitted the ordinary observation action. The first turn returned `NATURAL_SCENE_PERCEPTION_DATA_GAP` with reason `canonical_initial_perception_required`. No generated G5 or stock action was reached.

Isolated report: `%TEMP%/novgorod-target-http-smoke-55856.json`, SHA-256 `5876c8723c5e10196eb15f6763772c632f209f0201c9d822a32b98eeb6f9709c`. The isolated browser test ended **0/1 FAIL** as expected for this blocked run.
