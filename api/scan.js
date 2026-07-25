// Serverless proxy for TradingView's public endpoints.
// Browsers can't call TradingView directly (CORS); this runs server-side, where that doesn't apply.
//
// Modes:
//   /api/scan?symbol=EURUSD&exchange=FX_IDC   -> all timeframes for one symbol
//   /api/scan?mode=watchlist                  -> 1h/4h/1d ratings for the whole symbol list
//   /api/scan?mode=calendar&symbol=EURUSD     -> upcoming high-impact economic events

const SCREENERS = {
  FX_IDC: "forex", OANDA: "forex", FXCM: "forex", TVC: "forex",
  BINANCE: "crypto", COINBASE: "crypto", KRAKEN: "crypto", BYBIT: "crypto",
  NASDAQ: "america", NYSE: "america", AMEX: "america",
  NSE: "india", BSE: "india",
  LSE: "uk", XETR: "germany", TSE: "japan", TADAWUL: "ksa"
};

// Related-symbol baskets, shown alongside whatever you're viewing.
// Keyed by symbol; falls back to a per-exchange default.
const BASKETS = {
  EURUSD: [["EURGBP","FX_IDC"],["EURJPY","FX_IDC"],["EURCHF","FX_IDC"],["EURAUD","FX_IDC"],["GBPUSD","FX_IDC"]],
  GBPUSD: [["GBPJPY","FX_IDC"],["EURGBP","FX_IDC"],["GBPAUD","FX_IDC"],["GBPCAD","FX_IDC"],["EURUSD","FX_IDC"]],
  USDJPY: [["EURJPY","FX_IDC"],["GBPJPY","FX_IDC"],["AUDJPY","FX_IDC"],["CADJPY","FX_IDC"],["CHFJPY","FX_IDC"]],
  AUDUSD: [["AUDJPY","FX_IDC"],["EURAUD","FX_IDC"],["AUDNZD","FX_IDC"],["AUDCAD","FX_IDC"],["NZDUSD","FX_IDC"]],
  USDCAD: [["CADJPY","FX_IDC"],["EURCAD","FX_IDC"],["GBPCAD","FX_IDC"],["AUDCAD","FX_IDC"],["EURUSD","FX_IDC"]],
  USDCHF: [["EURCHF","FX_IDC"],["CHFJPY","FX_IDC"],["GBPCHF","FX_IDC"],["AUDCHF","FX_IDC"],["EURUSD","FX_IDC"]],
  XAUUSD: [["XAGUSD","FX_IDC"],["EURUSD","FX_IDC"],["USDJPY","FX_IDC"],["AUDUSD","FX_IDC"],["USDCHF","FX_IDC"]],

  BTCUSDT: [["ETHUSDT","BINANCE"],["SOLUSDT","BINANCE"],["XRPUSDT","BINANCE"],["BNBUSDT","BINANCE"],["ADAUSDT","BINANCE"]],
  ETHUSDT: [["BTCUSDT","BINANCE"],["SOLUSDT","BINANCE"],["XRPUSDT","BINANCE"],["BNBUSDT","BINANCE"],["LINKUSDT","BINANCE"]],
  SOLUSDT: [["BTCUSDT","BINANCE"],["ETHUSDT","BINANCE"],["XRPUSDT","BINANCE"],["AVAXUSDT","BINANCE"],["BNBUSDT","BINANCE"]],
  XRPUSDT: [["BTCUSDT","BINANCE"],["ETHUSDT","BINANCE"],["SOLUSDT","BINANCE"],["ADAUSDT","BINANCE"],["BNBUSDT","BINANCE"]],

  SPY:  [["AAPL","NASDAQ"],["MSFT","NASDAQ"],["NVDA","NASDAQ"],["AMZN","NASDAQ"],["GOOGL","NASDAQ"]],
  BANKNIFTY: [["HDFCBANK","NSE"],["ICICIBANK","NSE"],["KOTAKBANK","NSE"],["SBIN","NSE"],["AXISBANK","NSE"]],
  NIFTY:     [["HDFCBANK","NSE"],["RELIANCE","NSE"],["ICICIBANK","NSE"],["INFY","NSE"],["TCS","NSE"]]
};

