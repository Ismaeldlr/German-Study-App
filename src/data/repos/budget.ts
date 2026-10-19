import type { BudgetGuard } from '@/llm/types';

import type { DbOrTx } from '../db';
import { getSetting } from './settings';
import { monthToDate } from './usage';

/**
 * Blocks calls once this month's spend reaches the cap, and blocks any call
 * whose worst-case cost would take the spend past it.
 */
export function createBudgetGuard(db: DbOrTx, now: () => Date = () => new Date()): BudgetGuard {
  return {
    check(estimatedCost) {
      const cap = getSetting(db, 'llm.monthlyCap');
      const spent = monthToDate(db, now()).cost;
      if (spent >= cap || spent + estimatedCost > cap) return { allowed: false, spent, cap };
      return { allowed: true };
    },
  };
}
