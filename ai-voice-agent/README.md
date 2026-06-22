# Twilio AI Voice Agent — ConversationRelay Demo

An AI-powered phone agent built with **Twilio ConversationRelay** and **OpenAI**. When someone calls your Twilio number, they're connected to an AI assistant that can have a natural conversation, look up account info, schedule callbacks, and transfer to a human agent.

This is ruthandtech's first open-source Twilio demo — built to showcase the agentic future of customer conversations.

```
Customer calls → Twilio → ConversationRelay → Your Server → OpenAI → Response → Customer hears AI
```

## What This Demonstrates

- **ConversationRelay** — Twilio's bridge between PSTN calls and AI backends
- **Streaming AI responses** — Low-latency text-to-speech via token streaming
- **Function calling / Tool use** — AI can look up data and take actions mid-call
- **Barge-in** — User can interrupt the AI at any time
- **Human escalation** — Graceful handoff when AI can't help
- **Production patterns** — Request validation, env validation, TypeScript, error handling

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Your Server                          │
│                                                              │
│  POST /voice ──► TwiML with <ConversationRelay>             │
│                              │                               │
│  WSS /relay ◄──────────────►│                               │
│      │                 Twilio Platform                       │
│      │           (STT, TTS, call lifecycle)                  │
│      │                                                       │
│  relay-handler.ts                                            │
│      │                                                       │
│  openai-service.ts ──► OpenAI Chat Completions (streaming)  │
│      │                                                       │
│  tools/ ──► Your CRM / Database / APIs                      │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

- [Node.js 18+](https://nodejs.org/)
- [Twilio account](https://www.twilio.com/try-twilio) with a phone number
- [OpenAI API key](https://platform.openai.com/api-keys)
- [ngrok](https://ngrok.com/) (for local development)

## Setup (5 minutes)

### 1. Clone and install

```bash
git clone https://github.com/your-username/twilio-ai-voice-agent
cd twilio-ai-voice-agent
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `TWILIO_ACCOUNT_SID` — From [Twilio Console](https://console.twilio.com/)
- `TWILIO_AUTH_TOKEN` — From [Twilio Console](https://console.twilio.com/)
- `TWILIO_PHONE_NUMBER` — Your Twilio phone number (E.164 format: `+15551234567`)
- `OPENAI_API_KEY` — From [OpenAI Platform](https://platform.openai.com/api-keys)
- `BASE_URL` — Your ngrok URL (fill in after step 3)

### 3. Start ngrok tunnel

```bash
ngrok http 3000
```

Copy the `https://` URL (e.g., `https://abc123.ngrok-free.app`) and set it as `BASE_URL` in your `.env`.

### 4. Start the server

```bash
npm run dev
```

You should see the startup banner with your webhook URL.

### 5. Configure your Twilio phone number

1. Go to [Twilio Console → Phone Numbers](https://console.twilio.com/us1/develop/phone-numbers/manage/incoming)
2. Click your phone number
3. Under **Voice Configuration**, set **A call comes in** to:
   - Webhook: `https://your-ngrok-url.ngrok-free.app/voice`
   - Method: `HTTP POST`
4. Save

### 6. Call your number!

Call your Twilio phone number. You should be connected to the AI within 2-3 seconds.

## What to Try

- "What's my account status?"
- "I'd like to schedule a callback for tomorrow at 3pm"
- "Can I speak to a human please?"
- Interrupt the AI mid-sentence (barge-in)

## Project Structure

```
src/
├── index.ts          # Server entry point, WebSocket setup
├── config.ts         # Environment validation with Zod
├── voice-webhook.ts  # POST /voice → ConversationRelay TwiML
├── relay-handler.ts  # WebSocket session per call
├── openai-service.ts # OpenAI streaming + tool calling
└── tools/
    └── index.ts      # Tool definitions + implementations
```

## Customizing the AI

### Change the persona
Edit `buildSystemPrompt()` in `relay-handler.ts`.

### Add tools
Add a new entry to `TOOL_DEFINITIONS` in `src/tools/index.ts` and implement it in `executeToolCall()`.

### Add customer context (Twilio Segment)
In `relay-handler.ts`, the `handleSetup()` method receives the caller's phone number. Add a Segment `identify()` call here to fetch customer profile data and inject it into the system prompt.

```typescript
// In handleSetup():
const profile = await analytics.identify({ userId: callerNumber });
// Pass profile to buildSystemPrompt() for personalization
```

## Next Steps

1. **Connect your CRM** — Replace the stub implementations in `src/tools/` with real API calls
2. **Add Segment** — Personalize responses with customer history before the first word
3. **Deploy to Railway** — One-click production deploy
4. **Add Voice Intelligence** — Post-call transcription and AI analysis

## Deployment

### Railway (Recommended)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

1. Fork this repo
2. Connect to Railway
3. Add environment variables in Railway dashboard
4. Railway auto-deploys on push

### Environment Variables for Production

Same as `.env.example` but:
- `BASE_URL` = your Railway/Heroku/Render URL
- No ngrok needed

## Resources

- [Twilio ConversationRelay Docs](https://www.twilio.com/docs/voice/twiml/connect/conversationrelay)
- [OpenAI Chat Completions Docs](https://platform.openai.com/docs/guides/text-generation)
- [Twilio Voice TwiML Reference](https://www.twilio.com/docs/voice/twiml)
- [Twilio Signal Conference Talks](https://signal.twilio.com/)

## License

MIT — use this however you like. Star the repo if it helped you! ⭐
