import { describe, expect, it, vi } from 'vitest';
import { ErrorCode } from '../common/errors.js';
import type { ILedgerService } from '../common/interfaces/ledger.interface.js';
import { ACCOUNTS, EVENT_STREAM } from '../fixtures/scenario.js';
import { EventHandler } from './event.handler.js';

function setup() {
  const ledger = {
    post: vi.fn<ILedgerService['post']>(),
    authorize: vi.fn<ILedgerService['authorize']>(),
    settle: vi.fn<ILedgerService['settle']>(),
    reverse: vi.fn<ILedgerService['reverse']>(),
    reject: vi.fn<ILedgerService['reject']>(),
  } satisfies ILedgerService;
  return { ledger, handler: new EventHandler(ACCOUNTS, ledger) };
}

const findEvent = (eventId: string) =>
  EVENT_STREAM.find((rawEvent) => rawEvent.eventId === eventId);

describe('EventHandler routing', () => {
  it('routes all ten brief events with nothing rejected', () => {
    const { ledger, handler } = setup();
    for (const rawEvent of EVENT_STREAM) handler.handle(rawEvent);
    expect(ledger.post).toHaveBeenCalledTimes(5); // E1, E2, E4, E7, E10
    expect(ledger.authorize).toHaveBeenCalledTimes(2); // E3, E8
    expect(ledger.settle).toHaveBeenCalledTimes(2); // E5, E6
    expect(ledger.reverse).toHaveBeenCalledTimes(1); // E9
    expect(ledger.reject).not.toHaveBeenCalled();
  });

  it('E1: parses "1,200.00" to 120000 fils and resolves the account', () => {
    const { ledger, handler } = setup();
    handler.handle(findEvent('E1'));
    const cmd = ledger.post.mock.calls[0]?.[0];
    expect(cmd?.kind).toBe('CREDIT');
    expect(cmd?.parts.map((part) => part.minor)).toEqual([120000n]);
    expect(cmd?.account.accountId).toBe('ACC-001');
  });

  it('E10: slices BHD 10.000 into 3.333, 3.333, 3.334 (criterion 7)', () => {
    const { ledger, handler } = setup();
    handler.handle(findEvent('E10'));
    expect(ledger.post.mock.calls[0]?.[0].parts.map((part) => part.minor)).toEqual([
      3333n,
      3333n,
      3334n,
    ]);
  });

  it('E6: an unknown auth id is still routed to settle (the service decides, not the handler)', () => {
    const { ledger, handler } = setup();
    handler.handle(findEvent('E6'));
    expect(ledger.settle.mock.calls[0]?.[0].authId).toBe('Auth-Z');
  });
});

describe('EventHandler validation', () => {
  const base = {
    eventId: 'EX',
    day: 2,
    type: 'CREDIT',
    accountId: 'ACC-001',
    currency: 'AED',
    amount: '1.00',
    valueDay: 2,
  };

  it.each([
    ['unknown account', { ...base, accountId: 'ACC-999' }, ErrorCode.UNKNOWN_ACCOUNT],
    [
      'currency mismatch',
      { ...base, currency: 'BHD', amount: '1.000' },
      ErrorCode.CURRENCY_MISMATCH,
    ],
    ['too many decimals', { ...base, amount: '1.005' }, ErrorCode.INVALID_AMOUNT],
    ['zero amount', { ...base, amount: '0.00' }, ErrorCode.INVALID_AMOUNT],
    ['negative amount', { ...base, amount: '-5.00' }, ErrorCode.INVALID_AMOUNT],
    ['day outside window', { ...base, day: 7 }, ErrorCode.INVALID_EVENT],
    ['valueDay outside window', { ...base, valueDay: 0 }, ErrorCode.INVALID_EVENT],
    ['unknown type', { ...base, type: 'TRANSFER' }, ErrorCode.INVALID_EVENT],
    ['unsupported currency', { ...base, currency: 'USD' }, ErrorCode.INVALID_EVENT],
    ['numeric amount', { ...base, amount: 1 }, ErrorCode.INVALID_EVENT],
    ['bad instalments', { ...base, instalments: 0 }, ErrorCode.INVALID_EVENT],
    ['missing authId', { ...base, type: 'AUTHORIZATION' }, ErrorCode.INVALID_EVENT],
  ])('rejects %s without routing it', (_name, input, code) => {
    const { ledger, handler } = setup();
    handler.handle(input);
    expect(ledger.reject).toHaveBeenCalledTimes(1);
    expect(ledger.reject.mock.calls[0]?.[0].code).toBe(code);
    expect(ledger.post).not.toHaveBeenCalled();
    expect(ledger.authorize).not.toHaveBeenCalled();
  });

  it('rejects a non-object without throwing', () => {
    const { ledger, handler } = setup();
    expect(() => handler.handle(null)).not.toThrow();
    expect(ledger.reject.mock.calls[0]?.[0].code).toBe(ErrorCode.INVALID_EVENT);
  });
});
