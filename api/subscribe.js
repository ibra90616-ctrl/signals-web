// Stores and removes web-push subscriptions in Vercel KV (Upstash Redis) via its REST API.
// Using REST directly avoids adding an SDK dependency.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const SET_KEY = "signals:subs";

async function kv(path, body) {
  if (!KV_URL || !KV_TOKEN) throw new Error("KV not configured — see PUSH-SETUP.md");
  const r = await fetch(`${KV_URL}/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  if (!r.ok) throw new Error(`KV ${path} -> HTTP ${r.status}`);
  return r.json();
}

export async function listSubs() {
  const j = await kv(`smembers/${SET_KEY}`);
  return (j.result || []).map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
}

export async function removeSub(raw) {
  await kv(`srem/${SET_KEY}`, [raw]);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "GET") {
    // Expose the public key so the client doesn't have to hardcode it.
    return res.status(200).json({
      publicKey: process.env.VAPID_PUBLIC_KEY || null,
      configured: Boolean(process.env.VAPID_PUBLIC_KEY && KV_URL)
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { subscription, symbols, action } = body || {};
    if (!subscription?.endpoint) return res.status(400).json({ error: "Missing subscription" });

    const raw = JSON.stringify({
      sub: subscription,
      symbols: Array.isArray(symbols) && symbols.length ? symbols.slice(0, 10) : ["EURUSD:FX_IDC"]
    });

    if (action === "unsubscribe") {
      // Remove any stored entry for this endpoint regardless of its symbol list.
      const all = await listSubs();
      for (const s of all) {
        if (s.sub?.endpoint === subscription.endpoint) await removeSub(JSON.stringify(s));
      }
      return res.status(200).json({ ok: true, subscribed: false });
    }

    // Replace any existing entry for this endpoint, then add the new one.
    const all = await listSubs();
    for (const s of all) {
      if (s.sub?.endpoint === subscription.endpoint) await removeSub(JSON.stringify(s));
    }
    await kv(`sadd/${SET_KEY}`, [raw]);
    return res.status(200).json({ ok: true, subscribed: true });
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
}
