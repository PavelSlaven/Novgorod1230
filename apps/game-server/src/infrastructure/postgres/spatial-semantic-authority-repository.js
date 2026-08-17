import { canonicalDigest } from '@rus/materialization';
import { normalizeSpatialSemanticEnvelope } from
  '@rus/materialization/internal/lower-dvina-trace-s1';

// This is deliberately the only pre-model seam.  Runtime obtains a detached
// proof here; it cannot manufacture an envelope, residual capacity, or pin.
export function createSpatialSemanticAuthorityRepository({ pool } = {}) {
  if (!pool?.connect) throw new TypeError('S1 authority repository requires pg pool.');
  return Object.freeze({
    acquireOrReuseReservation: (input) => transaction(pool, (client) =>
      acquire(client, input)),
    releaseReservation: (input) => transaction(pool, (client) =>
      release(client, input)),
    loadCommittedReservation: (input) => transaction(pool, (client) =>
      load(client, input))
  });
}

export async function provisionSpatialSemanticEnvelope(raw) {
  const values = dataFields(raw,
    ['client','partyId','envelope','capacity','changeSetId'],
    'S1_SPATIAL_AUTHORITY_INVALID');
  if (!values.client?.query) fail('S1_SPATIAL_AUTHORITY_INVALID');
  const input = snapshot({ partyId: values.partyId,
    envelope: values.envelope, capacity: values.capacity,
    changeSetId: values.changeSetId }, 'S1_SPATIAL_AUTHORITY_INVALID');
  return provision(values.client, { party_id: input.partyId,
    envelope: input.envelope, capacity: input.capacity,
    change_set_id: input.changeSetId });
}

async function provision(client, raw) {
  const input = snapshot(raw, 'S1_SPATIAL_AUTHORITY_INVALID');
  if (!exact(input, ['party_id','envelope','capacity','change_set_id'])) {
    fail('S1_SPATIAL_AUTHORITY_INVALID');
  }
  const party = text(input.party_id);
  let envelope;
  try { envelope = normalizeSpatialSemanticEnvelope(input.envelope); }
  catch { fail('S1_SPATIAL_AUTHORITY_INVALID'); }
  const capacity = capacityOf(input.capacity);
  const changeSetId = input.change_set_id;
  if (!party || !(changeSetId === null || text(changeSetId))) {
    fail('S1_SPATIAL_AUTHORITY_INVALID');
  }
  await lockAndValidateScope(client, party, envelope);
  const row = authorityRow({ party_id: party, envelope, capacity,
    authority_state_version: 1, status: 'committed' });
  const digest = `sha256:${canonicalDigest(row)}`;
  const existing = await client.query(`SELECT envelope,capacity,authority_state_version,status,authority_digest FROM party_runtime.party_spatial_semantic_envelopes WHERE party_id=$1 AND envelope_ref=$2 FOR UPDATE`, [party, envelope.envelope_ref]);
  if (existing.rows.length) {
    const current = authorityRow({ party_id: party, envelope: existing.rows[0].envelope,
      capacity: existing.rows[0].capacity, authority_state_version: Number(existing.rows[0].authority_state_version), status: existing.rows[0].status });
    if (existing.rows[0].authority_digest !== `sha256:${canonicalDigest(current)}`
        || canonicalDigest(current) !== canonicalDigest(row)) fail('S1_SPATIAL_AUTHORITY_CONFLICT');
    return deepFreeze({ envelope_pin: { row: current, authority_digest: existing.rows[0].authority_digest } });
  }
  await client.query(`INSERT INTO party_runtime.party_spatial_semantic_envelopes (party_id,envelope_ref,envelope,capacity,authority_state_version,authority_digest,status,created_change_set_id) VALUES ($1,$2,$3::jsonb,$4::jsonb,1,$5,'committed',$6)`, [party, envelope.envelope_ref, JSON.stringify(envelope), JSON.stringify(capacity), digest, changeSetId]);
  return deepFreeze({ envelope_pin: { row, authority_digest: digest } });
}

