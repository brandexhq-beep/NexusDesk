const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { jsonStore } = require('./database.cjs');
const crypto = require('crypto');

// ─── State ────────────────────────────────────────────────────────────────────
let isClientReady = false;
let isProcessingQueue = false;
let currentQR = null;
let initError = null;
let clientState = 'starting'; // 'starting' | 'qr' | 'authenticated' | 'ready' | 'disconnected' | 'auth_failure' | 'error'
let startedAt = Date.now();
let client = null;
let queueInterval = null;
let healthInterval = null;
let restartAttempts = 0;
const MAX_RESTART_ATTEMPTS = 10;

// ─── Anti-ban Rate Limiter ────────────────────────────────────────────────────
// Tracks per-phone sends per day to prevent WhatsApp bans
const dailySendCounts = {};  // { 'phoneNumber': { count: N, date: 'YYYY-MM-DD' } }
const MAX_DAILY_PER_NUMBER = 3;   // Max messages per phone per day (transactional)
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
    const fs = require('fs');
    const paths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
    for (const p of paths) {
        try { if (fs.existsSync(p)) return p; } catch (_) {}
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

// ─── Build Client ─────────────────────────────────────────────────────────────
function buildClient() {
    return new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
            headless: true,
            executablePath: getBrowserExecutablePath() || undefined,
            args: [
                '--no-sandbox', '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas',
                '--no-first-run', '--no-zygote', '--disable-gpu',
                '--disable-extensions', '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--memory-pressure-off',
            ],
            timeout: 90000, // 90s browser launch timeout
        },
    });
}

