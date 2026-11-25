const fs = require('fs');
const path = require('path');
const util = require('util');

const MAX_LOG_BYTES = 2 * 1024 * 1024; // 2 MB per file (~4 MB total with .1 rotation)

let logFilePath = null;
let backupLogFilePath = null;
let isInitialized = false;

function rotateIfNeeded() {
  if (!logFilePath) return;
  try {
    if (!fs.existsSync(logFilePath)) return;
    const stats = fs.statSync(logFilePath);
    if (stats.size >= MAX_LOG_BYTES) {
      if (fs.existsSync(backupLogFilePath)) {
        fs.rmSync(backupLogFilePath, { force: true });
      }
      fs.renameSync(logFilePath, backupLogFilePath);
    }
  } catch {}
}

function appendLogLine(level, args) {
  if (!logFilePath) return;
  try {
    rotateIfNeeded();
    const message = util.format(...args);
    const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
    fs.appendFileSync(logFilePath, line, 'utf-8');
  } catch {}
}

function initLogger(userDataDir) {
  if (isInitialized) return logFilePath;
  isInitialized = true;

  try {
    const logsDir = path.join(userDataDir, 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    logFilePath = path.join(logsDir, 'app.log');
    backupLogFilePath = path.join(logsDir, 'app.log.1');
  } catch {
    return null;
  }

  const origLog = console.log.bind(console);
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);

  console.log = (...args) => {
    origLog(...args);
    appendLogLine('INFO', args);
  };
  console.warn = (...args) => {
    origWarn(...args);
    appendLogLine('WARN', args);
  };
  console.error = (...args) => {
    origError(...args);
    appendLogLine('ERROR', args);
  };

  return logFilePath;
}

function getDiagnosticLogText(meta = {}) {
  const headerLines = [
    '=== NexusDesk / Sara Gaming Zone Diagnostic Logs ===',
    `Exported At: ${new Date().toISOString()}`,
    `Platform: ${process.platform} (${process.arch})`,
    `Node: ${process.version} | Electron: ${process.versions.electron || 'n/a'}`,
    ...Object.entries(meta).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`),
    '====================================================',
    '',
  ];

  const parts = [headerLines.join('\n')];

  try {
    if (backupLogFilePath && fs.existsSync(backupLogFilePath)) {
      parts.push('--- Previous Log (app.log.1) ---\n' + fs.readFileSync(backupLogFilePath, 'utf-8'));
    }
    if (logFilePath && fs.existsSync(logFilePath)) {
      parts.push('--- Current Log (app.log) ---\n' + fs.readFileSync(logFilePath, 'utf-8'));
    } else {
      parts.push('(No log file recorded yet.)');
    }
  } catch (err) {
    parts.push(`(Error reading log files: ${err.message})`);
  }

  return parts.join('\n');
}

function getLogFilePath() {
  return logFilePath;
}

module.exports = { initLogger, getDiagnosticLogText, getLogFilePath };
