import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const host = arg("--host", process.env.POS_HOST || "127.0.0.1");
const port = Number(arg("--port", process.env.POS_PORT || 4000));
const version = process.env.POS_VERSION || "0.0.0-preview";

const previewHtml = path.join(root, "packaging", "preview", "index.html");
const iconSvg = path.join(root, "packaging", "icons", "hospitality-pos.svg");

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const route = url.pathname;

  if (route === "/api/health") {
    return json(res, 200, { status: "ok", mode: "preview", version });
  }

  if (route === "/version.json") {
    return json(res, 200, {
      app: version,
      edge: "preview",
      schema: 0,
      build: new Date().toISOString(),
    });
  }

  if (route === "/api/shutdown" && req.method === "POST") {
    json(res, 200, { status: "stopping" });
    setTimeout(() => server.close(() => process.exit(0)), 150);
    return;
  }

  if (route === "/icon.svg" || route === "/favicon.ico") {
    try {
      const svg = await readFile(iconSvg);
      res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-store" });
      return res.end(svg);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" });
      return res.end("not found");
    }
  }

  if (route === "/" || route === "/index.html") {
    try {
      const html = await readFile(previewHtml);
      res.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      return res.end(html);
    } catch {
      res.writeHead(500, { "content-type": "text/plain" });
      return res.end("Preview asset missing. Run from the project root.");
    }
  }

  res.writeHead(404, { "content-type": "text/plain" });
  res.end("not found");
});

server.listen(port, host, () => {
  console.log(`[preview] listening on http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
