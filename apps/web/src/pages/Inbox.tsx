import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, openRealtime } from '../api';
import { t } from '../locale';
import { useToast } from '../toast';
import type { EndUserProfile, Message, TicketDetail, TicketListItem, TicketStatus, User } from '../types';

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

// Default view = the active working queue; done/closed are their own filters
// so cron-closed history can never flood the inbox (review B-01).
const FILTERS: Array<{ key: string; label: string }> = [
  { key: 'active', label: t.filterActive },
  { key: 'ai', label: t.filterAi },
  { key: 'handoff', label: t.filterHandoff },
  { key: 'human', label: t.filterHuman },
  { key: 'done', label: t.filterDone },
  { key: 'closed', label: t.filterClosed },
];

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
}

function PriorityPill({ priority }: { priority: string }) {
  if (priority === 'urgent') return <span className="pr-pill pr-urgent">{t.prUrgent}</span>;
  if (priority === 'high') return <span className="pr-pill pr-high">{t.prHigh}</span>;
  return null;
}

interface Props {
  tenant: string;
  user: User;
  onBadge: (n: number) => void;
  routeTicketId: string | null;
  onSelectTicket: (id: string) => void;
}

export default function Inbox({ tenant, user, onBadge, routeTicketId, onSelectTicket }: Props) {
  const toast = useToast();
  const [filter, setFilter] = useState('active');
  const [q, setQ] = useState('');
  const [tickets, setTickets] = useState<TicketListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [selId, setSelId] = useState<string | null>(routeTicketId);
  const [detail, setDetail] = useState<{ ticket: TicketDetail; messages: Message[] } | null>(null);
  const [profile, setProfile] = useState<EndUserProfile | null>(null);
  const [draft, setDraft] = useState('');
  const [noteMode, setNoteMode] = useState(false);
  const msgsRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);

  const canWrite = user.role !== 'viewer'; // front-end mirrors the API guard (review B-07)

  const loadList = useCallback(
    async (pageTo = 1, append = false) => {
      const params = new URLSearchParams();
      if (filter !== 'active') params.set('status', filter);
      if (q.trim()) params.set('q', q.trim());
      params.set('page', String(pageTo));
      const res = await api.get<{ tickets: TicketListItem[]; badgeCount: number; total: number }>(
        `/tenants/${tenant}/tickets?${params.toString()}`,
      );
      setTickets((cur) => (append ? [...cur, ...res.tickets] : res.tickets));
      setTotal(res.total);
      setPage(pageTo);
      onBadge(res.badgeCount);
      return res.tickets;
    },
    [tenant, filter, q, onBadge],
  );

  const loadDetail = useCallback(
    async (id: string) => {
      try {
        const res = await api.get<{ ticket: TicketDetail; messages: Message[] }>(`/tenants/${tenant}/tickets/${id}`);
        setDetail(res);
        // Customer 360° pane (P0-3).
        const p = await api.get<EndUserProfile>(`/tenants/${tenant}/end-users/${res.ticket.endUser.id}`);
        setProfile(p);
      } catch {
        setDetail(null);
        setProfile(null);
      }
    },
    [tenant],
  );

  // initial + on filter/search/tenant change
  useEffect(() => {
    void loadList().then((list) => {
      setSelId((cur) => {
        if (cur && (list.some((x) => x.id === cur) || routeTicketId === cur)) return cur;
        return list[0]?.id ?? null;
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadList]);

  // deep link (#/inbox/:id) — including on back/forward
  useEffect(() => {
    if (routeTicketId && routeTicketId !== selId) setSelId(routeTicketId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeTicketId]);

  useEffect(() => {
    if (selId) void loadDetail(selId);
    else {
      setDetail(null);
      setProfile(null);
    }
  }, [selId, loadDetail]);

  // realtime: refresh list + open thread on relevant events
  useEffect(() => {
    const close = openRealtime(tenant, (ev) => {
      const type = ev.type as string;
      if (type === 'ticket.updated' || type === 'lock.changed' || type === 'message.created' || type === 'message.updated') {
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

  const select = (id: string) => {
    setSelId(id);
    onSelectTicket(id);
  };

  const ticket = detail?.ticket ?? null;
  const lockedByOther = Boolean(ticket?.lockedBy && ticket.lockedBy.id !== user.id);
  // Replying to an `ai` ticket is allowed: the backend takes it over in one step.
  const canCompose = canWrite && ticket && !lockedByOther && ticket.status !== 'done' && ticket.status !== 'closed';
  const canTakeover = canWrite && ticket && (ticket.status === 'ai' || ticket.status === 'new' || ticket.status === 'handoff') && !lockedByOther;
  const canResolve = canWrite && ticket && (ticket.status === 'human' || ticket.status === 'ai') && !lockedByOther;
  const canReopen = canWrite && ticket && (ticket.status === 'done' || ticket.status === 'closed');

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
    if (!body || !ticket || !canCompose) return;
    try {
      await api.post(`/tenants/${tenant}/tickets/${ticket.id}/messages`, { body, internal: noteMode || undefined });
      setDraft('');
      await Promise.all([loadList(), loadDetail(ticket.id)]);
    } catch (err) {
      onApiError(err);
    }
  };

  const takeover = async () => {
    if (!ticket) return;
    try {
      await api.post(`/tenants/${tenant}/tickets/${ticket.id}/claim`);
      toast(t.claimed(ticket.subject));
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
      select(res.ticket.id);
    } catch (err) {
      onApiError(err);
    }
  };

  const retryDelivery = async (messageId: string) => {
    if (!ticket) return;
    try {
      await api.post(`/tenants/${tenant}/tickets/${ticket.id}/messages/${messageId}/retry-delivery`);
      toast(t.dvRetried);
      await loadDetail(ticket.id);
    } catch (err) {
      onApiError(err);
    }
  };

  const curIdx = ticket ? LC_ORDER.indexOf(ticket.status === 'closed' ? 'done' : ticket.status) : -1;

  return (
    <div className="inbox3">
      <div className="tlist">
        <div className="tlist-head">
          {FILTERS.map((f) => (
            <button key={f.key} className={`chip${filter === f.key ? ' on' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="tsearch">
          <input placeholder={t.searchPlaceholder} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t.searchPlaceholder} />
        </div>
        <div className="tickets">
          {tickets.map((tk) => (
            <div key={tk.id} className={`ticket${tk.id === selId ? ' sel' : ''}`} onClick={() => select(tk.id)}>
              <div className="row1">
                <span className="tnum">#{tk.number}</span>
                <PriorityPill priority={tk.priority} />
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
          {tickets.length < total && (
            <div className="load-more" onClick={() => void loadList(page + 1, true)}>
              {t.loadMore(tickets.length, total)}
            </div>
          )}
        </div>
      </div>

      <div className="chatbox">
        <div className="chat-head">
          <div className="row">
            <h3>{ticket ? ticket.subject : t.noTicket}</h3>
            {ticket && <span className="tnum">#{ticket.number}</span>}
            {ticket && <PriorityPill priority={ticket.priority} />}
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
              ? t.noteWho
              : m.senderType === 'end_user'
                ? t.whoPlayer
                : m.senderType === 'eva'
                  ? t.whoEva
                  : t.whoAgent;
            // Outbound delivery ticks (P0-1): the agent sees whether the customer
            // actually received each reply, and can retry failures inline.
            const tick =
              m.deliveryStatus === 'sent' ? (
                <span className="dv-tick sent">{t.dvSent}</span>
              ) : m.deliveryStatus === 'pending' ? (
                <span className="dv-tick pending">{t.dvPending}</span>
              ) : m.deliveryStatus === 'failed' ? (
                <span
                  className="dv-tick failed"
                  title={m.deliveryError ?? ''}
                  onClick={() => void retryDelivery(m.id)}
                >
                  {t.dvFailed}
                </span>
              ) : null;
            return (
              <div key={m.id} className={`msg ${cls}`}>
                <div className="who">
                  {who}
                  {tick}
                </div>
                {m.body}
              </div>
            );
          })}
        </div>

        <div className="compose" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          {canWrite && (
            <div className="cmodes">
              <button className={`cmode${!noteMode ? ' on' : ''}`} onClick={() => setNoteMode(false)}>
                {t.modeReply}
              </button>
              <button className={`cmode${noteMode ? ' on note' : ''}`} onClick={() => setNoteMode(true)}>
                {t.modeNote}
              </button>
              <span className="ime-hint">{t.imeHint}</span>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {canTakeover ? (
              <button className="btn btn-amber" onClick={takeover}>
                {t.btnTakeover}
              </button>
            ) : (
              <button className="btn btn-amber" disabled>
                {t.btnTakeover}
              </button>
            )}
            <input
              placeholder={noteMode ? t.notePlaceholder : t.composePlaceholder}
              value={draft}
              disabled={!canCompose}
              onChange={(e) => setDraft(e.target.value)}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={() => {
                composingRef.current = false;
              }}
              onKeyDown={(e) => {
                // IME guard (review B-10): Enter during CJK composition must not send.
                if (e.key === 'Enter' && !e.shiftKey && !composingRef.current && !e.nativeEvent.isComposing) {
                  void send();
                }
              }}
              aria-label={noteMode ? t.notePlaceholder : t.composePlaceholder}
              style={{ flex: 1, minWidth: 160 }}
            />
            <button className="btn btn-teal" disabled={!canCompose || !draft.trim()} onClick={() => void send()}>
              {t.btnSend}
            </button>
            {canReopen ? (
              <button className="btn btn-ghost" onClick={() => void reopen()}>
                {t.btnReopen}
              </button>
            ) : (
              <button className="btn btn-ghost" disabled={!canResolve} onClick={() => void resolve()}>
                {t.btnResolve}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="cust-pane">
        {profile ? (
          <>
            <div className="sec">
              <span className="sec-lbl">{t.custPane}</span>
              <div className="cust-head">
                <div className="cust-av">{profile.endUser.displayName.slice(0, 1)}</div>
                <div>
                  <b>{profile.endUser.displayName}</b>
                  <div className="tnum">{profile.endUser.externalKey}</div>
                </div>
              </div>
              <div className="cust-kv">
                <span className="k">{t.custEmail}</span>
                <span className="v">{profile.endUser.email ?? t.custNoEmail}</span>
              </div>
              {profile.endUser.telegramId && (
                <div className="cust-kv">
                  <span className="k">Telegram</span>
                  <span className="v">{profile.endUser.telegramId}</span>
                </div>
              )}
              <div className="cust-kv">
                <span className="k">{t.custStatTotal}</span>
                <span className="v">{Object.values(profile.stats).reduce((a, b) => a + b, 0)}</span>
              </div>
              <div className="cust-kv">
                <span className="k">{t.custStatDone}</span>
                <span className="v">{(profile.stats.done ?? 0) + (profile.stats.closed ?? 0)}</span>
              </div>
            </div>
            <div className="sec">
              <span className="sec-lbl">{t.custHistory}</span>
              {profile.tickets.map((h) => (
                <div key={h.id} className="cust-hist" onClick={() => select(h.id)}>
                  #{h.number} · {h.subject}
                  <div className="hm">
                    {STATUS_META[h.status].txt} · {timeLabel(h.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ color: 'var(--muted)', fontSize: 12, textAlign: 'center', paddingTop: 40 }}>{t.noTicket}</div>
        )}
      </div>
    </div>
  );
}
