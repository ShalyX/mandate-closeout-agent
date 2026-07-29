import crypto from "node:crypto";
import { neon } from "@neondatabase/serverless";

const AUTHORIZATION_STATUSES = new Set([
  "armed",
  "waiting",
  "paused",
  "running",
  "retrying",
  "blocked",
  "completed",
  "expired",
  "revoked",
]);

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
    initialized ??= (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS mandate_executions (
          vault TEXT NOT NULL,
          owner_address TEXT NOT NULL,
          action_key TEXT NOT NULL,
          execution_id TEXT NOT NULL,
          status TEXT NOT NULL,
          idempotency_key TEXT NOT NULL,
          transaction_hash TEXT,
          attempt_count INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (vault, action_key),
          UNIQUE (execution_id)
        )
      `;
      await sql`
        ALTER TABLE mandate_executions
        ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 1
      `;
      await Promise.all([
        sql`
        CREATE TABLE IF NOT EXISTS mandate_rate_limits (
          subject TEXT NOT NULL,
          window_bucket BIGINT NOT NULL,
          hits INTEGER NOT NULL DEFAULT 1,
          PRIMARY KEY (subject, window_bucket)
        )
        `,
        sql`
        CREATE TABLE IF NOT EXISTS mandate_authorizations (
          vault TEXT PRIMARY KEY,
          owner_address TEXT NOT NULL,
          chain_id BIGINT NOT NULL,
          issued_at BIGINT NOT NULL,
          valid_until BIGINT NOT NULL,
          nonce TEXT NOT NULL,
          signature TEXT NOT NULL,
          status TEXT NOT NULL,
          last_action TEXT,
          last_execution_id TEXT,
          last_error_code TEXT,
          lease_token TEXT,
          leased_until TIMESTAMPTZ,
          next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
        `,
      ]);
    })();
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
        SELECT execution_id, status, transaction_hash, attempt_count
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
            attemptCount: Number(row.attempt_count ?? 1),
          }
        : null;
    },

    async saveExecution(record) {
      await initialize();
      await sql`
        INSERT INTO mandate_executions (
          vault, owner_address, action_key, execution_id, status, idempotency_key,
          attempt_count
        ) VALUES (
          ${record.vault.toLowerCase()},
          ${record.owner.toLowerCase()},
          ${record.action},
          ${record.executionId},
          ${record.status},
          ${record.idempotencyKey},
          ${record.attemptCount ?? 1}
        )
        ON CONFLICT (vault, action_key) DO UPDATE SET
          execution_id = EXCLUDED.execution_id,
          status = EXCLUDED.status,
          idempotency_key = EXCLUDED.idempotency_key,
          attempt_count = EXCLUDED.attempt_count,
          transaction_hash = NULL,
          updated_at = NOW()
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

    async saveAuthorization(record) {
      if (!AUTHORIZATION_STATUSES.has(record.status)) {
        throw new Error("Invalid authorization status");
      }
      await initialize();
      await sql`
        INSERT INTO mandate_authorizations (
          vault, owner_address, chain_id, issued_at, valid_until,
          nonce, signature, status
        ) VALUES (
          ${record.vault.toLowerCase()},
          ${record.owner.toLowerCase()},
          ${record.chainId},
          ${record.issuedAt},
          ${record.validUntil},
          ${record.nonce},
          ${record.signature},
          ${record.status}
        )
        ON CONFLICT (vault) DO UPDATE SET
          owner_address = EXCLUDED.owner_address,
          chain_id = EXCLUDED.chain_id,
          issued_at = EXCLUDED.issued_at,
          valid_until = EXCLUDED.valid_until,
          nonce = EXCLUDED.nonce,
          signature = EXCLUDED.signature,
          status = EXCLUDED.status,
          last_error_code = NULL,
          lease_token = NULL,
          leased_until = NULL,
          next_attempt_at = NOW(),
          updated_at = NOW()
      `;
    },

    async claimAuthorizations({ limit = 5, leaseSeconds = 45 } = {}) {
      await initialize();
      const leaseToken = crypto.randomUUID();
      const rows = await sql`
        WITH candidates AS (
          SELECT vault
          FROM mandate_authorizations
          WHERE status NOT IN ('completed', 'expired', 'revoked', 'blocked')
            AND next_attempt_at <= NOW()
            AND (leased_until IS NULL OR leased_until < NOW())
          ORDER BY next_attempt_at, created_at
          FOR UPDATE SKIP LOCKED
          LIMIT ${limit}
        )
        UPDATE mandate_authorizations AS auth
        SET lease_token = ${leaseToken},
            leased_until = NOW() + (${leaseSeconds} * INTERVAL '1 second'),
            updated_at = NOW()
        FROM candidates
        WHERE auth.vault = candidates.vault
        RETURNING auth.*
      `;
      return rows.map((row) => ({
        scope: "autonomous-closeout",
        vault: row.vault,
        owner: row.owner_address,
        chainId: Number(row.chain_id),
        issuedAt: Number(row.issued_at),
        validUntil: Number(row.valid_until),
        nonce: row.nonce,
        signature: row.signature,
        leaseToken: row.lease_token,
      }));
    },

    async releaseAuthorization(vault, leaseToken, update) {
      if (!AUTHORIZATION_STATUSES.has(update.status)) {
        throw new Error("Invalid authorization status");
      }
      await initialize();
      const retryDelay = update.status === "retrying" ? 60 : 15;
      await sql`
        UPDATE mandate_authorizations
        SET status = ${update.status},
            last_action = COALESCE(${update.lastAction ?? null}, last_action),
            last_execution_id = COALESCE(${update.executionId ?? null}, last_execution_id),
            last_error_code = ${update.errorCode ?? null},
            lease_token = NULL,
            leased_until = NULL,
            next_attempt_at = NOW() + (${retryDelay} * INTERVAL '1 second'),
            updated_at = NOW()
        WHERE vault = ${vault.toLowerCase()}
          AND lease_token = ${leaseToken}
      `;
    },

    async getAuthorizationStatus(vault) {
      await initialize();
      const rows = await sql`
        SELECT vault, owner_address, status, valid_until, last_action,
               last_execution_id, last_error_code, updated_at
        FROM mandate_authorizations
        WHERE vault = ${vault.toLowerCase()}
        LIMIT 1
      `;
      const row = rows[0];
      return row
        ? {
            vault: row.vault,
            owner: row.owner_address,
            status: row.status,
            validUntil: Number(row.valid_until),
            lastAction: row.last_action,
            executionId: row.last_execution_id,
            errorCode: row.last_error_code,
            updatedAt:
              row.updated_at instanceof Date
                ? row.updated_at.toISOString()
                : row.updated_at,
          }
        : null;
    },

    async revokeAuthorization(vault, owner) {
      await initialize();
      const rows = await sql`
        UPDATE mandate_authorizations
        SET status = 'revoked',
            lease_token = NULL,
            leased_until = NULL,
            updated_at = NOW()
        WHERE vault = ${vault.toLowerCase()}
          AND owner_address = ${owner.toLowerCase()}
          AND status NOT IN ('completed', 'expired', 'revoked')
        RETURNING vault
      `;
      return rows.length === 1;
    },
  };
}
