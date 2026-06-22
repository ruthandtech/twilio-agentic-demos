import { Request, Response } from 'express';
import { Env } from './config';

/**
 * Returns TwiML that connects the incoming call to ConversationRelay.
 *
 * ConversationRelay is Twilio's bridge between the PSTN (phone calls) and
 * your AI backend. It handles STT, TTS, barge-in, DTMF, and the WebSocket
 * session lifecycle — so you only need to focus on the AI logic.
 *
 * Docs: https://www.twilio.com/docs/voice/twiml/connect/conversationrelay
 */
export function handleVoiceWebhook(req: Request, res: Response, env: Env): void {
  const callerNumber = req.body.From as string;

  // We pass the caller's number as a custom parameter so our WebSocket handler
  // can look up customer context from Segment / CRM before the AI speaks.
  const relayUrl = `wss://${new URL(env.BASE_URL).host}/relay?caller=${encodeURIComponent(callerNumber)}`;

  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay
      url="${relayUrl}"
      welcomeGreeting="Hello! I'm an AI assistant. How can I help you today?"
      voice="en-US-Journey-O"
      transcriptionProvider="deepgram"
      ttsProvider="google"
      dtmfDetection="true"
      interruptByDtmf="true"
    />
  </Connect>
</Response>`;

  res.type('text/xml').send(twiml);
}
