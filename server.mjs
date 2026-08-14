import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, "dist");
const indexPath = path.join(distDir, "index.html");
const PORT = Number(process.env.PORT) || 10000;

function send(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", contentType);
  res.end(body);
}

function mimeType(filePath) {
  if (filePath.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".ico")) return "image/x-icon";
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  return "application/octet-stream";
}

function serveFile(req, res, filePath, contentType) {
  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

function serveStatic(req, res) {
  if (!fs.existsSync(distDir) || !fs.existsSync(indexPath)) {
    send(res, 500, "Build output not found. Run `npm run build` before starting.");
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  let reqPath = decodeURIComponent(url.pathname);

  if (reqPath === "/" || reqPath === "") {
    serveFile(req, res, indexPath, "text/html; charset=utf-8");
    return;
  }

  reqPath = reqPath.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(distDir, reqPath));
  if (!filePath.startsWith(distDir)) {
    send(res, 403, "Forbidden");
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    serveFile(req, res, filePath, mimeType(filePath));
    return;
  }

  serveFile(req, res, indexPath, "text/html; charset=utf-8");
}

const server = http.createServer((req, res) => {
  const method = req.method || "GET";
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (method === "GET" && url.pathname === "/health") {
    send(res, 200, JSON.stringify({ status: "ok" }), "application/json; charset=utf-8");
    return;
  }

  if (method === "GET" || method === "HEAD") {
    serveStatic(req, res);
    return;
  }

  send(res, 404, "Not Found");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`staHR server listening on port ${PORT}`);
});
