const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { jsonStore } = require('./database.cjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { app } = require('electron');

// ─── State ────────────────────────────────────────────────────────────────────
let isClientReady = false;
let isProcessingQueue = false;
let currentQR = null;
let initError = null;
let clientState = 'starting'; // 'starting' | 'qr' | 'authenticated' | 'ready' | 'disconnected' | 'auth_failure' | 'error'
let startedAt = Date.now();
let client = null;
let activeBrowserPid = null;
let queueInterval = null;
let healthInterval = null;
let promoInterval = null;
let watchdogInterval = null;
let cleanupInterval = null;
let cleanupInitTimer = null;
let restartAttempts = 0;
let lifecycleGen = 0;
let isStopped = false;
let isManuallyDisconnected = false;
let lifecycleChain = Promise.resolve();
const MAX_RESTART_ATTEMPTS = 10;

// ─── Anti-ban Rate Limiter ────────────────────────────────────────────────────
// Tracks per-phone sends per day to prevent WhatsApp bans
const dailySendCounts = {};  // { 'phoneNumber': { count: N, date: 'YYYY-MM-DD' } }
const MAX_DAILY_PER_NUMBER = 10;  // Max non-invoice messages per phone per day (transactional/reminders)
const MAX_DAILY_PER_NUMBER_PROMO = 1; // Max promo messages per phone per day

// Hourly promo rate limit (globally across all recipients)
let hourlyPromoCount = 0;
let hourlyPromoResetAt = Date.now() + 3600000;
const MAX_HOURLY_PROMO = 60; // Max 60 promo messages per hour globally

// Recent send dedup: prevent exact same (chatId + messageHash) within 5 minutes
const recentSendHashes = new Map(); // hash -> timestamp

// Last sent times per chatId (cooldown)
const lastSentTimes = {};

// ─── Constants ────────────────────────────────────────────────────────────────
const SEND_TIMEOUT_MS = 45000;             // 45s per send
const TRANSACTIONAL_COOLDOWN_MS = 5000;   // 5s min between messages to same number
const PROMO_COOLDOWN_MS = 60000;          // 60s min between promo messages to same number
const PROMO_JITTER_BASE_MS = 30000;       // 30s base jitter for promos
const PROMO_JITTER_RANGE_MS = 30000;      // +0-30s random on top
const DEDUP_WINDOW_MS = 300000;           // 5 min dedup window
// Do-not-disturb hours (IST = UTC+5:30)
const DND_START_HOUR_IST = 21; // 9 PM
const DND_END_HOUR_IST = 9;   // 9 AM

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getBrowserExecutablePath() {
    const localAppData = process.env.LOCALAPPDATA || '';
    const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
    const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';

    const paths = [
        path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(localAppData, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(localAppData, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    ];
    for (const p of paths) {
        try { if (p && fs.existsSync(p)) return p; } catch {}
    }
    return null;
}

function sendWithTimeout(promise, ms = SEND_TIMEOUT_MS) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error(`SendTimeout: timed out after ${ms / 1000}s`)), ms)
        ),
    ]);
}

function normalizePhone(phone) {
    if (!phone || typeof phone !== 'string') return null;
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 11 && digits.startsWith('0')) return `91${digits.slice(1)}`;
    if (digits.length === 12 && digits.startsWith('91')) return digits;
    if (digits.length > 10 && !digits.startsWith('91')) return digits;
    return null;
}

function getISTHour() {
    const now = new Date();
    // IST = UTC + 5:30
    const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    const istMs = utcMs + (5.5 * 3600000);
    return new Date(istMs).getHours();
}

function isDNDActive() {
    const hour = getISTHour();
    // DND: 9 PM (21) to 9 AM (9)
    return hour >= DND_START_HOUR_IST || hour < DND_END_HOUR_IST;
}

function getTodayStr() {
    return new Date().toISOString().slice(0, 10);
}

function hasReachedDailyLimit(chatId, isPromo) {
    const today = getTodayStr();
    const record = dailySendCounts[chatId];
    if (!record || record.date !== today) return false;
    const limit = isPromo ? MAX_DAILY_PER_NUMBER_PROMO : MAX_DAILY_PER_NUMBER;
    return record.count >= limit;
}

function recordDailySend(chatId) {
    const today = getTodayStr();
    if (!dailySendCounts[chatId] || dailySendCounts[chatId].date !== today) {
        dailySendCounts[chatId] = { count: 1, date: today };
    } else {
        dailySendCounts[chatId].count++;
    }
}

function messageHash(chatId, message) {
    return crypto.createHash('md5').update(`${chatId}::${message}`).digest('hex');
}

function isDuplicate(chatId, message) {
    const hash = messageHash(chatId, message);
    const lastSent = recentSendHashes.get(hash);
    if (lastSent && Date.now() - lastSent < DEDUP_WINDOW_MS) return true;
    return false;
}

function recordRecentSend(chatId, message) {
    const hash = messageHash(chatId, message);
    recentSendHashes.set(hash, Date.now());
    // Prune old entries
    if (recentSendHashes.size > 2000) {
        const cutoff = Date.now() - DEDUP_WINDOW_MS;
        for (const [h, ts] of recentSendHashes) {
            if (ts < cutoff) recentSendHashes.delete(h);
        }
    }
}

function checkHourlyPromoLimit() {
    if (Date.now() >= hourlyPromoResetAt) {
        hourlyPromoCount = 0;
        hourlyPromoResetAt = Date.now() + 3600000;
    }
    return hourlyPromoCount < MAX_HOURLY_PROMO;
}

