export function normalizeStage10Ports(services = {}) {
  const queryable = services.queryable ?? services.db ?? null;
  return { ...services, queryable };
}
