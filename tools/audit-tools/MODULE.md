# @rus/audit-tools

## Назначение

Безопасная инвентаризация release/audit trees и проверка запрещённых путей. Пакет создаёт manifests, но не помещает ZIP или `dist` внутрь source tree.

## Public API

- `createAuditManifest`
- `verifyAuditEntries`

## Инварианты

Secrets, `.git`, `node_modules`, runtime data, `tmp`, `dist` и вложенные release archives блокируются. Manifest содержит только относительные пути, размеры и SHA-256.
