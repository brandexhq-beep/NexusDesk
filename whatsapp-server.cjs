const express = require('express');
const cors = require('cors');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Allow large payloads for Base64 PDF

const port = 3001;

// Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let isClientReady = false;

client.on('qr', (qr) => {
    console.log('Scan this QR code in WhatsApp to link your account:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('WhatsApp client is ready and connected!');
    isClientReady = true;
});

client.on('authenticated', () => {
    console.log('Authenticated successfully.');
});

client.on('auth_failure', msg => {
    console.error('Authentication failure', msg);
});

client.initialize();

// API Endpoint to send invoice
app.post('/send-invoice', async (req, res) => {
    try {
        if (!isClientReady) {
            return res.status(503).json({ error: 'WhatsApp client is not ready yet. Please check the terminal.' });
        }

        const { phone, message, pdfBase64, pdfName } = req.body;

        if (!phone || !message) {
            return res.status(400).json({ error: 'Missing phone or message in payload.' });
        }

        // Format phone number to WhatsApp ID
        const formattedPhone = phone.replace(/\D/g, ''); // strip all non-numeric chars
        let fullPhone = formattedPhone;
        if (fullPhone.length === 10) {
            fullPhone = `91${fullPhone}`; // Default to India (+91) if 10 digits
        }
        const chatId = `${fullPhone}@c.us`;

        // Create media from base64 if provided
        let media = null;
        if (pdfBase64) {
            const base64Data = pdfBase64.split(',')[1] || pdfBase64;
            media = new MessageMedia('application/pdf', base64Data, pdfName || 'Invoice.pdf');
        }

        // Send message
        if (media) {
            await client.sendMessage(chatId, message, { media });
        } else {
            await client.sendMessage(chatId, message);
        }

        console.log(`Successfully sent message to ${chatId}`);
        res.json({ success: true, message: 'Message sent successfully.' });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message.' });
    }
});

app.listen(port, () => {
    console.log(`WhatsApp Server is running on http://localhost:${port}`);
    console.log(`Generating QR code, please wait...`);
});
