const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { autoUpdater } = require('electron-updater');
const { fork } = require('child_process');

let mainWindow;
let whatsappServerProcess;

function startWhatsAppServer() {
  const packagedPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'whatsapp-server.cjs');
  const asarPath = path.join(__dirname, '..', 'whatsapp-server.cjs');
  const rootPath = path.join(process.resourcesPath, 'whatsapp-server.cjs');
  
  const fs = require('fs');
  let finalPath = asarPath;
  if (fs.existsSync(rootPath)) {
    finalPath = rootPath;
  } else if (fs.existsSync(packagedPath)) {
    finalPath = packagedPath;
  }

  try {
    whatsappServerProcess = fork(finalPath, [], { stdio: 'inherit' });
  } catch (err) {
    console.error('Failed to fork WhatsApp server process:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    autoHideMenuBar: true, // Hides the File/Edit/View menu bar
    webPreferences: {
      nodeIntegration: true, 
      contextIsolation: false,
      webSecurity: false 
    },
    title: 'Gaming Cafe Management',
  });

  mainWindow.maximize();

  const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Handle Auto-Updater Events
autoUpdater.on('update-available', () => {
  if (mainWindow) {
    mainWindow.webContents.send('update_available');
  }
});

autoUpdater.on('update-downloaded', () => {
  if (mainWindow) {
    mainWindow.webContents.send('update_downloaded');
  }
  // Optional: prompt user before restarting
  // autoUpdater.quitAndInstall();
});

// Backup and Restore IPC handlers
ipcMain.handle('save-backup-dialog', async (event, defaultFilename) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: 'Save Backup',
    defaultPath: defaultFilename,
    filters: [{ name: 'JSON Data', extensions: ['json'] }]
  });
  return result;
});

ipcMain.handle('open-restore-dialog', async (event) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Backup File',
    properties: ['openFile'],
    filters: [{ name: 'JSON Data', extensions: ['json'] }]
  });
  return result;
});

app.on('ready', () => {
  startWhatsAppServer();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (whatsappServerProcess) {
    whatsappServerProcess.kill();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
