import { defaultStocks } from '../utils/mockData';
import React, { createContext, useContext, useState, useEffect } from 'react';

const StockContext = createContext();

export const useStockContext = () => useContext(StockContext);

export const StockProvider = ({ children }) => {
  const [stocks, setStocks] = useState(() => {
    const saved = localStorage.getItem('stock-passbook');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error('Failed to parse local storage stocks', e);
      }
    }
    return defaultStocks; // 首次啟動預設 20 檔台股
  });

  useEffect(() => {
    localStorage.setItem('stock-passbook', JSON.stringify(stocks));
  }, [stocks]);

  const addStock = (symbol, name) => {
    if (!symbol || !name) return;
    if (stocks.find(s => s.symbol === symbol)) return;
    setStocks(prev => [...prev, { symbol, name }]);
  };

  const removeStock = (symbol) => {
    setStocks(prev => prev.filter(s => s.symbol !== symbol));
  };

  const reorderStocks = (newStocks) => {
    setStocks(newStocks);
  };

  return (
    <StockContext.Provider value={{ stocks, addStock, removeStock, reorderStocks }}>
      {children}
    </StockContext.Provider>
  );
};
