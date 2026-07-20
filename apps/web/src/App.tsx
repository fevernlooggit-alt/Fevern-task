import { useCallback, useEffect, useRef, useState } from 'react';
import { api, openRealtime } from './api';
import { t } from './locale';
import type { Tenant, User } from './types';
import { ToastProvider, useToast } from './toast';
import Inbox from './pages/Inbox';
import EvaConfigPage from './pages/EvaConfig';
import KbPage from './pages/Kb';
import MonitorPage from './pages/Monitor';
import SettingsPage from './pages/Settings';

type Page = 'inbox' | 'eva' | 'kb' | 'mon' | 'settings';

const TITLES: Record<Page, [string, string]> = {
  inbox: [t.titleInbox, t.crumbInbox],
  eva: [t.titleEva, t.crumbEva],
  kb: [t.titleKb, t.crumbKb],
  mon: [t.titleMonitor, t.crumbMonitor],
  settings: [t.titleSettings, t.crumbSettings],
};

// ------------------------- hash routing (P0-7) -------------------------
// #/inbox[/ticketId] · #/eva · #/kb · #/mon · #/settings — refresh keeps your
// place and ticket URLs are shareable (review B-06).

interface Route {
  page: Page;
  ticketId: string | null;
}

function parseHash(): Route {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/');
  const page = (['inbox', 'eva', 'kb', 'mon', 'settings'].includes(parts[0] ?? '') ? parts[0] : 'inbox') as Page;
  const ticketId = page === 'inbox' && parts[1] ? parts[1] : null;
  return { page, ticketId };
}

function writeHash(route: Route): void {
  const h = route.page === 'inbox' && route.ticketId ? `#/inbox/${route.ticketId}` : `#/${route.page}`;
  if (window.location.hash !== h) window.history.pushState(null, '', h);
}

function Login({ onLogin }: { onLogin: (u: User) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post<{ user: User }>('/auth/login', { email, password });
      onLogin(res.user);
    } catch {
      setErr(t.loginFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="aurora" />
      <div className="login-wrap">
        <form className="login-card" onSubmit={submit}>
          <div className="logo" style={{ paddingLeft: 0 }}>
            <div className="dot">iC</div>
            <div>
              <b>iCRM</b>
              <span>{t.appSubtitle}</span>
            </div>
          </div>
          <h2>{t.loginTitle}</h2>
          <p>{t.loginSubtitle}</p>
          <label htmlFor="email">{t.email}</label>
          <input id="email" className="inp" type="email" value={email} autoComplete="username" onChange={(e) => setEmail(e.target.value)} required />
          <label htmlFor="password">{t.password}</label>
          <input id="password" className="inp" type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} required />
          {err && <div className="err">{err}</div>}
          <button className="btn btn-teal" style={{ width: '100%', marginTop: 18 }} disabled={busy} type="submit">
            {t.loginBtn}
          </button>
        </form>
      </div>
    </>
  );
}

const NavIcons: Record<Page, JSX.Element> = {
  inbox: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.5 5h13l3.5 7v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" />
    </svg>
  ),
  eva: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
    </svg>
  ),
  kb: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  mon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  ),
};

/** Browser notifications for new handoffs / customer messages (P0-4, review B-21). */
function useNotifications(tenantSlug: string | null, enabled: boolean) {
  const toast = useToast();
  const audioCtx = useRef<AudioContext | null>(null);

  const beep = useCallback(() => {
    try {
      audioCtx.current = audioCtx.current ?? new AudioContext();
      const ctx = audioCtx.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      /* audio unavailable */
    }
  }, []);

  useEffect(() => {
    if (!tenantSlug || !enabled) return;
    const close = openRealtime(tenantSlug, (ev) => {
      const type = ev.type as string;
      let text: string | null = null;
      if (type === 'ticket.updated' && (ev as { status?: string }).status === 'handoff') {
        text = t.notifNewHandoff(String(ev.ticketId).slice(0, 8));
      } else if (type === 'message.created' && (ev as { senderType?: string }).senderType === 'end_user') {
        text = t.notifNewMessage(String(ev.ticketId).slice(0, 8));
      }
      if (!text) return;
      beep();
      toast(text);
      if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
        try {
          new Notification('iCRM', { body: text, tag: String(ev.ticketId) });
        } catch {
          /* notification construction can throw in some browsers */
        }
      }
    });
    return close;
  }, [tenantSlug, enabled, beep, toast]);
}

