import { materializeG5Scene } from '@rus/materialization';
export function assertStage13Ports(services = {}) { return { ...services, materialize: services.materialize ?? materializeG5Scene }; }
