import { ErrorCode, LedgerError } from '../common/errors.js';
import type { Money } from '../common/interfaces/money.interface.js';
import { money } from './money.helper.js';

/**
 * Slice an amount into `parts` instalments that sum exactly to the total.
 * Every part gets floor(total / parts); the remainder minor units go to the LAST parts,
 * one unit each. BHD 10.000 / 3 -> [3.333, 3.333, 3.334].
 */
export function splitEvenly(total: Money, parts: number): Money[] {
  if (!Number.isInteger(parts) || parts < 1) {
    throw new LedgerError(
      `parts must be a positive integer, got ${parts}`,
      ErrorCode.INVALID_AMOUNT,
    );
  }
  if (total.minor < 0n) {
    throw new LedgerError('cannot split a negative amount', ErrorCode.INVALID_AMOUNT);
  }
  const n = BigInt(parts);
  const base = total.minor / n;
  const remainder = Number(total.minor % n);
  return Array.from({ length: parts }, (_, i) =>
    money(total.currency, base + (i >= parts - remainder ? 1n : 0n)),
  );
}
