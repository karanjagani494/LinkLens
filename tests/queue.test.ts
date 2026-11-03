import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Redis} from 'ioredis';
import {databasePool} from '../server/db/pool';
import {ReportStore} from '../server/db/reports';
import {JobRuntime} from '../server/jobs/runtime';
import {Admission,LimitError} from '../server/jobs/admission';
import {buildApi} from '../server/app';
const enabled=!!process.env.REDIS_TEST_URL&&!!process.env.DATABASE_URL;
describe.skipIf(!enabled)('Redis queue with Neon reports',()=>{
 const pool=enabled?databasePool()!:null,store=pool?new ReportStore(pool):null;
 const prefix='test-'+randomUUID(),ids:string[]=[];
 let jobs:JobRuntime;let redis:Redis;
 beforeAll(async()=>{jobs=new JobRuntime(store!,process.env.REDIS_TEST_URL!,'a'.repeat(64),prefix);await jobs.start();redis=new Redis(process.env.REDIS_TEST_URL!);redis.on('error',()=>{})},15000);
 afterAll(async()=>{await jobs?.close();await pool?.query('DELETE FROM scan WHERE id=ANY($1::uuid[])',[ids]);await pool?.query('DELETE FROM scan_cancellation WHERE scan_id=ANY($1::uuid[])',[ids]);await pool?.end();if(redis){const keys=await redis.keys(prefix+'*');if(keys.length)await redis.del(...keys);await redis.quit()}},15000);
 const input={url:'https://paypal.com.attacker.co.uk/SECRET?token=SENTINEL#PRIVATE',inputKind:'url' as const,inspectRedirects:false,checkReputation:false};
 it('returns queued 202, keeps secrets out of jobs/DB, and completes once',async()=>{
  await jobs.queue.pause();const app=buildApi({store:store!,jobs});
  try{
   const response=await app.inject({method:'POST',url:'/api/scans',payload:input});expect(response.statusCode).toBe(202);const receipt=response.json();ids.push(receipt.id);expect(receipt.state).toBe('queued');
   const job=await jobs.queue.getJob(receipt.id);expect(job?.data).toEqual({id:receipt.id});expect(await redis.ttl(`${prefix}:payload:${receipt.id}`)).toBeGreaterThan(0);
   const raw=await pool!.query('SELECT report,capability_digest FROM scan WHERE id=$1',[receipt.id]);expect(JSON.stringify(raw.rows)).not.toMatch(/SECRET|SENTINEL|PRIVATE/);
   await jobs.queue.resume();let report;for(let i=0;i<40;i++){report=await store!.get(receipt.id,receipt.capability);if(report?.state==='completed')break;await new Promise(r=>setTimeout(r,100))}
   expect(report?.state).toBe('completed');expect(report?.verdict).toBe('suspicious');expect(await redis.get(`${prefix}:payload:${receipt.id}`)).toBeNull();expect(await store!.claim(receipt.id)).toBe(false);
  }finally{await jobs.queue.resume();await app.close()}
 },15000);
 it('deletion while queued removes the payload and cannot resurrect a report',async()=>{
  await jobs.queue.pause();const receipt=await jobs.submit({...input,url:'https://example.com'},'delete-client');ids.push(receipt.id);
  const app=buildApi({store:store!,jobs});try{const response=await app.inject({method:'DELETE',url:`/api/scans/${receipt.id}`,headers:{authorization:`Bearer ${receipt.capability}`}});expect(response.statusCode).toBe(204);await jobs.queue.resume();expect(await redis.get(`${prefix}:payload:${receipt.id}`)).toBeNull();expect(await store!.claim(receipt.id)).toBe(false);expect(await store!.get(receipt.id,receipt.capability)).toBeNull()}finally{await jobs.queue.resume();await app.close()}
 });
 it('fails stale jobs instead of replaying visits',async()=>{
  await jobs.queue.pause();const receipt=await jobs.submit({...input,url:'https://example.com'},'recover-client');ids.push(receipt.id);await pool!.query("UPDATE scan SET updated_at=now()-interval '60 seconds' WHERE id=$1",[receipt.id]);await store!.recover();await jobs.queue.resume();expect((await store!.get(receipt.id,receipt.capability))?.state).toBe('failed');expect(await store!.claim(receipt.id)).toBe(false);await jobs.cancel(receipt.id);
 });
 it('enforces per-client and global admission atomically',async()=>{
  const admission=new Admission(redis,'b'.repeat(64),prefix+'-limits');const held:string[]=[];
  try{for(const client of ['a','a','b','b'])held.push(await admission.reserve(client));await expect(admission.reserve('a')).rejects.toBeInstanceOf(LimitError);await expect(admission.reserve('c')).rejects.toBeInstanceOf(LimitError)}finally{for(const id of held)await admission.release(id)}
  for(let i=0;i<5;i++){const id=await admission.reserve('minute');await admission.release(id)}await expect(admission.reserve('minute')).rejects.toMatchObject({retryAfter:60});
 });
 it('enforces the daily ceiling separately from the minute window',async()=>{
  const admission=new Admission(redis,'c'.repeat(64),prefix+'-daily');const start=Date.now();const now=vi.spyOn(Date,'now');
  try{for(let i=0;i<30;i++){now.mockReturnValue(start+Math.floor(i/5)*61000);const id=await admission.reserve('day');await admission.release(id)}now.mockReturnValue(start+7*61000);await expect(admission.reserve('day')).rejects.toMatchObject({retryAfter:86400})}finally{now.mockRestore()}
 });
});
