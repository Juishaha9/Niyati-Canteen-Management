# Niyati Canteen — Local Print Agent

This is a small helper program that runs on the **same Windows PC as your
receipt printer** (the till/counter computer). It lets the canteen web app
print bills instantly — no print preview, no "Save as PDF" dialog, no click
through a Windows print box — by talking directly to your printer for you.

## Why this exists

The canteen website runs on a web host (Hostinger). A web host has no way to
reach a USB printer plugged into a computer in your shop — it can only talk
to other computers over the internet. This agent solves that by running
*on your counter PC*, listening only on that PC (`127.0.0.1`), where your
web browser (also running on that PC) can reach it directly. Nothing you
print here ever passes through the website's server.

If this agent isn't running, or isn't set up yet, printing still works the
normal way: click Print, and your browser's own print dialog opens exactly
like it did before this feature existed. Nothing about that older way of
printing has been removed.

## Requirements

- Windows 10 or 11
- [Node.js](https://nodejs.org) installed on the counter PC (the free
  "LTS" download from nodejs.org — a one-time install, a few minutes)
- Your receipt printer already installed as a normal Windows printer
  (however it came with the printer — USB driver, "Generic / Text Only"
  driver, etc.)

No other software, no paid service, and no internet account is required.

## One-time setup

### 1. Share the printer on Windows

This agent sends print data using Windows' own printer sharing mechanism,
so the printer must be shared — even though only this same PC will ever
use that share.

1. Open **Settings → Bluetooth & devices → Printers & scanners** (or the
   Control Panel "Devices and Printers" on Windows 10).
2. Click your receipt printer → **Printer properties**.
3. Go to the **Sharing** tab.
4. Tick **Share this printer**.
5. Note the **Share name** exactly as shown (for example `ReceiptPrinter`).
   You'll need to type this exact name into the app's Settings → Printer
   page in a moment. It does not need to match the printer's display name.
6. Click OK.

### 2. Get this folder onto the counter PC

Copy this entire `print-agent` folder onto the counter PC — a USB drive,
a shared network folder, or downloading the project's repository both
work. There is nothing to install with `npm install`; this agent has zero
external dependencies.

### 3. Start the agent

Open a Command Prompt in this folder and run:

```
node server.js
```

You should see:

```
[print-agent] listening on http://127.0.0.1:9123
[print-agent] allowed browser origin: *
```

Leave this window open — closing it stops the agent (see "Run it
automatically" below for a way to avoid doing this every day).

### 4. Point the web app at the agent

1. In the canteen web app, go to **Settings → Printer**.
2. Confirm **Agent address** is `http://127.0.0.1:9123` (the default —
   only change this if you edited `config.json`'s `port`).
3. Type your printer's **share name** from step 1 into **Printer name**.
4. Choose **80mm** or **58mm** to match your paper.
5. Click **Save changes**.
6. Click **Test print via agent**. You should hear/see your printer
   produce a small test receipt within a couple of seconds, and the page
   should show "Test print sent to the agent successfully."

If Test Print fails, the message tells you what actually went wrong (the
agent unreachable vs. the printer share name being wrong vs. the printer
being off) — see Troubleshooting below.

### 5. (Optional) Turn on automatic printing

Once Test Print has succeeded, you can turn on **"Print automatically
after payment"** in Settings → Printer. From then on, closing a bill's
payment prints the receipt immediately with nothing to click. If the
printer is ever off or the agent isn't running, the app shows a small
"Auto-print failed" notice with a one-click reprint link — it never blocks
or affects the payment itself, which is always recorded first regardless
of whether printing succeeds.

## Run it automatically (so you don't retype `node server.js` every morning)

**Easiest: a Startup shortcut**
1. Press `Win+R`, type `shell:startup`, press Enter.
2. In that folder, create a shortcut to a `.bat` file containing:
   ```
   cd /d C:\path\to\print-agent
   node server.js
   ```
3. The agent now starts automatically whenever the counter PC turns on.

**More robust: Windows Task Scheduler**, set to run at startup and restart
on failure — search "Task Scheduler" in the Start menu, "Create Basic
Task", point it at `node.exe` with `server.js` as the argument and this
folder as the working directory.

## Configuration (`config.json`)

```json
{
  "port": 9123,
  "allowedOrigin": "*",
  "defaultPrinterShareName": ""
}
```

- **port** — which local port the agent listens on. Only change this if
  9123 is already used by something else on the PC, and update the Agent
  address in Settings → Printer to match.
- **allowedOrigin** — which website is allowed to call this agent from the
  browser. `*` (any site) is the simplest default and is safe here because
  the agent only ever runs on your own counter PC and does nothing
  sensitive — but if you'd like to lock it down, set this to your exact
  site address, e.g. `"https://your-canteen-domain.com"`.
- **defaultPrinterShareName** — used only if the app's Printer name field
  is left blank; otherwise the app's own setting always wins.

## Troubleshooting

**"Agent not reachable" in Settings → Printer**
- Is `node server.js` actually running in a window on this PC? If you
  closed that window, the agent stopped.
- Is the Agent address in Settings → Printer exactly `http://127.0.0.1:PORT`
  with the same port `config.json` uses?
- If you're testing from a *different* computer than the one running the
  agent, that will never work — the agent only ever answers on the same PC
  it's running on. Each till/counter PC needs its own agent running.

**Test Print says "Windows could not deliver the print job to ... The
network name cannot be found."**
- The printer name you typed doesn't match a real, currently-shared
  printer on this PC. Re-check the exact Share name from Printer
  Properties → Sharing (step 1) — it's easy to have a typo or an extra
  space.
- Confirm the printer wasn't unshared or renamed since you set it up.

**Test Print via agent works, but the paper is blank / wrong characters**
- Some very old or unusual thermal printers don't accept "raw" ESC/POS
  data through their Windows driver. Try switching the printer's Windows
  driver to a **Generic / Text Only** driver if the manufacturer one
  doesn't pass raw data through, then re-share it (step 1) under the same
  process.

**Nothing works and you're out of time before a busy shift**
- Browser printing still works exactly as before — just click the normal
  Print button and use your browser's print dialog. This agent is an
  enhancement, never a requirement.
