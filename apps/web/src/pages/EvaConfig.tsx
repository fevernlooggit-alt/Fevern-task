import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { t } from '../locale';
import { useToast } from '../toast';
import type { Channel, EvaConfig, LabelAnswer } from '../types';

const MODEL_OPTIONS = ['claude-fable-5', 'claude-sonnet-4-6', 'gemini-2.5-pro'];

const CHANNEL_LABEL: Record<Channel['type'], string> = {
  email: 'Email Piping',
  telegram: 'Telegram Bot',
  livechat: '网页 LiveChat',
  whatsapp_stub: 'WhatsApp',
};

interface Props {
  tenant: string;
  canEdit: boolean;
}

export default function EvaConfigPage({ tenant, canEdit }: Props) {
  const toast = useToast();
  const [config, setConfig] = useState<EvaConfig | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [answers, setAnswers] = useState<LabelAnswer[]>([]);
  const [threshold, setThreshold] = useState(62);

  const load = useCallback(async () => {
    const [c, ch, la] = await Promise.all([
      api.get<{ config: EvaConfig }>(`/tenants/${tenant}/eva-config`),
      api.get<{ channels: Channel[] }>(`/tenants/${tenant}/channels`),
      api.get<{ labelAnswers: LabelAnswer[] }>(`/tenants/${tenant}/label-answers`),
    ]);
    setConfig(c.config);
    setThreshold(c.config.handoffConfidenceThreshold);
    setChannels(ch.channels);
    setAnswers(la.labelAnswers);
  }, [tenant]);

  useEffect(() => {
    void load();
  }, [load]);

  const patch = async (data: Partial<EvaConfig>, msg?: string) => {
    if (!canEdit || !config) return;
    const res = await api.put<{ config: EvaConfig }>(`/tenants/${tenant}/eva-config`, data);
    setConfig(res.config);
    if (msg) toast(msg);
  };

  const addAnswer = async () => {
    const created = await api.post<{ labelAnswer: LabelAnswer }>(`/tenants/${tenant}/label-answers`, {
      triggerKeywords: ['关键词'],
      locale: 'zh',
      answerBody: '标准答案…',
    });
    setAnswers((xs) => [created.labelAnswer, ...xs]);
  };

  const saveAnswer = async (a: LabelAnswer) => {
    await api.put(`/tenants/${tenant}/label-answers/${a.id}`, {
      triggerKeywords: a.triggerKeywords.filter(Boolean),
      locale: a.locale,
      answerBody: a.answerBody,
      isActive: a.isActive,
    });
    toast(t.saved);
  };

  const removeAnswer = async (id: string) => {
    await api.del(`/tenants/${tenant}/label-answers/${id}`);
    setAnswers((xs) => xs.filter((x) => x.id !== id));
  };

  if (!config) return null;

  const layers = [
    { key: 'l1Enabled' as const, ln: 'l1', code: 'L1', name: t.l1Name, desc: t.l1Desc, cost: '$0.000' },
    { key: 'l2Enabled' as const, ln: 'l2', code: 'L2', name: t.l2Name, desc: t.l2Desc, cost: '$0.0004' },
    { key: 'l3Enabled' as const, ln: 'l3', code: 'L3', name: t.l3Name, desc: t.l3Desc, cost: '$0.012' },
  ];

  return (
    <>
      <div className="grid g2">
        <div className="card">
          <h4>{t.evaLayers}</h4>
          {layers.map((l) => (
            <div className="layer" key={l.key}>
              <div className={`ln ${l.ln}`}>{l.code}</div>
              <div className="info">
                <b>{l.name}</b>
                <span>{l.desc}</span>
              </div>
              <div className="cost">{l.cost}</div>
              <label className="switch">
                <input
                  type="checkbox"
                  checked={config[l.key]}
                  disabled={!canEdit}
                  onChange={(e) => void patch({ [l.key]: e.target.checked }, `${l.code}：${e.target.checked ? '已启用' : '已停用'}`)}
                />
                <span className="slider-t" />
              </label>
            </div>
          ))}
          <div className="sec-title" style={{ marginTop: 18 }}>
            {t.thresholdTitle}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
            {t.thresholdDesc(threshold)}
          </div>
          <input
            type="range"
            min={30}
            max={95}
            value={threshold}
            disabled={!canEdit}
            aria-label={t.thresholdTitle}
            onChange={(e) => setThreshold(Number(e.target.value))}
            onMouseUp={() => void patch({ handoffConfidenceThreshold: threshold }, t.saved)}
            onTouchEnd={() => void patch({ handoffConfidenceThreshold: threshold }, t.saved)}
          />
        </div>
        <div>
          <div className="card">
            <h4>{t.modelPersona}</h4>
            <div className="kv">
              <span>{t.mainModel}</span>
              <select
                className="inp"
                value={MODEL_OPTIONS.includes(config.l3Model) ? config.l3Model : config.l3Model}
                disabled={!canEdit}
                onChange={(e) => void patch({ l3Model: e.target.value }, `主模型已切换：${e.target.value}`)}
              >
                {[...new Set([...MODEL_OPTIONS, config.l3Model])].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="kv">
              <span>{t.replyLang}</span>
              <b>{t.replyLangValue}</b>
            </div>
            <div className="kv">
              <span>{t.tone}</span>
              <select
                className="inp"
                value={config.tone}
                disabled={!canEdit}
                onChange={(e) => void patch({ tone: e.target.value as EvaConfig['tone'] }, t.saved)}
              >
                <option value="community">{t.toneCommunity}</option>
                <option value="formal">{t.toneFormal}</option>
                <option value="concise">{t.toneConcise}</option>
              </select>
            </div>
            <div className="kv">
              <span>{t.signature}</span>
              <input
                className="inp"
                style={{ width: 220 }}
                defaultValue={config.signature}
                disabled={!canEdit}
                onBlur={(e) => {
                  if (e.target.value !== config.signature) void patch({ signature: e.target.value }, t.saved);
                }}
              />
            </div>
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <h4>{t.channels}</h4>
            {channels.map((c) => (
              <div className="kv" key={c.id}>
                <span>{CHANNEL_LABEL[c.type]}</span>
                {c.status === 'active' ? (
                  <b className="up">{t.chConnected}</b>
                ) : (
                  <b style={{ color: 'var(--muted)' }}>{t.chDisconnected}</b>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <h4 style={{ marginBottom: 0 }}>{t.labelAnswers}</h4>
          <span style={{ marginLeft: 'auto' }}>
            {canEdit ? (
              <button className="btn btn-teal" onClick={() => void addAnswer()}>
                {t.laAdd}
              </button>
            ) : (
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t.adminOnly}</span>
            )}
          </span>
        </div>
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: '22%' }}>{t.laKeywords}</th>
              <th style={{ width: 70 }}>{t.laLocale}</th>
              <th>{t.laAnswer}</th>
              <th style={{ width: 50 }}>{t.laHits}</th>
              <th style={{ width: 50 }}>{t.laActive}</th>
              {canEdit && <th style={{ width: 130 }} />}
            </tr>
          </thead>
          <tbody>
            {answers.map((a) => (
              <tr key={a.id}>
                <td>
                  <input
                    className="inp"
                    style={{ width: '100%' }}
                    value={a.triggerKeywords.join(', ')}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setAnswers((xs) =>
                        xs.map((x) => (x.id === a.id ? { ...x, triggerKeywords: e.target.value.split(/[,，]\s*/) } : x)),
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    className="inp"
                    style={{ width: 56 }}
                    value={a.locale}
                    disabled={!canEdit}
                    onChange={(e) => setAnswers((xs) => xs.map((x) => (x.id === a.id ? { ...x, locale: e.target.value } : x)))}
                  />
                </td>
                <td>
                  <textarea
                    className="inp"
                    style={{ width: '100%', minHeight: 44 }}
                    value={a.answerBody}
                    disabled={!canEdit}
                    onChange={(e) => setAnswers((xs) => xs.map((x) => (x.id === a.id ? { ...x, answerBody: e.target.value } : x)))}
                  />
                </td>
                <td style={{ fontFamily: 'monospace' }}>{a.hitCount}</td>
                <td>
                  <input
                    type="checkbox"
                    checked={a.isActive}
                    disabled={!canEdit}
                    onChange={(e) => setAnswers((xs) => xs.map((x) => (x.id === a.id ? { ...x, isActive: e.target.checked } : x)))}
                  />
                </td>
                {canEdit && (
                  <td>
                    <button className="btn btn-ghost" style={{ padding: '6px 10px' }} onClick={() => void saveAnswer(a)}>
                      {t.save}
                    </button>{' '}
                    <button className="btn btn-danger" style={{ padding: '6px 10px' }} onClick={() => void removeAnswer(a.id)}>
                      {t.delete}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
