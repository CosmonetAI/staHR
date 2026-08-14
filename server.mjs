import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, "dist");
const indexPath = path.join(distDir, "index.html");
const PORT = Number(process.env.PORT) || 10000;
const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/+$/, "");
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "");
const SALES_ADVISOR_OAUTH_START_URL =
  String(process.env.VITE_SALES_ADVISOR_OAUTH_START_URL || "") ||
  "https://sales-backend-50mp.onrender.com/api/v1/auth/oauth/start";

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

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf-8"));
}

function json(res, statusCode, body) {
  send(res, statusCode, JSON.stringify(body), "application/json; charset=utf-8");
}

function jwtPayload(token) {
  try {
    const payload = String(token || "").split(".")[1] || "";
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf-8"));
  } catch {
    return null;
  }
}

function isTrustedOAuthContinue(value) {
  try {
    const expected = new URL(SALES_ADVISOR_OAUTH_START_URL);
    const candidate = new URL(value);
    return candidate.origin === expected.origin && candidate.pathname === expected.pathname;
  } catch {
    return false;
  }
}

async function sendInviteSignup(req, res) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    const missing = [];
    if (!SUPABASE_URL) missing.push("VITE_SUPABASE_URL");
    if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
    json(res, 500, { error: "OAuth server invite email is not configured.", missing });
    return;
  }
  if (jwtPayload(SUPABASE_SERVICE_ROLE_KEY)?.role !== "service_role") {
    json(res, 500, {
      error: "OAuth server invite email is misconfigured.",
      detail: "SUPABASE_SERVICE_ROLE_KEY must be the service_role key, not the anon key.",
    });
    return;
  }

  let body;
  try {
    body = await readJson(req);
  } catch {
    json(res, 400, { error: "Invalid JSON body." });
    return;
  }

  const email = String(body.email || "").trim().toLowerCase();
  const fullName = String(body.full_name || body.fullName || "").trim();
  const organizationName = String(body.organization_name || body.organizationName || fullName).trim();
  const app = String(body.app || "default").trim() || "default";
  const redirect = String(body.redirect || "").trim();

  if (!email || !email.includes("@")) {
    json(res, 400, { error: "Enter a valid email address." });
    return;
  }

  const redirectTo = new URL("/set-password", `https://${req.headers.host || "localhost"}`);
  redirectTo.searchParams.set("app", app);
  redirectTo.searchParams.set("email", email);
  if (isTrustedOAuthContinue(redirect)) {
    redirectTo.searchParams.set("continue", redirect);
    redirectTo.searchParams.set("oauth_redirect", redirect);
  }

  const headers = {
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    "Content-Type": "application/json",
  };
  const inviteBody = {
    email,
    data: {
      full_name: fullName,
      display_name: fullName || email,
      organization_name: organizationName || fullName || email,
      source: "oauth_signup",
      app,
      redirect,
    },
  };

  const inviteUrl = `${SUPABASE_URL}/auth/v1/invite?redirect_to=${encodeURIComponent(redirectTo.toString())}`;
  const response = await fetch(inviteUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(inviteBody),
  });

  if (response.ok) {
    json(res, 200, { ok: true, email });
    return;
  }

  const text = await response.text().catch(() => "");
  if ([400, 409, 422].includes(response.status) && /already|registered|exists|duplicate/i.test(text)) {
    const recoveryResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/recover?redirect_to=${encodeURIComponent(redirectTo.toString())}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ email }),
      },
    );
    if (recoveryResponse.ok) {
      json(res, 200, { ok: true, email, existing_user: true });
      return;
    }
    const recoveryText = await recoveryResponse.text().catch(() => "");
    json(res, recoveryResponse.status, { error: recoveryText || "Unable to send password setup email." });
    return;
  }

  json(res, response.status, { error: text || "Unable to send invite email." });
}

const server = http.createServer((req, res) => {
  const method = req.method || "GET";
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (method === "GET" && url.pathname === "/health") {
    send(res, 200, JSON.stringify({ status: "ok" }), "application/json; charset=utf-8");
    return;
  }

  if (method === "POST" && url.pathname === "/api/oauth/invite-signup") {
    sendInviteSignup(req, res).catch((error) => {
      console.error("OAuth invite signup failed:", error);
      json(res, 500, { error: "Unable to send invite email." });
    });
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
