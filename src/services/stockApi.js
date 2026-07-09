/**
 * TWSE API Service
 * 台灣證券交易所 API 服務
 *
 * 資料來源:
 * - 股價月資料: /twse/exchangeReport/STOCK_DAY (via Vite proxy)
 * - 本益比(PE)/殖利率: /twse/exchangeReport/BWIBBU (via Vite proxy)
 * - 配息: /twse-open/v1/opendata/t187ap45_L (TWSE OpenAPI, has CORS support)
 *
 * 緩存策略:
 * - 每檔股票、每種資料類型個別存在 localStorage
 * - 只抓取尚未存在的月份/年份（增量更新）
 * - key: `stock_cache_${type}_${symbol}`
 */

import { STOCK_NAME_MAP } from '../utils/mockData';

const CACHE_PREFIX = 'stock_cache_';
const PRICE_DELAY_MS = 1200;  // 股價 API 間隔
const PE_DELAY_MS = 800;       // PE API 間隔（資料量小）

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ==================== 環境偵測 ====================
const isProd = typeof window !== 'undefined' &&
  window.location.hostname !== 'localhost' &&
  window.location.hostname !== '127.0.0.1';

// 生產環境用 corsproxy.io 繞過 CORS；開發環境用 Vite proxy
const twseUrl = (path) => isProd
  ? `https://corsproxy.io/?url=${encodeURIComponent('https://www.twse.com.tw' + path)}`
  : `/twse${path}`;

const twseOpenUrl = (path) => isProd
  ? `https://corsproxy.io/?url=${encodeURIComponent('https://openapi.twse.com.tw' + path)}`
  : `/twse-open${path}`;

const tpexUrl = (path) => isProd
  ? `https://corsproxy.io/?url=${encodeURIComponent('https://www.tpex.org.tw' + path)}`
  : `/tpex${path}`;



