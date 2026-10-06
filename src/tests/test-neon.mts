import { neon } from '@neondatabase/serverless';
import { env } from '../config/env';

const sql = neon(env.DATABASE_URL);

const info = await sql`SELECT NOW() AS agora, current_database() AS db, current_user AS usuario`;
console.log(info);

const count = await sql`SELECT COUNT(*)::int AS total FROM products`;
console.log('Produtos:', count[0].total);