// Static server for the Zareqia mirror:
//  1. Serve files that were recovered from the Drive folder + live asset archive.
//  2. Proxy anything missing (extra media, /api/*) to https://zareqia.com.
//  3. SPA fallback: routes without a file extension get the local index shell.
import http from "node:http";
import https from "node:https";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const UPSTREAM = "https://zareqia.com";
const PORT = process.env.PORT || 3000;

// Optional per-instance CSS/JS injected into served HTML shells (for previews
// that need UI overrides, e.g. hiding demo chrome for one template server).
const INJECT =
  process.env.INJECT_FILE && existsSync(join(ROOT, process.env.INJECT_FILE))
    ? readFileSync(join(ROOT, process.env.INJECT_FILE), "utf8")
    : null;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".map": "application/json",
};

const HOP = new Set([
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "te", "trailers", "transfer-encoding", "upgrade", "host", "content-length",
  "content-encoding", "content-security-policy", "x-frame-options",
  "strict-transport-security",
]);

function sendLocal(req, res, filePath) {
  const stat = statSync(filePath);
  const mime = MIME[extname(filePath).toLowerCase()] || "application/octet-stream";
  const range = req.headers.range;

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-cache");

  if (range && /^bytes=\d*-\d*$/.test(range)) {
    const [a, b] = range.replace("bytes=", "").split("-");
    let start = a ? parseInt(a, 10) : Math.max(0, stat.size - parseInt(b, 10));
    let end = a ? (b ? Math.min(parseInt(b, 10), stat.size - 1) : stat.size - 1) : stat.size - 1;
    if (start >= stat.size) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      return res.end();
    }
    res.writeHead(206, {
      "Content-Type": mime,
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Content-Length": end - start + 1,
    });
    if (req.method === "HEAD") return res.end();
    createReadStream(filePath, { start, end }).pipe(res);
  } else if (INJECT && filePath.endsWith(".html")) {
    // Serve HTML with per-instance overrides injected before </head>
    let html = readFileSync(filePath, "utf8");
    html = html.includes("</head>")
      ? html.replace("</head>", INJECT + "\n</head>")
      : html + "\n" + INJECT;
    const body = Buffer.from(html, "utf8");
    res.writeHead(200, { "Content-Type": mime, "Content-Length": body.length });
    if (req.method === "HEAD") return res.end();
    res.end(body);
  } else {
    res.writeHead(200, { "Content-Type": mime, "Content-Length": stat.size });
    if (req.method === "HEAD") return res.end();
    createReadStream(filePath).pipe(res);
  }
}

function proxy(req, res, target, isRouteFallback, depth = 0) {
  const url = new URL(target, UPSTREAM);
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP.has(k.toLowerCase())) headers[k] = v;
  }
  headers.host = url.host;

  const r = https.request(
    { method: req.method, path: url.pathname + url.search, hostname: url.hostname, headers },
    (u) => {
      // Follow redirects (including cross-host) up to 5 hops
      if ([301, 302, 307, 308].includes(u.statusCode) && u.headers.location && depth < 5) {
        const loc = new URL(u.headers.location, url);
        u.resume();
        return proxy(req, res, loc.href, isRouteFallback, depth + 1);
      }
      const out = {};
      for (const [k, v] of Object.entries(u.headers)) {
        if (!HOP.has(k.toLowerCase())) out[k] = v;
      }
      // Routes: if upstream has no real page (SPA html), serve our local shell instead
      if (isRouteFallback) {
        u.resume();
        return sendLocal(req, res, join(ROOT, "invite/demo/index.html"));
      }
      out["access-control-allow-origin"] = "*";
      out["cache-control"] = "no-cache";
      res.writeHead(u.statusCode, out);
      u.pipe(res);
    }
  );
  r.on("error", (e) => {
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Upstream error: " + e.message);
  });
  req.pipe(r);
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://x").pathname);
  } catch {
    res.writeHead(400); return res.end("Bad request");
  }

  // Optional default landing route for this instance (e.g. a specific template demo)
  if (pathname === "/" && process.env.DEFAULT_ROUTE) {
    res.writeHead(302, { Location: process.env.DEFAULT_ROUTE });
    return res.end();
  }

  const localPath = normalize(join(ROOT, pathname));
  const inside = localPath.startsWith(ROOT);
  const hasExt = extname(pathname) !== "";
  const isApi = pathname.startsWith("/api/");
  const isRoute = !hasExt && !isApi;

  console.log(`${req.method} ${pathname}`);

  if (inside) {
    // Exact file or directory-with-index.html
    let filePath = null;
    if (existsSync(localPath) && statSync(localPath).isFile()) filePath = localPath;
    else if (existsSync(localPath) && statSync(localPath).isDirectory()) {
      const idx = join(localPath, "index.html");
      if (existsSync(idx)) filePath = idx;
    } else if (isRoute && !hasExt) {
      const idx = join(localPath, "index.html");
      if (existsSync(idx)) filePath = idx;
    }
    if (filePath) return sendLocal(req, res, filePath);
  }

  // Missing asset or API call → proxy to the live site
  if (hasExt || isApi) return proxy(req, res, UPSTREAM + pathname + (new URL(req.url, "http://x").search || ""), false);

  // Anything else is an app route → local SPA shell
  return proxy(req, res, UPSTREAM + pathname, true);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Zareqia mirror running at http://0.0.0.0:${PORT}`);
  console.log(`Open /invite/demo for the demo invitation`);
});