function incrementHourlyPromo() {
    if (Date.now() >= hourlyPromoResetAt) {
        hourlyPromoCount = 0;
        hourlyPromoResetAt = Date.now() + 3600000;
    }
    hourlyPromoCount++;
}

// ─── Browser Process & Client Cleanup ────────────────────────────────────────
let restartTimer = null;
const SESSION_LOCK_FILES = [
    'lockfile',
    'SingletonLock',
    'SingletonSocket',
    'SingletonCookie',
    'DevToolsActivePort',
];

function getAuthDataPath() {
    return path.join(app.getPath('userData'), '.wwebjs_auth');
}

function getSessionDir() {
    return path.join(getAuthDataPath(), 'session');
}

function runLifecycle(fn) {
    const next = lifecycleChain.then(fn, fn);
    lifecycleChain = next.catch(() => {});
    return next;
}

function sleep(ms) {
    return new Promise(res => setTimeout(res, ms));
}

function killProcessTree(pid) {
    if (!Number.isInteger(pid) || pid <= 0) return Promise.resolve();
    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            execFile(
                'taskkill',
                ['/PID', String(pid), '/T', '/F'],
                { windowsHide: true, timeout: 4000 },
                () => resolve()
            );
        } else {
            try { process.kill(pid, 'SIGKILL'); } catch {}
            resolve();
        }
    });
}

function findOrphanedSessionPids(sessionDir) {
    if (process.platform !== 'win32') return Promise.resolve([]);
    const resolvedDir = path.resolve(sessionDir);
    const psExe = path.join(
        process.env.SystemRoot || 'C:\\Windows',
        'System32',
        'WindowsPowerShell',
        'v1.0',
        'powershell.exe'
    );
    const psScript = [
        '$target = $env:NEXUSDESK_WA_SESSION_DIR;',
        'if (-not $target) { exit 0 }',
        '$norm = $target.TrimEnd([char]92, [char]47).ToLowerInvariant();',
        '$procs = Get-CimInstance Win32_Process -Filter "Name=\'chrome.exe\' OR Name=\'msedge.exe\' OR Name=\'chromium.exe\' OR Name=\'chrome-headless-shell.exe\' OR Name=\'headless_shell.exe\'" -ErrorAction SilentlyContinue;',
        'foreach ($p in $procs) {',
        '  if ($p.CommandLine -and $p.CommandLine.ToLowerInvariant().Replace([char]47, [char]92).Contains($norm)) {',
        '    Write-Output $p.ProcessId',
        '  }',
        '}',
    ].join(' ');

    return new Promise((resolve) => {
        execFile(
            psExe,
            ['-NoProfile', '-NonInteractive', '-Command', psScript],
            {
                env: { ...process.env, NEXUSDESK_WA_SESSION_DIR: resolvedDir },
                timeout: 5000,
                windowsHide: true,
            },
            (err, stdout) => {
                if (err || !stdout) return resolve([]);
                const pids = stdout
                    .split(/\r?\n/)
                    .map(line => parseInt(line.trim(), 10))
                    .filter(pid => Number.isInteger(pid) && pid > 0);
                resolve([...new Set(pids)]);
            }
        );
    });
}

function hasAnyLockFiles(sessionDir) {
    if (!fs.existsSync(sessionDir)) return false;
    return SESSION_LOCK_FILES.some(fileName => fs.existsSync(path.join(sessionDir, fileName)));
}

async function clearStaleLockFiles(sessionDir) {
    if (!fs.existsSync(sessionDir)) return;
    for (const fileName of SESSION_LOCK_FILES) {
        const lockPath = path.join(sessionDir, fileName);
        if (!fs.existsSync(lockPath)) continue;
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                fs.rmSync(lockPath, { force: true });
                console.log(`[WhatsApp] Removed stale browser lock file: ${fileName}`);
                break;
            } catch (err) {
                if ((err.code === 'EBUSY' || err.code === 'EPERM') && attempt < 4) {
                    await sleep(200);
                } else {
                    console.warn(`[WhatsApp] Could not remove ${fileName}: ${err.message}`);
                    break;
                }
            }
        }
    }
}

async function cleanupOrphanedSessionBrowsers(sessionDir, forceScan = false) {
    const pids = [];
    if (activeBrowserPid) {
        pids.push(activeBrowserPid);
        activeBrowserPid = null;
    }

    if (forceScan || hasAnyLockFiles(sessionDir)) {
        const foundPids = await findOrphanedSessionPids(sessionDir);
        for (const pid of foundPids) {
            if (!pids.includes(pid)) pids.push(pid);
        }
    }

    if (pids.length > 0) {
        console.warn(`[WhatsApp] Terminating ${pids.length} orphaned session browser process(es): ${pids.join(', ')}`);
        await Promise.all(pids.map(pid => killProcessTree(pid)));
        await sleep(300);
    }

    await clearStaleLockFiles(sessionDir);
    clearStaleServiceWorker(sessionDir);
}

async function destroyClientSafely(targetClient = null, destroyTimeoutMs = 2000) {
    const oldClient = targetClient || client;
    if (!targetClient || targetClient === client) {
        client = null;
        isClientReady = false;
    }
    if (!oldClient) return;

    let proc = null;
    let pid = null;
    try {
        if (oldClient.pupBrowser) {
            proc = oldClient.pupBrowser.process();
            pid = proc?.pid || null;
        }
    } catch {}
    if (!pid && !targetClient) {
        pid = activeBrowserPid;
    }

    try {
        await Promise.race([
            oldClient.destroy().catch(() => {}),
            sleep(destroyTimeoutMs),
        ]);
    } catch {}

    const stillRunning = proc ? (proc.exitCode === null && !proc.killed) : Boolean(pid);
    if (pid && stillRunning) {
        await killProcessTree(pid);
        await sleep(200);
    }
    if (!targetClient || pid === activeBrowserPid) {
        activeBrowserPid = null;
    }
}

