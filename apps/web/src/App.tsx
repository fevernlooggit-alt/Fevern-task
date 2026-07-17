import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from './api';
import { t } from './locale';
import type { Tenant, User } from './types';
import { ToastProvider, useToast } from './toast';
import Inbox from './pages/Inbox';
import EvaConfigPage from './pages/EvaConfig';
import KbPage from './pages/Kb';
import MonitorPage from './pages/Monitor';

type Page = 'inbox' | 'eva' | 'kb' | 'mon';

const TITLES: Record<Page, [string, string]> = {
  inbox: [t.titleInbox, t.crumbInbox],
  eva: [t.titleEva, t.crumbEva],
  kb: [t.titleKb, t.crumbKb],
  mon: [t.titleMonitor, t.crumbMonitor],
};

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
};

function Shell({ user, onLogout }: { user: User; onLogout: () => void }) {
  const toast = useToast();
  const [page, setPage] = useState<Page>('inbox');
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [badge, setBadge] = useState(0);

  useEffect(() => {
    void api.get<{ tenants: Tenant[] }>('/tenants').then((res) => {
      setTenants(res.tenants);
      if (res.tenants.length > 0) setTenantSlug(res.tenants[0]!.slug);
    });
  }, []);

  const isAdmin = user.role === 'super_admin' || user.role === 'tenant_admin';
  const navPages: Page[] = isAdmin ? ['inbox', 'eva', 'kb', 'mon'] : ['inbox', 'kb', 'mon'];
  const navLabel: Record<Page, string> = { inbox: t.navInbox, eva: t.navEva, kb: t.navKb, mon: t.navMonitor };

  if (!tenantSlug) return null;

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
            <button key={p} className={`nav-item${page === p ? ' active' : ''}`} onClick={() => setPage(p)}>
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
            <span className="env">{t.envLive}</span>
          </div>
          <div className="content">
            {page === 'inbox' && <Inbox tenant={tenantSlug} user={user} onBadge={setBadge} />}
            {page === 'eva' && <EvaConfigPage tenant={tenantSlug} canEdit={isAdmin} />}
            {page === 'kb' && <KbPage tenant={tenantSlug} canEdit={isAdmin} />}
            {page === 'mon' && <MonitorPage tenant={tenantSlug} />}
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
