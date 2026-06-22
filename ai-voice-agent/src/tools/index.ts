import twilio from 'twilio';
import { Env } from '../config';
import type { ToolDefinition } from '../openai-service';

/**
 * Tool definitions tell the LLM what actions it can take.
 * Each tool has a JSON Schema for parameters — OpenAI validates args against this.
 */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: 'function',
    name: 'get_account_info',
    description: 'Look up account information for the caller. Use this when the caller asks about their account, balance, plan, or status.',
    parameters: {
      type: 'object',
      properties: {
        phone_number: {
          type: 'string',
          description: "The caller's phone number in E.164 format",
        },
      },
      required: ['phone_number'],
    },
  },
  {
    type: 'function',
    name: 'schedule_callback',
    description: 'Schedule a callback appointment for the caller. Use when the caller wants to be called back at a specific time.',
    parameters: {
      type: 'object',
      properties: {
        phone_number: {
          type: 'string',
          description: "The caller's phone number",
        },
        preferred_time: {
          type: 'string',
          description: "The caller's preferred callback time (e.g., 'tomorrow at 2pm', 'Friday morning')",
        },
        reason: {
          type: 'string',
          description: 'Brief reason for the callback',
        },
      },
      required: ['phone_number', 'preferred_time'],
    },
  },
  {
    type: 'function',
    name: 'transfer_to_human',
    description: 'Transfer the call to a human agent. Use this when: the caller asks to speak to a human, you cannot resolve their issue, or they seem frustrated.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Brief reason for the transfer (for agent context)',
        },
      },
      required: ['reason'],
    },
  },
];

/**
 * Executes a tool call requested by the AI.
 * In production, these would call your CRM, database, or downstream APIs.
 */
export async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  env: Env,
  callSid: string
): Promise<unknown> {
  switch (toolName) {
    case 'get_account_info':
      return getAccountInfo(args.phone_number as string);

    case 'schedule_callback':
      return scheduleCallback(
        args.phone_number as string,
        args.preferred_time as string,
        args.reason as string | undefined
      );

    case 'transfer_to_human':
      return transferToHuman(args.reason as string, env, callSid);

    default:
      console.warn(`[Tools] Unknown tool: ${toolName}`);
      return { error: `Tool ${toolName} not found` };
  }
}

// ─── Tool Implementations ─────────────────────────────────────────────────────
// These are stubs. Replace with real API calls to your CRM / database.

async function getAccountInfo(phoneNumber: string): Promise<Record<string, unknown>> {
  console.log(`[Tools] Looking up account for ${phoneNumber}`);

  // TODO: Replace with real CRM lookup
  // const customer = await crmClient.findByPhone(phoneNumber);
  return {
    found: true,
    name: 'Demo Customer',
    plan: 'Pro',
    status: 'Active',
    since: '2023-01-15',
    note: 'This is demo data. Connect to your CRM here.',
  };
}

async function scheduleCallback(
  phoneNumber: string,
  preferredTime: string,
  reason?: string
): Promise<Record<string, unknown>> {
  console.log(`[Tools] Scheduling callback for ${phoneNumber} at ${preferredTime}`);

  // TODO: Replace with real scheduling system (Calendly, Google Calendar, etc.)
  return {
    success: true,
    confirmationId: `CB-${Date.now()}`,
    scheduledFor: preferredTime,
    message: `Callback scheduled for ${preferredTime}. You'll receive a confirmation SMS.`,
  };
}

async function transferToHuman(reason: string, env: Env, callSid: string): Promise<Record<string, unknown>> {
  console.log(`[Tools] Transferring call ${callSid} to human: ${reason}`);

  if (!env.HUMAN_AGENT_NUMBER) {
    return {
      success: false,
      message: 'No human agent number configured. I apologize, I cannot transfer you right now.',
    };
  }

  try {
    const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

    // Redirect the live call to a <Dial> TwiML — this ends ConversationRelay
    // and bridges the caller directly to the human agent number.
    await client.calls(callSid).update({
      twiml: `<Response><Dial>${env.HUMAN_AGENT_NUMBER}</Dial></Response>`,
    });

    console.log(`[Tools] Call ${callSid} successfully redirected to ${env.HUMAN_AGENT_NUMBER}`);
    return {
      success: true,
      message: 'Transferring you now. Please hold for a moment.',
    };
  } catch (err) {
    console.error(`[Tools] Transfer failed for ${callSid}:`, err);
    return {
      success: false,
      message: 'Transfer failed. Let me try to help you directly instead.',
    };
  }
}
