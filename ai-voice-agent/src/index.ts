import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import twilio from 'twilio';
import { validateEnv } from './config';
import { handleVoiceWebhook } from './voice-webhook';
import { RelayHandler } from './relay-handler';

// Crash fast with a helpful message if env vars are missing.
// This saves 20 minutes of debugging at 9pm before a conference.
const env = validateEnv();

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// ─── Twilio Voice Webhook ────────────────────────────────────────────────────
// Twilio calls POST /voice when a call comes in. We validate the signature
// (security!) and return TwiML that connects the call to our ConversationRelay.
app.post('/voice', (req, res) => {
  // Always validate Twilio signatures on webhooks — prevents spoofing attacks.
  const isValid = twilio.validateRequest(
    env.TWILIO_AUTH_TOKEN,
    req.headers['x-twilio-signature'] as string ?? '',
    `${env.BASE_URL}/voice`,
    req.body as Record<string, string>
  );

  if (!isValid) {
    console.warn(`[${timestamp()}] ⚠️  Invalid Twilio signature — request rejected`);
    return res.status(403).send('Forbidden');
  }

  console.log(`[${timestamp()}] 📞 Incoming call from ${req.body.From as string}`);
  handleVoiceWebhook(req, res, env);
});

// ─── Health Check ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── HTTP + WebSocket Server ─────────────────────────────────────────────────
// ConversationRelay requires a WebSocket connection. We attach the WSS server
// to the same HTTP server so a single ngrok tunnel handles both.
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/relay' });

wss.on('connection', (ws, req) => {
  console.log(`[${timestamp()}] 🔌 ConversationRelay connected from ${req.socket.remoteAddress ?? 'unknown'}`);
  const handler = new RelayHandler(ws, env);
  handler.start();
});

httpServer.listen(env.PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║     Twilio AI Voice Agent — ConversationRelay        ║
╠══════════════════════════════════════════════════════╣
║  HTTP Server  : http://localhost:${env.PORT}               ║
║  WebSocket    : ws://localhost:${env.PORT}/relay            ║
║  Voice Hook   : ${env.BASE_URL}/voice
║                                                      ║
║  Next Step: Set your Twilio phone number webhook     ║
║  to ${env.BASE_URL}/voice (POST)            ║
╚══════════════════════════════════════════════════════╝
  `);
});

function timestamp(): string {
  return new Date().toLocaleTimeString();
}
