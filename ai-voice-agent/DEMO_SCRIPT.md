# Demo Script: Twilio AI Voice Agent

**Duration**: 3 minutes  
**Audience**: Developers, PMs, conference attendees  
**Format**: Live demo (code visible on screen)

---

## Opening Hook (30 seconds)

> "60% of customer interactions still start with a phone call. Most of those calls hit an IVR menu from 2003 — press 1 for billing, press 2 to hear this menu again. Today I'm going to show you what happens when you replace that with an AI that actually understands what you want."

*[Start the server, ngrok running, console visible]*

---

## The Setup (30 seconds)

> "Here's the architecture in one line: customer calls → Twilio → my server → OpenAI → Twilio speaks back. ConversationRelay is the Twilio product that makes this work. It handles everything PSTN: transcription, TTS, barge-in, connection lifecycle. I just write the AI logic."

*[Show the architecture ASCII in relay-handler.ts briefly]*

---

## Live Demo (90 seconds)

*[Call the Twilio number from your phone, put on speaker]*

1. AI answers with the welcome greeting
2. Say: "Hi, what's my account status?"
   - *[AI calls `get_account_info` tool — show console log showing tool call]*
   - *[AI responds with account info]*
3. Say: "Can you schedule a callback for tomorrow at 2pm?"
   - *[AI calls `schedule_callback` — show confirmation ID in console]*
4. Interrupt the AI mid-sentence
   - *[Show barge-in working — AI stops, user speaks]*
5. Say: "I'd like to speak to a real person"
   - *[AI calls `transfer_to_human` gracefully]*

---

## What to Highlight (30 seconds)

> "Notice three things: first, the AI streamed tokens back to Twilio in real time — that's why it sounds natural, not like it's waiting to finish thinking. Second, it used function calling to actually DO things, not just answer questions. Third — and this is the key — none of this required me to build an IVR, a speech recognition system, or a TTS pipeline. Twilio handles all of that. I wrote 200 lines of TypeScript."

*[Show src/relay-handler.ts — point to the clean WebSocket event handling]*

---

## So What (30 seconds)

> "This repo is on GitHub right now. Clone it, npm install, and you can have your own AI phone agent running in 5 minutes. The tools in here are stubs — but they show you exactly where to connect your CRM, your Segment data, your booking system. The agentic future of customer conversations isn't 5 years away. It's this. Today."

*[Show GitHub URL on screen — large font]*

---

## Top 3 Questions to Anticipate

**Q: How much does it cost?**  
A: "ConversationRelay is priced per minute of call + Twilio's normal voice rates. OpenAI is ~$0.01/minute for gpt-4o. A 5-minute customer service call runs about $0.15–0.25 total. Compare that to a human agent at $1–3/minute."

**Q: What about latency?**  
A: "End-to-end latency from user stops speaking to AI starts responding is ~600ms–1s. That's the STT (fast, Twilio handles it) + LLM inference (streaming, so first token is ~300ms) + TTS (built into ConversationRelay). Perceptible but acceptable for voice."

**Q: Can I use Claude / Gemini instead of OpenAI?**  
A: "Yes. In `openai-service.ts`, swap the fetch call to Anthropic's API or Gemini. The rest of the code is LLM-agnostic. I'm literally just passing text in and streaming text out."
