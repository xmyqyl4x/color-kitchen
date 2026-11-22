import type { Pool } from 'pg';
import { inTransaction } from '../db/transaction.js';
import { postgresGuideBudget } from '../operations/budget.js';
import type { GuideAdmission } from './service.js';

type Limit = Readonly<{ limit: number; windowSeconds: number }>;
class BudgetDenied extends Error {
  constructor(public readonly retryAt: Date) { super('Guide capacity is reserved.'); }
}

export function postgresGuideAdmission(pool: Pick<Pool, 'connect'>, limits: { burst: Limit; provider: Limit }): GuideAdmission {
  return {
    async reserve(units, now) {
      const client = await pool.connect();
      try {
        return await inTransaction(client, async () => {
          const budget = postgresGuideBudget(client);
          const burst = await budget.reserve({ bucket: 'service', units: 1, now, ...limits.burst });
          if (!burst.accepted) throw new BudgetDenied(burst.retryAt);
          const provider = await budget.reserve({ bucket: 'provider', units, now, ...limits.provider });
          if (!provider.accepted) throw new BudgetDenied(provider.retryAt);
          return { accepted: true };
        });
      } catch (error) {
        if (error instanceof BudgetDenied) return { accepted: false, retryAt: error.retryAt };
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
