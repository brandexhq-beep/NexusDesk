const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { initLogger, getDiagnosticLogText, getLogFilePath } = require('../electron/logger.cjs');

describe('Rolling Logger', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexusdesk-log-test-'));
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  after(() => {
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes log lines and rotates when exceeding 2 MB', () => {
    const filePath = initLogger(tmpDir);
    assert.equal(filePath, getLogFilePath());

    console.log('[Test] Booted logger');
    console.warn('[Test] Sample warning');

    const textBefore = getDiagnosticLogText({ AppVersion: '1.0.35-test' });
    assert.match(textBefore, /AppVersion: 1\.0\.35-test/);
    assert.match(textBefore, /\[INFO\] \[Test\] Booted logger/);
    assert.match(textBefore, /\[WARN\] \[Test\] Sample warning/);

    // Simulate oversized log file (>2MB) and verify rotation
    fs.writeFileSync(filePath, 'x'.repeat(2 * 1024 * 1024 + 100), 'utf-8');
    console.error('[Test] After rotation');

    assert.equal(fs.existsSync(`${filePath}.1`), true);
    const currentText = fs.readFileSync(filePath, 'utf-8');
    assert.match(currentText, /\[ERROR\] \[Test\] After rotation/);
  });
});