const WA_PINNED_VERSION = '2.3000.1048860261-alpha';
const WA_REMOTE_HTML_URL = `https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/${WA_PINNED_VERSION}.html`;

function clearStaleServiceWorker(sessionDir) {
    const swDir = path.join(sessionDir, 'Default', 'Service Worker');
    if (!fs.existsSync(swDir)) return;
    try {
        fs.rmSync(swDir, { recursive: true, force: true });
        console.log('[WhatsApp] Cleared cached Service Worker to keep pinned web version active.');
    } catch (err) {
        console.warn('[WhatsApp] Could not clear Service Worker cache:', err.message);
    }
}

async function ensureLocalWebCache() {
    const cacheDir = path.join(app.getPath('userData'), '.wwebjs_cache');
    const cachedHtmlPath = path.join(cacheDir, `${WA_PINNED_VERSION}.html`);
    if (fs.existsSync(cachedHtmlPath)) {
        try {
            if (fs.statSync(cachedHtmlPath).size > 10000) return cacheDir;
        } catch {}
    }

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        const res = await fetch(WA_REMOTE_HTML_URL, { signal: controller.signal });
        clearTimeout(timer);
        if (res.ok) {
            const html = await res.text();
            if (html && html.length > 10000) {
                fs.mkdirSync(cacheDir, { recursive: true });
                fs.writeFileSync(cachedHtmlPath, html, 'utf-8');
                console.log('[WhatsApp] Cached pinned WhatsApp Web version locally.');
                return cacheDir;
            }
        }
    } catch (err) {
        console.warn('[WhatsApp] Could not pre-cache pinned WhatsApp Web HTML:', err.message);
    }
    return null;
}

// ─── Build Client ─────────────────────────────────────────────────────────────
function buildClient(localCacheDir = null) {
    const authDataPath = getAuthDataPath();
    const webVersionOpts = localCacheDir
        ? {
              webVersion: WA_PINNED_VERSION,
              webVersionCache: {
                  type: 'local',
                  path: localCacheDir,
                  strict: false,
              },
          }
        : {
              webVersionCache: {
                  type: 'remote',
                  remotePath: WA_REMOTE_HTML_URL,
                  strict: false,
              },
          };

    return new Client({
        authStrategy: new LocalAuth({
            dataPath: authDataPath,
        }),
        ...webVersionOpts,
        puppeteer: {
            headless: true,
            executablePath: getBrowserExecutablePath() || undefined,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-features=CalculateNativeWinOcclusion,InterestCohort,Translate,IsolateOrigins,site-per-process',
                '--disable-ipc-flooding-protection',
                '--disable-hang-monitor',
                '--disable-prompt-on-repost',
                '--disable-sync',
                '--disable-site-isolation-trials',
                '--force-color-profile=srgb',
                '--no-default-browser-check',
                '--memory-pressure-off',
                '--autoplay-policy=no-user-gesture-required',
                '--disable-blink-features=AutomationControlled',
            ],
            timeout: 90000, // 90s browser launch timeout
        },
    });
}

