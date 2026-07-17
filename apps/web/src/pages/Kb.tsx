import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { t } from '../locale';
import { useToast } from '../toast';
import type { KbArticle } from '../types';

interface Props {
  tenant: string;
  canEdit: boolean;
}

interface Draft {
  id?: string;
  title: string;
  bodyMd: string;
  locale: string;
  tags: string;
  syncStatus: KbArticle['syncStatus'];
}

const EMPTY: Draft = { title: '', bodyMd: '', locale: 'zh', tags: '', syncStatus: 'pending_confirmation' };

export default function KbPage({ tenant, canEdit }: Props) {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<KbArticle[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);

  const load = useCallback(async () => {
    const params = q.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
    const res = await api.get<{ kbArticles: KbArticle[] }>(`/tenants/${tenant}/kb-articles${params}`);
    setItems(res.kbArticles);
  }, [tenant, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    const payload = {
      title: draft.title,
      bodyMd: draft.bodyMd,
      locale: draft.locale,
      tags: draft.tags.split(/[,，]\s*/).filter(Boolean),
      syncStatus: draft.syncStatus,
    };
    if (draft.id) await api.put(`/tenants/${tenant}/kb-articles/${draft.id}`, payload);
    else await api.post(`/tenants/${tenant}/kb-articles`, payload);
    setDraft(null);
    toast(t.saved);
    await load();
  };

  const remove = async (id: string) => {
    await api.del(`/tenants/${tenant}/kb-articles/${id}`);
    setDraft(null);
    await load();
  };

  return (
    <>
      <div className="kb-toolbar">
        <input placeholder={t.kbSearch} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t.kbSearch} />
        {canEdit && (
          <button className="btn btn-teal" onClick={() => setDraft({ ...EMPTY })}>
            {t.kbNew}
          </button>
        )}
      </div>

      {draft && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ fontSize: 11, color: 'var(--muted)' }}>
              {t.kbTitle}
              <input className="inp" style={{ width: '100%', marginTop: 4 }} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </label>
            <label style={{ fontSize: 11, color: 'var(--muted)' }}>
              {t.kbBody}
              <textarea className="inp" style={{ width: '100%', minHeight: 140, marginTop: 4, fontFamily: 'monospace' }} value={draft.bodyMd} onChange={(e) => setDraft({ ...draft, bodyMd: e.target.value })} />
            </label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>
                {t.kbTags}
                <input className="inp" style={{ display: 'block', marginTop: 4 }} value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} />
              </label>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>
                {t.laLocale}
                <input className="inp" style={{ display: 'block', marginTop: 4, width: 70 }} value={draft.locale} onChange={(e) => setDraft({ ...draft, locale: e.target.value })} />
              </label>
              <label style={{ fontSize: 11, color: 'var(--muted)' }}>
                {t.kbSyncStatus}
                <select className="inp" style={{ display: 'block', marginTop: 4 }} value={draft.syncStatus} onChange={(e) => setDraft({ ...draft, syncStatus: e.target.value as Draft['syncStatus'] })}>
                  <option value="synced">{t.kbSynced}</option>
                  <option value="pending_confirmation">{t.kbPending}</option>
                  <option value="stale">stale</option>
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-teal" onClick={() => void save()} disabled={!draft.title || !draft.bodyMd}>
                {t.save}
              </button>
              <button className="btn btn-ghost" onClick={() => setDraft(null)}>
                ✕
              </button>
              {draft.id && (
                <button className="btn btn-danger" style={{ marginLeft: 'auto' }} onClick={() => void remove(draft.id!)}>
                  {t.delete}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div>
        {items.map((a) => (
          <div
            key={a.id}
            className="kb-item"
            onClick={() =>
              canEdit &&
              setDraft({ id: a.id, title: a.title, bodyMd: a.bodyMd, locale: a.locale, tags: a.tags.join(', '), syncStatus: a.syncStatus })
            }
          >
            <div className="t">{a.title}</div>
            <div className="d">{a.bodyMd.length > 120 ? `${a.bodyMd.slice(0, 120)}…` : a.bodyMd}</div>
            <div className="tags">
              {a.tags.map((g) => (
                <span key={g} className="tag">
                  {g}
                </span>
              ))}
              <span className={`tag ${a.syncStatus === 'synced' ? 'sync' : 'stale'}`}>
                {a.syncStatus === 'synced' ? t.kbSynced : t.kbPending}
              </span>
              {a.excludedFromEva && <span className="tag stale">{t.kbExcluded}</span>}
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div style={{ color: 'var(--muted)', fontSize: 13, padding: 30, textAlign: 'center' }}>{t.kbEmpty}</div>
        )}
      </div>
    </>
  );
}
