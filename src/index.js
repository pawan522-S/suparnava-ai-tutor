require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { handleIncomingMessage } = require('./messageHandler');

// ── Route imports ──────────────────────────────────
const authRoutes = require('./routes/auth');
const tutorRoutes = require('./routes/tutor');
const lessonRoutes = require('./routes/lessons');
const progressRoutes = require('./routes/progress');
const challengeRoutes = require('./routes/challenges');
const scenarioRoutes = require('./routes/scenarios');

const app = express();
const PORT = process.env.PORT || 3000;

// ═══════════════════════════════════════════════════
// Security & CORS
// ═══════════════════════════════════════════════════
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP to allow inline scripts in frontend
}));
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ═══════════════════════════════════════════════════
// Serve Frontend Static Files
// ═══════════════════════════════════════════════════
const path = require('path');
const fs = require('fs');
const frontendDir = path.join(__dirname, '..', 'frontend');
if (fs.existsSync(frontendDir)) {
    app.use(express.static(frontendDir));
    console.log('[Server] Frontend served from /frontend');
}

// ═══════════════════════════════════════════════════
// REST API Routes
// ═══════════════════════════════════════════════════
app.use('/api/auth', authRoutes);
app.use('/api/tutor', tutorRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/progress', progressRoutes);
app.use('/api/challenges', challengeRoutes);
app.use('/api/scenarios', scenarioRoutes);

// ═══════════════════════════════════════════════════
// Health Check
// ═══════════════════════════════════════════════════
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'Suparnava AI English Tutor',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        providers: {
            ai: process.env.AI_PROVIDER || 'groq',
            stt: process.env.STT_PROVIDER || 'groq',
            tts: process.env.TTS_PROVIDER || 'google',
        },
    });
});

// ═══════════════════════════════════════════════════
// WhatsApp Webhook — Verification (GET)
// ═══════════════════════════════════════════════════
app.get('/webhook', (req, res) => {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === verifyToken) {
        console.log('[Webhook] ✅ Verification successful');
        return res.status(200).send(challenge);
    }
    console.warn('[Webhook] ❌ Verification failed — token mismatch');
    return res.status(403).send('Forbidden');
});

// ═══════════════════════════════════════════════════
// WhatsApp Webhook — Incoming Messages (POST)
// ═══════════════════════════════════════════════════
app.post('/webhook', async (req, res) => {
    res.status(200).send('OK'); // Always respond 200 immediately

    try {
        const body = req.body;
        if (
            body.object !== 'whatsapp_business_account' ||
            !body.entry?.[0]?.changes?.[0]?.value?.messages
        ) return;

        const messages = body.entry[0].changes[0].value.messages;
        if (!messages || messages.length === 0) return;

        for (const message of messages) {
            console.log(`[Webhook] Received ${message.type} from ${message.from}`);
            handleIncomingMessage(message).catch(err => {
                console.error('[Webhook] Error:', err);
            });
        }
    } catch (error) {
        console.error('[Webhook] Parse error:', error);
    }
});

// ═══════════════════════════════════════════════════
// Root — Serve Frontend Index
// ═══════════════════════════════════════════════════
app.get('/', (req, res) => {
    const indexPath = path.join(frontendDir, 'index.html');
    if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
    }
    res.json({
        status: 'running',
        service: 'Suparnava AI English Tutor API v2.0',
        docs: `http://localhost:${PORT}/api/health`,
    });
});

// ═══════════════════════════════════════════════════
// Global Error Handler
// ═══════════════════════════════════════════════════
app.use((err, req, res, _next) => {
    console.error('[Server] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error. Please try again.' });
});

// ═══════════════════════════════════════════════════
// Start Server
// ═══════════════════════════════════════════════════
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║   🎓  Suparnava AI English Tutor  v2.0              ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║   Port:      ${String(PORT).padEnd(38)}║
║   Frontend:  http://localhost:${String(PORT).padEnd(25)}║
║   API:       http://localhost:${PORT}/api/health              ║
║                                                      ║
║   REST API Endpoints:                                ║
║     POST /api/auth/register    Create account        ║
║     POST /api/auth/login       Sign in               ║
║     POST /api/tutor/chat       Chat with AI tutor    ║
║     GET  /api/lessons          Get lessons           ║
║     GET  /api/progress         Analytics dashboard   ║
║     GET  /api/challenges/daily Daily challenge       ║
║     GET  /api/scenarios        Practice scenarios    ║
║                                                      ║
║   WhatsApp Webhook: GET/POST /webhook                ║
╚══════════════════════════════════════════════════════╝
  `);
});

module.exports = app;
