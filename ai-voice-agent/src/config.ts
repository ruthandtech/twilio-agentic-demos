import { z } from 'zod';

// Centralise env validation so every missing variable surfaces at startup
// with a developer-friendly error, not a cryptic runtime crash.
const EnvSchema = z.object({
  TWILIO_ACCOUNT_SID: z.string().startsWith('AC', { message: 'TWILIO_ACCOUNT_SID must start with AC' }),
  TWILIO_AUTH_TOKEN: z.string().min(32, { message: 'TWILIO_AUTH_TOKEN appears invalid' }),
  TWILIO_PHONE_NUMBER: z.string().startsWith('+', { message: 'TWILIO_PHONE_NUMBER must be E.164 format, e.g. +15551234567' }),
  OPENAI_API_KEY: z.string().startsWith('sk-', { message: 'OPENAI_API_KEY must start with sk-' }),
  BASE_URL: z.string().url({ message: 'BASE_URL must be a valid URL, e.g. https://abc123.ngrok-free.app' }),
  PORT: z.coerce.number().default(3000),
  HUMAN_AGENT_NUMBER: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o'),
});

export type Env = z.infer<typeof EnvSchema>;

export function validateEnv(): Env {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    console.error('\n❌ Missing or invalid environment variables:\n');
    result.error.issues.forEach((issue) => {
      console.error(`  • ${issue.path.join('.')}: ${issue.message}`);
    });
    console.error('\n👉 Copy .env.example to .env and fill in your values.\n');
    process.exit(1);
  }

  return result.data;
}