async function acquire(client, input) {
  input = snapshot(input, 'S1_SPATIAL_RESERVATION_INVALID');
  if (!exact(input, ['party_id','envelope_ref','reservation_ref','change_set_id'])) {
    fail('S1_SPATIAL_RESERVATION_INVALID');
  }
  const party = text(input.party_id); const envelopeRef = text(input.envelope_ref);
  const reservationRef = text(input.reservation_ref); const changeSetId = input.change_set_id;
  if (!party || !envelopeRef || !reservationRef || changeSetId !== null) {
    fail('S1_SPATIAL_RESERVATION_INVALID');
  }
  const authority = await envelopeFor(client, party, envelopeRef, true);
  const currentReservation = await client.query(`SELECT reservation_ref,envelope_ref,reservation_state_version,capacity,reservation_digest,status FROM party_runtime.party_spatial_semantic_reservations WHERE party_id=$1 AND reservation_ref=$2 FOR UPDATE`, [party, reservationRef]);
  await lockAndValidateScope(client, party, authority.envelope);
  if (currentReservation.rows.length) {
    return reservationProof(authority,
      reservationRow(party, currentReservation.rows[0]));
  }
  if (authority.capacity.remaining < 1) fail('S1_SPATIAL_CAPACITY_EXHAUSTED');
  const nextCapacity = { total: authority.capacity.total, reserved: authority.capacity.reserved + 1, remaining: authority.capacity.remaining - 1 };
  const nextAuthority = authorityRow({ ...authority, capacity: nextCapacity,
    authority_state_version: authority.authority_state_version + 1 });
  const nextDigest = `sha256:${canonicalDigest(nextAuthority)}`;
  const updated = await client.query(`UPDATE party_runtime.party_spatial_semantic_envelopes SET capacity=$1::jsonb,authority_state_version=$2,authority_digest=$3 WHERE party_id=$4 AND envelope_ref=$5 AND authority_state_version=$6`, [JSON.stringify(nextCapacity), nextAuthority.authority_state_version, nextDigest, party, envelopeRef, authority.authority_state_version]);
  if (updated.rowCount !== 1) fail('S1_SPATIAL_AUTHORITY_STALE');
  const reservation = { reservation_ref: reservationRef, state_version: 1,
    status: 'committed_reserved', capacity: nextCapacity,
    envelope: authority.envelope };
  const reservationDigest = `sha256:${canonicalDigest(reservation)}`;
  await client.query(`INSERT INTO party_runtime.party_spatial_semantic_reservations (party_id,reservation_ref,envelope_ref,reservation_state_version,capacity,reservation_digest,status,reserved_at_change_set_id) VALUES ($1,$2,$3,1,$4::jsonb,$5,'committed_reserved',$6)`, [party, reservationRef, envelopeRef, JSON.stringify(nextCapacity), reservationDigest, changeSetId]);
  return deepFreeze({ envelope_pin: { row: nextAuthority,
    authority_digest: nextDigest },
  reservation: { ...reservation, reservation_digest: reservationDigest },
  reservation_pin: { row: reservationRow(party, {
    reservation_ref: reservationRef, envelope_ref: envelopeRef,
    reservation_state_version: 1, capacity: nextCapacity,
    status: 'committed_reserved' }), reservation_digest: reservationDigest } });
}

