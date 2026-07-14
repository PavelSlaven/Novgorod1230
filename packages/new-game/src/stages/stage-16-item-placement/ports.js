import { materializeItemPlacement } from '@rus/materialization';
export function assertStage16Ports(services = {}) {
  const materialize = services.materialize ?? services.place ?? materializeItemPlacement;
  if (typeof services.audit !== 'function') throw new TypeError('Stage 16 requires audit service.');
  return { ...services, materialize };
}
