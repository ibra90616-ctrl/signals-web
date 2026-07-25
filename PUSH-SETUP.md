# Push notification setup

Everything else in the app works without this. Push is the only feature that needs
server-side storage and secrets, because a notification has to reach you when the app
is closed — which means something has to run without you.

About 10 minutes. All free tier.

---

## What it does

Every 2 hours a Vercel cron job checks the **daily** rating for each symbol you're
subscribed to. If it changed since the last check, you get a notification. Only the
daily rating — a 1-minute rating flips constantly and would be pure noise on a lock screen.

---

## 1. Add a KV store

Subscriptions have to live somewhere. Vercel functions are stateless.

1. Vercel dashboard → your `signals-web` project → **Storage** tab
2. **Create Database** → **Upstash for Redis** (marked Free) → **Continue**
3. Name it anything → **Create**
4. When asked, **Connect** it to `signals-web`

This automatically sets `KV_REST_API_URL` and `KV_REST_API_TOKEN` as environment
variables. You don't have to copy anything.

## 2. Add the VAPID keys

These identify your server to the browser's push service. I generated a pair for you —
they're yours alone, don't reuse them anywhere else.

Vercel → project → **Settings** → **Environment Variables**. Add three:

| Name | Value |
|---|---|
| `VAPID_PUBLIC_KEY` | `BDIQAFAvjwhCOZZWWghwTJcG-KU_fU5OJ5JpZ5pbrtG66Xe8xjtC57KsmanQKqAHkxyAp7ek1QN9DsValEqNLtw` |
| `VAPID_PRIVATE_KEY` | `8ngrxYWHR7UUvWOKosTpL8-NDNkx9LHnf-4txXP0D7c` |
| `CRON_SECRET` | any random string you make up, e.g. `hj28fnq0zlx4` |

Leave all three applied to Production, Preview, and Development.

`CRON_SECRET` stops strangers triggering your cron endpoint. Vercel passes it
automatically on scheduled runs.

## 3. Upload the new files

Push to GitHub as before. New or changed:

```
index.html          (changed)
package.json        (changed — adds the web-push dependency)
vercel.json         (new — the cron schedule)
sw.js               (new — service worker)
api/scan.js         (changed)
api/subscribe.js    (new)
api/cron.js         (new)
```

`sw.js` must sit at the **root**, not inside `api/`. A service worker can only control
pages at or below its own path.

## 4. Redeploy

Vercel redeploys on push, but environment variables only apply to *new* deployments. If
you added the variables after the last deploy: **Deployments** tab → latest → **⋯** →
**Redeploy**.

## 5. Turn it on

Open your app. A bar appears under the price: "Get a notification when the daily rating
flips" with an **Enable** button. Tap it and accept the browser prompt.

**On iPhone this only works if you added the app to your Home Screen first** and opened it
from there — Safari doesn't allow push from a normal tab. Requires iOS 16.4 or later.

---

## Checking it works

Visit `https://your-app.vercel.app/api/subscribe` — you should see
`{"publicKey":"BDIQ...","configured":true}`. If `configured` is `false`, the environment
variables aren't live yet; redeploy.

To see cron runs: Vercel → project → **Logs**, filter to `/api/cron`. Each run returns a
summary like `{"ok":true,"subs":1,"changed":[],"sent":0}`.

Note you won't get a notification on the very first run for a symbol — there's no previous
rating to compare against yet. The second run onward is when it starts working.

---

## Free tier limits

Vercel Hobby allows 2 cron invocations per day on some plans; the schedule here is every
2 hours (12/day). If Vercel rejects it, open `vercel.json` and change the schedule to
`"0 8,16 * * *"` for twice daily, or `"0 */6 * * *"` for every 6 hours.

Upstash free tier is 10,000 commands per day. This uses roughly 20 per cron run.

---

## Turning it off

Tap the **On** button in the app to unsubscribe. To stop the cron entirely, delete
`vercel.json` and redeploy.
