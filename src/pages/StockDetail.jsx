import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useStockContext } from '../context/StockContext';
import { fetchPriceHistory, fetchPEHistory, fetchDividendHistory } from '../services/stockApi';
import { ArrowLeft, RefreshCw, TrendingUp, BarChart2, DollarSign, Activity, Percent } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ComposedChart, Area,
} from 'recharts';

// ── Custom Tooltip ────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(6,13,26,0.97)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 10,
      padding: '0.7rem 1rem',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      fontSize: '0.85rem',
    }}>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '0.4rem', fontSize: '0.78rem' }}>{label}</p>
      {payload.map(entry => (
        <p key={entry.name} style={{ color: entry.color, margin: '2px 0' }}>
          {entry.name}：<strong>{entry.value !== null && entry.value !== undefined ? entry.value : 'N/A'}</strong>
        </p>
      ))}
    </div>
  );
};

// ── Chart Card ────────────────────────────────────────────────
const ChartCard = ({ title, icon: Icon, iconColor, children, height = 280 }) => (
  <div className="glass-panel" style={{ marginBottom: '1.5rem' }}>
    <div className="flex-row" style={{ gap: '0.6rem', marginBottom: '1.25rem' }}>
      {Icon && <Icon size={18} style={{ color: iconColor || 'var(--accent)' }} />}
      <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0 }}>{title}</h3>
    </div>
    <div style={{ width: '100%', height }}>
      {children}
    </div>
  </div>
);

// ── Loading / Empty ──────────────────────────────────────────
const LoadingSpinner = ({ message }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', padding: '3rem 0' }}>
    <div className="spinner" />
    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{message}</p>
  </div>
);

const EmptyChart = ({ message }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
    {message}
  </div>
);

// ── Shared chart props ────────────────────────────────────────
const GRID_PROPS = { strokeDasharray: '3 3', stroke: 'rgba(255,255,255,0.06)' };
const AXIS_PROPS = { stroke: 'transparent', tick: { fill: 'var(--text-secondary)', fontSize: 11 } };

