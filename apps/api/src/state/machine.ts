// P0-2 — Ticket lifecycle state machine.
//
// ONE authoritative, pure transition function. Every status change in the codebase
// MUST go through transition(). Illegal transitions are impossible: they return an
// error rather than mutating anything.
//
// Legal transitions (PRD §5 P0-2), exactly these:
//   new     → ai       (eva_pickup)
//   new     → human    (claim)
//   ai      → handoff  (handoff)
//   ai      → done     (resolve)
//   handoff → human    (claim)
//   human   → done     (resolve)
//   done    → human    (reopen, within 7 days)
//   done    → closed   (close, auto after 7 days)
// `closed` is terminal.

export type Status = 'new' | 'ai' | 'handoff' | 'human' | 'done' | 'closed';

export type EventType = 'eva_pickup' | 'claim' | 'handoff' | 'resolve' | 'reopen' | 'close';

export type TicketEvent =
  | { type: 'eva_pickup' }
  | { type: 'claim'; userId: string }
  | { type: 'handoff'; reason: string }
  | { type: 'resolve'; at?: Date }
  | { type: 'reopen'; now?: Date }
  | { type: 'close' };

/** The subset of ticket fields the state machine reads and writes. */
export interface TicketState {
  status: Status;
  assigneeUserId: string | null;
  handoffReason: string | null;
  resolvedAt: Date | null;
}

export type TransitionOk = { ok: true; ticket: TicketState };
export type TransitionErr = { ok: false; error: { code: string; message: string } };
export type TransitionResult = TransitionOk | TransitionErr;

export const REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Explicit transition table: from-status → event → to-status. */
const TABLE: Record<Status, Partial<Record<EventType, Status>>> = {
  new: { eva_pickup: 'ai', claim: 'human' },
  ai: { handoff: 'handoff', resolve: 'done' },
  handoff: { claim: 'human' },
  human: { resolve: 'done' },
  done: { reopen: 'human', close: 'closed' },
  closed: {},
};

/** Flat list of every legal (from, event, to) triple — used by tests + docs. */
export const LEGAL_TRANSITIONS: Array<{ from: Status; event: EventType; to: Status }> = (
  Object.entries(TABLE) as Array<[Status, Partial<Record<EventType, Status>>]>
).flatMap(([from, events]) =>
  (Object.entries(events) as Array<[EventType, Status]>).map(([event, to]) => ({ from, event, to })),
);

export const ALL_STATUSES: Status[] = ['new', 'ai', 'handoff', 'human', 'done', 'closed'];
export const ALL_EVENT_TYPES: EventType[] = [
  'eva_pickup',
  'claim',
  'handoff',
  'resolve',
  'reopen',
  'close',
];

/**
 * Pure lifecycle transition. Returns a NEW TicketState on success, or an error
 * describing why the transition is illegal. Never mutates its input.
 */
export function transition(ticket: TicketState, event: TicketEvent): TransitionResult {
  const to = TABLE[ticket.status][event.type];
  if (!to) {
    return {
      ok: false,
      error: {
        code: 'illegal_transition',
        message: `Cannot apply "${event.type}" to a ticket in status "${ticket.status}"`,
      },
    };
  }

  // --- guards ---
  if (event.type === 'reopen') {
    const now = event.now ?? new Date();
    if (!ticket.resolvedAt) {
      return {
        ok: false,
        error: { code: 'reopen_no_resolved_at', message: 'Cannot reopen a ticket with no resolvedAt' },
      };
    }
    if (now.getTime() - ticket.resolvedAt.getTime() > REOPEN_WINDOW_MS) {
      return {
        ok: false,
        error: {
          code: 'reopen_window_expired',
          message: 'Reopen window (7 days) has expired; create a new ticket instead',
        },
      };
    }
  }

  // --- build next state (immutably) ---
  const next: TicketState = {
    status: to,
    assigneeUserId: ticket.assigneeUserId,
    handoffReason: ticket.handoffReason,
    resolvedAt: ticket.resolvedAt,
  };

  switch (event.type) {
    case 'claim':
      next.assigneeUserId = event.userId;
      break;
    case 'handoff':
      next.handoffReason = event.reason;
      break;
    case 'resolve':
      next.resolvedAt = event.at ?? new Date();
      break;
    case 'reopen':
      next.resolvedAt = null;
      break;
    case 'eva_pickup':
    case 'close':
      break;
  }

  return { ok: true, ticket: next };
}

/** Convenience: is (from, event) a legal transition? */
export function canTransition(from: Status, event: EventType): boolean {
  return Boolean(TABLE[from][event]);
}
