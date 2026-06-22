import WebSocket from 'ws';
import { Env } from './config';
import { OpenAIRealtimeService, type SessionConfig } from './openai-service';
import { executeToolCall, TOOL_DEFINITIONS } from './tools';

// ConversationRelay sends typed JSON events over the WebSocket.
// Full event reference: https://www.twilio.com/docs/voice/twiml/connect/conversationrelay
type RelayEvent =
  | { type: 'setup'; callSid: string; from: string; to: string; customParameters?: Record<string, string> }
  | { type: 'prompt'; voicePrompt: string; lang: string; last: boolean }
  | { type: 'interrupt' }
  | { type: 'dtmf'; digit: string }
  | { type: 'end'; reasonCode: string };

type RelayResponse =
  | { type: 'text'; token: string; last: boolean }
  | { type: 'end' };

/**
 * Manages a single ConversationRelay session for one phone call.
 *
 * Lifecycle:
 *  1. "setup" event → configure the AI session with caller context
 *  2. "prompt" events → user speech (transcribed by Twilio) → forward to OpenAI
 *  3. AI response (streaming) → send tokens back to Twilio via "text" events
 *  4. Tool calls → execute locally → return result to AI → continue response
 *  5. "end" event → clean up
 */
export class RelayHandler {
  private ws: WebSocket;
  private env: Env;
  private openai: OpenAIRealtimeService;
  private callSid = '';
  private callerNumber = '';

  constructor(ws: WebSocket, env: Env) {
    this.ws = ws;
    this.env = env;
    this.openai = new OpenAIRealtimeService(env);
  }

  start(): void {
    this.ws.on('message', (data) => {
      try {
        const event = JSON.parse(data.toString()) as RelayEvent;
        void this.handleEvent(event);
      } catch (err) {
        console.error(`[RelayHandler] Failed to parse message:`, err);
      }
    });

    this.ws.on('close', () => {
      console.log(`[RelayHandler] ${this.callSid} — WebSocket closed`);
      this.openai.close();
    });

    this.ws.on('error', (err) => {
      console.error(`[RelayHandler] WebSocket error on ${this.callSid}:`, err);
    });
  }

  private async handleEvent(event: RelayEvent): Promise<void> {
    switch (event.type) {
      case 'setup':
        await this.handleSetup(event);
        break;

      case 'prompt':
        // Only process when Twilio signals this is the complete utterance.
        // Partial transcripts (last: false) are useful for interruption detection
        // but shouldn't trigger AI responses.
        if (event.last) {
          await this.handlePrompt(event.voicePrompt);
        }
        break;

      case 'interrupt':
        // User started speaking — stop the current AI response.
        this.openai.interrupt();
        console.log(`[RelayHandler] ${this.callSid} — Interrupted by user`);
        break;

      case 'dtmf':
        console.log(`[RelayHandler] ${this.callSid} — DTMF: ${event.digit}`);
        break;

      case 'end':
        console.log(`[RelayHandler] ${this.callSid} — Call ended (${event.reasonCode})`);
        this.openai.close();
        break;
    }
  }

  private async handleSetup(event: Extract<RelayEvent, { type: 'setup' }>): Promise<void> {
    this.callSid = event.callSid;
    this.callerNumber = event.from;

    console.log(`[RelayHandler] ${this.callSid} — Setup for caller ${this.callerNumber}`);

    // TODO: Fetch customer context from Twilio Segment here.
    // const customerProfile = await segmentClient.identify(this.callerNumber);
    // Inject customerProfile into the AI system prompt for personalization.

    const sessionConfig: SessionConfig = {
      model: this.env.OPENAI_MODEL,
      systemPrompt: buildSystemPrompt(this.callerNumber),
      tools: TOOL_DEFINITIONS,
      onToken: (token, isLast) => this.sendTextToken(token, isLast),
      onToolCall: async (toolName, args) => {
        console.log(`[RelayHandler] ${this.callSid} — Tool call: ${toolName}`, args);
        return executeToolCall(toolName, args, this.env, this.callSid);
      },
    };

    await this.openai.initialize(sessionConfig);
  }

  private async handlePrompt(utterance: string): Promise<void> {
    console.log(`[RelayHandler] ${this.callSid} — User: "${utterance}"`);
    await this.openai.sendMessage(utterance);
  }

  private sendTextToken(token: string, isLast: boolean): void {
    const response: RelayResponse = { type: 'text', token, last: isLast };
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(response));
    }
  }
}

function buildSystemPrompt(callerNumber: string): string {
  return `You are a helpful AI assistant for a voice call from ${callerNumber}.

Be conversational, concise, and friendly. You're speaking — not writing — so avoid
bullet points, markdown, and long lists. Keep responses under 3 sentences unless
the caller asks for more detail.

You can help with:
- Answering general questions
- Looking up information
- Scheduling and booking
- Transferring to a human agent when needed

If you're not sure about something, say so and offer to transfer to a human.
If the caller seems frustrated or explicitly asks for a human, use the transfer_to_human tool.`;
}
