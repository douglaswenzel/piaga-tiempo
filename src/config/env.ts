import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  CATALOGO_URL: z.string().url(),
  EMAIL: z.string().email(),
  SENHA: z.string().min(1),
  LOG_LEVEL: z.string().default('info'),
});

export const env = envSchema.parse(process.env);