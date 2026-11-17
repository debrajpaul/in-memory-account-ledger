import { describe, expect, it } from 'vitest';
import { parseMoney } from './money.helper.js';
import { splitEvenly } from './split.helper.js';

describe('splitEvenly', () => {
  it('BHD 10.000 / 3 -> 3.333, 3.333, 3.334 and sums exactly', () => {
    const parts = splitEvenly(parseMoney('BHD', '10.000'), 3);
    expect(parts.map((part) => part.minor)).toEqual([3333n, 3333n, 3334n]);
    expect(parts.reduce((sum, part) => sum + part.minor, 0n)).toBe(10000n);
  });

  it('3 x 3.334 would overshoot by 0.002 (why acceptance criterion 7 is refused)', () => {
    expect(3n * 3334n).toBe(10002n);
  });

  it('an exact split has no remainder', () => {
    expect(splitEvenly(parseMoney('AED', '9.00'), 3).map((part) => part.minor)).toEqual([
      300n,
      300n,
      300n,
    ]);
  });

  it('refuses zero parts and negative totals', () => {
    expect(() => splitEvenly(parseMoney('AED', '1.00'), 0)).toThrow();
    expect(() => splitEvenly(parseMoney('AED', '-1.00'), 2)).toThrow();
  });
});
