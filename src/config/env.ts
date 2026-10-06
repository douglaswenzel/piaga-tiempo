import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  CATALOGO_URL: z.string().url(),
  EMAIL: z.string().email(),
  SENHA: z.string().min(1),
  LOG_LEVEL: z.string().default('info'),

  HEADLESS: z
    .enum(['true', 'false'])
    .default('true')
    .transform(v => v === 'true'),

  DATABASE_URL: z.string().url(),
});

export const env = envSchema.parse(process.env);