import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  PGHOST: z.string().min(1),
  PGPORT: z.coerce.number().int().positive().default(5432),
  PGUSER: z.string().min(1),
  PGPASSWORD: z.string(),
  PGDATABASE: z.string().min(1),
  PG_POOL_MAX: z.coerce.number().int().positive().default(10),
  PG_IDLE_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(30_000),
  PG_CONNECTION_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(5_000),

  // Phidias es opcional: sin token, la importacion de grupos queda desactivada.
  PHIDIAS_BASE_URL: z.string().url().default('https://ds-barranquilla.phidias.co/rest'),
  PHIDIAS_TOKEN: z.string().default(''),
  PHIDIAS_DEFAULT_PASSWORD: z.string().min(8).default('bookstudio123'),

  // Mercado Pago. Sin ACCESS_TOKEN la facturacion queda desactivada.
  // El token de acceso NO debe salir nunca del servidor; al navegador solo va
  // MP_PUBLIC_KEY, que es publica por diseno.
  MP_PUBLIC_KEY: z.string().default(''),
  MP_ACCESS_TOKEN: z.string().default(''),
  MP_WEBHOOK_SECRET: z.string().default(''),
  MP_WEBHOOK_URL: z.string().default(''),
  APP_URL: z.string().default('https://bookstudio.uk'),

  // Almacenamiento del contenido multimedia. Sin S3_BUCKET todo se guarda en el
  // disco del servidor, que es lo que hacia hasta ahora.
  S3_BUCKET: z.string().default(''),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().default(''),
  S3_SECRET_ACCESS_KEY: z.string().default(''),
  /** Carpeta raiz dentro del bucket; importa si el bucket esta compartido. */
  S3_PREFIX: z.string().default('bookstudio'),
  /** URL publica alternativa (CloudFront o similar). Vacio: la de AWS. */
  S3_PUBLIC_URL: z.string().default(''),
  /** Solo para almacenamientos compatibles que no son AWS (MinIO, R2). */
  S3_ENDPOINT: z.string().default(''),

  JWT_SECRET: z.string().min(24, 'JWT_SECRET debe tener al menos 24 caracteres'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  JWT_QR_EXPIRES_IN: z.string().default('365d'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');
  throw new Error(`Configuracion de entorno invalida:\n${details}`);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';
