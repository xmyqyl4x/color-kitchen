import type { ClientBase } from 'pg';

type Reservation = Readonly<{
  bucket: 'service' | 'provider';
  units: number;
  limit: number;
  windowSeconds: number;
  now: Date;
}>;

export type GuideBudget = Pick<ReturnType<typeof postgresGuideBudget>, 'reserve'>;

export function postgresGuideBudget(client: ClientBase) {
  return {
    async reserve({ bucket, units, limit, windowSeconds, now }: Reservation) {
      const time = now.getTime();
      if (!Number.isSafeInteger(units) || units < 1 || units > 1e9 || !Number.isSafeInteger(limit) || limit < 0 ||
          limit > 1e9 || !Number.isSafeInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 86400 ||
          !Number.isFinite(time)) {
        throw new RangeError('Invalid Guide budget reservation.');
      }
      const windowMs = windowSeconds * 1000;
      const windowStart = new Date(Math.floor(time / windowMs) * windowMs);
      const retryAt = new Date(windowStart.getTime() + windowMs);
      if (units > limit) return { accepted: false, retryAt };
      const { rowCount } = await client.query(`
        INSERT INTO ck.guide_budget (bucket, window_start, window_end, used)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (bucket, window_start, window_end) DO UPDATE
          SET used = ck.guide_budget.used + EXCLUDED.used
          WHERE ck.guide_budget.used + EXCLUDED.used <= $5
        RETURNING used
      `, [bucket, windowStart, retryAt, units, limit]);
      return { accepted: rowCount === 1, retryAt };
    },
  };
}

export async function purgeGuideBudget(client: ClientBase, cutoff: Date, max = 100) {
  if (!Number.isInteger(max) || max < 1 || max > 1000) throw new RangeError('Invalid budget purge size.');
  const { rowCount } = await client.query(`
    DELETE FROM ck.guide_budget AS row USING (
      SELECT bucket, window_start, window_end FROM ck.guide_budget WHERE window_end <= $1
      ORDER BY window_end, bucket, window_start LIMIT $2 FOR UPDATE SKIP LOCKED
    ) AS due WHERE (row.bucket, row.window_start, row.window_end) = (due.bucket, due.window_start, due.window_end)
  `, [cutoff, max]);
  return rowCount ?? 0;
}