// ─── Main Entry ───────────────────────────────────────────────────────────────
function startWhatsAppClient(ipcMain) {
    isStopped = false;
    isManuallyDisconnected = false;

    async function startClientInternal(gen, forceClean = false) {
        if (gen !== lifecycleGen || isStopped || isManuallyDisconnected) return;

        clientState = 'starting';
        isClientReady = false;
        currentQR = null;
        initError = null;
        startedAt = Date.now();

        const sessionDir = getSessionDir();
        await destroyClientSafely();
        await cleanupOrphanedSessionBrowsers(sessionDir, forceClean);
        const localCacheDir = await ensureLocalWebCache();

        if (gen !== lifecycleGen || isStopped || isManuallyDisconnected) return;

        let instance;
        try {
            instance = buildClient(localCacheDir);
            client = instance;
        } catch (err) {
            clientState = 'error';
            initError = `Browser launch failed: ${err.message}`;
            console.error('[WhatsApp] buildClient() threw:', err.message);
            scheduleRestart(15000);
            return;
        }

        const isStaleInstance = () => gen !== lifecycleGen || client !== instance || isStopped || isManuallyDisconnected;

        instance.on('qr', (qr) => {
            if (isStaleInstance()) return;
            console.log('[WhatsApp] QR received — awaiting scan.');
            qrcode.generate(qr, { small: true });
            currentQR = qr;
            clientState = 'qr';
        });

        instance.on('ready', async () => {
            if (isStaleInstance()) return;
            console.log('[WhatsApp] ✓ Client ready & connected');
            isClientReady = true;
            currentQR = null;
            initError = null;
            clientState = 'ready';
            restartAttempts = 0;

            try {
                const pid = instance.pupBrowser?.process?.()?.pid;
                if (pid) activeBrowserPid = pid;
            } catch {}

            try {
                if (instance && instance.pupPage) {
                    instance.pupPage.on('error', (err) => {
                        if (isStaleInstance()) return;
                        console.warn('[WhatsApp] Puppeteer page error:', err.message);
                        if (err.message.includes('detached Frame') || err.message.includes('Target closed') || err.message.includes('Session closed')) {
                            isClientReady = false;
                            clientState = 'disconnected';
                            stopHealthHeartbeat();
                            scheduleRestart(3000);
                        }
                    });
                    instance.pupPage.on('pageerror', (err) => {
                        if (isStaleInstance()) return;
                        console.warn('[WhatsApp] Puppeteer page unhandled JS exception:', err.message);
                    });

                    await instance.pupPage.evaluate(() => {
                        try {
                            const MediaStorage = window.require && window.require('WAWebMediaStorage');
                            if (MediaStorage && MediaStorage.getOrCreateMediaObject) {
                                const orig = MediaStorage.getOrCreateMediaObject;
                                MediaStorage.getOrCreateMediaObject = function(filehash) {
                                    const obj = orig.apply(this, arguments);
                                    if (obj && !obj.id && filehash) {
                                        obj.id = filehash;
                                    }
                                    return obj;
                                };
                            }
                        } catch {}
                    });
                }
            } catch {}

            if (!isStaleInstance()) {
                startHealthHeartbeat();
            }

            // Immediate queue sweep on ready
            setTimeout(() => {
                if (!isStaleInstance() && isClientReady && !isProcessingQueue) {
                    console.log('[WhatsApp] Ready event triggered queue sweep.');
                }
            }, 1000);
        });

        instance.on('authenticated', () => {
            if (isStaleInstance()) return;
            console.log('[WhatsApp] Authenticated — loading session…');
            currentQR = null;
            clientState = 'authenticated';
        });

        instance.on('auth_failure', (msg) => {
            if (isStaleInstance()) return;
            console.error('[WhatsApp] Auth failure:', msg);
            isClientReady = false;
            currentQR = null;
            clientState = 'auth_failure';
            initError = 'Authentication failed. Please re-scan the QR code.';
            stopHealthHeartbeat();
            scheduleRestart(5000);
        });

        instance.on('disconnected', (reason) => {
            if (isStaleInstance()) return;
            console.warn('[WhatsApp] Disconnected:', reason);
            isClientReady = false;
            currentQR = null;
            clientState = 'disconnected';
            initError = `Disconnected: ${reason}`;
            stopHealthHeartbeat();
            scheduleRestart(5000);
        });

        instance.initialize().then(async () => {
            try {
                const pid = instance.pupBrowser?.process?.()?.pid;
                if (pid && !isStaleInstance()) {
                    activeBrowserPid = pid;
                }
            } catch {}

            // If this init finished after being superseded/stopped, tear it down cleanly
            if (isStaleInstance()) {
                await destroyClientSafely(instance, 1500);
            }
        }).catch(async (err) => {
            if (isStaleInstance()) {
                await destroyClientSafely(instance, 1500);
                return;
            }
            const errMsg = err?.message || String(err);
            console.error('[WhatsApp] initialize() threw:', errMsg);
            isClientReady = false;
            clientState = 'error';
            initError = `Initialization failed: ${errMsg}`;
            stopHealthHeartbeat();

            if (/already running|ProcessSingleton|lockfile/i.test(errMsg)) {
                console.warn('[WhatsApp] Detected stale browser profile lock — scheduling clean recovery...');
                scheduleRestart(3000, true);
            } else {
                scheduleRestart(15000);
            }
        });
    }

    function initClient(forceClean = false) {
        const gen = ++lifecycleGen;
        return runLifecycle(() => startClientInternal(gen, forceClean));
    }

    // ── Health Heartbeat & Frame Liveness ────────────────────────────────────
    function startHealthHeartbeat() {
        stopHealthHeartbeat();
        healthInterval = setInterval(async () => {
            if (!client || isStopped || isManuallyDisconnected) return;
            try {
                const state = await Promise.race([
                    client.getState(),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('HeartbeatTimeout')), 10000)),
                ]);
                if (state !== 'CONNECTED') {
                    console.warn(`[WhatsApp] Heartbeat: unexpected state "${state}" — auto-reconnecting.`);
                    isClientReady = false;
                    clientState = 'disconnected';
                    initError = `Connection stale (state: ${state}). Auto-reconnecting…`;
                    stopHealthHeartbeat();
                    scheduleRestart(3000);
                }
            } catch (err) {
                console.warn('[WhatsApp] Heartbeat check caught:', err.message);
                const isDead = err.message === 'HeartbeatTimeout' ||
                    err.message.includes('Protocol error') ||
                    err.message.includes('detached Frame') ||
                    err.message.includes('detached frame') ||
                    err.message.includes('Execution context was destroyed') ||
                    err.message.includes('Target closed') ||
                    err.message.includes('Session closed');
                if (isDead) {
                    isClientReady = false;
                    clientState = 'disconnected';
                    initError = `Connection lost (${err.message.slice(0, 70)}). Auto-reconnecting…`;
                    stopHealthHeartbeat();
                    scheduleRestart(3000);
                }
            }
        }, 30000); // Check every 30 seconds
    }

    function stopHealthHeartbeat() {
        if (healthInterval) { clearInterval(healthInterval); healthInterval = null; }
    }

    // ── Stuck-Startup Watchdog ───────────────────────────────────────────────
    if (watchdogInterval) clearInterval(watchdogInterval);
    watchdogInterval = setInterval(() => {
        if (isStopped || isManuallyDisconnected) return;
        if ((clientState === 'starting' || clientState === 'authenticated') && (Date.now() - startedAt > 105000)) {
            console.warn(`[WhatsApp] Startup watchdog: stuck in "${clientState}" for >105s — forcing clean restart.`);
            isClientReady = false;
            clientState = 'error';
            initError = 'Browser startup timed out — auto-restarting…';
            stopHealthHeartbeat();
            initClient(true);
        }
    }, 20000);

    // ── Queue Bloat Cleanup (strip old sent PDFs >24h, prune sent >7d) ───────
    if (cleanupInitTimer) clearTimeout(cleanupInitTimer);
    cleanupInitTimer = setTimeout(() => {
        cleanupInitTimer = null;
        if (!isStopped) pruneOldQueueEntries();
    }, 10000);
    if (cleanupInterval) clearInterval(cleanupInterval);
    cleanupInterval = setInterval(() => {
        if (!isStopped) pruneOldQueueEntries();
    }, 60 * 60 * 1000);

    // ── Continuous Self-Healing Auto Restart ──────────────────────────────────
    function scheduleRestart(delayMs, forceClean = false) {
        if (isStopped || isManuallyDisconnected) return;
        if (restartTimer) clearTimeout(restartTimer);

        // Exponential backoff capped at 45 seconds for continuous self-healing
        const backoff = Math.min(delayMs * Math.pow(1.3, Math.min(restartAttempts, 6)), 45000);
        restartAttempts++;
        console.log(`[WhatsApp] Auto-recovery scheduled in ${Math.round(backoff / 1000)}s (attempt ${restartAttempts})`);

        restartTimer = setTimeout(() => {
            restartTimer = null;
            if (!isStopped && !isManuallyDisconnected) {
                initClient(forceClean);
            }
        }, backoff);
    }

    // ── Start ────────────────────────────────────────────────────────────────
    initClient(false);

    // ── IPC: Status ──────────────────────────────────────────────────────────
    ipcMain.handle('whatsapp:getStatus', () => {
        let account = null;
        if (client && client.info) {
            account = {
                phone: client.info.wid?.user || '',
                name: client.info.pushname || '',
                platform: client.info.platform || '',
            };
        }
        return {
            ready: isClientReady,
            qr: currentQR,
            state: clientState,
            initError,
            account,
            startedAt,
            elapsedMs: Date.now() - startedAt,
            restartAttempts,
            maxRestarts: MAX_RESTART_ATTEMPTS,
            rateLimits: {
                hourlyPromoUsed: hourlyPromoCount,
                hourlyPromoMax: MAX_HOURLY_PROMO,
                isDND: isDNDActive(),
                dndStart: DND_START_HOUR_IST,
                dndEnd: DND_END_HOUR_IST,
            },
        };
    });

    // ── IPC: Manual Reconnect ────────────────────────────────────────────────
    ipcMain.handle('whatsapp:reconnect', async () => {
        console.log('[WhatsApp] Manual reconnect requested.');
        if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
        isStopped = false;
        isManuallyDisconnected = false;
        restartAttempts = 0;
        stopHealthHeartbeat();
        isClientReady = false;
        currentQR = null;
        clientState = 'starting';
        initError = null;
        await initClient(true);
        return { success: true };
    });

    // ── IPC: Manual Disconnect ───────────────────────────────────────────────
    ipcMain.handle('whatsapp:disconnect', async () => {
        console.log('[WhatsApp] Manual disconnect requested.');
        if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
        isManuallyDisconnected = true;
        ++lifecycleGen;
        stopHealthHeartbeat();
        isClientReady = false;
        currentQR = null;
        clientState = 'disconnected';
        initError = 'Disconnected by operator';
        await runLifecycle(async () => {
            await destroyClientSafely();
            await cleanupOrphanedSessionBrowsers(getSessionDir(), true);
        });
        return { success: true };
    });

    // ── IPC: Logout & Unlink Session ────────────────────────────────────────
    ipcMain.handle('whatsapp:logout', async () => {
        console.log('[WhatsApp] Manual logout & unlink requested.');
        if (restartTimer) { clearTimeout(restartTimer); restartTimer = null; }
        isStopped = false;
        isManuallyDisconnected = false;
        restartAttempts = 0;
        const myGen = ++lifecycleGen;
        stopHealthHeartbeat();
        isClientReady = false;
        currentQR = null;
        clientState = 'starting';
        initError = null;

        await runLifecycle(async () => {
            if (myGen !== lifecycleGen || isStopped) return;
            const currentClient = client;
            if (currentClient) {
                try {
                    if (currentClient.pupPage) {
                        await Promise.race([
                            currentClient.logout().catch(() => {}),
                            sleep(2500),
                        ]);
                    }
                } catch {}
            }
            await destroyClientSafely();
            await cleanupOrphanedSessionBrowsers(getSessionDir(), true);

            const authDataPath = getAuthDataPath();
            try {
                if (fs.existsSync(authDataPath)) {
                    fs.rmSync(authDataPath, {
                        recursive: true,
                        force: true,
                        maxRetries: 6,
                        retryDelay: 250,
                    });
                    console.log('[WhatsApp] Cleared .wwebjs_auth directory.');
                }
            } catch (authRmErr) {
                console.warn('[WhatsApp] Could not clean auth folder:', authRmErr.message);
            }

            await sleep(300);
            await startClientInternal(myGen, false);
        });

        return { success: true };
    });

    // ── IPC: Send Invoice / Message ──────────────────────────────────────────
    ipcMain.handle('whatsapp:sendInvoice', (_, { phone, message, pdfBase64, pdfName, eventId, bypassDailyLimit }) => {
        const normalized = normalizePhone(phone);
        if (!normalized) {
            console.warn(`[WhatsApp] Invalid phone skipped: "${phone}"`);
            return { success: false, error: 'Invalid phone number format' };
        }

        const chatId = `${normalized}@c.us`;
        const dedupKey = eventId ? `event_${eventId}` : `${chatId}_${message || ''}`;

        // Durable database-level event idempotency guard
        if (eventId) {
            const existingQueue = jsonStore.getAll('whatsapp_queue');
            const duplicateItem = existingQueue.find(item => item.eventId === eventId || item.id === `msg_${eventId}`);
            if (duplicateItem) {
                console.log(`[WhatsApp] Durable DB event duplicate suppressed for ${chatId} (eventId: ${eventId})`);
                return { success: true, deduplicated: true };
            }
        }

        // Memory deduplication guard for non-eventId messages
        if (isDuplicate(chatId, dedupKey)) {
            console.log(`[WhatsApp] Idempotent duplicate event/message suppressed for ${chatId} (key: ${dedupKey})`);
            return { success: true, deduplicated: true };
        }

        jsonStore.add('whatsapp_queue', {
            id: eventId ? `msg_${eventId}` : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            status: 'pending',
            retryCount: 0,
            chatId,
            message,
            pdfBase64,
            pdfName,
            eventId: eventId || null,
            isPromo: false,
            bypassDailyLimit: Boolean(bypassDailyLimit),
            timestamp: Date.now(),
        });
        recordRecentSend(chatId, dedupKey);
        return { success: true };
    });

    // ── Queue Processing Loop ────────────────────────────────────────────────
    if (queueInterval) clearInterval(queueInterval);
    queueInterval = setInterval(async () => {
        if (!isClientReady || isProcessingQueue) return;

        let queue;
        try {
            queue = jsonStore.getAll('whatsapp_queue');
        } catch (err) {
            console.error('[WhatsApp] DB read error:', err.message);
            return;
        }

        const pendingItems = queue.filter(item => item.status === 'pending');
        if (pendingItems.length === 0) return;

        isProcessingQueue = true;
        const now = Date.now();
        let transactionalCooldownMs = TRANSACTIONAL_COOLDOWN_MS;
        try {
            const appSettings = jsonStore.getSettings();
            const configuredSec = Number(appSettings?.wa_queue_cooldown_sec);
            if (Number.isFinite(configuredSec) && configuredSec >= 1) {
                transactionalCooldownMs = Math.min(configuredSec, 120) * 1000;
            }
        } catch {}

        let itemToProcess = null;

        for (const item of pendingItems) {
            const lastSent = lastSentTimes[item.chatId] || 0;
            const cooldown = item.isPromo ? PROMO_COOLDOWN_MS : transactionalCooldownMs;

            if (now - lastSent < cooldown) continue;

            // DND check: block promo messages during do-not-disturb hours
            if (item.isPromo && isDNDActive()) {
                // Skip (don't fail — just wait until DND is over)
                continue;
            }

            // Hourly promo rate limit
            if (item.isPromo && !checkHourlyPromoLimit()) {
                console.log('[WhatsApp] Hourly promo rate limit reached — pausing promo sends.');
                continue;
            }

            // Per-number daily limit (never drop paid checkout invoices)
            if (!item.pdfBase64 && !item.bypassDailyLimit && hasReachedDailyLimit(item.chatId, item.isPromo)) {
                // Mark as failed with a clear reason so it doesn't loop forever
                jsonStore.update('whatsapp_queue', item.id, {
                    status: 'failed',
                    completedAt: Date.now(),
                    error: 'Daily send limit reached for this number',
                });
                console.warn(`[WhatsApp] Daily limit for ${item.chatId} — dropping message.`);
                continue;
            }

            itemToProcess = item;
            break;
        }

        if (!itemToProcess) {
            isProcessingQueue = false;
            return;
        }

        try {
            // Step 1: Pre-send readiness check & live state verification
            if (!isClientReady || !client) {
                console.warn('[WhatsApp] Queue worker encountered client unready — pausing worker execution.');
                isProcessingQueue = false;
                return;
            }

            // Verify live engine status before interacting with DOM/Frame
            try {
                const liveState = await Promise.race([
                    client.getState(),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('LiveCheckTimeout')), 4000)),
                ]);
                if (liveState !== 'CONNECTED') {
                    throw new Error(`Engine state is ${liveState}`);
                }
            } catch (stateErr) {
                console.warn(`[WhatsApp] Pre-send check detected non-live engine: ${stateErr.message}. Initiating auto-recovery.`);
                isClientReady = false;
                clientState = 'disconnected';
                initError = `Frame disconnected: ${stateErr.message}`;
                stopHealthHeartbeat();
                scheduleRestart(2000);
                isProcessingQueue = false;
                return;
            }

            // Step 2: Validate recipient registration if phone format is valid
            try {
                const isRegistered = await sendWithTimeout(client.isRegisteredUser(itemToProcess.chatId), 15000);
                if (!isRegistered) {
                    console.warn(`[WhatsApp] ✗ Number ${itemToProcess.chatId} is not registered on WhatsApp — marking permanent failure.`);
                    jsonStore.update('whatsapp_queue', itemToProcess.id, {
                        status: 'failed',
                        completedAt: Date.now(),
                        error: 'Phone number not registered on WhatsApp',
                        errorCategory: 'Invalid Number',
                        permanent: true,
                        retryCount: (itemToProcess.retryCount || 0) + 1,
                    });
                    isProcessingQueue = false;
                    return;
                }
            } catch (regErr) {
                console.warn(`[WhatsApp] Could not verify registration for ${itemToProcess.chatId}: ${regErr.message}. Proceeding with send attempt.`);
            }

            let media = null;
            if (itemToProcess.pdfBase64) {
                const base64Data = itemToProcess.pdfBase64.split(',')[1] || itemToProcess.pdfBase64;
                media = new MessageMedia('application/pdf', base64Data, itemToProcess.pdfName || 'Invoice.pdf');
            } else if (itemToProcess.imageBase64) {
                const mime = itemToProcess.imageBase64.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9\-.+]+).*,/)?.[1] || 'image/jpeg';
                const base64Data = itemToProcess.imageBase64.split(',')[1] || itemToProcess.imageBase64;
                media = new MessageMedia(mime, base64Data, 'Image');
            }

            const isPdf = !!itemToProcess.pdfBase64;
            let fallbackUsed = false;

            if (media) {
                try {
                    await sendWithTimeout(client.sendMessage(itemToProcess.chatId, media, {
                        caption: itemToProcess.message || '',
                        sendMediaAsDocument: isPdf,
                    }), 30000);
                } catch (mediaErr) {
                    console.warn(`[WhatsApp] Media/PDF send failed (${mediaErr.message}). Attempting immediate itemized text fallback...`);
                    if (itemToProcess.message) {
                        try {
                            await sendWithTimeout(client.sendMessage(itemToProcess.chatId, itemToProcess.message), 20000);
                            fallbackUsed = true;
                            console.log(`[WhatsApp] ✓ Delivered via itemized text fallback to ${itemToProcess.chatId}`);
                        } catch (textErr) {
                            console.error(`[WhatsApp] Text fallback also failed: ${textErr.message}`);
                            throw textErr;
                        }
                    } else {
                        throw mediaErr;
                    }
                }
            } else if (itemToProcess.message) {
                await sendWithTimeout(client.sendMessage(itemToProcess.chatId, itemToProcess.message), 20000);
            }

            console.log(`[WhatsApp] ✓ Sent to ${itemToProcess.chatId}${fallbackUsed ? ' (Text Fallback)' : ''}`);
            lastSentTimes[itemToProcess.chatId] = Date.now();
            recordDailySend(itemToProcess.chatId);
            if (itemToProcess.isPromo) incrementHourlyPromo();

            jsonStore.update('whatsapp_queue', itemToProcess.id, {
                status: 'sent',
                completedAt: Date.now(),
                error: null,
                errorCategory: fallbackUsed ? 'Sent via Text Fallback' : null
            });

        } catch (error) {
            const errMsg = error.message || 'Unknown error';
            const errorStack = error.stack ? error.stack.slice(0, 500) : null;
            console.error(`[WhatsApp] ✗ Failed to send to ${itemToProcess.chatId}:`, errMsg);

            let errorCategory = 'Unknown WhatsApp error';
            let isDisconnectError = false;

            if (errMsg.includes('Session closed') || errMsg.includes('Target closed')) {
                errorCategory = 'Session disconnected';
                isDisconnectError = true;
            } else if (errMsg.includes('Protocol error')) {
                errorCategory = 'Protocol error';
                isDisconnectError = true;
            } else if (errMsg.includes('Page crashed')) {
                errorCategory = 'Browser/Puppeteer error';
                isDisconnectError = true;
            } else if (errMsg.includes('SendTimeout')) {
                errorCategory = 'Timeout';
            } else if (errMsg.includes('Execution context was destroyed') || errMsg.includes('Navigating frame') || errMsg.includes('detached Frame') || errMsg.includes('detached frame')) {
                errorCategory = 'Browser Frame Disconnected';
                isDisconnectError = true;
            } else if (errMsg.includes('Evaluation failed')) {
                errorCategory = 'Media file error';
            }

            if (isDisconnectError) {
                isClientReady = false;
                clientState = 'disconnected';
                initError = `Connection lost during send: ${errMsg.slice(0, 80)}`;
                stopHealthHeartbeat();
                scheduleRestart(5000);
            }

            try {
                const currentItem = jsonStore.getById('whatsapp_queue', itemToProcess.id);
                if (currentItem) {
                    // Do not increment retry counter if the failure was purely due to client disconnection
                    const isClientFailure = isDisconnectError && !isClientReady;
                    const newRetry = isClientFailure ? (currentItem.retryCount || 0) : (currentItem.retryCount || 0) + 1;
                    
                    if (newRetry >= 3) {
                        jsonStore.update('whatsapp_queue', itemToProcess.id, {
                            status: 'failed',
                            completedAt: Date.now(),
                            error: errMsg.slice(0, 250),
                            errorCategory,
                            errorStack,
                            retryCount: newRetry,
                        });
                        console.warn(`[WhatsApp] Dropped ${itemToProcess.chatId} after 3 retries. Category: ${errorCategory}`);
                    } else {
                        jsonStore.update('whatsapp_queue', itemToProcess.id, {
                            retryCount: newRetry,
                            lastError: errMsg.slice(0, 250),
                            errorCategory,
                            lastRetryAt: Date.now(),
                        });
                    }
                }
            } catch (dbErr) {
                console.error('[WhatsApp] DB error after send failure:', dbErr.message);
            }

            await new Promise(r => setTimeout(r, 5000));
        } finally {
            isProcessingQueue = false;
        }
    }, 3000);

    // ── Promotions Cron ──────────────────────────────────────────────────────
    if (promoInterval) clearInterval(promoInterval);
    promoInterval = setInterval(() => {
        let promos;
        try {
            promos = jsonStore.getAll('whatsapp_promotions');
        } catch (err) {
            console.error('[WhatsApp] Promo read error:', err.message);
            return;
        }

        const now = Date.now();
        for (const promo of promos) {
            if (promo.status !== 'scheduled' || promo.scheduledAt > now) continue;

            // DND guard: if DND is active, delay the promo until morning
            if (isDNDActive()) {
                console.log(`[WhatsApp] Promo "${promo.name}" delayed — DND hours active (9 PM – 9 AM IST).`);
                continue;
            }

            console.log(`[WhatsApp] Firing promo: "${promo.name}" → ${promo.recipients.length} recipients`);
            jsonStore.update('whatsapp_promotions', promo.id, { status: 'processing' });

            const timestamp = Date.now();
            let queued = 0;
            const seenPhones = new Set(); // Deduplicate recipients within the campaign

            for (const phone of promo.recipients) {
                const normalized = normalizePhone(phone);
                if (!normalized) {
                    console.warn(`[WhatsApp] Promo skipping invalid phone: "${phone}"`);
                    continue;
                }
                const chatId = `${normalized}@c.us`;

                // Skip duplicates within same campaign
                if (seenPhones.has(chatId)) {
                    console.log(`[WhatsApp] Duplicate recipient ${chatId} skipped in campaign "${promo.name}".`);
                    continue;
                }
                seenPhones.add(chatId);

                // Add natural jitter delay proportional to position in queue
                // This spaces messages 30–60 seconds apart naturally
                const jitterMs = queued * (PROMO_JITTER_BASE_MS + Math.floor(Math.random() * PROMO_JITTER_RANGE_MS));
                const sendAt = timestamp + jitterMs;

                try {
                    jsonStore.add('whatsapp_queue', {
                        id: `${timestamp}-${Math.random().toString(36).slice(2, 9)}`,
                        status: 'pending',
                        retryCount: 0,
                        chatId,
                        message: promo.message,
                        imageBase64: promo.imageBase64 || null,
                        isPromo: true,
                        campaignId: promo.id,
                        timestamp: sendAt, // Use jittered timestamp for ordering
                    });
                    queued++;
                } catch (dbErr) {
                    console.error(`[WhatsApp] Failed to queue promo for ${chatId}:`, dbErr.message);
                }
            }

            const estimatedMinutes = Math.ceil(queued * ((PROMO_JITTER_BASE_MS + PROMO_JITTER_RANGE_MS / 2) / 60000));
            jsonStore.update('whatsapp_promotions', promo.id, {
                status: 'completed',
                completedAt: timestamp,
                queuedCount: queued,
                estimatedMinutes,
            });
            console.log(`[WhatsApp] Promo "${promo.name}" queued ${queued} messages (est. ${estimatedMinutes} min).`);
        }
    }, 60000);
}

