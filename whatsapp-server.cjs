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
app.use(express.json({ limit: '10mb' })); // Allow large payloads for Base64 PDF

const port = 3001;
const QUEUE_FILE = path.join(__dirname, 'whatsapp-queue.json');

// Initialize queue file if it doesn't exist
if (!fs.existsSync(QUEUE_FILE)) {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify([]));
}

function getQueue() {
    try {
        return JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
    } catch (err) {
        return [];
    }
}

function saveQueue(queue) {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
}

// Initialize WhatsApp Client with heavy optimizations
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

// Process the queue periodically
setInterval(async () => {
    if (!isClientReady || isProcessingQueue) return;

    const queue = getQueue();
    if (queue.length === 0) return;

    isProcessingQueue = true;
    const item = queue[0];

    try {
        let media = null;
        if (item.pdfBase64) {
            const base64Data = item.pdfBase64.split(',')[1] || item.pdfBase64;
            media = new MessageMedia('application/pdf', base64Data, item.pdfName || 'Invoice.pdf');
        }

        if (media) {
            await client.sendMessage(item.chatId, item.message, { media });
        } else {
            await client.sendMessage(item.chatId, item.message);
        }

        console.log(`Successfully sent queued message to ${item.chatId}`);
        
        // Remove from queue on success
        const updatedQueue = getQueue();
        if (updatedQueue.length > 0 && updatedQueue[0].id === item.id) {
            updatedQueue.shift();
            saveQueue(updatedQueue);
        }
    } catch (error) {
        console.error(`Failed to send message to ${item.chatId}. Error:`, error.message);
        
        const updatedQueue = getQueue();
        if (updatedQueue.length > 0 && updatedQueue[0].id === item.id) {
            updatedQueue[0].retryCount = (updatedQueue[0].retryCount || 0) + 1;
            
            if (updatedQueue[0].retryCount >= 3) {
                console.warn(`Dropping message to ${item.chatId} after 3 failed retries to prevent queue deadlock.`);
                updatedQueue.shift();
            }
            saveQueue(updatedQueue);
        }
        
        // Wait a bit longer if there's an error
        await new Promise(r => setTimeout(r, 5000));
    } finally {
        isProcessingQueue = false;
    }
}, 3000); // Check queue every 3 seconds

// API Endpoints for Queue Management
app.get('/whatsapp-queue', (req, res) => {
    res.json(getQueue());
});

app.delete('/whatsapp-queue/:id', (req, res) => {
    const queue = getQueue();
    const newQueue = queue.filter(item => item.id !== req.params.id);
    saveQueue(newQueue);
    res.json({ success: true, message: 'Message deleted from queue.' });
});

app.post('/whatsapp-queue/clear', (req, res) => {
    saveQueue([]);
    res.json({ success: true, message: 'Queue cleared completely.' });
});

// API Endpoint to check status and get QR code
app.get('/whatsapp-status', (req, res) => {
    res.json({
        ready: isClientReady,
        qr: currentQR
    });
});

// API Endpoint to queue an invoice/message
app.post('/send-invoice', async (req, res) => {
    try {
        const { phone, message, pdfBase64, pdfName } = req.body;

        if (!phone || !message) {
            return res.status(400).json({ error: 'Missing phone or message in payload.' });
        }

        // Format phone number to WhatsApp ID
        const formattedPhone = phone.replace(/\D/g, ''); 
        let fullPhone = formattedPhone;
        if (fullPhone.length === 10) {
            fullPhone = `91${fullPhone}`; 
        }
        const chatId = `${fullPhone}@c.us`;

        // Add to queue
        const queue = getQueue();
        const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
        queue.push({ id, retryCount: 0, chatId, message, pdfBase64, pdfName, timestamp: Date.now() });
        saveQueue(queue);

        console.log(`Queued message for ${chatId}. Queue length: ${queue.length}`);
        res.json({ success: true, message: 'Message queued successfully.' });
    } catch (error) {
        console.error('Error queuing message:', error);
        res.status(500).json({ error: 'Failed to queue message.' });
    }
});

app.listen(port, () => {
    console.log(`WhatsApp Server is running on http://localhost:${port}`);
    console.log(`Generating QR code, please wait...`);
});
