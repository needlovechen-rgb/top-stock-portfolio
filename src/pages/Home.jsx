import React, { useState } from 'react';
import StockList from '../components/StockList';
import { useStockContext } from '../context/StockContext';
import { STOCK_NAME_MAP } from '../utils/mockData';
import { fetchStockName } from '../services/stockApi';
import { Plus, BookOpen, TrendingUp, Info } from 'lucide-react';

const Home = () => {
  const { addStock, stocks } = useStockContext();
  const [symbol, setSymbol] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  const handleSymbolChange = (e) => {
    const val = e.target.value.replace(/[^0-9A-Za-z]/g, ''); // 只允許代號字元
    setSymbol(val);
    setError('');
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    setError('');
    const s = symbol.trim();

    if (!s) {
      setError('請填寫股票代號');
      return;
    }
    if (stocks.length >= 100) {
      setError('最多只能加入 100 檔股票');
      return;
    }
    if (stocks.find(st => st.symbol === s)) {
      setError(`${s} 已在清單中`);
      return;
    }

    setIsSearching(true);
    try {
      const foundName = await fetchStockName(s);
      if (foundName) {
        addStock(s, foundName);
        setSymbol('');
      } else {
        setError(`查無此股票代號 (${s})`);
      }
    } catch (err) {
      setError('網路連線失敗，請稍後再試');
    } finally {
      setIsSearching(false);
    }
  };

  const isFull = stocks.length >= 100;
  const pct = (stocks.length / 100) * 100;

  return (
    <div className="animate-fade-in">
      {/* ── Hero Header ── */}
      <header style={{ textAlign: 'center', padding: '3rem 0 2.5rem' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '14px',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(59,130,246,0.4)'
          }}>
            <BookOpen size={24} color="white" />
          </div>
        </div>

        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3rem)', marginBottom: '0.75rem' }}>
          <span className="gradient-text">績優股存摺</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.05rem', maxWidth: '420px', margin: '0 auto' }}>
          管理您精選的台股清單，追蹤十年財務指標
        </p>

        {/* 統計列 */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginTop: '2rem', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: '-0.04em' }}>
              {stocks.length}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>已追蹤股票</div>
          </div>
          <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--purple)', letterSpacing: '-0.04em' }}>
              {100 - stocks.length}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>剩餘名額</div>
          </div>
          <div style={{ width: 1, background: 'var(--border)', alignSelf: 'stretch' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--success)', letterSpacing: '-0.04em' }}>
              10<span style={{ fontSize: '1rem' }}>年</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '2px' }}>歷史資料</div>
          </div>
        </div>
      </header>

      {/* ── 新增股票區塊 ── */}
      <div className="glass-panel animate-fade-in-delay-1" style={{ marginBottom: '1.5rem' }}>
        <div className="flex-row" style={{ gap: '0.5rem', marginBottom: '1.25rem' }}>
          <TrendingUp size={18} style={{ color: 'var(--accent)' }} />
          <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>新增股票</h2>
          {isFull && <span className="badge badge--red" style={{ marginLeft: 'auto' }}>已達上限</span>}
        </div>

        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <input
              id="stock-symbol-input"
              type="text"
              placeholder="輸入股票代號（如：2330）"
              className="input-field"
              value={symbol}
              onChange={handleSymbolChange}
              disabled={isFull || isSearching}
              maxLength={6}
            />
          </div>
          <button
            id="add-stock-btn"
            type="submit"
            className="btn btn-primary"
            disabled={isFull || isSearching}
            style={{ padding: '0.7rem 1.5rem', minWidth: '110px', justifyContent: 'center' }}
          >
            {isSearching ? '查詢中...' : (
              <>
                <Plus size={18} /> 新增
              </>
            )}
          </button>
        </form>

        {error && (
          <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Info size={14} /> {error}
          </p>
        )}

        {/* 進度條 */}
        <div style={{ marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
            <span>清單使用量</span>
            <span style={{ color: isFull ? 'var(--danger)' : 'var(--text-secondary)', fontWeight: 600 }}>
              {stocks.length} / 100
            </span>
          </div>
          <div className="progress-bar">
            <div
              className="progress-bar__fill"
              style={{ width: `${pct}%`, background: isFull ? 'var(--danger)' : undefined }}
            />
          </div>
        </div>
      </div>

      {/* ── 股票清單 ── */}
      <div className="glass-panel animate-fade-in-delay-2">
        <div className="flex-row justify-between" style={{ marginBottom: stocks.length > 0 ? '0.5rem' : 0 }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>我的股票清單</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>拖曳可排序</span>
        </div>

        <StockList />

        {stocks.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__icon">📋</div>
            <p className="empty-state__title">清單是空的</p>
            <p className="empty-state__desc">
              輸入台股代號與公司名稱，將您精選的績優股加入清單，
              點擊後可查看近十年財務指標。
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Home;
