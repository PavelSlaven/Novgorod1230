const text = (value) => typeof value === 'string' && value.trim().length > 0;

function rowsFrom(result) {
  return Array.isArray(result?.rows) ? result.rows : [];
}

/** Read-only D-1 schedule rows for a place family from world_base. */
export async function loadScheduleRoutineRules({
  worldBaseReader,
  worldRevisionId,
  placeFamilyId,
  season,
  month,
} = {}) {
  if (!worldBaseReader || typeof worldBaseReader.read !== 'function') {
    throw new TypeError('worldBaseReader.read is required.');
  }
  if (![worldRevisionId, placeFamilyId, season].every(text)) {
    throw new TypeError('worldRevisionId, placeFamilyId and season are required.');
  }
  const params = [worldRevisionId, placeFamilyId, season];
  let monthClause = '';
  if (month !== undefined && month !== null) {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new TypeError('month must be an integer from 1 to 12.');
    }
    monthClause = ' AND (months IS NULL OR $4 = ANY(months))';
    params.push(month);
  }
  const result = await worldBaseReader.read(
    `SELECT schedule_id, schedule_version, world_revision_id, scope_kind, scope_ref,
      subject_kind, subject_ref, season, months, day_type, routine_profile, status,
      confidence, provenance_ref, authoring_payload
     FROM world_base.npc_schedule_routine_rules
     WHERE world_revision_id = $1 AND scope_ref = $2 AND season = $3
       AND status = 'approved'${monthClause}
     ORDER BY schedule_id, schedule_version`,
    params,
  );
  return rowsFrom(result).map((row) => ({
    ...row,
    routine_profile: structuredClone(row.routine_profile),
    authoring_payload: structuredClone(row.authoring_payload ?? {}),
  }));
}

/** Read-only D-2 composition for a place family from world_base. */
export async function loadPlacePopulationComposition({
  worldBaseReader,
  worldRevisionId,
  placeFamilyId,
} = {}) {
  if (!worldBaseReader || typeof worldBaseReader.read !== 'function') {
    throw new TypeError('worldBaseReader.read is required.');
  }
  if (![worldRevisionId, placeFamilyId].every(text)) {
    throw new TypeError('worldRevisionId and placeFamilyId are required.');
  }
  const result = await worldBaseReader.read(
    `SELECT composition_id, composition_version, world_revision_id, place_family_id,
      place_family_version, population_groups, scheduled_absences, empty_reason, status,
      confidence, provenance_ref, authoring_payload
     FROM world_base.place_population_composition_rules
     WHERE world_revision_id = $1 AND place_family_id = $2 AND status = 'approved'
     ORDER BY composition_version DESC, composition_id
     LIMIT 2`,
    [worldRevisionId, placeFamilyId],
  );
  const rows = rowsFrom(result);
  if (rows.length > 1) {
    throw new Error('ambiguous_approved_place_population_composition');
  }
  if (!rows.length) return null;
  const row = rows[0];
  return {
    population_groups: structuredClone(row.population_groups ?? []),
    scheduled_absences: structuredClone(row.scheduled_absences ?? []),
    empty_reason: row.empty_reason ?? null,
    slot_relationships: structuredClone(row.authoring_payload?.slot_relationships ?? []),
    composition_ref: {
      id: row.composition_id,
      version: row.composition_version,
      world_revision_id: row.world_revision_id,
    },
  };
}
