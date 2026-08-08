const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { jsonStore } = require('./database.cjs');

let isClientReady = false;
let isProcessingQueue = false;
let currentQR = null;
const lastSentTimes = {};

function getBrowserExecutablePath() {
    const fs = require('fs');
    const paths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
    ];
    for (const p of paths) {
        if (fs.existsSync(p)) return p;
    }
    return null; // Let puppeteer try its default
}

function startWhatsAppClient(ipcMain) {
    const client = new Client({
        authStrategy: new LocalAuth(),
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
                '--disable-gpu'
            ]
        }
    });

    client.on('qr', (qr) => {
        console.log('Scan this QR code in WhatsApp to link your account:');
        qrcode.generate(qr, { small: true });
        currentQR = qr;
    });

    client.on('ready', () => {
        console.log('WhatsApp client is ready and connected!');
        isClientReady = true;
        currentQR = null;
    });

    client.on('authenticated', () => {
        console.log('Authenticated successfully.');
        currentQR = null;
    });

    client.on('auth_failure', msg => {
        console.error('Authentication failure', msg);
        isClientReady = false;
        currentQR = null;
    });

    client.on('disconnected', (reason) => {
        console.log('Client was disconnected', reason);
        isClientReady = false;
        currentQR = null;
    });

    client.initialize();

    // IPC Handlers for frontend to get status
    ipcMain.handle('whatsapp:getStatus', () => ({ ready: isClientReady, qr: currentQR }));

    // Queue processing loop
    setInterval(async () => {
        if (!isClientReady || isProcessingQueue) return;
        
        const queue = jsonStore.getAll('whatsapp_queue');
        const pendingItems = queue.filter(item => item.status === 'pending');
        
        if (pendingItems.length === 0) return;
        
        isProcessingQueue = true;
        const now = Date.now();
        let itemToProcess = null;

        for (let i = 0; i < pendingItems.length; i++) {
            const item = pendingItems[i];
            const lastSent = lastSentTimes[item.chatId] || 0;
            const limit = item.isPromo ? 25000 : 15000;
            if (now - lastSent >= limit) {
                itemToProcess = item;
                break;
            }
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
                const mime = itemToProcess.imageBase64.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,/)?.[1] || 'image/jpeg';
                const base64Data = itemToProcess.imageBase64.split(',')[1] || itemToProcess.imageBase64;
                media = new MessageMedia(mime, base64Data, 'Image');
            }

            if (media) {
                await client.sendMessage(itemToProcess.chatId, itemToProcess.message, { media });
            } else {
                await client.sendMessage(itemToProcess.chatId, itemToProcess.message);
            }

            console.log(`Successfully sent queued message to ${itemToProcess.chatId}`);
            lastSentTimes[itemToProcess.chatId] = Date.now();
            
            jsonStore.update('whatsapp_queue', itemToProcess.id, { status: 'sent', completedAt: Date.now() });
        } catch (error) {
            console.error(`Failed to send message to ${itemToProcess.chatId}. Error:`, error.message);
            
            const currentItem = jsonStore.getById('whatsapp_queue', itemToProcess.id);
            if (currentItem) {
                const newRetry = (currentItem.retryCount || 0) + 1;
                if (newRetry >= 3) {
                    console.warn(`Dropping message to ${itemToProcess.chatId} after 3 failed retries.`);
                    jsonStore.update('whatsapp_queue', itemToProcess.id, { status: 'failed', completedAt: Date.now(), error: error.message, retryCount: newRetry });
                } else {
                    jsonStore.update('whatsapp_queue', itemToProcess.id, { retryCount: newRetry });
                }
            }
            await new Promise(r => setTimeout(r, 5000));
        } finally {
            isProcessingQueue = false;
        }
    }, 3000);

    // Promotions cron
    setInterval(() => {
        const promos = jsonStore.getAll('whatsapp_promotions');
        const now = Date.now();
        
        for (let promo of promos) {
            if (promo.status === 'scheduled' && promo.scheduledAt <= now) {
                console.log(`Triggering promotion blast: ${promo.name}`);
                jsonStore.update('whatsapp_promotions', promo.id, { status: 'processing' });
                
                const timestamp = Date.now();
                
                promo.recipients.forEach(phone => {
                    const formattedPhone = phone.replace(/\D/g, ''); 
                    let fullPhone = formattedPhone;
                    if (fullPhone.length === 10) fullPhone = `91${fullPhone}`; 
                    const chatId = `${fullPhone}@c.us`;
                    
                    jsonStore.add('whatsapp_queue', {
                        id: timestamp.toString() + Math.random().toString(36).substr(2, 9),
                        status: 'pending',
                        retryCount: 0,
                        chatId,
                        message: promo.message,
                        imageBase64: promo.imageBase64,
                        isPromo: true,
                        campaignId: promo.id,
                        timestamp
                    });
                });
                
                jsonStore.update('whatsapp_promotions', promo.id, { status: 'completed', completedAt: timestamp });
            }
        }
    }, 60000);

    // Express endpoints were replaced by IPC, so for send-invoice:
    ipcMain.handle('whatsapp:sendInvoice', (_, { phone, message, pdfBase64, pdfName }) => {
        const formattedPhone = phone.replace(/\D/g, ''); 
        let fullPhone = formattedPhone.length === 10 ? `91${formattedPhone}` : formattedPhone;
        
        jsonStore.add('whatsapp_queue', {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9), 
            status: 'pending',
            retryCount: 0, 
            chatId: `${fullPhone}@c.us`, 
            message, 
            pdfBase64, 
            pdfName, 
            timestamp: Date.now() 
        });
        return { success: true };
    });
}

module.exports = { startWhatsAppClient };
