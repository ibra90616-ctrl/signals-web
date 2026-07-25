// Serverless proxy for TradingView's public scanner endpoint.
// The browser can't call TradingView directly (CORS); this runs server-side, where CORS doesn't apply.
// Deployed at /api/scan on Vercel.

const SCREENERS = {
  FX_IDC: "forex", OANDA: "forex", FXCM: "forex", TVC: "forex",
  BINANCE: "crypto", COINBASE: "crypto", KRAKEN: "crypto", BYBIT: "crypto",
  NASDAQ: "america", NYSE: "america", AMEX: "america",
  LSE: "uk", XETR: "germany", TSE: "japan", TADAWUL: "ksa"
};

const TFS = [
  ["1m", "|1"], ["5m", "|5"], ["15m", "|15"], ["30m", "|30"],
  ["1h", "|60"], ["4h", "|240"], ["1d", ""], ["1W", "|1W"]
];

const COLS = [
  "Recommend.All", "Recommend.Other", "Recommend.MA", "RSI", "ADX", "close", "change",
  "high", "low", "EMA20", "EMA50", "EMA200", "BB.upper", "BB.lower", "W.R", "Stoch.K",
  "MACD.macd", "MACD.signal", "Pivot.M.Classic.Middle", "Pivot.M.Classic.R1", "Pivot.M.Classic.S1"
];

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");

  const symbol = String(req.query.symbol || "EURUSD").toUpperCase();
  const exchange = String(req.query.exchange || "FX_IDC").toUpperCase();

  if (!/^[A-Z0-9._-]{1,20}$/.test(symbol) || !SCREENERS[exchange]) {
    return res.status(400).json({ error: "Invalid symbol or exchange" });
  }

  const columns = [];
  for (const [, sfx] of TFS) for (const c of COLS) columns.push(c + sfx);

  try {
    const upstream = await fetch(
      `https://scanner.tradingview.com/${SCREENERS[exchange]}/scan`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "signals-web/1.0" },
        body: JSON.stringify({
          symbols: { tickers: [`${exchange}:${symbol}`], query: { types: [] } },
          columns
        })
      }
    );

    if (!upstream.ok) {
      return res.status(502).json({ error: `TradingView returned HTTP ${upstream.status}` });
    }

    const json = await upstream.json();
    if (!json.data || !json.data.length) {
      return res.status(404).json({ error: `No data for ${exchange}:${symbol}` });
    }

    // Reshape the flat array into one object per timeframe.
    const flat = json.data[0].d;
    const rows = TFS.map(([tf], i) => {
      const o = { tf };
      COLS.forEach((c, k) => { o[c] = flat[i * COLS.length + k]; });
      return o;
    });

    res.status(200).json({ symbol, exchange, rows, fetched: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
