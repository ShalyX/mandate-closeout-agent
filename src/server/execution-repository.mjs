import { neon } from "@neondatabase/serverless";

export function createExecutionRepository({
  connectionString =
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL ??
    process.env.NEON_DATABASE_URL,
  sql = connectionString ? neon(connectionString) : undefined,
} = {}) {
  if (!sql) throw new Error("A Postgres connection URL is required");
  let initialized;

  const initialize = () => {
    initialized ??= Promise.all([
      sql`
        CREATE TABLE IF NOT EXISTS mandate_executions (
          vault TEXT NOT NULL,
          owner_address TEXT NOT NULL,
          action_key TEXT NOT NULL,
          execution_id TEXT NOT NULL,
          status TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          transaction_hash TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (vault, action_key),
          UNIQUE (execution_id)
        )
      `,
      sql`
        CREATE TABLE IF NOT EXISTS mandate_rate_limits (
          subject TEXT NOT NULL,
          window_bucket BIGINT NOT NULL,
          hits INTEGER NOT NULL DEFAULT 1,
          PRIMARY KEY (subject, window_bucket)
        )
      `,
    ]);
    return initialized;
  };

  return {
    async ping() {
      await initialize();
      await sql`SELECT 1`;
      return true;
    },

    async findExecution(vault, action) {
      await initialize();
      const rows = await sql`
        SELECT execution_id, status, transaction_hash
        FROM mandate_executions
        WHERE vault = ${vault.toLowerCase()} AND action_key = ${action}
        LIMIT 1
      `;
      const row = rows[0];
      return row
        ? {
            executionId: row.execution_id,
            status: row.status,
            transactionHash: row.transaction_hash,
          }
        : null;
    },

    async saveExecution(record) {
      await initialize();
      await sql`
        INSERT INTO mandate_executions (
          vault, owner_address, action_key, execution_id, status, idempotency_key
        ) VALUES (
          ${record.vault.toLowerCase()},
          ${record.owner.toLowerCase()},
          ${record.action},
          ${record.executionId},
          ${record.status},
          ${record.idempotencyKey}
        )
        ON CONFLICT (vault, action_key) DO NOTHING
      `;
    },

    async updateExecution(execution) {
      await initialize();
      await sql`
        UPDATE mandate_executions
        SET status = ${execution.status},
            transaction_hash = ${execution.transactionHash ?? null},
            updated_at = NOW()
        WHERE execution_id = ${execution.executionId}
      `;
    },

    async takeRateLimit(subject, { limit, windowSeconds, now = Date.now() }) {
      await initialize();
      const bucket = Math.floor(now / 1_000 / windowSeconds);
      const rows = await sql`
        INSERT INTO mandate_rate_limits (subject, window_bucket, hits)
        VALUES (${subject}, ${bucket}, 1)
        ON CONFLICT (subject, window_bucket)
        DO UPDATE SET hits = mandate_rate_limits.hits + 1
        RETURNING hits
      `;
      return Number(rows[0].hits) <= limit;
    },
  };
}