function Shell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const toast = useToast();
  const [route, setRoute] = useState<Route>(() => parseHash());
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [badge, setBadge] = useState(0);
  const [notifOn, setNotifOn] = useState(() => 'Notification' in window && Notification.permission === 'granted');

  useEffect(() => {
    void api.get<{ tenants: Tenant[] }>('/tenants').then((res) => {
      setTenants(res.tenants);
      if (res.tenants.length > 0) setTenantSlug(res.tenants[0]!.slug);
    });
  }, []);

  // Back/forward + hand-typed URLs.
  useEffect(() => {
    const onPop = () => setRoute(parseHash());
    window.addEventListener('popstate', onPop);
    window.addEventListener('hashchange', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('hashchange', onPop);
    };
  }, []);

  const go = useCallback((page: Page, ticketId: string | null = null) => {
    const next = { page, ticketId };
    writeHash(next);
    setRoute(next);
  }, []);

  useNotifications(tenantSlug, notifOn);

  const enableNotifications = async () => {
    if (!('Notification' in window)) {
      setNotifOn(true);
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifOn(perm === 'granted');
    if (perm === 'granted') toast(t.notifEnabled);
  };

  const isAdmin = user.role === 'super_admin' || user.role === 'tenant_admin';
  const navPages: Page[] = isAdmin ? ['inbox', 'eva', 'kb', 'mon', 'settings'] : ['inbox', 'kb', 'mon'];
  const navLabel: Record<Page, string> = {
    inbox: t.navInbox,
    eva: t.navEva,
    kb: t.navKb,
    mon: t.navMonitor,
    settings: t.navSettings,
  };

  if (!tenantSlug) return null;
  const page = navPages.includes(route.page) ? route.page : 'inbox';

  return (
    <>
      <div className="aurora" />
      <div className="app">
        <aside className="side">
          <div className="logo">
            <div className="dot">iC</div>
            <div>
              <b>iCRM</b>
              <span>{t.appSubtitle}</span>
            </div>
          </div>
          {navPages.map((p) => (
            <button key={p} className={`nav-item${page === p ? ' active' : ''}`} onClick={() => go(p)}>
              {NavIcons[p]}
              <span className="lbl">{navLabel[p]}</span>
              {p === 'inbox' && badge > 0 && <span className="badge">{badge}</span>}
            </button>
          ))}
          <button className="nav-item" onClick={onLogout} style={{ marginTop: 8 }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span className="lbl">{t.logout}</span>
          </button>
          <div className="tenant">
            <label htmlFor="tenantSel">{t.tenant}</label>
            <select
              id="tenantSel"
              value={tenantSlug}
              onChange={(e) => {
                setTenantSlug(e.target.value);
                const name = tenants.find((x) => x.slug === e.target.value)?.name ?? e.target.value;
                toast(t.tenantSwitched(name));
              }}
            >
              {tenants.map((tn) => (
                <option key={tn.id} value={tn.slug}>
                  {tn.name}
                </option>
              ))}
            </select>
          </div>
        </aside>

        <div className="main">
          <div className="topbar">
            <h1>{TITLES[page][0]}</h1>
            <span className="crumb">{TITLES[page][1]}</span>
            <button className={`notif-btn${notifOn ? ' on' : ''}`} onClick={() => void enableNotifications()} style={{ marginLeft: 'auto' }}>
              {notifOn ? t.notifEnabled : t.notifEnable}
            </button>
            <span className="env">{t.envLive}</span>
          </div>
          <div className="content">
            {page === 'inbox' && (
              <Inbox
                tenant={tenantSlug}
                user={user}
                onBadge={setBadge}
                routeTicketId={route.ticketId}
                onSelectTicket={(id) => go('inbox', id)}
              />
            )}
            {page === 'eva' && <EvaConfigPage tenant={tenantSlug} canEdit={isAdmin} />}
            {page === 'kb' && <KbPage tenant={tenantSlug} canEdit={isAdmin} />}
            {page === 'mon' && <MonitorPage tenant={tenantSlug} />}
            {page === 'settings' && isAdmin && <SettingsPage tenant={tenantSlug} me={user} />}
          </div>
        </div>
      </div>
    </>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    api
      .get<{ user: User }>('/auth/me')
      .then((res) => setUser(res.user))
      .catch(() => undefined)
      .finally(() => setChecked(true));
  }, []);

  const logout = useCallback(() => {
    void api.post('/auth/logout').finally(() => setUser(null));
  }, []);

  if (!checked) return null;

  return (
    <ToastProvider>
      {user ? <Shell user={user} onLogout={logout} /> : <Login onLogin={setUser} />}
    </ToastProvider>
  );
}
