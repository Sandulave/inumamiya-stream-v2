# Private Access Analytics

The dashboard is `/admin/analytics`. It is not linked from the public site.
Viewing its data requires an administrator login; the API separately requires
a server-only token. A hidden URL alone is not used as access control.

## Local Setup

Requires Node.js 22.13 or later (Node.js 24 is recommended).

```powershell
pnpm analytics:setup
pnpm dev
```

Setup generates unique secrets in the ignored `apps/api/.env.local` and
`apps/web/.env.local` files, preserving existing values. The login password is
`ANALYTICS_ADMIN_PASSWORD` in `apps/api/.env.local`. It is never printed by setup.
The root `.env.local` containing the Discord webhook is not changed.

Open `http://localhost:3000/admin/analytics`. Login sessions last eight hours.
To change the login password, update `ANALYTICS_ADMIN_PASSWORD` and restart the
API. Also rotate `ANALYTICS_SESSION_SECRET` on the web server to revoke existing
logins immediately.

## Production

Set these server environment variables before deployment:

| Variable | API | Web |
| --- | --- | --- |
| `ANALYTICS_API_TOKEN` | Same random token, at least 32 characters | Same token |
| `ANALYTICS_ADMIN_PASSWORD` | Private password, at least 16 characters | Do not set |
| `ANALYTICS_SESSION_SECRET` | Do not set | Random secret, at least 32 characters |
| `ANALYTICS_DB_PATH` | Absolute path on a persistent disk, e.g. `/var/data/analytics.sqlite` | Do not set |
| `ANALYTICS_API_URL` | Do not set | Optional API origin; defaults to `NEXT_PUBLIC_API_URL` |
| `ANALYTICS_SITE_ORIGIN` | Do not set | Public site origin, e.g. `https://stream.g1keibabattle.com`; required behind an HTTPS reverse proxy |

Never prefix these secrets with `NEXT_PUBLIC_`. Without the credentials, the
dashboard stays locked and collection is disabled. Use HTTPS in production.
The web host must overwrite `x-forwarded-for` at its trusted proxy boundary;
the API uses a keyed, daily-changing digest for rate limiting, not raw IPs.
For a directly exposed nginx proxy, use `proxy_set_header X-Forwarded-For $remote_addr`
so a client-supplied header cannot change the rate-limit identity.
Set `ANALYTICS_SITE_ORIGIN` to the browser-facing origin so login, logout, and
collection requests use the public HTTPS URL for origin checks and redirects.

Analytics uses a private SQLite database on the API server, not the public R2
bucket used for highlight assets. Mount a persistent disk before using it in
production; ephemeral hosting loses local files during redeployments. Keep the
database outside web-served directories. Use one API instance with this disk.
Back up the SQLite database using a SQLite-aware backup tool.

## Metrics

- Only the top page and `/archives/<vodId>` are counted. Embedded players and
  administration pages are excluded.
- Counts begin after deployment; past traffic cannot be reconstructed.
- Periods are today, 7, 30 and 90 days, including today, in Japan time.
- A visit is a tab-local random session with a 30-minute inactivity timeout,
  not an identified person. Visitors across tabs/devices are not deduplicated.
- Only referrer hostnames are kept; URL queries, raw IP addresses and raw user
  agents are not stored. A referrer absent from Discord/apps appears as direct.
- Tracking respects Do Not Track, filters known bot user agents and excludes
  browsers currently logged into this administrator dashboard.
- Views require JavaScript; blockers or failed requests can reduce counts.
- Raw page views are retained for 90 Japan calendar days. Expired rows and
  rate-limit records are cleaned up when collection or a summary runs.
- Duplicate event IDs do not increment counts. Data is never seeded with fake
  traffic; an unused site displays an empty state.

## Verification

```powershell
pnpm --filter api test -- --runInBand analytics
pnpm --filter api build
pnpm --filter web build
```
