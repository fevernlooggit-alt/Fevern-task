import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  transition,
  canTransition,
  LEGAL_TRANSITIONS,
  ALL_STATUSES,
  ALL_EVENT_TYPES,
  type EventType,
  type Status,
  type TicketEvent,
  type TicketState,
} from '../src/state/machine.js';

function stateIn(status: Status): TicketState {
  return {
    status,
    assigneeUserId: null,
    handoffReason: null,
    // give `done` a fresh resolvedAt so reopen is within the 7-day window
    resolvedAt: status === 'done' ? new Date() : null,
  };
}

function eventOf(type: EventType): TicketEvent {
  switch (type) {
    case 'claim':
      return { type: 'claim', userId: 'u1' };
    case 'handoff':
      return { type: 'handoff', reason: 'manual' };
    case 'resolve':
      return { type: 'resolve', at: new Date() };
    case 'reopen':
      return { type: 'reopen', now: new Date() };
    case 'eva_pickup':
      return { type: 'eva_pickup' };
    case 'close':
      return { type: 'close' };
  }
}

describe('state machine — legal transitions', () => {
  it('has exactly the 8 PRD transitions', () => {
    expect(LEGAL_TRANSITIONS).toHaveLength(8);
  });

  for (const { from, event, to } of LEGAL_TRANSITIONS) {
    it(`${from} --${event}--> ${to}`, () => {
      const res = transition(stateIn(from), eventOf(event));
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.ticket.status).toBe(to);
    });
  }

  it('claim records the assignee', () => {
    const res = transition(stateIn('handoff'), { type: 'claim', userId: 'agent-7' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.ticket.assigneeUserId).toBe('agent-7');
  });

  it('handoff records the reason', () => {
    const res = transition(stateIn('ai'), { type: 'handoff', reason: 'low_confidence:41%' });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.ticket.handoffReason).toBe('low_confidence:41%');
  });

  it('resolve sets resolvedAt', () => {
    const at = new Date();
    const res = transition(stateIn('human'), { type: 'resolve', at });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.ticket.resolvedAt).toEqual(at);
  });

  it('reopen clears resolvedAt', () => {
    const res = transition(stateIn('done'), { type: 'reopen', now: new Date() });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.ticket.resolvedAt).toBeNull();
  });
});

describe('state machine — illegal transitions', () => {
  // Every (from, event) pair that is NOT in the table must be rejected.
  const illegal: Array<[Status, EventType]> = [];
  for (const from of ALL_STATUSES) {
    for (const ev of ALL_EVENT_TYPES) {
      if (!canTransition(from, ev)) illegal.push([from, ev]);
    }
  }

  it('covers at least 8 illegal transitions', () => {
    expect(illegal.length).toBeGreaterThanOrEqual(8);
  });

  for (const [from, ev] of illegal) {
    it(`rejects ${from} --${ev}-->`, () => {
      const res = transition(stateIn(from), eventOf(ev));
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBeTruthy();
    });
  }

  it('does not mutate the input ticket', () => {
    const input = stateIn('ai');
    const snapshot = { ...input };
    transition(input, { type: 'claim', userId: 'x' }); // illegal from ai
    expect(input).toEqual(snapshot);
  });
});

describe('state machine — guards', () => {
  it('rejects reopen after the 7-day window', () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const res = transition(
      { status: 'done', assigneeUserId: null, handoffReason: null, resolvedAt: eightDaysAgo },
      { type: 'reopen', now: new Date() },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('reopen_window_expired');
  });

  it('closed is terminal', () => {
    for (const ev of ALL_EVENT_TYPES) {
      expect(transition(stateIn('closed'), eventOf(ev)).ok).toBe(false);
    }
  });
});

describe('state machine — property: random sequences never reach an undefined state', () => {
  it('only ever moves along legal edges and never throws', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALL_STATUSES),
        fc.array(fc.constantFrom(...ALL_EVENT_TYPES), { maxLength: 40 }),
        (start, events) => {
          let state = stateIn(start);
          for (const ev of events) {
            const before = state.status;
            const res = transition(state, eventOf(ev));
            if (res.ok) {
              // The move must be a declared legal edge.
              expect(canTransition(before, ev)).toBe(true);
              expect(ALL_STATUSES).toContain(res.ticket.status);
              state = res.ticket;
            } else {
              // On rejection the status is unchanged.
              expect(state.status).toBe(before);
            }
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
