// Pure, framework-free receipt text/ESC-POS formatting, shared by:
//  - the browser-print path (resources/css/app.css's .print-bill / .bill-row
//    already renders the same 4 columns as real HTML — this file is NOT
//    used for that path's rendering, only for its paper-width constants)
//  - the local-print-agent path (main.tsx sends the byte buffer this file
//    builds to the agent over HTTP)
//  - scripts/test-receipt.mjs, which imports this file directly (compiled
//    via tsc) to assert column widths, wrapping and totals never clip data
//
// No React, no DOM-only APIs (no `document`, no JSX) — this must run
// standalone under plain Node for the tests above, and the ESC/POS byte
// builder must run in a browser tab with no bundling surprises either way.

export type PaperWidthKey = '58' | '80';

export interface PaperProfile {
  mm: number;
  totalChars: number;
  itemChars: number;
  qtyChars: number;
  rateChars: number;
  amountChars: number;
}

// Character-per-line counts (42 @ 80mm, 32 @ 58mm) are the standard values
// for ESC/POS Font A on the two common thermal paper widths — used across
// the POS industry, not invented here. Column widths are hand-set (not
// derived from a percentage formula) because at these very small integer
// widths a formula's rounding can eat the 1-space gaps between columns;
// QTY/RATE/AMOUNT are sized with headroom for realistic canteen values
// (RATE up to 4 digits, AMOUNT up to 7 digits before the decimal) so they
// essentially never need to grow past their column — but see padLeft()
// below: if a genuinely larger number ever arrives, the column grows for
// that one row rather than silently truncating money (requirement: a
// receipt must never clip or lose bill data). ITEM gets whatever is left;
// on 58mm that's narrow by nature of the paper, so item names wrap onto
// more lines there than on 80mm — expected, not a bug (see wrapText).
export const PAPER_PROFILES: Record<PaperWidthKey, PaperProfile> = {
  '80': { mm: 80, totalChars: 42, itemChars: 13, qtyChars: 4, rateChars: 10, amountChars: 12 },
  '58': { mm: 58, totalChars: 32, itemChars: 8, qtyChars: 3, rateChars: 8, amountChars: 10 },
};

export function paperProfile(width: PaperWidthKey | string | undefined | null): PaperProfile {
  return PAPER_PROFILES[width === '58' ? '58' : '80'];
}

// ESC/POS thermal fonts overwhelmingly do not include a ₹ glyph (U+20B9)
// in their built-in code pages — it's a 2010 Unicode addition that even
// many current-model Chinese-clone printers never added a bitmap for, and
// printing an unsupported glyph typically comes out as a blank box or
// garbled byte, which would be worse than not using ₹ at all. "Rs." is
// printable on every ESC/POS printer regardless of code page, so it's used
// for the byte-level receipt only; the on-screen preview and browser-print
// fallback (plain HTML, full Unicode font support) keep the real ₹ symbol
// via the app's existing money() helper — see menuImageSrc-style comment
// pattern elsewhere in main.tsx for how this app documents cross-channel
// trade-offs like this one.
export function moneyEsc(v: number | string): string {
  const n = Number(v || 0);
  return 'Rs.' + n.toFixed(2);
}

function padRight(s: string, len: number): string {
  return s.length >= len ? s : s + ' '.repeat(len - s.length);
}
// Never truncates. A column is sized with headroom for realistic values;
// if a value is ever wider than its column anyway (e.g. an extreme total),
// this returns it unpadded rather than cutting digits off — losing money
// data is strictly worse than one row's alignment shifting slightly.
function padLeft(s: string, len: number): string {
  return s.length >= len ? s : ' '.repeat(len - s.length) + s;
}

// Greedy word-wrap. A single "word" wider than the column (an item name
// with no spaces at all, longer than the whole ITEM column) is hard-broken
// as a last resort — the alternative would be silently truncating the item
// name, which this receipt must never do.
export function wrapText(text: string, width: number): string[] {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (word.length > width) {
      if (line) { lines.push(line); line = ''; }
      let w = word;
      while (w.length > width) { lines.push(w.slice(0, width)); w = w.slice(width); }
      line = w;
      continue;
    }
    const candidate = line ? line + ' ' + word : word;
    if (candidate.length <= width) line = candidate;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
}

