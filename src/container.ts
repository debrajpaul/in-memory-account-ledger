import type { Account } from './common/interfaces/journal.interface.js';
import { EventHandler } from './handlers/event.handler.js';
import { AuthorizationService } from './services/authorization.service.js';
import { FeeService } from './services/fee.service.js';
import { InterestService } from './services/interest.service.js';
import { LedgerService } from './services/ledger.service.js';
import { ReversalService } from './services/reversal.service.js';
import { AuthorizationStore } from './stores/authorization.store.js';
import { JournalStore } from './stores/journal.store.js';

/** The one wiring point: every store, service and handler is created here and nowhere else. */
export function createContainer(accounts: readonly Account[]) {
  const journal = new JournalStore();
  const authorizationStore = new AuthorizationStore();

  const authorizationService = new AuthorizationService(journal, authorizationStore);
  const reversalService = new ReversalService(journal);
  const feeService = new FeeService(journal);
  const interestService = new InterestService(journal);

  const ledgerService = new LedgerService(
    accounts,
    journal,
    authorizationStore,
    authorizationService,
    reversalService,
    feeService,
    interestService,
  );
  const eventHandler = new EventHandler(accounts, ledgerService);

  return { journal, authorizationStore, ledgerService, eventHandler };
}
