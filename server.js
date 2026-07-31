/**
 * 本地服务器（无需 Vercel）
 * 同时托管网站静态文件 + AI 接口 /api/chat
 * 大视频支持 HTTP Range 分段播放
 *
 * 使用步骤：
 *   1. 安装 Node.js：https://nodejs.org
 *   2. 复制 .env.example 为 .env，填入豆包 API 配置
 *   3. 运行：node server.js
 *   4. 浏览器打开：http://localhost:3000
 *   5. js/config.js 中 mockMode 改为 false
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { getChatAnswer } = require("./lib/chat-handler");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

const STREAM_EXTS = new Set([".mp4", ".webm", ".mov", ".mp3", ".wav"]);

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;

  fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const index = trimmed.indexOf("=");
      if (index === -1) return;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim();
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error("请求体过大"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

function serveStreamFile(req, res, filePath, contentType) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    const size = stats.size;
    const range = req.headers.range;

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` });
        res.end();
        return;
      }

      let start = match[1] ? parseInt(match[1], 10) : 0;
      let end = match[2] ? parseInt(match[2], 10) : size - 1;
      if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
        res.writeHead(416, { "Content-Range": `bytes */${size}` });
        res.end();
        return;
      }
      end = Math.min(end, size - 1);

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": end - start + 1,
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      "Content-Length": size,
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "public, max-age=3600",
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  if (urlPath === "/") urlPath = "/index.html";

  const filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  if (STREAM_EXTS.has(ext)) {
    serveStreamFile(req, res, filePath, contentType);
    return;
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end("Not Found");
      return;
    }

    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  });
}

async function handleChatApi(req, res) {
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const raw = await readBody(req);
    const body = raw ? JSON.parse(raw) : {};
    const question = body.question;
    const topic = body.topic;

    if (!question || typeof question !== "string") {
      sendJson(res, 400, { error: "请提供 question 字段" });
      return;
    }

    const answer = await getChatAnswer(question, topic);
    sendJson(res, 200, { answer });
  } catch (err) {
    console.error(err);
    const message = err.message || "服务器内部错误";
    const status = message.includes("Unexpected token") ? 400 : message.includes("缺少环境变量") ? 500 : 502;
    sendJson(res, status, { error: message });
  }
}

loadEnvFile();

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/chat")) {
    await handleChatApi(req, res);
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`网站已启动：http://localhost:${PORT}`);
  console.log("AI 接口：http://localhost:" + PORT + "/api/chat");
  if (!fs.existsSync(path.join(ROOT, ".env"))) {
    console.log("提示：复制 .env.example 为 .env 并填入豆包 API 配置");
  }
});
