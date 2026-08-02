const express = require('express');
const cors = require('cors');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

process.on('unhandledRejection', (reason, promise) => {
    if (reason && reason.toString().includes('EBUSY')) {
        console.error('Caught EBUSY error (likely whatsapp-web.js lockfile). Preventing crash:', reason);
    } else {
        console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    }
});

process.on('uncaughtException', (err) => {
    if (err && err.message && err.message.includes('EBUSY')) {
        console.error('Caught EBUSY exception (likely whatsapp-web.js lockfile). Preventing crash:', err.message);
    } else {
        console.error('Uncaught Exception:', err);
        process.exit(1);
    }
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const port = 3001;
const QUEUE_FILE = path.join(__dirname, 'whatsapp-queue.json');
const PROMOTIONS_FILE = path.join(__dirname, 'whatsapp-promotions.json');

if (!fs.existsSync(QUEUE_FILE)) {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify([]));
}
if (!fs.existsSync(PROMOTIONS_FILE)) {
    fs.writeFileSync(PROMOTIONS_FILE, JSON.stringify([]));
}

function getQueue() {
    try {
        return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
    } catch (err) {
        return [];
    }
}

function saveQueue(queue) {
    const fiveMinsAgo = Date.now() - 5 * 60 * 1000;
    const cleanedQueue = queue.filter(item => item.status === 'pending' || (item.completedAt && item.completedAt > fiveMinsAgo));
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(cleanedQueue, null, 2));
}

function getPromotions() {
    try {
        return JSON.parse(fs.readFileSync(PROMOTIONS_FILE, 'utf8'));
    } catch (err) {
        return [];
    }
}

function savePromotions(promos) {
    fs.writeFileSync(PROMOTIONS_FILE, JSON.stringify(promos, null, 2));
}

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
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

let isClientReady = false;
let isProcessingQueue = false;
let currentQR = null;
const lastSentTimes = {}; // Rate limiting map

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

// Message Processing Queue loop
setInterval(async () => {
    if (!isClientReady || isProcessingQueue) return;

    const queue = getQueue();
    const pendingItems = queue.filter(item => item.status === 'pending');
    
    if (pendingItems.length === 0) {
        saveQueue(queue); 
        return;
    }

    isProcessingQueue = true;
    
    const now = Date.now();
    let itemToProcess = null;

    for (let i = 0; i < pendingItems.length; i++) {
        const item = pendingItems[i];
        const lastSent = lastSentTimes[item.chatId] || 0;
        // Rate limit: 15s for normal messages, 25s for promotions (isPromo flag)
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
        
        const updatedQueue = getQueue();
        const updateIndex = updatedQueue.findIndex(q => q.id === itemToProcess.id);
        if (updateIndex !== -1) {
            updatedQueue[updateIndex].status = 'sent';
            updatedQueue[updateIndex].completedAt = Date.now();
            saveQueue(updatedQueue);
        }
    } catch (error) {
        console.error(`Failed to send message to ${itemToProcess.chatId}. Error:`, error.message);
        
        const updatedQueue = getQueue();
        const updateIndex = updatedQueue.findIndex(q => q.id === itemToProcess.id);
        if (updateIndex !== -1) {
            updatedQueue[updateIndex].retryCount = (updatedQueue[updateIndex].retryCount || 0) + 1;
            if (updatedQueue[updateIndex].retryCount >= 3) {
                console.warn(`Dropping message to ${itemToProcess.chatId} after 3 failed retries.`);
                updatedQueue[updateIndex].status = 'failed';
                updatedQueue[updateIndex].completedAt = Date.now();
                updatedQueue[updateIndex].error = error.message;
            }
            saveQueue(updatedQueue);
        }
        await new Promise(r => setTimeout(r, 5000));
    } finally {
        isProcessingQueue = false;
    }
}, 3000); 

