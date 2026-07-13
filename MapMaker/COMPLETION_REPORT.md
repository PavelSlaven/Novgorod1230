# MapMaker — отчёт выполнения критериев

Дата проверки: 2026-07-11
Версия: 0.2.0

- [x] Path traversal закрыт.
- [x] generated graph недоступен браузеру.
- [x] Rumored/rough knowledge не раскрывает канонические данные.
- [x] Hidden child maps не раскрываются.
- [x] G1 использует grid_x/grid_y.
- [x] Межродительские маршруты превращаются в boundary exits.
- [x] contains не рисуется как физический маршрут.
- [x] Reverse directions визуально объединяются.
- [x] Каждый layout имеет quality report.
- [x] Approved layout не содержит overlaps.
- [x] Обязательные semantic layouts утверждены внешним review artifact.
- [x] Demo не подменяет status.
- [x] Bend points отображаются.
- [x] Marker layer работает.
- [x] Knowledge states визуально различаются.
- [x] Browser API принимает относительный base URL.
- [x] Есть keyboard representation.
- [x] Production API проверяет party и character access.
- [x] Все стадии конвейера имеют unit tests.
- [x] Security и browser e2e tests проходят.
- [x] Новгород пересобран новым компилятором.

## Проверенные показатели

```json
{
  "nodes": 11359,
  "physicalDirectedEdges": 30248,
  "layouts": 1141,
  "approvedLayouts": 1141,
  "geometryFailed": 0,
  "overlapLayouts": 0,
  "invalidLayouts": 0,
  "boundaryExits": 58,
  "tests": {
    "unitAndIntegration": 15,
    "security": 2,
    "browserE2E": 1,
    "failed": 0
  }
}
```
