// Explicit operator check: uses hosted services and one benign Google lookup.
import {randomUUID} from 'node:crypto';
import {Redis} from 'ioredis';
import {databasePool} from '../server/db/pool';
import {ReportStore} from '../server/db/reports';
import {JobRuntime} from '../server/jobs/runtime';
import {buildApi} from '../server/app';

async function main(){
 const pool=databasePool();
 if(!pool||!process.env.REDIS_URL||!process.env.RATE_LIMIT_SECRET)throw Error('Hosted configuration missing');
 const prefix='verify-'+randomUUID(),store=new ReportStore(pool);
 const jobs=new JobRuntime(store,process.env.REDIS_URL,process.env.RATE_LIMIT_SECRET,prefix);
 const app=buildApi({store,jobs});let receipt:{id:string;capability:string}|undefined;
 try{
  await jobs.start();
  const response=await app.inject({method:'POST',url:'/api/scans',payload:{url:'https://example.com',inputKind:'url',inspectRedirects:false,checkReputation:true}});
  if(response.statusCode!==202)throw Error('Submission failed');
  receipt=response.json();let report;
  for(let n=0;n<100;n++){
   report=await store.get(receipt!.id,receipt!.capability);
   if(report?.state==='completed'||report?.state==='failed')break;
   await new Promise(resolve=>setTimeout(resolve,200));
  }
  if(report?.state!=='completed'||report.checks.find(c=>c.name==='Google Safe Browsing')?.status!=='passed')throw Error('Live reputation scan did not complete');
  console.log('PASS: API accepted queued scan; hosted Redis worker completed; Neon persisted report; Google Safe Browsing returned no match for example.com. Redirect inspection stayed off.');
 }finally{
  if(receipt){await jobs.cancel(receipt.id);await store.delete(receipt.id,receipt.capability);await pool.query('DELETE FROM scan_cancellation WHERE scan_id=$1',[receipt.id]);}
  await app.close();await jobs.close();await pool.end();
  const redis=new Redis(process.env.REDIS_URL,{enableReadyCheck:false});redis.on('error',()=>{});
  try{const keys=await redis.keys(prefix+'*');if(keys.length)await redis.del(...keys)}finally{await redis.quit()}
 }
}
main().catch(()=>{console.error('Live verification failed. Check private server configuration and provider availability.');process.exitCode=1});
