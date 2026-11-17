import type { ErrorCode } from '../errors.js';
import type { Day, Entry } from './journal.interface.js';

export interface ReverseRequest {
  /** The line to reverse; undefined when the referenced event was never booked. */
  readonly target: Entry | undefined;
  readonly valueDay: Day;
  readonly bookedDay: Day;
  readonly sourceId: string;
}

export type ReverseResult =
  | { readonly ok: true; readonly entry: Entry }
  | { readonly ok: false; readonly code: ErrorCode; readonly message: string };

export interface IReversalService {
  reverse(req: ReverseRequest): ReverseResult;
}
