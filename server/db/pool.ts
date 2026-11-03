import { Pool } from 'pg';
export function databasePool() {
  if (!process.env.DATABASE_URL) return null;
  let url:URL;try{url=new URL(process.env.DATABASE_URL)}catch{throw Error('Invalid database configuration.')}
  if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('Invalid database configuration.');
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname))url.searchParams.set('sslmode','verify-full');
  const pool = new Pool({connectionString:url.toString(),max:5,connectionTimeoutMillis:3000,idleTimeoutMillis:10000,statement_timeout:5000});
  // Never emit raw connection errors: they may contain infrastructure details.
  pool.on('error',()=>console.error('Database connection became unavailable.'));
  return pool;
}
