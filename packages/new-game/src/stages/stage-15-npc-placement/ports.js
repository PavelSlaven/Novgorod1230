import { materializeNpcPlacement } from '@rus/materialization';
export function assertStage15Ports(services = {}) {
  const materialize = services.materialize ?? services.place ?? materializeNpcPlacement;
  if (typeof services.audit !== 'function') throw new TypeError('Stage 15 requires audit service.');
  return { ...services, materialize };
}
