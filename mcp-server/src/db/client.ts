import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { env } from '../env.js';
import * as schema from './schema.js';

export const pgPool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

export const db = drizzle(pgPool, { schema });
export type DB = typeof db;