// ==================== 緩存工具 ====================
const getCache = (type, symbol) => {
  const raw = localStorage.getItem(`${CACHE_PREFIX}${type}_${symbol}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const setCache = (type, symbol, data) => {
  localStorage.setItem(`${CACHE_PREFIX}${type}_${symbol}`, JSON.stringify(data));
};

// ==================== 股價月資料 ====================
/**
 * 取得單月的日資料，並聚合為月資料 (最高/最低/平均)
 * TWSE STOCK_DAY API 每次請求回傳一個月份的每日資料
 * @returns { date, high, low, avg, year, monthNum } | null
 */
const fetchMonthPriceFromTWSE = async (symbol, year, month) => {
  const dateStr = `${year}${String(month).padStart(2, '0')}01`;
  const url = twseUrl(`/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${symbol}`);

  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const json = await resp.json();

    if (json.stat !== 'OK' || !Array.isArray(json.data) || json.data.length === 0) {
      return null;
    }

    // json.data 每筆: [日期, 成交股數, 成交金額, 開盤價, 最高價, 最低價, 收盤價, 漲跌價差, 成交筆數]
    const highs = json.data.map((d) => parseFloat(d[4].replace(/,/g, ''))).filter((v) => !isNaN(v));
    const lows = json.data.map((d) => parseFloat(d[5].replace(/,/g, ''))).filter((v) => !isNaN(v));
    const closes = json.data.map((d) => parseFloat(d[6].replace(/,/g, ''))).filter((v) => !isNaN(v));

    if (highs.length === 0) return null;

    const high = Math.max(...highs);
    const low = Math.min(...lows);
    const avg = parseFloat((closes.reduce((a, b) => a + b, 0) / closes.length).toFixed(2));

    return {
      date: `${year}-${String(month).padStart(2, '0')}`,
      year,
      monthNum: month,
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      avg,
    };
  } catch (e) {
    console.error(`fetchMonthPriceFromTWSE error (${symbol} ${year}/${month}):`, e);
    return null;
  }
};

/**
 * 取得近 10 年的月股價資料 (有緩存機制)
 */
export const fetchPriceHistory = async (symbol) => {
  const cachedData = getCache('price', symbol) || {};

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // 計算預期需要的 YYYY-MM 清單 (近 10 年，不包含當前進行中的月份)
  const expectedKeys = [];
  for (let y = currentYear - 9; y <= currentYear; y++) {
    const maxMonth = y === currentYear ? currentMonth - 1 : 12;
    for (let m = 1; m <= maxMonth; m++) {
      expectedKeys.push(`${y}-${String(m).padStart(2, '0')}`);
    }
  }

  // 檢查是否缺任何月份的資料
  const missingKeys = expectedKeys.filter((k) => !cachedData[k]);

  if (missingKeys.length > 0) {
    console.log(`[${symbol}] 股價快取不完整，嘗試從 FinMind 抓取 10 年日股價...`);
    try {
      const startYear = currentYear - 10;
      const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${symbol}&start_date=${startYear}-01-01`;
      const resp = await fetch(url);
      if (resp.ok) {
        const json = await resp.json();
        if (json.status === 200 && Array.isArray(json.data) && json.data.length > 0) {
          const monthlyMap = {};
          json.data.forEach((row) => {
            const ym = row.date.substring(0, 7);
            const [yStr, mStr] = ym.split('-');
            const year = parseInt(yStr);
            const monthNum = parseInt(mStr);

            if (!monthlyMap[ym]) {
              monthlyMap[ym] = {
                date: ym,
                year,
                monthNum,
                highs: [],
                lows: [],
                closes: [],
              };
            }
            if (row.max !== undefined && row.max !== null) monthlyMap[ym].highs.push(row.max);
            if (row.min !== undefined && row.min !== null) monthlyMap[ym].lows.push(row.min);
            if (row.close !== undefined && row.close !== null) monthlyMap[ym].closes.push(row.close);
          });

          Object.entries(monthlyMap).forEach(([ym, m]) => {
            if (m.highs.length > 0 && m.lows.length > 0 && m.closes.length > 0) {
              const high = Math.max(...m.highs);
              const low = Math.min(...m.lows);
              const avg = parseFloat(
                (m.closes.reduce((a, b) => a + b, 0) / m.closes.length).toFixed(2)
              );
              cachedData[ym] = {
                date: ym,
                year: m.year,
                monthNum: m.monthNum,
                high: parseFloat(high.toFixed(2)),
                low: parseFloat(low.toFixed(2)),
                avg,
              };
            }
          });

          setCache('price', symbol, cachedData);
          console.log(`[${symbol}] FinMind 股價載入並聚合成功。`);
        }
      }
    } catch (e) {
      console.warn(`[${symbol}] fetchPriceHistory FinMind failed, falling back to TWSE:`, e);
    }
  }

  // Fallback: 如果 FinMind 失敗或未補滿，使用 TWSE 逐月抓取 (僅限上市股票)
  const finalMissingKeys = expectedKeys.filter((k) => !cachedData[k]);
  if (finalMissingKeys.length > 0) {
    console.log(`[${symbol}] FinMind 未能填補所有資料，開始 Fallback 逐月向 TWSE 抓取剩餘的 ${finalMissingKeys.length} 個月資料...`);
    let saved = 0;
    for (const key of finalMissingKeys) {
      const [yStr, mStr] = key.split('-');
      const year = parseInt(yStr);
      const month = parseInt(mStr);
      const result = await fetchMonthPriceFromTWSE(symbol, year, month);
      if (result) {
        cachedData[key] = result;
      }
      saved++;
      if (saved % 12 === 0) {
        setCache('price', symbol, cachedData);
      }
      await sleep(PRICE_DELAY_MS);
    }
    setCache('price', symbol, cachedData);
  }

  return Object.values(cachedData).sort((a, b) => a.date.localeCompare(b.date));
};

// ==================== 本益比 (PE) & 殖利率 ====================
/**
 * 取得單月的 PE & 殖利率 (BWIBBU API)
 * @returns { year, monthNum, pe, yield } | null
 */
const fetchMonthPEFromTWSE = async (symbol, year, month) => {
  const dateStr = `${year}${String(month).padStart(2, '0')}01`;
  const url = twseUrl(`/exchangeReport/BWIBBU?response=json&date=${dateStr}&stockNo=${symbol}`);

  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const json = await resp.json();
    if (json.stat !== 'OK' || !Array.isArray(json.data) || json.data.length === 0) return null;

    // BWIBBU data: [年月日, 殖利率(%), 股利年度, 本益比, 股價淨值比, 財報年/季]
    // 取月中的最後一筆作為代表值
    const lastRow = json.data[json.data.length - 1];
    const pe = parseFloat(lastRow[3].replace(/,/g, ''));
    const divYield = parseFloat(lastRow[1].replace(/,/g, ''));
    const pbr = parseFloat(lastRow[4].replace(/,/g, ''));

    if (isNaN(pe)) return null;

    return {
      date: `${year}-${String(month).padStart(2, '0')}`,
      year,
      monthNum: month,
      pe: isNaN(pe) ? null : pe,
      yield: isNaN(divYield) ? null : divYield,
      pbr: isNaN(pbr) ? null : pbr,
    };
  } catch (e) {
    console.error(`fetchMonthPEFromTWSE error (${symbol} ${year}/${month}):`, e);
    return null;
  }
};

/**
 * 取得近 10 年的年度 PE 資料 (每年取 12 月份的 PE 為代表值)
 */
