import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, openRealtime } from '../api';
import { t } from '../locale';
import { useToast } from '../toast';
import type { Message, TicketDetail, TicketListItem, TicketStatus, User } from '../types';

const STATUS_META: Record<TicketStatus, { cls: string; txt: string }> = {
  new: { cls: 'st-new', txt: t.stNew },
  ai: { cls: 'st-ai', txt: t.stAi },
  handoff: { cls: 'st-handoff', txt: t.stHandoff },
  human: { cls: 'st-human', txt: t.stHuman },
  done: { cls: 'st-done', txt: t.stDone },
  closed: { cls: 'st-closed', txt: t.stClosed },
};

const LC_ORDER: TicketStatus[] = ['new', 'ai', 'handoff', 'human', 'done'];
const LC_LABEL: Record<string, string> = { new: t.lcNew, ai: t.lcAi, handoff: t.lcHandoff, human: t.lcHuman, done: t.lcDone };

const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'all', label: t.filterAll },
  { key: 'ai', label: t.filterAi },
  { key: 'handoff', label: t.filterHandoff },
  { key: 'human', label: t.filterHuman },
  { key: 'done', label: t.filterDone },
];

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

interface Props {
  tenant: string;
  user: User;
  onBadge: (n: number) => void;
}

export default function Inbox({ tenant, user, onBadge }: Props) {
  const toast = useToast();
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ ticket: TicketDetail; messages: Message[] } | null>(null);
  const [draft, setDraft] = useState('');
  const msgsRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter !== 'all') params.set('status', filter);
    if (q.trim()) params.set('q', q.trim());
    const res = await api.get<{ tickets: TicketListItem[]; badgeCount: number }>(
      `/tenants/${tenant}/tickets?${params.toString()}`,
    );
    setTickets(res.tickets);
    onBadge(res.badgeCount);
    return res.tickets;
  }, [tenant, filter, q, onBadge]);

  const loadDetail = useCallback(
    async (id: string) => {
      const res = await api.get<{ ticket: TicketDetail; messages: Message[] }>(`/tenants/${tenant}/tickets/${id}`);
      setDetail(res);
    },
    [tenant],
  );

  // initial + on filter/search/tenant change
  useEffect(() => {
    void loadList().then((list) => {
      setSelId((cur) => {
        if (cur && list.some((x) => x.id === cur)) return cur;
        return list[0]?.id ?? null;
      });
    });
  }, [loadList]);

  useEffect(() => {
    if (selId) void loadDetail(selId);
    else setDetail(null);
  }, [selId, loadDetail]);

  // realtime: refresh list + open thread on relevant events
  useEffect(() => {
    const close = openRealtime(tenant, (ev) => {
      const type = ev.type as string;
      if (type === 'ticket.updated' || type === 'lock.changed' || type === 'message.created') {
        void loadList();
        if (selId && ev.ticketId === selId) void loadDetail(selId);
      }
    });
    return close;
  }, [tenant, selId, loadList, loadDetail]);

  // lock heartbeat while I hold the selected ticket (PRD P0-4.3)
  useEffect(() => {
    const mine = detail?.ticket.lockedBy?.id === user.id;
    if (!mine || !selId) return;
    const timer = setInterval(() => {
      void api.post(`/tenants/${tenant}/tickets/${selId}/heartbeat`).catch(() => undefined);
    }, 60_000);
    return () => clearInterval(timer);
  }, [detail, selId, tenant, user.id]);

  // autoscroll thread
  useEffect(() => {
    msgsRef.current?.scrollTo({ top: msgsRef.current.scrollHeight });
  }, [detail]);

  const ticket = detail?.ticket ?? null;
  const lockedByOther = Boolean(ticket?.lockedBy && ticket.lockedBy.id !== user.id);
  const canCompose = ticket && !lockedByOther && ticket.status !== 'done' && ticket.status !== 'closed' && ticket.status !== 'ai';
  const canHandoff = ticket && (ticket.status === 'ai' || ticket.status === 'new') && !lockedByOther;
  const canResolve = ticket && (ticket.status === 'human' || ticket.status === 'ai') && !lockedByOther;
  const canReopen = ticket && (ticket.status === 'done' || ticket.status === 'closed');

  const onApiError = (err: unknown) => {
    if (err instanceof ApiError) {
      const holder = (err.details as { holder?: { displayName?: string } } | undefined)?.holder;
      toast(holder?.displayName ? t.collision(holder.displayName) : err.message);
    } else {
      toast(String(err));
    }
    void loadList();
    if (selId) void loadDetail(selId);
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || !ticket) return;
    try {
      await api.post(`/tenants/${tenant}/tickets/${ticket.id}/messages`, { body });
      setDraft('');
      await Promise.all([loadList(), loadDetail(ticket.id)]);
    } catch (err) {
      onApiError(err);
    }
  };

  const handoff = async () => {
    if (!ticket) return;
    try {
      await api.post(`/tenants/${tenant}/tickets/${ticket.id}/handoff`);
      toast(t.handoffDone(ticket.subject));
      await Promise.all([loadList(), loadDetail(ticket.id)]);
    } catch (err) {
      onApiError(err);
    }
  };

  const resolve = async () => {
    if (!ticket) return;
    try {
      await api.post(`/tenants/${tenant}/tickets/${ticket.id}/resolve`);
      toast(t.resolvedToast(ticket.subject));
      await Promise.all([loadList(), loadDetail(ticket.id)]);
    } catch (err) {
      onApiError(err);
    }
  };

  const reopen = async () => {
    if (!ticket) return;
    try {
      const res = await api.post<{ ticket: { id: string }; createdNew: boolean }>(
        `/tenants/${tenant}/tickets/${ticket.id}/reopen`,
      );
      await loadList();
      setSelId(res.ticket.id);
    } catch (err) {
      onApiError(err);
    }
  };

  const curIdx = ticket ? LC_ORDER.indexOf(ticket.status === 'closed' ? 'done' : ticket.status) : -1;

  return (
    <div className="inbox">
      <div className="tlist">
        <div className="tlist-head">
          {FILTERS.map((f) => (
            <button key={f.key} className={`chip${filter === f.key ? ' on' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="tsearch">
          <input placeholder={t.searchTickets} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t.searchTickets} />
        </div>
        <div className="tickets">
          {tickets.map((tk) => (
            <div key={tk.id} className={`ticket${tk.id === selId ? ' sel' : ''}`} onClick={() => setSelId(tk.id)}>
              <div className="row1">
                <span className="tid">{tk.id.slice(0, 8)}</span>
                <span className={`pill ${STATUS_META[tk.status].cls}`}>{STATUS_META[tk.status].txt}</span>
              </div>
              <div className="subj">{tk.subject}</div>
              <div className="meta">
                <span>{tk.channelType}</span>
                <span>{tk.endUserName}</span>
                <span>{timeLabel(tk.updatedAt)}</span>
                {tk.lockedBy && <span style={{ color: 'var(--danger)' }}>{t.lockedBy(tk.lockedBy.displayName)}</span>}
              </div>
            </div>
          ))}
          {tickets.length === 0 && (
            <div style={{ color: 'var(--muted)', fontSize: 13, padding: 30, textAlign: 'center' }}>{t.emptyList}</div>
          )}
        </div>
      </div>

      <div className="chatbox">
        <div className="chat-head">
          <div className="row">
            <h3>{ticket ? ticket.subject : t.noTicket}</h3>
            {ticket && <span className={`pill ${STATUS_META[ticket.status].cls}`}>{STATUS_META[ticket.status].txt}</span>}
          </div>
          {ticket && (
            <div className="lifecycle">
              {LC_ORDER.map((s, i) => (
                <span key={s} style={{ display: 'contents' }}>
                  <span className={`lc-step${i < curIdx ? ' done' : i === curIdx ? ' cur' : ''}`}>{LC_LABEL[s]}</span>
                  {i < LC_ORDER.length - 1 && <span className="lc-arrow" />}
                </span>
              ))}
            </div>
          )}
          {ticket && lockedByOther && (
            <div className="collision" data-testid="collision-banner">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>{t.collision(ticket.lockedBy!.displayName)}</span>
            </div>
          )}
        </div>

        <div className="msgs" ref={msgsRef}>
          {detail?.messages.map((m) => {
            if (m.senderType === 'system') {
              return (
                <div key={m.id} className="msg m-sys">
                  —— {m.body} ——
                </div>
              );
            }
            const cls = m.internal
              ? 'm-internal'
              : m.senderType === 'end_user'
                ? 'm-user'
                : m.senderType === 'eva'
                  ? 'm-eva'
                  : 'm-agent';
            const who = m.internal
              ? t.internalNote
              : m.senderType === 'end_user'
                ? t.whoPlayer
                : m.senderType === 'eva'
                  ? t.whoEva
                  : t.whoAgent;
            return (
              <div key={m.id} className={`msg ${cls}`}>
                <div className="who">{who}</div>
                {m.body}
              </div>
            );
          })}
        </div>

        <div className="compose">
          <button className="btn btn-amber" disabled={!canHandoff} onClick={handoff}>
            {t.btnHandoff}
          </button>
          <input
            placeholder={t.composePlaceholder}
            value={draft}
            disabled={!canCompose}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void send();
            }}
            aria-label={t.composePlaceholder}
          />
          <button className="btn btn-teal" disabled={!canCompose} onClick={send}>
            {t.btnSend}
          </button>
          {canReopen ? (
            <button className="btn btn-ghost" onClick={reopen}>
              {t.btnReopen}
            </button>
          ) : (
            <button className="btn btn-ghost" disabled={!canResolve} onClick={resolve}>
              {t.btnResolve}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
