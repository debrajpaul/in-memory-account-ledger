import { describe, expect, it } from 'vitest';
import { applyRate, divRoundHalfEven, formatMoney, money, parseMoney } from './money.helper.js';

describe('parseMoney', () => {
  it('stores AED in 2dp minor units and BHD in 3dp minor units', () => {
    expect(parseMoney('AED', '1,200.00').minor).toBe(120000n);
    expect(parseMoney('BHD', '10.000').minor).toBe(10000n);
    expect(parseMoney('BHD', '10').minor).toBe(10000n);
  });

  it('refuses more decimals than the currency allows instead of rounding', () => {
    expect(() => parseMoney('AED', '1.005')).toThrow(/2 decimals/);
  });

  it('refuses non-numeric input', () => {
    expect(() => parseMoney('AED', '12a')).toThrow(/Not a decimal/);
  });
});

describe('formatMoney', () => {
  it('prints to the currency precision', () => {
    expect(formatMoney(money('AED', -37000n))).toBe('AED -370.00');
    expect(formatMoney(money('BHD', 10008n))).toBe('BHD 10.008');
    expect(formatMoney(money('AED', 5n))).toBe('AED 0.05');
  });
});

describe('divRoundHalfEven', () => {
  it('rounds exact halves to the even neighbour', () => {
    expect(divRoundHalfEven(5n, 2n)).toBe(2n);
    expect(divRoundHalfEven(7n, 2n)).toBe(4n);
    expect(divRoundHalfEven(-5n, 2n)).toBe(-2n);
  });

  it('rounds non-halves to the nearest unit', () => {
    expect(divRoundHalfEven(1140n, 1000n)).toBe(1n); // 1.14 -> 1
    expect(divRoundHalfEven(1600n, 1000n)).toBe(2n); // 1.6 -> 2
    expect(divRoundHalfEven(-1600n, 1000n)).toBe(-2n);
  });
});

describe('applyRate', () => {
  const daily = { numerator: 4n, denominator: 10_000n };
  it('AED 285.00 at 0.04% = 0.114 -> AED 0.11', () => {
    expect(applyRate(parseMoney('AED', '285.00'), daily).minor).toBe(11n);
  });
  it('BHD 10.000 at 0.04% = BHD 0.004 exactly', () => {
    expect(applyRate(parseMoney('BHD', '10.000'), daily).minor).toBe(4n);
  });
});
