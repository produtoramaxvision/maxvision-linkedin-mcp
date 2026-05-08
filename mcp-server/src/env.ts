import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  MASTER_KEY: z
    .string()
    .length(64)
    .regex(/^[0-9a-f]+$/, 'MASTER_KEY must be 64 hex chars (32 bytes)'),
  MCP_PORT: z.coerce.number().int().positive().default(3000),
  MCP_TRANSPORT: z.enum(['stdio', 'http']).default('stdio'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(10),
  // Comma-separated list of API keys accepted by the HTTP transport.
  // Empty = open mode (logged as warning when MCP_TRANSPORT=http).
  MCP_API_KEYS: z
    .string()
    .optional()
    .default('')
    .transform((s) => s.split(',').map((k) => k.trim()).filter(Boolean)),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
