// Explicit rollback route. It is never selected by default after staged cutover.
// Enable only with RUS_RUNTIME_ROUTE=legacy and preserve party storage independently.
await import('../../../legacy/src/ui-server.js');