const BASKET_DEFAULTS = {
  america: [["AAPL","NASDAQ"],["MSFT","NASDAQ"],["NVDA","NASDAQ"],["TSLA","NASDAQ"],["SPY","AMEX"]],
  india:   [["HDFCBANK","NSE"],["ICICIBANK","NSE"],["KOTAKBANK","NSE"],["SBIN","NSE"],["AXISBANK","NSE"]],
  crypto:  [["BTCUSDT","BINANCE"],["ETHUSDT","BINANCE"],["SOLUSDT","BINANCE"],["XRPUSDT","BINANCE"],["BNBUSDT","BINANCE"]],
  forex:   [["EURUSD","FX_IDC"],["GBPUSD","FX_IDC"],["USDJPY","FX_IDC"],["AUDUSD","FX_IDC"],["XAUUSD","FX_IDC"]]
};

const BASKET_COLS = ["Recommend.All", "close", "change", "EMA20", "EMA50", "RSI"];

const TFS = [
  ["1m", "|1"], ["5m", "|5"], ["15m", "|15"], ["30m", "|30"],
  ["1h", "|60"], ["4h", "|240"], ["1d", ""], ["1W", "|1W"]
];

const COLS = [
  "Recommend.All", "Recommend.Other", "Recommend.MA", "RSI", "ADX", "close", "change",
  "high", "low", "EMA20", "EMA50", "EMA200", "BB.upper", "BB.lower", "W.R", "Stoch.K",
  "MACD.macd", "MACD.signal", "Pivot.M.Classic.Middle", "Pivot.M.Classic.R1", "Pivot.M.Classic.S1",
  "EMA10", "Stoch.D", "P.SAR"
];

// Watchlist: fewer columns, three timeframes.
const WL_TFS = [["1h", "|60"], ["4h", "|240"], ["1d", ""]];
const WL_COLS = ["Recommend.All", "close", "change", "RSI", "ADX"];

const WATCHLIST = [
  ["EURUSD","FX_IDC"],["GBPUSD","FX_IDC"],["USDJPY","FX_IDC"],["AUDUSD","FX_IDC"],
  ["USDCAD","FX_IDC"],["USDCHF","FX_IDC"],["XAUUSD","FX_IDC"],
  ["BTCUSDT","BINANCE"],["ETHUSDT","BINANCE"],["SOLUSDT","BINANCE"],["XRPUSDT","BINANCE"],
  ["AAPL","NASDAQ"],["MSFT","NASDAQ"],["NVDA","NASDAQ"],["TSLA","NASDAQ"],["SPY","AMEX"]
];

// Which economies drive which symbol, for the calendar.
const CURRENCY_COUNTRY = {
  USD: "US", EUR: "EU", GBP: "GB", JPY: "JP", AUD: "AU",
  CAD: "CA", CHF: "CH", NZD: "NZ", XAU: "US", CNY: "CN"
};

function countriesFor(symbol) {
  const s = symbol.toUpperCase();
  const found = new Set();
  for (const cur of Object.keys(CURRENCY_COUNTRY)) {
    if (s.includes(cur)) found.add(CURRENCY_COUNTRY[cur]);
  }
  // Crypto and equities are dollar-driven; default to US.
  if (!found.size) found.add("US");
  return [...found].join(",");
}

