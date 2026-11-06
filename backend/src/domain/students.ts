import type { UserStatus } from '../types/domain.js';

/**
 * Students who may join classes and receive work. `invited` counts: the account exists
 * and can log in with its temporary password; it only has not changed it yet.
 * Locked and disabled accounts are excluded.
 */
export function isEnrollableStatus(status: UserStatus): boolean {
  return status === 'active' || status === 'invited';
}
