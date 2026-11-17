import type { Account } from './common/interfaces/journal.interface.js';
import type { ReplayResult } from './common/interfaces/report.interface.js';
import { createContainer } from './container.js';

/** Replay an event stream, in the order given, through a fresh ledger. */
export function run(accounts: readonly Account[], events: readonly unknown[]): ReplayResult {
  const { journal, authorizationStore, ledgerService, eventHandler } = createContainer(accounts);
  for (const event of events) eventHandler.handle(event);
  const reports = ledgerService.finish();
  return { reports, incidents: ledgerService.incidents(), journal, authorizationStore };
}
