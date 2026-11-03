import { Pool } from 'pg';
export function databasePool() {
  if (!process.env.DATABASE_URL) return null;
  const pool = new Pool({connectionString:process.env.DATABASE_URL,max:5,connectionTimeoutMillis:3000,idleTimeoutMillis:10000,statement_timeout:5000});
  // Never emit raw connection errors: they may contain infrastructure details.
  pool.on('error',()=>console.error('Database connection became unavailable.'));
  return pool;
}