async function scan(screener, tickers, columns) {
  const r = await fetch(`https://scanner.tradingview.com/${screener}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "signals-web/1.1" },
    body: JSON.stringify({ symbols: { tickers, query: { types: [] } }, columns })
  });
  if (!r.ok) throw new Error(`TradingView returned HTTP ${r.status}`);
  return r.json();
}

async function handleDetail(res, symbol, exchange) {
  const columns = [];
  for (const [, sfx] of TFS) for (const c of COLS) columns.push(c + sfx);

  const json = await scan(SCREENERS[exchange], [`${exchange}:${symbol}`], columns);
  if (!json.data || !json.data.length) {
    return res.status(404).json({ error: `No data for ${exchange}:${symbol}` });
  }
  const flat = json.data[0].d;
  const rows = TFS.map(([tf], i) => {
    const o = { tf };
    COLS.forEach((c, k) => { o[c] = flat[i * COLS.length + k]; });
    return o;
  });
  res.status(200).json({ symbol, exchange, rows, fetched: new Date().toISOString() });
}

async function handleWatchlist(res) {
  const columns = [];
  for (const [, sfx] of WL_TFS) for (const c of WL_COLS) columns.push(c + sfx);

  // Group by screener — one request per screener, not per symbol.
  const groups = {};
  for (const [sym, ex] of WATCHLIST) {
    const scr = SCREENERS[ex];
    (groups[scr] ||= []).push(`${ex}:${sym}`);
  }

  const settled = await Promise.allSettled(
    Object.entries(groups).map(async ([scr, tickers]) => {
      const json = await scan(scr, tickers, columns);
      return (json.data || []).map(entry => {
        const [ex, sym] = entry.s.split(":");
        const o = { symbol: sym, exchange: ex, tfs: {} };
        WL_TFS.forEach(([tf], i) => {
          const t = {};
          WL_COLS.forEach((c, k) => { t[c] = entry.d[i * WL_COLS.length + k]; });
          o.tfs[tf] = t;
        });
        o.close = o.tfs["1d"].close;
        o.change = o.tfs["1d"].change;
        o.score = o.tfs["1d"]["Recommend.All"];
        return o;
      });
    })
  );

  const rows = settled.filter(s => s.status === "fulfilled").flatMap(s => s.value);
  const failed = settled.filter(s => s.status === "rejected").map(s => String(s.reason));
  rows.sort((a, b) => (b.score ?? -99) - (a.score ?? -99));

  res.status(200).json({ rows, failed, fetched: new Date().toISOString() });
}

async function handleCalendar(res, symbol) {
  const now = new Date();
  const to = new Date(now.getTime() + 7 * 864e5);
  const url = "https://economic-calendar.tradingview.com/events?" + new URLSearchParams({
    from: now.toISOString(),
    to: to.toISOString(),
    countries: countriesFor(symbol)
  });

  try {
    const r = await fetch(url, { headers: { Origin: "https://www.tradingview.com" } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const events = (j.result || [])
      .filter(e => e.importance >= 0)          // medium and high impact only
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 12)
      .map(e => ({
        title: e.title,
        country: e.country,
        date: e.date,
        importance: e.importance,              // 1 = high, 0 = medium
        actual: e.actual ?? null,
        forecast: e.forecast ?? null,
        previous: e.previous ?? null
      }));
    res.status(200).json({ events, fetched: new Date().toISOString() });
  } catch (e) {
    // Calendar is a nice-to-have; never fail the page over it.
    res.status(200).json({ events: [], error: String(e.message || e) });
  }
}

async function handleBasket(res, symbol, exchange) {
  const screener = SCREENERS[exchange] || "america";
  const list = BASKETS[symbol] || BASKET_DEFAULTS[screener] || BASKET_DEFAULTS.america;

  // Group by screener so cross-market baskets still work in one request each.
  const groups = {};
  for (const [sym, ex] of list) {
    const scr = SCREENERS[ex];
    if (scr) (groups[scr] ||= []).push(`${ex}:${sym}`);
  }

  const settled = await Promise.allSettled(
    Object.entries(groups).map(async ([scr, tickers]) => {
      const json = await scan(scr, tickers, BASKET_COLS);
      return (json.data || []).map(entry => {
        const [ex, sym] = entry.s.split(":");
        const o = { symbol: sym, exchange: ex };
        BASKET_COLS.forEach((c, k) => { o[c] = entry.d[k]; });
        return o;
      });
    })
  );

  const rows = settled.filter(s => s.status === "fulfilled").flatMap(s => s.value);
  // Preserve the order defined in the basket rather than whatever the API returns.
  const order = new Map(list.map(([s], i) => [s, i]));
  rows.sort((a, b) => (order.get(a.symbol) ?? 99) - (order.get(b.symbol) ?? 99));

  res.status(200).json({ rows, fetched: new Date().toISOString() });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");

  const mode = String(req.query.mode || "detail");
  const symbol = String(req.query.symbol || "EURUSD").toUpperCase();
  const exchange = String(req.query.exchange || "FX_IDC").toUpperCase();

  try {
    if (mode === "watchlist") return await handleWatchlist(res);
    if (mode === "calendar")  return await handleCalendar(res, symbol);
    if (mode === "basket")    return await handleBasket(res, symbol, exchange);

    if (!/^[A-Z0-9._-]{1,20}$/.test(symbol) || !SCREENERS[exchange]) {
      return res.status(400).json({ error: "Invalid symbol or exchange" });
    }
    return await handleDetail(res, symbol, exchange);
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
  }
}
