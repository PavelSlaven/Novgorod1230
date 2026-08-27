export function queryWithTurnDeadline(pool, query, turnBudget = null) {
  if (!hasActiveTurnDeadline(turnBudget)) return pool.query(query.text, query.values);
  return withTurnDeadlineTransaction(pool, turnBudget,
    (client) => client.query(query));
}

export function withTurnDeadlineQueryPool(pool, turnBudget = null) {
  if (!hasActiveTurnDeadline(turnBudget)) return pool;
  return Object.freeze({
    query(query, values) {
      return readQueryWithTurnDeadline(pool, typeof query === 'string'
        ? { text: query, values }
        : query, turnBudget);
    }
  });
}

function hasActiveTurnDeadline(turnBudget) {
  return typeof turnBudget?.remaining === 'function'
    && turnBudget.remaining() != null;
}

async function readQueryWithTurnDeadline(pool, query, turnBudget) {
  turnBudget.assertWithinDeadline();
  const { client, release } = await acquireWithinTurnDeadline(pool, turnBudget);
  let sessionTimeoutSet = false;
  let primaryError = null, cleanupError = null;
  try {
    await setSessionStatementTimeout(client, turnBudget);
    sessionTimeoutSet = true;
    turnBudget.assertWithinDeadline();
    const result = await client.query(query);
    turnBudget.assertWithinDeadline();
    return result;
  } catch (error) {
    primaryError = normalizeTurnDeadlineError(error, turnBudget);
    throw primaryError;
  } finally {
    if (sessionTimeoutSet) {
      try {
        await client.query('RESET statement_timeout');
      } catch (error) {
        cleanupError ??= error;
      }
    }
    try {
      release(cleanupError ?? undefined);
    } catch (error) {
      cleanupError ??= error;
    }
    if (primaryError == null && cleanupError != null) throw cleanupError;
  }
}

export async function withTurnDeadlineTransaction(pool, turnBudget, work,
  { commit = () => true } = {}) {
  turnBudget.assertWithinDeadline();
  const { client, release } = await acquireWithinTurnDeadline(pool, turnBudget);
  let transactionOpen = false, sessionTimeoutSet = false;
  let primaryError = null, cleanupError = null;
  const rollback = async () => {
    if (!transactionOpen) return null;
    transactionOpen = false;
    try {
      await client.query('ROLLBACK');
      return null;
    } catch (error) {
      return error;
    }
  };
  try {
    turnBudget.assertWithinDeadline();
    await setSessionStatementTimeout(client, turnBudget);
    sessionTimeoutSet = true;
    turnBudget.assertWithinDeadline();
    await client.query('BEGIN');
    transactionOpen = true;
    const result = await work(deadlineTransactionClient(client, turnBudget));
    if (!commit(result)) {
      const rollbackError = await rollback();
      if (rollbackError != null) {
        cleanupError = rollbackError;
        throw rollbackError;
      }
      return result;
    }
    await setLocalTimeouts(client, turnBudget);
    await client.query('COMMIT');
    transactionOpen = false;
    return result;
  } catch (error) {
    primaryError = normalizeTurnDeadlineError(error, turnBudget);
    cleanupError ??= await rollback();
    throw primaryError;
  } finally {
    if (sessionTimeoutSet) {
      try {
        await client.query('RESET statement_timeout');
      } catch (error) {
        cleanupError ??= error;
      }
    }
    try {
      release(cleanupError ?? undefined);
    } catch (error) {
      cleanupError ??= error;
    }
    if (primaryError == null && cleanupError != null) throw cleanupError;
  }
}

function deadlineTransactionClient(client, turnBudget) {
  return Object.freeze({
    async query(query, values) {
      await setLocalTimeouts(client, turnBudget);
      return typeof query === 'string'
        ? client.query(query, values)
        : client.query(query);
    }
  });
}

function acquireWithinTurnDeadline(pool, turnBudget) {
  const timeout = Math.max(1, Math.floor(turnBudget.remaining().deadline_ms));
  return new Promise((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      reject(acquisitionTimeout(turnBudget));
    }, timeout);
    pool.connect((error, client, done) => {
      const release = typeof done === 'function'
        ? (cause) => done(cause) : (cause) => client?.release(cause);
      if (timedOut) {
        release();
        return;
      }
      clearTimeout(timer);
      if (error) reject(error);
      else resolve({ client, release });
    });
  });
}

async function setSessionStatementTimeout(client, turnBudget) {
  turnBudget.assertWithinDeadline();
  const remaining = Math.max(1, Math.floor(turnBudget.remaining().deadline_ms));
  await client.query(`SET statement_timeout = ${remaining}`);
}

async function setLocalTimeouts(client, turnBudget) {
  turnBudget.assertWithinDeadline();
  const remaining = Math.max(1, Math.floor(turnBudget.remaining().deadline_ms));
  await client.query(
    "SELECT set_config('statement_timeout', $1, true), set_config('lock_timeout', $1, true)",
    [String(remaining)]
  );
}

function acquisitionTimeout(turnBudget) {
  const remaining = turnBudget.remaining();
  const error = new Error('Gameplay LLM turn budget is exhausted.');
  error.code = 'LLM_TURN_BUDGET_EXHAUSTED';
  error.deadline_exceeded = true;
  error.budget_exhausted = false;
  error.remaining_llm_budget_ms = remaining?.llm_budget_ms ?? 0;
  error.remaining_turn_deadline_ms = 0;
  return error;
}

function normalizeTurnDeadlineError(error, turnBudget) {
  if (error?.code === 'LLM_TURN_BUDGET_EXHAUSTED'
      || !isPostgresTurnDeadlineTimeout(error)) return error;
  return acquisitionTimeout(turnBudget);
}

function isPostgresTurnDeadlineTimeout(error) {
  return /canceling statement due to (?:statement|lock) timeout/iu
    .test(String(error?.message ?? ''));
}
