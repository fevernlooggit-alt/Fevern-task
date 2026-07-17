import { EventEmitter } from 'node:events';

// In-process realtime bus (DEC-004). Publishers call publish(); the WebSocket
// plugin subscribes and fans events out to sockets filtered by tenantId.
// Swap this for a Redis pub/sub adapter to scale horizontally (Phase 4).

export type RealtimeEvent =
  | { type: 'ticket.updated'; tenantId: string; ticketId: string; status: string; payload?: unknown }
  | { type: 'message.created'; tenantId: string; ticketId: string; messageId: string; senderType: string }
  | {
      type: 'lock.changed';
      tenantId: string;
      ticketId: string;
      lockedByUserId: string | null;
      lockedByName: string | null;
    };

class RealtimeBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Many WS clients may subscribe; lift the default listener cap.
    this.emitter.setMaxListeners(0);
  }

  publish(event: RealtimeEvent): void {
    this.emitter.emit('event', event);
  }

  subscribe(listener: (event: RealtimeEvent) => void): () => void {
    this.emitter.on('event', listener);
    return () => this.emitter.off('event', listener);
  }
}

export const bus = new RealtimeBus();
