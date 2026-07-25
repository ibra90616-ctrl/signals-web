# Deploy to Vercel

You'll end up with a URL like `https://signals-yourname.vercel.app` that works on any phone, any network. Free tier is plenty — this app is one static page and one small function.

Takes about 5 minutes. No command line needed.

---

## Why a server is involved at all

TradingView's scanner endpoint refuses requests that come directly from a browser (CORS). The `api/scan.js` function fetches the data server-side, where that restriction doesn't apply, and passes it to the page. That's the only thing it does.

---

## Steps

### 1. Put the folder on GitHub

If you don't have a GitHub account, make one at [github.com](https://github.com) first.

1. Go to [github.com/new](https://github.com/new)
2. Repository name: `signals-web`. Leave it **Public** (private works too, Vercel handles both).
3. Don't tick "Add a README". Click **Create repository**.
4. On the next page click **uploading an existing file**.
5. Drag in the contents of this `signals-web` folder — `index.html`, `package.json`, and the `api` folder with `scan.js` inside it.

   The structure on GitHub must look like:

   ```
   index.html
   package.json
   api/scan.js
   ```

   If `scan.js` ends up at the top level instead of inside `api/`, the function won't be detected.

6. Click **Commit changes**.

### 2. Connect Vercel

1. Go to [vercel.com](https://vercel.com) → **Sign Up** → **Continue with GitHub**
2. Click **Add New… → Project**
3. Find `signals-web` in the list → **Import**
4. Leave every setting at its default. Framework Preset should say "Other" — that's correct.
5. Click **Deploy**

Wait ~30 seconds. You'll get a URL.

### 3. Add it to your phone

Open the URL in your phone's browser, then:

- **iPhone (Safari):** Share button → Add to Home Screen
- **Android (Chrome):** ⋮ menu → Add to Home screen

It'll open fullscreen with no browser chrome, like a real app.

---

## Updating it later

Edit the file on GitHub (pencil icon) and commit. Vercel redeploys automatically within a minute.

To add symbols, edit the `SYMBOLS` array near the top of the `<script>` block in `index.html`:

```js
["EURGBP","FX_IDC",5],   // symbol, exchange, decimal places
```

The exchange must be one of the keys in `SCREENERS` in `api/scan.js` — add it there too if it's a new one.

---

## Troubleshooting

**"Couldn't load data. HTTP 404"** — `api/scan.js` isn't in an `api/` folder at the repo root. Check the file layout on GitHub.

**"TradingView returned HTTP 4xx"** — bad symbol/exchange pair. Crypto needs BINANCE, forex needs FX_IDC, US stocks need NASDAQ/NYSE/AMEX.

**Everything shows "—"** — the market is closed and that symbol has no cached values for short timeframes. Normal on weekends for forex and stocks.

**Page loads but numbers never change** — responses are cached for 30 seconds at the edge. Wait, then hit refresh.

---

## Cost and limits

Vercel's free tier ("Hobby") covers personal projects: 100 GB bandwidth and 100k function calls per month. This app uses a few KB per load and one function call per refresh — you'd need to refresh thousands of times a day to approach the limit.

TradingView's scanner is an undocumented public endpoint. It could change or start rate-limiting without notice. If the app suddenly stops working, that's the most likely reason, and nothing in this repo can fix it.

---

## What this is not

The ratings are a mechanical vote across ~26 indicators applied to past price. They're not advice, not a strategy, and not predictive. They change every candle and disagree across timeframes constantly. Read them as a description of what price has already done.