export const fetchPEHistory = async (symbol) => {
  const cachedData = getCache('pe', symbol) || {};

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  // 檢查是否缺任何歷史年份的資料，或者需要更新當前年度
  const expectedYears = [];
  for (let y = currentYear - 9; y <= currentYear; y++) {
    expectedYears.push(y);
  }

  // 只要缺歷史年份，或要重抓今年，就觸發抓取
  const missingYears = expectedYears.filter((y) => !cachedData[y] || y === currentYear);

  if (missingYears.length > 0) {
    console.log(`[${symbol}] PE 快取不完整或需更新今年，嘗試從 FinMind 抓取 10 年本益比...`);
    try {
      const startYear = currentYear - 10;
      const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPER&data_id=${symbol}&start_date=${startYear}-01-01`;
      const resp = await fetch(url);
      if (resp.ok) {
        const json = await resp.json();
        if (json.status === 200 && Array.isArray(json.data) && json.data.length > 0) {
          const yearlyMap = {};
          json.data.forEach((row) => {
            const year = parseInt(row.date.substring(0, 4));
            if (year >= currentYear - 9 && year <= currentYear) {
              yearlyMap[year] = {
                year,
                pe: row.PER <= 0 ? null : parseFloat(row.PER.toFixed(2)),
                yield: parseFloat(row.dividend_yield.toFixed(2)),
                pbr: parseFloat(row.PBR.toFixed(2)),
              };
            }
          });

          Object.entries(yearlyMap).forEach(([year, data]) => {
            cachedData[year] = data;
          });

          setCache('pe', symbol, cachedData);
          console.log(`[${symbol}] FinMind 本益比載入成功。`);
        }
      }
    } catch (e) {
      console.warn(`[${symbol}] fetchPEHistory FinMind failed, falling back to TWSE:`, e);
    }
  }

  // Fallback: 如果仍然缺某些年份，或者 FinMind 失敗，則退回 TWSE 逐年抓取邏輯 (僅限上市股票)
  const finalMissingYears = expectedYears.filter((y) => !cachedData[y] || y === currentYear);
  if (finalMissingYears.length > 0) {
    console.log(`[${symbol}] FinMind 未能填補所有 PE 資料，開始 Fallback 逐年向 TWSE 抓取剩餘的 ${finalMissingYears.length} 個年度資料...`);
    for (const year of finalMissingYears) {
      const month = year === currentYear
        ? (currentMonth > 1 ? currentMonth - 1 : 12)
        : 12;
      const fetchYear = (year === currentYear && currentMonth === 1) ? year - 1 : year;
      const result = await fetchMonthPEFromTWSE(symbol, fetchYear, month);
      if (result) {
        cachedData[year] = { year, pe: result.pe, yield: result.yield, pbr: result.pbr };
      }
      await sleep(PE_DELAY_MS);
    }
    setCache('pe', symbol, cachedData);
  }

  return Object.values(cachedData).sort((a, b) => a.year - b.year);
};

// ==================== 配息資料 ====================
/**
 * 從 FinMind API 抓取指定股票的歷年配息資料。
 * - FinMind TaiwanStockDividend 支援 CORS，無需代理
 * - 快取策略：成功抓到非空資料才快取；當日已快取則直接讀取
 */
export const fetchDividendHistory = async (symbol) => {
  const CACHE_KEY = `${CACHE_PREFIX}dividend_${symbol}`;
  const CACHE_DATE_KEY = `${CACHE_PREFIX}dividend_date_${symbol}`;

  const today = new Date().toISOString().split('T')[0];
  const cachedDate = localStorage.getItem(CACHE_DATE_KEY);
  let dividendList = null;

  // 只有當日快取且資料非空才使用
  if (cachedDate === today) {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          dividendList = parsed;
        }
      } catch {
        // 快取損毀，重新抓取
      }
    }
  }

  if (!dividendList) {
    try {
      const startYear = new Date().getFullYear() - 10;
      const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockDividend&data_id=${symbol}&start_date=${startYear}-01-01`;
      const resp = await fetch(url);
      if (resp.ok) {
        const json = await resp.json();
        if (json.status === 200 && Array.isArray(json.data) && json.data.length > 0) {
          dividendList = json.data;
          // 只有成功取得資料才寫入快取
          localStorage.setItem(CACHE_KEY, JSON.stringify(dividendList));
          localStorage.setItem(CACHE_DATE_KEY, today);
        }
      }
    } catch (e) {
      console.error('fetchDividendHistory FinMind error:', e);
    }
  }

  if (!dividendList || dividendList.length === 0) return [];

  // 聚合為年度資料
  // FinMind year 欄位格式: "103年" (民國年) → 加 1911 = 西元年
  // 備用：若 year 欄位解析失敗，用 date 欄位（除權日）的西元年
  const currentYear = new Date().getFullYear();
  const startYear = currentYear - 9;
  const yearMap = {};

  dividendList.forEach((row) => {
    let fullYear = null;

    // 優先用 year 欄位（民國年）
    if (row.year) {
      const m = String(row.year).match(/(\d+)/);
      if (m) {
        const n = parseInt(m[1]);
        fullYear = n < 200 ? n + 1911 : n; // 民國年 < 200，西元年 >= 1911
      }
    }

    // 備用：用除權日的西元年
    if (!fullYear && row.date) {
      fullYear = parseInt(String(row.date).substring(0, 4));
    }

    if (!fullYear || fullYear < startYear || fullYear > currentYear) return;

    if (!yearMap[fullYear]) {
      yearMap[fullYear] = { year: fullYear, cashDividend: 0, stockDividend: 0 };
    }

    const cash =
      parseFloat(row.CashEarningsDistribution || 0) +
      parseFloat(row.CashStatutorySurplus || 0);

    const stock =
      parseFloat(row.StockEarningsDistribution || 0) +
      parseFloat(row.StockStatutorySurplus || 0);

    yearMap[fullYear].cashDividend += isNaN(cash) ? 0 : cash;
    yearMap[fullYear].stockDividend += isNaN(stock) ? 0 : stock;
  });

  return Object.values(yearMap)
    .map((d) => ({
      ...d,
      cashDividend: parseFloat(d.cashDividend.toFixed(2)),
      stockDividend: parseFloat(d.stockDividend.toFixed(2)),
    }))
    .sort((a, b) => a.year - b.year);
};

