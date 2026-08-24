import { projectNpcSafeResourceSnapshots } from '@rus/npc-runtime';
import { planRuntimeContainerAccess } from '@rus/items-property';
import { createContainerAccessHandler, snapshotO2bCommittedContainerInput } from
  './lower-dvina-trace-turn-step-container-access.js';
import { initializeRuntimeState } from './lower-dvina-trace-turn-step-item-support.js';

const ACCESS_KINDS = ['open', 'close', 'unlock', 'force', 'open_and_view'];

export function createNpcContainerCapability({ state, npc, partyId, inputDigest,
  createOrdinaryContainerContentsResolver }) {
  const containers = npcSafeContainers(state, npc);
  if (containers.length === 0) return null;
  const committed = snapshotO2bCommittedContainerInput(
    containerCommittedState(state, containers.map(({ container }) => container)));
  if (committed == null) return null;
  const handler = createContainerAccessHandler(initializeRuntimeState(committed), {
    ordinaryContainerContentsResolver:
      typeof createOrdinaryContainerContentsResolver === 'function'
        ? createOrdinaryContainerContentsResolver({ partyId, inputDigest }) : null
  });
  const byRef = new Map(containers.map(({ container, accessKinds }) =>
    [containerRef(container), accessKinds]));
  return {
    operation: 'request_container_access',
    capability: { owner: '@rus/items-property', allowed: containers.map(
      ({ container, accessKinds }) => ({ actor_ref: npc.instance_id,
        container_ref: containerRef(container), access_kinds: [...accessKinds] })) },
    isApplicable: () => true,
    supports: ({ operation }) => operation.actor_ref === npc.instance_id
      && byRef.get(operation.container_ref)?.includes(operation.access_kind) === true,
    execute: (execution) => {
      if (!byRef.get(execution.operation.container_ref)?.includes(
        execution.operation.access_kind)) throw new Error('TRACE_TURN_STEP_CONTAINER_ACCESS_DENIED');
      return handler({ ...execution, working_projection: {
        ...structuredClone(execution.working_projection), actor_id: npc.instance_id,
        items: [{ item_id: execution.operation.container_ref }]
      } });
    }
  };
}

function npcSafeContainers(state, npc) {
  const containers = state?.containers ?? [];
  const safe = new Set(projectNpcSafeResourceSnapshots({ npc_snapshot: npc,
    resource_snapshots: containers, perception_snapshot: npc.perception_snapshot,
    knowledge_snapshot: npc.knowledge_snapshot }).map(({ resource_ref }) => resource_ref));
  return containers.flatMap((container) => {
    const holder = container?.placement?.holder_npc_id ?? container?.holder_npc_id;
    const accessKinds = ACCESS_KINDS.filter((access_kind) => {
      const plan = planRuntimeContainerAccess({ container, access_kind });
      return plan.pass || plan.errors[0]?.category === 'check';
    });
    return safe.has(containerRef(container)) && (holder === npc.instance_id
      || holder == null && colocated(container, npc)) && accessKinds.length > 0
      ? [{ container, accessKinds }] : [];
  });
}

function colocated(container, npc) {
  const state = container?.state ?? {};
  return state.location_ref != null && state.location_ref === npc?.machine_state?.location_ref
    || state.zone_ref != null && state.zone_ref === npc?.machine_state?.spatial_zone_ref;
}

function containerCommittedState(state, containers) {
  const selected = new Map(containers.map((container) => [containerRef(container),
    structuredClone(container)]));
  const items = state?.items ?? [];
  for (let changed = true; changed;) {
    changed = false;
    for (const record of [...items, ...(state?.containers ?? [])]) {
      const ref = containerRef(record);
      if (selected.has(record?.placement?.container_id ?? record?.container_id)
          && !selected.has(ref)) { selected.set(ref, structuredClone(record)); changed = true; }
    }
  }
  const refs = new Set(selected.keys());
  return { containers: [...selected.values()].filter((container) =>
    (state?.containers ?? []).some((candidate) => containerRef(candidate) === containerRef(container))),
  items: items.filter((item) => refs.has(containerRef(item))).map((item) => structuredClone(item)) };
}

function containerRef(container) {
  return container?.container_id ?? container?.item_id ?? container?.instance_id;
}
