"use strict";

const https = require("https");
const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");
const getCertificateOptions = require("./cert");

const PORT = Number(process.env.PORT || 18899);
const HOST = "127.0.0.1";
const PUBLIC_URL = `https://localhost:${PORT}`;
const SCRIPT_PATH = path.join(__dirname, "assets", "yuketang.js");

let cachedScript = null;
let cachedScriptMtimeMs = 0;
let browserOpened = false;

const GM_SHIM = `// GM shim - allow basic userscript APIs outside Tampermonkey
var unsafeWindow = window;
var _GM_xhr = function(opts) {
  var x = new XMLHttpRequest();
  x.open(opts.method || 'GET', opts.url, true);
  if (opts.headers) for (var k in opts.headers) x.setRequestHeader(k, opts.headers[k]);
  x.responseType = opts.responseType || '';
  if (opts.timeout) x.timeout = opts.timeout;
  if (opts.onload) x.onload = function() { opts.onload(x); };
  if (opts.onerror) x.onerror = function(e) { opts.onerror(e); };
  if (opts.ontimeout) x.ontimeout = function(e) { opts.ontimeout(e); };
  x.send(opts.data);
};

`;

function setCommonHeaders(res, contentType) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (contentType) {
    res.setHeader("Content-Type", contentType);
  }
}

function removeUserscriptHeader(source) {
  return source.replace(
    /\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==\s*/u,
    ""
  );
}

function preprocessScript(source) {
  return (
    GM_SHIM +
    removeUserscriptHeader(source)
      .replace(/\bGM_xmlhttpRequest\b/g, "_GM_xhr")
      .replace(/\bunsafeWindow\b/g, "window")
  );
}

function loadScript() {
  const stat = fs.statSync(SCRIPT_PATH);
  if (cachedScript && cachedScriptMtimeMs === stat.mtimeMs) {
    return cachedScript;
  }

  const rawScript = fs.readFileSync(SCRIPT_PATH, "utf8");
  cachedScript = preprocessScript(rawScript);
  cachedScriptMtimeMs = stat.mtimeMs;
  return cachedScript;
}

function makeBookmarklet() {
  const code = `(() => {
  const script = document.createElement('script');
  script.src = '${PUBLIC_URL}/yuketang.js?t=' + Date.now();
  script.onload = () => console.log('Local helper script loaded');
  script.onerror = () => alert('无法加载本地脚本，请确认助手服务正在运行。');
  document.documentElement.appendChild(script);
})();`;

  return `javascript:${encodeURIComponent(code)}`;
}

function guidePage() {
  const scriptExists = fs.existsSync(SCRIPT_PATH);
  const bookmarklet = makeBookmarklet();

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>本地助手</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: "Segoe UI", system-ui, sans-serif;
        color: #172026;
        background: #f5f7f8;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f5f7f8;
      }
      main {
        width: min(720px, calc(100vw - 32px));
        display: grid;
        gap: 18px;
      }
      h1 {
        margin: 0;
        font-size: 28px;
        line-height: 1.2;
      }
      p {
        margin: 0;
        color: #59676f;
        line-height: 1.7;
      }
      ol {
        margin: 0;
        padding-left: 24px;
        color: #24323a;
        line-height: 1.8;
      }
      code {
        border-radius: 4px;
        padding: 2px 5px;
        background: #e8eef1;
        font-family: Consolas, "Cascadia Mono", monospace;
      }
      .bookmarklet {
        width: fit-content;
        border: 1px solid #0f766e;
        border-radius: 8px;
        padding: 10px 14px;
        background: #0f766e;
        color: #ffffff;
        font-weight: 700;
        text-decoration: none;
      }
      .status {
        border-left: 4px solid ${scriptExists ? "#0f766e" : "#b45309"};
        padding: 10px 12px;
        background: ${scriptExists ? "#e5f4f2" : "#fff4df"};
      }
      @media (prefers-color-scheme: dark) {
        :root,
        body {
          color: #eaf0f2;
          background: #11181c;
        }
        p,
        ol {
          color: #c3ced3;
        }
        code {
          background: #1f2b31;
        }
        .status {
          background: ${scriptExists ? "#153633" : "#39280d"};
        }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>本地 HTTPS 助手</h1>
      <p>服务已运行在 <code>${PUBLIC_URL}</code>。</p>
      <div class="status">
        ${
          scriptExists
            ? "脚本文件已找到，可以拖拽下方按钮到书签栏。"
            : `未找到脚本文件，请放置到 <code>${SCRIPT_PATH}</code>。`
        }
      </div>
      <a class="bookmarklet" href="${bookmarklet}">一键注入</a>
      <ol>
        <li>如果浏览器提示证书不受信任，选择继续访问本地页面。</li>
        <li>把「一键注入」按钮拖到浏览器书签栏。</li>
        <li>打开目标页面后，点击该书签加载本地脚本。</li>
      </ol>
    </main>
  </body>
</html>`;
}

function sendText(res, statusCode, contentType, body) {
  setCommonHeaders(res, contentType);
  res.writeHead(statusCode, {
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function handler(req, res) {
  setCommonHeaders(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== "GET") {
    sendText(res, 405, "text/plain; charset=utf-8", "Method Not Allowed");
    return;
  }

  const requestUrl = new URL(req.url, PUBLIC_URL);

  if (requestUrl.pathname === "/") {
    sendText(res, 200, "text/html; charset=utf-8", guidePage());
    return;
  }

  if (requestUrl.pathname === "/yuketang.js") {
    try {
      sendText(res, 200, "application/javascript; charset=utf-8", loadScript());
    } catch (error) {
      sendText(
        res,
        404,
        "application/javascript; charset=utf-8",
        `console.error(${JSON.stringify(`Script not found: ${SCRIPT_PATH}`)});`
      );
    }
    return;
  }

  sendText(res, 404, "text/plain; charset=utf-8", "Not Found");
}

function openBrowserOnce() {
  if (browserOpened) return;
  browserOpened = true;

  const command =
    process.platform === "win32"
      ? `start "" "${PUBLIC_URL}/"`
      : process.platform === "darwin"
        ? `open "${PUBLIC_URL}/"`
        : `xdg-open "${PUBLIC_URL}/"`;

  childProcess.exec(command, (error) => {
    if (error) {
      console.warn(`无法自动打开浏览器，请手动访问：${PUBLIC_URL}`);
    }
  });
}

function printStartupMessage() {
  console.log("========================================");
  console.log("助手 v1.0");
  console.log("========================================");
  console.log(`服务器已启动：${PUBLIC_URL}`);
  console.log("");
  console.log("使用方法：");
  console.log("1. 浏览器会自动打开引导页面");
  console.log("2. 把「一键注入」按钮拖到书签栏");
  console.log("3. 点击该书签");
  console.log("");
  console.log("按 Ctrl+C 停止服务");
  console.log("========================================");
}

const server = https.createServer(getCertificateOptions(), handler);

server.listen(PORT, HOST, () => {
  printStartupMessage();
  if (process.env.NO_OPEN !== "1") {
    openBrowserOnce();
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`端口 ${PORT} 已被占用，请停止占用该端口的程序后重试。`);
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});

function shutdown() {
  server.close(() => {
    console.log("服务已停止");
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
