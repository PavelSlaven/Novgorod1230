# P08 target interaction map

All arrows are public ports and all P08 implementations return one typed fail-closed result. No arrow reaches active v2 or a database before its later owning phase.

```text
world-base/authoring (future adapter)
  → @rus/space-map context loader / topology repository
  → @rus/movement-routes traversal resolver / commit validator
  → @rus/materialization topology proposal validator
  → @rus/turn combined write-plan builder
  → @rus/party-store repository / combined write-plan committer
```

`@rus/contracts` owns the shared DTO/error vocabulary used by all ports. `@rus/time-events-history` owns time contracts, presentation/knowledge owns only player-safe projection, and `@rus/game-server` may compose these interfaces only at P28.
