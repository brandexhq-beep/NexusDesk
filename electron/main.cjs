const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { setupIpcHandlers } = require('./database.cjs');
const { startWhatsAppClient } = require('./whatsapp.cjs');

let mainWindow;

// ─── Global Error Guards ─────────────────────────────────────────────────────
// Prevent WhatsApp / Puppeteer errors from crashing the entire Electron process.
process.on('unhandledRejection', (reason) => {
  const msg = reason ? reason.toString() : '';
  if (msg.includes('EBUSY') || msg.includes('Protocol error') || msg.includes('Target closed')) {
    console.warn('[WhatsApp] Non-fatal rejection suppressed:', msg.slice(0, 200));
  } else {
    console.error('[App] Unhandled Rejection:', reason);
  }
});

process.on('uncaughtException', (err) => {
  const msg = err && err.message ? err.message : String(err);
  if (msg.includes('EBUSY') || msg.includes('Protocol error') || msg.includes('Target closed')) {
    console.warn('[WhatsApp] Non-fatal exception suppressed:', msg.slice(0, 200));
  } else {
    console.error('[App] Uncaught Exception:', err);
    // Only exit for truly unexpected errors, not WhatsApp ones
    // process.exit(1);  // commented so UI stays alive
  }
});

// ─── Window ──────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    title: 'Sara Gaming Zone',
  });

  mainWindow.maximize();

  const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── Auto Updater ────────────────────────────────────────────────────────────
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.requestHeaders = { "Authorization": `bearer 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` };

  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version);
    if (mainWindow) mainWindow.webContents.send('update_available', info);
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[Updater] Already up to date:', info.version);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    console.log(`[Updater] Download: ${Math.round(progressObj.percent)}%`);
    if (mainWindow) mainWindow.webContents.send('update_progress', progressObj);
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Update downloaded, ready to install:', info.version);
    if (mainWindow) mainWindow.webContents.send('update_downloaded', info);
  });

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err.message);
  });

  // IPC: check for updates on demand
  ipcMain.handle('updater:checkNow', async () => {
    try { await autoUpdater.checkForUpdates(); } catch (e) { console.error('[Updater] Check failed:', e.message); }
  });

  // IPC: install now (quit & install)
  ipcMain.handle('updater:installNow', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  // Only check in packaged builds
  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch((e) => {
      console.warn('[Updater] Initial check failed:', e.message);
    });
  }
}

// ─── Backup / Restore Dialogs ────────────────────────────────────────────────
ipcMain.handle('save-backup-dialog', async (event, defaultFilename) => {
  return dialog.showSaveDialog(mainWindow, {
    title: 'Save Backup',
    defaultPath: defaultFilename,
    filters: [{ name: 'JSON Data', extensions: ['json'] }],
  });
});

ipcMain.handle('open-restore-dialog', async () => {
  return dialog.showOpenDialog(mainWindow, {
    title: 'Select Backup File',
    properties: ['openFile'],
    filters: [{ name: 'JSON Data', extensions: ['json'] }],
  });
});

// ─── App Lifecycle ────────────────────────────────────────────────────────────
app.on('ready', () => {
  setupIpcHandlers();
  startWhatsAppClient(ipcMain);
  createWindow();
  setupAutoUpdater();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