async function stopWhatsAppClient() {
    console.log('[WhatsApp] Stopping client gracefully...');
    isStopped = true;
    ++lifecycleGen;
    isProcessingQueue = false;
    if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
    }
    if (queueInterval) {
        clearInterval(queueInterval);
        queueInterval = null;
    }
    if (healthInterval) {
        clearInterval(healthInterval);
        healthInterval = null;
    }
    if (promoInterval) {
        clearInterval(promoInterval);
        promoInterval = null;
    }
    if (watchdogInterval) {
        clearInterval(watchdogInterval);
        watchdogInterval = null;
    }
    if (cleanupInitTimer) {
        clearTimeout(cleanupInitTimer);
        cleanupInitTimer = null;
    }
    if (cleanupInterval) {
        clearInterval(cleanupInterval);
        cleanupInterval = null;
    }
    await runLifecycle(async () => {
        await destroyClientSafely();
        await clearStaleLockFiles(getSessionDir());
    });
    isClientReady = false;
    clientState = 'disconnected';
}

function pruneOldQueueEntries(store = jsonStore, now = Date.now()) {
    try {
        const items = store.getAll('whatsapp_queue');
        const ONE_DAY_MS = 24 * 60 * 60 * 1000;
        const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;
        let stripped = 0;
        let pruned = 0;

        for (const item of items) {
            if (item.status !== 'sent') continue;
            const doneAt = item.completedAt || item.timestamp || 0;
            if (!doneAt) continue;
            const age = now - doneAt;
            if (age > SEVEN_DAYS_MS) {
                store.delete('whatsapp_queue', item.id);
                pruned++;
            } else if (age > ONE_DAY_MS && (item.pdfBase64 || item.imageBase64)) {
                store.update('whatsapp_queue', item.id, { pdfBase64: null, imageBase64: null });
                stripped++;
            }
        }
        if (stripped > 0 || pruned > 0) {
            console.log(`[WhatsApp] Queue maintenance: stripped media from ${stripped} sent item(s), pruned ${pruned} old sent record(s).`);
        }
        return { stripped, pruned };
    } catch (err) {
        console.warn('[WhatsApp] Queue maintenance skipped:', err.message);
        return { stripped: 0, pruned: 0 };
    }
}

module.exports = {
    startWhatsAppClient,
    stopWhatsAppClient,
    normalizePhone,
    hasAnyLockFiles,
    clearStaleLockFiles,
    clearStaleServiceWorker,
    pruneOldQueueEntries,
};
