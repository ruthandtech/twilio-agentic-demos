import { Env } from './config';

export interface SessionConfig {
  model: string;
  systemPrompt: string;
  tools: ToolDefinition[];
  onToken: (token: string, isLast: boolean) => void;
  onToolCall: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
}

export interface ToolDefinition {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

type OpenAIMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

/**
 * Wraps OpenAI Chat Completions with streaming + function calling.
 *
 * Note: We use Chat Completions (not the Realtime API) because ConversationRelay
 * handles STT and TTS — we only need text-to-text LLM inference here.
 * The Realtime API is used when you want the LLM to handle audio directly
 * (e.g., with Twilio Media Streams).
 */
export class OpenAIRealtimeService {
  private env: Env;
  private config: SessionConfig | null = null;
  private history: OpenAIMessage[] = [];
  private abortController: AbortController | null = null;
  private closed = false;

  constructor(env: Env) {
    this.env = env;
  }

  async initialize(config: SessionConfig): Promise<void> {
    this.config = config;
    this.history = [{ role: 'system', content: config.systemPrompt }];
  }

  async sendMessage(userMessage: string): Promise<void> {
    if (!this.config || this.closed) return;

    this.history.push({ role: 'user', content: userMessage });

    // Allow in-flight requests to be cancelled on interruption
    this.abortController = new AbortController();

    await this.runCompletionLoop();
  }

  interrupt(): void {
    this.abortController?.abort();
  }

  close(): void {
    this.closed = true;
    this.abortController?.abort();
  }

  /**
   * Runs the completion → tool call → completion loop until the model
   * produces a final text response with no pending tool calls.
   */
  private async runCompletionLoop(): Promise<void> {
    if (!this.config) return;

    // Limit loop iterations to prevent runaway tool call chains
    for (let iteration = 0; iteration < 10; iteration++) {
      const response = await this.streamCompletion();
      if (!response) return; // Interrupted or error

      if (response.toolCalls.length > 0) {
        // Execute all tool calls and add results to history
        const toolResults = await Promise.all(
          response.toolCalls.map(async (tc) => {
            const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
            const result = await this.config!.onToolCall(tc.function.name, args);
            return { id: tc.id, result };
          })
        );

        this.history.push({
          role: 'assistant',
          content: null,
          tool_calls: response.toolCalls,
        });

        for (const { id, result } of toolResults) {
          this.history.push({
            role: 'tool',
            tool_call_id: id,
            content: JSON.stringify(result),
          });
        }
        // Loop continues — let the model generate its response using tool results
      } else {
        // Final text response — we're done
        this.history.push({ role: 'assistant', content: response.text });
        break;
      }
    }
  }

  private async streamCompletion(): Promise<{ text: string; toolCalls: ToolCall[] } | null> {
    if (!this.config || this.closed) return null;

    const tools = this.config.tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    let responseText = '';
    const toolCalls: ToolCall[] = [];

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: this.history,
          tools: tools.length > 0 ? tools : undefined,
          tool_choice: tools.length > 0 ? 'auto' : undefined,
          stream: true,
          temperature: 0.7,
          max_tokens: 500, // Keep responses short for voice
        }),
        signal: this.abortController?.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        console.error(`[OpenAI] API error ${response.status}:`, error);
        this.config.onToken("I'm sorry, I encountered an error. Let me transfer you to a human agent.", true);
        return null;
      }

      const reader = response.body?.getReader();
      if (!reader) return null;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const chunk = JSON.parse(data) as {
              choices: Array<{
                delta: {
                  content?: string;
                  tool_calls?: Array<{ index: number; id?: string; type?: string; function?: { name?: string; arguments?: string } }>;
                };
                finish_reason: string | null;
              }>;
            };

            const delta = chunk.choices[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              responseText += delta.content;
              // Stream each word/token back to Twilio for low-latency TTS
              this.config.onToken(delta.content, false);
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (!toolCalls[tc.index]) {
                  toolCalls[tc.index] = { id: tc.id ?? '', type: 'function', function: { name: tc.function?.name ?? '', arguments: '' } };
                }
                if (tc.function?.arguments) {
                  toolCalls[tc.index].function.arguments += tc.function.arguments;
                }
                if (tc.id) toolCalls[tc.index].id = tc.id;
                if (tc.function?.name) toolCalls[tc.index].function.name = tc.function.name;
              }
            }
          } catch {
            // Malformed SSE chunk — skip
          }
        }
      }

      if (responseText) {
        // Signal end of stream to Twilio
        this.config.onToken('', true);
      }

      return { text: responseText, toolCalls: toolCalls.filter(Boolean) };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('[OpenAI] Stream interrupted by user');
        return null;
      }
      console.error('[OpenAI] Streaming error:', err);
      return null;
    }
  }
}
