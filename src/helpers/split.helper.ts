import { ErrorCode, LedgerError } from '../common/errors.js';
import type { Money } from '../common/interfaces/money.interface.js';
import { money } from './money.helper.js';

/**
 * Slice an amount into `partCount` instalments that sum exactly to the total.
 * Every part gets floor(total / partCount); the remainder minor units go to the LAST parts,
 * one unit each. BHD 10.000 / 3 -> [3.333, 3.333, 3.334].
 */
export function splitEvenly(total: Money, partCount: number): Money[] {
  if (!Number.isInteger(partCount) || partCount < 1) {
    throw new LedgerError(
      `partCount must be a positive integer, got ${partCount}`,
      ErrorCode.INVALID_AMOUNT,
    );
  }
  if (total.minor < 0n) {
    throw new LedgerError('cannot split a negative amount', ErrorCode.INVALID_AMOUNT);
  }
  const partCountBig = BigInt(partCount);
  const basePartMinor = total.minor / partCountBig;
  const remainderUnits = Number(total.minor % partCountBig);
  const firstPartWithExtraUnit = partCount - remainderUnits;
  return Array.from({ length: partCount }, (_, partIndex) =>
    money(total.currency, basePartMinor + (partIndex >= firstPartWithExtraUnit ? 1n : 0n)),
  );
}
