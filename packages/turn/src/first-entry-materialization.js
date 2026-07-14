export async function enterG4WithMaterialization({ partyId, g4Id, loadCommittedBaseline, buildMaterializationRequest, materialize, transact, commitMovement, commitMaterializationAndMovement }) {
  for (const [name, value] of Object.entries({ loadCommittedBaseline, buildMaterializationRequest, materialize, transact, commitMovement, commitMaterializationAndMovement })) if (typeof value !== 'function') throw new TypeError(`${name} must be a function.`);
  return transact(async (transaction) => {
    const baseline = await loadCommittedBaseline({ partyId, g4Id, transaction, lock: 'for_update' });
    if (baseline) return commitMovement({ partyId, g4Id, baselineRunId: baseline.run_id, transaction });
    const request = await buildMaterializationRequest({ partyId, g4Id, trigger: 'first_entry', transaction });
    const result = await materialize(request);
    return commitMaterializationAndMovement({ partyId, g4Id, materialization: result, transaction });
  });
}