// ─── Main Entry ───────────────────────────────────────────────────────────────
function startWhatsAppClient(ipcMain) {

    function initClient() {
        clientState = 'starting';
        isClientReady = false;
        currentQR = null;
        initError = null;
        startedAt = Date.now();

        try {
            client = buildClient();
        } catch (err) {
            clientState = 'error';
            initError = `Browser launch failed: ${err.message}`;
            console.error('[WhatsApp] buildClient() threw:', err.message);
            scheduleRestart(30000);
            return;
        }

        client.on('qr', (qr) => {
            console.log('[WhatsApp] QR received — awaiting scan.');
            qrcode.generate(qr, { small: true });
            currentQR = qr;
            clientState = 'qr';
        });

        client.on('ready', () => {
            console.log('[WhatsApp] ✓ Client ready');
            isClientReady = true;
            currentQR = null;
            initError = null;
            clientState = 'ready';
            restartAttempts = 0;
            startHealthHeartbeat();
        });

        client.on('authenticated', () => {
            console.log('[WhatsApp] Authenticated — loading session…');
            currentQR = null;
            clientState = 'authenticated';
        });

        client.on('auth_failure', (msg) => {
            console.error('[WhatsApp] Auth failure:', msg);
            isClientReady = false;
            currentQR = null;
            clientState = 'auth_failure';
            initError = 'Authentication failed. Please re-scan the QR code.';
            stopHealthHeartbeat();
            scheduleRestart(5000);
        });

        client.on('disconnected', (reason) => {
            console.warn('[WhatsApp] Disconnected:', reason);
            isClientReady = false;
            currentQR = null;
            clientState = 'disconnected';
            initError = `Disconnected: ${reason}`;
            stopHealthHeartbeat();
            scheduleRestart(10000);
        });

        client.initialize().catch((err) => {
            console.error('[WhatsApp] initialize() threw:', err.message);
            clientState = 'error';
            initError = `Initialization failed: ${err.message}`;
            stopHealthHeartbeat();
            scheduleRestart(30000);
        });
    }

    // ── Health Heartbeat ─────────────────────────────────────────────────────
    // Periodically checks if the client is truly alive even when marked ready.
    // whatsapp-web.js can silently become unresponsive without firing 'disconnected'.
    function startHealthHeartbeat() {
        stopHealthHeartbeat();
        healthInterval = setInterval(async () => {
            if (!isClientReady || !client) return;
            try {
                const state = await Promise.race([
                    client.getState(),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('HeartbeatTimeout')), 10000)),
                ]);
                if (state !== 'CONNECTED') {
                    console.warn(`[WhatsApp] Heartbeat: unexpected state "${state}" — triggering restart.`);
                    isClientReady = false;
                    clientState = 'disconnected';
                    initError = `Connection stale (state: ${state}). Reconnecting…`;
                    stopHealthHeartbeat();
                    scheduleRestart(5000);
                }
            } catch (err) {
                console.warn('[WhatsApp] Heartbeat failed:', err.message);
                if (err.message === 'HeartbeatTimeout' || err.message.includes('Protocol error')) {
                    isClientReady = false;
                    clientState = 'disconnected';
                    initError = 'Connection stale (heartbeat timeout). Reconnecting…';
                    stopHealthHeartbeat();
                    scheduleRestart(5000);
                }
            }
        }, 60000); // Check every 60 seconds
    }

    function stopHealthHeartbeat() {
        if (healthInterval) { clearInterval(healthInterval); healthInterval = null; }
    }

    // ── Auto Restart ─────────────────────────────────────────────────────────
    function scheduleRestart(delayMs) {
        if (restartAttempts >= MAX_RESTART_ATTEMPTS) {
            console.error('[WhatsApp] Max restart attempts reached.');
            clientState = 'error';
            initError = 'Max reconnection attempts reached. Please restart the application manually.';
            return;
        }
        // Exponential backoff: delay doubles each attempt, capped at 5 minutes
        const backoff = Math.min(delayMs * Math.pow(1.5, restartAttempts), 300000);
        restartAttempts++;
        console.log(`[WhatsApp] Restart in ${Math.round(backoff / 1000)}s (attempt ${restartAttempts}/${MAX_RESTART_ATTEMPTS})`);
        setTimeout(() => {
            try { if (client) { client.destroy().catch(() => {}); client = null; } } catch (_) {}
            initClient();
        }, backoff);
    }

    // ── Start ────────────────────────────────────────────────────────────────
    initClient();

    // ── IPC: Status ──────────────────────────────────────────────────────────
    ipcMain.handle('whatsapp:getStatus', () => ({
        ready: isClientReady,
        qr: currentQR,
        state: clientState,
        initError,
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
    }));

    // ── IPC: Manual Reconnect ────────────────────────────────────────────────
    ipcMain.handle('whatsapp:reconnect', () => {
        console.log('[WhatsApp] Manual reconnect requested.');
        restartAttempts = 0;
        stopHealthHeartbeat();
        try { if (client) { client.destroy().catch(() => {}); client = null; } } catch (_) {}
        setTimeout(() => initClient(), 500);
        return { queued: true };
    });

    // ── IPC: Send Invoice / Message ──────────────────────────────────────────
    ipcMain.handle('whatsapp:sendInvoice', (_, { phone, message, pdfBase64, pdfName }) => {
        const normalized = normalizePhone(phone);
        if (!normalized) {
            console.warn(`[WhatsApp] Invalid phone skipped: "${phone}"`);
            return { success: false, error: 'Invalid phone number format' };
        }

        const chatId = `${normalized}@c.us`;

        // Deduplication: don't queue exact same message to same number within 5 min
        if (isDuplicate(chatId, message || '')) {
            console.log(`[WhatsApp] Duplicate message to ${chatId} suppressed.`);
            return { success: true, deduplicated: true };
        }

        jsonStore.add('whatsapp_queue', {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
            status: 'pending',
            retryCount: 0,
            chatId,
            message,
            pdfBase64,
            pdfName,
            isPromo: false,
            timestamp: Date.now(),
        });
        recordRecentSend(chatId, message || '');
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
        let itemToProcess = null;

        for (const item of pendingItems) {
            const lastSent = lastSentTimes[item.chatId] || 0;
            const cooldown = item.isPromo ? PROMO_COOLDOWN_MS : TRANSACTIONAL_COOLDOWN_MS;

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

            // Per-number daily limit
            if (hasReachedDailyLimit(item.chatId, item.isPromo)) {
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
            let media = null;
            if (itemToProcess.pdfBase64) {
                const base64Data = itemToProcess.pdfBase64.split(',')[1] || itemToProcess.pdfBase64;
                media = new MessageMedia('application/pdf', base64Data, itemToProcess.pdfName || 'Invoice.pdf');
            } else if (itemToProcess.imageBase64) {
                const mime = itemToProcess.imageBase64.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9\-.+]+).*,/)?.[1] || 'image/jpeg';
                const base64Data = itemToProcess.imageBase64.split(',')[1] || itemToProcess.imageBase64;
                media = new MessageMedia(mime, base64Data, 'Image');
            }

            const sendPromise = media
                ? client.sendMessage(itemToProcess.chatId, itemToProcess.message, { media })
                : client.sendMessage(itemToProcess.chatId, itemToProcess.message);

            await sendWithTimeout(sendPromise);

            console.log(`[WhatsApp] ✓ Sent to ${itemToProcess.chatId}`);
            lastSentTimes[itemToProcess.chatId] = Date.now();
            recordDailySend(itemToProcess.chatId);
            if (itemToProcess.isPromo) incrementHourlyPromo();

            jsonStore.update('whatsapp_queue', itemToProcess.id, {
                status: 'sent',
                completedAt: Date.now(),
            });

        } catch (error) {
            const errMsg = error.message || 'Unknown error';
            console.error(`[WhatsApp] ✗ Failed to send to ${itemToProcess.chatId}:`, errMsg);

            // Detect disconnection mid-send
            if (
                errMsg.includes('Session closed') ||
                errMsg.includes('Target closed') ||
                errMsg.includes('Protocol error') ||
                errMsg.includes('Page crashed') ||
                errMsg.includes('SendTimeout')
            ) {
                isClientReady = false;
                clientState = 'disconnected';
                initError = `Connection lost during send: ${errMsg.slice(0, 80)}`;
                stopHealthHeartbeat();
                scheduleRestart(5000);
            }

            try {
                const currentItem = jsonStore.getById('whatsapp_queue', itemToProcess.id);
                if (currentItem) {
                    const newRetry = (currentItem.retryCount || 0) + 1;
                    if (newRetry >= 3) {
                        jsonStore.update('whatsapp_queue', itemToProcess.id, {
                            status: 'failed',
                            completedAt: Date.now(),
                            error: errMsg.slice(0, 200),
                            retryCount: newRetry,
                        });
                        console.warn(`[WhatsApp] Dropped ${itemToProcess.chatId} after 3 retries.`);
                    } else {
                        jsonStore.update('whatsapp_queue', itemToProcess.id, {
                            retryCount: newRetry,
                            lastError: errMsg.slice(0, 200),
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
    setInterval(() => {
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

module.exports = { startWhatsAppClient };
