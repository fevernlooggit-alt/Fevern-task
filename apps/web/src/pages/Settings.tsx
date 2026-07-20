import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { t } from '../locale';
import { useToast } from '../toast';
import type { ManagedUser, User } from '../types';

// Settings (P0-5): user & team management + self-service password change.
// tenant_admin runs onboarding/offboarding without touching the database.

const ROLE_OPTIONS = ['tenant_admin', 'agent', 'viewer'] as const;

interface Props {
  tenant: string;
  me: User;
}

export default function SettingsPage({ tenant, me }: Props) {
  const toast = useToast();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ email: '', displayName: '', role: 'agent' as string, password: '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });

  const load = useCallback(async () => {
    const res = await api.get<{ users: ManagedUser[] }>(`/tenants/${tenant}/users`);
    setUsers(res.users);
  }, [tenant]);

  useEffect(() => {
    void load();
  }, [load]);

  const onError = (err: unknown) => {
    toast(err instanceof ApiError ? err.message : String(err));
  };

  const create = async () => {
    try {
      await api.post(`/tenants/${tenant}/users`, draft);
      toast(t.usersCreated);
      setCreating(false);
      setDraft({ email: '', displayName: '', role: 'agent', password: '' });
      await load();
    } catch (err) {
      onError(err);
    }
  };

  const update = async (id: string, data: Partial<Pick<ManagedUser, 'role' | 'isActive'>>) => {
    try {
      await api.put(`/tenants/${tenant}/users/${id}`, data);
      toast(t.usersUpdated);
      await load();
    } catch (err) {
      onError(err);
    }
  };

  const changePassword = async () => {
    try {
      await api.post('/auth/change-password', pw);
      toast(t.pwChanged);
      setPw({ currentPassword: '', newPassword: '' });
    } catch (err) {
      onError(err);
    }
  };

  return (
    <div className="grid g2" style={{ alignItems: 'start' }}>
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <h4 style={{ marginBottom: 0 }}>{t.usersTitle}</h4>
          <button className="btn btn-teal" style={{ marginLeft: 'auto' }} onClick={() => setCreating((v) => !v)}>
            {t.usersInvite}
          </button>
        </div>

        {creating && (
          <div style={{ display: 'grid', gap: 8, marginBottom: 14, padding: 12, border: '1px solid var(--line)', borderRadius: 10 }}>
            <input className="inp" placeholder={t.usersEmail} type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            <input className="inp" placeholder={t.usersName} value={draft.displayName} onChange={(e) => setDraft({ ...draft, displayName: e.target.value })} />
            <select className="inp" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <input className="inp" placeholder={t.usersInitPassword} type="password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-teal" disabled={!draft.email || !draft.displayName || draft.password.length < 8} onClick={() => void create()}>
                {t.usersCreate}
              </button>
              <button className="btn btn-ghost" onClick={() => setCreating(false)}>
                {t.usersCancel}
              </button>
            </div>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table className="set-table">
            <thead>
              <tr>
                <th>{t.usersEmail}</th>
                <th>{t.usersName}</th>
                <th>{t.usersRole}</th>
                <th>{t.usersStatus}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={u.isActive ? undefined : { opacity: 0.5 }}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{u.email}</td>
                  <td>{u.displayName}</td>
                  <td>
                    {u.role === 'super_admin' || u.id === me.id ? (
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{u.role}</span>
                    ) : (
                      <select className="inp" style={{ width: 130 }} value={u.role} onChange={(e) => void update(u.id, { role: e.target.value as ManagedUser['role'] })}>
                        {ROLE_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {u.isActive ? (
                      <span style={{ color: u.isOnline ? 'var(--teal)' : 'var(--muted)' }}>{u.isOnline ? t.usersOnline : t.usersOffline}</span>
                    ) : (
                      <span style={{ color: 'var(--danger)' }}>{t.usersDisabled}</span>
                    )}
                  </td>
                  <td>
                    {u.id !== me.id && u.role !== 'super_admin' && (
                      <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 12 }} onClick={() => void update(u.id, { isActive: !u.isActive })}>
                        {u.isActive ? t.usersDeactivate : t.usersActivate}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h4>{t.pwTitle}</h4>
        <div style={{ display: 'grid', gap: 8, maxWidth: 320 }}>
          <input className="inp" type="password" placeholder={t.pwCurrent} value={pw.currentPassword} autoComplete="current-password" onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          <input className="inp" type="password" placeholder={t.pwNew} value={pw.newPassword} autoComplete="new-password" onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          <button className="btn btn-teal" disabled={!pw.currentPassword || pw.newPassword.length < 8} onClick={() => void changePassword()}>
            {t.pwChange}
          </button>
        </div>
      </div>
    </div>
  );
}
