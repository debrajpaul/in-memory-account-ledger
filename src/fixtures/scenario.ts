import type { RawEvent } from '../common/interfaces/event.interface.js';
import type { Account } from '../common/interfaces/journal.interface.js';

/** The brief's accounts. */
export const ACCOUNTS: readonly Account[] = [
  { accountId: 'ACC-001', currency: 'AED', opening: { currency: 'AED', minor: 0n } },
  { accountId: 'ACC-002', currency: 'BHD', opening: { currency: 'BHD', minor: 0n } },
];

/**
 * The brief's event stream, in the brief's replay order. E10 (Day 5) comes after E9 (Day 6):
 * it is kept in that position on purpose (see AMBIGUITIES.md).
 */
export const EVENT_STREAM: readonly RawEvent[] = [
  {
    eventId: 'E1',
    day: 1,
    type: 'CREDIT',
    accountId: 'ACC-001',
    currency: 'AED',
    amount: '1,200.00',
    valueDay: 1,
  },
  {
    eventId: 'E2',
    day: 1,
    type: 'DEBIT',
    accountId: 'ACC-001',
    currency: 'AED',
    amount: '950.00',
    valueDay: 1,
  },
  {
    eventId: 'E3',
    day: 2,
    type: 'AUTHORIZATION',
    accountId: 'ACC-001',
    authId: 'Auth-A',
    currency: 'AED',
    amount: '200.00',
    valueDay: 2,
  },
  {
    eventId: 'E4',
    day: 3,
    type: 'CREDIT',
    accountId: 'ACC-001',
    currency: 'AED',
    amount: '400.00',
    valueDay: 3,
  },
  {
    eventId: 'E5',
    day: 4,
    type: 'SETTLEMENT',
    accountId: 'ACC-001',
    authId: 'Auth-A',
    currency: 'AED',
    amount: '185.00',
    valueDay: 4,
  },
  {
    eventId: 'E6',
    day: 4,
    type: 'SETTLEMENT',
    accountId: 'ACC-001',
    authId: 'Auth-Z',
    currency: 'AED',
    amount: '180.00',
    valueDay: 4,
  },
  {
    eventId: 'E7',
    day: 5,
    type: 'DEBIT',
    accountId: 'ACC-001',
    currency: 'AED',
    amount: '620.00',
    valueDay: 2,
  },
  {
    eventId: 'E8',
    day: 5,
    type: 'AUTHORIZATION',
    accountId: 'ACC-001',
    authId: 'Auth-B',
    currency: 'AED',
    amount: '90.00',
    valueDay: 5,
  },
  {
    eventId: 'E9',
    day: 6,
    type: 'REVERSAL',
    accountId: 'ACC-001',
    targetEventId: 'E7',
    valueDay: 2,
  },
  {
    eventId: 'E10',
    day: 5,
    type: 'CREDIT',
    accountId: 'ACC-002',
    currency: 'BHD',
    amount: '10.000',
    instalments: 3,
    valueDay: 5,
  },
];
