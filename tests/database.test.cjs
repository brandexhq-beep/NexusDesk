const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexusdesk-db-test-'));
const handlers = new Map();

const origLoad = Module._load;
Module._load = function patchedLoad(request) {
  if (request === 'electron') {
    return {
      app: {
        getPath: () => tmpDir,
      },
      ipcMain: {
        handle: (channel, fn) => handlers.set(channel, fn),
      },
    };
  }
  return origLoad.apply(this, arguments);
};

const { setupIpcHandlers, jsonStore, closeDatabase } = require('../electron/database.cjs');
Module._load = origLoad;

describe('Database IPC & WAL Backup', () => {
  before(() => {
    setupIpcHandlers();
  });

  after(() => {
    closeDatabase();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('prevents duplicate active sessions on the same station atomically', async () => {
    const addSession = handlers.get('db:sessions:add');
    await addSession(null, {
      id: 'sess-1',
      station_id: '1',
      status: 'active',
      start_time: new Date().toISOString(),
    });

    await assert.rejects(
      () => addSession(null, {
        id: 'sess-2',
        station_id: '1',
        status: 'active',
        start_time: new Date().toISOString(),
      }),
      /Station already has an active session/
    );
  });

  it('reads app settings cleanly via jsonStore.getSettings()', () => {
    const settings = jsonStore.getSettings();
    assert.equal(typeof settings.cafe_name, 'string');
    assert.ok(settings.cafe_name.length > 0);
  });

  it('updates transaction notes cleanly via db:transactions:update', async () => {
    const addTx = handlers.get('db:transactions:add');
    const updateTx = handlers.get('db:transactions:update');
    const getAllTx = handlers.get('db:transactions:getAll');

    await addTx(null, { id: 'tx-1', session_id: 'sess-1', amount: 200, note: 'Session (Cash)' });
    await updateTx(null, 'tx-1', { note: 'Session (UPI)' });

    const all = await getAllTx();
    const updated = all.find((t) => t.id === 'tx-1');
    assert.equal(updated.note, 'Session (UPI)');
  });

  it('creates a valid WAL-backed SQLite auto-backup on startup', async () => {
    // Allow db.backup promise to finish
    await new Promise((r) => setTimeout(r, 300));
    const backupDir = path.join(tmpDir, 'backups');
    const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.sqlite'));
    assert.equal(files.length, 1);
    const stat = fs.statSync(path.join(backupDir, files[0]));
    assert.ok(stat.size > 0);
  });
});
