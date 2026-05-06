# Bitget HTTPS Relay

Tiny Node service. Cloudflare Workers can't open arbitrary TCP tunnels, so
the worker calls **this** service over plain HTTPS, and this service makes
the real Bitget call. Bitget then sees this service's stable IPv4 — which
you whitelist on Bitget's API key page.

## Deploy on Fly.io (recommended, free tier eligible)

1. Install flyctl: `curl -L https://fly.io/install.sh | sh`
2. `fly auth signup` (or `fly auth login`)
3. From inside this `relay/` directory:
   ```bash
   fly launch --no-deploy --copy-config --name bitget-relay-<your-suffix>
   ```
   Pick region `fra` (Frankfurt). Say **No** to Postgres / Redis / deploy.
4. Generate a strong shared secret and set it:
   ```bash
   fly secrets set RELAY_SECRET="$(openssl rand -hex 32)"
   ```
   **Save that secret value** — you'll paste it into Lovable as `BITGET_RELAY_SECRET`.
5. Deploy:
   ```bash
   fly deploy
   ```
6. Get your stable IP:
   ```bash
   fly ips list
   # take the v4 address, e.g. 66.241.124.10
   ```
7. Verify it works (replace SECRET + APP):
   ```bash
   curl -H "x-relay-secret: $SECRET" https://<APP>.fly.dev/ip
   # -> {"ip":"66.241.124.10"}
   ```

## Deploy on Render (alternative)

1. Push this `relay/` folder to a git repo.
2. Render → New → Web Service → connect repo, root dir `relay/`.
3. Runtime: Docker. Plan: Free or Starter.
4. Add env var `RELAY_SECRET` (random 32+ char string).
5. Deploy. Render gives you `https://<name>.onrender.com`.
6. Note: Render free tier sleeps; use Starter ($7/mo) for 24/7.

## Configure Lovable

Once deployed, paste these into Lovable secrets:

- `BITGET_RELAY_URL` = `https://<your-app>.fly.dev` (no trailing slash)
- `BITGET_RELAY_SECRET` = the secret you set above

Then whitelist the relay's IPv4 on Bitget's API key page and you're done.

## Allowed upstream hosts

The relay only forwards to `*.bitget.com`, `*.bitgetapi.com`, and
`api.ipify.org`. Anything else returns 403.
