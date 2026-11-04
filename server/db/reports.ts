import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import type {Pool} from 'pg';
import type {Report} from '../../src/lib/types';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const digest=(cap:string)=>createHash('sha256').update(cap).digest();
function authorized(stored:Buffer,cap:string){const valid=/^[a-f0-9]{64}$/i.test(cap);return timingSafeEqual(stored,digest(valid?cap:''))&&valid}
export class ReportStore {
 constructor(readonly pool:Pool){}
 async ready(){await this.pool.query('SELECT state FROM scan LIMIT 0')}
 async create(report:Report){
  if(!uuid.test(report.id)||!['queued','completed'].includes(report.state))throw Error('Invalid report state.');
  for(const value of [report.inputDisplay,...report.redirects.map(h=>h.url)]){
   const u=new URL(value);if(u.username||u.password||u.search||u.hash||!['/','/[redacted]'].includes(u.pathname))throw Error('Report URL is not redacted.');
  }
  const capability=randomBytes(32).toString('hex'),client=await this.pool.connect();
  try{
   await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[report.id]);
   const result=await client.query('INSERT INTO scan(id,capability_digest,report,state,expires_at) SELECT $1,$2,$3,$4,now()+make_interval(secs=>$5::int) WHERE NOT EXISTS (SELECT 1 FROM scan_cancellation WHERE scan_id=$1) RETURNING created_at,expires_at',[report.id,digest(capability),report,report.state,report.checks.some(c=>c.name==='Google Safe Browsing'&&c.status!=='skipped')?1800:86400]);
   if(!result.rowCount)throw Error('Report was cancelled.');
   await client.query('COMMIT');return {id:report.id,capability,expiresAt:result.rows[0].expires_at.toISOString()};
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
 }
 async get(id:string,cap:string):Promise<Report|null>{
  if(!uuid.test(id))return null;
  const r=await this.pool.query('SELECT capability_digest,report,state,created_at,expires_at FROM scan WHERE id=$1 AND expires_at>clock_timestamp()',[id]);
  const row=r.rows[0];if(!row||!authorized(row.capability_digest,cap))return null;
  if(new Date(row.expires_at).getTime()<=Date.now())return null;
  return {...row.report,id,state:row.state,createdAt:row.created_at.toISOString(),expiresAt:row.expires_at.toISOString()};
 }
 async delete(id:string,cap:string){
  if(!uuid.test(id))return false;const client=await this.pool.connect();
  try{
   await client.query('BEGIN');await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[id]);
   const r=await client.query('SELECT capability_digest FROM scan WHERE id=$1 AND expires_at>clock_timestamp() FOR UPDATE',[id]);
   if(!r.rows[0]||!authorized(r.rows[0].capability_digest,cap)){await client.query('ROLLBACK');return false}
   await client.query('INSERT INTO scan_cancellation(scan_id) VALUES($1) ON CONFLICT (scan_id) DO NOTHING',[id]);
   await client.query('DELETE FROM scan WHERE id=$1',[id]);await client.query('COMMIT');return true;
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
 }
 async claim(id:string){return !!(await this.pool.query("UPDATE scan SET state='running',updated_at=clock_timestamp() WHERE id=$1 AND state='queued' AND expires_at>clock_timestamp() RETURNING id",[id])).rowCount}
 async finish(id:string,report:Report){return !!(await this.pool.query("UPDATE scan SET state='completed',report=$2,updated_at=clock_timestamp() WHERE id=$1 AND state='running' AND expires_at>clock_timestamp() AND NOT EXISTS(SELECT 1 FROM scan_cancellation WHERE scan_id=$1) RETURNING id",[id,{...report,id}])).rowCount}
 async fail(id:string){await this.pool.query("UPDATE scan SET state='failed',updated_at=clock_timestamp(),report=jsonb_set(report,'{state}','\"failed\"') WHERE id=$1 AND state IN ('queued','running')",[id])}
 async recover(){await this.pool.query("UPDATE scan SET state='failed',updated_at=clock_timestamp(),report=jsonb_set(report,'{state}','\"failed\"') WHERE state IN ('queued','running') AND updated_at<clock_timestamp()-interval '45 seconds'")}
 async purge(){await this.pool.query('DELETE FROM scan WHERE expires_at<=clock_timestamp()');await this.pool.query('DELETE FROM scan_cancellation WHERE expires_at<=clock_timestamp()')}
}
