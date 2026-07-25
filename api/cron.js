// Runs on a schedule (see vercel.json). Checks the daily rating for every symbol
// anyone subscribed to, and sends a push only when it changed since the last run.

import webpush from "web-push";
import { listSubs, removeSub } from "./subscribe.js";

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

const SCREENERS = {
  FX_IDC: "forex", OANDA: "forex", FXCM: "forex", TVC: "forex",
  BINANCE: "crypto", COINBASE: "crypto", KRAKEN: "crypto", BYBIT: "crypto",
  NASDAQ: "america", NYSE: "america", AMEX: "america",
  NSE: "india", BSE: "india",
  LSE: "uk", XETR: "germany", TSE: "japan", TADAWUL: "ksa"
};

function rec(v) {
  if (v === null || v === undefined) return "NEUTRAL";
  if (v < -0.5) return "STRONG_SELL";
  if (v < -0.1) return "SELL";
  if (v <= 0.1) return "NEUTRAL";
  if (v <= 0.5) return "BUY";
  return "STRONG_BUY";
}

async function kvGet(key) {
  const r = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`,
    { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
  if (!r.ok) return null;
  const j = await r.json();
  return j.result ?? null;
}
async function kvSet(key, val) {
  await fetch(`${KV_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(val)}`,
    { headers: { Authorization: `Bearer ${KV_TOKEN}` } });
}

async function ratingFor(symbol, exchange) {
  const screener = SCREENERS[exchange] || "america";
  const r = await fetch(`https://scanner.tradingview.com/${screener}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "signals-web/1.2" },
    body: JSON.stringify({
      symbols: { tickers: [`${exchange}:${symbol}`], query: { types: [] } },
      columns: ["Recommend.All", "Recommend.Other", "Recommend.MA", "close", "ADX"]
    })
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const d = j.data?.[0]?.d;
  if (!d) throw new Error("no data");
  return { rating: rec(d[0]), osc: rec(d[1]), ma: rec(d[2]), close: d[3], adx: d[4] };
}

export default async function handler(req, res) {
  // Vercel sends this header on scheduled invocations; block casual public calls.
  if (process.env.CRON_SECRET &&
      req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!process.env.VAPID_PUBLIC_KEY || !KV_URL) {
    return res.status(500).json({ error: "Not configured — see PUSH-SETUP.md" });
  }

  webpush.setVapidDetails(
    "mailto:ibra90616@gmail.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );

  const subs = await listSubs();
  if (!subs.length) return res.status(200).json({ ok: true, subs: 0, sent: 0 });

  // Collect the distinct symbols anyone is watching.
  const wanted = new Set();
  subs.forEach(s => (s.symbols || []).forEach(x => wanted.add(x)));

  const changes = {};
  for (const key of wanted) {
    const [symbol, exchange] = key.split(":");
    try {
      const cur = await ratingFor(symbol, exchange || "FX_IDC");
      const prev = await kvGet(`signals:last:${key}`);
      if (prev && prev !== cur.rating) {
        changes[key] = { from: prev, to: cur.rating, ...cur };
      }
      await kvSet(`signals:last:${key}`, cur.rating);
    } catch (e) {
      // A single bad symbol shouldn't stop the run.
      console.error("rating failed", key, String(e));
    }
  }

  let sent = 0, pruned = 0;
  for (const s of subs) {
    const hits = (s.symbols || []).filter(k => changes[k]);
    if (!hits.length) continue;

    const k = hits[0], c = changes[k];
    const drivenBy = c.ma.includes("SELL") === c.osc.includes("SELL") ? "trend and momentum agree"
                   : "trend and momentum disagree";
    const payload = JSON.stringify({
      title: `${k.split(":")[0]} · ${c.from.replace("_"," ")} → ${c.to.replace("_"," ")}`,
      body: `${c.close} · ADX ${Number(c.adx).toFixed(0)} · ${drivenBy}`
          + (hits.length > 1 ? ` (+${hits.length - 1} more)` : ""),
      tag: k,
      url: "/"
    });

    try {
      await webpush.sendNotification(s.sub, payload);
      sent++;
    } catch (e) {
      // 404/410 mean the browser dropped the subscription — clean it up.
      if (e.statusCode === 404 || e.statusCode === 410) {
        await removeSub(JSON.stringify(s));
        pruned++;
      }
    }
  }

  res.status(200).json({ ok: true, subs: subs.length, changed: Object.keys(changes), sent, pruned });
}
