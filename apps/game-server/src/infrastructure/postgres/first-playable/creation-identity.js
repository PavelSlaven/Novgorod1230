import { isDeepStrictEqual } from 'node:util';
import { serverError } from '../../../errors.js';
import { hash, json } from '../../../runtime/first-playable/shared.js';

export async function assertNewGameCreationIdentityAvailable(
  pool,
  { partyId, creationIdentity }
) {
  const existing = await pool.query(
    `SELECT snapshot.state_payload,
            session.stage26_result
       FROM party_runtime.parties party
       JOIN party_runtime.party_state_snapshots snapshot
         ON snapshot.party_id=party.party_id
        AND snapshot.state_version=party.state_version
       LEFT JOIN party_runtime.party_server_sessions session
         ON session.party_id=party.party_id
      WHERE party.party_id=$1`,
    [partyId]
  );
  if (existing.rows.length === 0) return;
  assertNewGameCreationIdentity({
    partyId,
    expected: creationIdentity,
    statePayload: existing.rows[0].state_payload,
    sessionIdentity: existing.rows[0].stage26_result
  });
}

export function assertNewGameCreationIdentity({
  partyId,
  expected,
  statePayload,
  sessionIdentity
}) {
  const exactStored = [
    sessionIdentity?.creation_identity,
    statePayload?.creation_identity
  ].filter((value) => value != null);
  if (exactStored.length > 0) {
    if (exactStored.every((stored) =>
      isDeepStrictEqual(stored, expected))) return;
    conflict();
  }
  if (isDeepStrictEqual(
    legacyScenarioCreationIdentity(partyId, statePayload),
    expected
  )) return;
  conflict();
}

function legacyScenarioCreationIdentity(partyId, statePayload) {
  if (statePayload?.schema ===
      'rus.lower_dvina_trace_initial_party_snapshot.v2') {
    const request = statePayload.request_identity;
    if (request?.scenario_id !== 'lower_dvina_trace_v1'
      || request.party_id !== partyId) return null;
    const prefix = `new-game:${request.scenario_id}:`;
    if (!String(request.idempotency_key ?? '').startsWith(prefix)) {
      return null;
    }
    return {
      version: 1,
      schema: 'rus.first_playable_public_creation_identity.v1',
      party_id: partyId,
      launch_branch: 'scenario_id',
      scenario_id: request.scenario_id,
      effective_player_name: null,
      branch_input_digest: scenarioBranchDigest(request.scenario_id),
      request_id_digest:
        String(request.idempotency_key).slice(prefix.length)
    };
  }
  if (statePayload?.schema !== 'lower_dvina_first_playable_state.v1'
    || !statePayload.request_id
    || !statePayload.scenario_id) return null;
  return {
    version: 1,
    schema: 'rus.first_playable_public_creation_identity.v1',
    party_id: partyId,
    request_id_digest: hash(statePayload.request_id),
    launch_branch: 'scenario_id',
    scenario_id: statePayload.scenario_id,
    effective_player_name: null,
    branch_input_digest: scenarioBranchDigest(statePayload.scenario_id)
  };
}

function conflict() {
  throw serverError(
    'NEW_GAME_CREATION_IDENTITY_CONFLICT',
    'The public request identity is already bound to another new-game branch or scenario.',
    { status: 409 }
  );
}

function scenarioBranchDigest(scenarioId) {
  return hash(json({
    launch_branch: 'scenario_id',
    scenario_id: scenarioId
  }));
}