async function release(client, raw) {
  const input = snapshot(raw, 'S1_SPATIAL_RESERVATION_INVALID');
  if (!exact(input, ['party_id','reservation_ref'])) {
    fail('S1_SPATIAL_RESERVATION_INVALID');
  }
  const party = text(input.party_id); const reservationRef = text(input.reservation_ref);
  if (!party || !reservationRef) fail('S1_SPATIAL_RESERVATION_INVALID');
  const candidate = await client.query(`SELECT envelope_ref FROM party_runtime.party_spatial_semantic_reservations WHERE party_id=$1 AND reservation_ref=$2`, [party, reservationRef]);
  if (candidate.rows.length === 0) return deepFreeze({ released: false });
  if (candidate.rows.length !== 1) fail('S1_SPATIAL_RESERVATION_STALE');
  const authority = await envelopeFor(client, party, candidate.rows[0].envelope_ref, true);
  const found = await client.query(`SELECT reservation_ref,envelope_ref,reservation_state_version,capacity,reservation_digest,status FROM party_runtime.party_spatial_semantic_reservations WHERE party_id=$1 AND reservation_ref=$2 FOR UPDATE`, [party, reservationRef]);
  if (found.rows.length === 0) return deepFreeze({ released: false });
  if (found.rows.length !== 1 || found.rows[0].status !== 'committed_reserved') {
    return deepFreeze({ released: false });
  }
  const row = reservationRow(party, found.rows[0]);
  reservationProof(authority, row);
  if (canonicalDigest(authority.capacity) !== canonicalDigest(row.capacity)
      || authority.capacity.reserved < 1) fail('S1_SPATIAL_RESERVATION_STALE');
  const capacity = { total: authority.capacity.total,
    reserved: authority.capacity.reserved - 1,
    remaining: authority.capacity.remaining + 1 };
  const nextAuthority = authorityRow({ ...authority, capacity,
    authority_state_version: authority.authority_state_version + 1 });
  const digest = `sha256:${canonicalDigest(nextAuthority)}`;
  const updated = await client.query(`UPDATE party_runtime.party_spatial_semantic_envelopes SET capacity=$1::jsonb,authority_state_version=$2,authority_digest=$3 WHERE party_id=$4 AND envelope_ref=$5 AND authority_state_version=$6`, [JSON.stringify(capacity), nextAuthority.authority_state_version, digest, party, authority.envelope_ref, authority.authority_state_version]);
  if (updated.rowCount !== 1) fail('S1_SPATIAL_AUTHORITY_STALE');
  const deleted = await client.query(`DELETE FROM party_runtime.party_spatial_semantic_reservations WHERE party_id=$1 AND reservation_ref=$2 AND status='committed_reserved'`, [party, reservationRef]);
  if (deleted.rowCount !== 1) fail('S1_SPATIAL_RESERVATION_STALE');
  return deepFreeze({ released: true });
}

async function load(client, input) {
  input = snapshot(input, 'S1_SPATIAL_RESERVATION_INVALID');
  if (!exact(input, ['party_id','reservation_ref'])) {
    fail('S1_SPATIAL_RESERVATION_INVALID');
  }
  const party = text(input.party_id); const reservationRef = text(input.reservation_ref);
  if (!party || !reservationRef) fail('S1_SPATIAL_RESERVATION_INVALID');
  const found = await client.query(`SELECT reservation_ref,envelope_ref,reservation_state_version,capacity,reservation_digest,status FROM party_runtime.party_spatial_semantic_reservations WHERE party_id=$1 AND reservation_ref=$2`, [party, reservationRef]);
  if (found.rows.length !== 1) fail('S1_SPATIAL_RESERVATION_MISSING');
  return reservationProof(await envelopeFor(client, party, found.rows[0].envelope_ref), reservationRow(party, found.rows[0]));
}

async function envelopeFor(client, party, ref, lock = false) {
  const found = await client.query(`SELECT envelope,capacity,authority_state_version,status,authority_digest FROM party_runtime.party_spatial_semantic_envelopes WHERE party_id=$1 AND envelope_ref=$2${lock ? ' FOR UPDATE' : ''}`, [party, ref]);
  if (found.rows.length !== 1) fail('S1_SPATIAL_AUTHORITY_MISSING');
  const row = authorityRow({ party_id: party, envelope: found.rows[0].envelope, capacity: found.rows[0].capacity, authority_state_version: Number(found.rows[0].authority_state_version), status: found.rows[0].status });
  if (found.rows[0].authority_digest !== `sha256:${canonicalDigest(row)}`) fail('S1_SPATIAL_AUTHORITY_STALE');
  return row;
}
function reservationProof(authority, row) {
  const reservation = { reservation_ref: row.reservation_ref, state_version: row.state_version, status: row.status, capacity: row.capacity, envelope: authority.envelope };
  const digest = `sha256:${canonicalDigest(reservation)}`;
  if (row.reservation_digest && row.reservation_digest !== digest) fail('S1_SPATIAL_RESERVATION_STALE');
  return deepFreeze({ envelope_pin: { row: authority, authority_digest: `sha256:${canonicalDigest(authority)}` }, reservation: { ...reservation, reservation_digest: digest }, reservation_pin: { row, reservation_digest: digest } });
}
function authorityRow({ party_id, envelope, capacity, authority_state_version, status }) { return { party_id, envelope_ref: envelope.envelope_ref, envelope, capacity: capacityOf(capacity), authority_state_version: Number(authority_state_version), status }; }
function reservationRow(party_id, row) { return { party_id, reservation_ref: row.reservation_ref, envelope_ref: row.envelope_ref, state_version: Number(row.reservation_state_version), status: row.status, capacity: capacityOf(row.capacity) }; }
function capacityOf(value) { if (!exact(value, ['total','reserved','remaining'])
    || !['total','reserved','remaining'].every((key) => Number.isSafeInteger(value[key]))
    || value.total < 1 || value.reserved < 0 || value.remaining < 0
    || value.total !== value.reserved + value.remaining) fail('S1_SPATIAL_CAPACITY_INVALID');
  return { total: value.total, reserved: value.reserved, remaining: value.remaining }; }
