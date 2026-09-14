// Niyati Canteen — local print agent.
//
// What this is: a tiny HTTP server that runs on the SAME Windows PC as the
// receipt printer. The canteen web app (hosted on Hostinger) has no route
// to a USB/shared printer sitting at the counter — it can only reach this
// agent because the agent is running on http://127.0.0.1 (loopback), which
// the browser tab on that same PC can call directly. This agent then does
// the one thing a normal PHP web host cannot: hand raw ESC/POS bytes to the
// Windows print spooler.
//
// How it actually prints (no native modules, nothing to compile): it writes
// the incoming bytes to a temp file and shells out to the classic Windows
// `copy /b <file> \\localhost\<ShareName>` trick, which passes the bytes to
// the printer's spooler completely unmodified as long as the printer is
// installed and SHARED on this PC (see README.md — this is a one-time
// setup step, not something this script can do for you). If that share
// name is wrong or the printer is off/disconnected, /print reports a real
// failure back to the browser; it never pretends to have printed.
//
// Zero npm dependencies on purpose — `node server.js` is the entire install.

const http = require('http');
const { exec, execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const CONFIG_PATH = path.join(__dirname, 'config.json');
function loadConfig() {
  const defaults = { port: 9123, allowedOrigin: '*', defaultPrinterShareName: '' };
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    console.warn('[print-agent] config.json not found or invalid — using defaults.');
    return defaults;
  }
}
const config = loadConfig();

function withCors(res, req) {
  res.setHeader('Access-Control-Allow-Origin', config.allowedOrigin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Chrome's Private Network Access check requires this on the preflight
  // response whenever an HTTPS page (the production site) calls into a
  // private/loopback address (this agent) — without it, modern Chrome
  // silently blocks the real request even though CORS itself looks fine.
  if (req.headers['access-control-request-private-network'] === 'true') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

// Lists installed printers and, separately, which one Windows considers the
// default. Uses PowerShell's Get-Printer/Get-CimInstance (built into every
// supported Windows version) — no extra tools to install. ShareName is what
// actually matters for /print below; Name is just the friendly label shown
// in the app's Settings > Printer status pill.
function listPrinters() {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve({ printers: [], defaultPrinter: null, platformWarning: 'This agent only talks to a real printer on Windows. It is running here only to test the HTTP connection.' }); return; }
    const psCommand = "Get-Printer | Select-Object Name,ShareName,Shared | ConvertTo-Json -Compress; Write-Output '---'; (Get-CimInstance -ClassName Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1 -ExpandProperty Name)";
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psCommand], { timeout: 8000 }, (err, stdout) => {
      if (err) { resolve({ printers: [], defaultPrinter: null, error: 'Could not query Windows printers.' }); return; }
      const [printersJson, defaultName] = String(stdout).split('---').map((s) => s.trim());
      let printers = [];
      try {
        const parsed = JSON.parse(printersJson || '[]');
        printers = (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean).map((p) => p.Name);
      } catch { /* leave printers empty rather than crash the status endpoint */ }
      resolve({ printers, defaultPrinter: defaultName || null });
    });
  });
}

// Sends raw bytes to a printer share on THIS PC. printerName here must be
// the printer's Windows SHARE name (Printer Properties > Sharing > Share
// name) — not necessarily the same text as its display name, though
// Windows suggests the display name by default. See README.md.
function printRawBytes(shareName, bytes) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') { resolve({ ok: false, error: 'This agent can only send raw bytes to a printer on Windows.' }); return; }
    if (!shareName) { resolve({ ok: false, error: 'No printer name configured. Set one in Settings > Printer, or defaultPrinterShareName in config.json.' }); return; }
    const tmpFile = path.join(os.tmpdir(), `canteen-print-${crypto.randomBytes(6).toString('hex')}.prn`);
    fs.writeFile(tmpFile, bytes, (writeErr) => {
      if (writeErr) { resolve({ ok: false, error: 'Could not create a temporary print file.' }); return; }
      const cleanup = () => fs.unlink(tmpFile, () => {});
      // Quoting: printer share names can contain spaces; both paths are
      // double-quoted for cmd.exe's /c copy.
      exec(`copy /b "${tmpFile}" "\\\\localhost\\${shareName}"`, { timeout: 15000, windowsHide: true }, (err, stdout, stderr) => {
        cleanup();
        if (err) {
          resolve({ ok: false, error: `Windows could not deliver the print job to "${shareName}". Confirm the printer is installed, shared under exactly this name, and turned on. (${(stderr || err.message || '').toString().trim().slice(0, 200)})` });
          return;
        }
        resolve({ ok: true });
      });
    });
  });
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) { reject(new Error('Request body too large.')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  withCors(res, req);
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (req.method === 'GET' && url.pathname === '/status') {
    const { printers, defaultPrinter, error, platformWarning } = await listPrinters();
    sendJson(res, 200, { ok: true, agent: 'canteen-print-agent', version: '1.0.0', printers, defaultPrinter, error, platformWarning });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/print') {
    try {
      const raw = await readBody(req, 2 * 1024 * 1024); // 2MB is far more than any receipt needs; guards against a runaway request
      let payload;
      try { payload = JSON.parse(raw.toString('utf8')); } catch { sendJson(res, 400, { ok: false, error: 'Invalid JSON body.' }); return; }
      const printerName = String(payload.printerName || config.defaultPrinterShareName || '').trim();
      const dataBase64 = String(payload.dataBase64 || '');
      if (!dataBase64) { sendJson(res, 400, { ok: false, error: 'No print data supplied.' }); return; }
      const bytes = Buffer.from(dataBase64, 'base64');
      const result = await printRawBytes(printerName, bytes);
      sendJson(res, result.ok ? 200 : 502, result);
    } catch (e) {
      sendJson(res, 400, { ok: false, error: e.message || 'Bad request.' });
    }
    return;
  }

  sendJson(res, 404, { ok: false, error: 'Not found. Available: GET /status, POST /print.' });
});

server.listen(config.port, '127.0.0.1', () => {
  console.log(`[print-agent] listening on http://127.0.0.1:${config.port}`);
  console.log(`[print-agent] allowed browser origin: ${config.allowedOrigin}`);
  if (process.platform !== 'win32') console.warn('[print-agent] WARNING: not running on Windows — /print cannot reach a real printer here.');
});
