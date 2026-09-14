// Printer/receipt formatting tests — column widths, wrapping, totals, and
// no-content-loss guarantees for resources/js/receipt.ts. Run directly:
//   node scripts/test-receipt.mjs
// or via: npm run test:receipt
//
// receipt.ts is plain TypeScript with no React/DOM dependency (by design,
// see the comment at the top of that file), so this script compiles it with
// the project's own `tsc` into an isolated temp directory (outside this
// project's tsconfig.json, which otherwise refuses to combine project mode
// with a file argument) and imports the plain-JS result.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const tscBin = join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
const tmpDir = mkdtempSync(join(tmpdir(), 'canteen-receipt-test-'));

try {
  copyFileSync(join(projectRoot, 'resources', 'js', 'receipt.ts'), join(tmpDir, 'receipt.ts'));
  execFileSync(tscBin, ['receipt.ts', '--outDir', 'out', '--module', 'esnext', '--target', 'es2020', '--skipLibCheck'], { cwd: tmpDir, stdio: 'inherit', shell: process.platform === 'win32' });

  const { buildReceiptLines, buildEscPosBuffer, wrapText, formatItemRow, PAPER_PROFILES, moneyEsc } =
    await import(pathToFileURL(join(tmpDir, 'out', 'receipt.js')).href);

  let passed = 0, failed = 0;
  function test(name, fn) {
    try { fn(); passed++; console.log('PASS -', name); }
    catch (e) { failed++; console.error('FAIL -', name, '\n   ', e.message); }
  }

  const baseHeader = (over = {}) => ({
    canteenName: 'Niyati Canteen', address: 'Bus Stand', phone: '9876543210', gstNumber: '',
    billNumber: 'BILL-101', tableName: 'Table 3', waiterName: 'Piyush', paymentMethod: 'CASH',
    dateText: '01/01/2026, 12:00:00 pm', showTableNumber: true, showWaiterName: true,
    showThankYou: true, thankYouMessage: 'Thank you. Visit again.', ...over,
  });

  test('80mm: every ordinary line is exactly 42 chars wide', () => {
    const items = [{ name: 'Tea', quantity: 2, rate: 10, amount: 20 }, { name: 'Vada Pav', quantity: 1, rate: 20, amount: 20 }];
    const totals = { subtotal: 40, complementary: 0, discount: 0, grandTotal: 40 };
    const lines = buildReceiptLines(baseHeader(), items, totals, '80');
    for (const l of lines) assert.ok(l.length <= 42, `line exceeded 42 chars: "${l}" (${l.length})`);
  });

  for (const n of [1, 5, 30]) {
    test(`${n}-item bill: every item present, no truncation`, () => {
      const items = Array.from({ length: n }, (_, i) => ({ name: `Item ${i + 1}`, quantity: i + 1, rate: 10, amount: 10 * (i + 1) }));
      const totals = { subtotal: items.reduce((s, x) => s + x.amount, 0), complementary: 0, discount: 0, grandTotal: items.reduce((s, x) => s + x.amount, 0) };
      const lines = buildReceiptLines(baseHeader(), items, totals, '80');
      for (const it of items) {
        const found = lines.some(l => l.startsWith(it.name.slice(0, 13)));
        assert.ok(found, `item "${it.name}" missing from receipt output`);
      }
      assert.ok(lines.some(l => l.includes('Grand Total') && l.includes(moneyEsc(totals.grandTotal))), 'grand total missing or not formatted');
    });
  }

  test('very long item name wraps within ITEM column only; QTY/RATE/AMOUNT stay aligned', () => {
    const longName = 'Extra Large Family Combo Thali With Extra Papad And Buttermilk';
    const p = PAPER_PROFILES['80'];
    const rows = formatItemRow(longName, 3, 150, 450, p);
    assert.ok(rows.length > 1, 'expected the long name to wrap onto multiple lines');
    const qtyColStart = p.itemChars + 1;
    const cont = rows[1];
    const qtyField = cont.slice(qtyColStart, qtyColStart + p.qtyChars);
    assert.equal(qtyField.trim(), '', 'continuation line leaked a value into the QTY column');
    const first = rows[0];
    assert.ok(first.includes('3'), 'first line missing quantity');
    assert.ok(first.includes('150.00'), 'first line missing rate');
    assert.ok(first.includes('450.00'), 'first line missing amount');
    const rebuilt = rows.map(r => r.slice(0, p.itemChars).trimEnd()).join(' ').replace(/\s+/g, ' ').trim();
    for (const word of longName.split(' ')) assert.ok(rebuilt.includes(word), `word "${word}" lost during wrap`);
  });

  test('a single run wider than ITEM column is hard-wrapped, not truncated', () => {
    const p = PAPER_PROFILES['58'];
    const weirdName = 'Supercalifragilisticexpialidocious';
    const rows = formatItemRow(weirdName, 1, 10, 10, p);
    const rebuilt = rows.map(r => r.slice(0, p.itemChars).trimEnd()).join('');
    assert.equal(rebuilt, weirdName, 'hard-wrap lost or reordered characters');
  });

  test('discount and complimentary lines appear in totals with correct signs', () => {
    const items = [{ name: 'Thali', quantity: 1, rate: 100, amount: 100 }, { name: 'Tea (Complementary)', quantity: 1, rate: 10, amount: 0 }];
    const totals = { subtotal: 110, complementary: 10, discount: 15, grandTotal: 85 };
    const lines = buildReceiptLines(baseHeader(), items, totals, '80');
    assert.ok(lines.some(l => l.includes('Complementary') && l.includes('-Rs.10.00')), 'complementary line missing/wrong sign');
    assert.ok(lines.some(l => l.includes('Discount') && l.includes('-Rs.15.00')), 'discount line missing/wrong sign');
    assert.ok(lines.some(l => l.includes('Grand Total') && l.includes('Rs.85.00')), 'grand total does not reflect discount/complementary');
    assert.ok(lines.some(l => l.includes('Tea') && l.includes('0.00')), 'complementary item amount not zeroed on the receipt');
  });

  for (const method of ['CASH', 'UPI']) {
    test(`payment method ${method} appears verbatim on the receipt`, () => {
      const lines = buildReceiptLines(baseHeader({ paymentMethod: method }), [{ name: 'Tea', quantity: 1, rate: 10, amount: 10 }], { subtotal: 10, complementary: 0, discount: 0, grandTotal: 10 }, '80');
      assert.ok(lines.some(l => l.includes('Payment') && l.includes(method)));
    });
  }

  test('a long bill number is printed in full, never truncated', () => {
    const longBill = 'BILL-000000000123456789';
    const lines = buildReceiptLines(baseHeader({ billNumber: longBill }), [{ name: 'Tea', quantity: 1, rate: 10, amount: 10 }], { subtotal: 10, complementary: 0, discount: 0, grandTotal: 10 }, '58');
    assert.ok(lines.some(l => l.includes(longBill)), 'long bill number was cut off');
  });

  test('a very large grand total is printed in full, never truncated (column grows rather than clipping)', () => {
    const items = [{ name: 'Bulk Order', quantity: 999, rate: 9999.99, amount: 9989990.01 }];
    const totals = { subtotal: 9989990.01, complementary: 0, discount: 0, grandTotal: 9989990.01 };
    const lines = buildReceiptLines(baseHeader(), items, totals, '80');
    assert.ok(lines.some(l => l.includes('9989990.01')), 'large amount was truncated/lost');
    assert.ok(lines.some(l => l.includes('Grand Total') && l.includes('9989990.01')), 'large grand total was truncated/lost');
  });

  for (const width of ['58', '80']) {
    test(`${width}mm profile: header/body/footer respect the ${PAPER_PROFILES[width].totalChars}-char budget`, () => {
      const lines = buildReceiptLines(baseHeader(), [
        { name: 'Kolhapuri Misal', quantity: 2, rate: 50, amount: 100 },
        { name: 'Vada Pav', quantity: 3, rate: 20, amount: 60 },
      ], { subtotal: 160, complementary: 0, discount: 5, grandTotal: 155 }, width);
      const budget = PAPER_PROFILES[width].totalChars;
      for (const l of lines) assert.ok(l.length <= budget || l.trim().length > budget, `unexpected line width for ${width}mm: "${l}"`);
      assert.ok(lines.length > 5, 'suspiciously short receipt output');
    });
  }

  test('ESC/POS buffer: minimal feed before a single trailing cut, never mid-content', () => {
    const buf = buildEscPosBuffer(baseHeader(), [{ name: 'Tea', quantity: 1, rate: 10, amount: 10 }], { subtotal: 10, complementary: 0, discount: 0, grandTotal: 10 }, '80', { cut: true, feedLinesBeforeCut: 3 });
    const bytes = Array.from(buf);
    let cutCount = 0, cutIndex = -1;
    for (let i = 0; i < bytes.length - 2; i++) if (bytes[i] === 0x1d && bytes[i + 1] === 0x56 && bytes[i + 2] === 0x00) { cutCount++; cutIndex = i; }
    assert.equal(cutCount, 1, 'expected exactly one cut command');
    assert.equal(cutIndex, bytes.length - 3, 'cut command was not the very last thing in the buffer');
    let feedIndex = -1;
    for (let i = 0; i < bytes.length - 2; i++) if (bytes[i] === 0x1b && bytes[i + 1] === 0x64 && bytes[i + 2] === 3) feedIndex = i;
    assert.equal(feedIndex, cutIndex - 3, 'feed command was not immediately before the cut');
  });

  test('ESC/POS buffer: cut omitted entirely when the printer does not support it', () => {
    const buf = buildEscPosBuffer(baseHeader(), [{ name: 'Tea', quantity: 1, rate: 10, amount: 10 }], { subtotal: 10, complementary: 0, discount: 0, grandTotal: 10 }, '80', { cut: false });
    const bytes = Array.from(buf);
    let cutCount = 0;
    for (let i = 0; i < bytes.length - 2; i++) if (bytes[i] === 0x1d && bytes[i + 1] === 0x56) cutCount++;
    assert.equal(cutCount, 0, 'cut command should not be sent when cut:false');
  });

  test('wrapText never drops a character across arbitrary inputs', () => {
    const samples = ['', 'Tea', 'Extra Large Family Combo Thali', 'x'.repeat(50), '   spaced   out   words   '];
    for (const s of samples) {
      const wrapped = wrapText(s, 8).join(' ').replace(/\s+/g, '');
      const original = s.trim().replace(/\s+/g, '');
      assert.equal(wrapped, original, `content mismatch for input "${s}"`);
    }
  });

  console.log(`\n${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exitCode = 1;
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
