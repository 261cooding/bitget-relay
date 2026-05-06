// Tiny Bitget HTTPS relay. Runs on a single Fly.io / Render VM with a
// stable, whitelistable IPv4 egress. The Cloudflare Worker calls THIS
// service, this service calls Bitget, and Bitget sees the relay's IP.
//
// Endpoints:
//   GET  /health      -> "ok"
//   GET  /ip          -> { ip } (outbound IP as seen by api.ipify.org)
//   POST /fetch       -> JSON { url, method?, headers?, body? }
//                        returns { status, headers, body }
//
// Auth: every non-/health request must carry header
//   X-Relay-Secret: <RELAY_SECRET env>

import http from "node:http";

const PORT = process.env.PORT || 8080;
const SECRET = process.env.RELAY_SECRET || "";

if (!SECRET) {
  console.error("FATAL: RELAY_SECRET env var is required");
  process.exit(1);
}

const ALLOWED_HOST_SUFFIXES = [
  "bitget.com",
  "bitgetapi.com",
  "api.ipify.org",
];

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/health") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }

    // Auth gate
    if (req.headers["x-relay-secret"] !== SECRET) {
      return json(res, 401, { error: "unauthorized" });
    }

    if (req.method === "GET" && url.pathname === "/ip") {
      const r = await fetch("https://api.ipify.org?format=json");
      const j = await r.json();
      return json(res, 200, j);
    }

    if (req.method === "POST" && url.pathname === "/fetch") {
      const raw = await readBody(req);
      let payload;
      try {
        payload = JSON.parse(raw);
      } catch {
        return json(res, 400, { error: "invalid json body" });
      }
      const { url: targetUrl, method = "GET", headers = {}, body } = payload || {};
      if (typeof targetUrl !== "string") {
        return json(res, 400, { error: "missing url" });
      }
      let parsed;
      try {
        parsed = new URL(targetUrl);
      } catch {
        return json(res, 400, { error: "invalid url" });
      }
      const host = parsed.hostname.toLowerCase();
      if (!ALLOWED_HOST_SUFFIXES.some((s) => host === s || host.endsWith("." + s))) {
        return json(res, 403, { error: `host not allowed: ${host}` });
      }

      const upstream = await fetch(targetUrl, {
        method,
        headers,
        body: body ?? undefined,
      });
      const text = await upstream.text();
      const outHeaders = {};
      upstream.headers.forEach((v, k) => {
        outHeaders[k] = v;
      });
      return json(res, 200, {
        status: upstream.status,
        headers: outHeaders,
        body: text,
      });
    }

    return json(res, 404, { error: "not found" });
  } catch (e) {
    return json(res, 502, { error: e instanceof Error ? e.message : String(e) });
  }
});

server.listen(PORT, () => {
  console.log(`bitget-relay listening on :${PORT}`);
});
