import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import dotenv from 'dotenv';
import { z } from 'zod';
export const root = fileURLToPath(new URL('../../../', import.meta.url));
dotenv.config({ path: resolve(root, '.env'), quiet: true });
export const config = z
  .object({
    DATABASE_URL: z.string().min(1),
    API_HOST: z.string().default('127.0.0.1'),
    API_PORT: z.coerce.number().default(3001),
    LESSONS_ROOT: z.string().default('./lessons'),
  })
  .parse(process.env);
export const lessonsRoot = resolve(root, config.LESSONS_ROOT);
