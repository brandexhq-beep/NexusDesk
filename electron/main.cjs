const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const isDev = require('electron-is-dev');
const { autoUpdater } = require('electron-updater');
const { fork } = require('child_process');

let mainWindow;
let whatsappServerProcess;

function startWhatsAppServer() {
  const serverPath = path.join(__dirname, '..', 'whatsapp-server.cjs');
  whatsappServerProcess = fork(serverPath, [], { stdio: 'inherit' });
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

  // Open the window maximized by default
  mainWindow.maximize();

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Handle auto-updates
  autoUpdater.checkForUpdatesAndNotify();

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