/**
 * 透過股票代號向 TWSE 查詢股票名稱
 * 策略：本地表 → TWSE 上市清單 API → STOCK_DAY 當月 → STOCK_DAY 上月
 * @param {string} symbol - 股票代號
 * @returns {Promise<string|null>} 股票名稱或 null (查無此股票)
 */
export const fetchStockName = async (symbol) => {
  const cleanSymbol = symbol.trim();
  if (!cleanSymbol) return null;

  // 1. 先從本地對照表查詢（最快）
  const localName = STOCK_NAME_MAP[cleanSymbol];
  if (localName) return localName;

  // 2. 向 TWSE OpenAPI 查詢上市股票清單（有 CORS 支援）
  try {
    const listUrl = twseOpenUrl('/v1/opendata/t187ap47_L');
    const listResp = await fetch(listUrl);
    if (listResp.ok) {
      const listJson = await listResp.json();
      if (Array.isArray(listJson)) {
        // 欄位格式：{ '有價證券代號': '2330', '有價證券名稱': '台積電', ... }
        const found = listJson.find(
          (item) => (item['有價證券代號'] || '').trim() === cleanSymbol
        );
        if (found) {
          const name = (found['有價證券名稱'] || '').trim();
          if (name) return name;
        }
      }
    }
  } catch (e) {
    console.warn('fetchStockName list API failed, falling back:', e);
  }

  // 3. 向 TPEX OpenAPI 查詢上櫃股票清單（有 CORS 支援）
  try {
    const listUrl = tpexUrl('/openapi/v1/tpex_mainboard_quotes');
    const listResp = await fetch(listUrl);
    if (listResp.ok) {
      const listJson = await listResp.json();
      if (Array.isArray(listJson)) {
        // 欄位格式：{ 'SecuritiesCompanyCode': '3390', 'CompanyName': '旭軟', ... }
        const found = listJson.find(
          (item) => (item['SecuritiesCompanyCode'] || '').trim() === cleanSymbol
        );
        if (found) {
          const name = (found['CompanyName'] || '').trim();
          if (name) return name;
        }
      }
    }
  } catch (e) {
    console.warn('fetchStockName TPEX list API failed, falling back:', e);
  }

  // 3. 備用：向 TWSE STOCK_DAY 查詢（解析 title 欄位取得名稱）
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const tryFetch = async (y, m) => {
    const dateStr = `${y}${String(m).padStart(2, '0')}01`;
    const url = twseUrl(`/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${cleanSymbol}`);
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      const json = await resp.json();
      if (json.stat === 'OK' && json.title) {
        const match = json.title.match(/\d+年\d+月\s+\d+\s+(.*?)\s*(?:各日成交資訊|個股日成交資訊|成交資訊|各日|$)/);
        if (match && match[1]) return match[1].trim();
      }
    } catch { /* ignore */ }
    return null;
  };

  // 當月
  const name1 = await tryFetch(year, month);
  if (name1) return name1;

  // 上個月
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const name2 = await tryFetch(prevYear, prevMonth);
  return name2 || null;
};

