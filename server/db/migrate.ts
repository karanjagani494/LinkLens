import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import type {Pool} from 'pg';
export async function migrate(pool:Pool){
 const client=await pool.connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(821742, 1)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migration (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  for(const name of readdirSync(join(process.cwd(),'server/db/migrations')).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
   if((await client.query('SELECT 1 FROM schema_migration WHERE name=$1',[name])).rowCount)continue;
   await client.query(readFileSync(join(process.cwd(),'server/db/migrations',name),'utf8'));
   await client.query('INSERT INTO schema_migration(name) VALUES ($1)',[name]);
  }
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}
