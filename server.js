const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "127.0.0.1";
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    ...headers,
  });
  res.end(body);
}

async function proxySnapshot(req, res) {
  const requestUrl = new URL(req.url, `http://${host}:${port}`);
  const target = requestUrl.searchParams.get("url");
  if (!target) {
    send(res, 400, "Missing url");
    return;
  }

  let snapshotUrl;
  try {
    snapshotUrl = new URL(target);
  } catch {
    send(res, 400, "Invalid url");
    return;
  }

  if (!["http:", "https:"].includes(snapshotUrl.protocol)) {
    send(res, 400, "Only http and https URLs are supported");
    return;
  }

  try {
    snapshotUrl.searchParams.set("_squirrel_sentry", Date.now().toString());
    const response = await fetch(snapshotUrl, {
      headers: {
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });
    if (!response.ok) {
      send(res, response.status, `Snapshot fetch failed: ${response.status}`);
      return;
    }
    const image = Buffer.from(await response.arrayBuffer());
    send(res, 200, image, {
      "Cache-Control": "no-store",
      "Content-Type": response.headers.get("content-type") || "image/jpeg",
    });
  } catch (error) {
    send(res, 502, "Snapshot fetch failed");
  }
}

function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${host}:${port}`);
  const pathname = decodeURIComponent(requestUrl.pathname);
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const file = path.resolve(root, requested);

  if (!file.startsWith(root)) {
    send(res, 403, "Forbidden");
    return;
  }

  fs.readFile(file, (error, data) => {
    if (error) {
      send(res, 404, "Not found");
      return;
    }
    send(res, 200, data, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
    });
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith("/proxy-snapshot")) {
    proxySnapshot(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(port, host, () => {
  console.log(`Squirrel Sentry running at http://${host}:${port}`);
});
