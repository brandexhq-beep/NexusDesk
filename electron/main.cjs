const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { setupIpcHandlers, closeDatabase } = require('./database.cjs');
const { startWhatsAppClient, stopWhatsAppClient } = require('./whatsapp.cjs');

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
  
  // Support private repositories using GH_TOKEN (or packaged fallback token)
  const ghToken = process.env.GH_TOKEN || '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';
  if (ghToken) {
    autoUpdater.requestHeaders = { "Authorization": `bearer ${ghToken}` };
  }

  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for update...');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update_checking');
    }
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update_available', info);
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[Updater] Already up to date:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update_not_available', info);
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    console.log(`[Updater] Download: ${Math.round(progressObj.percent)}%`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update_progress', progressObj);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Update downloaded, ready to install:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update_downloaded', info);
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update_error', { message: err.message });
    }
  });

  // IPC: check for updates on demand
  ipcMain.handle('updater:checkNow', async () => {
    if (!app.isPackaged) {
      return { status: 'dev_mode', message: 'Updates are enabled in packaged production builds.' };
    }
    try {
      const res = await autoUpdater.checkForUpdates();
      return { status: 'ok', updateInfo: res?.updateInfo };
    } catch (e) {
      console.error('[Updater] Check failed:', e.message);
      return { status: 'error', message: e.message };
    }
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

// ─── Backup / Restore Dialogs & Filesystem ──────────────────────────────────
const fs = require('fs');

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

ipcMain.handle('db:backup:writeExportFile', async (_, { filePath, data }) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('db:backup:readImportFile', async (_, filePath) => {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return { success: true, data: JSON.parse(raw) };
  } catch (err) {
    return { success: false, error: err.message };
  }
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

let isQuitting = false;
app.on('before-quit', async (e) => {
  if (isQuitting) return; // Cleanup already in progress

  // Block the immediate quit to do async cleanup
  e.preventDefault();
  isQuitting = true;
  
  console.log('[App] Teardown started...');
  
  // Emergency exit timer if cleanup hangs
  const forceQuitTimer = setTimeout(() => {
    console.warn('[App] Teardown timed out after 4s — forcing quit.');
    app.exit(0);
  }, 4000);

  try {
    await stopWhatsAppClient();
  } catch (err) {
    console.error('[App] Error stopping WhatsApp client:', err);
  }
  
  try {
    closeDatabase();
  } catch (err) {
    console.error('[App] Error closing database:', err);
  }
  
  clearTimeout(forceQuitTimer);
  console.log('[App] Teardown complete. Exiting.');
  app.quit(); // Actually quit now
});