// One item -> one or more fixed-width text lines. Every line is exactly
// `totalChars` wide (item+qty+rate+amount+3 single-space gaps) UNLESS a
// numeric value genuinely overflows its column (see padLeft), so every
// line lands on the same left edge for QTY/RATE/AMOUNT across the whole
// receipt regardless of how many lines a long item name wraps into.
export function formatItemRow(name: string, qty: number | string, rate: number | string, amount: number | string, p: PaperProfile): string[] {
  const nameLines = wrapText(name, p.itemChars);
  const qtyStr = padLeft(String(qty), p.qtyChars);
  const rateStr = padLeft(moneyEsc(rate), p.rateChars);
  const amountStr = padLeft(moneyEsc(amount), p.amountChars);
  const blankQty = ' '.repeat(p.qtyChars);
  const blankRate = ' '.repeat(p.rateChars);
  const blankAmount = ' '.repeat(p.amountChars);
  const lines: string[] = [];
  lines.push(padRight(nameLines[0], p.itemChars) + ' ' + qtyStr + ' ' + rateStr + ' ' + amountStr);
  for (let i = 1; i < nameLines.length; i++) {
    lines.push(padRight(nameLines[i], p.itemChars) + ' ' + blankQty + ' ' + blankRate + ' ' + blankAmount);
  }
  return lines;
}

function centerLine(text: string, width: number): string {
  const t = String(text || '');
  if (t.length >= width) return t;
  const left = Math.floor((width - t.length) / 2);
  return ' '.repeat(left) + t;
}

function dashLine(width: number): string { return '-'.repeat(width); }

function twoCol(label: string, value: string, width: number): string {
  const gap = Math.max(1, width - label.length - value.length);
  return label + ' '.repeat(gap) + value;
}

export interface ReceiptItemInput {
  name: string;
  quantity: number;
  rate: number;
  amount: number; // already net of any item-level discount/complimentary — computed by the existing, unchanged billing code
}

export interface ReceiptTotals {
  subtotal: number;
  complementary: number;
  discount: number;
  grandTotal: number;
}

export interface ReceiptHeader {
  canteenName: string;
  address?: string;
  phone?: string;
  gstNumber?: string;
  billNumber: string;
  tableName?: string;
  waiterName?: string;
  paymentMethod?: string;
  dateText: string;
  showTableNumber: boolean;
  showWaiterName: boolean;
  showThankYou: boolean;
  thankYouMessage?: string;
}

// Produces the exact, final plain-text lines to be printed — this is the
// single source of truth both the ESC/POS byte builder and the automated
// tests check, so a test asserting "no column ever exceeds N chars" is
// asserting something the real print job also can't violate. Every number
// (subtotal/discount/total/item amount) is taken as already computed by
// the existing order/bill logic (OrderEditor's JSX, OrderService.php) —
// this function never recalculates money, only formats it.
export function buildReceiptLines(header: ReceiptHeader, items: ReceiptItemInput[], totals: ReceiptTotals, paperWidth: PaperWidthKey | string): string[] {
  const p = paperProfile(paperWidth);
  const w = p.totalChars;
  const lines: string[] = [];
  lines.push(centerLine(header.canteenName || 'Canteen', w));
  if (header.address) for (const l of wrapText(header.address, w)) lines.push(centerLine(l, w));
  if (header.phone) lines.push(centerLine('Ph: ' + header.phone, w));
  if (header.gstNumber) lines.push(centerLine('GSTIN: ' + header.gstNumber, w));
  lines.push(dashLine(w));
  lines.push(twoCol('Bill No', header.billNumber, w));
  if (header.showTableNumber && header.tableName) lines.push(twoCol('Table', header.tableName, w));
  lines.push(twoCol('Date', header.dateText, w));
  if (header.showWaiterName && header.waiterName) lines.push(twoCol('Served by', header.waiterName, w));
  if (header.paymentMethod) lines.push(twoCol('Payment', header.paymentMethod, w));
  lines.push(dashLine(w));
  lines.push(formatItemRow('Item', 'Qty', 'Rate', 'Amount', p)[0]);
  lines.push(dashLine(w));
  for (const it of items) for (const l of formatItemRow(it.name, it.quantity, it.rate, it.amount, p)) lines.push(l);
  lines.push(dashLine(w));
  lines.push(twoCol('Subtotal', moneyEsc(totals.subtotal), w));
  if (totals.complementary > 0) lines.push(twoCol('Complementary', '-' + moneyEsc(totals.complementary), w));
  if (totals.discount > 0) lines.push(twoCol('Discount', '-' + moneyEsc(totals.discount), w));
  lines.push(dashLine(w));
  lines.push(twoCol('Grand Total', moneyEsc(totals.grandTotal), w));
  if (header.showThankYou) {
    lines.push('');
    for (const l of wrapText(header.thankYouMessage || 'Thank you. Visit again.', w)) lines.push(centerLine(l, w));
  }
  return lines;
}