// ── Main Page ─────────────────────────────────────────────────
const StockDetail = () => {
  const { symbol } = useParams();
  const navigate = useNavigate();
  const { stocks } = useStockContext();
  const stock = stocks.find(s => s.symbol === symbol) || { symbol, name: symbol };

  const [priceHistory, setPriceHistory] = useState([]);
  const [peHistory, setPeHistory] = useState([]);
  const [dividendHistory, setDividendHistory] = useState([]);
  const [roeHistory, setRoeHistory] = useState([]);
  const [stage, setStage] = useState('idle'); // idle | price | pe | dividend | done | error
  const [errorMsg, setErrorMsg] = useState(null);

  const loadData = useCallback(async () => {
    setStage('price');
    setErrorMsg(null);
    try {
      const prices = await fetchPriceHistory(symbol);
      setPriceHistory(prices);

      setStage('pe');
      const peData = await fetchPEHistory(symbol);
      setPeHistory(peData);

      // 計算真實 ROE (PBR / PE * 100)
      const roes = peData.map(d => {
        let roeVal = null;
        if (d.pe && d.pbr && d.pe > 0) {
          roeVal = parseFloat(((d.pbr / d.pe) * 100).toFixed(2));
        }
        return {
          year: d.year,
          roe: roeVal
        };
      }).filter(d => d.roe !== null);
      setRoeHistory(roes);

      setStage('dividend');
      const divData = await fetchDividendHistory(symbol);
      setDividendHistory(divData);

      setStage('done');
    } catch (e) {
      console.error('loadData error:', e);
      setErrorMsg(e.message || '資料載入失敗');
      setStage('error');
    }
  }, [symbol]);

  useEffect(() => { loadData(); }, [loadData]);

  const stageMsg = {
    price: '正在抓取近 10 年每月股價（請稍候，約需 1~2 分鐘）…',
    pe: '正在抓取歷年本益比 / 殖利率…',
    dividend: '正在抓取歷年配息資料…',
  };

  const isLoading = !['done', 'error', 'idle'].includes(stage);

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '5rem' }}>

      {/* ── Header ── */}
      <div className="glass-panel" style={{ marginBottom: '1.5rem', padding: '1.25rem 1.5rem' }}>
        <div className="flex-row justify-between" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <div className="flex-row" style={{ gap: '1rem' }}>
            <button className="btn-icon" onClick={() => navigate(-1)} title="回首頁" style={{ border: '1px solid var(--border)' }}>
              <ArrowLeft size={20} />
            </button>
            <div>
              <div className="flex-row" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
                <h1 style={{ fontSize: '1.6rem', letterSpacing: '-0.04em' }}>{stock.name}</h1>
                <span className="badge badge--blue" style={{ fontSize: '0.85rem', padding: '0.25rem 0.75rem' }}>
                  {stock.symbol}
                </span>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', marginTop: '0.2rem' }}>
                近十年財務指標 · 資料來源：台灣證券交易所
              </p>
            </div>
          </div>

          <button
            className="btn btn-ghost"
            onClick={loadData}
            disabled={isLoading}
          >
            <RefreshCw size={15} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
            重新整理
          </button>
        </div>

        {/* 載入進度條 */}
        {isLoading && (
          <div style={{ marginTop: '1rem' }}>
            <div className="progress-bar">
              <div className="progress-bar__fill" style={{ width: stage === 'price' ? '33%' : stage === 'pe' ? '66%' : '90%', transition: 'width 0.6s ease' }} />
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
              {stageMsg[stage]}
            </p>
          </div>
        )}
      </div>

      {/* ── Error State ── */}
      {stage === 'error' && (
        <div className="glass-panel" style={{ marginBottom: '1.5rem', borderColor: 'var(--danger)', background: 'var(--danger-light)' }}>
          <p style={{ color: 'var(--danger)', textAlign: 'center' }}>⚠️ {errorMsg}</p>
        </div>
      )}

      {/* ── 1. 近十年月股價走勢 ── */}
      <ChartCard title="近十年每月股價走勢（最高 / 最低 / 平均收盤）" icon={TrendingUp} height={300}>
        {priceHistory.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={priceHistory} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="date" {...AXIS_PROPS} minTickGap={60} />
              <YAxis {...AXIS_PROPS} width={60} domain={['auto', 'auto']} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '0.8rem', paddingTop: '0.5rem' }} />
              <Area
                type="monotone"
                dataKey="high"
                name="最高價"
                stroke="#34d399"
                fill="rgba(52,211,153,0.08)"
                strokeWidth={1.5}
                dot={false}
                strokeDasharray="4 3"
              />
              <Line type="monotone" dataKey="avg" name="平均收盤" stroke="#60a5fa" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="low" name="最低價" stroke="#f87171" strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message={isLoading ? '載入中…' : '查無股價資料'} />
        )}
      </ChartCard>

      {/* ── 2x2 Grid：ROE / PE / 殖利率 / 配息 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '1.5rem' }}>

        {/* ROE */}
        <ChartCard title="歷年股東權益報酬率（ROE %，由 PBR/PE 估算）" icon={Activity} iconColor="var(--purple)" height={250}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={roeHistory} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="year" {...AXIS_PROPS} />
              <YAxis {...AXIS_PROPS} unit="%" width={45} domain={['auto', 'auto']} />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="roe"
                name="ROE (%)"
                stroke="#a78bfa"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#a78bfa', strokeWidth: 2, stroke: '#1e1b4b' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* PE */}
        <ChartCard title="歷年本益比（PE）" icon={BarChart2} iconColor="var(--cyan)" height={250}>
          {peHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={peHistory} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="year" {...AXIS_PROPS} />
                <YAxis {...AXIS_PROPS} width={40} domain={['auto', 'auto']} />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="pe"
                  name="本益比"
                  stroke="#22d3ee"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#22d3ee', strokeWidth: 2, stroke: '#0c2a30' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message={isLoading ? '載入中…' : '查無本益比資料'} />
          )}
        </ChartCard>

        {/* 殖利率 */}
        <ChartCard title="歷年現金殖利率（%）" icon={Percent} iconColor="var(--warning)" height={250}>
          {peHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={peHistory} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="year" {...AXIS_PROPS} />
                <YAxis {...AXIS_PROPS} unit="%" width={40} domain={[0, 'auto']} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Bar dataKey="yield" name="殖利率 (%)" fill="#f59e0b" radius={[5, 5, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message={isLoading ? '載入中…' : '查無殖利率資料'} />
          )}
        </ChartCard>

        {/* 配息 */}
        <ChartCard title="歷年股利（現金 / 股票，元/股）" icon={DollarSign} iconColor="var(--success)" height={250}>
          {dividendHistory.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dividendHistory} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="year" {...AXIS_PROPS} />
                <YAxis {...AXIS_PROPS} unit="元" width={45} domain={[0, 'auto']} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
                <Bar dataKey="cashDividend" name="現金股利" stackId="a" fill="#10b981" maxBarSize={30} />
                <Bar dataKey="stockDividend" name="股票股利" stackId="a" fill="#3b82f6" radius={[5, 5, 0, 0]} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message={isLoading ? '載入中…' : '查無配息資料'} />
          )}
        </ChartCard>
      </div>

      {/* ── 配息明細表格 ── */}
      {dividendHistory.length > 0 && (
        <div className="glass-panel animate-fade-in-delay-3" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: '1.25rem' }}>歷年股利明細</h3>
          <div style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  {['年度', '現金股利（元）', '股票股利（元）', '合計（元）'].map(col => (
                    <th key={col}>{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...dividendHistory].reverse().map(row => (
                  <tr key={row.year}>
                    <td style={{ fontWeight: 700 }}>{row.year}</td>
                    <td style={{ color: 'var(--success)' }}>{row.cashDividend.toFixed(2)}</td>
                    <td style={{ color: 'var(--accent)' }}>{row.stockDividend.toFixed(2)}</td>
                    <td style={{ fontWeight: 700 }}>
                      {(row.cashDividend + row.stockDividend).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 回首頁按鈕 ── */}
      <div style={{ textAlign: 'center' }}>
        <button className="btn btn-primary" onClick={() => navigate(-1)} style={{ padding: '0.8rem 2.5rem', fontSize: '0.95rem' }}>
          <ArrowLeft size={18} /> 回首頁
        </button>
      </div>
    </div>
  );
};

export default StockDetail;