function text(value) { return typeof value === 'string' && value.length > 0 ? value : null; }
async function transaction(pool, work) { const client = await pool.connect(); try { await client.query('BEGIN'); const result = await work(client); await client.query('COMMIT'); return result; } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); } }
function deepFreeze(value) { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; }
function fail(code) { const error = new Error(code); error.code = code; throw error; }

async function lockAndValidateScope(client, partyId, envelope) {
  const result = await client.query(
    `SELECT b.state_version AS baseline_state_version,
            g5.state_version AS g5_state_version,
            g6.state_version AS g6_state_version,g6.source_scene_template_ref,
            p.state_version AS position_state_version
       FROM party_runtime.party_scene_baselines b
       JOIN party_runtime.party_g5_sites g5 ON g5.party_id=b.party_id
         AND b.host_kind='g5_site' AND b.host_id=g5.id
       JOIN party_runtime.party_g6_instances g6 ON g6.party_id=b.party_id
         AND g6.scene_baseline_id=b.id
       JOIN party_runtime.scene_position_nodes p ON p.party_id=b.party_id
         AND p.g6_instance_id=g6.id
      WHERE b.party_id=$1 AND b.id=$2 AND g5.id=$3 AND g6.id=$4 AND p.id=$5
        AND b.status='active' AND g5.status='active' AND g6.status='active'
        AND p.status='active' FOR UPDATE OF b,g5,g6,p`,
    [partyId, envelope.baseline_ref, envelope.g5_ref, envelope.g6_ref,
      envelope.position_ref]);
  const row = result.rows[0];
  if (result.rows.length !== 1
      || Number(row.baseline_state_version) !== envelope.baseline_state_version
      || Number(row.g5_state_version) !== envelope.g5_state_version
      || Number(row.g6_state_version) !== envelope.g6_state_version
      || Number(row.position_state_version) !== envelope.position_state_version
      || envelope.template_ref
        !== `sha256:${canonicalDigest(row.source_scene_template_ref)}`) {
    fail('S1_SPATIAL_SCOPE_STALE');
  }
}

function exact(value, keys) {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function dataFields(value, keys, code) {
  if (value == null || typeof value !== 'object' || Array.isArray(value)
      || Object.getPrototypeOf(value) !== Object.prototype
      || Object.getOwnPropertySymbols(value).length > 0
      || Object.keys(value).length !== keys.length) fail(code);
  const output = {};
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
    output[key] = descriptor.value;
  }
  return output;
}

function snapshot(value, code) {
  const seen = new WeakSet();
  const visit = (input) => {
    if (input === null || typeof input === 'string'
        || typeof input === 'boolean') return input;
    if (typeof input === 'number') {
      if (Number.isFinite(input)) return input;
      fail(code);
    }
    if (!input || typeof input !== 'object' || seen.has(input)
        || Object.getOwnPropertySymbols(input).length > 0
        || Object.getPrototypeOf(input)
          !== (Array.isArray(input) ? Array.prototype : Object.prototype)) {
      fail(code);
    }
    seen.add(input);
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const names = Object.keys(descriptors).filter((key) => key !== 'length');
    if (Array.isArray(input)
        && (names.length !== input.length
          || names.some((key, index) => key !== String(index)))) fail(code);
    const output = Array.isArray(input) ? [] : {};
    for (const key of names) {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail(code);
      if (Array.isArray(output)) output.push(visit(descriptor.value));
      else output[key] = visit(descriptor.value);
    }
    return output;
  };
  return visit(value);
}