// ===== ESC/POS byte encoding =====
const ESC = 0x1b, GS = 0x1d, LF = 0x0a;

function textBytes(s: string): number[] {
  // Printable ASCII only reaches the printer as-is on every ESC/POS code
  // page; buildReceiptLines() never emits non-ASCII (Rs. instead of ₹,
  // plain hyphens for rules), so a straight char-code map is safe and
  // avoids pulling in a text-encoding dependency for this small file.
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
  return out;
}

export interface EscPosOptions {
  cut?: boolean; // send the paper-cut command supported printers honor; unsupported printers simply ignore it
  feedLinesBeforeCut?: number; // minimum blank feed a cutter blade needs to clear the last printed line — not decorative blank paper
}

// Builds the exact byte sequence sent to the printer: init -> centered bold
// header -> normal-weight body (built from buildReceiptLines, so the byte
// stream and the text preview can never disagree) -> the smallest feed the
// cutter needs -> one cut command at the very end (never mid-content).
export function buildEscPosBuffer(header: ReceiptHeader, items: ReceiptItemInput[], totals: ReceiptTotals, paperWidth: PaperWidthKey | string, opts: EscPosOptions = {}): Uint8Array {
  const lines = buildReceiptLines(header, items, totals, paperWidth);
  const bytes: number[] = [];
  bytes.push(ESC, 0x40); // ESC @ - initialize printer (clears any stuck state from a prior job)
  bytes.push(ESC, 0x61, 0x01); // ESC a 1 - center align, for the header block only
  bytes.push(ESC, 0x45, 0x01); // ESC E 1 - bold on
  bytes.push(...textBytes(header.canteenName || 'Canteen'), LF);
  bytes.push(ESC, 0x45, 0x00); // bold off
  bytes.push(ESC, 0x61, 0x00); // ESC a 0 - left align, for everything else
  // Skip the first line (canteen name — already emitted, bold+centered
  // above) but keep every other header/body/total/footer line exactly as
  // buildReceiptLines produced it, so what prints matches what a Test
  // Print preview shows.
  for (let i = 1; i < lines.length; i++) bytes.push(...textBytes(lines[i]), LF);
  const feed = Math.max(0, opts.feedLinesBeforeCut ?? 3);
  if (feed > 0) bytes.push(ESC, 0x64, feed); // ESC d n - feed n lines; the minimum most cutters need to clear the blade of the last printed line, not blank filler paper
  if (opts.cut !== false) bytes.push(GS, 0x56, 0x00); // GS V 0 - full cut; printers without a cutter ignore this command harmlessly
  return new Uint8Array(bytes);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  // btoa exists in every browser; Node (used only by the test script) gets
  // the same result via Buffer, guarded so this file has no hard Node
  // dependency when it runs in the browser bundle.
  if (typeof btoa === 'function') return btoa(binary);
  // Node path (used only by scripts/test-receipt.mjs, never by the browser
  // bundle) — referenced via globalThis so this file needs no @types/node
  // and stays clean under the project's browser-only tsconfig.
  return (globalThis as any).Buffer.from(bytes).toString('base64');
}