// Promotions Cron Job Loop (Runs every 60s)
setInterval(() => {
    const promos = getPromotions();
    const now = Date.now();
    let hasChanges = false;
    
    for (let promo of promos) {
        if (promo.status === 'scheduled' && promo.scheduledAt <= now) {
            console.log(`Triggering promotion blast: ${promo.name}`);
            promo.status = 'processing';
            hasChanges = true;
            
            const queue = getQueue();
            const timestamp = Date.now();
            
            promo.recipients.forEach(phone => {
                const formattedPhone = phone.replace(/\D/g, ''); 
                let fullPhone = formattedPhone;
                if (fullPhone.length === 10) fullPhone = `91${fullPhone}`; 
                const chatId = `${fullPhone}@c.us`;
                
                queue.push({
                    id: timestamp.toString() + Math.random().toString(36).substr(2, 9),
                    status: 'pending',
                    retryCount: 0,
                    chatId,
                    message: promo.message,
                    imageBase64: promo.imageBase64,
                    isPromo: true, // Promos get slightly slower rate-limiting
                    campaignId: promo.id,
                    timestamp
                });
            });
            
            saveQueue(queue);
            promo.status = 'completed';
            promo.completedAt = timestamp;
            console.log(`Queued ${promo.recipients.length} promotional messages.`);
        }
    }
    
    if (hasChanges) savePromotions(promos);
}, 60000);

app.get('/promotions/progress/:id', (req, res) => {
    const queue = getQueue();
    const campaignItems = queue.filter(q => q.campaignId === req.params.id);
    if (campaignItems.length === 0) return res.json({ total: 0, sent: 0, failed: 0 });
    
    const sent = campaignItems.filter(q => q.status === 'sent').length;
    const failed = campaignItems.filter(q => q.status === 'failed').length;
    res.json({ total: campaignItems.length, sent, failed });
});

app.get('/whatsapp-queue', (req, res) => res.json(getQueue()));

app.delete('/whatsapp-queue/:id', (req, res) => {
    const newQueue = getQueue().filter(item => item.id !== req.params.id);
    saveQueue(newQueue);
    res.json({ success: true, message: 'Message deleted from queue.' });
});

app.post('/whatsapp-queue/clear', (req, res) => {
    saveQueue([]);
    res.json({ success: true, message: 'Queue cleared completely.' });
});

app.get('/whatsapp-status', (req, res) => {
    res.json({ ready: isClientReady, qr: currentQR });
});

app.post('/send-invoice', async (req, res) => {
    try {
        const { phone, message, pdfBase64, pdfName } = req.body;
        if (!phone || !message) return res.status(400).json({ error: 'Missing phone or message.' });

        const formattedPhone = phone.replace(/\D/g, ''); 
        let fullPhone = formattedPhone.length === 10 ? `91${formattedPhone}` : formattedPhone;
        
        const queue = getQueue();
        queue.push({ 
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9), 
            status: 'pending',
            retryCount: 0, 
            chatId: `${fullPhone}@c.us`, 
            message, 
            pdfBase64, 
            pdfName, 
            timestamp: Date.now() 
        });
        saveQueue(queue);
        res.json({ success: true, message: 'Message queued.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to queue message.' });
    }
});

// Promotions Endpoints
app.get('/promotions', (req, res) => res.json(getPromotions()));

app.post('/promotions/schedule', (req, res) => {
    const { name, message, scheduledAt, recipients, imageBase64 } = req.body;
    if (!message || !recipients || !Array.isArray(recipients)) {
        return res.status(400).json({ error: 'Invalid payload.' });
    }
    const promos = getPromotions();
    const newPromo = {
        id: Date.now().toString(),
        name: name || 'Campaign',
        message,
        scheduledAt: scheduledAt || Date.now(),
        recipients,
        imageBase64: imageBase64 || null,
        status: 'scheduled',
        createdAt: Date.now()
    };
    promos.push(newPromo);
    savePromotions(promos);
    res.json({ success: true, promotion: newPromo });
});

app.delete('/promotions/:id', (req, res) => {
    const newPromos = getPromotions().filter(p => p.id !== req.params.id);
    savePromotions(newPromos);
    res.json({ success: true });
});

app.listen(port, () => {
    console.log(`WhatsApp Server is running on http://localhost:${port}`);
});
