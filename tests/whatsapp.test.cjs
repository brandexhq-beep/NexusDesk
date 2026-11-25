const { describe, it, beforeEach, afterEach, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

// Mock 'electron' before loading whatsapp.cjs
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexusdesk-wa-test-'));
const origLoad = Module._load;
Module._load = function patchedLoad(request) {
  if (request === 'electron') {
    return {
      app: {
        getPath: () => tmpRoot,
      },
      ipcMain: { handle: () => {} },
    };
  }
  return origLoad.apply(this, arguments);
};

const {
  normalizePhone,
  hasAnyLockFiles,
  clearStaleLockFiles,
  clearStaleServiceWorker,
  pruneOldQueueEntries,
} = require('../electron/whatsapp.cjs');

Module._load = origLoad;

describe('WhatsApp helpers', () => {
  let sessionDir;

  beforeEach(() => {
    sessionDir = fs.mkdtempSync(path.join(tmpRoot, 'session-'));
  });

  afterEach(() => {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  });

  after(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('normalizes 10-digit, 0-prefixed, and 91-prefixed Indian phone numbers', () => {
    assert.equal(normalizePhone('9876543210'), '919876543210');
    assert.equal(normalizePhone('09876543210'), '919876543210');
    assert.equal(normalizePhone('+91 98765-43210'), '919876543210');
    assert.equal(normalizePhone('12345'), null);
    assert.equal(normalizePhone(null), null);
  });

  it('detects and removes stale browser lock files without removing auth data', async () => {
    const defaultDir = path.join(sessionDir, 'Default');
    fs.mkdirSync(defaultDir, { recursive: true });
    fs.writeFileSync(path.join(defaultDir, 'Cookies'), 'auth-cookie');
    fs.writeFileSync(path.join(sessionDir, 'lockfile'), '');
    fs.writeFileSync(path.join(sessionDir, 'DevToolsActivePort'), '12345');

    assert.equal(hasAnyLockFiles(sessionDir), true);
    await clearStaleLockFiles(sessionDir);
    assert.equal(hasAnyLockFiles(sessionDir), false);
    assert.equal(fs.existsSync(path.join(defaultDir, 'Cookies')), true);
  });

  it('clears cached Service Worker directory while preserving IndexedDB/Cookies', () => {
    const defaultDir = path.join(sessionDir, 'Default');
    const swDir = path.join(defaultDir, 'Service Worker', 'CacheStorage');
    const idbDir = path.join(defaultDir, 'IndexedDB');
    fs.mkdirSync(swDir, { recursive: true });
    fs.mkdirSync(idbDir, { recursive: true });
    fs.writeFileSync(path.join(swDir, 'sw.js'), 'stale');
    fs.writeFileSync(path.join(idbDir, 'wa.db'), 'keep');

    clearStaleServiceWorker(sessionDir);

    assert.equal(fs.existsSync(path.join(defaultDir, 'Service Worker')), false);
    assert.equal(fs.existsSync(path.join(idbDir, 'wa.db')), true);
  });

  it('strips old media (>24h) and prunes old sent items (>7d) while keeping recent/failed/pending', () => {
    const now = 1_700_000_000_000;
    const HOUR = 3600 * 1000;
    const DAY = 24 * HOUR;

    const rows = new Map([
      ['sent-recent', { id: 'sent-recent', status: 'sent', completedAt: now - 2 * HOUR, pdfBase64: 'keep-me' }],
      ['sent-2d', { id: 'sent-2d', status: 'sent', completedAt: now - 2 * DAY, pdfBase64: 'strip-me', imageBase64: 'strip-img' }],
      ['sent-10d', { id: 'sent-10d', status: 'sent', completedAt: now - 10 * DAY, pdfBase64: 'delete-me' }],
      ['failed-10d', { id: 'failed-10d', status: 'failed', completedAt: now - 10 * DAY, pdfBase64: 'keep-failed' }],
      ['pending-10d', { id: 'pending-10d', status: 'pending', timestamp: now - 10 * DAY, pdfBase64: 'keep-pending' }],
    ]);

    const mockStore = {
      getAll: () => Array.from(rows.values()),
      update: (_table, id, patch) => {
        rows.set(id, { ...rows.get(id), ...patch });
      },
      delete: (_table, id) => {
        rows.delete(id);
      },
    };

    const result = pruneOldQueueEntries(mockStore, now);
    assert.deepEqual(result, { stripped: 1, pruned: 1 });
    assert.equal(rows.get('sent-recent').pdfBase64, 'keep-me');
    assert.equal(rows.get('sent-2d').pdfBase64, null);
    assert.equal(rows.get('sent-2d').imageBase64, null);
    assert.equal(rows.has('sent-10d'), false);
    assert.equal(rows.get('failed-10d').pdfBase64, 'keep-failed');
    assert.equal(rows.get('pending-10d').pdfBase64, 'keep-pending');
  });
});
