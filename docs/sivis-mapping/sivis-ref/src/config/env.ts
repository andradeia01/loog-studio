import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:8080'),
  PORT: z.coerce.number().int().positive().default(8080),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  INTERNAL_API_KEY: z.string().min(16, 'INTERNAL_API_KEY must be at least 16 chars'),
  ZAIA_WEBHOOK_SECRET: z.string().optional(),

  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),

  MOCK_MODE: bool.default(true),

  VEHICLE_API_PROVIDER: z.enum(['mock', 'http-generic']).default('mock'),
  VEHICLE_API_BASE_URL: z.string().url().optional(),
  VEHICLE_API_KEY: z.string().optional(),

  // Plate lookup (external, replaces Sivisweb BuscaPlaca which does not work by plate)
  PLATE_LOOKUP_PROVIDER: z
    .enum(['mock', 'apibrasil', 'wdapi2', 'placas-app-br', 'placafipe', 'none'])
    .default('none'),
  APIBRASIL_BASE_URL: z.string().url().default('https://gateway.apibrasil.io/api/v2'),
  APIBRASIL_DEVICE_TOKEN: z.string().optional(),
  APIBRASIL_BEARER_TOKEN: z.string().optional(),
  WDAPI2_BASE_URL: z.string().url().default('https://wdapi2.com.br'),
  WDAPI2_TOKEN: z.string().optional(),
  PLACAS_APP_BR_BASE_URL: z.string().url().default('https://placas.app.br/api/v1'),
  PLACAS_APP_BR_EMAIL: z.string().optional(),
  PLACAS_APP_BR_PASSWORD: z.string().optional(),
  PLACAS_APP_BR_TOKEN: z.string().optional(),
  PLACAFIPE_BASE_URL: z.string().url().default('https://api.placafipe.com.br'),
  PLACAFIPE_TOKEN: z.string().optional(),

  FIPE_API_PROVIDER: z.enum(['mock', 'http-generic']).default('mock'),
  FIPE_API_BASE_URL: z.string().url().optional(),
  FIPE_API_KEY: z.string().optional(),

  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().optional(),
  ELEVENLABS_MODEL_ID: z.string().default('eleven_multilingual_v2'),

  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_WORKSPACE_ID: z.string().optional(),

  STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  S3_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_PUBLIC_URL: z.string().url().optional(),

  DOCUMENT_RETENTION_MINUTES: z.coerce.number().int().min(0).default(0),

  // SDR runtime
  SDR_ENABLED: bool.default(false),
  SDR_WHATSAPP_NUMBER_LABEL: z.string().default('default'),
  SDR_DATA_DIR: z.string().default('./data'),
  SDR_MODEL_DEFAULT: z.string().default('claude-haiku-4-5-20251001'),
  SDR_MODEL_HARD: z.string().default('claude-sonnet-5-5'),
  SDR_MAX_AGENT_ITERATIONS: z.coerce.number().int().positive().default(5),
  SDR_HUB_BASE_URL: z.string().url().default('http://localhost:8080'),
  ANTHROPIC_MODEL_OVERRIDE: z.string().optional(),

  QUOTE_PROVIDER: z.enum(['none', 'sivisweb']).default('none'),
  SIVISWEB_BASE_URL: z.string().url().optional(),
  SIVISWEB_STORE_ID: z.string().optional(),
  SIVISWEB_USERNAME: z.string().optional(),
  SIVISWEB_PASSWORD: z.string().optional(),
  SIVISWEB_SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  SIVISWEB_CONSULTOR_ID: z.string().default('10'),
});

export type Env = z.infer<typeof EnvSchema>;

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  // eslint-disable-next-line no-console
  console.error(`Invalid environment configuration:\n${issues}`);
  process.exit(1);
}

export const env: Env = parsed.data;
