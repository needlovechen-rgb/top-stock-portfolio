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
  const url = `/twse/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${symbol}`;

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

  const monthsToFetch = [];
  for (let y = currentYear - 9; y <= currentYear; y++) {
    const maxMonth = y === currentYear ? currentMonth - 1 : 12; // 當月還未結束跳過
    for (let m = 1; m <= maxMonth; m++) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      if (!cachedData[key]) {
        monthsToFetch.push({ year: y, month: m, key });
      }
    }
  }

  if (monthsToFetch.length > 0) {
    console.log(`[${symbol}] 股價需抓取 ${monthsToFetch.length} 個月份的資料...`);
    let saved = 0;
    for (const { year, month, key } of monthsToFetch) {
      const result = await fetchMonthPriceFromTWSE(symbol, year, month);
      if (result) {
        cachedData[key] = result;
      }
      saved++;
      // 每 12 筆儲存一次，避免中途中斷遺失資料
      if (saved % 12 === 0) {
        setCache('price', symbol, cachedData);
      }
      await sleep(PRICE_DELAY_MS);
    }
    setCache('price', symbol, cachedData);
  }

  // 排序後回傳
  return Object.values(cachedData).sort((a, b) => a.date.localeCompare(b.date));
};

// ==================== 本益比 (PE) & 殖利率 ====================
/**
 * 取得單月的 PE & 殖利率 (BWIBBU API)
 * @returns { year, monthNum, pe, yield } | null
 */
const fetchMonthPEFromTWSE = async (symbol, year, month) => {
  const dateStr = `${year}${String(month).padStart(2, '0')}01`;
  const url = `/twse/exchangeReport/BWIBBU?response=json&date=${dateStr}&stockNo=${symbol}`;

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
  const currentMonth = new Date().getMonth() + 1; // 1-12
  const yearsToFetch = [];
  for (let y = currentYear - 9; y < currentYear; y++) {
    if (!cachedData[y]) {
      yearsToFetch.push(y);
    }
  }
  // 當年度每次都重抓（更新最新 PE）
  yearsToFetch.push(currentYear);

  if (yearsToFetch.length > 0) {
    console.log(`[${symbol}] PE 需抓取 ${yearsToFetch.length} 個年度...`);
    for (const year of yearsToFetch) {
      // 歷史年取 12 月，當年取上個月（若是 1 月就取 12 月份）
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
 * 從 TWSE OpenAPI 抓取全部上市公司的配息資料，
 * 然後過濾出指定股票代號的資料。
 * 此 API 回傳所有公司歷年資料，故只需抓一次並全量緩存。
 */
export const fetchDividendHistory = async (symbol) => {
  const DIVIDEND_CACHE_KEY = 'all_dividends_v2';
  const DIVIDEND_CACHE_DATE_KEY = 'all_dividends_date_v2';

  const cachedDate = localStorage.getItem(DIVIDEND_CACHE_DATE_KEY);
  const today = new Date().toISOString().split('T')[0];
  let allDividends = null;

  // 如果今天已抓過就直接用 cache
  if (cachedDate !== today) {
    try {
      const resp = await fetch('/twse-open/v1/opendata/t187ap45_L');
      if (resp.ok) {
        const json = await resp.json();
        if (Array.isArray(json)) {
          allDividends = json;
          localStorage.setItem(DIVIDEND_CACHE_KEY, JSON.stringify(json));
          localStorage.setItem(DIVIDEND_CACHE_DATE_KEY, today);
        }
      }
    } catch (e) {
      console.error('fetchDividendHistory error:', e);
    }
  }

  if (!allDividends) {
    const raw = localStorage.getItem(DIVIDEND_CACHE_KEY);
    allDividends = raw ? JSON.parse(raw) : [];
  }

  // 過濾該股票，欄位: 公司代號, 股利年度, 現金股利(元/股), 股票股利(元/股) 等
  const filtered = allDividends.filter((d) => d['公司代號'] === symbol);

  // 聚合為年度資料
  const yearMap = {};
  filtered.forEach((row) => {
    const year = parseInt(row['股利年度']);
    if (!year || isNaN(year)) return;
    const fullYear = year < 1000 ? year + 1911 : year; // 民國轉西元

    if (!yearMap[fullYear]) {
      yearMap[fullYear] = { year: fullYear, cashDividend: 0, stockDividend: 0 };
    }

    const cashPerShare =
      parseFloat(row['股東配發-盈餘分配之現金(股利)(元/股)'] || 0) +
      parseFloat(row['股東配發-法定盈餘公積發放之現金(元/股)'] || 0) +
      parseFloat(row['股東配發-資本公積發放之現金(元/股)'] || 0);

    const stockPerShare =
      parseFloat(row['股東配發-盈餘轉增資配股(元/股)'] || 0) +
      parseFloat(row['股東配發-法定盈餘公積轉增資配股(元/股)'] || 0) +
      parseFloat(row['股東配發-資本公積轉增資配股(元/股)'] || 0);

    yearMap[fullYear].cashDividend += isNaN(cashPerShare) ? 0 : cashPerShare;
    yearMap[fullYear].stockDividend += isNaN(stockPerShare) ? 0 : stockPerShare;
  });

  const currentYear = new Date().getFullYear();
  return Object.values(yearMap)
    .filter((d) => d.year >= currentYear - 9 && d.year <= currentYear)
    .map((d) => ({
      ...d,
      cashDividend: parseFloat(d.cashDividend.toFixed(2)),
      stockDividend: parseFloat(d.stockDividend.toFixed(2)),
    }))
    .sort((a, b) => a.year - b.year);
};

/**
 * 透過股票代號向 TWSE 查詢股票名稱
 * @param {string} symbol - 股票代號
 * @returns {Promise<string|null>} 股票名稱或 null (查無此股票)
 */
export const fetchStockName = async (symbol) => {
  const cleanSymbol = symbol.trim();
  if (!cleanSymbol) return null;

  // 1. 先從本地對照表查詢
  const localName = STOCK_NAME_MAP[cleanSymbol];
  if (localName) return localName;

  // 2. 本地查無，向證交所 API 查詢名稱
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  // 嘗試查詢當月份個股日成交資訊
  let dateStr = `${year}${String(month).padStart(2, '0')}01`;
  let url = `/twse/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${cleanSymbol}`;

  try {
    let resp = await fetch(url);
    if (!resp.ok) return null;
    let json = await resp.json();

    // 如果當期沒資料（例如月初尚未結算），嘗試抓上個月份
    if (json.stat !== 'OK' || !json.title) {
      const prevMonth = month === 1 ? 12 : month - 1;
      const prevYear = month === 1 ? year - 1 : year;
      dateStr = `${prevYear}${String(prevMonth).padStart(2, '0')}01`;
      url = `/twse/exchangeReport/STOCK_DAY?response=json&date=${dateStr}&stockNo=${cleanSymbol}`;
      resp = await fetch(url);
      if (!resp.ok) return null;
      json = await resp.json();
    }

    if (json.stat === 'OK' && json.title) {
      // 解析 title 欄位，例如 "113年09月 2330 臺灣積體電路製造股份有限公司 各日成交資訊"
      const title = json.title;
      // 匹配 "XXXX 股票代號 公司名稱 各日成交資訊" 格式
      const match = title.match(/\d+年\d+月\s+\d+\s+(.*?)\s*(?:各日成交資訊|個股日成交資訊|成交資訊|各日|$)/);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    return null;
  } catch (e) {
    console.error(`fetchStockName error (${cleanSymbol}):`, e);
    return null;
  }
};

