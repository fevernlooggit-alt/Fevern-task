import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { t } from '../locale';
import type { MetricsRouting, MetricsSummary, MetricsTimeseries } from '../types';

type Range = 'day' | '7d' | '30d';

function fmtSeconds(s: number | null): string {
  if (s === null) return '—';
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rest = Math.round(s % 60);
  return `${m}m ${rest}s`;
}

function LineChart({ series }: { series: MetricsTimeseries['series'] }) {
  const W = 560;
  const H = 180;
  const max = Math.max(5, ...series.map((p) => Math.max(p.ai, p.human))) * 1.1;
  const pts = (get: (p: { ai: number; human: number }) => number) =>
    series
      .map((p, i) => `${((i / Math.max(1, series.length - 1)) * W).toFixed(1)},${(H - 10 - (get(p) / max) * (H - 20)).toFixed(1)}`)
      .join(' ');
  const aiPts = pts((p) => p.ai);
  const huPts = pts((p) => p.human);
  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={t.mon14d}>
      <defs>
        <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#46E3B7" stopOpacity=".25" />
          <stop offset="100%" stopColor="#46E3B7" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${H} ${aiPts} ${W},${H}`} fill="url(#gA)" />
      <polyline points={aiPts} fill="none" stroke="#46E3B7" strokeWidth="2.5" strokeLinejoin="round" />
      <polyline points={huPts} fill="none" stroke="#9D8CFF" strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" />
    </svg>
  );
}

export default function MonitorPage({ tenant }: { tenant: string }) {
  const [range, setRange] = useState<Range>('7d');
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [routing, setRouting] = useState<MetricsRouting | null>(null);
  const [series, setSeries] = useState<MetricsTimeseries | null>(null);

  const load = useCallback(async () => {
    const [s, r, ts] = await Promise.all([
      api.get<MetricsSummary>(`/tenants/${tenant}/metrics/summary?range=${range}`),
      api.get<MetricsRouting>(`/tenants/${tenant}/metrics/routing?range=${range}`),
      api.get<MetricsTimeseries>(`/tenants/${tenant}/metrics/timeseries`),
    ]);
    setSummary(s);
    setRouting(r);
    setSeries(ts);
  }, [tenant, range]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!summary || !routing || !series) return null;

  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const bars: Array<{ label: string; value: number; style?: React.CSSProperties }> = [
    { label: t.monL1, value: routing.distribution.l1 },
    { label: t.monL2, value: routing.distribution.l2, style: { background: 'linear-gradient(90deg,var(--ice),var(--violet))' } },
    { label: t.monL3, value: routing.distribution.l3, style: { background: 'linear-gradient(90deg,var(--violet),#c9b8ff)' } },
    { label: t.monHandoff, value: routing.distribution.handoff, style: { background: 'var(--amber)' } },
  ];

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {(['day', '7d', '30d'] as Range[]).map((r) => (
          <button key={r} className={`chip${range === r ? ' on' : ''}`} onClick={() => setRange(r)}>
            {r === 'day' ? t.rangeDay : r === '7d' ? t.range7d : t.range30d}
          </button>
        ))}
      </div>

      <div className="grid g4">
        <div className="card">
          <h4>{t.monToday}</h4>
          <div className="big" data-testid="mon-today">{summary.todayTickets}</div>
        </div>
        <div className="card">
          <h4>{t.monAiRate}</h4>
          <div className="big" style={{ color: 'var(--teal)' }}>
            {pct(summary.aiResolutionRate)}
          </div>
          <div className="sub">
            AI {summary.resolved.ai} / 人工 {summary.resolved.human}
          </div>
        </div>
        <div className="card">
          <h4>{t.monFirstResp}</h4>
          <div className="big">{fmtSeconds(summary.firstResponseSeconds.ai)}</div>
          <div className="sub">{t.monAiChannel(fmtSeconds(summary.firstResponseSeconds.human))}</div>
        </div>
        <div className="card">
          <h4>{t.monHandoffRate}</h4>
          <div className="big" style={{ color: 'var(--amber)' }}>
            {pct(summary.handoffRate)}
          </div>
        </div>
      </div>

      <div className="grid g2" style={{ marginTop: 16 }}>
        <div className="card">
          <h4>{t.mon14d}</h4>
          <div className="chart-wrap">
            <LineChart series={series.series} />
          </div>
          <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
            <span>
              <span style={{ color: 'var(--teal)' }}>●</span> {t.monAiResolved}
            </span>
            <span>
              <span style={{ color: 'var(--violet)' }}>●</span> {t.monHumanResolved}
            </span>
          </div>
        </div>
        <div className="card">
          <h4>{t.monRouting}</h4>
          <div style={{ marginTop: 14 }}>
            {bars.map((b) => (
              <div className="bar-row" key={b.label}>
                <span className="lbl">{b.label}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${Math.round(b.value * 100)}%`, ...b.style }} />
                </div>
                <span className="val">{Math.round(b.value * 100)}%</span>
              </div>
            ))}
          </div>
          <div className="sec-title">{t.monAgents}</div>
          {summary.agents.map((a) => (
            <div className="kv" key={a.id}>
              <span>{a.displayName}</span>
              {a.isOnline ? <b className="up">{t.monOnline(a.openTickets)}</b> : <b style={{ color: 'var(--muted)' }}>{t.monOffline}</b>}
            </div>
          ))}
          <div className="kv">
            <span>EVA（AI）</span>
            <b style={{ color: 'var(--teal)' }}>● 全天候 · 并发 24</b>
          </div>
        </div>
      </div>
    </>
  );
}
