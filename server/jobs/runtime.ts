import {randomUUID} from 'node:crypto';
import {Queue,Worker} from 'bullmq';
import {Redis} from 'ioredis';
import type {ReportStore} from '../db/reports';
import type {ScanRequest} from '../../src/lib/types';
import {analyse} from '../analysis/analyse';
import {completeAnalysis,reputation,inspect} from '../providers/analysis';
import {Admission} from './admission';
export class JobRuntime {
 readonly redis:Redis;
 readonly queue:Queue;
 readonly admission:Admission;
 private worker?:Worker;
 private timer?:ReturnType<typeof setInterval>;
 private active=new Map<string,AbortController>();
 constructor(private store:ReportStore,url:string,secret:string,private prefix='ll'){
  let parsed:URL;try{parsed=new URL(url)}catch{throw Error('Invalid Redis configuration.')}
  if(!['redis:','rediss:'].includes(parsed.protocol))throw Error('Invalid Redis configuration.');
  if(parsed.protocol==='redis:'&&!['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))throw Error('Hosted Redis requires TLS (rediss://).');
  if(secret.length<32)throw Error('RATE_LIMIT_SECRET must contain at least 32 characters.');
  this.redis=new Redis(url,{enableReadyCheck:false,maxRetriesPerRequest:1,connectTimeout:3000,commandTimeout:5000,enableOfflineQueue:false,retryStrategy:times=>Math.min(times*500,3000)});
  this.redis.on('error',()=>{});
  this.admission=new Admission(this.redis,secret,prefix);
  // Some managed providers deny INFO. A required-command write probe runs in start().
  this.queue=new Queue('scans',{connection:this.redis,prefix,skipVersionCheck:true,defaultJobOptions:{attempts:1,removeOnComplete:true,removeOnFail:{age:300,count:50}}});
  this.queue.on('error',()=>{});
 }
 async start(){
  if(this.redis.status!=='ready')await new Promise<void>((resolve,reject)=>{const timeout=setTimeout(()=>{clean();reject(Error('Queue unavailable.'))},5000);const ready=()=>{clean();resolve()};const clean=()=>{clearTimeout(timeout);this.redis.off('ready',ready)};this.redis.on('ready',ready)});
  await this.redis.ping();await this.redis.eval("redis.call('SET',KEYS[1],'probe','PX',5000);return redis.call('GETDEL',KEYS[1])",1,`${this.prefix}:probe:${randomUUID()}`);await this.queue.setGlobalConcurrency(4);await this.store.recover();
  const workerConnection=this.redis.duplicate({maxRetriesPerRequest:null,commandTimeout:undefined,enableOfflineQueue:true});workerConnection.on('error',()=>{});
  this.worker=new Worker('scans',async job=>{
   const id=String(job.data.id),controller=new AbortController();this.active.set(id,controller);
   const timeout=setTimeout(()=>controller.abort(),30000);
   try{
    if(!await this.store.claim(id))return;
    // Claim exact payload once. Duplicate deliveries cannot repeat external side effects.
    const payload=await this.redis.getdel(`${this.prefix}:payload:${id}`);
    if(!payload)throw Error('Payload expired.');
    const input=JSON.parse(payload) as ScanRequest;
    const result=await completeAnalysis(input,controller.signal,{
     reputation:async(url,signal)=>{await this.budget('reputation',process.env.REPUTATION_DAILY_LIMIT,1000);return reputation(url,signal)},
     inspect:async(url,signal)=>{await this.budget('inspection',process.env.INSPECTION_DAILY_LIMIT,500);return inspect(url,signal)}
    });
    controller.signal.throwIfAborted();await this.store.finish(id,result);
   }catch{await this.store.fail(id);throw Error('Scan processing failed.')}
   finally{clearTimeout(timeout);this.active.delete(id);await this.redis.del(`${this.prefix}:payload:${id}`).catch(()=>{});await this.admission.release(id).catch(()=>{})}
  },{connection:workerConnection,prefix:this.prefix,skipVersionCheck:true,concurrency:4,drainDelay:30,stalledInterval:60000,maxStalledCount:0,lockDuration:40000});
  this.worker.on('error',()=>{});
  this.worker.on('failed',job=>{if(job){void this.store.fail(String(job.data.id)).catch(()=>{});void this.cancel(String(job.data.id))}});
  this.timer=setInterval(()=>{void this.store.recover().catch(()=>{})},10000);this.timer.unref();
 }
 private async budget(name:string,value:string|undefined,fallback:number){
  const configured=Number(value||fallback);const limit=Number.isInteger(configured)&&configured>0?Math.min(configured,100000):fallback;
  const key=`${this.prefix}:budget:${name}:${new Date().toISOString().slice(0,10)}`;
  const count=Number(await this.redis.eval("local n=redis.call('INCR',KEYS[1]);redis.call('EXPIRE',KEYS[1],172800);return n",1,key));
  if(count>limit)throw Error('Provider budget exhausted.');
 }
 async ready(){await this.redis.ping();if(!this.worker||!this.worker.isRunning())throw Error('Worker unavailable.')}
 async submit(input:ScanRequest,ip:string){
  const draft=analyse(input);draft.state='queued';draft.verdict=null;
  await this.admission.reserve(ip,draft.id);
  try{
   const receipt=await this.store.create(draft);
   await this.redis.set(`${this.prefix}:payload:${draft.id}`,JSON.stringify(input),'EX',300,'NX');
   await this.queue.add('scan',{id:draft.id},{jobId:draft.id});
   return {...receipt,state:'queued' as const};
  }catch(error){await this.store.fail(draft.id).catch(()=>{});await this.cancel(draft.id);throw error}
 }
 async cancel(id:string){
  this.active.get(id)?.abort();await this.redis.del(`${this.prefix}:payload:${id}`).catch(()=>{});
  const job=await this.queue.getJob(id).catch(()=>undefined);await job?.remove().catch(()=>{});await this.admission.release(id).catch(()=>{});
 }
 async close(){clearInterval(this.timer);for(const c of this.active.values())c.abort();const connection=this.worker?.opts.connection as Redis|undefined;await this.worker?.close();await connection?.quit().catch(()=>{});await this.queue.close();await this.redis.quit().catch(()=>{})}
}
